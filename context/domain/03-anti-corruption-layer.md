---
title: "Anti-Corruption Layer — Supabase za portem persystencji"
created: 2026-06-11
type: refactor-plan
---

> **Co to jest:** plan refaktoru (NIE implementacja — kod produkcyjny nietknięty),
> który identyfikuje najgorzej przeciekającą zależność zewnętrzną w Maintenance
> Ledger, dowodzi rozjazdu intencja-vs-kod (dokumenty deklarują Supabase jako
> celowo wymienialne, kod tego nie dotrzymuje) i projektuje warstwę
> antykorupcyjną (ACL) — domenowe encje persystencji + wąski port repozytorium +
> jeden adapter Supabase — tak, że wymiana biblioteki dotyka wyłącznie adaptera.
> Każdy cytat `plik:linia` zweryfikowany przez odczyt pliku 2026-06-11.

---

## KROK 0 — Kontekst odkryty

- **Produkt:** Maintenance Ledger — zwija agencyjny pipeline raportowania
  utrzymaniowego WordPress w jeden przepływ (autor → brandowany PDF → wysyłka do
  PM i klienta). North star = kompletna pętla US-01 (`context/foundation/prd.md:36`).
- **Stack:** Astro 6 (strony SSR `.astro`) + React 19 (wyspy `.tsx`) + trasy API
  `.ts` w `src/pages/api/**` → moduły domenowe `src/lib/<domena>/{schema,form,queries}.ts`
  → Supabase po HTTP/PostgREST. Runtime: Cloudflare Workers (workerd). Test runner:
  **vitest** (`package.json:13`).
- **Zależności zewnętrzne kandydujące do przecieku** (z `package.json:18-49`):
  `@supabase/supabase-js` (persystencja), `resend` (e-mail), `@formepdf/core` +
  `@formepdf/react` (PDF), `@tiptap/*` (edytor WYSIWYG).

### Deklaracje wymienialności w dokumentach (kluczowy sygnał intencji)

Trzy niezależne miejsca deklarują, że **Supabase ma być cienkim, wymienialnym
magazynem**, a nie integralną częścią domeny:

| Cytat (zweryfikowany) | Treść deklaracji |
|---|---|
| `context/foundation/tech-stack.md:34` | „Supabase is **kept as Postgres + storage**, accessed only from Astro server endpoints…" |
| `context/foundation/tech-stack.md:30-33` | Auth celowo **odłączony** od Supabase Auth (własny HMAC), bo „Supabase Auth's … machinery is dead weight here" — Supabase świadomie redukowany do roli składu. |
| `context/domain/02-invariant-aggregate-refactor.md:22-26` | „Baza Supabase Postgres jest **niemal czystym magazynem** … niezmienniki treściowe NIE są w bazie." |

Intencja jest więc jawna: Supabase to detal infrastruktury. Poniżej dowodzę, że
kod tej intencji **nie dotrzymuje** — typy, kontrakt błędów i kształt wire biblioteki
przeciekają przez granice warstw.

---

## KROK 1 — Przeciekające zależności (identyfikacja)

Zinwentaryzowałem każdą z czterech zależności pod kątem czterech sygnałów przecieku:
import w wielu warstwach, zduplikowana rekonstrukcja klienta, typy biblioteki w
sygnaturach domenowych / kontraktach wire, wołanie SDK po obu stronach granicy
klient/serwer.

### Oś A — Supabase (`@supabase/supabase-js`)

- **Import w wielu warstwach.** `@supabase/supabase-js` lub fabryka klienta
  `createSupabaseClient` są znane przez **34 pliki** w dwóch warstwach:
  - fabryka: `src/lib/supabase.ts:1` (`createClient`, `SupabaseClient`);
  - 8 modułów domenowych importuje typ `SupabaseClient` bezpośrednio:
    `src/lib/projects/queries.ts:1`, `src/lib/brand-settings/queries.ts:1`,
    `src/lib/pm-contacts/queries.ts:1`, `src/lib/plugins-catalog/queries.ts:1`,
    `src/lib/project-recurring-plugins/queries.ts:1`, `src/lib/reports/queries.ts:1`,
    `src/lib/report-sends/queries.ts:1`, `src/lib/email-templates/queries.ts:1`;
  - 18 tras API (`src/pages/api/**`) + 8 stron SSR (`src/pages/**/*.astro`)
    importuje fabrykę `createSupabaseClient` (pełna lista w KROK 6).
