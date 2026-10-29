# Ločen frontend in backend

## Kontekst in problem

GymTracker mora omogočati načrtovanje programov, beleženje treningov in pregled rezultatov. Podatki so vezani na posamezne uporabnike, zato je treba domenska pravila in preverjanje dovoljenj izvajati na nadzorovanem mestu. V prihodnje je predvidena tudi možnost mobilnega odjemalca.

## Obravnavane alternative

* Enotna aplikacija, v kateri se strežniški del in uporabniški vmesnik razvijata skupaj
* Ločen frontend React in backend z REST API
* Neposredni dostop odjemalca do podatkovne baze

## Sprejeta odločitev

Izbrana možnost: **"Ločen frontend React in backend z REST API"**, ker ločitev jasno razmeji prikaz podatkov od preverjanja pravic in poslovnih pravil. Isti API bo mogoče kasneje uporabiti tudi za mobilno aplikacijo.

### Posledice

* **Pozitivno:** strežnik centralno preverja lastništvo podatkov in povezavo trener–član.
* **Pozitivno:** frontend in backend se lahko razvijata in testirata ločeno.
* **Negativno:** vzdrževati je treba dva procesa in njuno komunikacijo.
* **Negativno:** potrebna je uskladitev API-vmesnika in nastavitev CORS.
