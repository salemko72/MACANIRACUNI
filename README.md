# MacaniRacuni

[Otvori aplikaciju](https://macaniracuni.salemko.workers.dev/)

Porodična evidencija devet očekivanih mjesečnih računa za Sarajevo i Nišiće. Izmjene prijema i plaćanja su nezavisne; dokument nikada nije dokaz plaćanja.

## Pokretanje i provjere

Node.js24 LTS; lokalno se koristi Microsoft Edge za browser testove.

```powershell
cd C:\MacaniRacuni
npm ci
npm run dev
```

```powershell
npm test
npm run build
npm run build:worker
npx playwright test
npm run test:ocr
```

Build priprema OCR runtime iz instaliranih verzija i službenih, verzionisanih jezičkih podataka. Prva priprema zahtijeva internet. OCR datoteke se ne spremaju u Git; `scripts/prepare-ocr.mjs` ih reproducibilno priprema u `public/ocr/`.

## Šta radi

- Mjesec, Sarajevo/Nišići filter, devet stalnih stavki, poznati iznosi i statistika.
- Na vrhu svakog ekrana datum i vrijeme učitane verzije (Europe/Sarajevo). Provjera `/version.json` bez predmemorije javlja dostupnu noviju objavu i nudi osvježavanje; datum opisuje stvarno učitani kod, a ne današnji datum.
- Ručno uređivanje, datum prijema i plaćanja, napomene, dug/preplata iz dokumenta.
- Kamera ili fotografija JPEG/PNG/WebP; PDF tekst ili OCR prve stranice. Višestrani PDF je jasno označen; ostale stranice nisu automatski obrađene.
- Glavni čitač: Cloudflare Workers AI Mistral Small 3.1 Vision, nakon porodične prijave. Fotografija ili prva PDF stranica šalje se na AI obradu; rezultat predlaže dobavljača, nekretninu, obračunski mjesec, iznos i rok. Polja se validiraju; račun se potvrđuje prije čuvanja i nikada automatski ne označava plaćenim.
- Lokalni OCR na bosanskom i engleskom ostaje dostupan kroz „Čitaj na uređaju bez AI-a” i automatski bez interneta. OCR procenat mjeri pouzdanost teksta; AI rezultatu se ne izmišlja procenat pouzdanosti.
- Fotografije zadržavaju do 3200 px / 8 megapiksela za sitni tekst; OCR ispravlja manji nagib. Nepotpuno čitanje automatski ponavlja drugim rasporedom teksta. Različiti rezultati ne spajaju se prešutno: proturječna polja ostaju za provjeru.
- Podržani su višeredni datumi i iznosi s valutom u zaglavlju kolone. Prepoznati dobavljač može koristiti već odabrani objekat; adresa dobavljača i dalje nije dokaz lokacije potrošnje.
- Pregled i korekcija prije spremanja; zaštita postojećih stvarnih unosa; prepoznavanje već priložene iste datoteke na uređaju.
- Original u IndexedDB, pregled i preuzimanje kroz detalj. AI put šalje umanjenu JPEG sliku preko privatnog API-ja na Cloudflare; lokalni OCR ne šalje dokument.
- Porodična prijava jednokratnim email kodom za privatno dozvoljene adrese; server provjerava potpisani Cloudflare Access JWT i allowlist.
- Provjera prihvata potpisani Access JWT iz zaglavlja ili aplikacijskog kolačića; povratak iz email prijave ponovo provjerava sesiju i pri vraćanju stranice iz keša preglednika. Pri vrhu se prikazuje stanje Mistrala; zelena oznaka dolazi tek nakon uspješnog autentificiranog probnog poziva modelu.
- D1 sinhronizacija podataka računa, lokalni red izmjena bez veze, automatsko spajanje nezavisnih izmjena i pregled konflikta kada se isto polje promijeni na dva uređaja.
- DEMO i porodični dio su odvojeni. Prvi porodični ulazak ne šalje DEMO iznose u bazu.
- JSON izvoz/uvoz podataka, uz validaciju i potvrdu zamjene. Originali nisu u JSON kopiji; mogu se preuzeti iz detalja.

## Uređaji i privatnost

Na iPhoneu: Safari → Dijeli → Dodaj na početni zaslon. Pregled radi bez mreže nakon prvog otvaranja; runtime OCR-a preuzima se tek pri skeniranju i može se predmemorirati na uređaju.

Originalne slike/PDF i prepoznati tekst čuvaju se na uređaju na kojem su dodani. AI obrada privremeno šalje umanjenu sliku Cloudflareu; aplikacija je ne zapisuje na server, u logove ni u AI Gateway. Porodična sinhronizacija prenosi polja računa i referencu na dokument, a ne original. Drugi uređaj jasno pokazuje ako original nije lokalno dostupan. Brisanje podataka preglednika briše lokalne originale i neposlane izmjene.

AI čitanje ima aplikacijski limit od 20 pokušaja dnevno za cijelu porodicu (UTC), uključujući neuspjele pokušaje. Cloudflareova besplatna kvota dijeli se sa drugim AI korištenjem na računu; aplikacija ne uključuje plaćeni plan niti automatski prelazi na plaćenog drugog pružaoca. Dostupnost i kvotu određuje Cloudflare. Kvalitet je provjeren stvarnim modelom na sintetičkom računu; za ocjenu konkretnih kućnih računa potrebni su stvarni primjeri.

Za porodični dio: Postavke → Prijavi porodicu. Kod dostavlja Cloudflare tek nakon što korisnik sam zatraži prijavu. Lokalni unosi ostaju odvojeni i sačuvani. Odjava je dostupna nakon slanja izmjena; briše lokalnu kopiju sinhronizovanih polja, a ne podatke na serveru. Originalne datoteke sačuvane u pregledniku ostaju na uređaju.

## Još nije uključeno

Gmail/OAuth, push podsjetnici, automatsko plaćanje, direktna provjera stanja kod dobavljača i sinhronizacija originalnih dokumenata. Ne predstavljati ove mogućnosti kao aktivne.

## Struktura

`src/domain.ts` domenski modeli i DEMO podaci; `src/scanning/` prepoznavanje, UI i lokalni dokumenti; `src/family/` klijentska sinhronizacija; `server/worker.ts` privatni API; `server/schema.sql` D1 migracija. Upute za objavu: [DEPLOYMENT.md](DEPLOYMENT.md). Originalni brief je u `brief/`.
