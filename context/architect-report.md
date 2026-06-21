---
title: Raport architektoniczny — Moduł 4 (10xArchitect)
created: 2026-06-11
type: architect-report
---

> Sumaryczny two-pager z modułu 4. Każda sekcja wskazuje repo, na którym powstał artefakt
> (L2/L3/L4 = legacy `gutenberg`, L5 = `10xdev-project`). Twierdzenia liczbowe i „tylko tutaj"
> pochodzą z artefaktów, nie z pamięci o kodzie.
>
> Cztery artefakty źródłowe: L2/L3/L4 w `context-legacy/` (z repo `gutenberg`), L5 w `context/domain/`
> — patrz `context-legacy/README.md`.

## 1. Opisane projekty

| Repo | Stack | Skala (orientacyjnie) | Artefakty |
|---|---|---|---|
| **`gutenberg`** (legacy) | Monorepo edytora WordPress: ~kilkadziesiąt pakietów JS `@wordpress/*` w `packages/` + warstwa PHP w `lib/`. React. | Okno 12 mies. (2025-06-09→2026-06-09): **4313 commitów**; tempo rośnie 480→1518 commitów/kwartał (repo-map §1, §2) | **L2** (mapa), **L3** (research media-editor), **L4** (plan refaktoru media-editor) |
| **`10xdev-project`** (Maintenance Ledger) | Astro 5/6 (SSR) + React 19 (wyspy) + Tailwind v4; trasy API `.ts`; logika w `src/lib/<domena>/{schema,form,queries}.ts`; Supabase po HTTP/PostgREST; PDF FormePDF; Cloudflare Workers | Single-tenant MVP; ~8 modułów domenowych, 18 tras API, 8 stron SSR; **34 pliki** znają Supabase (03-ACL §1) | **L5** (domain distillation, invariant/aggregate, anti-corruption layer, event-storming) |

## 2. Mapa projektu — L2 *(repo: `gutenberg`)*

Kluczowe wnioski z `repo-map.md`:

- **Trzy warstwy edytora** (`block-editor` → `editor` → `edit-site`/`edit-post`) — granica „niższe nie importują wyższych" respektowana w **100%** wg grafu zależności (§1).
- **Strefy ryzyka**: trójkąt cykliczny `block-editor/store` (`selectors ↔ private-selectors ↔ utils`, **0 testów jednostkowych**); antywzorzec `selectors ↔ private-selectors` powtórzony w core-data (96 krawędzi) i store; barrele `index.js` (block-editor **111** re-eksportów, editor **88**) (§3, §4).
- **Lokalne centra**: `block-editor/src/components` (1178 zmian, jądro UI), `editor/src/components` (995), `core-data` (płytki fan-out 3.4, ale ~180 importów z góry → zmiana promieniuje) (§2).
- **Entry pointy / pierwszy dzień**: `AGENTS.md` → `lib/load.php` (rejestr modułów PHP) → barrel block-editora → `store/` → `editor/.../provider` (§6).
- **Najważniejsze unknowns**: warstwa **PHP (`lib/`) nie ma grafu** — jej powiązania to `unknown`, nie „brak"; cross-package importy `@wordpress/*` częściowo nierozwiązane przez depcruise (§7). Najgorętszy front Q2'26 — **Media Editor** (516 dotknięć) — ma **grono 2 osób** → ryzyko kolizji, nie struktury (§2, §4).

## 3. Analiza ficzera — L3 *(repo: `gutenberg`)*

**Co badano i dlaczego**: przepływ edycji obrazu w `@wordpress/media-editor` (crop/rotate/zoom → zapis). Wybór wprost wynika ze **strefy ryzyka #3** z mapy: najgorętszy obszar repo Q2'26 + 2-osobowe grono (research §Summary, §Related Research).

**Feature overview**: input pochodzi z gestu użytkownika (drag/pinch/wheel/klawiatura) → handlery `useInteraction` → settery → **pure cropper reducer** (geometria) opakowany w **composite reducer** (undo/redo + aspect ratio). Stan zmienia się w lokalnym, warstwowym modelu React (A→B→C), całkowicie odseparowanym od cyklu życia modala (osobny store `@wordpress/data` `core/media-editor`). Przy zapisie modyfikatory `[flip,rotate,crop]` lecą `POST /wp/v2/media/{id}/edit`, a wynik wraca callbackiem `onSaved → onUpdate({id,url})` do bloku obrazu (research §Feature overview).

