# GymTracker – uporabniške zgodbe

## F01 – Registracija, prijava, odjava in prikaz vsebine glede na vlogo

### US-01 – Registracija novega člana

- **Funkcionalnost:** F01
- **Uporabniška vloga:** Gost (bodoči član)
- **Uporabniška zgodba:** Kot **bodoči član** želim ustvariti uporabniški račun, da lahko uporabljam aplikacijo za beleženje treningov.

**Kriteriji sprejema:**
1. Registracijski obrazec zahteva prikazno ime, e-poštni naslov in geslo.
2. Ob uspešni registraciji sistem ustvari aktiven račun z vlogo `MEMBER`.
3. Če je e-poštni naslov že registriran, sistem registracijo zavrne in prikaže sporočilo o obstoječem računu.
4. Če obvezno polje manjka ali e-poštni naslov nima veljavne oblike, sistem ne ustvari računa in prikaže napako.
5. Geslo se v podatkovni bazi shrani kot zgoščena vrednost, ne v čisti obliki.

### US-02 – Prijava v aplikacijo

- **Funkcionalnost:** F01
- **Uporabniška vloga:** Član, trener, administrator
- **Uporabniška zgodba:** Kot **registrirani uporabnik** želim prijaviti se s svojim računom, da lahko varno dostopam do dovoljenih funkcionalnosti.

**Kriteriji sprejema:**
1. Uporabnik se lahko prijavi z registriranim e-poštnim naslovom in pravilnim geslom.
2. Ob uspešni prijavi sistem ustvari JWT za dostop do zaščitenih zahtevkov API.
3. Ob napačnem e-poštnem naslovu ali geslu sistem zavrne prijavo in prikaže sporočilo o neuspešni prijavi.
4. Deaktiviran uporabniški račun se ne more prijaviti.
5. Neprijavljen uporabnik ne more dostopati do zaščitenih podatkov prek API.

### US-03 – Odjava iz aplikacije

- **Funkcionalnost:** F01
- **Uporabniška vloga:** Član, trener, administrator
- **Uporabniška zgodba:** Kot **prijavljeni uporabnik** se želim odjaviti iz aplikacije, da se prek trenutne seje ne more več dostopati do mojih podatkov.

**Kriteriji sprejema:**
1. Prijavljenemu uporabniku je na voljo možnost »Odjava«.
2. Ob odjavi aplikacija odstrani JWT iz pomnilnika odjemalca.
3. Po odjavi uporabnika preusmeri na prijavno stran.
4. Za nadaljnji dostop do zaščitenih strani in zahtevkov je potrebna ponovna prijava.

### US-04 – Dostop glede na uporabniško vlogo

- **Funkcionalnost:** F01
- **Uporabniška vloga:** Član, trener, administrator
- **Uporabniška zgodba:** Kot **prijavljeni uporabnik** želim videti funkcionalnosti, dovoljene moji vlogi, da lahko uporabljam aplikacijo v okviru svojih pravic.

**Kriteriji sprejema:**
1. Sistem vsakemu računu dodeli natanko eno vlogo: `MEMBER`, `TRAINER` ali `ADMIN`.
2. Član vidi možnosti za svoje programe, treninge, zgodovino in napredek, ne pa možnosti za dodeljevanje programov drugim članom.
3. Trener lahko poleg svojih članskih funkcij dostopa do povabil, dodeljevanja programov in dovoljenih vpogledov v povezane člane.
4. Poskus dostopa do funkcije ali zapisa brez ustreznih pravic strežnik zavrne s statusom `403`, tudi pri neposrednem zahtevku API.
5. Uporabnik si ne more sam spremeniti vloge; vloga se določi na strežniku in je uporabnik ne more določiti v registracijskem zahtevku.

## F02 – Povezava člana s trenerjem

### US-05 – Pošiljanje povabila članu

- **Funkcionalnost:** F02
- **Uporabniška vloga:** Trener
- **Uporabniška zgodba:** Kot **trener** želim poslati povabilo članu, da lahko po njegovem soglasju sodelujeva pri načrtovanju in spremljanju treningov.

**Kriteriji sprejema:**
1. Trener lahko pošlje povabilo obstoječemu računu z vlogo `MEMBER`.
2. Novo povabilo ima status `PENDING` in vsebuje identifikatorja trenerja in člana.
3. Sistem zavrne povabilo neobstoječemu uporabniku ali uporabniku, ki nima vloge člana.
4. Sistem ne dovoli ustvariti drugega odprtega povabila `PENDING` za isti par trener–član.
5. Dokler član povabila ne sprejme, trener nima dostopa do njegove zgodovine in rezultatov.

### US-06 – Sprejem ali zavrnitev povabila

- **Funkcionalnost:** F02
- **Uporabniška vloga:** Član
- **Uporabniška zgodba:** Kot **član** želim sprejeti ali zavrniti trenerjevo povabilo, da sam odločam, kateremu trenerju omogočim vpogled v svoje treninge.

