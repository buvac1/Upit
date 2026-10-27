"""Usput — pravljenje baze mesta.

Ulaz:  OpenStreetMap izvodi po zemljama (Geofabrik, već filtrirani sa osmium tags-filter)
       i Fraunhofer ISI „European Truck Parking Locations" CSV (CC BY 4.0).
Izlaz: data/meta.json i data/{core,shop,ind}/{i}_{j}.json — pločice od TILE × TILE stepeni.

Elementi su u istom obliku kao Overpass odgovor ({type, id, lat, lon, tags}),
pa ih app.js razvrstava istom funkcijom classify() i ocene vozača ostaju vezane za ista mesta.

Pokretanje: python tools/build_data.py <folder sa f-*.osm.pbf i fraunhofer.csv> <izlazni folder>
"""
import csv
import glob
import json
import math
import os
import re
import sys
import time
from collections import defaultdict

import osmium

TILE = 0.5
COUNTRIES = {'NL', 'BE', 'DE', 'DK'}

# Samo oznake koje aplikacija prikazuje ili koristi za razvrstavanje.
KEEP = re.compile(r'^(name|brand|operator|network|amenity|highway|shop|landuse|tourism|hgv|capacity|capacity:hgv|fee|charge|'
                  r'supervised|opening_hours|maxstay|shower|toilets|restaurant|food|lit|fence|internet_access|phone|'
                  r'contact:phone|website|contact:website|description|self_service|laundry_service|'
                  r'addr:(street|housenumber|postcode|city)|fuel:.*|payment:.*)$')
TRUCK_WORDS = re.compile(r'truck|lkw|vrachtwagen|poids ?lourds?|kamion|camion|tir\b|autohof|routier', re.I)
YES = {'yes', 'designated', 'only'}
SHOPS = {'supermarket', 'department_store', 'general', 'variety_store', 'doityourself', 'hardware', 'convenience', 'discount'}


def kind_of(t):
    """Isto što su ranije birali Overpass upiti: core (parking, gorivo, tuš, veš, perionice), shop, ind."""
    a = t.get('amenity')
    if t.get('landuse') == 'industrial':
        return 'ind'
    if a == 'fuel' or t.get('highway') in ('rest_area', 'services'):
        return 'core'
    if a == 'parking':
        if t.get('hgv') in YES or 'capacity:hgv' in t or TRUCK_WORDS.search(t.get('name', '')):
            return 'core'
        return None
    if a == 'shower' or t.get('shower') in ('yes', 'hot'):
        return 'core'
    if t.get('shop') in ('laundry', 'dry_cleaning'):
        return 'core'
    if a in ('car_wash', 'vehicle_wash') and (t.get('hgv') in YES or TRUCK_WORDS.search(t.get('name', ''))):
        return 'core'
    if t.get('shop') in SHOPS:
        return 'shop'
    return None


class Collector(osmium.SimpleHandler):
    def __init__(self, items):
        super().__init__()
        self.items = items  # (kind, 'node/123') -> element

    def _add(self, typ, oid, tags, lat, lon):
        k = kind_of(tags)
        if not k:
            return
        if k == 'ind':
            tags = {x: tags[x] for x in ('name', 'landuse') if x in tags}
        else:
            tags = {x: v for x, v in tags.items() if KEEP.match(x)}
        self.items[(k, f'{typ}/{oid}')] = {'type': typ, 'id': oid, 'lat': round(lat, 6), 'lon': round(lon, 6), 'tags': tags}

    def node(self, n):
        if len(n.tags) == 0 or not n.location.valid():
            return
        self._add('node', n.id, {t.k: t.v for t in n.tags}, n.location.lat, n.location.lon)

    def way(self, w):
        if len(w.tags) == 0:
            return
        tags = {t.k: t.v for t in w.tags}
        if not kind_of(tags):
            return
        lats, lons = [], []
        for nr in w.nodes:
            if nr.location.valid():
                lats.append(nr.location.lat)
                lons.append(nr.location.lon)
        if not lats:
            return
        # sredina okvira, kao Overpass „out center"
        self._add('way', w.id, tags, (min(lats) + max(lats)) / 2, (min(lons) + max(lons)) / 2)


def dist_m(a_lat, a_lon, b_lat, b_lon):
    r = 6371000
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = p2 - p1, math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


