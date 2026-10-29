"""Usput — pravljenje baze mesta.

Ulaz:  OpenStreetMap izvodi po zemljama (Geofabrik, već filtrirani sa osmium tags-filter),
       Fraunhofer ISI „European Truck Parking Locations" CSV (CC BY 4.0)
       i Autobahn GmbH des Bundes (zvanični Rastplätze sa brojem Lkw mesta, preuzima se ovde).

Pouzdanost parkinga (oznaka usput:rel, aplikacija je prikazuje):
  1 Zvanično   — Autobahn GmbH ili EU sertifikovan bezbedan parking (SSTPA)
  2 Provereno  — potvrđeno u Fraunhofer bazi, ili OSM izričito za kamione (hgv=designated/only, broj mesta, servisna zona)
  3 Neprovereno — samo jedan slab izvor (npr. OSM hgv=yes bez potvrde); aplikacija ih podrazumevano krije
Odbacuje se: odmorište bez ikakve potvrde da prima kamione, tuševi koji nisu uz parking za kamione (kampovi, plaže, bazeni).
Izlaz: data/meta.json i data/{core,shop,ind}/{i}_{j}.json — pločice od TILE × TILE stepeni.

Elementi su u istom obliku kao Overpass odgovor ({type, id, lat, lon, tags}),
pa ih app.js razvrstava istom funkcijom classify() i ocene vozača ostaju vezane za ista mesta.

Pokretanje: python tools/build_data.py <folder sa f-*.osm.pbf i fraunhofer.csv> <izlazni folder>
"""
import csv
import glob
import urllib.parse
import urllib.request
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


def cap_hgv(t):
    try:
        return int(str(t.get('capacity:hgv', '')).strip())
    except ValueError:
        return None


def kind_of(t):
    """core (parking, gorivo, veš, perionice), shop, ind.
    Privremeno: 'restc' = odmorište bez oznake za kamione (ostaje samo ako ga potvrdi Autobahn ili Fraunhofer),
                'showerc' = tuš (ostaje samo kao oznaka na obližnjem parkingu za kamione)."""
    a = t.get('amenity')
    if t.get('landuse') == 'industrial':
        return 'ind'
    if t.get('hgv') == 'no' or cap_hgv(t) == 0:
        return 'core' if a == 'fuel' else None
    if a == 'fuel' or t.get('highway') == 'services':
        return 'core'
    if t.get('highway') == 'rest_area':
        if t.get('hgv') in YES or cap_hgv(t) or TRUCK_WORDS.search(t.get('name', '')):
            return 'core'
        return 'restc'
    if a == 'parking':
        if t.get('hgv') in YES or cap_hgv(t) or TRUCK_WORDS.search(t.get('name', '')):
            return 'core'
        return None
    if a == 'shower' or t.get('shower') in ('yes', 'hot'):
        return 'showerc'
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
        elif k == 'showerc':
            tags = {x: tags[x] for x in ('amenity', 'shower', 'fee', 'name') if x in tags}
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


def is_park(e):
    t = e['tags']
    return t.get('amenity') == 'parking' or t.get('highway') in ('rest_area', 'services')


