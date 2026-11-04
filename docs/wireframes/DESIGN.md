---
name: Sistem Žičnih Modelov GymTracker
colors:
  surface: '#fbf9f9'
  surface-dim: '#dbdad9'
  surface-bright: '#fbf9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#efeded'
  surface-container-high: '#e9e8e7'
  surface-container-highest: '#e3e2e2'
  on-surface: '#1b1c1c'
  on-surface-variant: '#444748'
  inverse-surface: '#303031'
  inverse-on-surface: '#f2f0f0'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c8c6c5'
  secondary: '#5e5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e3e2e2'
  on-secondary-container: '#646464'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1c1b1a'
  on-tertiary-container: '#868382'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474746'
  secondary-fixed: '#e3e2e2'
  secondary-fixed-dim: '#c7c6c6'
  on-secondary-fixed: '#1b1c1c'
  on-secondary-fixed-variant: '#464747'
  tertiary-fixed: '#e6e2df'
  tertiary-fixed-dim: '#cac6c4'
  on-tertiary-fixed: '#1c1b1a'
  on-tertiary-fixed-variant: '#484645'
  background: '#fbf9f9'
  on-background: '#1b1c1c'
  surface-variant: '#e3e2e2'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

Ta sistem žičnih modelov (wireframe) za spletno aplikacijo GymTracker se osredotoča na informacijsko arhitekturo, uporabniški tok in funkcionalno hierarhijo fitnes sledilnika. Vizualni jezik namerno odpravlja motnje, kot so barve, sence, prelivi in zapletene teksture, ter jih nadomešča z jasnimi strukturnimi linijami in nevtralnimi površinami.

Slog temelji na **brutalističnem wireframe minimalizmu**:
- 1px strukturne obrobe določajo vse komponente in vsebovalnike.
- Oznake in besedila so v celoti v slovenščini, optimizirana za hitro razumevanje vaj, serij, ponovitev in meritev.
- Nadomestna polja (placeholders) uporabljajo preproste diagonalne križe (X) ali enotna siva polnila za ponazoritev slik, video demonstracij vaj ter grafikonov napredka.
- Cilj je omogočiti osredotočeno testiranje uporabniške izkušnje (UX) pred fazo visoke vizualne ločljivosti.

## Colors

Paleta je strogo omejena na šest nevtralnih tonov sive, črne in bele barve brez kakršnih koli kromatskih odtenkov:

- **#FFFFFF (Bela / Ozadje površin)**: Osnovno ozadje strani, ozadje vnosnih polj in kartic.
- **#F5F5F5 (Svetlo siva / Površina vsebovalnikov)**: Sekundarno ozadje za strukturiranje sekcij, glave tabel in pasivne vsebovalnike.
- **#E5E5E5 (Srednje svetla siva / Polnila)**: Uporablja se za placeholder prostore, onemogočena stanja in pasivne gumbe.
- **#D4D4D4 (Siva obrobna)**: Enotna barva za vse 1px strukturne črte, okvirje tabel, ločnice in meje komponent.
- **#737373 (Nevtralna siva / Sekundarno besedilo)**: Uporablja se za pomožna besedila, merske enote (npr. »kg«, »pon.«), meta podatke in ikone z nizko prioriteto.
- **#171717 (Skoraj črna / Glavno besedilo in primarni poudarki)**: Glavna barva tipografije, primarnih gumbov in aktivnih stanj elementov.

## Typography

Tipografska hierarhija temelji na univerzalni pisavi **Inter**, z zanesljivim nadomestkom v sistemskih sans-serif pisavah (`system-ui`, `Arial`). 

Pravila rabe tipografije:
- **Naslovi (`headline-*`)**: Jasno strukturirani, krepki rezi za imena vadbenih modulov (npr. »Nadzorna plošča«, »Današnji trening: Potisk«, »Zgodovina vaj«).
- **Besedilo (`body-*`)**: Strogo berljivo, z visoko kontrastnim prikazom vrednosti teže, ponovitev in opomb o izvedbi vaje.
- **Oznake (`label-*`)**: Tehnične oznake za glave tabel (»SERIJA«, »OBREMENITEV (KG)«, »PONOVITVE«, »RPE«), stanja in gumbe. Uporabljajo se običajne ali velike tiskane črke z zmernim razmikom znakov za jasnost v kompaktnih tabelah.

## Layout & Spacing

Sistem uporablja ortogonalno mrežo s strogim 8px/4px modularnim ritmom:

- **Mreža**:
  - Mobilne naprave (< 768px): 4-stolpčna mreža, robovi 1rem (16px), razmik med stolpci 1rem (16px).
  - Tablični računalniki (768px – 1024px): 8-stolpčna mreža, robovi 1.5rem (24px), razmik med stolpci 1rem (16px).
  - Namizni računalniki (> 1024px): 12-stolpčna mreža, robovi 2rem (32px), razmik med stolpci 1.5rem (24px), z maksimalno širino vsebine 1280px.

