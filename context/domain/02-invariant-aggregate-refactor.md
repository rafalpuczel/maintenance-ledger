---
title: "Invariant → Aggregate Refactor Plan — Report Send Log"
created: 2026-06-11
type: refactor-plan
---

> **Co to jest:** plan refaktoru (NIE implementacja — kod produkcyjny nietknięty),
> który bierze niezmiennik #1 wyłoniony w `context/domain/01-domain-distillation.md`
> (KROK 5, ranga #1 — **Report Send Log**) i projektuje agregat-strażnika, który
> staje się JEDYNYM miejscem egzekwowania reguły „udana wysyłka ⇄ jeden niemutowalny
> rekord". Każdy cytat `plik:linia` zweryfikowany w kodzie 2026-06-11.

---

## KROK 0 — Kontekst (odziedziczony z 01-domain-distillation)

- **Produkt:** Maintenance Ledger — zwija pipeline raportowania utrzymaniowego agencji
  WordPress w jeden przepływ: autor pisze raport → deterministyczny brandowany PDF →
  wysyłka do PM i klienta. (`context/foundation/prd.md:36` Success Criteria — „send that
  PDF to a PM AND to the client".)
- **Gdzie żyje logika domenowa:** w warstwie aplikacji (TypeScript: zod + moduły
  `queries.ts` + trasy API). Baza Supabase Postgres jest niemal czystym magazynem;
  RLS jest closed-default bez polityk, więc cała autoryzacja danych = brama sesji
  (`src/middleware.ts`). To kluczowy fakt: niezmienniki treściowe NIE są w bazie —
  z jednym wyjątkiem (`plugin_catalog.name_key`, wzorzec referencyjny) i jednym
  backstopem (`report_sends_dedup_idx`).
- **North star (cel produktu):** `context/foundation/roadmap.md:29` — kompletna pętla
  US-01 (raport → PDF → wysyłka do PM i klienta). Send Log jest jej rdzeniem.
- **Stack / warstwy logiki:** Astro 5 (strony) + React 19 (wyspy) + trasy `.ts` w
  `src/pages/api/**` → moduły domenowe `src/lib/<domena>/{schema,queries}.ts` →
  Supabase po HTTP. Test runner: **vitest** (`package.json:13`), z istniejącą
  dyscypliną test-first (`/10x-tdd`, `src/lib/report-sends/queries.test.ts`).

---

## KROK 1 — Niezmienniki (potwierdzenie z 01-distillation, zawężone do wybranego agregatu)

Pełna lista 16 niezmienników jest w `01-domain-distillation.md` KROK 3. Ten plan dotyczy
**Agregatu B — Report Send Log** (`01-...:145`). Jego niezmienniki:

| # | Niezmiennik | Cytat źródłowy (zweryfikowany) |
|---|---|---|
| **5** | **Nieudana wysyłka NIE zapisuje rekordu (no false success).** | `prd.md:64` US-01 AC — „A failed email send surfaces an error in-app; the report and PDF are not affected and the send record is not written." |
| **6** | **Rekord wysyłki jest niemutowalny (append-only).** | `supabase/migrations/20260530150000_create_report_sends.sql:2` — „One row per send. Rows are immutable — no updated_at, no trigger." |
| 7 | Odbiorca PM musi być realnym zapisanym kontaktem (id z lookupu, nie z POST). | `src/pages/api/reports/[id]/send.ts:55-57` — „never trust the posted id". |
| 8 | Brak podwójnej wysyłki (raport+odbiorca) w jednej minucie UTC. | `…20260604120000_report_sends_dedup.sql:5-7`. |

Niezmienniki **#5 i #6** to rdzeń (najdroższe do naruszenia, najsłabiej egzekwowane); #7
i #8 są już dobrze trzymane (#7 przez lookup, #8 przez bazowy unikalny indeks) — wchodzą
do agregatu „przy okazji", ale nie są powodem refaktoru.

---

## KROK 2 — Klasyfikacja i wybór #1 (potwierdzenie wyboru z 01-distillation)

Trzy osie z 01-distillation (KROK 5), zawężone do wybranego agregatu:

- **(a) Rdzeniowość:** NAJWYŻSZA. Send Log realizuje north star (`roadmap.md:29`) i twardy
  kontrakt US-01 (`prd.md:64`). Bez wiarygodnej historii wysyłek produkt nie spełnia
  swojego jedynego mierzalnego celu „send to PM AND client".
- **(b) Rozsmarowanie:** ŚREDNIE. Reguła #5 żyje w JEDNEJ trasie (`send.ts:74-97`) jako
  ręczna kolejność `try/catch`. Reguła #6 żyje jako „brak ścieżki UPDATE/DELETE" w
  `queries.ts` (tylko `insert`, `:50`) plus komentarz w migracji — czyli w dwóch
  miejscach przez NIEOBECNOŚĆ kodu, co jest najsłabszą formą egzekwowania.
- **(c) Egzekwowanie:** NAJSŁABSZE wśród rdzeniowych. #5 = krucha kolejność instrukcji
  w trasie HTTP; #6 = wyłącznie konwencja (zero constraintu bazy, zero enkapsulacji).

**Wybór: Report Send Log (#5 + #6).** Jednoczesny szczyt wartości i najsłabsze
egzekwowanie = priorytet #1. (Dla kontrastu: katalog wtyczek #9 ma tę samą rdzeniowość
klasy „supporting", ale jest w pełni egzekwowany przez bazę — `plugin_catalog.name_key …
unique`, `…create_plugin_catalog.sql:16` — i służy jako wzorzec do skopiowania, nie cel
naprawy.)

---

## KROK 3 — DIAGNOZA (gdzie dziś żyje reguła, warstwa po warstwie)

### 3.1 Reguła #5 (no false success) — egzekwowana, ale krucho i nieenkapsulowanie

Cała reguła trzyma się **kolejności instrukcji w jednej trasie HTTP**:

```
src/pages/api/reports/[id]/send.ts
  :74-79   dispatch w try { sendReportEmail(...) } catch { return actionError(502) }
  :81      const sentAt = new Date().toISOString()
  :82-88   try { recordSend(...) }
  :89-97   catch { return actionOk({ message: "Sent, but could not record…", warning:true }) }
  :99-102  return actionOk({ message: "Report sent…" })
```

Co tu jest kruche:

- **Niezmiennik jest emergentny z kolejności, nie zamknięty.** „Record dopiero po
  dispatchu" wynika z tego, że linia `:82` stoi po `:76`. Każda przyszła edycja trasy
  (np. dodanie logowania, metryki, przeniesienie `recordSend` w górę dla „optymalizacji")
  może odwrócić kolejność i ciche złamać kontrakt. Nic poza recenzją PR tego nie wyłapie.
- **`recordSend` nic nie wie o dispatchu.** `report-sends/queries.ts:49` to czysty insert
  („Called only after a confirmed dispatch" — `:47` komentarz). Warunek „po confirmed
  dispatch" jest TYLKO w komentarzu i w dyscyplinie wołającego — nie w typie ani w
  podpisie. Można zawołać `recordSend` bez żadnej wysyłki i baza go przyjmie.

### 3.2 TRZECI stan, którego PRD nie zna — „dispatch-ok / record-fail"

`send.ts:89-96` wprowadza stan nieopisany w modelu: **email wyszedł, ale zapis padł** →
`actionOk({ warning:true, message:"Sent, but could not record the send." })`. To rozjazd
#5 z 01-distillation. Konsekwencja domenowa: **historia wysyłek może być niekompletna mimo
realnej wysyłki** — narusza ducha FR-021 (per-recipient send history) i otwiera dokładnie
ten footgun, przed którym FR-019/021 mają chronić (przypadkowa podwójna wysyłka, bo UI nie
pokazał pierwszej). Dziś ta dziura jest „połknięta" jako miękki warning — fail-soft tam,
gdzie kontrakt domeny chce jasnego rozróżnienia.

### 3.3 Conflation: dedup-race (23505) i record-failure są nierozróżnialne

`report-sends/queries.ts:59` eksportuje `SEND_DEDUP_VIOLATION = "23505"` z komentarzem, że
trasa ma odróżnić unikalny-violation backstopu od generic insert error. **Ale trasa tego
NIE robi** — `send.ts:89` to bezwarunkowy `catch {}`, który mapuje KAŻDĄ porażkę insertu
(w tym wyścig 23505 z `report_sends_dedup_idx`) na ten sam warning „could not record".
Migracja `…20260604120000_report_sends_dedup.sql:6-7` deklaruje to jako zamierzone
(„the loser raising 23505 (which the route maps to the existing 'sent, but could not
record' warning)") — ale skutek jest taki, że:

- przegrany wyścigu (poprawnie zablokowana DRUGA wysyłka, której rekord słusznie nie
  powstał, bo pierwszy już jest) dostaje ten sam komunikat co prawdziwa awaria zapisu
  pierwszej wysyłki;
- `SEND_DEDUP_VIOLATION` jest **martwym eksportem** — zadeklarowana intencja rozróżnienia
  nie jest egzekwowana w kodzie.

To znak, że logika żyje rozsmarowana: stała w `queries.ts`, decyzja w komentarzu migracji,
brak konsumenta w trasie.

### 3.4 Reguła #6 (immutability) — tylko deklarowana, nie egzekwowana

- **Baza:** `…create_report_sends.sql:32` włącza RLS bez polityk (closed-default), ale
  dostęp idzie kluczem `sb_secret_`, który **omija RLS**. Brak `REVOKE update/delete`,
  brak triggera blokującego UPDATE. Tabela jest fizycznie mutowalna dla warstwy aplikacji.
- **Aplikacja:** niemutowalność = „w `report-sends/queries.ts` nie ma funkcji update ani
  delete". To egzekwowanie przez NIEOBECNOŚĆ — pierwszy `await client.from("report_sends")
  .update(...)` dodany gdziekolwiek w kodzie łamie niezmiennik bez żadnego sygnału.

### 3.5 Podsumowanie diagnozy

| Niezmiennik | Warstwa egzekwująca dziś | Forma | Słabość |
|---|---|---|---|
| #5 no-false-success | trasa `send.ts` | kolejność try/catch | emergentna z kolejności, nieenkapsulowana, `recordSend` nie zna kontekstu |
| #5 — stan dispatch-ok/record-fail | trasa `send.ts:89` | bezwarunkowy catch → warning | stan poza modelem; conflated z 23505; `SEND_DEDUP_VIOLATION` martwy |
| #6 immutability | `queries.ts` (brak update/delete) + migracja (komentarz) | nieobecność kodu | zero constraintu bazy, zero enkapsulacji |

---

## KROK 4 — PROJEKT agregatu-strażnika: `ReportSendService`

### 4.1 Zasada

Wprowadź **jeden moduł domenowy** `src/lib/report-sends/service.ts` — JEDYNE miejsce, gdzie
wykonuje się sekwencja „dispatch → record". Trasa nie woła już `sendReportEmail` ani
`recordSend` bezpośrednio; woła `dispatchAndRecord(...)`, która zwraca **jawny, nazwany
wynik z maszyny stanów** (discriminated union), a nie polega na kolejności instrukcji.
Niemutowalność #6 przenosi się do **bazy** (constraint), więc app już nie musi jej „pamiętać".

To skopiowanie wzorca katalogu wtyczek („the DB owns the invariant — the app cannot forget",
`…create_plugin_catalog.sql:16`) na niezmiennik #6, plus zamknięcie #5 w usłudze.

### 4.2 Maszyna stanów wysyłki (jawna, nazwana)

```
                       ┌────────────── dispatch (sendReportEmail) ──────────────┐
                       │                                                        │
   [recent-send?]──yes─┤                                                        │
        │ no           ▼                                                        ▼
        ▼        dispatch throws                                         dispatch ok
   try dispatch  → BLOCKED_RECENT                                              │
                  (nic nie wysłano,                                            ▼
                   nic nie zapisano)        ┌──── record (insert) ────┐   record ok
                                            │                         │       │
                          DISPATCH_FAILED   ▼                         ▼       ▼
                          (nic nie wysłano, record throws 23505   record throws inne   RECORDED
                           nic nie zapisano)  → RECORDED_BY_PEER     → RECORD_FAILED   (sukces)
                                              (e-mail JUŻ był —      (e-mail wyszedł,
                                               to wyścig, nasz        rekord NIE — to
                                               drugi wysłany e-mail   prawdziwa luka
                                               to też footgun*)       historii)
```

> \* **Decyzja domenowa do potwierdzenia (Open Q):** dziś przy 23505 e-mail JUŻ został
> wysłany przez `sendReportEmail` (dispatch jest PRZED insertem), więc wyścig wysyła DRUGI
> e-mail i dopiero insert przegrywa. To znaczy, że dedup-backstop bazy NIE zapobiega
> drugiemu e-mailowi w prawdziwym wyścigu — chroni tylko historię przed duplikatem
> rekordu. Pre-check `hasRecentSend` łapie sekwencyjny double-click; współbieżny double-POST
> i tak wyśle dwa e-maile. Agregat czyni ten fakt JAWNYM (stan `RECORDED_BY_PEER`), zamiast
> chować go pod „could not record". Czy chcemy też zapobiec drugiemu e-mailowi — to osobna
> decyzja (wymagałaby rezerwacji rekordu PRZED dispatchem; patrz Faza 5 / Open Q).

### 4.3 Typy wyniku (discriminated union)

Pseudokod (`src/lib/report-sends/service.ts`):

```ts
export type SendOutcome =
  | { status: "recorded";        email: string; sentAt: string }              // #5 happy path
  | { status: "blocked_recent";  email: string }                              // #8 pre-check
  | { status: "dispatch_failed"; reason: string }                            // #5: nic nie zapisano
  | { status: "recorded_by_peer"; email: string }                           // #8 race: 23505 z dedup idx
  | { status: "record_failed";   email: string; sentAt: string };           // #5 luka: e-mail OK, rekord NIE
```

Metoda agregatu z preconditions; nielegalna sytuacja NIE aktualizuje cicho stanu — zwraca
nazwany wariant (fail-fast w sensie: każde odgałęzienie jest nazwane i obsłużone, żadne nie
„leci dalej" jako fałszywy sukces):

```ts
export interface DispatchAndRecordDeps {           // wstrzykiwane → testowalne bez I/O
  dispatch(): Promise<void>;                       // owija sendReportEmail
  alreadySentThisMinute(): Promise<boolean>;       // owija hasRecentSend
  record(): Promise<{ sentAt: string }>;           // owija recordSend; rzuca z .code na 23505
}

export async function dispatchAndRecord(deps: DispatchAndRecordDeps): Promise<SendOutcome> {
  // precondition: anti-double-send (#8) PRZED dispatchem
  if (await deps.alreadySentThisMinute()) {
    return { status: "blocked_recent", email: deps.email };
  }
  // dispatch (#5: jeśli padnie — nic nie zapisujemy, koniec)
  try {
    await deps.dispatch();
  } catch (e) {
    return { status: "dispatch_failed", reason: messageOf(e) };
  }
  // record — TYLKO po potwierdzonym dispatchu (#5 zamknięte w jednym miejscu)
  try {
    const { sentAt } = await deps.record();
    return { status: "recorded", email: deps.email, sentAt };
  } catch (e) {
    if (isUniqueViolation(e)) {                    // 23505 z report_sends_dedup_idx (#8 race)
      return { status: "recorded_by_peer", email: deps.email };
    }
    return { status: "record_failed", email: deps.email, sentAt: nowIso() };  // jawna luka
  }
}
```

To przenosi `SEND_DEDUP_VIOLATION` (`queries.ts:59`) z martwego eksportu na **realnie
konsumowaną** gałąź `isUniqueViolation` → `recorded_by_peer`, rozróżniając wyścig od
prawdziwej awarii zapisu (czego dziś trasa nie robi — diagnoza 3.3).

### 4.4 Repozytorium ładujące/zapisujące agregat (zamiast rozsianych zapytań)

Send Log jako agregat „append-only set per report" dostaje wąski interfejs repo —
ZERO ścieżki update/delete (egzekwuje #6 na poziomie typu repo, zanim jeszcze constraint
bazy go utwardzi):

```ts
// src/lib/report-sends/queries.ts — istniejące funkcje, zebrane jako jeden „repo"
export interface SendLogRepo {
  append(input: SendRecordInput): Promise<{ sentAt: string }>;   // = dziś recordSend (zwraca sent_at)
  hasRecentSend(reportId: string, email: string): Promise<boolean>;
  getSummary(reportId: string): Promise<SendSummary>;            // = dziś getSendSummary
  // CELOWO brak update()/remove() — niezmiennik #6 jako kształt API.
}
```

Uwaga: agregat send-log NIE jest atomowy z dispatchem (e-mail to efekt zewnętrzny, nie
da się go cofnąć w transakcji). Dlatego niezmiennik #5 NIE jest „wszystko w jednej
transakcji", lecz „**rekord powstaje wyłącznie po nieodwracalnie potwierdzonym dispatchu**"
— sekwencja, nie transakcja. To świadome i poprawne (e-mail jest poza granicą transakcyjną).
Atomowość, której tu potrzebujemy, dotyczy tylko #8 (jeden rekord per minuta) i ją już daje
unikalny indeks bazy.

### 4.5 Cienka trasa (parse → metoda agregatu → mapowanie na odpowiedź)

`send.ts` kurczy się: rozwiązuje odbiorcę (#7, bez zmian — to już jest dobrze), buduje
`deps` i woła `dispatchAndRecord`, po czym MAPUJE `SendOutcome` na `actionOk/actionError`.
Cała logika „kiedy zapisać" znika z trasy:

```ts
const outcome = await dispatchAndRecord(deps);
switch (outcome.status) {
  case "recorded":
    return actionOk({ message: recipientType === "pm" ? "Report sent to the PM." : "Report sent to the client.",
                      data: { recipientType, email: outcome.email, sentAt: outcome.sentAt } });
  case "recorded_by_peer":      // wyścig: pierwszy rekord istnieje, historia spójna
    return actionOk({ message: "Already sent just now.", data: { recipientType, email: outcome.email } });
  case "blocked_recent":
    return actionError({ error: "Already sent just now — re-send is blocked for a moment" });
  case "dispatch_failed":
    return actionError({ error: "Could not send the email" }, 502);
  case "record_failed":         // jedyny prawdziwy „dispatch-ok/record-fail" — jawny warning
    return actionOk({ message: "Sent, but could not record the send.", warning: true,
                      data: { recipientType, email: outcome.email, sentAt: outcome.sentAt } });
}
```

Egzekwowanie przenosi się z „kolejności w trasie" do nazwanej maszyny stanów; trasa staje
się czystym adapterem HTTP. (Tu egzekwowanie NIE przenosi się z klienta na serwer — bo #5
już dziś jest serwerowe; przenosi się z *implicytnej kolejności* na *jawny kontrakt typu*.)

### 4.6 Utwardzenie #6 w bazie (nowa migracja)

Nowa migracja `supabase/migrations/<ts>_report_sends_immutable.sql`: odbierz prawo modyfikacji
log-u warstwie aplikacji, tak by „the app cannot forget":

```sql
-- Report sends are append-only (invariant #6). The app reaches this table via the
-- sb_secret_ key, which bypasses RLS — so RLS policies cannot enforce immutability.
-- A row-level trigger that raises on UPDATE/DELETE is the backstop that holds even
-- if app code ever adds an update path. INSERT stays open (the append path).
create or replace function public.report_sends_block_mutation()
  returns trigger language plpgsql as $$
begin
  raise exception 'report_sends rows are immutable (append-only send log)';
end;
$$;

create trigger report_sends_no_update_delete
  before update or delete on public.report_sends
  for each row execute function public.report_sends_block_mutation();
```

> Rozważ także `revoke update, delete on public.report_sends from <app-role>` jako drugą
> warstwę — ale ponieważ `sb_secret_` mapuje na rolę o szerokich prawach, trigger jest
> pewniejszym, deklaratywnym strażnikiem (działa niezależnie od roli). `on delete cascade`
> z `reports` (`…create_report_sends.sql:12`) wymaga uwagi: kasowanie raportu MUSI nadal
> kaskadować — trigger `for each row … on delete` zablokowałby kaskadę. **Dlatego trigger
> obejmuje tylko `update`** (lub: pozwól delete tylko w kontekście kaskady). To dopięcie
> Fazy 5 — patrz testy nielegalnych operacji.

---

## KROK 5 — Before/after, plan faz, testy, nazwy

### 5.1 Before / after dla każdego dzisiejszego miejsca reguły

| Miejsce dziś | BEFORE | AFTER |
|---|---|---|
| `send.ts:74-97` | reguła #5 = ręczna kolejność try/catch w trasie; trasa zna „kiedy zapisać" | trasa woła `dispatchAndRecord(deps)` i mapuje `SendOutcome`; nie zna kolejności |
| `send.ts:89` bezwarunkowy catch | 23505 (wyścig) i prawdziwa awaria zapisu → ten sam warning | `recorded_by_peer` vs `record_failed` — rozróżnione |
| `queries.ts:59` `SEND_DEDUP_VIOLATION` | eksport martwy, nikt nie konsumuje | konsumowany w `isUniqueViolation` → `recorded_by_peer` |
| `queries.ts:49` `recordSend` | „called only after dispatch" tylko w komentarzu | owinięte w `SendLogRepo.append`; precondition w usłudze, nie w komentarzu |
| #6 immutability | brak constraintu; „brak funkcji update" w app | trigger bazy `report_sends_no_update_delete` + repo bez `update()/remove()` |
| `send.ts` jako całość | trasa = logika domeny + adapter HTTP | trasa = cienki adapter; logika w `service.ts` |

### 5.2 Plan faz (test-first tam, gdzie się da — projekt ma dyscyplinę `/10x-tdd`)

- **Faza 1 — `SendOutcome` + `dispatchAndRecord` (TEST-FIRST).** Czysta funkcja z
  wstrzykiwanymi `deps` (brak I/O) → idealna pod vitest, jak istniejące `summarize`
  (`queries.test.ts`). RED: testy wszystkich pięciu gałęzi maszyny stanów. GREEN: minimalna
  implementacja. *Import siblings relatywnie (`./schema`, `./queries`), nie przez `@/` —
  lekcja „Vitest has no `@/` alias" (`lessons.md:33`).*
- **Faza 2 — `SendLogRepo` (refaktor, nie-TDD).** Zebranie `recordSend`/`hasRecentSend`/
  `getSendSummary` za jeden interfejs bez update/delete; `append` zwraca `sentAt`. Brak
  zmiany zachowania → `/10x-implement`, nie TDD.
- **Faza 3 — przepięcie trasy (refaktor, nie-TDD).** `send.ts` woła `dispatchAndRecord`
  i mapuje wynik; usuń inline try/catch. Zachowanie zewnętrzne identyczne dla istniejących
  ścieżek; nowość = `recorded_by_peer` mapowane na czysty `actionOk` zamiast warningu.
- **Faza 4 — migracja immutability (TEST-FIRST na poziomie DB).** RED: test integracyjny
  (workerd/`vitest.workers.config.ts` lub skrypt migracyjny z Node), że `update`/`delete`
  pojedynczego wiersza rzuca, a `insert` i kaskada z `reports` nadal działają. GREEN:
  trigger z 4.6. *Po `db:types` sanityzuj plik — lekcja „supabase gen types pollutes"
  (`lessons.md:26`); trigger nie zmienia typów, ale to nawyk gate'u.*
- **Faza 5 — decyzja o drugim e-mailu w wyścigu (Open Q, opcjonalnie).** Jeśli zespół chce
  zapobiec DRUGIEMU e-mailowi (nie tylko duplikatowi rekordu), odwróć kolejność na
  „reserve record → dispatch → confirm" z rekordem-rezerwacją. To zmienia model US-01
  (rekord przed potwierdzonym dispatchem) — wymaga aktualizacji PRD, więc świadomie
  oddzielone od Faz 1–4. Domyślnie: NIE robić w tym refaktorze; tylko odnotować.

Każda faza kończy się pełnym `npm run lint` + `npm test` ocenianym po **exit code**, nie
po grepie (lekcja `lessons.md:7`), oraz `npx astro check`.

### 5.3 Przypadki testowe niezmiennika (legalne i nielegalne)

**`dispatchAndRecord` (Faza 1, jednostkowe):**
- dispatch ok + record ok → `recorded` (happy path #5).
- dispatch rzuca → `dispatch_failed`; `record` NIE wołane (asercja: `deps.record` nie
  dotknięte) — twardy dowód #5 „failed send writes no record".
- record rzuca 23505 → `recorded_by_peer` (#8 wyścig odróżniony od awarii).
- record rzuca inny błąd → `record_failed` (jedyny prawdziwy dispatch-ok/record-fail).
- `alreadySentThisMinute` = true → `blocked_recent`; ani dispatch, ani record nie wołane (#8 pre-check).

**Migracja immutability (Faza 4, integracyjne):**
- `insert` jednego send-row → OK (ścieżka append żyje).
- `update` istniejącego send-row → RZUCA (nielegalna operacja #6).
- `delete` istniejącego send-row bezpośrednio → RZUCA (lub: tylko kaskada dozwolona).
- `delete from reports` kaskaduje i usuwa powiązane sends → OK (kaskada niezłamana).

**Trasa (Faza 3, jeśli zespół testuje trasy):** mapowanie każdego `SendOutcome.status` na
poprawny status HTTP + kształt `actionOk/actionError`.

### 5.4 Nowe „load-bearing" nazwy do rejestracji

Projekt prowadzi rejestr kontraktów w **`CLAUDE.md`** (blok „Project rules (load-bearing)")
oraz w Ubiquitous Language `01-domain-distillation.md`. Do dopisania po implementacji:

- **`dispatchAndRecord` / `SendOutcome`** (`src/lib/report-sends/service.ts`) — jedyny
  punkt egzekwowania niezmienników #5/#8; pięć nazwanych stanów wyniku. Reguła:
  *trasa wysyłki NIE woła `sendReportEmail`/`recordSend` bezpośrednio — przechodzi przez
  `dispatchAndRecord`, bo to ono trzyma „record-only-after-confirmed-dispatch".*
- **`SendLogRepo`** — repozytorium append-only; *brak `update()/remove()` jest celowy i
  load-bearing (niezmiennik #6); nie dodawać ścieżki mutacji.*
- **`report_sends_no_update_delete` trigger** — *immutability log-u jest teraz w bazie;
  app już nie „pamięta" #6. Kasowanie raportu kaskaduje — trigger obejmuje tylko UPDATE
  (lub respektuje kaskadę).*
- **`recorded_by_peer`** — *nazwany stan wyścigu (23505 z `report_sends_dedup_idx`);
  rozróżniony od `record_failed`. `SEND_DEDUP_VIOLATION` jest teraz konsumowany, nie martwy.*

---

## Podsumowanie (5–8 zdań)

Wybrany do refaktoru niezmiennik #1 to **Report Send Log** — reguły #5 (nieudana wysyłka nie
zapisuje rekordu) i #6 (rekord jest niemutowalny): jednoczesny szczyt rdzeniowości (north
star US-01, `roadmap.md:29`) i najsłabsze egzekwowanie wśród reguł rdzeniowych. Diagnoza
pokazała, że #5 trzyma się wyłącznie ręcznej kolejności `try/catch` w jednej trasie
(`send.ts:74-97`), że istnieje trzeci stan „dispatch-ok/record-fail" nieopisany w PRD
i połknięty jako miękki warning, że eksport `SEND_DEDUP_VIOLATION` jest martwy (wyścig 23505
nieodróżniony od prawdziwej awarii zapisu), a #6 jest tylko konwencją bez constraintu bazy.
Projekt agregatu zamyka tę logikę w `ReportSendService.dispatchAndRecord` z jawną,
testowaną maszyną pięciu nazwanych stanów (`recorded` / `blocked_recent` / `dispatch_failed`
/ `recorded_by_peer` / `record_failed`), zwęża trasę do cienkiego adaptera mapującego
`SendOutcome` na HTTP, a niemutowalność przenosi z konwencji do triggera bazy
(`report_sends_no_update_delete`), kopiując wzorzec „the DB owns the invariant" z katalogu
wtyczek. Plan jest fazowany test-first dla czystej maszyny stanów i migracji, z jedną
świadomie odłożoną decyzją domenową (czy zapobiegać DRUGIEMU e-mailowi w prawdziwym wyścigu,
co wymagałoby rezerwacji rekordu przed dispatchem i zmiany US-01). Po wdrożeniu fail-fast
jest dosłowny: każda nielegalna gałąź jest nazwana i obsłużona, żadna nie „leci dalej" jako
fałszywy sukces, a próba mutacji log-u zatrzymuje się na triggerze, nie na recenzji PR.