**Kriteriji sprejema:**
1. Član vidi svoja prejeta povabila s podatkom o trenerju in trenutnem statusu.
2. Za povabilo s statusom `PENDING` sta na voljo možnosti »Sprejmi« in »Zavrni«.
3. Ob sprejemu se status povezave spremeni v `ACCEPTED`, ob zavrnitvi pa v `REJECTED`.
4. Spreminjanje statusa je dovoljeno samo povabljenemu članu; zahtevek drugega uporabnika sistem zavrne.
5. Zavrnjeno povabilo trenerju ne omogoči dostopa do članovih treningov ali dodeljevanja programov.

### US-07 – Prekinitev sodelovanja s trenerjem

- **Funkcionalnost:** F02
- **Uporabniška vloga:** Član
- **Uporabniška zgodba:** Kot **član** želim prekiniti povezavo s trenerjem, da mu lahko odvzamem dostop do svojih podatkov.

**Kriteriji sprejema:**
1. Član lahko pri povezavi s statusom `ACCEPTED` izbere možnost prekinitve sodelovanja.
2. Ob potrditvi se status povezave spremeni v `REVOKED`.
3. Po prekinitvi trener ne more več pregledovati članove zgodovine ali grafa napredka.
4. Po prekinitvi trener članu ne more dodeliti novih programov.
5. Obstoječa zgodovina treningov in prej dodeljeni programi ostanejo shranjeni ter dostopni članu.

## F04 – Sestavljanje programa treninga

### US-08 – Ustvarjanje programa in njegovih dni

- **Funkcionalnost:** F04
- **Uporabniška vloga:** Član, trener
- **Uporabniška zgodba:** Kot **član ali trener** želim ustvariti program z dnevi treningov, da lahko vadbo razporedim v strukturiran načrt.

**Kriteriji sprejema:**
1. Uporabnik lahko ustvari program z obveznim imenom in neobveznim opisom.
2. Ustvarjeni program se shrani kot last uporabnika, ki ga je ustvaril (`owner_id`).
3. Uporabnik lahko programu doda več dni; vsak dan ima zaporedno številko in naziv.
4. Sistem ne dovoli dveh dni z isto zaporedno številko znotraj istega programa.
5. Uporabnik ne more spreminjati programov, katerih lastnik ni.

### US-09 – Dodajanje in razvrščanje vaj v programu

- **Funkcionalnost:** F04
- **Uporabniška vloga:** Član, trener
- **Uporabniška zgodba:** Kot **član ali trener** želim dnevu programa dodati vaje z načrtovanimi serijami in ponovitvami, da imam jasna navodila za trening.

**Kriteriji sprejema:**
1. Lastnik lahko v dan svojega programa doda vajo iz vnaprej pripravljenega kataloga vaj.
2. Vsaka dodana vaja vsebuje položaj v vrstnem redu, ciljno število serij in ciljno število ponovitev.
3. Ciljno število serij in ponovitev mora biti večje od 0; neveljavne vrednosti se zavrnejo.
4. Ciljna teža v kilogramih je neobvezna; če je vnesena, ne sme biti negativna.
5. Lastnik lahko spremeni vrstni red vaj; dve vaji v istem dnevu ne moreta imeti istega položaja.

## F05 – Dodelitev programa članu

### US-10 – Dodeljevanje programa povezanemu članu

- **Funkcionalnost:** F05
- **Uporabniška vloga:** Trener
- **Uporabniška zgodba:** Kot **trener** želim svoj program dodeliti povezanemu članu, da lahko ta trenira po pripravljenem načrtu.

**Kriteriji sprejema:**
1. Trener lahko za dodelitev izbere program, katerega lastnik je.
2. Trener lahko izbere samo člana, s katerim ima povezavo s statusom `ACCEPTED`.
3. Ob uspešni dodelitvi sistem shrani program, prejemnika, trenerja, ki ga je dodelil, in čas dodelitve.
4. Član vidi dodeljeni program in njegove dneve v svojem pregledu programov.
5. Sistem zavrne dodelitev nepovezanemu članu; član lahko prejme več različnih dodelitev programov.

## F06 – Zagon in beleženje treninga

### US-11 – Začetek treninga iz programa

- **Funkcionalnost:** F06
- **Uporabniška vloga:** Član
- **Uporabniška zgodba:** Kot **član** želim začeti trening iz izbranega dne programa, da lahko sledim načrtovanim vajam in beležim izvedbo.

**Kriteriji sprejema:**
1. Član lahko začne trening iz dneva programa, ki mu je dodeljen ali ga je ustvaril sam.
2. Pri lastnem programu sistem po potrebi ustvari dodelitev, v kateri je član hkrati prejemnik in dodeljevalec.
3. Ob začetku sistem ustvari trening s statusom `IN_PROGRESS` ter zabeleži čas začetka.
4. Prikaz treninga vsebuje vaje iz izbranega dne v določenem vrstnem redu in njihove načrtovane vrednosti.
5. Sistem zavrne zagon treninga iz programa ali dneva, do katerega član nima pravice dostopa.

### US-12 – Beleženje izvedenih serij

