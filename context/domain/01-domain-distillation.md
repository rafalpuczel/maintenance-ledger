---
title: Domain Distillation — Maintenance Ledger
created: 2026-06-11
type: domain-distillation
---

> **Co to jest:** mapa domeny biznesowej Maintenance Ledger zdestylowana z dokumentów
> źródłowych (`prd.md` v1 / `prd-v2.md` v2 / `roadmap.md`) i skonfrontowana z kodem
> (`src/`, `supabase/migrations/`). Produkt to MAPA, nie kod. Wszystkie nazwy bytów,
> niezmienniki i numery wymagań zostały ODKRYTE z materiału źródłowego, nie założone.
> Każdy cytat to ścieżka:linia realnie zweryfikowana.

---

## KROK 0 — Kontekst projektu

**Czym jest produkt.** Maintenance Ledger zwija pipeline raportowania utrzymaniowego
agencji WordPress (notatki dev → przeformatowanie przez PM w szablonie docs → PDF → email)
w jeden przepływ w aplikacji: autor pisze raport, dostaje deterministyczny brandowany PDF,
wysyła go do PM i klienta.
> `context/foundation/prd-v2.md:24` — "Maintenance Ledger collapses the agency's
> WordPress-retainer reporting pipeline (dev notes → PM reformat in a docs template → PDF →
> email) into one in-app flow".

**Dokumenty źródłowe (znalezione).**
- `context/foundation/prd.md` — PRD v1 (greenfield MVP, 10 sekcji, FR-001..FR-021).
- `context/foundation/prd-v2.md` — PRD v2 (brownfield, delta post-MVP, US-01..US-06).
- `context/foundation/roadmap.md` — roadmapa F-01..F-02 + S-01..S-14 (wszystkie `done`).
- `context/foundation/tech-stack.md`, `infrastructure.md`, `lessons.md` — uzupełniające.
- `CLAUDE.md` (root) — load-bearing reguły platformy (PDF, Supabase, auth).

**Stack i struktura repo (ustalone).**
- Frontend: Astro 5 (strony serwerowe) + React 19 (wyspy) + Tailwind v4.
- API: trasy Astro `.ts` w `src/pages/api/**`.
- Logika biznesowa (rdzeń tej destylacji): `src/lib/<domena>/` — wzorzec `schema.ts`
  (zod) + `queries.ts` (dostęp do danych) + `form.ts` (mapper) per domena.
- PDF: `src/lib/pdf/` (FormePDF, renderowane na edge).
- Persystencja: Supabase Postgres przez `@supabase/supabase-js` po HTTP; migracje w
  `supabase/migrations/*.sql`.
- Auth: `src/lib/auth/` + `src/middleware.ts`.

