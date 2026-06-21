# Artifact 3 — Kontrybutorzy obszarów (analiza autorstwa gita)

> Kluczowi kontrybutorzy dla 5 obszarów wskazanych jako wymagające kontaktu
> (z [`artifact-1-territory.md`](./artifact-1-territory.md) +
> [`artifact-2-structure.md`](./artifact-2-structure.md)).
> **Zakres:** ostatnie 12 miesięcy (2025-06-09 → 2026-06-09).
> **Metoda:** `git log --since --pretty="%an" -- <ścieżki>` + agregacja per obszar.
> Liczby = liczba commitów dotykających ścieżek obszaru (proxy własności).

---

## Filtrowanie botów i agentów

**Odrzuceni autorzy-boty/automatyzacje:**

| Autor | E-mail | Powód |
|-------|--------|-------|
| `Copilot` | `198982749+Copilot@users.noreply.github.com` | agent AI |
| `dependabot[bot]` | `49699333+dependabot[bot]@users.noreply.github.com` | bot |
| `Gutenberg Repository Automation` | `gutenberg@wordpress.org` | automatyzacja repo |

**Agenci jako współautorzy (`Co-authored-by`), nie odrzuceni:** `Claude` (Opus/Sonnet 4.5–4.8),
`Copilot SWE agent`, `Cursor` występują **wyłącznie** w trailerach `Co-authored-by` przy commitach,
których autorem jest człowiek. Autorstwo człowieka jest zachowane → te commity liczone po autorze-człowieku.

**Weryfikacja w 5 obszarach:** jedyny commit autorstwa bota w obrębie obszarów to **1× `Copilot`**
w `editor/components` — odfiltrowany, nie wpływa na ranking (poza czołówką).

---

## 1. `block-editor/store` — cykl `selectors ↔ private-selectors ↔ utils`