**Technical debt (3 najważniejsze)**:
1. **Cała ścieżka zapisu i orkiestracja UI bez testów (KRYTYCZNE)**: `use-save-media-editor.ts` (serce zapisu) — **0 testów**; brak testu integracyjnego całego łańcucha i brak e2e media-editora (istniejący spec dotyczy tylko uploadu) (Technical debt §1).
2. **Kruche sprzężenie — kontrakt modala**: zmiana kształtu `{isOpen,id,onUpdate,onClose}` wymaga skoordynowanej edycji w ≥5 plikach cross-package (editor ×2, block-editor store + private-apis, block-library ×2) (§4 blast radius).
3. **Format zapisu jako kontrakt zewnętrzny**: schemat `[flip,rotate,crop]` musi pozostać w sync z serwerowym `/edit`; parity preview↔export pilnuje ciężki test (§4).

**Potwierdzenie ast-grepem**: granica warstw — `media-editor/src` **nie importuje** `@wordpress/block-editor` ani `@wordpress/editor` (C5: ast-grep 0 **+ grep 0**, prawdziwe zero); konsumenci produkcyjni = **dokładnie 2** pliki warstwy `editor` (C6, skorygowane — pierwotny grep dał fałszywe trafienie) (research §Weryfikacja).

## 4. Plan refaktoryzacji — L4 *(repo: `gutenberg`)*

**Co refaktoryzowane**: opcja #1 — *collapse accidental complexity in the glue* modelu stanu media-editora. Docelowy kształt: reshape `computeInscribedRect` ma **jednego właściciela** (composite reducer; widok dispatchuje zamiast re-derywować — dziś **3 wywołania**: reducer + 2× `cropper.tsx`); idiom `stateRef` i bookkeeping dirty/baseline zdefiniowane raz; funkcje równości **shielded** typem/testem przed cichym desync (plan Overview, B1–B4).

**Czego świadomie NIE robimy**: opcja #2 (dedup konsumentów block-library — inny pakiet/owner); charakteryzacja save-path (`use-save-media-editor.ts` — najwyższy ROI, ale to osobna zmiana coverage); retirement `useCropperReducer` (intencjonalny seam Storybook/recipes); seam kontraktu modala i save-format **[REJECTED]** — wymuszone regułą warstw / zewnętrznym kontraktem WP Core REST; redesign middleware-over-pure-core (wymyśla brakującą abstrakcję) (plan *What We're NOT Doing*).

