# Preverjanje pravic in soglasja na backendu

## Kontekst in problem

Član lahko vidi le svoje podatke, trener pa podatke članov, ki so njegovo povabilo sprejeli. Skrivanje gumbov v uporabniškem vmesniku ne prepreči neposrednih API zahtevkov.

## Obravnavane alternative

* Preverjanje vloge, lastništva in statusa povezave na backendu
* Preverjanje pravic samo v frontendu
* Prost trenerjev dostop do vseh članov z vlogo MEMBER

## Sprejeta odločitev

Izbrana možnost: **"Preverjanje vloge, lastništva in statusa povezave na backendu"**, ker vsak zaščiten zahtevek mora uveljaviti pravila na zaupanja vrednem strežniškem delu. Trenerjev vpogled in dodeljevanje sta dovoljena samo pri povezavi s statusom `ACCEPTED`.

### Posledice

* **Pozitivno:** neposreden klic API ne obide pravil dostopa.
* **Pozitivno:** preklic povezave `REVOKED` trenerju takoj onemogoči nadaljnji vpogled.
* **Negativno:** v vsaki relevantni operaciji je treba preveriti uporabniški kontekst.
* **Negativno:** avtorizacijski testi in poizvedbe postanejo obsežnejši.
