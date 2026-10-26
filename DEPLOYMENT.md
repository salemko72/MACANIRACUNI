# Cloudflare objava

Aplikacija: https://macaniracuni.salemko.workers.dev/

Worker `macaniracuni` služi javni frontend i privatni porodični API. D1 `macaniracuni-family` je u EU jurisdikciji. Access aplikacija štiti `/api` i podputanje. Privatna lista odobrenih email adresa je u Cloudflare konfiguraciji, nikada u javnom repozitoriju.

## Priprema i provjere

```powershell
npm ci
npm test
npm run build
npm run build:worker
npx playwright test
```

Build generiše `dist/`, runtime OCR-a i `artifacts/worker.js`. `public/ocr/` je generisan i ignorisan u Gitu. OCR datoteke se preuzimaju na zahtjev; osnovna PWA instalacija ih ne uključuje unaprijed.

## Objava preko povezane Cloudflare integracije

1. Provjeriti postojeći Worker i D1; ne stvarati drugi projekt niti presijavati DEMO podatke.
2. Kod prve pripreme izvršiti idempotentni `server/schema.sql` nad postojećom D1 bazom.
3. Manifest svih datoteka iz `dist/`: `{ "/putanja": { hash, size } }`. Hash je prvih 32 heksadecimalna znaka SHA-256 sažetka base64 sadržaja i ekstenzije datoteke.
4. `POST /accounts/{account_id}/workers/scripts/macaniracuni/assets-upload-session`; prema vraćenim buckets poslati base64 multipart datoteke kroz assets/upload?base64=true uz kratkotrajni JWT sesije. JWT ne zapisivati u repo/logove.
5. `PUT /accounts/{account_id}/workers/scripts/macaniracuni` multipart: `worker.js` mora biti sadržaj `artifacts/worker.js`, ne stari statički handler.
6. Metadata: `main_module: worker.js`, datum kompatibilnosti, assets completion JWT; `html_handling: auto-trailing-slash`, `not_found_handling: single-page-application`, `run_worker_first: ["/api/*"]`. Bindings `ASSETS` assets, `DB` D1 s `database_id` postojeće baze i `AI` tip `ai`. Logs i traces uključeni. Sačuvati postojeći `ALLOWED_EMAILS` pomoću `keep_bindings: ["secret_text"]`; ne objavljivati tajnu u kodu.
7. Privatne postavke: `ACCESS_ISSUER`, `ACCESS_AUDIENCE`, `ALLOWED_EMAILS`. Lista emaila se postavlja kao secret_text, bez objave u kodu. Ne mijenjati Access allowlist niti skraćivati provjeru JWT-a zbog testiranja.
8. Worker workers.dev uključen, preview URL-ovi isključeni. GitHub push sam ne pokreće objavu.

Službena referenca: https://developers.cloudflare.com/workers/static-assets/direct-upload/

## Javne i privatne provjere

```powershell
$env:PLAYWRIGHT_BASE_URL='https://macaniracuni.salemko.workers.dev'
npx playwright test
Remove-Item Env:PLAYWRIGHT_BASE_URL
```

Dev harness testovi skenera preskaču se na javnoj adresi; stvarni test skeniranja koristi stvarni OCR i sintetičku sliku. Simulirani porodični testovi imaju zasebne testne adrese i dva izolovana preglednika. Testovi servera provjeravaju prave potpisane JWT-ove i stvarni SQLite, bez nesigurnog produkcijskog bypassa.

Anonimni `/api/login` treba voditi na Cloudflare email prijavu; proizvoljna zaglavlja ne smiju otvoriti evidenciju. Ne slati email kodove kroz automatizovani smoke test bez korisnikove radnje. Uspješnu stvarnu prijavu oba člana provjerava se na njihovim uređajima.

`POST /api/scan` koristi istu privatnu Access provjeru, samo same-origin JSON sa JPEG/PNG data URI, najviše 4 MiB. Migracija dodaje `ai_scan_usage` za atomski limit 20 pokušaja po UTC danu. Mistral Vision se poziva kroz nativni `AI` binding; ne trebaju vanjski API ključevi. AI nije dostupan bez prijave. `/api/login?next=scan` vraća na skeniranje. Sirove slike, OCR tekst i odgovore modela ne logovati.

## Prijenos i originali

Localhost i javni origin imaju odvojene podatke. JSON kopija prenosi podatke računa, ne IndexedDB originale. Porodična evidencija ne preuzima automatski lokalni DEMO; nikad ne prebrisati porodičnu bazu DEMO seedom. Originalne datoteke se u ovom izdanju ne prenose u cloud.

## Povrat verzije

Cloudflare Workers & Pages → macaniracuni → Deployments → prethodna provjerena verzija. D1 podaci ostaju; rollback frontenda ne smije brisati bazu niti mijenjati dozvole. Za API promjene čuvati kompatibilnost postojeće sheme i klijentskog reda izmjena.