**Gdzie żyje logika domenowa.** Reguły domenowe NIE są w bazie (RLS jest puste / closed-default,
brak triggerów walidujących treść). Niezmienniki egzekwuje **warstwa aplikacji** (zod schematy +
moduły `queries.ts` + trasa wysyłki). To kluczowy fakt całej mapy: domena żyje w TypeScripcie,
baza jest niemal czystym magazynem (z dwoma wyjątkami — patrz Niezmienniki #2 i #8).

**Ograniczenie destylacji.** Dokumenty wymagań są bogate i aktualne, więc Ubiquitous Language
opiera się głównie na nich + kodzie. Brak osobnej narracji domenowej poza PRD/roadmapą — co nie
jest ograniczeniem, bo PRD jest wyjątkowo szczegółowe (z sekcjami Socratic per FR).

---

## KROK 1 — Ubiquitous Language

Pojęcia odkryte z dokumentów ORAZ kodu. Każde: definicja, cytat źródłowy, miejsce w kodzie.

### Byty główne (aktorzy i agregaty)

| Pojęcie | Definicja | Cytat źródłowy | Gdzie w kodzie |
|---|---|---|---|
| **Project** (Projekt) | Klient-retainer WordPress: name, slug, url, kontakt (company/name/email), notatki wewnętrzne. Jednostka nawigacji utrzymaniowej. | `prd.md:81` FR-005 "create a project with name, slug, URL, contact (company, name, email), and internal notes" | `src/lib/projects/schema.ts:27`; tabela `supabase/migrations/20260529144131_create_projects.sql:6` |
| **Report** (Raport) | Raport utrzymaniowy per projekt per cykl: stały zestaw sekcji + 3 repeatery. | `prd.md:101` FR-014 (pełna lista sekcji); `prd.md:130` Business Logic | `src/lib/reports/schema.ts:47` (`reportInputSchema`); `queries.ts:13` (`Report`); tabela `…create_reports.sql:10` |
| **Month / Cycle** (Miesiąc/cykl) | Zamrożona etykieta cyklu "YYYY-MM" wyprowadzana SERWEROWO z daty utworzenia, nieedytowalna. | `prd.md:101` FR-014 "month (auto from date created)" | `src/lib/reports/queries.ts:47` (`currentMonth()`); kolumna `…create_reports.sql:15` |
| **Plugin Catalog** (Katalog wtyczek) | Globalne, kanoniczne źródło nazw wtyczek; pick-list + dropdown + cel auto-promocji. | `prd.md:75` FR-003 "global predefined plugins catalog … canonical source of plugin names" | `src/lib/plugins-catalog/queries.ts:20`; tabela `…create_plugin_catalog.sql:8` |
| **Recurring Plugins** (Wtyczki cykliczne) | Per-projekt lista wtyczek (junction → katalog), którą zasiewane są nowe raporty. | `prd.md:89` FR-009 "compose a project's recurring plugins list … auto-seeded as a row" | `src/lib/project-recurring-plugins/queries.ts:48`; tabela `…create_project_recurring_plugins.sql` |
| **Brand Settings** (Marka) | Pojedyncza globalna marka agencji: logo + kolory; konsumowana przy renderze PDF. | `prd.md:73` FR-002 "brand settings — upload/replace a logo and set brand colors" | `src/lib/brand-settings/queries.ts`; tabela `…create_brand_settings.sql` |
| **PM Contact** (Kontakt PM) | Wpis listy kontaktów (name + email) — picker odbiorcy "Send to PM". NIE jest kontem. | `prd.md:77` FR-004; `prd.md:158` "PMs are NOT user accounts" | `src/lib/pm-contacts/schema.ts`; tabela `…create_pm_contacts.sql` |
| **Report Send** (Wysyłka) | Niemutowalny, append-only log JEDNEJ udanej wysyłki: typ odbiorcy, email, czas, opcjonalny link do PM. | `prd.md:113` FR-019/020/021 | `src/lib/report-sends/schema.ts:12`; `queries.ts:49`; tabela `…create_report_sends.sql:10` |
| **Email Templates** (Szablony email) | Pojedynczy globalny singleton z 2 szablonami (PM + client), każdy = subject + body HTML. | `prd-v2.md:194` Slice D; `prd-v2.md:156` US-06 | `src/lib/email-templates/queries.ts:14`; tabela `…create_email_templates.sql:14` |
| **Session / Shared Credential** (Sesja/wsp. dane logowania) | Jedna para login+hasło na całą agencję; ciasteczko sesji podpisane HMAC bramkuje wszystko poza loginem. | `prd.md:69` FR-001; `prd.md:154` Access Control | `src/lib/auth/credentials.ts:50`; `session.ts`; `src/middleware.ts:6` |

### Byty wartościowe / wiersze (Value Objects)

| Pojęcie | Definicja | Cytat źródłowy | Gdzie w kodzie |
|---|---|---|---|
| **Plugin Row / Theme Row** | Wiersz repeatera: name (wymagany) + updated + from/to version. Przechowywany w jsonb raportu. | `prd.md:101` FR-014 "plugins repeater (name + updated yes/no + from/to versions)" | `src/lib/reports/schema.ts:16` (`pluginRowSchema`), `:23` (`themeRowSchema`) |
| **License Row** | Wiersz odnowienia licencji: name + status (expired/expiring) + opcjonalna data + notatki. | `prd.md:101` FR-014 "license renewals (name + status expired/expiring + optional expiry date + notes)" | `src/lib/reports/schema.ts:32` (`licenseRowSchema`) |
| **Recipient Type** | Enum {`pm`, `client`} — który przycisk Send wyprodukował wysyłkę. | `prd.md:113`/`:115` FR-019/020 | `src/lib/report-sends/schema.ts:5`; check w `…create_report_sends.sql:15` |
| **Email Token / Placeholder** | Vetted, nieprzeciekowy token `{{key}}` (project, month, month_label, agency, client_name) wstawiany przy wysyłce. | `prd-v2.md:162` US-06; `prd-v2.md:249` Non-Goal (tylko vetted) | `src/lib/email-templates/tokens.ts:14` (`EMAIL_TOKENS`) |
| **Resolved Brand** | Marka faktycznie renderowana — z fallbackiem na neutralne domyślne, gdy marka niem skonfigurowana. | `prd.md:60` FR-017 (brand consumed at render); domyślne odkryte w kodzie | `src/lib/pdf/sections.ts:78` (`resolveBrand`) |

### Operacje domenowe (czasowniki Ubiquitous Language)

| Operacja | Definicja | Cytat źródłowy | Gdzie w kodzie |
|---|---|---|---|
| **Seed (zasianie)** | Przy tworzeniu raportu repeater wtyczek jest wypełniany z listy cyklicznej projektu (kopia jednorazowa). | `prd.md:89` FR-009; `prd.md:146` "pre-populated by the project's recurring list" | `src/lib/reports/queries.ts:59` (`createReport`) |
| **Promote (auto-promocja)** | Wolnotekstowa nazwa wtyczki z wiersza raportu jest dopisywana do katalogu (idempotentnie). | `prd.md:75` FR-003 "automatically promotes that name into the catalog" | `src/lib/plugins-catalog/queries.ts:66` (`promoteToCatalog`); wołane w `reports/queries.ts:152` |
| **Render (PDF)** | Zbudowanie brandowanego PDF z raportu+marki; puste sekcje ukryte. | `prd.md:107` FR-017 | `src/lib/pdf/report-document.tsx:185`; `render.ts` |
| **Send (wysyłka)** | Wysłanie PDF do jednego odbiorcy przez Resend; zapis TYLKO po potwierdzonym dispatchu. | `prd.md:113` FR-019/020; `prd.md:65` US-01 AC | `src/pages/api/reports/[id]/send.ts:18` |
| **Resolve template (interpolacja)** | Wybór szablonu wg typu odbiorcy, wypełnienie tokenów, fallback na domyślne. | `prd-v2.md:233` Business Logic | `src/lib/email-templates/render.ts:64` (`renderTemplate`) |
| **Parse bulk-paste** | Sparsowanie tabeli WP-CLI na wiersze; fallback "cały wklej → jeden wiersz" na błąd. | `prd.md:103` FR-015 | `src/lib/wp-cli-paste/parser.ts` |
| **Throttle / verify (auth)** | Per-IP miękki throttle + peppered-HMAC weryfikacja, bramka na każdej trasie. | `prd.md:69` FR-001; NFR `prd.md:123` | `src/lib/auth/throttle.ts:25`; `credentials.ts:50`; `middleware.ts:11` |

### Stany / etykiety

| Pojęcie | Definicja | Cytat źródłowy | Gdzie w kodzie |
|---|---|---|---|
| **Empty section (pusta sekcja)** | Sekcja bez treści — UKRYTA w PDF (bez nagłówka, bez "none"). | `prd.md:46` Guardrail; FR-017 | `src/lib/pdf/sections.ts:24-60` (predykaty `show*`) |
| **Re-send state** | Po pierwszej wysyłce przycisk = "Re-send …" + timestamp; re-send wymaga potwierdzenia. | `prd.md:113` FR-019 | `src/lib/report-sends/queries.ts:30` (`summarize`); UI report-page |
| **Recent send bucket** | Identyczna wysyłka w bieżącym oknie minutowym UTC = zablokowana (anti-double-send). | Risk #3 (S-09 plan) | `report-sends/queries.ts:66` (`hasRecentSend`); idx `…report_sends_dedup.sql:13` |
| **No-leak boundary** | Artefakt do klienta (PDF + email) nie ujawnia notatek wewn. ani kontaktowego maila ponad to, co user świadomie wpisał. | `prd.md:124` NFR; `prd-v2.md:84` Guardrail | `src/lib/pdf/report-document.tsx:19`; `tokens.ts:7` |

---

## KROK 2 — Klasyfikacja subdomen: Core / Supporting / Generic

Rdzeń = to, co stanowi przewagę i SENS produktu. Sens produktu (z `prd.md:130` Business Logic):
*deterministyczny, spójny formatowo, brandowany raport zasiewany z listy cyklicznej i ukrywający
puste sekcje* — i jego **dostarczenie** do PM oraz klienta jednym kliknięciem.

| Obszar / pojęcie | Kategoria | Uzasadnienie (odwołanie do celów produktu) |
|---|---|---|
| **Report authoring + Section model** (Report, sekcje, repeatery) | **CORE** | To jest artefakt, dla którego produkt istnieje. `prd.md:22` "removes the dev → PM copy-paste step entirely — the dev authors the report in its final shape". Stała struktura sekcji to przewaga (spójność formatu). |
| **Branded PDF rendering + empty-section hiding** | **CORE** | Deterministyczny, spójny formatowo PDF to Secondary Success Criterion `prd.md:40` "every PDF … structurally identical". Empty-section hiding to twardy Guardrail `prd.md:46`. North-star (`roadmap.md:29`) nie istnieje bez tego. |
| **Send to PM + client (z re-send guard + historią)** | **CORE** | North star: `roadmap.md:29` "sends it to both the assigned PM and the client … the complete US-01 loop". To milestone walidujący cały produkt. |
| **Recurring-plugins seeding + auto-promote** | **CORE** | Bezpośrednio realizuje Secondary Success Criterion `prd.md:41` "subsequent reports start with the recurring plugin list pre-populated". To redukcja re-entry — jeden z dwóch mierzalnych celów. |
| **Email templating (per-recipient, vetted tokens)** | **CORE (post-MVP)** | Jedyna NOWA reguła domenowa rundy 2 (`prd-v2.md:231` "One domain addition"). Reszta v2 to UX. Rdzeniowa bo niesie no-leak (klient ≠ PM messaging). |
| **No-leak guarantee** (PDF + email) | **CORE (przekrojowy niezmiennik)** | Nie jest "feature", lecz twardy kontrakt zaufania klienta — `prd.md:124` NFR, rozszerzony na email `prd-v2.md:84`. Naruszenie = wyciek do klienta. |
| **WP-CLI bulk-paste parser** | **SUPPORTING** | Wspiera authoring (wygoda wprowadzania), ale produkt działa bez niego (ręczne wiersze). `prd.md:103` FR-015; fragile-by-design z fallbackiem. |
| **Plugin Catalog** (jako byt) | **SUPPORTING** | Istnieje, by nazwy były spójne i listy cykliczne miały stabilne źródło (`prd.md:76` Socratic). Służy rdzeniowi, sam nie jest celem. |
| **Brand Settings** | **SUPPORTING** | Karmi render PDF, ale to konfiguracja, nie przepływ wartości. Pojedyncza marka (per-project override jawnie parked). |
| **Projects CRUD** | **SUPPORTING** | Konieczny kontener dla raportów, lecz "mostly plumbing; low risk" (`roadmap.md:115`). Nie różnicuje produktu. |
| **PM Contact list** | **SUPPORTING** | Picker odbiorcy; "simplest CRUD surface" (`roadmap.md:151`). |
| **Shared-credential Auth + throttle** | **GENERIC** | Świadomie zminimalizowana brama (jedna para danych, brak ról/kont) — `prd.md:175` Non-Goal. To rozwiązany problem techniczny, nie domena. Per-user accounts to "the major post-MVP item" (`prd-v2.md:246`). |
| **Async UX / shared shell / redesign / responsive / a11y** (S-10, S-11) | **GENERIC** | `prd-v2.md:229` jawnie: "make NO domain-logic change — they alter how the user encounters the existing rules … not the rules themselves". Czysta warstwa prezentacji. |
| **PDF inline view** (S-12) | **GENERIC** | `roadmap.md:256` "flips content-disposition … render itself is untouched". Mechanizm dostarczenia bajtów. |
| **CI test gate** (S-14) | **GENERIC** | Infra hardening, "none (not a product/user-story slice)" `roadmap.md:276`. |

---

## KROK 3 — Kandydaci na agregaty i ich niezmienniki

Dla każdego: reguła, która MUSI być zawsze prawdziwa, cytat, oraz status egzekwowania
(**egzekwuje** / **deklaruje** / **ignoruje**).

### Agregat A: **Report** (raport jako całość; root: `reports` row)

| # | Niezmiennik | Cytat źródłowy | Status egzekwowania |
|---|---|---|---|
| 1 | **Month jest zamrożony przy utworzeniu i nigdy nie edytowalny.** | `prd.md:101` FR-014 "month (auto from date created)"; `…create_reports.sql:13` "Not user-editable" | **EGZEKWUJE (app).** `currentMonth()` ustawiany tylko w `createReport` (`reports/queries.ts:70`); `reportInputSchema` celowo NIE zawiera `month` (`schema.ts:46-47` komentarz), a `updateReport` go nie dotyka (`queries.ts:130-147`). **Baza NIE egzekwuje** — kolumna `month text` jest zwykle mutowalna; gwarancja czysto aplikacyjna. |
| 2 | **Każdy wiersz repeatera ma niepustą nazwę.** | `prd.md:101` FR-014; intencja "blank-name row is meaningless" | **EGZEKWUJE (app).** `…RowSchema` `name.min(1)` (`reports/schema.ts:17,24,33`). Baza trzyma jsonb opaque (`…create_reports.sql:31`), nie waliduje. |
| 3 | **Save jest replace-all: stan formularza w pełni zastępuje wiersze i skalary (poza month).** | `prd.md:130` Business Logic "combines the seeded recurring rows with the cycle delta"; intencja S-06 | **EGZEKWUJE (app).** `updateReport` nadpisuje wszystkie kolumny + 3 jsonb naraz (`queries.ts:131-147`). |
| 4 | **Zapisany raport zawsze potrafi wyprodukować swój PDF (inaczej save = warning, nie cichy sukces).** | `prd.md:107` FR-017 "On every Save … produces an updated branded PDF before the save completes" | **EGZEKWUJE częściowo (app).** Trasa renderuje próbnie po zapisie i zwraca warning gdy render padnie (`api/reports/[id].ts:30-40`). DEWIACJA: render jest PO zapisie i bajty są odrzucane — patrz Rozjazdy #3. |

### Agregat B: **Report Send Log** (append-only; root: zbiór `report_sends` per report)

| # | Niezmiennik | Cytat źródłowy | Status egzekwowania |
|---|---|---|---|
| 5 | **Nieudana wysyłka NIE zapisuje rekordu (no false success).** | `prd.md:65` US-01 AC "A failed email send … the send record is not written"; `prd-v2.md:85` | **EGZEKWUJE (app).** `send.ts:74-79` — dispatch w try; przy wyjątku `return actionError` PRZED `recordSend`. Zapis dopiero po sukcesie (`send.ts:82`). |
| 6 | **Rekord wysyłki jest niemutowalny (append-only).** | `…create_report_sends.sql:5` "Rows are immutable — no updated_at, no trigger" | **EGZEKWUJE (deklaratywnie, app).** Brak ścieżki UPDATE/DELETE w `report-sends/queries.ts` (tylko `insert` `:51`). Baza nie ma kolumny statusu/triggera — niemutowalność z konwencji, nie z constraintu. |
| 7 | **Odbiorca PM musi być realnym zapisanym kontaktem (nie dowolnym inputem); pm_contact_id brany z lookupu, nie z POST.** | Risk #3 (S-09 plan); intencja recipient integrity | **EGZEKWUJE (app).** `send.ts:58-63` — `getContactByEmail`, id z wyniku, "never trust the posted id". |
| 8 | **Brak podwójnej wysyłki tego samego (raport+odbiorca) w jednej minucie.** | Risk #3; `…report_sends_dedup.sql:1` | **EGZEKWUJE (app + BAZA).** Pre-check `hasRecentSend` (`send.ts:70`) + unikalny indeks `report_sends_dedup_idx` jako race-proof backstop (`…report_sends_dedup.sql:13`). **Jedyny niezmiennik treściowy egzekwowany także w bazie.** |

### Agregat C: **Plugin Catalog** (root: `plugin_catalog`)

| # | Niezmiennik | Cytat źródłowy | Status egzekwowania |
|---|---|---|---|
| 9 | **Nazwa wtyczki jest globalnie unikalna case/whitespace-insensitive (warianty kolapsują w jeden wpis).** | `prd.md:75` FR-003; `…create_plugin_catalog.sql:11` | **EGZEKWUJE (BAZA).** `name_key generated always as (lower(trim(name))) stored unique` (`…create_plugin_catalog.sql:16`) — "the DB owns the invariant — the app cannot forget". Promote używa `onConflict: name_key, ignoreDuplicates` (`plugins-catalog/queries.ts:72`). |
| 10 | **Auto-promocja nigdy nie nadpisuje notatek istniejącego wpisu; pusta nazwa pomijana.** | `prd.md:76` Socratic; intencja idempotentnego promote | **EGZEKWUJE (app).** `promoteToCatalog` skip na blank (`:67`), `ignoreDuplicates: true` (`:73`). |

### Agregat D: **Project** (root: `projects`)

| # | Niezmiennik | Cytat źródłowy | Status egzekwowania |
|---|---|---|---|
| 11 | **Slug unikalny, lowercase-kebab.** | `prd.md:81` FR-005 (slug jako identyfikator) | **EGZEKWUJE (app + BAZA).** Zod `SLUG_RE` (`projects/schema.ts:3,33`) + `slug text not null unique` (`…create_projects.sql:9`); kolizja → `SlugTakenError` (`projects/queries.ts:13`). |
| 12 | **internal_notes i contact_email to pola wewnętrzne — nie przeciekają do artefaktu klienta.** | `prd.md:124` NFR; `prd-v2.md:84` | **EGZEKWUJE (app, przez architekturę typów).** Patrz Niezmiennik przekrojowy poniżej. |

### Niezmiennik przekrojowy: **No-leak guarantee** (najwyższa wartość, najszersze ryzyko)

| # | Niezmiennik | Cytat źródłowy | Status egzekwowania |
|---|---|---|---|
| 13 | **Artefakt do klienta (PDF) NIE może zawierać internal_notes ani contact_email — jedyne client-facing free-text to `notes_to_client`.** | `prd.md:124` NFR; `prd.md:46` Guardrail | **EGZEKWUJE (app, strukturalnie).** `ReportDocumentProps` przyjmuje TYLKO `report` + `brand`, nie `project` (`report-document.tsx:19-26` "Do not widen this type to accept the project row"). Projekt fizycznie poza zasięgiem renderu — przeciek niemożliwy konstrukcyjnie. |
| 14 | **Email do klienta nie może być wektorem wycieku — tylko vetted, nieprzeciekowe tokeny; wartości HTML-escaped; body sanityzowane.** | `prd-v2.md:84` Guardrail; `prd-v2.md:249` Non-Goal; `prd-v2.md:164` AC | **EGZEKWUJE (app, warstwowo).** `EMAIL_TOKENS` celowo pomija `internal_notes`/`contact_email` (`tokens.ts:7-9`); schema odrzuca nieznane tokeny na zapisie (`email-templates/schema.ts:27-37`); render escape'uje wartości i sanityzuje body (`render.ts:42-51,82`). Trzy warstwy. |

### Niezmiennik domeny GENERIC: **Auth gate**

| # | Niezmiennik | Cytat źródłowy | Status egzekwowania |
|---|---|---|---|
| 15 | **Każda trasa poza loginem wymaga ważnej sesji.** | `prd.md:45` Guardrail "every page except the login page requires an authenticated session" | **EGZEKWUJE (app).** `middleware.ts:11` redirect na `/login` gdy `!authenticated && !isPublic`; lista publiczna zamknięta (`public-paths.ts:4`). |
| 16 | **Honest mistype (≤5 prób) nigdy nie blokuje; powyżej — rosnące, ograniczone opóźnienie.** | `prd.md:123` NFR "mistyping … three times in a row is not locked out" | **EGZEKWUJE (app).** `delayForFailures` zwraca 0 do `FREE_THRESHOLD=5`, potem bounded backoff (`throttle.ts:25-31`). |

---

## KROK 4 — Rozjazdy MODEL vs KOD

Najcenniejsza część: gdzie dokument mówi X, a kod robi Y. (Uwaga: ten projekt jest nietypowo
spójny — większość "rozjazdów" to świadome, udokumentowane dewiacje, nie błędy. Oznaczam typ.)

| # | Dokument mówi (X) | Kod robi (Y) | Dowód (plik:linia) | Typ |
|---|---|---|---|---|
| 1 | **US-03: zmiany „reflect immediately" i „roll back on error" — optimistic UI.** `prd-v2.md:121` "the affected list or row updates in place … on failure the optimistic change is rolled back" | Zaimplementowano BEZ optimistic UI — spinner-then-update, brak rollbacku (świadoma, zatwierdzona przez usera dewiacja). | `roadmap.md:352` "shipped WITHOUT optimistic UI/rollback — a deliberate, user-approved deviation from US-03's wording"; potwierdza memory [[async-ux-plan-decisions]] | **Świadoma dewiacja** (model nieaktualny vs decyzja) |
| 2 | **S-12 outcome: „keep download" — jawna ścieżka zapisu do pliku obok podglądu.** `prd-v2.md:151` AC "An explicit save-to-file path is still available" | Stronę zawężono do samego „View PDF"; zapis zostawiono kontrolce przeglądarki — brak osobnego linku download. | `roadmap.md:257` "The 'keep an explicit download path' part … was consciously dropped" | **Świadoma dewiacja** (zawężenie w planowaniu) |
| 3 | **FR-017: „produces an updated branded PDF … BEFORE the save completes" — sugeruje render-as-part-of-save.** `prd.md:107` | Save zapisuje wiersz, POTEM renderuje próbnie i ODRZUCA bajty (re-render przy pobraniu); render padnie → success-with-warning, nie błąd zapisu. | `api/reports/[id].ts:26-40` "Render the freshly-saved report (discarding the bytes …)" | **Drift semantyczny** (litera „before … completes" vs „po zapisie, best-effort"). Niski koszt — bajty i tak re-renderowane na GET. |
| 4 | **PRD/migracje deklarują RLS jako „defense in depth"; sugeruje warstwę bezpieczeństwa danych.** `…create_reports.sql:48` | RLS włączone ale BEZ POLITYK — zero wierszy dla anon/authenticated; cały dostęp idzie sb_secret_ key omijającym RLS. Realna autoryzacja danych = wyłącznie brama sesji aplikacji (Niezmiennik #15). | każda migracja `alter table … enable row level security` bez `create policy` | **Pozorny rozjazd / udokumentowany** — RLS to closed-default, nie aktywna autoryzacja. Cała kontrola dostępu żyje w `middleware.ts`. |
| 5 | **US-01 AC: „send record is not written" na błąd — ale milczy o przypadku „email poszedł, zapis padł".** `prd.md:65` | Kod wprowadza TRZECI stan nieopisany w PRD: success-with-warning „Sent, but could not record the send" (email wyszedł, historia może brakować). | `send.ts:89-96` | **Rozjazd przez pominięcie** (kod bogatszy niż model; brak w PRD luki „dispatch-ok / record-fail") |
| 6 | **FR-017 + Guardrail: empty-section hiding — sekcja pokazana, gdy „filled".** Definicja „filled" nie jest w PRD doprecyzowana per-sekcja. | Kod podejmuje decyzje biznesowe NIEZAPISANE w PRD: WP core widoczny tylko gdy jest WERSJA (sam flag „updated" nie wystarcza); PHP widoczny gdy flaga LUB wersja. To reguły domenowe ukute w kodzie. | `pdf/sections.ts:24-32` (komentarze „The 'updated' flag alone … is not meaningful enough") | **Wiedza domenowa istnieje tylko w kodzie** — kandydat do podniesienia do PRD/glosariusza. |
| 7 | **FR-012 / Open Q2: edycja po wysyłce → rozjazd sent-PDF vs stored-data (zaakceptowany).** `prd.md:98,201` | Kod faktycznie nie blokuje edycji po send (brak locka) — zgodnie z intencją, ale rozjazd danych REALNIE występuje i nic go nie sygnalizuje userowi. | `reports/queries.ts:130` (`updateReport` bez kontroli send-state); brak kolumny „locked"/„sent_version" | **Zaakceptowany trade** (model świadom; kod wierny; dług jawny w Open Q2) |
| 8 | **Roadmap Open Q3 + tech-stack: „do NOT pre-build tenancy columns"; single-tenant.** `roadmap.md:311` | Kod wierny — brak `agency_id` w każdej tabeli (jawnie odnotowane w migracjach). | `…create_projects.sql:2`, `…create_reports.sql:6` "no agency_id" | **Zgodność** (brak rozjazdu — odnotowane jako potwierdzenie dyscypliny) |