- **Typy biblioteki w sygnaturach domenowych.** `type Client = SupabaseClient<Database>`
  powtórzony w 8 modułach (`projects/queries.ts:7`, `brand-settings/queries.ts:7`,
  `pm-contacts/queries.ts:7`, `plugins-catalog/queries.ts:7`,
  `project-recurring-plugins/queries.ts:5`, `reports/queries.ts:7`,
  `report-sends/queries.ts:5`, `email-templates/queries.ts:7`) i wstrzyknięty jako
  pierwszy parametr **~35 funkcji domenowych** (np. `listProjects(client: Client)`
  `projects/queries.ts:20`, `recordSend(client: Client, …)` `report-sends/queries.ts:49`).
- **Kontrakt błędów biblioteki w domenie.** Kod inspektuje `error.code === "23505"`
  (Postgres unique_violation z `PostgrestError`) w 4 modułach i `error.message`
  w ~45 miejscach (szczegóły KROK 3).
- **Kształt wire = kształt tabeli Supabase.** Typy domenowe są aliasami
  `Database["public"]["Tables"][...]["Row"]` i są serializowane wprost do JSON
  (KROK 3).

### Oś B — Resend (`resend`)

- Importowany w **jednym pliku**: `src/lib/email/send-report.ts:1`.
  `new Resend(...)` konstruowany raz (`send-report.ts:96`). Sygnatura publiczna
  `sendReportEmail(args): Promise<void>` (`send-report.ts:47-54`) — **żaden typ
  Resend nie wycieka**. Trasa `src/pages/api/reports/[id]/send.ts:8` woła funkcję,
  nie SDK. Drobny przeciek kontraktu: `error.message` z odpowiedzi Resend
  (`send-report.ts:97-99`) i kształt payloadu (`from/to/subject/html/attachments`,
  `send-report.ts:71-77`) zlepiony inline. **Jedna warstwa, jeden moduł — granica
  trzyma.**

### Oś C — FormePDF (`@formepdf/core` + `@formepdf/react`)

- Importowany w **2 plikach**: `src/lib/pdf/render.ts:1-2` (`init`, `renderDocument`,
  wasm) i `src/lib/pdf/report-document.tsx:2` (komponenty JSX). `renderDocument`/`init`
  wołane tylko w `render.ts:13-14`. Jedyne API wyjściowe to
  `renderReportPdf(element: ReactElement): Promise<Uint8Array>` (`render.ts:12`) —
  **żaden typ FormePDF nie wycieka**, do klienta nic nie trafia (serwer-only).
  **Granica trzyma.**

### Oś D — Tiptap (`@tiptap/*`)

- Importowany w **jednym komponencie**: `src/components/email-templates/RichTextEditor.tsx:1-3`.
  Edytor to kontrolowany czarny-skrzynka: prop `value: string` → callback
  `onChange(editor.getHTML())` (`RichTextEditor.tsx:37`). Rodzic
  (`EmailTemplatesForm.tsx`) widzi tylko `string`. Sanityzacja serwerowa w osobnym
  module (`src/lib/email-templates/sanitize.ts`, wołana w `form.ts:22`). **Typ
  `Editor` użyty tylko wewnątrz komponentu (`RichTextEditor.tsx:63`). Granica trzyma.**

---

## KROK 2 — Klasyfikacja i wybór #1

