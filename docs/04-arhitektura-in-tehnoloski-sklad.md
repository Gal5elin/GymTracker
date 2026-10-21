# GymTracker – arhitektura in tehnološki sklad

## Pregled arhitekture
Aplikacija ima ločen **frontend** (React), **backend REST API** (Node.js/Express) in relacijsko **PostgreSQL** podatkovno bazo. Odjemalec ne dostopa neposredno do baze. Backend preverja prijavo, vlogo in lastništvo zapisov, izvaja domenska pravila ter dostopa do baze prek Prisma ORM.

## Glavni deli sistema
1. **Frontend:**
2. **Backend:**
3. **Podatkovna baza:**
4. **Avtentikacija in avtorizacija:**

## Komunikacija in primer REST API
Frontend pošilja zahtevke v obliki JSON prek HTTP (v produkciji HTTPS). Backend vrača ustrezne HTTP statuse (npr. `200`, `201`, `400`, `401`, `403`, `404`).

| Metoda in pot | Namen | Dostop |
|---|---|---|
| `POST /api/auth/register` | Registracija člana | Javno |
| `POST /api/auth/login` | Prijava | Javno |
| `GET /api/exercises` | Katalog vaj | Prijavljen uporabnik |
| `POST /api/trainer-links` | Povabilo člana | Trener |
| `PATCH /api/trainer-links/:id` | Sprejem/zavrnitev povabila | Povabljeni član |
| `POST /api/programs` | Ustvari program z dnevi in vajami | Član, trener |
| `POST /api/assignments` | Dodeli program članu | Lastnik programa (član sebi ali trener povezanemu članu) |
| `POST /api/workout-sessions` | Začni trening iz dneva programa | Član |
| `POST /api/workout-sessions/:id/sets` | Zabeleži izvedeno serijo | Lastnik treninga |
| `POST /api/workout-sessions/:id/complete` | Zaključi trening | Lastnik treninga |
| `GET /api/workout-sessions` | Zgodovina treningov | Član zase; trener le povezani člani |
| `GET /api/progress?exerciseId=...` | Največja teža po datumu in vaji | Član zase; trener le povezani člani |

Vmesnik za zgodovino in napredek prejme identiteto prijavljenega uporabnika iz žetona; morebiten `memberId` v poizvedbi backend dovoli samo trenerju s potrjeno povezavo. Backend pri zaključevanju treninga preveri prisotnost vsaj ene serije in uporabi transakcijo za zagotovitev pravilnega shranjevanja podatkov.

## Tehnološki sklad

| Del | Tehnologija | Zakaj |
|---|---|---|
| Frontend | React + TypeScript + Vite | Hiter razvoj komponentnega in odzivnega uporabniškega vmesnika |
| UI | Tailwind CSS | Enostavno oblikovanje brez kompleksne lastne CSS zasnove |
| Grafi | Recharts | Enostaven prikaz napredka po vaji |
| Backend | Node.js + Express + TypeScript | Pregleden REST API in skupen jezik s frontendom |
| Validacija | Zod | Preverjanje vhodnih JSON podatkov |
| Podatkovna baza | PostgreSQL | Relacije in integriteta povezanih zapisov |
| ORM in migracije | Prisma | Tipizirane poizvedbe, shema in migracije |
| Avtentikacija | JWT + Argon2id | Prijava na API in varno shranjena gesla |
| Lokalni razvoj | Docker Compose (PostgreSQL), npm | Ponovljiv zagon baze in frontend/backend procesov |
| Testiranje | Vitest + Supertest | Testi domenskih pravil in REST API |
| Različice kode | Git | Sledenje spremembam |

## Lokalni zagon (načrtovana struktura projekta)

```text
GymTracker/
├── docs/
│   ├── 01-zasnova-resitve.md
│   ├── 02-funkcionalnosti-in-obseg.md
│   ├── 03-podatkovni-model.md
│   └── 04-arhitektura-in-tehnoloski-sklad.md
├── frontend/
├── backend/
└── docker-compose.yml
```

Predvideni koraki po implementaciji:

1. Namesti Node.js, npm in Docker.
2. Ustvari `backend/.env` iz `backend/.env.example`, nastavi `DATABASE_URL` in `JWT_SECRET` (skrivnosti ne shrani v Git).
3. V korenu zaženi `docker compose up -d db` za PostgreSQL.
4. V `backend/` zaženi `npm install`, `npx prisma migrate dev`, ukaz za začetne podatke (`npm run seed`) in `npm run dev`.
5. V `frontend/` zaženi `npm install` in `npm run dev`; nastavi naslov API prek spremenljivke `VITE_API_URL`.
6. Odpri naslov, ki ga izpiše Vite (običajno `http://localhost:5173`).


## Arhitekturne odločitve
- **REST namesto GraphQL:** dovolj za razmeroma preproste vire (programi, serije, dodelitve) in lažji za implementacijo ter testiranje.
- **Relacijska baza:** povezave član–trener–program–trening in omejitve referenčne integritete so naravno modelirane v PostgreSQL.
- **Ločen frontend in backend:** jasna odgovornost, lažje preverjanje pravic, možnost kasnejše mobilne aplikacije na istem API.
- **JWT in avtorizacija na strežniku:** klient ne more odločati o dostopu; tudi če skrije ali prikaže določene gumbe, končno pravico preveri API. Za MVP se žeton hrani samo v pomnilniku aplikacije in se ob osvežitvi strani uporabnik ponovno prijavi; osvežitveni žetoni so kasnejša nadgradnja.
- **Zgodovinski podatki o serijah:** dejanski rezultati se hranijo ločeno od ciljev v programu, da popravki načrta ne prepišejo napredka.
- **Omejen MVP:** brez plačil, videa, zunanjih naprav in kompleksne analitike – poudarek je na delovnem procesu od dodelitve do zaključka treninga.

## Osnovna varnost in preverjanje kakovosti
- Gesla se nikoli ne shranjujejo v čisti obliki; geslo se ob prijavi preveri z Argon2id.
- Vhodi se validirajo z Zod; negativne teže in neveljavno število ponovitev se zavrnejo.
- Vsaka končna točka preveri vlogo in lastništvo podatkov; trenerjevo dovoljenje velja samo ob statusu povezave `ACCEPTED`.
- CORS je lokalno omejen na naslov frontenda, skrivnosti so v `.env`, v produkciji je obvezen HTTPS.
- Testi pokrijejo: nedovoljeno dodelitev programa, dvojno ali neveljavno beleženje serij, zaključevanje treninga brez serij in zavrnitev vpogleda nepovezanemu trenerju.