| Osoba | Commity | Tematyka aktywności → w czym pomoże |
|-------|--------:|-------------------------------------|
| **Daniel Richards** | 29 | contentOnly / templateLock, block editing modes, synced patterns, derived selectors — **owner logiki selektorów / reducera trybu edycji**. Pierwszy kontakt do rozcięcia trójkąta. |
| **George Mamadashvili** | 12 | reducer cleanup („Remove unused reducer action types"), deprecacja akcji `__unstable`, `moveBlockToPosition` — **higiena store i kontrakt akcji**. |
| **Ramon** | 8 | dotyka store przy pracy nad media — sojusznik, nie owner. |
| **tellthemachines / Aki Hamano** | 7 / 6 | style / typografia w selektorach — kontekst dla zmian cross-obszarowych. |

## 2. Wzorzec `selectors ↔ private-selectors` (core-data + block-editor/store)

| Osoba | Commity | Tematyka → w czym pomoże |
|-------|--------:|--------------------------|
| **Daniel Richards** | 19 | dominuje po obu stronach wzorca → **najlepszy adresat pytania „dług czy intencja?"** dla private-selectors. |
| **tellthemachines** | 7 | style globalne / theme.json przez selektory core-data. |
| **Ramon** | 7 | encje / resolvery core-data. |
| **Ella (ellatrix)** | 4 | rdzeniowe API edytora — perspektywa architektoniczna wzorca private-APIs. |

> **Daniel Richards** jest węzłem łączącym obszary 1 i 2 — naturalny pierwszy kontakt dla całego rdzenia store/selektorów.

## 3. `editor/components` + punkt graniczny `provider`

| Osoba | provider / cała warstwa | Tematyka → w czym pomoże |
|-------|------------------------:|--------------------------|
| **Adam Silverstein** | 8 / 21 | **lider `provider`** — punkt potrójnego sygnału (data + core-data + private-apis). Pierwszy kontakt do powierzchni mockowania / testu integracyjnego. |
| **George Mamadashvili** | 1 / 84 | **top całej warstwy** — refaktory komponentów (PostPublishButton/Panel), Notes/collab, autocompletery. Owner `editor/components`. |
| **Ella (ellatrix)** | 7 / 30 | rdzeń provider + edytor — kontekst zależności w dół. |
| **Andrew Serong** | 5 / 9 | provider + style — sprzężenie z core-data. |
| **Aki Hamano** | – / 52 | druga siła warstwy `editor/components` (UI post-aware). |

## 4. Media Editor (`media-editor`)

| Osoba | Commity (pakiet / image-editor) | Tematyka → w czym pomoże |
|-------|--------------------------------:|--------------------------|
| **Ramon** | 47 / 26 | **jednoznaczny owner** — crop/zoom, reducer crop state, math layer, shortcuts, a11y, dokumentacja. Każda praca w tym gorącym obszarze przez niego. |
| **Andrew Serong** | 16 / 6 | **drugi filar** — współpraca przy całym Media Editorze. |
| **Marco Ciampini** | 2 / – | komponenty UI (`@wordpress/components`) — wsparcie warstwy designu. |

> Wąskie grono (głównie 2 osoby) + eksplozja Q2'26 (24 → 516 dotknięć) → **najwyższe ryzyko kolizji**.
> Koordynacja z **Ramonem** jest tu obowiązkowa, nie opcjonalna.

## 5. `dataviews/components`

| Osoba | Commity | Tematyka → w czym pomoże |
|-------|--------:|--------------------------|
| **André (oandregal)** | 55 | **owner pakietu** — DataForm/DataView controls, Field API, reorganizacja kodu, stories + testy („improve stories and tests"). Adresat planu dociążenia testami (najlepszy ROI z artifact-2 §3). |
| **Nik Tsekouras** | 31 | **drugi filar** — fields (sticky/excerpt/format/content), layouty (picker/compact), revisions panel. |
| **Lena Morita** | 15 | komponenty / migracje (Stack) — jakość warstwy. |
| **Jorge Costa** | 12 | rdzeń DataViews + sprzężenie z core-data. |

---

## Dostępność — aktywność w ostatnich 90 dniach (od 2026-03-11)

Wszyscy kluczowi kontrybutorzy są **obecnie aktywni** (ostatni commit w ciągu kilku dni przed 2026-06-09):

| Osoba | Commity (90 dni) | Ostatni commit |
|-------|-----------------:|----------------|
| George Mamadashvili | 67 | 2026-06-01 |
| Ramon                | 62 | 2026-06-09 |
| Nik Tsekouras        | 52 | 2026-06-05 |
| Adam Silverstein     | 36 | 2026-06-07 |
| Andrew Serong        | 30 | 2026-06-03 |
| André (oandregal)    | 19 | 2026-06-03 |
| Daniel Richards      | 18 | 2026-06-08 |

---

## Synteza kontaktów

- **Daniel Richards** — rdzeń store + wzorzec `selectors/private-selectors` (obszary 1+2). Klucz do pytania „dług czy intencja".
- **Ramon** — całość Media Editora (obszar 4); kontakt obowiązkowy ze względu na tempo.
- **André** + **Nik Tsekouras** — DataViews (obszar 5), w tym dociążenie testami.
- **Adam Silverstein** + **George Mamadashvili** — granica `provider` / `editor/components` (obszar 3).
- **Andrew Serong** — przewija się przez obszary 3, 4 i 5 → dobry „łącznik" cross-area.

---

## Notatka metodologiczna

- Okno: `--since=2025-06-09`; okno dostępności: ostatnie 90 dni (`--since=2026-03-11`).
- Ścieżki per obszar:
  1. `packages/block-editor/src/store`
  2. `packages/{core-data/src/selectors.js, core-data/src/private-selectors.js, block-editor/src/store/selectors.js, block-editor/src/store/private-selectors.js}`
  3. `packages/editor/src/components/provider` (oraz `packages/editor/src/components` dla warstwy)
  4. `packages/media-editor/src` (oraz `.../image-editor`)
  5. `packages/dataviews/src/components`
- Liczby = liczba commitów dotykających ścieżek (proxy własności), nie liczba linii.
- Boty/agenci-autorzy odfiltrowani; agenci-współautorzy (`Co-authored-by`) zachowani pod autorem-człowiekiem.
