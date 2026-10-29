# REST API namesto GraphQL

## Kontekst in problem

Uporabniški vmesnik potrebuje operacije nad jasno določenimi viri, kot so programi, dodelitve, treningi in serije. Pri MVP ni potrebe po kompleksnih poizvedbah z dinamično izbiro polj.

## Obravnavane alternative

* REST API z JSON prek HTTP
* GraphQL API
* RPC API s specifičnimi metodami

## Sprejeta odločitev

Izbrana možnost: **"REST API z JSON prek HTTP"**, kerRrEST zadošča predvidenim virom in postopkom, je preprostejši za implementacijo ter omogoča pregledno preverjanje in testiranje dostopa na posameznih končnih točkah.

### Posledice

* **Pozitivno:** jasne HTTP metode, poti in statusne kode.
* **Pozitivno:** preprosto testiranje pravic in validacije za vsak zahtevek.
* **Negativno:** pri kompleksnejših prikazih je lahko potrebnih več zahtevkov.
* **Negativno:** različni odjemalci nimajo fleksibilnosti izbire polj, ki jo omogoča GraphQL.