**Fazy + weryfikacja**:
- **Faza 1 — siatka testów charakteryzujących**: golden test composite-reducera + direct test `buildCropperSetters` + audyt `transforms/pipeline.ts`. *Auto* (test:unit, lint, type-check) + *ręcznie* (sign-off Ramona na atomowy undo aspect-ratio).
- **Faza 2 — single-source reshape**: usuń re-derywację z `cropper.tsx`. *Auto* (suite, search „0 wywołań w cropper.tsx", crop e2e `image.spec.js`) + *ręcznie* (brak render-loopu na resize — jawny krok).
- **Faza 3 — konsolidacja dirty/baseline + `stateRef` + shield równości**: *auto* (suite, scratch z nieobsłużonym polem **musi** wywalić compile/test, potem revert) + *ręcznie* (undo/redo/gesty identyczne, standalone hook działa).

## 5. Domena wg DDD — L5 *(repo: `10xdev-project`)*

**Ubiquitous language (kluczowe pojęcia)**: **Report** (raport per projekt per cykl: stałe sekcje + 3 repeatery), **Month/Cycle** (etykieta „YYYY-MM" zamrożona serwerowo, nieedytowalna), **Report Send** (niemutowalny append-only log jednej udanej wysyłki), **Seed** (zasianie repeatera wtyczek z listy cyklicznej), **Promote** (idempotentne dopisanie nazwy wtyczki do katalogu) (01-distillation §1).

**Najważniejsze rozjazdy model-vs-kod**: (a) wiedza domenowa istnieje **tylko w kodzie** — reguły „filled" dla empty-section hiding (WP core widoczny tylko z wersją) żyją w komentarzach `pdf/sections.ts`, nie w PRD; (b) **trzeci stan poza modelem** — „dispatch-ok / record-fail" (email wyszedł, zapis padł) jest w kodzie jako miękki warning, PRD go nie zna; (c) jeden byt, trzy nazwy: `plugins` (DB) vs `PluginRow` (API) vs „wiersz" (UI) (01-distillation §4, hotspot hot-8).

**Niezmiennik #1 i jego agregat**: ranga #1 to **Agregat B — Report Send Log**, niezmienniki **#5** (nieudana wysyłka NIE zapisuje rekordu — *no false success*) i **#6** (rekord niemutowalny). Najwyższa rdzeniowość (north star US-01) + najsłabsze egzekwowanie: #5 trzyma się wyłącznie kolejności `try/catch` w jednej trasie (`send.ts:74-97`), #6 to tylko konwencja bez constraintu bazy. Projekt naprawy: zamknąć w `dispatchAndRecord` z 5-stanową maszyną (`recorded`/`blocked_recent`/`dispatch_failed`/`recorded_by_peer`/`record_failed`) + przenieść niemutowalność do triggera bazy, kopiując wzorzec „the DB owns the invariant" z katalogu wtyczek (02-invariant §KROK 4–5).

**Anti-Corruption Layer**: najgorzej przeciekająca zależność to **Supabase** (`@supabase/supabase-js`) — znana przez **34 pliki w 2 warstwach** (domena + trasy/strony) i wszystkie 3 kanały kontraktu: typ `SupabaseClient<Database>` w ~35 sygnaturach, kontrakt błędów PostgREST (`"23505"` zduplikowany w 5 miejscach), kształt wiersza tabeli serializowany wprost do JSON. Rozstrzygający jest rozjazd intencja-vs-kod: dokumenty **3×** deklarują Supabase jako wymienialny magazyn, kod nie ma ani jednego lokalnego punktu wymiany. (Pozostałe 3 zależności — Resend, FormePDF, Tiptap — są już za faktycznym ACL.) (03-ACL §1–2).

## 6. Decyzje, które należą do mnie

AI policzyło za mnie grafy zależności, historię zmian i rankingi — ale wnioski wyciągałem sam. Cztery wybory były moje:

- **Który obszar przeanalizować (L3).** Mapa pokazała media-editor jako strefę ryzyka #3, więc na tym zrobiłem research. Sam pakiet wygląda niegroźnie, ale historia zmian i tylko dwie osoby pracujące przy tym kodzie to ryzyko kolizji zmian i wiedzy skupionej w wąskim gronie.
- **Jak wąski ma być plan (L4).** Zostawiłem tylko część dotyczącą glue (kodu łączącego warstwy stanu, nie samej logiki) z opcji #1. Celowo odrzuciłem modal-contract i save-format, bo są związane z kontraktem REST WordPressa i architekturą warstw. Ich zmiana to nie refaktor, tylko przebudowa połączenia między systemami.  Próba poprawiania ich "przy okazji" zwiększyłaby zakres i ryzyko zmiany.
- **Który niezmiennik jest najważniejszy (L5).** Wybrałem Report Send Log (zapis, "raport wysłany do klienta"), ponieważ jego naprawa daje największy zysk oraz nie ma ochrony od strony bazy. Naprawia dwie reguły: Nieudana wysyłka NIE zapisuje rekordu (#5) oraz Rekord wysyłki jest niemutowalny (#6).
- **Gdzie celowo odszedłem od PRD.** Pominąłem celowo dwie rzeczy: Optimistic UI (US-03), czyli pokazywanie zmiany w UI zanim odpowiedź wróci z serwera z opcją rollbacku przy błędzie. Zamiast tego pokazuję spinner, który czeka na odpowiedź z serwera i dopiero wtedy wyświetla komunikat z wynikiem. Wg mnie ta opcja jest wystarczająca dla mojej aplikacji. Druga rzecz to osobny przycisk pobierania raportu (S-12). Uznałem, że przycisk "View PDF", który otwiera raport w przeglądarce jest wystarczający, ponieważ przeglądarka i tak pozwala na pobranie pdfa po otwarciu.

Lekcja na przyszłość: W moim przypadku reguła z M4L3 - "używaj ast-grep dla precyzji, ale każde zero potwierdzaj grepem" się sprawdziła. W researchu legacy (media-editor-flow) ast-grep pokazał zero, którego nie było; grep to wychwycił i wprowadził korektę (C6).

> **Event Storming (L5):** `event-storming-board.json` wczytany i wykorzystany — struktura raportu z lekcji nie przewiduje osobnej sekcji Event Stormingu, więc kluczowe hotspoty (hot-4 render-fail, hot-5 race 23505, hot-8 trzy nazwy bytu) zasiliły listę rozjazdów w §5. Poza PRD/roadmapą projekt nie prowadził osobnej narracji domenowej (odnotowane w `01-domain-distillation.md`, KROK 0).