| Oś | (a) Warstwy/pliki dotknięte | (b) Ryzyko/koszt wymiany dziś | (c) Dokumenty deklarują wymienialność? | Werdykt |
|---|---|---|---|---|
| **A — Supabase** | **34 pliki, 2 warstwy** (domena + trasy/strony); typy w ~35 sygnaturach; kontrakt błędów w 49 miejscach; kształt wire = kształt tabeli | **WYSOKIE** — brak punktu wymiany; każda funkcja, trasa i strona musiałaby zostać dotknięta | **TAK, 3× jawnie** (`tech-stack.md:34`, `:30-33`, `02-…:22-26`) | **#1 — najgorszy przeciek** |
| B — Resend | 1 plik, 1 warstwa | NISKIE — 1 adapter inline | nie | OK |
| C — FormePDF | 2 pliki, 1 warstwa | NISKIE — 1 API wyjściowe | (CLAUDE.md fiksuje silnik celowo) | OK |
| D — Tiptap | 1 komponent | NISKIE | nie | OK |

**Wybór: Oś A — Supabase.** Uzasadnienie: to jedyna zależność, która przecieka
przez **dwie warstwy naraz** i przez **wszystkie trzy kanały kontraktu**
(typ klienta w sygnaturach, kontrakt błędów PostgREST w logice domenowej, kształt
wiersza tabeli jako kształt wire). Co decydujące — to jedyna oś z **rozjazdem
intencja-vs-kod**: dokumenty trzykrotnie deklarują Supabase jako wymienialny
magazyn, a kod nie ma ani jednego miejsca, w którym wymiana biblioteki byłaby
lokalna. Pozostałe trzy zależności są już de facto za swoimi ACL (Resend za
`send-report.ts`, FormePDF za `render.ts`, Tiptap za `RichTextEditor.tsx`) — nie
wymagają refaktoru. Supabase jest wyjątkiem i to jego dotyczy reszta planu.

---

## KROK 3 — Diagnoza (duplikacja + przecieki przez granice)

### 3.1 Przeciek #1 — typ klienta biblioteki w sygnaturach domenowych

Każdy moduł domenowy redeklaruje ten sam alias i wstrzykuje typ biblioteki:

```
src/lib/projects/queries.ts:7                 type Client = SupabaseClient<Database>;
src/lib/brand-settings/queries.ts:7           type Client = SupabaseClient<Database>;
src/lib/pm-contacts/queries.ts:7              type Client = SupabaseClient<Database>;
src/lib/plugins-catalog/queries.ts:7          type Client = SupabaseClient<Database>;
src/lib/project-recurring-plugins/queries.ts:5  type Client = SupabaseClient<Database>;
src/lib/reports/queries.ts:7                  type Client = SupabaseClient<Database>;
src/lib/report-sends/queries.ts:5             type Client = SupabaseClient<Database>;
src/lib/email-templates/queries.ts:7          type Client = SupabaseClient<Database>;
```

Konsekwencja: nazwa biblioteki jest w publicznym kontrakcie ~35 funkcji
(np. `src/lib/projects/queries.ts:20` `export async function listProjects(client: Client)`).
Wymiana biblioteki = przepisanie sygnatury każdej z nich.

### 3.2 Przeciek #2 — kontrakt błędów PostgREST w logice domenowej

Domena rozpoznaje **kod błędu Postgresa** biblioteki, żeby zmapować go na błąd
domenowy. Stała `"23505"` (unique_violation z `PostgrestError`) jest zduplikowana
w 4 modułach:

```
src/lib/projects/queries.ts:11                const UNIQUE_VIOLATION = "23505";
src/lib/pm-contacts/queries.ts:11             const UNIQUE_VIOLATION = "23505";
src/lib/plugins-catalog/queries.ts:11         const UNIQUE_VIOLATION = "23505";
src/lib/project-recurring-plugins/queries.ts:20  const UNIQUE_VIOLATION = "23505";
src/lib/report-sends/queries.ts:59            export const SEND_DEDUP_VIOLATION = "23505";
```

