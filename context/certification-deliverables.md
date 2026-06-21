---
title: Certyfikacja 10xDevs 3.0 — co dostarczyć dla każdej odznaki
created: 2026-06-19
type: checklist
---

> Trzy odznaki, jeden formularz na blok. **Wszystkie odznaki w jednej turze / jednym
> terminie** — nie ma dorzucania później. Terminy: **5 lipca 2026** (jedyny z wyróżnieniami
> + Demo Day) / 10 sierpnia 2026 / 14 września 2026 (ostateczny), zgłoszenia do 23:59.

## Terminy (wspólne dla całej certyfikacji)

| Termin | Data (do 23:59) | Wyróżnienia / Demo Day | Feedback |
|---|---|---|---|
| 1. termin | 5 lipca 2026 | **TAK** | do 19 lipca 2026 |
| 2. termin | 10 sierpnia 2026 | nie | do 25 sierpnia 2026 |
| 3. termin (ostateczny) | 14 września 2026 | nie | do 30 września 2026 |

---

## Odznaka 1 — 10xBuilder (projekt zaliczeniowy, M1–M3)

Status: **SPEŁNIONE** (zweryfikowane w repo `10xdev-project`).

| # | Wymóg | Status | Dowód w repo |
|---|---|---|---|
| 1 | Mechanizm kontroli dostępu | ✅ | `src/middleware.ts`, `src/lib/auth/` (sesja HMAC, login, throttle, logout) |
| 2 | Zarządzanie danymi (CRUD) | ✅ | 8 encji w `src/lib/*/queries.ts` (projects, reports, plugins-catalog, pm-contacts, recurring, sends, brand, templates) + Zod |
| 3 | Logika biznesowa | ✅ | PDF-on-save, send→record gated-on-dispatch, no-leak token whitelist, recurring-seed, WP-CLI parser z fallbackiem |
| 4 | Artefakty z M1–M3 | ✅ | `context/foundation/` (prd, prd-v2, roadmap, tech-stack, test-plan) + `context/archive/` (10+ change-folderów) |
| 5 | ≥1 test kluczowego przepływu (ryzyko z test-planu) | ✅ | R1 `e2e/report-save-persistence.e2e.ts`; R2 `test/login.workers.test.ts`; R3 `test/send.workers.test.ts` |
| 6 | CI/CD (build + testy) | ✅ | `.github/workflows/ci.yml` (lint → build → astro check → vitest) na push/PR do master |

**Do formularza:** repo + wskazanie powyższych ścieżek. Publiczny deploy (Cloudflare) = mile widziany dodatek, masz.

---

## Odznaka 2 — 10xArchitect (M4, raport architektoniczny)

Status: **SPEŁNIONE** — komplet 4 artefaktów (rozłożony na 2 repo, dozwolone przez M4L5) + two-pager.

Dowodem jest **raport** (`10xdev-project/context/architect-report.md`), zbudowany z czterech artefaktów:

| Artefakt (lekcja) | Status | Plik / lokalizacja |
|---|---|---|
| **L2 — mapa repozytorium** | ✅ | `10x-dev-legacy/gutenberg/context/map/repo-map.md` (+ artifact-1/2/3) |
| **L3 — research wybranego ficzera** | ✅ | `10x-dev-legacy/gutenberg/context/changes/media-editor-flow/research.md` |
| **L4 — plan refaktoryzacji** | ✅ | `10x-dev-legacy/gutenberg/context/changes/refactor-opportunities/plan.md` (+ plan-brief) |
| **L5 — notatki o domenie (DDD)** | ✅ | `10xdev-project/context/domain/` → `01-domain-distillation.md`, `02-invariant-aggregate-refactor.md`, `03-anti-corruption-layer.md`, `event-storming-board.json` |
| **Raport (two-pager)** | ✅ | `10xdev-project/context/architect-report.md` — cytuje wszystkie 4, ma sekcję „Decyzje, które należą do mnie" |

**Uwaga:** raport jawnie opisuje, że L2/L3/L4 powstały na legacy `gutenberg`, a L5 na `10xdev-project` — to jest OK (M4L5 dopuszcza pracę na różnych repo, byle jawnie opisana).

**Do formularza:** raport (`architect-report.md`) + dostęp/zrzuty czterech artefaktów źródłowych. Najważniejsze: raport ma być **Twój, do obrony** — nie wygenerowany jednym promptem na wiarę.

---

## Odznaka 3 — 10xChampion (M5, wybrano ścieżkę L4 — rejestr artefaktów zespołowych)

Status: **SPEŁNIONE** co do artefaktu — **brakuje tylko zrzutów ekranu** do formularza.

Projekt: `@rafalpuczel/chisel-ai-toolkit` (GitHub Packages, Model 1) — `H:\localhost\test\chisel-ai-toolkit-test` (konsument) + repo źródłowe `github.com/rafalpuczel/chisel-ai-toolkit`.

| # | Wymóg (dowód) | Status | Co dokładnie |
|---|---|---|---|
| 1 | Repozytorium/rejestr, w którym przepływ istnieje | ✅ artefakt / 📸 **zrzut** | GitHub Packages + `publishConfig` + `.npmrc` mapujący scope; CI semantic-release |
| 2 | Definicja paczki (lub równoważna) | ✅ artefakt / 📸 **zrzut** | `package.json`: name, version, `bin: ai-toolkit`, `files`, `publishConfig`, `postinstall` installer, 3 skille + reguły |
| 3 | Lista wydanych wersji (UI rejestru lub CLI) | ✅ artefakt / 📸 **zrzut** | `npm view @rafalpuczel/chisel-ai-toolkit versions` → `1.0.0`, `1.0.1` |

**Zrzuty do zrobienia (3):**
1. 📸 Strona pakietu w **GitHub Packages** z listą wersji — `github.com/rafalpuczel/chisel-ai-toolkit/packages`
2. 📸 Przebieg **GitHub Actions** z jobem publikującym paczkę (publish do GitHub Packages)
3. 📸 Terminal: `npm view @rafalpuczel/chisel-ai-toolkit versions` (lub strona z listą wersji)

> Alternatywna ścieżka Champion (NIE wybrana): pipeline CI/CD do code review (M5L2–L3). Wybrałeś rejestr (L4), więc tej nie dostarczasz.

---

## Podsumowanie — gotowość

| Odznaka | Gotowość | Zostało do zrobienia |
|---|---|---|
| 10xBuilder | ✅ gotowe | nic (opcjonalnie: wskazać ścieżki w formularzu) |
| 10xArchitect | ✅ gotowe | nic (zapewnić dostęp do gutenberg artefaktów) |
| 10xChampion | ⏳ prawie | **3 zrzuty ekranu** (rejestr / pipeline / wersje) |

**Reguła zgłoszeń:** jeśli chcesz więcej niż jedną odznakę — wyślij **wszystkie formularze w tym samym terminie**. Brak możliwości uzupełniania w kolejnym.
