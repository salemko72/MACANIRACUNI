# MacaniRacuni — Codex kickoff / v0.1

## Cilj
Privatna porodična aplikacija za praćenje svih očekivanih kućnih računa po **obračunskom mjesecu**. Primarni problem: račun ne stigne ili se zaboravi platiti. Plaćanje ostaje izvan aplikacije.

## Pravila domene
- Svaki mjesec prikazuje sve aktivne, unaprijed definisane očekivane račune. Nije potrebno ponovno unositi stavke.
- Razlikovati `billing_month` (npr. 2026-09) od `received_at`, `issue_date` i `due_date`. Račun za septembar koji je stigao u oktobru pripada septembru.
- Odvojeni statusi: **primljen** (`missing`, `received`, `needs_review`) i **plaćen** (`unpaid`, `paid`, `unknown`). Prijem nije dokaz plaćanja.
- Račun može doći skeniranjem, PDF-om, Gmailom ili ručnim unosom. Ne kreirati duplikate; predložiti povezivanje na postojeću očekivanu stavku.
- Razdvojiti nekretnine: Sarajevo i vikendica Nišići/Borak. Obavijesti konfigurabilne po nekretnini i osobi.
- Dug/preplata je zasebno polje iz dokumenta; ne tvrditi da je to trenutno stanje kod dobavljača bez direktne provjere.
- Sve automatski prepoznate podatke moguće ručno ispraviti. Označiti nivo pouzdanosti i porijeklo podatka.

## Navigacija
Donja navigacija: **Mjesec**, **Statistika**, **Skeniraj** (centralno +), **Postavke**. Tap na račun otvara detalj. Strelice ili horizontalni izbor za prethodni/naredni mjesec. Filter `Sve / Sarajevo / Nišići`.

## Ekran Mjesec
- Naslov `Računi za oktobar 2026.` i izbor mjeseca.
- Sažetak: `Primljeno X/Y`, `Plaćeno X/Y`, `Nedostaje X`; finansijski sažetak samo za poznate iznose.
- Lista svih očekivanih računa, uključujući one bez dokumenta. Red: dobavljač, nekretnina, status prijema, status plaćanja, iznos ili crtica, datum dospijeća.
- Istaknuti samo akcije koje trebaju pažnju. Nikad ne zaključiti da je nešto plaćeno iz samog dolaska PDF-a.
- Opcija `Stiglo na mail` može ručno označiti prijem, ali automatska Gmail integracija dolazi kasnije.

## Ekran Račun
Dobavljač, nekretnina, obračunski mjesec, iznos, prethodni dug/preplata ako su navedeni, rok, izvor (papir/Gmail/ručno), link na dokument, zasebna dugmad `Označi kao primljen` i `Označi kao plaćen`, mogućnost korekcije i napomena.

## Ekran Statistika
Mjesečni zbir poznatih iznosa, trend po mjesecima, razlika prema prethodnom mjesecu, trend po dobavljaču, posebno upozorenje na promjenu cijena. Ne prikazivati izmišljene podatke kao stvarne. Dok podaci nedostaju, koristiti empty states.

## Vizuelni sistem
Referenca: dostavljena fotografija modernog fintech UI-a. Inspiracija paletom i tipografskom hijerarhijom, NE kopirati bankovne kartice ili raspored.
- Background: `#F4E9EF` (puder roze)
- Lilac: `#C18FB0`
- Deep purple: `#48216D`
- Soft yellow: `#EBD783`
- Petrol blue: `#32688B`
- Text: skoro crna `#19151D`; surface: `#FFF9FC`.
- Moderan grotesk font (npr. Inter ili Manrope), velik naslov mjeseca i čitljivi brojevi; zaobljene kartice, puno whitespacea, suptilni obrubi, bez rainbow ikonica, bez neumjerenih gradijenata.
- Status ne kodirati samo bojom: ikona + tekst; pristupačan kontrast.
- Mobile-first 390px, responsive desktop; dark mode kasnije.

## Tech stack
React + TypeScript + Vite. Frontend organizovati tako da API sloj može kasnije koristiti Cloudflare Workers + D1; R2 za dokumente. Za v0.1 lokalni mock repository i `localStorage` za demonstraciju izmjena, uz jasno naznačeno da nije trajna višekorisnička evidencija.

## Predloženi modeli
`Property {id,name}`
`BillTemplate {id,propertyId,providerName,category,expectedDayFrom?,expectedDayTo?,active}`
`MonthlyBill {id,templateId,billingMonth,receiptStatus,paymentStatus,amount?,currency:'BAM',dueDate?,issueDate?,receivedAt?,paidAt?,previousBalance?,balanceType?,source?,documentId?,notes?}`
`Document {id,filename,mimeType,source,uploadedAt,storageKey?,parseStatus?,confidence?}`
`BillEvent {id,monthlyBillId,type,timestamp,details}`

## Faza 1 — odmah implementirati
1. Inicijalizuj frontend projekt, čist UI i routing.
2. Implementiraj Mjesec, Račun, Statistika, plus skeniranje kao UI placeholder.
3. Seeduj DEMO podatke za 2 nekretnine i 5-8 očekivanih računa. Označi ih `DEMO`; ne prikazuj stvarne lične podatke.
4. Omogući izbor mjeseca, filter nekretnine, ručno označavanje prijema i plaćanja, izmjenu iznosa/roka, pregled statistike. Lokalno pamti demo stanje.
5. Dodaj jednostavne testove domenske logike: obračunski mjesec, novi mjesec bez kvačica, nezavisni statusi, izbjegavanje duplikata.
6. Na kraju napiši kako pokrenuti (`npm install`, `npm run dev`) i šta je mock, a šta stvarno radi.

## Faza 2 — ne implementirati bez posebne potvrde
Autentikacija i porodični nalozi, D1 migracije, R2 storage, OCR/AI extraction, Gmail OAuth, background sync, push obavijesti, pristup portalima dobavljača. Ne tražiti lozinke za Gmail ili dobavljače; koristiti službeni OAuth i minimalne dozvole gdje je moguće. Ne vršiti automatska plaćanja.

## Acceptance criteria
- Otvaranje novog mjeseca pokazuje sve očekivane stavke kao neprimljene/neplaćene, bez brisanja historije.
- Prijem i plaćanje mogu se mijenjati nezavisno.
- Račun pristigao u oktobru može pripadati septembru.
- Sarajevo i Nišići se filtriraju bez miješanja.
- Demo izgleda profesionalno na iPhone širini i desktopu.
- Nema tvrdnji o stvarnoj provjeri duga niti aktivnoj Gmail integraciji u v0.1.

## Prvi Codex zadatak
'Pročitaj ovaj dokument i implementiraj samo Fazu 1. Prije početka pregledaj postojeći repozitorij, ako postoji, i sačuvaj njegovu strukturu i funkcionalnost. Napravi dizajn prema navedenoj paleti, bez generičkog šarenog dashboarda. Nakon implementacije pokreni build/testove i prijavi rezultat, izmijenjene datoteke i sljedeće korake.'