---

## KROK 5 — Ranking refaktoru

Szeregowanie kandydatów na agregaty wg **wartości** (jak rdzeniowy niezmiennik) × **ryzyka**
(jak słabo dziś egzekwowany). Wysoka wartość + słabe egzekwowanie = priorytet.

| Ranga | Agregat / niezmiennik | Wartość (rdzeniowość) | Ryzyko (słabość egzekwowania dziś) | Werdykt |
|---|---|---|---|---|
| **#1** | **Report Send Log — niezmienniki #5 (no false success) i #6 (immutability)** | NAJWYŻSZA — to north star (`roadmap.md:29`) i twardy kontrakt US-01. | ŚREDNIE-WYSOKIE. #5 egzekwowane czysto przez kolejność try/catch w jednej trasie (`send.ts`) — krucha, niezenkapsulowana; nieopisany stan „dispatch-ok/record-fail" (Rozjazd #5). #6 to TYLKO konwencja (brak ścieżki update + brak constraintu bazy). | **Refaktoruj #1.** Zamknij wysyłkę w jawnym agregacie/usłudze `ReportSendService` z explicit maszyną stanów {dispatched→recorded, dispatched→record-failed} i przenieś niemutowalność do bazy (REVOKE update/delete albo trigger). |
| **#2** | **No-leak guarantee — niezmienniki #13/#14** | NAJWYŻSZA — naruszenie = wyciek do klienta, utrata zaufania (rdzeń produktu). | NISKIE dziś (egzekwowane strukturalnie: typ renderu + 3-warstwowy email). Ryzyko to REGRESJA przy przyszłych zmianach — łatwo „poszerzyć typ" lub dodać token. | **Utrzymaj + utwardź.** Dodaj test-guard/lint, że `ReportDocumentProps` nie przyjmuje `project` i że `EMAIL_TOKENS` nie zawiera leak-fields. Wartość wysoka, ale ryzyko już dobrze opanowane → niżej niż #1. |
| **#3** | **Report — niezmiennik #1 (month frozen) i #4 (PDF-able)** | WYSOKA — month to oś cyklu; spójność formatu to Secondary Criterion. | ŚREDNIE. #1 trzyma się tylko tym, że schema „pomija" month — łatwo przypadkiem dodać do `reportInputSchema`. #4 ma drift semantyczny (Rozjazd #3). | **Utwardź zamknięcie.** Rozważ `month` jako immutable na poziomie bazy (trigger blokujący UPDATE kolumny) — przeniesienie niezmiennika z konwencji do schematu. |
| **#4** | **Reguły „filled" / empty-section (Rozjazd #6)** | ŚREDNIA — to rdzeniowy Guardrail, ale logika jest stabilna. | NISKIE technicznie, ŚREDNIE jako dług WIEDZY: reguły domenowe (co znaczy „sekcja wypełniona") żyją tylko w komentarzach kodu. | **Podnieś do języka.** Udokumentuj predykaty `show*` jako jawne reguły domenowe w glosariuszu/PRD — nie refaktor kodu, lecz destylacja wiedzy. |
| **#5** | **Plugin Catalog — niezmienniki #9/#10** | ŚREDNIA (supporting). | NAJNIŻSZE — jedyny niezmiennik treściowy w pełni egzekwowany przez bazę (`name_key … unique`). Wzorzec do naśladowania, nie do naprawy. | **Nie ruszaj.** Traktuj jako referencyjny wzorzec „DB owns the invariant" dla #1/#3. |

### Rekomendacja #1 i dlaczego

**Refaktoruj agregat Report Send Log.** To jednoczesny szczyt wartości (north star, kontrakt
US-01 „a failed send writes no record") i największa słabość egzekwowania wśród rdzeniowych
niezmienników: kluczowa reguła no-false-success utrzymuje się wyłącznie dzięki ręcznej kolejności
`try/catch` w jednej trasie HTTP (`send.ts:74-97`), niemutowalność logu jest tylko konwencją bez
constraintu bazy, a stan „email wyszedł / zapis padł" istnieje w kodzie, lecz NIE w modelu (PRD go
nie zna — Rozjazd #5). Zamknięcie tej logiki w jawnym agregacie z maszyną stanów i przeniesienie
niemutowalności do bazy domyka najdroższy do naruszenia kontrakt produktu. Katalog wtyczek (#5)
pokazuje wzorzec do skopiowania: niezmiennik, którego „the app cannot forget", bo trzyma go schemat.
