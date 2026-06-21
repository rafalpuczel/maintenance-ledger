# Artifact 1 — Mapa terytorium (analiza historii gita)

> Analiza obszarów aktywności repozytorium Gutenberg na podstawie historii gita.
> **Zakres:** ostatnie 12 miesięcy (2025-06-09 → 2026-06-09).
> **Próbka:** 4313 commitów.
> **Metoda:** `git log --name-only` + agregacja; odfiltrowano szum (lockfile'e,
> snapshoty, generowane pliki, dotenvy, configi, `package.json`, bulk-edity ikon).

---

## 1. TOP 10 folderów / modułów

| #  | Moduł                                          | Zmiany | Obszar |
|----|------------------------------------------------|-------:|--------|
| 1  | `packages/block-editor/src/components`         | 1178   | Rdzeń edytora bloków — UI |
| 2  | `packages/editor/src/components`               | 995    | Warstwa edytora (post-aware) |
| 3  | `test/e2e/specs/editor`                         | 603    | Testy E2E edytora |
| 4  | `packages/dataviews/src/components`            | 597    | **DataViews** — nowy, gorący obszar |
| 5  | `packages/edit-site/src/components`            | 475    | Site Editor |
| 6  | `packages/block-editor/src/hooks`              | 239    | Block supports / hooki |
| 7  | `packages/block-editor/src/store`              | 232    | Stan (Redux) edytora bloków |
| 8  | `packages/media-editor/src/image-editor`       | 205    | **Media Editor** — bieżący focus |
| 9  | `packages/dataviews/src/field-types`           | 196    | DataViews — typy pól |
| 10 | `packages/block-library/src/navigation(-link)` | 370    | Blok Navigation (185+185) |

> Pominięto celowo: `packages/icons/src/library` (1327× — bulk-edity ikon) oraz
> `package.json` (202× — bumpy wersji). To artefakty mechaniczne, nie praca feature'owa.

## 2. TOP 10 plików (realny kod)

