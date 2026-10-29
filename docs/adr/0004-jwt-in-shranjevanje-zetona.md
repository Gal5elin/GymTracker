# JWT za prijavo in žeton v pomnilniku

## Kontekst in problem

Zaščiten REST API mora prepoznati prijavljenega uporabnika. MVP predvideva lokalni razvoj brez infrastrukture za napredno upravljanje sej; ob odjavi žeton ne sme več ostati v odjemalcu.

## Obravnavane alternative

* JWT, hranjen samo v pomnilniku aplikacije
* Strežniške seje s sejno piškotno datoteko
* JWT v trajni shrambi brskalnika in osvežitveni žetoni

## Sprejeta odločitev

Izbrana možnost: **"JWT, hranjen samo v pomnilniku aplikacije"**, ker ta rešitev ustreza zasnovi MVP: API prepozna uporabnika iz JWT, odjava odstrani žeton iz pomnilnika, izognemo pa se trajnemu shranjevanju žetona na odjemalcu.

### Posledice

* **Pozitivno:** preprost dostop do zaščitenih API končnih točk.
* **Pozitivno:** žeton se ne hrani trajno v localStorage.
* **Negativno:** osvežitev strani zahteva ponovno prijavo.
* **Negativno:** brez dodatnega mehanizma ni trenutnega preklica že izdanega JWT na strežniku.
