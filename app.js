/* Usput — mesta za vozače kamiona u blizini.
   Podaci: OpenStreetMap (Overpass API), pretraga mesta: Nominatim.
   Ocene/beleške/moja mesta: localStorage na telefonu + izvoz/uvoz JSON fajla. */
'use strict';

const VERSION = '1.2.0 · 29.10.2026';

/* ======================= Konfiguracija ======================= */

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const OVERPASS_TIMEOUT = 40000; // ukupno čekanje za sve servere zajedno
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const REL = {
  1: { label: 'Zvanično', cls: 'official', text: 'Zvanični podaci upravljača autoputa (Autobahn GmbH) ili EU sertifikovan bezbedan parking (SSTPA).' },
  2: { label: 'Provereno', cls: 'checked', text: 'Potvrđeno u bazi Fraunhofer instituta ili jasno označeno za kamione (broj mesta, servisna zona).' },
  3: { label: 'Neprovereno', cls: 'weak', text: 'Samo jedan izvor, bez potvrde. Može biti netačno, proveri pre dolaska.' },
};
const SRC_NAMES = { AB: 'Autobahn GmbH (zvanično)', FH: 'Fraunhofer ISI (CC BY 4.0)', OSM: 'OpenStreetMap' };
const DATA = 'data/';           // naša baza (NL, BE, DE, DK) — pravi je .github/workflows/podaci.yml
const MAX_PINS = 400;           // najviše markera na mapi (najbliži)
const CACHE_MAX = 4;            // koliko poslednjih pretraga čuvamo za rad bez interneta

const ICON = {
  parking: '<span>P</span>',
  fuel: '<svg viewBox="0 0 24 24"><path d="M4 3h9v18H4zM6 5v5h5V5zM14 7l4 3v8.5a1.5 1.5 0 0 1-3 0V14h-1v-2h3v-1.5l-3-2.2z"/></svg>',
  as24: '<span>24</span>',
  shop: '<svg viewBox="0 0 24 24"><path d="M3 4h2.5l2.2 10h10.1l2-7H7.4l-.5-2H3zM9 17.5a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zm8 0a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z"/></svg>',
  shower: '<svg viewBox="0 0 24 24"><path d="M11 3h2v3.1a6 6 0 0 1 5 5.9H6a6 6 0 0 1 5-5.9zM7 14h1.6v2H7zm4 0h2v2h-2zm4.4 0H17v2h-1.6zM7 18h1.6v2H7zm4 0h2v2h-2zm4.4 0H17v2h-1.6z"/></svg>',
  laundry: '<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm1 2v2h3V4zm6 4.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/></svg>',
  wash: '<svg viewBox="0 0 24 24"><path d="M7 3s-3 3.6-3 5.6a3 3 0 0 0 6 0C10 6.6 7 3 7 3zm10 0s-3 3.6-3 5.6a3 3 0 0 0 6 0C20 6.6 17 3 17 3zM2 14h14v5H2zm15 1h3l2 2.5V19h-5z"/></svg>',
  industrial: '<svg viewBox="0 0 24 24"><path d="M2 21V10l6 3.5V10l6 3.5V4h3v17zm3-4v2h2v-2zm5 0v2h2v-2zm5 0v2h2v-2z"/></svg>',
  mine: '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.9 7.5.7-5.7 5 1.7 7.4L12 18.3 5.5 22l1.7-7.4-5.7-5L9 8.9z"/></svg>',
};

const CATS = {
  parking:    { label: 'Parking',            color: '--c-park',    on: true  },
  fuel:       { label: 'Gorivo',             color: '--c-fuel',    on: true  },
  as24:       { label: 'AS 24',              color: '--c-as24',    on: true  },
  shop:       { label: 'Prodavnice',         color: '--c-shop',    on: true  },
  shower:     { label: 'Tuševi',             color: '--c-shower',  on: true  },
  laundry:    { label: 'Veš',                color: '--c-laundry', on: true  },
  wash:       { label: 'Perionice kamiona',  color: '--c-wash',    on: true  },
  industrial: { label: 'Industrijske zone',  color: '--c-ind',     on: false },
  mine:       { label: 'Moja mesta',         color: '--c-mine',    on: true  },
};

const SHOP_TYPES = {
  discount: 'Diskont (Lidl, Aldi…)',
  super: 'Supermarketi',
  variety: 'Action i slično',
  diy: 'Baumarkt / gvožđara',
  mini: 'Mini market',
};

const DEFAULT_FILTERS = {
  parkTruck: true, parkRest: true, parkPrice: 'all', parkSupervised: false,
  fuelOnlyTruck: false, fuelAdblue: false, showUnverified: false,
  shop: { discount: true, super: true, variety: true, diy: true, mini: false },
  laundrySelf: true, laundryDrop: true, laundryUnknown: true,
  only24: false,
};

const QUICK_TAGS = [
  'Čisto', 'Prljavo', 'Tuš topao', 'Tuš hladan', 'Bezbedno', 'Nebezbedno', 'Pun uveče',
  'Ima mesta', 'Besplatno', 'Skupo', 'Prima DKV', 'Prima UTA', 'Policija tera', 'Dobra hrana', 'Bučno',
];

/* brendovi (mala slova) */
const BR_DISCOUNT = ['lidl', 'aldi', 'penny', 'netto', 'norma', 'biedronka', 'dia', 'eurospar discount', 'hofer'];
const BR_VARIETY = ['action', 'tedi', 'pepco', 'hema', 'b&m', 'flying tiger', 'kik', 'woolworth', 'thomas philipps', 'jysk'];
const BR_DIY = ['obi', 'bauhaus', 'hornbach', 'toom', 'hagebau', 'praxis', 'gamma', 'karwei', 'leroy merlin',
  'castorama', 'brico', 'bricomarché', 'bricomarche', 'brico dépôt', 'brico depot', 'hellweg', 'globus baumarkt',
  'bauspezi', 'hammer', 'würth', 'wurth', 'mr. bricolage', 'weldom', 'bricorama'];
const TRUCK_WORDS = /truck|lkw|vrachtwagen|poids ?lourds?|kamion|camion|tir\b|autohof|routier/i;

/* ======================= Pomoćne ======================= */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';

function store(key, val) {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem('usput.' + key) || 'null');
    localStorage.setItem('usput.' + key, JSON.stringify(val));
    return true;
  } catch (e) { return val === undefined ? null : false; }
}

function distM(a, b) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function fmtDist(m) {
  if (m == null || isNaN(m)) return '';
  return m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m < 10000 ? (m / 1000).toFixed(1).replace('.', ',') : Math.round(m / 1000)) + ' km';
}
function fmtDate(t) {
  const d = new Date(t);
  return d.toLocaleDateString('sr-Latn', { day: 'numeric', month: 'numeric', year: 'numeric' });
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}
function setStatus(msg, err = false) {
  const s = $('#status');
  s.textContent = msg; s.classList.toggle('err', err);
}

/* ======================= Stanje ======================= */

const state = {
  center: null,          // gde je pretraga rađena {lat, lon}
  me: null,              // moja GPS pozicija
  radius: store('radius') || 10000,
  cats: Object.assign(Object.fromEntries(Object.entries(CATS).map(([k, v]) => [k, v.on])), store('cats') || {}),
  f: mergeFilters(store('filters')),
  items: [],             // iz OpenStreetMap-a
  industrial: [],        // zone, posebno učitavanje
  dataTime: null,
  offline: false,
  notes: store('notes') || {},     // id -> { autor: {r, tags, text, t} }
  places: store('places') || [],   // moja mesta
  author: store('author') || 'Ja',
  tab: 'map',
  loading: false,
};

