# Trajne strežniške seje in JWT v pomnilniku

## Kontekst in problem

Prvotna odločitev je hranila JWT samo v pomnilniku in zahtevala ponovno prijavo po osvežitvi strani. To otežuje uporabo aplikacije med treningom. Odjava mora preklicati tudi dostop na strežniku.

## Sprejeta odločitev

Prijava ustvari strežniško sejo z absolutno veljavnostjo 30 dni. Naključen 256-bitni žeton je shranjen v trajnem piškotku `gymtracker_session` z `HttpOnly`, `SameSite=Strict` in potjo `/api/auth`; v produkciji tudi `Secure` (HTTPS). Baza hrani le SHA-256 povzetek žetona, uporabnika in rok veljavnosti v `auth_sessions`.

API še naprej uporablja enourni JWT, ki vsebuje ID strežniške seje (`sid`). JWT ostane samo v pomnilniku. Vsak zaščiten zahtevek preveri veljavno sejo in trenutno stanje uporabnika. JWT brez seje ni več veljaven.

`POST /api/auth/session` s piškotkom obnovi dostopni JWT ob ponovnem nalaganju strani in izteku dostopnega žetona. Obnova ne podaljša 30-dnevnega roka. `POST /api/auth/logout` izbriše trenutno strežniško sejo in piškotek, odjemalec pa takoj odstrani podatke iz pomnilnika. Že izdani JWT te seje je po odjavi zavrnjen; druge naprave ohranijo svoje seje. Nova prijava zamenja sejo trenutnega brskalnika.

Brskalnik pošilja piškotek z `credentials: include`. CORS dovoljuje poverilnice samo konfiguriranemu `FRONTEND_ORIGIN`. Spremembe avtentikacije zavrnejo drug `Origin` ali `Sec-Fetch-Site: cross-site`; `SameSite=Strict` dodatno omejuje piškotke. Produkcijska frontend in API morata biti na istem spletnem mestu (lahko na poddomenah), oba prek HTTPS. Razvoj uporablja `localhost` na različnih vratih, brez mešanja z `127.0.0.1`.

## Posledice

* Osvežitev strani in ponovni zagon brskalnika ohranita prijavo do izteka ali odjave.
* Gesla in žetoni niso shranjeni v localStorage ali sessionStorage; JavaScript ne more brati sejnega piškotka.
* Obnova čaka na odgovor strežnika pred preusmeritvijo zaščitene povezave. Napaka povezave omogoča ponovni poskus.
* Odjava potrebuje strežniško povezavo; neuspeh je prikazan uporabniku in omogoča ponovni poskus.
* Potrebna je migracija baze. Potekle seje se zavrnejo in ob naslednji prijavi tega uporabnika odstranijo.
* Odločitev nadomešča prvotno vedenje; stare prijave brez `sid` zahtevajo novo prijavo.
