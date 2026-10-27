# Usput — uputstvo

Usput je web aplikacija za telefon. Pokazuje šta ima oko tebe: parkinge za kamione, odmorišta, industrijske zone, benzinske pumpe (AS 24 posebno), prodavnice (Lidl, Aldi, Action, OBI, Bauhaus…), tuševe, veš (samouslužno i na ostavljanje) i perionice kamiona.

## Šta je u folderu

| Fajl | Čemu služi |
| --- | --- |
| index.html | Sama aplikacija (stranica) |
| app.js | Sva logika: lokacija, pretraga, filteri, ocene |
| style.css | Izgled (svetla i tamna tema) |
| manifest.webmanifest, sw.js, icon.svg, icon-192.png, icon-512.png | Da se instalira na telefon i radi bez interneta |

## Adresa aplikacije

Aplikacija je objavljena preko GitHub Pages (repozitorijum `buvac1/Upit`, grana `main`, folder `/`):

**https://buvac1.github.io/Upit/**

Taj link pošalješ vozačima. Svaka izmena poslata na `main` se sama objavi za 1–2 minuta. Mora da bude `https://` adresa, inače telefon ne daje GPS.

## Instalacija na telefon

- **Android (Chrome):** otvori link → meni ⋮ → **Dodaj na početni ekran / Instaliraj aplikaciju**.
- **iPhone (Safari):** otvori link → dugme Deli → **Dodaj na početni ekran**.
- Prvi put pritisni **Gde sam** i dozvoli lokaciju.

## Kako se koristi

- **Gde sam** — traži oko tvoje GPS lokacije. Možeš i da upišeš mesto ili koordinate (`51.93, 4.02`).
- **3 / 10 / 25 km** — koliki krug pretražuje.
- Dugmići kategorija uključuju i isključuju vrste mesta. **AS 24** radi posebno: ugasi „Gorivo“, a ostavi „AS 24“ i vidiš samo AS 24.
- **Filteri** — besplatni/plaćeni/čuvani parkinzi, samo kamionske pumpe, AdBlue, vrste prodavnica, veš samouslužno ili na ostavljanje, samo 0–24.
- Pomeri mapu → **Pretraži ovde**.
- **+** na mapi — dodaj svoje mesto koje nije na mapi (npr. besplatan parking iza Lidla).
- U detaljima mesta: navigacija (Google, Waze, Sygic Truck), Google recenzije, Truckfly, iskustva vozača sa weba, ocena zvezdicama, brze oznake („Tuš hladan“, „Policija tera“…) i beleška.
- Bez interneta: aplikacija pamti poslednje 4 pretrage i pokazuje ih.

## Deljenje ocena sa vozačima (verzija 1)

1. **Moje** → upiši svoje ime.
2. **Izvezi (pošalji)** → na telefonu se otvara deljenje, pošalji fajl preko WhatsApp/Viber.
3. Vozač otvori Usput → **Moje** → **Uvezi fajl** → izabere taj fajl.

Svaka ocena nosi ime vozača, pa se vidi ko je šta napisao. Uvoz ništa ne briše, samo dodaje i osvežava novije.

## Odakle su podaci

- **Mesta:** OpenStreetMap (besplatno, cela Evropa). Ako mesto fali ili je pogrešno, „Ispravi na mapi“ vodi na OpenStreetMap gde svako može da ga ispravi.
- **Recenzije:** Google, Truckfly i forumi se otvaraju jednim dugmetom iz detalja mesta. Automatski uvoz tih recenzija nije moguć bez njihovog API pristupa (Google traži ključ i plaća se preko limita; Truckfly i društvene mreže nemaju otvoren pristup).
- **Naše ocene:** ono što ti i vozači upišete.

## Sledeći koraci (plan)

1. **Zajedničke ocene uživo** — umesto slanja fajla, ocene idu u zajedničku bazu (npr. Firebase ili Supabase, besplatan početni nivo) i svi vozači ih vide odmah.
2. **Google recenzije i radno vreme** u samoj aplikaciji, uz tvoj Google Places API ključ.
3. **Ograničenja kamiona** — visina, težina, zabrane vožnje vikendom.
4. **Ruta** — šta ima duž puta do odredišta, ne samo u krugu.
5. **Povezivanje sa Buvac TMS** — troškovi parkinga i tuševa direktno u evidenciju.

Verzija 1.0.2 · 27.10.2026