function mergeFilters(saved) {
  const f = JSON.parse(JSON.stringify(DEFAULT_FILTERS));
  if (saved && typeof saved === 'object') {
    for (const k of Object.keys(f)) {
      if (k === 'shop' && saved.shop) Object.assign(f.shop, saved.shop);
      else if (k in saved) f[k] = saved[k];
    }
  }
  return f;
}

/* ======================= Klasifikacija OSM objekata ======================= */

function brandOf(t) { return (t.brand || t.name || t.operator || '').trim(); }
function lc(s) { return String(s || '').toLowerCase(); }
function hasBrand(t, list) {
  const s = lc(t.brand) + ' | ' + lc(t.name) + ' | ' + lc(t.operator);
  return list.some((b) => new RegExp('(^|[^a-z])' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)').test(s));
}
function isYes(v) { return v === 'yes' || v === 'designated' || v === 'only'; }

function priceOf(t) {
  if (t.fee === 'no' || t.charge === '0' || t.charge === 'free') return 'free';
  if (t.fee === 'yes' || (t.charge && t.charge !== 'no')) return 'paid';
  return 'unknown';
}

function classify(el) {
  const t = el.tags || {};
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  const it = { id: el.type + '/' + el.id, osmType: el.type === 'fh' || el.type === 'ab' ? null : el.type, osmId: el.id, lat, lon, t, also: [] };

  if (t.landuse === 'industrial') {
    it.cat = 'industrial';
    it.name = t.name || 'Industrijska zona';
    it.sub = 'Industrijska zona';
    return it;
  }
  if (t.amenity === 'fuel') {
    it.cat = 'fuel';
    it.as24 = /\bas ?24\b/i.test([t.brand, t.name, t.operator, t.network].join(' '));
    it.truck = it.as24 || isYes(t.hgv) || isYes(t['fuel:HGV_diesel']) || TRUCK_WORDS.test(t.name || '') || t.highway === 'services';
    it.adblue = isYes(t['fuel:adblue']) || t['fuel:adblue'] === 'yes';
    it.name = t.name || t.brand || (it.as24 ? 'AS 24' : 'Benzinska pumpa');
    it.sub = it.as24 ? 'AS 24 (kartica)' : (t.brand && t.brand !== it.name ? t.brand : 'Benzinska pumpa');
    if (isYes(t.shower)) it.also.push('shower');
    return it;
  }
  if (t.amenity === 'parking' || t.highway === 'rest_area' || t.highway === 'services') {
    it.cat = 'parking';
    it.rest = t.highway === 'rest_area' || t.highway === 'services';
    it.truck = isYes(t.hgv) || !!t['capacity:hgv'] || TRUCK_WORDS.test(t.name || '');
    if (t.hgv === 'no') return null;
    it.price = priceOf(t);
    it.supervised = t.supervised === 'yes';
    // pouzdanost: iz baze (usput:rel), a uživo isto pravilo kao u bazi
    it.rel = +t['usput:rel'] || (t.hgv === 'designated' || t.hgv === 'only' || +t['capacity:hgv'] > 0 || t.highway === 'services' ? 2 : 3);
    it.name = t.name || (t.highway === 'services' ? 'Servisna zona' : t.highway === 'rest_area' ? 'Odmorište' : 'Parking za kamione');
    it.sub = t.highway === 'services' ? 'Servisna zona' : t.highway === 'rest_area' ? 'Odmorište' : 'Parking za kamione';
    if (isYes(t.shower) || t.shower === 'hot') it.also.push('shower');
    return it;
  }
  if (t.amenity === 'car_wash' || t.amenity === 'vehicle_wash') {
    it.cat = 'wash';
    it.name = t.name || 'Perionica kamiona';
    it.sub = 'Perionica kamiona';
    return it;
  }
  if (t.shop === 'laundry' || t.shop === 'dry_cleaning') {
    it.cat = 'laundry';
    if (t.shop === 'dry_cleaning' || t.self_service === 'no') it.laundry = 'drop';
    else if (t.self_service === 'yes' || t['laundry_service'] === 'no') it.laundry = 'self';
    else it.laundry = 'unknown';
    it.name = t.name || (it.laundry === 'drop' ? 'Perionica / hemijsko čišćenje' : 'Perionica veša');
    it.sub = it.laundry === 'self' ? 'Samouslužna perionica veša' : it.laundry === 'drop' ? 'Veš na ostavljanje' : 'Perionica veša';
    return it;
  }
  if (t.shop) {
    it.cat = 'shop';
    if (hasBrand(t, BR_DIY) || t.shop === 'doityourself' || t.shop === 'hardware') it.shopType = 'diy';
    else if (hasBrand(t, BR_VARIETY) || t.shop === 'variety_store') it.shopType = 'variety';
    else if (hasBrand(t, BR_DISCOUNT) || t.shop === 'discount') it.shopType = 'discount';
    else if (t.shop === 'convenience') it.shopType = 'mini';
    else it.shopType = 'super';
    it.name = t.name || t.brand || SHOP_TYPES[it.shopType];
    it.sub = SHOP_TYPES[it.shopType];
    return it;
  }
  return null;
}

/* ======================= Overpass ======================= */

function bbox(lat, lon, r) {
  const dLat = r / 111320, dLon = r / (111320 * Math.cos(lat * Math.PI / 180));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((v) => v.toFixed(5)).join(',');
}
// 1. upit: ono najvažnije za kamion (malo podataka, brzo)
function coreQuery(lat, lon, r) {
  const B = `(${bbox(lat, lon, r)})`;
  return `[out:json][timeout:25];
(
  nwr${B}[amenity=parking][hgv~"^(yes|designated|only)$"];
  nwr${B}[amenity=parking]["capacity:hgv"];
  nwr${B}[amenity=parking][name~"truck|lkw|vrachtwagen|poids|kamion|camion|autohof",i];
  nwr${B}[highway~"^(rest_area|services)$"];
  nwr${B}[amenity=fuel];
  nwr${B}[shop~"^(laundry|dry_cleaning)$"];
  nwr${B}[amenity~"^(car_wash|vehicle_wash)$"][hgv~"^(yes|designated|only)$"];
  nwr${B}[amenity~"^(car_wash|vehicle_wash)$"][name~"truck|lkw|vrachtwagen|poids|kamion|camion",i];
);
out center tags;`;
}
// 2. upit: prodavnice (u gradovima ih ima mnogo, zato posebno)
function shopQuery(lat, lon, r) {
  const B = `(${bbox(lat, lon, r)})`;
  return `[out:json][timeout:25];
nwr${B}[shop~"^(supermarket|department_store|general|variety_store|doityourself|hardware|convenience|discount)$"];
out center tags;`;
}
function industrialQuery(lat, lon, r) {
  return `[out:json][timeout:25];
way(${bbox(lat, lon, r)})[landuse=industrial];
out tags center 300;`;
}

class LoadError extends Error {}
function explain(errs) {
  if (errs.some((e) => /429/.test(e))) return 'Server mape je trenutno zauzet za tvoju mrežu. Sačekaj minut ili probaj na Wi‑Fi.';
  if (errs.some((e) => /abort|time/i.test(e))) return 'Server mape ne odgovara na vreme. Probaj manji krug (3 km) ili ponovo za minut.';
  if (!navigator.onLine) return 'Nema interneta.';
  return 'Ne mogu da učitam podatke (' + errs.join(', ') + '). Pokušaj ponovo.';
}

// Svi serveri se pitaju odjednom; prvi ispravan odgovor pobeđuje, ostali se prekidaju.
// (Ranije jedan po jedan sa 35 s čekanja — kad su zagušeni, vozač je čekao skoro 2 minuta.)
async function overpass(query) {
  const errs = [];
  const ctls = OVERPASS.map(() => new AbortController());
  const timer = setTimeout(() => ctls.forEach((c) => c.abort()), OVERPASS_TIMEOUT);
  const ask = async (url, i) => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: ctls[i].signal,
      });
      if (!res.ok) throw new Error(res.status + '');
      const json = await res.json();
      if (json.remark && /runtime error|timed out/i.test(json.remark) && !(json.elements || []).length) throw new Error('timeout');
      return json.elements || [];
    } catch (e) {
      errs.push(e.name === 'AbortError' ? 'timeout' : (e.message || 'mreža'));
      throw e;
    }
  };
  try {
    return await Promise.any(OVERPASS.map(ask));
  } catch (e) {
    throw new LoadError(explain(errs));
  } finally {
    clearTimeout(timer);
    ctls.forEach((c) => c.abort());
  }
}