- **Funkcionalnost:** F06
- **Uporabniška vloga:** Član
- **Uporabniška zgodba:** Kot **član** želim med treningom zapisati dejanske ponovitve in uporabljeno težo za vsako serijo, da ohranim natančne rezultate vadbe.

**Kriteriji sprejema:**
1. Član lahko aktivnemu treningu doda serijo za vajo iz izbranega dne programa.
2. Pri seriji se shranijo vaja, njen položaj, številka serije, število ponovitev in po potrebi teža v kilogramih.
3. Število ponovitev mora biti celo število večje od 0, teža pa mora biti nenegativna, če je navedena.
4. Sistem ne dovoli dveh serij z enako številko za isti položaj vaje znotraj istega treninga.
5. Serije lahko dodaja le lastnik treninga in samo dokler ima trening status `IN_PROGRESS`.

## F07 – Zaključek in zgodovina treningov

### US-13 – Zaključek treninga in shranitev opomb

- **Funkcionalnost:** F07
- **Uporabniška vloga:** Član
- **Uporabniška zgodba:** Kot **član** želim zaključiti trening in dodati osebno opombo, da se moja izvedba shrani za kasnejši pregled.

**Kriteriji sprejema:**
1. Član lahko zaključi samo svoj trening s statusom `IN_PROGRESS`.
2. Pred zaključkom mora trening vsebovati vsaj eno veljavno shranjeno serijo.
3. Ob zaključku se status spremeni v `COMPLETED` in shrani čas zaključka.
4. Član lahko pred zaključkom doda neobvezno besedilno opombo, ki se shrani skupaj s treningom.
5. Zaključenemu treningu ni več mogoče dodajati novih serij ali ga ponovno zaključiti.

### US-14 – Pregled zgodovine izvedenih treningov

- **Funkcionalnost:** F07
- **Uporabniška vloga:** Član
- **Uporabniška zgodba:** Kot **član** želim pregledovati svoje zaključene treninge, da lahko preverim, kaj sem izvajal in katere rezultate sem dosegel.

**Kriteriji sprejema:**
1. Član vidi seznam svojih zaključenih treningov z datumom izvedbe in podatkom o dnevu programa.
2. Ob izbiri treninga se prikažejo izvedene vaje, serije, ponovitve, uporabljene teže in shranjena opomba.
3. Rezultati se prikazujejo iz dejansko shranjenih serij, ne iz ciljnih vrednosti programa.
4. Spremembe programa po zaključku treninga ne spremenijo že shranjenih rezultatov.
5. Sistem članu ne dovoli ogledovanja zgodovine drugih članov.

## F08 – Graf napredka po posamezni vaji

### US-15 – Pregled lastnega napredka po vaji

- **Funkcionalnost:** F08
- **Uporabniška vloga:** Član
- **Uporabniška zgodba:** Kot **član** želim na grafu spremljati največjo uporabljeno težo pri izbrani vaji, da lahko primerjam svoj napredek skozi čas.

**Kriteriji sprejema:**
1. Član lahko izbere vajo, za katero želi prikaz napredka.
2. Sistem za vsak zaključen trening, ki vsebuje izbrano vajo in zabeleženo težo, izračuna največjo težo med izvedenimi serijami te vaje.
3. Graf prikaže rezultate po datumih treningov v kronološkem vrstnem redu; na vodoravni osi je datum, na navpični pa teža v kilogramih.
4. Nezaključeni treningi in serije brez podatka o teži se ne upoštevajo pri izračunu največje teže.
5. Če za izbrano vajo ni ustreznih podatkov, sistem prikaže sporočilo, da napredek še ni na voljo.

### US-16 – Trenerjev vpogled v treninge in napredek člana

- **Funkcionalnost:** F08 (vpogled v rezultate; povezano tudi s F07)
- **Uporabniška vloga:** Trener
- **Uporabniška zgodba:** Kot **trener** želim pregledati zaključene treninge in graf napredka povezanega člana, da lahko ocenim izvajanje dodeljenega programa.

**Kriteriji sprejema:**
1. Trener lahko izbere člana, s katerim ima povezavo s statusom `ACCEPTED`.
2. Za izbranega povezanega člana vidi seznam zaključenih treningov in podrobnosti izvedenih serij.
3. Trener lahko izbere vajo in vidi graf največje zabeležene teže po treningih izbranega člana.
4. Trenerju brez sprejete povezave strežnik zavrne dostop do zgodovine in grafa člana, tudi ob neposrednem zahtevku API.
5. Trener ne more dodajati serij ali zaključevati treningov v imenu člana.

## Pregled pokritosti MVP

| Funkcionalnost | Uporabniške zgodbe |
|---|---|
| F01 – Registracija, prijava, odjava in vloge | US-01, US-02, US-03, US-04 |
| F02 – Povezava člana s trenerjem | US-05, US-06, US-07 |
| F04 – Sestavljanje programa | US-08, US-09 |
| F05 – Dodelitev programa | US-10 |
| F06 – Zagon in beleženje treninga | US-11, US-12 |
| F07 – Zaključek in zgodovina | US-13, US-14 |
| F08 – Graf napredka in trenerjev vpogled | US-15, US-16 |