FH_NAMES = {
    'Parking': 'Parking za kamione',
    'Truck Stop / Rest Area': 'Truck stop / odmorište',
    'Rest Area': 'Odmorište za kamione',
    'Parking / Rest Area': 'Parking / odmorište za kamione',
    'Fueling': 'Pumpa sa parkingom za kamione',
    'Fueling / Truck Stop': 'Pumpa / truck stop',
}
FH_ZONES = {
    'industrial, commercial and transport units': 'industrijska zona',
    'urban fabric': 'gradska zona',
    'agricultural areas': 'poljoprivredna zona',
    'forest and semi natural areas': 'šuma',
    'mine, dump and construction sites': 'gradilište / rudnik',
    'artificial, non-agricultural vegetated areas': 'zelena površina',
    'wetlands': 'močvara',
}


def add_fraunhofer(path, items):
    """Dodaje Fraunhofer parkinge koji već nisu u OSM-u (nema OSM parkinga/odmorišta na 150 m)."""
    grid = defaultdict(list)
    for (k, _), e in items.items():
        t = e['tags']
        if k == 'core' and (t.get('amenity') == 'parking' or t.get('highway') in ('rest_area', 'services')):
            grid[(int(e['lat'] / 0.002), int(e['lon'] / 0.002))].append(e)
    added = skipped = 0
    with open(path, encoding='utf-8') as f:
        for i, row in enumerate(csv.DictReader(f, delimiter=';')):
            if (row.get('country') or '').strip().upper() not in COUNTRIES:
                continue
            try:
                lat, lon = float(row['lat']), float(row['lon'])
            except (TypeError, ValueError):
                continue
            gi, gj = int(lat / 0.002), int(lon / 0.002)
            near = any(dist_m(lat, lon, e['lat'], e['lon']) < 150
                       for di in (-1, 0, 1) for dj in (-1, 0, 1) for e in grid[(gi + di, gj + dj)])
            if near:
                skipped += 1
                continue
            raw = (row.get('name') or '').strip()
            tags = {'amenity': 'parking', 'hgv': 'designated', 'name': FH_NAMES.get(raw, 'Parking za kamione'),
                    'usput:src': 'Fraunhofer ISI'}
            if 'Rest Area' in raw:
                tags['highway'] = 'rest_area'
            if row.get('label_SSTPA') == 'True':
                tags['usput:sstpa'] = 'yes'
            for flag, road in (('tenT_CoreN_w2km_bool', 'tenT_CoreN_roadName'), ('tenT_CompN_w2km_bool', 'tenT_CompN_roadName')):
                name = (row.get(road) or '').strip()
                if row.get(flag) == 'True' and name and name != 'E999':
                    tags['usput:road'] = name
                    break
            zone = FH_ZONES.get((row.get('lc_LandCoverInfo') or '').strip().lower())
            if zone:
                tags['usput:zone'] = zone
            try:
                tags['usput:area'] = str(round(float(row['totalArea_m2'])))
            except (TypeError, ValueError, KeyError):
                pass
            items[('core', f'fh/{i}')] = {'type': 'fh', 'id': i, 'lat': round(lat, 6), 'lon': round(lon, 6), 'tags': tags}
            added += 1
    print(f'Fraunhofer: dodato {added}, već u OSM-u {skipped}')


def main(src, out):
    items = {}
    for pbf in sorted(glob.glob(os.path.join(src, 'f-*.osm.pbf'))):
        t0 = time.time()
        Collector(items).apply_file(pbf, locations=True)
        print(f'{os.path.basename(pbf)}: {time.time() - t0:.0f} s, ukupno {len(items)}')
    add_fraunhofer(os.path.join(src, 'fraunhofer.csv'), items)

    tiles = defaultdict(list)
    for (k, _), e in items.items():
        tiles[(k, f"{math.floor(e['lat'] / TILE)}_{math.floor(e['lon'] / TILE)}")].append(e)

    meta = {'built': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'tile': TILE,
            'countries': sorted(COUNTRIES), 'core': [], 'shop': [], 'ind': [], 'counts': {}}
    for (k, key), els in sorted(tiles.items()):
        os.makedirs(os.path.join(out, k), exist_ok=True)
        with open(os.path.join(out, k, key + '.json'), 'w', encoding='utf-8') as f:
            json.dump(els, f, ensure_ascii=False, separators=(',', ':'))
        meta[k].append(key)
        meta['counts'][k] = meta['counts'].get(k, 0) + len(els)
    # pločice gde baza važi; van njih aplikacija pita Overpass
    meta['covered'] = sorted(set(meta['core']) | set(meta['shop']) | set(meta['ind']))
    with open(os.path.join(out, 'meta.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, separators=(',', ':'))
    print('Gotovo:', meta['counts'], len(meta['covered']), 'pločica')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