Inspekcja `error.code === UNIQUE_VIOLATION` w `projects/queries.ts:49`,
`projects/queries.ts:60`, `pm-contacts/queries.ts:42`, `pm-contacts/queries.ts:53`,
`plugins-catalog/queries.ts:31`, `plugins-catalog/queries.ts:46`,
`project-recurring-plugins/queries.ts:65`. Plus ~45 wystąpień
`throw new Error(error.message)` rozsianych po 8 modułach (wycina i przepisuje
`error.message` PostgREST). To kontrakt biblioteki — inna biblioteka kodowałaby
kolizję unikalności inaczej (wyjątek, inny `code`, inna struktura) — wciągnięty
do reguł domenowych.

### 3.3 Przeciek #3 (najgroźniejszy) — kształt wiersza tabeli jako kontrakt wire

Typy domenowe to bezpośrednie aliasy kształtu tabeli generowanego przez Supabase CLI:

```
src/lib/projects/queries.ts:5        export type Project = Database["public"]["Tables"]["projects"]["Row"];
src/lib/brand-settings/queries.ts:5  export type Brand   = Database["public"]["Tables"]["brand_settings"]["Row"];
src/lib/pm-contacts/queries.ts:5     export type PmContact = Database["public"]["Tables"]["pm_contacts"]["Row"];
src/lib/plugins-catalog/queries.ts:5 export type PluginCatalogEntry = Database["public"]["Tables"]["plugin_catalog"]["Row"];
src/lib/email-templates/queries.ts:5 export type EmailTemplates = Database["public"]["Tables"]["email_templates"]["Row"];
```

A `Database` pochodzi w 100% z biblioteki — to artefakt `supabase gen types`
(`package.json:16` `db:types`, plik `src/types/database.types.ts`, 449 linii). Te
typy są następnie **serializowane wprost do JSON** w 8 trasach API przez generyczne
`actionOk({ data })`:

```
src/pages/api/projects/index.ts:16          data: project   (Project = Row)
src/pages/api/projects/[id].ts:19           data: project
src/pages/api/brand-settings.ts:16          data: brand     (Brand = Row)
src/pages/api/pm-contacts/index.ts:16       data: contact
src/pages/api/pm-contacts/[id].ts:17        data: contact
src/pages/api/plugins-catalog/index.ts:16   data: entry
src/pages/api/plugins-catalog/[id].ts:17    data: entry
src/pages/api/reports/index.ts:17           data: report
```

`actionOk<TData>` (`src/lib/ui/response.ts:7`) jest generyczne — **nic nie ogranicza
`TData`**, więc kontrakt wire to dosłownie kształt tabeli Supabase. Dowód, że to
realny przeciek (nie tylko teoretyczny):

- **Artefakt modelowania biblioteki w wire:** `brand_settings.id: boolean`
  (`src/types/database.types.ts:16`) — singleton zakodowany jako `boolean`-owe id —
  jedzie do klienta przez `data: brand`. To decyzja schematu Supabase, nie pojęcie
  domenowe.
- **Kolumny audytowe biblioteki w wire:** każdy `Row` niesie `created_at` /
  `updated_at` (np. `database.types.ts:14-20`), serializowane do klienta, choć UI
  ich nie potrzebuje.

### 3.4 Przeciek #4 — domena walczy z reprezentacją biblioteki (reports)

`src/lib/reports/queries.ts` najjaskrawiej pokazuje, że to ACL, którego brakuje:

- `reports/queries.ts:13-17` — `Report` musi **`Omit`** trzy kolumny jsonb, bo
  Supabase typuje je jako `Json`, i ręcznie re-asertować je na kształty zod
  (`plugins: PluginRow[]` itd.). Komentarz `:10-12`: „The DB types these three as
  `Json`; we own the row shape via schema.ts, so we assert it on read."
- `reports/queries.ts:99-110` — kod czyta **quirk PostgREST** osadzenia to-one
  (`row.projects as { name; slug } | null`) z komentarzem `:100-101`: „PostgREST
  types a to-one embed as an object|null". To wiedza o kontrakcie biblioteki
  wpleciona w mapowanie domenowe.