/* ======================= Naša baza ======================= */

// Pločice iz data/ — brzo i bez tuđih servera. null = baza ne pokriva ovaj krug, pa se pita Overpass.
let baseMeta;
async function loadBaseMeta() {
  if (baseMeta !== undefined) return baseMeta;
  try {
    const res = await fetch(DATA + 'meta.json', { cache: 'no-cache' });
    baseMeta = res.ok ? await res.json() : null;
    if (baseMeta) baseMeta.covered = new Set(baseMeta.covered);
  } catch (e) {
    baseMeta = undefined; // bez interneta — probaj opet sledeći put
    return null;
  }
  return baseMeta;
}
async function fromBase(kind, center, r) {
  const m = await loadBaseMeta();
  if (!m) return null;
  const [s, w, n, e] = bbox(center.lat, center.lon, r).split(',').map(Number);
  const keys = [];
  for (let i = Math.floor(s / m.tile); i <= Math.floor(n / m.tile); i++) {
    for (let j = Math.floor(w / m.tile); j <= Math.floor(e / m.tile); j++) keys.push(i + '_' + j);
  }
  // Odlučuje pločica centra; susedne bez podataka su more ili zemlja van baze i ostaju prazne.
  if (!m.covered.has(Math.floor(center.lat / m.tile) + '_' + Math.floor(center.lon / m.tile))) return null;
  const have = new Set(m[kind]);
  const parts = await Promise.all(keys.filter((k) => have.has(k)).map(async (k) => {
    const res = await fetch(`${DATA}${kind}/${k}.json`);
    if (!res.ok) throw new LoadError('Ne mogu da učitam bazu (' + res.status + '). Pokušaj ponovo.');
    return res.json();
  }));
  return parts.flat();
}

function processElements(elements) {
  const seen = new Set();
  const out = [];
  for (const el of elements) {
    const key = el.type + '/' + el.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const it = classify(el);
    if (it) out.push(it);
  }
  return out;
}

/* ======================= Keš (rad bez interneta) ======================= */

function cacheSave(center, radius, kind, items) {
  let c = store('cache') || [];
  c = c.filter((e) => !(e.kind === kind && distM(e.center, center) < 500 && e.radius === radius));
  c.unshift({ kind, center, radius, t: Date.now(), items });
  c = c.slice(0, CACHE_MAX);
  while (c.length && !store('cache', c)) c.pop();
}
function cacheFind(center, radius, kind) {
  const c = store('cache') || [];
  return c.find((e) => e.kind === kind && distM(e.center, center) + radius <= e.radius + 2000) ||
         c.find((e) => e.kind === kind && distM(e.center, center) < e.radius) || null;
}

/* ======================= Učitavanje ======================= */

function inRadius(items, center, r) {
  return items.filter((it) => distM(center, it) <= r);
}
function doneStatus() {
  const n = visibleItems().length;
  setStatus((state.offline ? 'Bez interneta — podaci od ' + fmtDate(state.dataTime) + '. ' : '') + n + ' mesta u krugu od ' + fmtDist(state.radius) +
    (n > MAX_PINS ? ` (na mapi najbližih ${MAX_PINS}, sva u listi).` : '.'));
}

async function load(center) {
  if (state.loading) return;
  state.loading = true;
  state.center = center;
  store('lastCenter', center);
  $('#btn-here').hidden = true;
  drawSearchCircle();
  const r = state.radius;

  // 1) parking, gorivo, tuševi, veš, perionice
  setStatus('Učitavam parkinge i pumpe…');
  let core, shops, err;
  try {
    core = inRadius(processElements((await fromBase('core', center, r)) ?? (await overpass(coreQuery(center.lat, center.lon, r)))), center, r);
  } catch (e) { err = e; }

  if (core) {
    state.items = core; state.dataTime = Date.now(); state.offline = false;
    render();
    setStatus('Učitavam prodavnice…');
    // 2) prodavnice
    try {
      shops = inRadius(processElements((await fromBase('shop', center, r)) ?? (await overpass(shopQuery(center.lat, center.lon, r)))), center, r);
      const ids = new Set(core.map((x) => x.id));
      state.items = core.concat(shops.filter((x) => !ids.has(x.id)));
    } catch (e) {
      toast('Prodavnice nisu učitane: ' + e.message);
    }
    cacheSave(center, r, 'base', state.items);
  } else {
    const hit = cacheFind(center, r, 'base');
    if (hit) {
      state.items = hit.items; state.dataTime = hit.t; state.offline = true;
    } else {
      state.loading = false;
      render();
      setStatus(err instanceof LoadError ? err.message : 'Ne mogu da učitam podatke. Pokušaj ponovo.', true);
      return;
    }
  }
  if (state.cats.industrial) await loadIndustrial(center);
  state.loading = false;
  render();
  doneStatus();
  if (!core && err) toast(err.message);
}

async function loadIndustrial(center) {
  try {
    const els = (await fromBase('ind', center, state.radius)) ?? (await overpass(industrialQuery(center.lat, center.lon, state.radius)));
    state.industrial = inRadius(processElements(els), center, state.radius);
    cacheSave(center, state.radius, 'ind', state.industrial);
  } catch (e) {
    const hit = cacheFind(center, state.radius, 'ind');
    state.industrial = hit ? hit.items : [];
  }
}

/* ======================= Filtriranje ======================= */

