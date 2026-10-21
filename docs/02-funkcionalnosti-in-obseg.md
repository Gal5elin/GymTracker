# GymTracker – funkcionalnosti in obseg

## Uporabniške vloge in dovoljenja

| Vloga | Dovoljeno | Ni dovoljeno |
|---|---|---|
| **Član** | Ureja svoj profil, pregleduje katalog vaj, izdela svoje programe, sprejme povezavo s trenerjem, izvaja in beleži svoje treninge, spremlja lastni napredek | Ne vidi podatkov drugih članov; ne dodeljuje programov drugim; ne upravlja vlog ali globalnega kataloga vaj |
| **Trener** | Vse funkcije člana zase; povabi člana k sodelovanju, izdela program in ga dodeli povezanemu članu, pregleduje treninge povezanih članov | Ne vidi nepovezanih članov, ne beleži treningov v imenu člana, ne spreminja vlog in sistemskih nastavitev |
| **Administrator** | Upravlja uporabnike in vloge, deaktivira račune, ureja globalni katalog vaj | Ne prebira zasebne zgodovine treningov ali rezultatov članov in jim ne dodeljuje osebnih programov, razen če ima ločen račun z ustrezno vlogo |

**Pravila dostopa:** en račun ima eno vlogo (`MEMBER`, `TRAINER`, `ADMIN`). Novi računi so člani. Spremembo vloge izvede le administrator. Član mora izrecno sprejeti povabilo trenerja, preden trener dobi dostop do njegovih podatkov. Dostop do vseh zapisov preverja backend glede na lastništvo in povezavo s trenerjem.

## Predvidene funkcionalnosti

| ID | Funkcionalnost | Vloge | Obseg |
|---|---|---|---|
| F01 | Registracija, prijava, odjava in prikaz vsebine glede na vlogo | Vse | **MVP** |
| F02 | Povabilo člana in sprejem/zavrnitev povezave s trenerjem | Član, trener | **MVP** |
| F03 | Iskanje in filtriranje vaj po mišični skupini ter opremi | Član, trener | Predvideno |
| F04 | Sestavljanje programa z dnevi, vrstnim redom vaj in ciljnimi serijami/ponovitvami | Član, trener | **MVP** |
| F05 | Dodelitev trenerjevega programa povezanemu članu | Trener | **MVP** |
| F06 | Zagon treninga iz dneva programa in vpis dejansko izvedenih serij, ponovitev in teže | Član | **MVP** |
| F07 | Zaključek treninga, shranitev zgodovine in osebnih opomb | Član | **MVP** |
| F08 | Graf napredka po vaji (največja zabeležena teža na trening) | Član; povezani trener – vpogled | **MVP** |
| F09 | Pregled tedenske pogostosti in skupnega števila treningov | Član | Predvideno |
| F10 | Osebni cilji (npr. število treningov na teden) in status doseganja | Član | Predvideno |
| F11 | Predloge programov za ponovno uporabo | Trener | Predvideno |
| F12 | Opombe trenerja pri dodeljenem programu | Trener, povezani član | Predvideno |
| F13 | Upravljanje globalnega kataloga vaj ter deaktivacija uporabniških računov | Administrator | Predvideno |
| F14 | Koledar treningov in opomniki po e-pošti ali kot potisna obvestila. | Član | Predvideno |


## Ključni delovni proces – od programa do napredka
1. Trener pošlje povabilo članu. Član ga sprejme; povezava dobi status `ACCEPTED`.
2. Trener ustvari program z dnevi in vajami ter ga dodeli povezanemu članu.
3. Član odpre dodeljeni program, izbere dan in začne trening (`IN_PROGRESS`).
4. Za vsako vajo zabeleži dejanske serije (ponovitve, teža v kg; pri vajah brez uteži je teža lahko prazna).
5. Član zaključi trening (`COMPLETED`).
6. Sistem iz zaključenih treningov izračuna največjo težo po izbrani vaji in datumu ter jo prikaže na grafu. Povezani trener lahko pregleduje rezultate.

**Posebna pravila:** programa ni dovoljeno dodeliti nepovezanemu članu; članu ni dovoljeno spreminjati programov drugih; član lahko ima več dodelitev; aktivna izvedba treninga pripada enemu članu; pri vsaki seriji velja `reps > 0` in `weight_kg >= 0`, če je teža podana. Ob prekinitvi povezave trener izgubi dostop do članske zgodovine in ne more ustvariti novih dodelitev.

## Kasnejše nadgradnje
1. Integracija z Apple Health, Google Health Connect ali pametnimi urami.
2. Samodejna priporočila naslednjih obremenitev glede na pretekle rezultate.
3. Poročila trenerja in izvoz treningov v PDF/CSV.
4. Mobilna aplikacija z delovanjem brez internetne povezave in kasnejšo sinhronizacijo.
5. Napredna statistika: volumen treninga, osebni rekordi in trendi po mišičnih skupinah.

## Izven obsega projekta (out of scope)
- Plačila, naročnine, računi in spletna trgovina.
- Video klici in klepet v realnem času med trenerjem in članom.
- Povezovanje z nosljivimi napravami.
- Prehranski načrti, štetje kalorij ali zdravstvena diagnostika.
- Rezervacije terminov in upravljanje fizičnih fitnes centrov.

## Meje prve različice
MVP je odzivna spletna aplikacija za lokalni razvoj. Ima vnaprej pripravljen katalog vaj, preprost graf največje zabeležene teže in brez zunanjih storitev. Registrirani uporabniki so člani; račune trenerjev in administratorjev se pripravi z začetnimi podatki oziroma jih administrator dodeli.