To jest dokładnie odpowiedzialność, którą ma przejąć encja persystencji w ACL:
JEDNO miejsce wiedzy o tym, jak wiersz Supabase mapuje się na encję domenową.

### 3.5 Przeciek #5 — typ biblioteki w komponencie klienckim (React)

`src/components/brand-settings/BrandSettingsForm.tsx:9` importuje
`type Brand` (= `Row` Supabase) do **komponentu klienckiego**, po czym natychmiast
redeklaruje identyczny interfejs `BrandInitial` (`:11-16`), żeby go nie używać —
duplikacja wymuszona przeciekiem. (Sam runtime `@supabase/supabase-js` NIE trafia
do bundla klienta — to przeciek typu, nie biblioteki; mimo to wiąże UI ze schematem
tabeli.) `report-document.tsx:3-4` analogicznie importuje `Report`/`Brand`.

---

## KROK 4 — Projekt ACL

Cel: **jedno miejsce wiedzy o kształcie zależności Supabase** = encje persystencji
(mapowanie wiersz↔domena + kontrakt błędów) za **wąskim portem repozytorium**,
implementowanym przez **jeden adapter** Supabase. Reszta kodu (logika domenowa,
trasy, strony, komponenty) zna wyłącznie port i czyste typy domenowe.

### 4.1 Domenowe typy persystencji (własne, NIE aliasy `Database`)

Nowy katalog `src/domain/` — czyste typy domenowe, ręcznie pisane, bez `Database`:

```ts
// src/domain/types.ts  (PSEUDOKOD — nie implementacja)
export interface Project {
  id: string; slug: string; name: string; url: string | null;
  contactCompany: string | null; contactName: string | null;
  contactEmail: string | null; internalNotes: string | null;
  // BRAK created_at/updated_at w kontrakcie domenowym chyba że domena ich używa
}
export interface Report {
  id: string; projectId: string; month: string;
  plugins: PluginRow[]; themes: ThemeRow[]; licenses: LicenseRow[]; // z schema.ts (zod)
  /* …pozostałe pola sekcji… */
}
export interface Brand { /* agencyName, primaryColor, secondaryColor, logo */ }
export interface BrandWire { /* TO, co naprawdę jedzie do klienta — bez id:boolean */ }
```

Klucz: `id: boolean` brand_settings i kolumny audytowe **nie** są częścią kontraktu
domenowego ani wire. To, czy jechać do klienta, decyduje encja, nie przypadek schematu.

### 4.2 Encja persystencji = JEDYNE miejsce wiedzy o kształcie wiersza Supabase

Mappery żyją w adapterze i są jedynym kodem, który zna `Database[...]["Row"]`:

```ts
// src/infra/supabase/mappers.ts  (PSEUDOKOD)
import type { Database } from "@/types/database.types"; // <-- tylko TU
type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];

export function projectFromRow(row: ProjectRow): Project { /* mapowanie nazw + jsonb cast */ }
export function projectToInsert(input: ProjectInput): Database["…"]["Insert"] { /* … */ }
export function reportFromRow(row: ReportRow): Report {
  // przejmuje Omit+assert z reports/queries.ts:13-17 i quirk to-one z :99-110
}
```

### 4.3 Kontrakt błędów za ACL — domenowe wyjątki, nie kody Postgresa

Jedno miejsce tłumaczy `PostgrestError` na wyjątki domenowe; `"23505"` znika z domeny:

```ts
// src/infra/supabase/errors.ts  (PSEUDOKOD)
const UNIQUE_VIOLATION = "23505"; // jedyna definicja w całym repo
export function mapPgError(error: PostgrestError, onUnique: () => Error): never {
  if (error.code === UNIQUE_VIOLATION) throw onUnique();
  throw new RepositoryError(error.message);
}
```

Klasy `SlugTakenError` / `EmailTakenError` / `NameTakenError` / `AlreadyOnListError`
przenoszą się do `src/domain/errors.ts` (są domenowe — zostają), ale **decyzja
„ten kod = ta kolizja" żyje tylko w adapterze**.