function passes(it) {
  const f = state.f, c = state.cats;
  if (f.only24 && it.cat !== 'mine' && it.cat !== 'industrial' && !(it.t.opening_hours || '').includes('24/7')) return false;
  const viaAlso = it.also && it.also.some((a) => c[a]);
  switch (it.cat) {
    case 'parking': {
      // parking sa tušem se vidi i pod „Tuševi“ kad je kategorija Parking isključena
      if (it.rel === 3 && !f.showUnverified) return false;
      if (!c.parking) return viaAlso;
      if (it.rest && !f.parkRest) return false;
      if (!it.rest && !f.parkTruck) return false;
      if (f.parkPrice === 'free' && it.price !== 'free') return false;
      if (f.parkPrice === 'paid' && it.price !== 'paid') return false;
      if (f.parkSupervised && !it.supervised) return false;
      return true;
    }
    case 'fuel': {
      if (it.as24 && c.as24) return true;
      if (!c.fuel) return viaAlso;
      if (f.fuelOnlyTruck && !it.truck) return false;
      if (f.fuelAdblue && !it.adblue && !it.as24) return false;
      return true;
    }
    case 'shop': return c.shop && !!f.shop[it.shopType];
    case 'laundry':
      if (!c.laundry) return false;
      return (it.laundry === 'self' && f.laundrySelf) || (it.laundry === 'drop' && f.laundryDrop) || (it.laundry === 'unknown' && f.laundryUnknown);
    case 'wash': return c.wash;
    case 'industrial': return c.industrial;
    case 'mine': return c.mine;
  }
  return false;
}

function myPlaceItems() {
  return state.places.map((p) => ({
    id: 'mine/' + p.id, cat: 'mine', mine: p, lat: p.lat, lon: p.lon, t: {},
    name: p.name || 'Moje mesto', sub: (CATS[p.kind]?.label || 'Moje mesto') + (p.by ? ' · ' + p.by : ''), also: [],
    price: p.price || 'unknown',
  }));
}

function visibleItems() {
  const ref = state.me && state.center && distM(state.me, state.center) < state.radius ? state.me : state.center;
  const all = state.items.concat(state.cats.industrial ? state.industrial : [], myPlaceItems());
  const out = all.filter(passes);
  for (const it of out) it.dist = ref ? distM(ref, it) : null;
  return out;
}

/* ======================= Ocene ======================= */

function noteSummary(id) {
  const n = state.notes[id];
  if (!n) return null;
  const entries = Object.entries(n).map(([by, v]) => ({ by, ...v }));
  const rated = entries.filter((e) => e.r);
  const avg = rated.length ? rated.reduce((s, e) => s + e.r, 0) / rated.length : null;
  const tags = {};
  for (const e of entries) for (const t of e.tags || []) tags[t] = (tags[t] || 0) + 1;
  return { entries, avg, count: rated.length, tags };
}
function saveNote(id, data) {
  state.notes[id] = state.notes[id] || {};
  if (!data.r && !(data.tags && data.tags.length) && !data.text) delete state.notes[id][state.author];
  else state.notes[id][state.author] = { ...data, t: Date.now() };
  if (!Object.keys(state.notes[id]).length) delete state.notes[id];
  store('notes', state.notes);
}

/* ======================= Mapa ======================= */

let map, layer, meMarker, circle;

function initMap() {
  map = L.map('map', { zoomControl: false, attributionControl: true }).setView([51.0, 8.5], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, subdomains: 'abc',
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' +
      ' · parkinzi: <a href="https://doi.org/10.5281/zenodo.14643147" target="_blank" rel="noopener">Fraunhofer ISI</a> (CC BY 4.0)',
  }).addTo(map);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  layer = L.layerGroup().addTo(map);
  map.on('moveend', () => {
    if (!state.center) return;
    const c = map.getCenter();
    $('#btn-here').hidden = distM({ lat: c.lat, lon: c.lng }, state.center) < state.radius * 0.4;
  });
}

let colorCache = {};
function pinIcon(it) {
  const key = it.cat === 'fuel' && it.as24 ? 'as24' : it.cat;
  const color = colorCache[key] || (colorCache[key] = cssVar(CATS[key].color));
  const rated = (state.notes[it.id] ? ' rated' : '') + (it.rel === 3 ? ' weak' : '');
  const size = it.as24 ? 34 : 30;
  return L.divIcon({
    className: '',
    html: `<div class="pin${it.as24 ? ' as24' : ''}${rated}" style="background:${color}">${ICON[key]}</div>`,
    iconSize: [size, size], iconAnchor: [size / 2, Math.round(size / 2 + size * 0.707)], popupAnchor: [0, -size],
  });
}

function drawSearchCircle() {
  if (!map || !state.center) return;
  if (circle) circle.remove();
  circle = L.circle([state.center.lat, state.center.lon], {
    radius: state.radius, color: cssVar('--accent'), weight: 2, fill: false, dashArray: '6 6', interactive: false,
  }).addTo(map);
}

function drawMe() {
  if (!map || !state.me) return;
  const ll = [state.me.lat, state.me.lon];
  if (meMarker) meMarker.setLatLng(ll);
  else meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000, interactive: false }).addTo(map);
}

function renderMap(items) {
  colorCache = {};
  layer.clearLayers();
  const sorted = items.slice().sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0));
  const pins = sorted.slice(0, MAX_PINS);
  // važnija mesta crtamo poslednja (iznad ostalih)
  const prio = (it) => (it.as24 ? 5 : it.cat === 'mine' ? 4 : it.cat === 'parking' ? 3 : it.cat === 'industrial' ? 0 : 1);
  pins.sort((a, b) => prio(a) - prio(b));
  for (const it of pins) {
    const m = L.marker([it.lat, it.lon], { icon: pinIcon(it), zIndexOffset: prio(it) * 100, title: it.name });
    m.on('click', () => openDetail(it));
    layer.addLayer(m);
  }
}

/* ======================= Lista ======================= */

function tagsHtml(it, short = false) {
  const t = it.t || {}, out = [];
  if (it.rel && it.cat === 'parking') out.push(`<span class="tag ${REL[it.rel].cls}">${REL[it.rel].label}</span>`);
  if (it.as24) out.push('<span class="tag as24">AS 24</span>');
  if (it.price === 'free') out.push('<span class="tag good">Besplatno</span>');
  if (it.price === 'paid') out.push('<span class="tag">Plaća se</span>');
  if (it.supervised) out.push('<span class="tag good">Čuvan</span>');
  if (t['capacity:hgv']) out.push(`<span class="tag">${esc(t['capacity:hgv'])} mesta za kamione</span>`);
  if ((t.opening_hours || '').includes('24/7')) out.push('<span class="tag">0–24</span>');
  if (it.cat === 'fuel' && it.truck && !it.as24) out.push('<span class="tag">Kamioni</span>');
  if (it.adblue) out.push('<span class="tag">AdBlue</span>');
  if (it.also.includes('shower') || isYes(t.shower)) out.push('<span class="tag">Tuš</span>');
  if (!short) {
    if (isYes(t.toilets)) out.push('<span class="tag">WC</span>');
    if (t.restaurant === 'yes' || t.food === 'yes') out.push('<span class="tag">Hrana</span>');
  }
  const ns = noteSummary(it.id);
  if (ns && ns.avg) out.push(`<span class="tag star">★ ${ns.avg.toFixed(1).replace('.', ',')}${ns.count > 1 ? ' (' + ns.count + ')' : ''}</span>`);
  return out.join('');
}

function itemColor(it) { return cssVar(CATS[it.as24 ? 'as24' : it.cat].color); }