class Grid:
    """Brza pretraga najbližeg mesta (ćelije ~1 km)."""
    C = 0.01

    def __init__(self):
        self.m = defaultdict(list)

    def add(self, e):
        self.m[(int(e['lat'] // self.C), int(e['lon'] // self.C))].append(e)

    def near(self, lat, lon, max_m, pred=None):
        gi, gj = int(lat // self.C), int(lon // self.C)
        best, bd = None, max_m
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for e in self.m[(gi + di, gj + dj)]:
                    if pred and not pred(e):
                        continue
                    d = dist_m(lat, lon, e['lat'], e['lon'])
                    if d <= bd:
                        best, bd = e, d
        return best


def add_src(t, code):
    have = [x for x in t.get('usput:src', '').split(',') if x]
    if code not in have:
        have.append(code)
    t['usput:src'] = ','.join(have)


# ---------- Autobahn GmbH (zvanično, Nemačka) ----------

AB_BASE = 'https://verkehr.autobahn.de/o/autobahn/'
UA = {'User-Agent': 'Usput/1.2 (truck driver app; github.com/buvac1/Upit)'}


def _get_json(url, tries=3):
    for n in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (n + 1))
    raise last


def fetch_autobahn():
    """Lista zvaničnih Lkw parkinga na nemačkim autoputevima. Ako servis ne radi, vraća [] (baza se pravi bez toga)."""
    try:
        roads = _get_json(AB_BASE).get('roads', [])
    except Exception as e:  # noqa: BLE001
        print('Autobahn: nije dostupan,', e)
        return []
    seen, out = set(), []
    for road in roads:
        road = str(road).strip()
        try:
            lst = _get_json(AB_BASE + urllib.parse.quote(road) + '/services/parking_lorry').get('parking_lorry', [])
        except Exception as e:  # noqa: BLE001
            print('Autobahn', road, 'greška', e)
            continue
        for p in lst:
            pid = p.get('identifier')
            if not pid or pid in seen:
                continue
            seen.add(pid)
            c = p.get('coordinate') or {}
            try:
                lat, lon = float(c.get('lat')), float(c.get('long', c.get('lon')))
            except (TypeError, ValueError):
                continue
            desc = [str(x) for x in (p.get('description') or []) if x]
            feats = [str(x.get('description')) for x in (p.get('lorryParkingFeatureIcons') or []) if x and x.get('description')]
            text = ' \n '.join([str(p.get('title', '')), str(p.get('subtitle', ''))] + desc + feats)
            m = re.search(r'lkw[^0-9\n]{0,25}?(\d{1,4})', text, re.I)
            cap = int(m.group(1)) if m else None
            if cap == 0:
                continue
            title = str(p.get('title') or '').split('|')[-1].strip() or str(p.get('subtitle') or '').strip()
            out.append({'lat': lat, 'lon': lon, 'name': title or 'Rastplatz', 'cap': cap, 'road': road,
                        'services': bool(re.search(r'raststätte|autohof|rasthof|tankstelle', text, re.I)),
                        'text': text, 'info': ' · '.join(dict.fromkeys(desc + feats))[:400]})
        time.sleep(0.15)
    print(f'Autobahn: {len(out)} zvaničnih parkinga')
    return out


def ab_tags(a):
    t = {}
    x = a['text']
    if re.search(r'toilette|\bwc\b', x, re.I):
        t['toilets'] = 'yes'
    if re.search(r'dusch', x, re.I):
        t['shower'] = 'yes'
    if re.search(r'restaurant|gastst|imbiss', x, re.I):
        t['restaurant'] = 'yes'
    if re.search(r'wlan|wifi|wi-fi', x, re.I):
        t['internet_access'] = 'wlan'
    if a['cap']:
        t['capacity:hgv'] = str(a['cap'])
    return t


def add_autobahn(abs_, items, grid):
    matched = added = 0
    for i, a in enumerate(abs_):
        e = grid.near(a['lat'], a['lon'], 250, is_park)
        extra = ab_tags(a)
        if e:
            t = e['tags']
            for k, v in extra.items():
                t.setdefault(k, v)
            matched += 1
        else:
            t = {'amenity': 'parking', 'hgv': 'designated', 'name': a['name'],
                 'highway': 'services' if a['services'] else 'rest_area', **extra}
            e = {'type': 'ab', 'id': i, 'lat': round(a['lat'], 6), 'lon': round(a['lon'], 6), 'tags': t}
            items[('core', f'ab/{i}')] = e
            grid.add(e)
            added += 1
        add_src(t, 'AB')
        t['usput:ab'] = 'yes'
        t['usput:road'] = a['road']
        if a['info']:
            t['usput:info'] = a['info']
    print(f'Autobahn: spojeno sa OSM {matched}, dodato novih {added}')


# ---------- Fraunhofer ISI (provereno) ----------

def add_fraunhofer(path, items, grid):
    """Fraunhofer potvrđuje OSM parkinge (do 300 m) i dodaje one kojih nema u OSM-u."""
    added = confirmed = 0
    with open(path, encoding='utf-8') as f:
        for i, row in enumerate(csv.DictReader(f, delimiter=';')):
            if (row.get('country') or '').strip().upper() not in COUNTRIES:
                continue
            try:
                lat, lon = float(row['lat']), float(row['lon'])
            except (TypeError, ValueError):
                continue
            sstpa = row.get('label_SSTPA') == 'True'
            medium = (row.get('truckParkingConfidence') or '').strip().lower() == 'medium'
            e = grid.near(lat, lon, 300, is_park)
            if e:
                confirmed += 1
                t = e['tags']
                add_src(t, 'FH')
                t['usput:fh'] = 'medium' if medium else 'yes'
                if sstpa:
                    t['usput:sstpa'] = 'yes'
                continue
            raw = (row.get('name') or '').strip()
            tags = {'amenity': 'parking', 'hgv': 'designated', 'name': FH_NAMES.get(raw, 'Parking za kamione'),
                    'usput:src': 'FH', 'usput:fh': 'medium' if medium else 'yes'}
            if 'Rest Area' in raw:
                tags['highway'] = 'rest_area'
            if sstpa:
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
            e = {'type': 'fh', 'id': i, 'lat': round(lat, 6), 'lon': round(lon, 6), 'tags': tags}
            items[('core', f'fh/{i}')] = e
            grid.add(e)
            added += 1
    print(f'Fraunhofer: potvrdio {confirmed}, dodato novih {added}')


def reliability(t):
    if t.get('usput:ab') or t.get('usput:sstpa'):
        return '1'
    fh = t.get('usput:fh')
    if t.get('usput:src') == 'FH':          # samo Fraunhofer
        return '2' if fh == 'yes' else '3'
    if fh:                                   # OSM + potvrda Fraunhofer-a
        return '2'
    strong = t.get('hgv') in ('designated', 'only') or (cap_hgv(t) or 0) > 0 or t.get('highway') == 'services'
    return '2' if strong else '3'


def main(src, out):
    items = {}
    for pbf in sorted(glob.glob(os.path.join(src, 'f-*.osm.pbf'))):
        t0 = time.time()
        Collector(items).apply_file(pbf, locations=True)
        print(f'{os.path.basename(pbf)}: {time.time() - t0:.0f} s, ukupno {len(items)}')

    grid = Grid()
    for (k, _), e in items.items():
        if k in ('core', 'restc') and is_park(e):
            e['tags'].setdefault('usput:src', 'OSM')
            grid.add(e)

    ab_file = os.path.join(src, 'autobahn.json')
    if 'DE' in COUNTRIES:
        if os.path.exists(ab_file):
            with open(ab_file, encoding='utf-8') as f:
                abs_ = json.load(f)
        else:
            abs_ = fetch_autobahn()
        add_autobahn(abs_, items, grid)
    add_fraunhofer(os.path.join(src, 'fraunhofer.csv'), items, grid)

    # odmorišta bez potvrde da primaju kamione — van
    dropped_rest = 0
    for key in [k for k in items if k[0] == 'restc']:
        e = items.pop(key)
        t = e['tags']
        if t.get('usput:ab') or t.get('usput:fh'):
            items[('core', key[1])] = e
        else:
            dropped_rest += 1

    # pouzdanost za sve parkinge
    rel_count = defaultdict(int)
    for (k, _), e in items.items():
        if k == 'core' and is_park(e):
            e['tags']['usput:rel'] = reliability(e['tags'])
            rel_count[e['tags']['usput:rel']] += 1

    # tuševi: samo kao oznaka na parkingu za kamione (pouzdanost 1–2) do 300 m
    attached = dropped_sh = 0
    for key in [k for k in items if k[0] == 'showerc']:
        s_ = items.pop(key)
        p = grid.near(s_['lat'], s_['lon'], 300, lambda e: is_park(e) and e['tags'].get('usput:rel') in ('1', '2'))
        if p:
            p['tags']['shower'] = 'yes'
            if s_['tags'].get('fee'):
                p['tags'].setdefault('usput:shower_fee', s_['tags']['fee'])
            attached += 1
        else:
            dropped_sh += 1
    print(f'Odbačeno odmorišta bez kamiona: {dropped_rest}; tuševi uz parking: {attached}, odbačeno (kamp, plaža…): {dropped_sh}')
    print('Pouzdanost parkinga:', dict(sorted(rel_count.items())))

    tiles = defaultdict(list)
    for (k, _), e in items.items():
        tiles[(k, f"{math.floor(e['lat'] / TILE)}_{math.floor(e['lon'] / TILE)}")].append(e)

    meta = {'built': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'tile': TILE,
            'countries': sorted(COUNTRIES), 'core': [], 'shop': [], 'ind': [], 'counts': {},
            'reliability': dict(sorted(rel_count.items()))}
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
