# MacaniRacuni — Faza 1

Javna DEMO verzija: [macaniracuni.salemko.workers.dev](https://macaniracuni.salemko.workers.dev/). Postupak objave, provjere i prijenosa lokalnih podataka opisan je u [DEPLOYMENT.md](DEPLOYMENT.md).

Lokalna DEMO PWA za porodičnu evidenciju mjesečnih računa. Svi iznosi, dobavljačke stavke i historija su ilustrativni podaci.

## Pokretanje

Potreban je Node.js 22.12+ ili 24 LTS. U PowerShellu:

```powershell
cd C:\MacaniRacuni
npm install
npm run dev
```

Otvorite adresu koju ispiše Vite (uobičajeno http://127.0.0.1:5173).

```powershell
npm test
npm run build
npm run preview
```

`preview` služi produkcijski build na http://127.0.0.1:4173. PWA se instalira iz menija podržanog preglednika; offline podrška se aktivira u produkcijskom buildu nakon prve posjete. Za pristup s telefona koristite HTTPS hosting; HTTP preko lokalne mreže nema punu PWA podršku.

## Šta radi

- Mjesec: devet stalnih očekivanih računa, izbor mjeseca, Sarajevo / Nišići filter, sažetak poznatih iznosa.
- Detalj: prijem i plaćanje odvojeno, iznos, rok, datum izdavanja, izvor, napomena i prethodni dug/preplata iz dokumenta.
- Novi mjesec počinje bez iznosa i bez potvrda prijema ili plaćanja; historija ostaje sačuvana.
- Statistika: mjesečni poznati zbirovi i poređenje iznosa po dobavljaču. Različit obuhvat nije dokaz promjene cijena.
- localStorage čuva izmjene u istom pregledniku. Nije višekorisnička baza ni sigurnosna kopija. Ključ: `macaniracuni-demo-v1`.
- Hash routing omogućuje direktno otvaranje detalja bez serverskih rewrite pravila.

## Šta je placeholder

Skeniranje, dokumenti, Gmail, OCR/AI, Cloudflare, autentikacija, obavijesti, sinhronizacija i plaćanje nisu povezani. Izvor „Stiglo na mail” je ručna oznaka. Dug/preplata nije provjereno stanje kod dobavljača.

## Struktura

`src/domain.ts`: modeli, očekivane stavke, kreiranje mjeseca, DEMO seed i sažeci. `src/domain.test.ts`: domenski testovi. `src/main.tsx`: prikazi i lokalno čuvanje. `src/style.css`: responsive paleta iz briefa. `vite.config.ts`: PWA i build. Originalni brief i referenca su u `brief/MacaniRacuni_Codex_Paket/`.

Faza 2 zahtijeva poseban dogovor i nije implementirana.

## Provjere preglednika

```powershell
npx playwright test
```

Testovi koriste instalirani Microsoft Edge (`channel: msedge`), mobilnu širinu 390 px i desktop 1440 px. Snimci se spremaju u `artifacts/`.

## Dorada lokalne verzije

Statistika ima vlastiti izbor mjeseca, filter nekretnine, šestomjesečni pregled i sažetak poznatih plaćenih/preostalih iznosa. Detalj omogućuje korekciju datuma prijema nezavisno od obračunskog mjeseca.

Postavke nude JSON izvoz svih mjeseci i uvoz kopije. Uvoz provjerava format, valutu, statuse, iznose, datume i duplikate, zatim traži potvrdu zamjene. Neispravna datoteka ne mijenja evidenciju. Kopije su lokalne i nisu automatski spremljene na GitHub ili Cloudflare.