function renderList(items) {
  const sort = $('#sort').value;
  const sorted = items.slice();
  if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'sr'));
  else if (sort === 'rating') sorted.sort((a, b) => (noteSummary(b.id)?.avg || 0) - (noteSummary(a.id)?.avg || 0) || (a.dist ?? 0) - (b.dist ?? 0));
  else sorted.sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0));

  const ul = $('#list');
  ul.innerHTML = sorted.slice(0, 600).map((it, i) => `
    <li class="item" data-i="${i}">
      <span class="stripe" style="background:${itemColor(it)}"></span>
      <div class="main">
        <div class="t">${esc(it.name)}</div>
        <div class="s">${esc(it.sub)}${it.t['addr:city'] ? ' · ' + esc(it.t['addr:city']) : ''}</div>
        <div class="tags">${tagsHtml(it, true)}</div>
      </div>
      <div class="d">${fmtDist(it.dist)}</div>
    </li>`).join('');
  $$('.item', ul).forEach((li) => li.addEventListener('click', () => openDetail(sorted[+li.dataset.i])));

  const empty = $('#list-empty');
  empty.hidden = sorted.length > 0;
  empty.textContent = state.center
    ? 'Ništa ne odgovara izabranim kategorijama i filterima. Uključi još kategorija ili povećaj krug.'
    : 'Pritisni „Gde sam“ ili upiši mesto da vidiš šta ima u blizini.';
  $('#count').textContent = sorted.length;
}

/* ======================= Detalji ======================= */

function openSheet(html) {
  $('#sheet-body').innerHTML = html;
  $('#sheet').hidden = false;
  $('.sheet-panel').scrollTop = 0;
}
function closeSheet() { $('#sheet').hidden = true; }

const PAY_LABELS = {
  'payment:dkv': 'DKV', 'payment:uta': 'UTA', 'payment:as24': 'AS 24', 'payment:shell': 'Shell kartica',
  'payment:eurowag': 'Eurowag', 'payment:e100': 'E100', 'payment:visa': 'Visa', 'payment:mastercard': 'Mastercard',
  'payment:maestro': 'Maestro', 'payment:cash': 'Gotovina', 'payment:coins': 'Kovanice', 'payment:debit_cards': 'Debitne kartice',
  'payment:credit_cards': 'Kreditne kartice', 'payment:contactless': 'Beskontaktno', 'payment:app': 'Aplikacija',
  'payment:travelcard': 'Travelcard', 'payment:routex': 'Routex', 'payment:tankpool24': 'Tankpool24',
};

function links(it) {
  const { lat, lon } = it;
  const city = it.t['addr:city'] || '';
  const name = it.name;
  const kind = { parking: 'truck parking', fuel: 'truck fuel', shop: '', shower: 'shower', laundry: 'laundry', wash: 'truck wash' }[it.cat] || '';
  const L2 = [
    ['Navigacija (Google)', `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`, true],
    ['Waze', `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`],
    ['Sygic Truck', `com.sygic.aura://coordinate|${lon}|${lat}|drive`],
    ['Google recenzije', `https://www.google.com/maps/search/${encodeURIComponent(name + (city ? ' ' + city : ''))}/@${lat},${lon},17z`],
  ];
  if (it.cat !== 'mine' && it.cat !== 'industrial') {
    L2.push(['Truckfly', `https://www.google.com/search?q=${encodeURIComponent('truckfly ' + name + ' ' + city)}`]);
    L2.push(['Iskustva vozača', `https://www.google.com/search?q=${encodeURIComponent('"' + name + '" ' + city + ' ' + kind + ' reviews')}`]);
  }
  if (it.osmType) L2.push(['Ispravi na mapi', `https://www.openstreetmap.org/${it.osmType}/${it.osmId}`]);
  return L2.map(([l, h, p]) => `<a class="btn${p ? ' btn-primary' : ''}" href="${esc(h)}" target="_blank" rel="noopener">${esc(l)}</a>`).join('');
}

