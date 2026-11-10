# Ločeno shranjevanje načrta in izvedenih serij

## Kontekst in problem

Uporabnik ali trener lahko spremeni načrt programa, vendar morajo pretekli treningi ostati verodostojen zapis dejansko opravljenih serij. Graf napredka mora temeljiti na izvedenih, ne ciljnih vrednostih.

## Obravnavane alternative

* Ločeni `program_exercises` in `session_sets` z dejanskimi vrednostmi
* Shranjevanje zgolj sklica na trenutni načrt programa
* Prepisovanje načrta z rezultati izvedbe

## Sprejeta odločitev

Izbrana možnost: **"Ločeni `program_exercises` in `session_sets` z dejanskimi vrednostmi"**, ker zabeležene ponovitve, teže in položaji vaj ostanejo neodvisni od kasnejših sprememb programa, zato zgodovina in graf prikazujeta dejansko izvedbo.

Ob začetku treninga dodatno shranimo **verzioniran posnetek načrta v JSONB**
(`workout_sessions.plan_snapshot`). Vsebuje naziv programa in dneva, urejeno listo vaj, imena
in ciljne vrednosti. Relacijske reference ostanejo zaradi sledljivosti, prikaz aktivnega treninga
pa uporablja posnetek. Posnetek se shrani v isti transakciji kot trening in se kasneje ne posodablja
iz programa ali kataloga. Verzijo in obliko preverja strežnik. Obstoječim treningom brez posnetka
ne izmišljamo zgodovinskega načrta; njihov posnetek ostane NULL.

### Posledice

* **Pozitivno:** spremembe programa ne prepišejo izvedenih rezultatov.
* **Pozitivno:** iz zaključenih treningov je mogoče izračunati največjo težo za vajo.
* **Negativno:** nekateri podatki o vajah se ponavljajo med načrtom in izvedbo.
* **Negativno:** potrebno je preverjanje, da serije pripadajo pravilnemu aktivnemu treningu.