| #  | Plik | Zmiany | Co to |
|----|------|-------:|-------|
| 1  | `lib/load.php` | 89 | PHP bootstrap — centralny rejestr modułów |
| 2  | `gutenberg.php` | 86 | Główny plik wtyczki |
| 3  | `packages/editor/src/components/collab-sidebar/comments.js` | 70 | Współpraca/komentarze (od #77614 rozbity na komponenty) |
| 4  | `packages/editor/src/components/collab-sidebar/index.js` | 66 | jw. |
| 5  | `packages/core-data/src/resolvers.js` | 47 | Warstwa danych — resolvery |
| 6  | `packages/block-editor/src/store/reducer.js` | 42 | Reducer edytora bloków |
| 7  | `packages/block-editor/src/store/private-selectors.js` | 40 | Selektory (private API) |
| 8  | `packages/core-data/src/entities.js` | 34 | Definicje encji |
| 9  | `packages/sync/src/{types,manager}.ts` | 66 | Sync/RTC — real-time collab (33+33) |
| 10 | `packages/block-library/src/image/image.js` | 33 | Blok Image |

---

## 3. Podział na kwartały — jak przesuwał się nacisk pracy

Tempo rośnie liniowo: **480 → 1115 → 1233 → 1518** commitów/kwartał.

| Kwartał | Commity | #1 obszar | Charakter |
|---------|--------:|-----------|-----------|
| **Q3 2025** (cze–sie) | 480  | `dataviews/components` (82)      | DataViews + walidowane formularze |
| **Q4 2025** (wrz–lis) | 1115 | `block-editor/components` (379)  | Szeroki rozwój rdzenia, start collab/RTC |
| **Q1 2026** (gru–lut) | 1233 | `block-editor/components` (492)  | Konsolidacja rdzenia + Navigation |
| **Q2 2026** (mar–cze) | 1518 | `editor/components` (384)        | Wejście Media Editora |

### Łuk feature'ów (dotknięcia plików per temat)

| Temat            | Q3'25 | Q4'25 | Q1'26 | Q2'26 | Trend |
|------------------|------:|------:|------:|------:|-------|
| **DataViews**    | 233   | **643** | 535 | 266   | szczyt Q4, potem schodzi |
| **Collab / RTC** | 3     | **291** | 174 | 167   | nagły start Q4, stabilny |
| **Navigation**   | 22    | 173   | **280** | 129  | szczyt Q1 |
| **Media Editor** | 12    | 24    | 78  | **516** | eksplozja Q2 — bieżący front |

**Jednym zdaniem:** ciężar przesuwał się
**DataViews (Q3) → Collaboration/RTC (Q4) → rdzeń + Navigation (Q1) → Media Editor (Q2)** —
każdy kwartał wprowadzał nowy duży feature, podczas gdy poprzedni schodził do utrzymania.

---

## 4. Sprzężenia katalogów (co-change w jednym commicie)

Z odfiltrowaniem bumpów wersji i masowych zmian (>12 modułów na commit).

### Sprzężenia „proces" (kod ↔ test ↔ changelog)
- `editor/components` ↔ `test/e2e/specs` — **79**
- `block-editor/components` ↔ `test/e2e/specs` — **74**
- `backport-changelog/*` ↔ `lib/compat/wordpress-*` — **45/44** (rytuał backportu do Core)

### Sprzężenia „domena" (kohezja modułu)
- `block-editor/components` ↔ `block-editor/store` — **47**
- `block-editor/components` ↔ `editor/components` — **46** (przeciek przez warstwy!)
- `dataviews/components` ↔ `dataviews/{field-types, dataform-controls, types}` — 27–31
- `sync/manager.ts` ↔ `sync/types.ts` — **21**
- `navigation-link` ↔ `navigation-submenu` — **23**

### Najczęstsze trójki
- `dataviews/components + dataform-controls + field-types` — 18
- `block-editor/components + store + test/e2e` — 18
- `sync/manager.ts + types.ts + test` — 13
- `block-editor/components + store + editor/components` — 13

### Wnioski dla TOP 3
1. **`block-editor/components`** — sprzężony dwukierunkowo: trójka `components + store + e2e`
   pokazuje, że zmiana UI prawie zawsze pociąga reducer/selektory i test. Para z
   `editor/components` (+`private-apis.js`) to **architektoniczny punkt tarcia** —
   niższa warstwa zmienia się razem z wyższą przez prywatne API (uwaga na kierunek zależności).
2. **`editor/components`** — najsilniejsze sprzężenie z testami w całym repo (79).
   Dojrzały, dobrze otestowany moduł: praca = feature + test w jednym commicie.
3. **`dataviews/components`** — sprzężenia wyłącznie wewnątrz pakietu. Zdrowy obraz
   silnie kohezyjnego, samowystarczalnego modułu (UI ↔ typy ↔ kontrolki razem).

---

## 5. Wspólny mianownik — pliki ortogonalne do podziału na foldery

Pliki spinające najwięcej **różnych** obszarów (liczba odrębnych commitów = rozpiętość):

| Plik | Commity | Rola |
|------|--------:|------|
| `package-lock.json` | 381 | **Szum** — lockfile, ignorować |
| `package.json` (root) | 183 | **Szum** — bumpy wersji |
| **`lib/load.php`** | 85 | **Realny mianownik PHP** — centralny rejestr modułów; każdy feature PHP się tu wpina |
| `docs/.../core-blocks.md` | 153 | **Generowany** (auto z `block.json`) — szum |
| `gutenberg.php` | 86 | Główny plik wtyczki — define'y/stałe; półszum |
| **`lib/class-wp-theme-json-gutenberg.php`** | 30 | **Realny mianownik domenowy** — silnik theme.json, dotykany przy każdej zmianie stylów globalnych |

**Wniosek:** prawdziwe „wspólne mianowniki" to **`lib/load.php`** (rejestr modułów) i
**`lib/class-wp-theme-json-gutenberg.php`** (style globalne). Reszta czołówki to szum
generowany/lockfile. Pliku tłumaczeń (`.pot`/`.po`) brak w tej roli — generowany w buildzie, nie w repo.

---

## 6. Weryfikacja istnienia plików (refaktor vs usunięcie)

**Nic nie zostało skasowane na trwałe** — wszystkie „GONE" to przeniesienia/refaktory:

| Plik z analizy | Status | Gdzie teraz |
|----------------|--------|-------------|
| `collab-sidebar/comments.js` | przeniesiony | Rozbity na komponenty (#77614): `note.js`, `note-card.js`, `board-store.js` (ten sam katalog) |
| `dataviews/src/dataform-controls/` | przeniesiony | → `dataviews/src/`**`components`**`/dataform-controls/` (reorg #74188) |
| `lib/experiments-page.php` | przeniesiony | → `lib/experimental/experiments-page.php` (rename R100) |
| `.eslintrc.js` | migracja | → flat config: `eslint.config.cjs` + `tools/eslint/config.mjs` (ESLint v10) |
| `docs/.../core-blocks.md` | zmiana formatu | → auto-generowane do `core-blocks/README.md` |
| pozostałe top pliki sprzężeń | ✅ istnieją | bez zmian (block-editor/store, core-data, sync, navigation, dataviews/field-types) |

### Poprawki do rankingu (po weryfikacji)
- **collab-sidebar `comments.js`** (#3 plików) to dziś **katalog komponentów**, nie jeden plik —
  70 zmian rozproszyło się na `note*.js`.
- **`dataform-controls`** zmieniło rodzica na `components/` — para
  „dataviews/components ↔ dataform-controls" jest dziś **wewnątrz** jednego katalogu
  (jeszcze silniejsza kohezja niż sugerowała historia).
- Rdzeń sprzężeń (`block-editor/store`, `core-data`, `sync`, `navigation`,
  `dataviews/field-types`) jest **stabilny** — istnieje 1:1. Żadna analiza nie opiera się na martwym pliku.

---

## Notatka metodologiczna

- Kwartały liczone wstecz od 2026-06-09: Q3'25 (cze–sie), Q4'25 (wrz–lis), Q1'26 (gru–lut), Q2'26 (mar–cze).
- Filtr szumu: `package-lock.json`, `composer.lock`, `*.snap`, `__snapshots__`, `CHANGELOG.md`,
  `changelog.txt`, `.env`, `*.lock`, `/build/`, `/dist/`, `/vendor/`, `/node_modules/`,
  `package.json`, `tsconfig`, `/fixtures/`, `*.json`, `README.md`, `core-blocks.md`, `icons/src/library`.
- Liczby = liczba dotknięć ścieżki w commitach (proxy aktywności), nie liczba linii.
- Commity > 12 modułów pominięte w analizie sprzężeń (bumpy wersji / masowe renamy zaszumiają co-occurrence).