function factsHtml(it) {
  const t = it.t || {}, rows = [];
  const addr = [[t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '), [t['addr:postcode'], t['addr:city']].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (addr) rows.push(['Adresa', esc(addr)]);
  if (t.opening_hours) rows.push(['Radno vreme', esc(t.opening_hours)]);
  if (t.fee || t.charge) rows.push(['Cena', esc([t.fee === 'yes' ? 'plaća se' : t.fee === 'no' ? 'besplatno' : t.fee, t.charge].filter(Boolean).join(' · '))]);
  if (t.maxstay) rows.push(['Najduže', esc(t.maxstay)]);
  if (t['capacity:hgv'] || t.capacity) rows.push(['Kapacitet', esc([t['capacity:hgv'] && t['capacity:hgv'] + ' kamiona', t.capacity && t.capacity + ' ukupno'].filter(Boolean).join(' · '))]);
  const pays = Object.keys(PAY_LABELS).filter((k) => t[k] === 'yes').map((k) => PAY_LABELS[k]);
  if (pays.length) rows.push(['Plaćanje', esc(pays.join(', '))]);
  const fuels = [];
  if (isYes(t['fuel:HGV_diesel'])) fuels.push('dizel za kamione');
  if (isYes(t['fuel:diesel'])) fuels.push('dizel');
  if (isYes(t['fuel:adblue'])) fuels.push('AdBlue');
  if (isYes(t['fuel:lng'])) fuels.push('LNG');
  if (isYes(t['fuel:cng'])) fuels.push('CNG');
  if (fuels.length) rows.push(['Gorivo', esc(fuels.join(', '))]);
  const has = [];
  if (isYes(t.toilets)) has.push('WC');
  if (isYes(t.shower)) has.push('tuš');
  if (t.supervised === 'yes') has.push('čuvan');
  if (t.lit === 'yes') has.push('osvetljen');
  if (t.fence === 'yes') has.push('ograđen');
  if (isYes(t.internet_access) || t.internet_access === 'wlan') has.push('Wi‑Fi');
  if (has.length) rows.push(['Ima', esc(has.join(', '))]);
  if (t.phone || t['contact:phone']) rows.push(['Telefon', `<span class="sel">${esc(t.phone || t['contact:phone'])}</span>`]);
  const web = t.website || t['contact:website'];
  if (web) rows.push(['Sajt', `<a href="${esc(/^https?:/.test(web) ? web : 'https://' + web)}" target="_blank" rel="noopener">${esc(web.replace(/^https?:\/\//, ''))}</a>`]);
  if (t.operator && t.operator !== it.name) rows.push(['Operater', esc(t.operator)]);
  if (t.description) rows.push(['Opis', esc(t.description)]);
  if (t['usput:sstpa']) rows.push(['Bezbednost', 'Sertifikovan bezbedan parking (EU SSTPA)']);
  if (t['usput:road']) rows.push(['Autoput', esc('blizu ' + t['usput:road'])]);
  if (t['usput:zone']) rows.push(['Okolina', esc(t['usput:zone'])]);
  if (t['usput:area']) rows.push(['Površina', esc('oko ' + Number(t['usput:area']).toLocaleString('sr') + ' m²')]);
  if (t['usput:info']) rows.push(['Podaci upravljača', esc(t['usput:info'])]);
  if (it.rel && it.cat === 'parking') rows.push(['Pouzdanost', `<strong>${REL[it.rel].label}.</strong> ${REL[it.rel].text}`]);
  const src = (t['usput:src'] || (it.cat === 'mine' ? '' : 'OSM')).split(',').filter(Boolean);
  if (src.length) rows.push(['Izvor', esc(src.map((x) => SRC_NAMES[x] || x).join(' · '))]);
  if (t['usput:src'] === 'FH') rows.push(['Napomena', 'Tačka je centar zone parkinga, ulaz može biti nekoliko stotina metara dalje.']);
  if (t['usput:shower_fee'] === 'yes') rows.push(['Tuš', 'plaća se']);
  if (it.cat === 'fuel' && it.as24) rows.push(['Napomena', 'AS 24 stanice su uglavnom bez osoblja i rade samo sa AS 24 karticom (ponegde i druge kartice). Proveri pre dolaska.']);
  if (it.cat === 'industrial') rows.push(['Napomena', 'Industrijska zona, nije zvanični parking. Proveri lokalne znakove i pravila za noćenje.']);
  if (it.mine?.note) rows.push(['Beleška', esc(it.mine.note)]);
  return rows.length ? `<dl class="d-facts">${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>` : '';
}

function notesHtml(it) {
  const ns = noteSummary(it.id);
  const mineNote = state.notes[it.id]?.[state.author] || {};
  const others = ns ? ns.entries.filter((e) => e.by !== state.author) : [];
  return `
  <div class="d-section">
    <h4>Tvoja ocena</h4>
    <div class="stars" id="stars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" class="${(mineNote.r || 0) >= n ? 'on' : ''}" aria-label="${n} od 5">★</button>`).join('')}</div>
    <div class="qtags" id="qtags">${QUICK_TAGS.map((q) => `<button type="button" class="${(mineNote.tags || []).includes(q) ? 'on' : ''}">${esc(q)}</button>`).join('')}</div>
    <textarea id="note-text" placeholder="Beleška za tebe i vozače (npr. ulaz sa zadnje strane, tuš 1 € / 5 min)">${esc(mineNote.text || '')}</textarea>
    <div class="row-btns"><button id="note-save" class="btn btn-primary" type="button">Sačuvaj ocenu</button></div>
  </div>
  ${others.length ? `<div class="d-section"><h4>Drugi vozači</h4>${others.map((e) => `
    <p><strong>${esc(e.by)}</strong>${e.r ? ' · ' + '★'.repeat(e.r) : ''} <span class="muted small">${fmtDate(e.t)}</span><br>
    ${(e.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')} ${esc(e.text || '')}</p>`).join('')}</div>` : ''}`;
}

function openDetail(it) {
  const key = it.as24 ? 'as24' : it.cat;
  openSheet(`
    <div class="d-kicker"><span class="dot" style="background:${itemColor(it)}"></span>${esc(CATS[key].label)}</div>
    <h2 class="d-title" id="sheet-title">${esc(it.name)}</h2>
    <div class="d-sub">${esc(it.sub)}${it.dist != null ? ' · ' + fmtDist(it.dist) + ' vazdušnom linijom' : ''}</div>
    <div class="d-tags">${tagsHtml(it)}</div>
    ${factsHtml(it)}
    <div class="d-actions">${links(it)}</div>
    ${notesHtml(it)}
    ${it.mine ? `<div class="d-section"><button id="del-place" class="danger-link" type="button">Obriši ovo moje mesto</button>
      <span id="del-confirm" hidden> Sigurno? <button id="del-yes" class="danger-link" type="button">Da, obriši</button></span></div>` : ''}
  `);
  if (map) map.panTo([it.lat, it.lon]);

  let rating = state.notes[it.id]?.[state.author]?.r || 0;
  $$('#stars button').forEach((b) => b.addEventListener('click', () => {
    rating = +b.dataset.n === rating ? 0 : +b.dataset.n;
    $$('#stars button').forEach((x) => x.classList.toggle('on', +x.dataset.n <= rating));
  }));
  $$('#qtags button').forEach((b) => b.addEventListener('click', () => b.classList.toggle('on')));
  $('#note-save').addEventListener('click', () => {
    const tags = $$('#qtags button.on').map((b) => b.textContent);
    saveNote(it.id, { r: rating, tags, text: $('#note-text').value.trim(), name: it.name, lat: it.lat, lon: it.lon, cat: it.cat });
    toast('Ocena sačuvana.');
    closeSheet();
    render();
  });
  if (it.mine) {
    $('#del-place').addEventListener('click', () => { $('#del-confirm').hidden = false; });
    $('#del-yes').addEventListener('click', () => {
      state.places = state.places.filter((p) => p.id !== it.mine.id);
      store('places', state.places);
      delete state.notes[it.id]; store('notes', state.notes);
      closeSheet(); render(); toast('Mesto obrisano.');
    });
  }
}

/* ======================= Dodavanje svog mesta ======================= */

function openAdd() {
  const c = map.getCenter();
  const hasMe = !!state.me;
  openSheet(`
    <h2 class="d-title" id="sheet-title">Dodaj svoje mesto</h2>
    <p class="muted">Mesto koje nije na mapi: besplatan parking, tuš, perionica… Vidiš ga samo ti, dok ga ne izvezeš vozačima.</p>
    <label class="field">Gde
      <select id="add-where">
        ${hasMe ? '<option value="me">Tu gde sam sada (GPS)</option>' : ''}
        <option value="center">Centar mape (pomeri mapu na tačno mesto)</option>
      </select>
    </label>
    <label class="field">Šta je
      <select id="add-kind">
        ${['parking', 'fuel', 'shop', 'shower', 'laundry', 'wash', 'industrial'].map((k) => `<option value="${k}">${CATS[k].label}</option>`).join('')}
      </select>
    </label>
    <label class="field">Naziv
      <input id="add-name" type="text" placeholder="npr. Parking iza Lidla">
    </label>
    <label class="field">Cena
      <select id="add-price"><option value="unknown">Ne znam</option><option value="free">Besplatno</option><option value="paid">Plaća se</option></select>
    </label>
    <label class="field">Beleška
      <textarea id="add-note" placeholder="Koliko mesta, ima li WC, da li noću tera policija…"></textarea>
    </label>
    <div class="row-btns"><button id="add-save" class="btn btn-primary" type="button">Sačuvaj mesto</button></div>
  `);
  $('#add-save').addEventListener('click', () => {
    const where = $('#add-where').value;
    const pos = where === 'me' && state.me ? state.me : { lat: c.lat, lon: c.lng };
    const p = {
      id: uid(), kind: $('#add-kind').value, name: $('#add-name').value.trim() || CATS[$('#add-kind').value].label,
      price: $('#add-price').value, note: $('#add-note').value.trim(), lat: pos.lat, lon: pos.lon, t: Date.now(), by: state.author,
    };
    state.places.push(p);
    store('places', state.places);
    closeSheet(); render(); toast('Mesto sačuvano.');
  });
}

/* ======================= Filteri UI ======================= */

function renderCats() {
  $('#cats').innerHTML = Object.entries(CATS).map(([k, v]) => `
    <button type="button" class="chip" data-k="${k}" aria-pressed="${state.cats[k]}">
      <span class="dot" style="background:var(${v.color})">${ICON[k]}</span>${esc(v.label)}
    </button>`).join('');
  $$('#cats .chip').forEach((b) => b.addEventListener('click', async () => {
    const k = b.dataset.k;
    state.cats[k] = !state.cats[k];
    b.setAttribute('aria-pressed', state.cats[k]);
    store('cats', state.cats);
    if (k === 'industrial' && state.cats[k] && state.center && !state.industrial.length) {
      setStatus('Učitavam industrijske zone…');
      await loadIndustrial(state.center);
      doneStatus();
    }
    render();
  }));
}

function opt(id, label, checked, type = 'checkbox', name = '') {
  return `<label class="opt"><input type="${type}" id="${id}" ${name ? `name="${name}"` : ''} ${checked ? 'checked' : ''}>${esc(label)}</label>`;
}
function fgroup(cat, title, body, note = '') {
  return `<div class="fgroup"><h3><span class="dot" style="background:var(${CATS[cat].color})"></span>${esc(title)}</h3><div class="opts">${body}</div>${note ? `<p class="fnote">${note}</p>` : ''}</div>`;
}

function renderFilters() {
  const f = state.f;
  $('#filters').innerHTML = `
    <h2>Filteri</h2>
    ${fgroup('parking', 'Parking',
      opt('f-parkTruck', 'Parkinzi za kamione', f.parkTruck) +
      opt('f-parkRest', 'Odmorišta i servisne zone', f.parkRest) +
      opt('f-price-all', 'Sve cene', f.parkPrice === 'all', 'radio', 'price') +
      opt('f-price-free', 'Samo besplatni', f.parkPrice === 'free', 'radio', 'price') +
      opt('f-price-paid', 'Samo plaćeni', f.parkPrice === 'paid', 'radio', 'price') +
      opt('f-parkSupervised', 'Samo čuvani', f.parkSupervised) +
      opt('f-showUnverified', 'Prikaži i neproverene', f.showUnverified),
      '<b>Zvanično</b>: Autobahn GmbH ili EU sertifikovan parking. <b>Provereno</b>: potvrđeno u bazi Fraunhofer instituta ili jasno označeno za kamione. <b>Neprovereno</b>: samo jedan izvor, bledo na mapi. Cena se vidi samo kad je poznata; „Samo besplatni“ krije mesta bez podatka o ceni.')}
    ${fgroup('fuel', 'Gorivo',
      opt('f-fuelOnlyTruck', 'Samo označene za kamione', f.fuelOnlyTruck) +
      opt('f-fuelAdblue', 'Samo sa AdBlue', f.fuelAdblue),
      'AS 24 se uključuje posebno, dugmetom „AS 24“ gore. Mnoge pumpe nemaju oznaku za kamione iako ih primaju.')}
    ${fgroup('shop', 'Prodavnice', Object.entries(SHOP_TYPES).map(([k, l]) => opt('f-shop-' + k, l, f.shop[k])).join(''))}
    ${fgroup('laundry', 'Veš',
      opt('f-laundrySelf', 'Samouslužno', f.laundrySelf) +
      opt('f-laundryDrop', 'Na ostavljanje', f.laundryDrop) +
      opt('f-laundryUnknown', 'Nije navedeno', f.laundryUnknown))}
    <div class="fgroup"><h3>Ostalo</h3><div class="opts">${opt('f-only24', 'Samo otvoreno 0–24', f.only24)}</div></div>
    <div class="row-btns"><button id="f-reset" class="btn" type="button">Vrati podrazumevano</button></div>`;

  const bind = (id, fn) => { const el = $('#' + id); if (el) el.addEventListener('change', () => { fn(el.checked); saveFilters(); }); };
  bind('f-parkTruck', (v) => (f.parkTruck = v));
  bind('f-parkRest', (v) => (f.parkRest = v));
  bind('f-price-all', (v) => v && (f.parkPrice = 'all'));
  bind('f-price-free', (v) => v && (f.parkPrice = 'free'));
  bind('f-price-paid', (v) => v && (f.parkPrice = 'paid'));
  bind('f-parkSupervised', (v) => (f.parkSupervised = v));
  bind('f-showUnverified', (v) => (f.showUnverified = v));
  bind('f-fuelOnlyTruck', (v) => (f.fuelOnlyTruck = v));
  bind('f-fuelAdblue', (v) => (f.fuelAdblue = v));
  Object.keys(SHOP_TYPES).forEach((k) => bind('f-shop-' + k, (v) => (f.shop[k] = v)));
  bind('f-laundrySelf', (v) => (f.laundrySelf = v));
  bind('f-laundryDrop', (v) => (f.laundryDrop = v));
  bind('f-laundryUnknown', (v) => (f.laundryUnknown = v));
  bind('f-only24', (v) => (f.only24 = v));
  $('#f-reset').addEventListener('click', () => { state.f = mergeFilters(null); saveFilters(); renderFilters(); });
}
function saveFilters() {
  store('filters', state.f);
  const d = DEFAULT_FILTERS, f = state.f;
  let n = 0;
  for (const k of Object.keys(d)) {
    if (k === 'shop') { for (const s of Object.keys(d.shop)) if (d.shop[s] !== f.shop[s]) n++; }
    else if (d[k] !== f[k]) n++;
  }
  $('#fcount').hidden = n === 0;
  $('#fcount').textContent = n;
  render();
}

/* ======================= Moje (izvoz/uvoz) ======================= */

function renderMine() {
  const di = $('#data-info');
  if (di) {
    loadBaseMeta().then((m) => {
      if (!m) { di.textContent = ''; return; }
      const r = m.reliability || {};
      di.textContent = `Baza parkinga od ${fmtDate(m.built)} (${(m.countries || []).join(', ')}): zvanično ${r[1] || 0}, provereno ${r[2] || 0}, neprovereno ${r[3] || 0}. Osvežava se svakog ponedeljka.`;
    });
  }
  const pl = $('#mine-places');
  pl.innerHTML = state.places.length ? state.places.map((p, i) => `
    <li class="item" data-i="${i}"><span class="stripe" style="background:var(--c-mine)"></span>
      <div class="main"><div class="t">${esc(p.name)}</div><div class="s">${esc(CATS[p.kind]?.label || '')} · ${esc(p.by || '')} · ${fmtDate(p.t)}</div></div>
      <div class="d">${state.me ? fmtDist(distM(state.me, p)) : ''}</div></li>`).join('')
    : '<li class="empty">Još nema. Na mapi pritisni + da dodaš mesto.</li>';
  $$('.item', pl).forEach((li) => li.addEventListener('click', () => {
    const it = myPlaceItems()[+li.dataset.i];
    it.dist = state.me ? distM(state.me, it) : null;
    openDetail(it);
  }));

  const nl = $('#mine-notes');
  const ids = Object.keys(state.notes).filter((id) => !id.startsWith('mine/'));
  nl.innerHTML = ids.length ? ids.map((id) => {
    const e = Object.values(state.notes[id])[0] || {};
    const ns = noteSummary(id);
    return `<li class="item" data-id="${esc(id)}"><span class="stripe" style="background:${cssVar(CATS[e.cat]?.color || '--c-ind')}"></span>
      <div class="main"><div class="t">${esc(e.name || id)}</div><div class="s">${ns.avg ? '★ ' + ns.avg.toFixed(1).replace('.', ',') + ' · ' : ''}${ns.entries.map((x) => esc(x.by)).join(', ')}</div></div>
      <div class="d">${state.me && e.lat ? fmtDist(distM(state.me, e)) : ''}</div></li>`;
  }).join('') : '<li class="empty">Još nema ocena. Otvori bilo koje mesto i oceni ga.</li>';
  $$('.item', nl).forEach((li) => li.addEventListener('click', () => {
    const id = li.dataset.id;
    const found = state.items.find((x) => x.id === id);
    if (found) { found.dist = state.me ? distM(state.me, found) : null; openDetail(found); return; }
    const e = Object.values(state.notes[id])[0] || {};
    if (e.lat && map) { switchTab('map'); map.setView([e.lat, e.lon], 15); load({ lat: e.lat, lon: e.lon }); }
  }));
}

async function exportData() {
  const data = { app: 'usput', v: 1, exported: new Date().toISOString(), from: state.author, notes: state.notes, places: state.places };
  const json = JSON.stringify(data, null, 1);
  const name = `usput-${state.author.replace(/\W+/g, '_') || 'vozac'}-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Usput — ocene i mesta', text: 'Uvezi u Usput: Moje → Uvezi fajl' });
      $('#mine-msg').textContent = 'Poslato.';
      return;
    }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  $('#mine-msg').textContent = 'Fajl je preuzet: ' + name;
}

function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (d.app !== 'usput') throw new Error('nije Usput fajl');
      let nNotes = 0, nPlaces = 0;
      for (const [id, byAuthor] of Object.entries(d.notes || {})) {
        state.notes[id] = state.notes[id] || {};
        for (const [by, v] of Object.entries(byAuthor)) {
          const cur = state.notes[id][by];
          if (!cur || (v.t || 0) > (cur.t || 0)) { state.notes[id][by] = v; nNotes++; }
        }
      }
      for (const p of d.places || []) {
        const i = state.places.findIndex((x) => x.id === p.id);
        if (i < 0) { state.places.push(p); nPlaces++; }
        else if ((p.t || 0) > (state.places[i].t || 0)) { state.places[i] = p; nPlaces++; }
      }
      store('notes', state.notes); store('places', state.places);
      $('#mine-msg').textContent = `Uvezeno: ${nNotes} ocena i ${nPlaces} mesta${d.from ? ' od ' + d.from : ''}.`;
      render();
    } catch (e) {
      $('#mine-msg').textContent = 'Ovo nije ispravan Usput fajl. Izaberi .json fajl koji je izvezen iz Usput-a.';
    }
  };
  r.readAsText(file);
}

/* ======================= Lokacija i pretraga ======================= */

function locate(auto = false) {
  if (!navigator.geolocation) { setStatus('Ovaj telefon ne daje lokaciju. Upiši mesto u pretragu.', true); return; }
  setStatus('Tražim tvoju lokaciju…');
  navigator.geolocation.getCurrentPosition((pos) => {
    state.me = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    drawMe();
    map.setView([state.me.lat, state.me.lon], zoomFor(state.radius));
    load(state.me);
  }, (err) => {
    if (auto) { setStatus('Pritisni „Gde sam“ ili upiši mesto.'); return; }
    const m = { 1: 'Lokacija je odbijena. Dozvoli lokaciju za ovaj sajt u podešavanjima browsera.', 2: 'Lokacija trenutno nije dostupna. Izađi na otvoreno ili upiši mesto.', 3: 'Lokacija se predugo traži. Pokušaj ponovo.' };
    setStatus(m[err.code] || 'Ne mogu da nađem lokaciju.', true);
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });

  if (!locate.watching) {
    locate.watching = true;
    navigator.geolocation.watchPosition((pos) => {
      state.me = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      drawMe();
    }, () => {}, { enableHighAccuracy: true, maximumAge: 30000 });
  }
}

function zoomFor(r) { return r <= 3000 ? 14 : r <= 10000 ? 12 : 11; }

async function search(q) {
  q = q.trim();
  if (!q) return;
  const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) { const c = { lat: +m[1], lon: +m[2] }; map.setView([c.lat, c.lon], zoomFor(state.radius)); load(c); return; }
  setStatus('Tražim „' + q + '“…');
  try {
    const res = await fetch(`${NOMINATIM}?format=jsonv2&limit=1&accept-language=sr-Latn,en&q=${encodeURIComponent(q)}`);
    const d = await res.json();
    if (!d.length) { setStatus('Nisam našao „' + q + '“. Probaj sa imenom grada.', true); return; }
    const c = { lat: +d[0].lat, lon: +d[0].lon };
    map.setView([c.lat, c.lon], zoomFor(state.radius));
    load(c);
  } catch (e) {
    setStatus('Pretraga ne radi bez interneta.', true);
  }
}

/* ======================= Tabovi i render ======================= */

function switchTab(tab) {
  state.tab = tab;
  for (const t of ['map', 'list', 'filters', 'mine']) {
    $('#tab-' + t).classList.toggle('on', t === tab);
    $('#tab-' + t).setAttribute('aria-selected', t === tab);
    $('#view-' + t).classList.toggle('on', t === tab);
  }
  if (tab === 'map' && map) setTimeout(() => map.invalidateSize(), 50);
  if (tab === 'filters') renderFilters();
  if (tab === 'mine') renderMine();
}

function render() {
  const items = visibleItems();
  if (map) renderMap(items);
  renderList(items);
  if (state.tab === 'mine') renderMine();
}

/* ======================= Start ======================= */

function init() {
  $('#ver').textContent = VERSION;
  initMap();
  renderCats();
  saveFilters();

  $$('.radius button').forEach((b) => {
    b.classList.toggle('on', +b.dataset.r === state.radius);
    b.addEventListener('click', () => {
      state.radius = +b.dataset.r; store('radius', state.radius);
      $$('.radius button').forEach((x) => x.classList.toggle('on', x === b));
      if (state.center) { map.setView([state.center.lat, state.center.lon], zoomFor(state.radius)); load(state.center); }
    });
  });
  $('#btn-locate').addEventListener('click', () => locate(false));
  $('#search-form').addEventListener('submit', (e) => { e.preventDefault(); $('#search-input').blur(); search($('#search-input').value); });
  $('#btn-here').addEventListener('click', () => { const c = map.getCenter(); load({ lat: c.lat, lon: c.lng }); });
  $('#btn-add').addEventListener('click', openAdd);
  $('#sort').addEventListener('change', () => renderList(visibleItems()));
  ['map', 'list', 'filters', 'mine'].forEach((t) => $('#tab-' + t).addEventListener('click', () => switchTab(t)));
  $('#sheet').addEventListener('click', (e) => { if (e.target.hasAttribute('data-close')) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  $('#btn-export').addEventListener('click', exportData);
  $('#import-file').addEventListener('change', (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });

  // ime vozača (za deljene ocene)
  const mine = $('#view-mine');
  const nameField = document.createElement('label');
  nameField.className = 'field';
  nameField.innerHTML = 'Tvoje ime (vidi se uz tvoje ocene kod drugih vozača)<input id="author" type="text" maxlength="30">';
  mine.insertBefore(nameField, mine.querySelector('.row-btns'));
  $('#author').value = state.author;
  $('#author').addEventListener('change', (e) => {
    const old = state.author, nu = e.target.value.trim() || 'Ja';
    if (nu === old) return;
    for (const id of Object.keys(state.notes)) {
      if (state.notes[id][old]) { state.notes[id][nu] = state.notes[id][old]; delete state.notes[id][old]; }
    }
    for (const p of state.places) if (p.by === old) p.by = nu;
    state.author = nu; store('author', nu); store('notes', state.notes); store('places', state.places);
    $('#mine-msg').textContent = 'Ime sačuvano.';
  });

  // poslednji podaci odmah (radi i bez interneta)
  const last = store('lastCenter');
  if (last) {
    const hit = cacheFind(last, state.radius, 'base');
    if (hit) {
      state.center = last; state.items = hit.items; state.dataTime = hit.t; state.offline = true;
      map.setView([last.lat, last.lon], zoomFor(state.radius));
      drawSearchCircle();
      render();
      setStatus('Poslednja pretraga od ' + fmtDate(hit.t) + '. Pritisni „Gde sam“ za osvežavanje.');
    }
  }
  render();

  // ako je lokacija već dozvoljena, odmah nađi gde sam
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted') locate(true); }).catch(() => {});
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
