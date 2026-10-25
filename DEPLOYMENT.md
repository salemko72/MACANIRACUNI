# Cloudflare objava

Javna DEMO aplikacija: https://macaniracuni.salemko.workers.dev/

Worker: `macaniracuni`. Cloudflare račun odabran je kroz povezanu integraciju. Objava koristi Workers Static Assets, HTTPS i postojeću workers.dev poddomenu. D1, R2 i serverska evidencija nisu uključeni.

## Ponovna objava kroz Cloudflare integraciju u Codexu

1. Pokrenuti `npm ci`, `npm test`, `npm run build` i `npx playwright test`.
2. Koristiti Cloudflare integraciju za postojeći Worker `macaniracuni`; ne kreirati drugi projekt.
3. Iz direktorija `dist/` pripremiti manifest `{ "/putanja": { hash, size } }`. Za hash koristiti prvih 32 heksadecimalna znaka SHA-256 sažetka base64 sadržaja i ekstenzije datoteke, dosljedno kao pri prvoj objavi.
4. Kreirati sesiju kroz `POST /accounts/{account_id}/workers/scripts/macaniracuni/assets-upload-session`.
5. Učitati tražene datoteke prema vraćenim `buckets`, koristeći privremeni JWT sesije za `POST /accounts/{account_id}/workers/assets/upload?base64=true`. Sačuvati originalne MIME tipove. Ne zapisivati JWT u repozitorij ili logove.
6. Objaviti script i assets putem `PUT /accounts/{account_id}/workers/scripts/macaniracuni`. Metadata mora sadržati completion JWT, `compatibility_date`, assets binding `ASSETS`, observability za logs i traces, te postavke assets: `html_handling: auto-trailing-slash`, `not_found_handling: single-page-application`.
7. Worker modul: `export default { fetch(request, env) { return env.ASSETS.fetch(request); } };`
8. Zadržati `workers.dev` uključen i preview URL-ove isključene. Provjeriti javnu adresu u pregledniku.

Službena referenca: https://developers.cloudflare.com/workers/static-assets/direct-upload/

Objava nije automatski povezana s GitHub pushom. Kod se čuva u GitHubu, a ove korake izvršava povezana Cloudflare integracija. Nisu dodani GitHub Actions tokeni, webhooks niti naplativi servisi.

## Testovi javne verzije

U PowerShellu:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'https://macaniracuni.salemko.workers.dev'
npx playwright test
Remove-Item Env:PLAYWRIGHT_BASE_URL
```

Testovi mijenjaju samo podatke u svojim izolovanim preglednicima. Nema zajedničke baze koju bi testovi mijenjali.

## Lokalni podaci i telefon

Podaci na localhostu i javnoj adresi su odvojeni. Za prijenos preuzeti kopiju iz lokalnih Postavki, zatim je uvesti kroz Postavke na javnoj adresi. Svaki uređaj i preglednik čuva vlastitu evidenciju.

Na iPhoneu otvoriti javnu adresu u Safariju i odabrati Dijeli → Dodaj na početni zaslon. Aplikacija radi bez mreže nakon prvog učitavanja i aktiviranja service workera.

## Povrat verzije

U Cloudflare dashboardu otvoriti Workers & Pages → macaniracuni → Deployments i vratiti prethodnu provjerenu verziju. Prva objava nema prethodnu verziju. Lokalni podaci korisnika ostaju u preglednicima, ali buduće promjene formata podataka moraju imati kompatibilnu migraciju.