### 4.4 Wąski port (interfejs domenowy)

Port to wąski zestaw operacji domenowych, BEZ typu `SupabaseClient` w sygnaturach:

```ts
// src/domain/ports.ts  (PSEUDOKOD)
export interface ProjectRepository {
  list(): Promise<Project[]>;
  findBySlug(slug: string): Promise<Project | null>;
  findById(id: string): Promise<Project | null>;
  create(input: ProjectInput): Promise<Project>;   // rzuca SlugTakenError
  update(id: string, input: ProjectInput): Promise<Project>;
  delete(id: string): Promise<void>;
}
export interface ReportRepository { /* create/get/listByProject/listRecent/update/delete */ }
export interface SendLogRepository { /* recordSend/hasRecentSend/getSendSummary */ }
// + BrandRepository, PmContactRepository, PluginCatalogRepository, RecurringPluginRepository, EmailTemplateRepository
```

### 4.5 Adapter implementujący port przez Supabase

```ts
// src/infra/supabase/SupabaseProjectRepository.ts  (PSEUDOKOD)
export class SupabaseProjectRepository implements ProjectRepository {
  constructor(private readonly client: SupabaseClient<Database>) {} // typ biblioteki TYLKO tu
  async list(): Promise<Project[]> {
    const { data, error } = await this.client.from("projects").select("*").order("created_at", { ascending: false });
    if (error) mapPgError(error, () => new RepositoryError(error.message));
    return data.map(projectFromRow);
  }
  async create(input: ProjectInput): Promise<Project> {
    const { data, error } = await this.client.from("projects").insert(projectToInsert(input)).select("*").single();
    if (error) mapPgError(error, () => new SlugTakenError());
    return projectFromRow(data);
  }
  /* … reszta … */
}
```

Fabryka kompozycji (jedyne miejsce wstrzyknięcia klienta):

```ts
// src/infra/supabase/repositories.ts  (PSEUDOKOD)
export function makeRepositories(client = createSupabaseClient()) {
  return {
    projects: new SupabaseProjectRepository(client),
    reports:  new SupabaseReportRepository(client),
    sendLog:  new SupabaseSendLogRepository(client),
    /* … */
  };
}
```

Trasy przechodzą z „fabryka + funkcja" na „repozytorium z portu":

```ts
// PSEUDOKOD trasy — przed/po
// PRZED: const project = await createProject(createSupabaseClient(), parsed.data);
// PO:    const { projects } = makeRepositories();
//        const project = await projects.create(parsed.data);
```

---

## KROK 5 — Dowód izolacji + before/after

### 5.1 Dowód izolacji — co zna Supabase PRZED i PO

| Plik / grupa | PRZED (zna Supabase?) | PO refaktorze |
|---|---|---|
| `src/lib/supabase.ts` (fabryka) | TAK | przenosi się do `src/infra/supabase/` — **TAK (adapter)** |
| `src/types/database.types.ts` | TAK (generowany) | **TAK** (importowany tylko przez mappery) |
| `src/infra/supabase/*` (mappery, errors, repozytoria) | — (nowe) | **TAK — jedyne miejsce** |
| 8× `src/lib/<domena>/queries.ts` (`SupabaseClient`, `error.code`, `Row`) | TAK | **NIE** — stają się portem (`src/domain/ports.ts`) + czyste typy |
| 18 tras API (`createSupabaseClient`) | TAK | **NIE** — wołają `makeRepositories()` |
| 8 stron SSR `.astro` (`createSupabaseClient`) | TAK | **NIE** — wołają `makeRepositories()` |
| `BrandSettingsForm.tsx` / `report-document.tsx` (`type Brand`/`Report`) | TAK (typ) | **NIE** — importują z `src/domain/types.ts` |

### 5.2 Before/after dla duplikacji

- **Stała `"23505"`:** PRZED — 5 definicji (`projects:11`, `pm-contacts:11`,
  `plugins-catalog:11`, `project-recurring-plugins:20`, `report-sends:59`).
  PO — **1 definicja** w `src/infra/supabase/errors.ts`.
