# Ločeno shranjevanje načrta in izvedenih serij

## Kontekst in problem

Uporabnik ali trener lahko spremeni načrt programa, vendar morajo pretekli treningi ostati verodostojen zapis dejansko opravljenih serij. Graf napredka mora temeljiti na izvedenih, ne ciljnih vrednostih.

## Obravnavane alternative

* Ločeni `program_exercises` in `session_sets` z dejanskimi vrednostmi
* Shranjevanje zgolj sklica na trenutni načrt programa
* Prepisovanje načrta z rezultati izvedbe

## Sprejeta odločitev

Izbrana možnost: **"Ločeni `program_exercises` in `session_sets` z dejanskimi vrednostmi"**, ker zabeležene ponovitve, teže in položaji vaj ostanejo neodvisni od kasnejših sprememb programa, zato zgodovina in graf prikazujeta dejansko izvedbo.

### Posledice

* **Pozitivno:** spremembe programa ne prepišejo izvedenih rezultatov.
* **Pozitivno:** iz zaključenih treningov je mogoče izračunati največjo težo za vajo.
* **Negativno:** nekateri podatki o vajah se ponavljajo med načrtom in izvedbo.
* **Negativno:** potrebno je preverjanje, da serije pripadajo pravilnemu aktivnemu treningu.