- **Navpični ritem**:
  - Vrstice v tabelah beleženja serij imajo fiksno minimalno višino 44px za enostaven dotik med vadbo.
  - Vsebovalniki sekcij (npr. blok posamezne vaje) imajo notranji odmik `space-md` (16px) do `space-lg` (24px) ter medsebojni razmik `space-xl` (32px).

## Elevation & Depth

V skladu z načeli nizkoločljivostnega žičnega modela ta sistem **popolnoma opušča sence in zameglitve**.

Hierarhija globine se ustvarja izključno preko:
- **1px strukturnih obrob**: Uporaba `#D4D4D4` za meje kartic, tabel in modalnih oken.
- **Tonskih ravni površin**:
  - Osnovno platno: `#FFFFFF`
  - Vsebovalne kartice in plošče orodij: `#FFFFFF` z 1px obrobo `#D4D4D4`.
  - Sekundarna območja (glave stolpcev, polja za vnos podatkov, stranska navigacija): `#F5F5F5`.
- **Prekrivna okna (Modalna okna in dialogi)**:
  - Zatemnitev ozadja (backdrop) je polprevodna enotna siva barva brez zameglitve (`rgba(23, 23, 23, 0.4)`).
  - Modalno okno ima čisto belo ozadje z odebeljeno 2px obrobo `#171717` za jasen izrez iz ozadja.

## Shapes

Oblikovni jezik je dosledno **oster (Sharp, 0px polmer zaobljenosti)**. 

Vsi elementi – gumbi, vnosna polja, kartice vaj, modalna okna, stikala, označevalna polja in nadomestni vsebovalniki – imajo pravokotne kote (0px border-radius). To poudarja tehničen, diagramski značaj žičnega modela ter preprečuje prezgodnje estetske razprave o stilu zaobljenosti.

## Components

### Gumbi (Buttons)
- **Skupne lastnosti**: Ostri robovi (0px), 1px neprekinjena obroba, višina 40px (kompaktni 32px), tipografija `label-lg`, notranji odmik 0.5rem 1rem.
- **Primarni gumb**: Ozadje `#171717`, besedilo `#FFFFFF`, obroba `#171717` (npr. »Dodaj vajo«, »Zaključi trening«).
- **Sekundarni gumb**: Ozadje `#FFFFFF`, besedilo `#171717`, obroba `#171717` ali `#D4D4D4` (npr. »Dodaj serijo«, »Prekliči«).
- **Pasivni / Izbrisni gumb**: Ozadje `#F5F5F5`, besedilo `#737373`, obroba `#D4D4D4` (npr. »Odstrani«).

### Vnosna polja (Input Fields)
- **Tekstovna in številska polja**: 1px obroba `#D4D4D4`, ozadje `#FFFFFF`, barva besedila `#171717`. Oznaka polja zgoraj v `label-md` (`#737373`).
- **Fokusirano stanje**: 1px obroba `#171717`.
- **Enote**: Fiksna pripona (npr. »kg« ali »pon.«) na desni strani polja v barvi `#737373` na podlagi `#F5F5F5`.

### Označevalna polja in radijski gumbi (Checkboxes & Radios)
- **Označevalno polje (Checkbox - zaključek serije)**: Kvadrat 20x20px, 1px obroba `#171717`. Ob potrditvi se v notranjosti nariše enostavna črna kljukica ali črn notranji kvadrat (12x12px).
- **Radijski gumb**: Kvadrat 20x20px (zaradi ostrega žičnega stila) z notranjim črnim kvadratom ali krog 20x20px s črno piko v sredini.

### Kartice in sekcije vaj (Cards & Exercise Blocks)
- Bela podlaga, 1px obroba `#D4D4D4`.
- Zgornja vrstica kartice vsebuje ime vaje (`headline-sm`), meni za premikanje/brisalno ikono ter skupno statistiko vaje.
- Tabela serij znotraj kartice ima izmenične vrstice ali enostavne vodoravne 1px ločilne črte `#E5E5E5`.

### Značke in žetoni (Chips / Tags)
- Pravokotne oznake z 1px obrobo `#D4D4D4`, ozadje `#F5F5F5`, besedilo `label-sm` v `#737373` (npr. kategorije: »Prsa«, »Noge«, »Ogrevanje«, »Do odpovedi«).

### Žični nadomestki (Wireframe Placeholders)
- **Slikovni / Video placeholder**: Pravokotnik z 1px obrobo `#D4D4D4`, svetlo sivim ozadjem `#F5F5F5` in tankima diagonalnima črtama od vogala do vogala v obliki črke »X«. V središču je oznaka v `label-sm` (npr. »[Video prikaz tehnike]«).
- **Grafikonski placeholder**: Pravokotnik z vodoravnimi črtkanimi linijami in preprosto stopničasto ali lomljeno črno črto 1px, ki ponazarja graf napredka teže skozi čas.