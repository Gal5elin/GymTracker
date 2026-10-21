# GymTracker – zasnova rešitve

## Ime rešitve
**GymTracker** – spletna aplikacija za načrtovanje in spremljanje fitnes treningov.

## Namen in problem
Ljudje, ki redno trenirajo, si pogosto zapisujejo vaje, serije, ponovitve in uporabljene teže v beležke ali preglednice. Zaradi tega težko primerjajo rezultate, sledijo načrtu treninga in ocenijo napredek. Trenerji pa težko pripravijo načrt za posameznega člana in preverijo, ali ga ta izvaja.

GymTracker na enem mestu omogoča pripravo programa treninga, beleženje izvedenih treningov in pregled napredka. Trener lahko članu dodeli program; član ga izvaja in beleži dejanske rezultate.

## Ciljni uporabniki
- **Član (vadeči):** obiskuje fitnes samostojno ali po programu trenerja; želi vedeti, kaj mora trenirati, in spremljati izboljšave.
- **Trener:** vodi več članov in jim sestavlja oziroma dodeljuje strukturirane programe vadbe.
- **Administrator:** skrbi za uporabniške račune, vloge in skupni katalog vaj.

## Kako rešitev deluje
1. Uporabnik se prijavi v spletno aplikacijo. Administrator lahko uporabniku dodeli vlogo trenerja; novi računi imajo vlogo člana.
2. Član si ustvari svoj program treninga ali sprejme program, ki mu ga dodeli trener.
3. Program vsebuje dneve treningov, vsak dan pa urejen seznam vaj s ciljnimi serijami, ponovitvami in težami (po potrebi).
4. Član začne trening na podlagi izbranega dne programa ter vnese dejanske serije, ponovitve in težo.
5. Ob zaključku treninga aplikacija shrani izvedbo. Član nato vidi zgodovino treningov in graf napredka pri posamezni vaji.
6. Trener vidi izvedene treninge le tistih članov, ki so povezavo z njim sprejeli. Administrator ne ureja osebnih treningov članov.

## Primer uporabe
Maja trenira trikrat tedensko. Trener ji dodeli program »Moč – 3 dni«. Maja v ponedeljek odpre prvi dan programa, izvede počepe in zabeleži tri serije s težo in ponovitvami. Naslednji teden v grafu preveri, ali je povečala delovno težo. Trener lahko spremlja njene zaključene treninge in po potrebi posodobi program za naslednje izvedbe.

## Cilj prve različice
Prva delujoča različica (MVP) podpira prijavo, varno upravljanje vlog, povezavo člana s trenerjem, izdelavo in dodelitev programa, izvedbo treninga ter pregled zgodovine in napredka. Ne vključuje povezav s pametnimi urami ali plačil.