- **`type Client = SupabaseClient<Database>`:** PRZED — 8 redeklaracji. PO — **0**
  (port nie zna klienta; adapter ma go w konstruktorze raz).
- **`throw new Error(error.message)`:** PRZED — ~45 wystąpień. PO — scentralizowane
  w `mapPgError` (1 miejsce decyzji).
- **`Report` Omit+assert i quirk PostgREST:** PRZED — w domenie
  (`reports/queries.ts:13-17`, `:99-110`). PO — w `reportFromRow` (adapter).

### 5.3 Warstwa UI dostaje dane domenowe, nie surowy wiersz

PRZED: `actionOk({ data: project })` (`projects/index.ts:16`) serializuje `Row`
(z `created_at`/`updated_at`; brand także z `id: boolean`).
PO: trasa zwraca jawny typ wire (`ProjectWire` / `BrandWire`) zbudowany przez encję
— bez kolumn audytowych i bez `id:boolean`. `BrandSettingsForm.tsx` importuje typ
z `src/domain/types.ts`, usuwając zduplikowany `BrandInitial` (`:11-16`).

### 5.4 Rozstrzygnięcie pytań zależnych od kontraktu biblioteki

Decyzje wynikające z dokumentacji PostgREST/Supabase — zakodować **w ACL, nie w
trasie**:

1. **Osadzenie to-one (`reports → projects`)** typowane jako `object | null`
   (zależnie od FK; obserwowane w `reports/queries.ts:99-110`). Decyzja: defensywny
   odczyt zostaje, ale **w `reportFromRow`** (mapper), nie w funkcji domenowej.
2. **Kolumny jsonb (`plugins`/`themes`/`licenses`)** zwracane jako `Json`. Decyzja:
   cast na typy zod **w `reportFromRow`** (przenosi `reports/queries.ts:13-17`).
