# PostgreSQL kot relacijska podatkovna baza

## Kontekst in problem

Podatkovni model povezuje uporabnike, sprejete povezave trener–član, programe, dneve, vaje, dodelitve in izvedene treninge. Pomembni so tuji ključi, enoličnost zaporedij in pravilnost zgodovinskih zapisov.

## Obravnavane alternative

* PostgreSQL – relacijska podatkovna baza
* Dokumentna podatkovna baza, npr. MongoDB
* Shranjevanje v lokalne datoteke

## Sprejeta odločitev

Izbrana možnost: **"PostgreSQL – relacijska podatkovna baza"**, ker relacije in omejitve referenčne integritete neposredno podpirajo predvideni model. PostgreSQL omogoča tudi strukturirano poizvedovanje za zgodovino in napredek.

### Posledice

* **Pozitivno:** tuji ključi in omejitve zmanjšajo možnost nekonsistentnih zapisov.
* **Pozitivno:** povezovalne poizvedbe omogočajo pregled dodelitev in izvedenih treningov.
* **Negativno:** pri spremembah sheme so potrebne migracije.
* **Negativno:** za lokalni razvoj je potreben zagnan podatkovni strežnik.