3. **`maybeSingle()` vs `single()`** — PostgREST zwraca `null` vs błąd na 0 wierszy.
   Decyzja: zachowanie „brak = null" jest częścią kontraktu portu (`findBySlug …
   Promise<… | null>`); implementacja `maybeSingle` zamknięta w adapterze.

---

## KROK 6 — Weryfikacja i plan

### 6.1 Kryterium sukcesu (mierzalne)

`grep -rn "@supabase/supabase-js" src/` oraz `grep -rn "database.types" src/` zwraca
**wyłącznie** pliki w `src/infra/supabase/` (adapter/mappery/errors) — plus
generowany `src/types/database.types.ts`. Dodatkowo
`grep -rn "createSupabaseClient" src/` zwraca tylko `src/infra/supabase/repositories.ts`.
`grep -rn "23505" src/` zwraca jedną linię (`src/infra/supabase/errors.ts`).

### 6.2 Pliki, które DZIŚ znają zależność (a PO refaktorze już nie)

**Tracą wiedzę o Supabase (34 pliki):** 8× `src/lib/<domena>/queries.ts`
(`projects`, `brand-settings`, `pm-contacts`, `plugins-catalog`,
`project-recurring-plugins`, `reports`, `report-sends`, `email-templates`);
18 tras API: `api/projects/index.ts`, `api/projects/[id].ts`,
`api/projects/[id]/delete.ts`, `api/brand-settings.ts`, `api/pm-contacts/index.ts`,
`api/pm-contacts/[id].ts`, `api/pm-contacts/[id]/delete.ts`,
`api/plugins-catalog/index.ts`, `api/plugins-catalog/[id].ts`,
`api/plugins-catalog/[id]/delete.ts`, `api/project-recurring-plugins/index.ts`,
`api/project-recurring-plugins/[id]/delete.ts`, `api/reports/index.ts`,
`api/reports/[id].ts`, `api/reports/[id]/delete.ts`, `api/reports/[id]/pdf.ts`,
`api/reports/[id]/send.ts`, `api/email-templates.ts`; 8 stron SSR:
`brand-settings.astro`, `email-templates.astro`, `index.astro`,
`plugins-catalog.astro`, `pm-contacts.astro`, `projects/index.astro`,
`projects/[slug].astro`, `projects/[slug]/reports/[id].astro`; 2 komponenty
(przeciek typu): `BrandSettingsForm.tsx`, `report-document.tsx`.

**Zachowują wiedzę (zamierzone — to ACL):** `src/types/database.types.ts`
(generowany) + nowe `src/infra/supabase/{mappers,errors,repositories}.ts` i klasy
repozytoriów.

### 6.3 Plan faz (zgodny z konwencją projektu)

Refaktor zachowawczy — testy zielone na każdej granicy fazy; konwencja
`/10x-new → /10x-research → /10x-plan → /10x-implement`, commit per faza.

- **Faza 0 — szkielet ACL.** `src/domain/{types,ports,errors}.ts` + `src/infra/supabase/`
  (przenieś fabrykę). Bez zmiany wywołań. Testy bez zmian.
- **Faza 1 — pionowy plaster pilotażowy (`projects`).** Mapper + `SupabaseProjectRepository`
  + `mapPgError`; przepnij trasy/strony `projects` na repozytorium; usuń
  `SupabaseClient`/`"23505"` z `projects/queries.ts`. Dowód wzorca na jednej domenie.
- **Faza 2 — pozostałe domeny.** Powtórz dla `brand-settings`, `pm-contacts`,
  `plugins-catalog`, `project-recurring-plugins`, `reports` (z Omit+quirk),
  `report-sends`, `email-templates`. Każda domena = osobny commit.
- **Faza 3 — kontrakt wire.** Wprowadź jawne typy `*Wire`; trasy `actionOk` przestają
  serializować surowy `Row`; usuń kolumny audytowe i `brand.id:boolean` z payloadu;
  odepnij `BrandSettingsForm.tsx`/`report-document.tsx` od `Database`.
- **Faza 4 — weryfikacja.** Uruchom grepy z 6.1; jeśli zwracają tylko
  `src/infra/supabase/*` + `database.types.ts` — sukces. `vitest run` + `astro build`.

---

## Podsumowanie

Spośród czterech zależności zewnętrznych trzy (Resend, FormePDF, Tiptap) są już
zamknięte za faktycznymi warstwami antykorupcyjnymi — każda w jednym module, bez
przecieku typów do sygnatur, bez wycieku do bundla klienta. Jedyną strukturalnie
przeciekającą zależnością jest **Supabase**, znana dziś przez 34 pliki w dwóch
warstwach. Przecieka przez wszystkie trzy kanały: typ `SupabaseClient<Database>`
w sygnaturach ~35 funkcji domenowych, kontrakt błędów PostgREST (`"23505"`
zduplikowany w 5 miejscach, `error.message` w ~45) wpleciony w reguły domenowe oraz
— najgroźniej — kształt wiersza tabeli serializowany wprost do JSON w 8 trasach
(`actionOk({ data: project })`), niosąc artefakty modelowania biblioteki
(`brand_settings.id: boolean`, kolumny audytowe) aż do klienta. Wybór jest
przesądzony rozjazdem intencja-vs-kod: `tech-stack.md:34` i `02-…:22-26` trzykrotnie
deklarują Supabase jako wymienialny magazyn, a kod nie ma ani jednego miejsca, gdzie
wymiana byłaby lokalna. Projekt ACL wprowadza domenowe encje persystencji + wąski
port repozytorium + jeden adapter Supabase, w którym mapper przejmuje walkę z
reprezentacją biblioteki widoczną dziś w `reports/queries.ts:13-17` i `:99-110`.
Kryterium sukcesu jest binarne i sprawdzalne grepem: po refaktorze nazwa pakietu i
typ `Database` występują wyłącznie w `src/infra/supabase/` (plus generowany plik
typów), a plan czterech faz dowozi to zachowawczo, domena po domenie, z zielonymi
testami na każdej granicy.
