---
title: 10xArchitect — ściąga do obrony raportu
created: 2026-06-19
type: defense-notes
---

> Cel: na pytanie oceniającego „skąd to wiesz?" masz odpowiedź zakotwiczoną w artefakcie,
> nie w pamięci. Test gotowości: zakryj raport i opowiedz na głos Q1–Q6.
> Artefakty: `gutenberg/context/map/repo-map.md` (L2), `…/changes/media-editor-flow/research.md` (L3),
> `…/changes/refactor-opportunities/plan.md` (L4), `10xdev-project/context/domain/*` (L5).

---

## Q1. Dlaczego akurat media-editor do researchu (L3)?

**Odpowiedź:** Wybór wynika z mapy (L2), nie z przeczucia. Strefa ryzyka #3 w `repo-map.md` §4:
media-editor to **najgorętszy front Q2'26 — 516 dotknięć** (skok 78→516 z Q1, tabela §2),
a jednocześnie **grono tylko 2 osób** (Ramon + Andrew Serong, §5). To ryzyko **kolizji/wiedzy**,
nie struktury — i dlatego ciekawe: w strukturze pakiet wygląda mały, w aktywności jest #1.

**Mój wniosek (nie z promptu):** mała struktura + duża aktywność + wąskie grono = miejsce,
gdzie jeden refaktor bez koordynacji wywoła konflikt merge. Dlatego tam zajrzałem.

---

## Q2. Co znaczy korekta C6 i czemu jest ważna? (NAJMOCNIEJSZY dowód samodzielności)

**Historia:** Twierdziłem „media-editor jest konsumowany przez X plików". Roboczy `grep -l`
wskazał **3** konsumentów, w tym `private-apis/src/implementation.ts`. Sprawdziłem ten trzeci —
to **fałszywe trafienie**: generyczna infrastruktura lock/unlock, nie realny konsument.
Skorygowałem na **dokładnie 2** pliki, oba w warstwie `editor`
(`use-block-editor-settings.js:20`, `media-editor-modal.js:7`) — research §Weryfikacja, wiersz C6.

**Lekcja, którą wyciągnąłem:** `ast-grep` z literałem string (`"..."`) **nie łapie pojedynczych
cudzysłowów** i daje fałszywe zero. Stąd reguła: licz ast-grepem dla precyzji, ale **każde zero
potwierdzaj `grep`em**. To jest w raporcie §6 jako moja lekcja na przyszłość.

**Dlaczego ważne:** pokazuje, że nie przyjąłem outputu narzędzia na wiarę — zweryfikowałem
i złapałem błąd. Tabela C1–C10 w researchu: 7 potwierdzonych, 2 doprecyzowane, **1 obalone (C6)**.

---

## Q3. Dlaczego niezmiennik #1 = Report Send Log, a nie No-leak? (L5)

**Odpowiedź:** Oceniałem na 3 osiach (02-invariant §KROK 2): rdzeniowość, rozsmarowanie,
egzekwowanie. Report Send Log wygrał, bo:
- **Najbardziej rdzeniowy** — to north star US-01 (wysyłka raportu klientowi).
- **Najsłabiej egzekwowany** — niezmiennik #5 (*nieudana wysyłka NIE zapisuje rekordu*)
  trzyma się **wyłącznie kolejności `try/catch` w jednej trasie** (`send.ts:74-97`);
  #6 (rekord niemutowalny) to **tylko konwencja, bez constraintu w bazie**.

**Dlaczego NIE No-leak:** No-leak jest równie ważny, ale **już dobrze zabezpieczony** —
token-whitelist w renderze maila + section-builder PDF (struktura kodu wymusza regułę).
Send-log zależy od kolejności obsługi błędów w jednym pliku → dużo bardziej podatny na regresję.

**Naprawa, którą zaprojektowałem:** zamknąć w `dispatchAndRecord` z 5-stanową maszyną
(`recorded`/`blocked_recent`/`dispatch_failed`/`recorded_by_peer`/`record_failed`) + przenieść
niemutowalność do **triggera bazy** — kopiując wzorzec „DB owns the invariant" z katalogu wtyczek.

---

## Q4. Jak powstały liczby z mapy gutenberga? (L2 — cudze, ogromne repo)

**Metoda (repo-map nagłówek + §7):** okno **12 miesięcy** (2025-06-09 → 2026-06-09),
**4313 commitów**. Trzy źródła, każde sprzężenie oznaczone:
- **[H]** historia gita (co-change — co zmienia się w tym samym commicie) → `artifact-1-territory.md`
- **[G]** graf importów z **dependency-cruiser** → `artifact-2-structure.md`
- **[?]** unknown — poza zasięgiem narzędzia

**Kluczowe liczby umiem wyjaśnić:**
- **480→1518 commitów/kwartał** = tempo repo rośnie liniowo (tabela §2).
- **Trójkąt cykliczny** `block-editor/store`: `selectors ↔ private-selectors ↔ utils`,
  8 krawędzi cyklicznych + **0 testów** → mały, dobry punkt startu refaktoru (§3 tabela cykli).
- **Barrele 111/88** = `index.js` re-eksportuje tyle modułów → import jednego komponentu
  ściąga cały pakiet → testy muszą mockować całe `@wordpress/block-editor` (§4 strefa #4).

**Ważne zastrzeżenie (umieć przyznać):** liczby to **dotknięcia ścieżek / commity**, proxy
aktywności i własności — **nie linie kodu ani jakość** (§7). PHP `lib/` jest **[?] unknown**,
bo depcruise objął tylko JS. To mapa aktywności w oknie, nie kompletny inwentarz.

---

## Q5. Rozjazd model-vs-kod, którego się nie spodziewałeś? (L5)

**Najlepszy przykład:** **trzeci stan poza modelem** — „dispatch-ok / record-fail"
(email wyszedł, ale zapis rekordu padł). W kodzie istnieje jako **miękki warning**
(trasa send zwraca 200 z `warning:true`), ale **PRD go nie zna** — model domenowy nie ma
tego stanu (01-distillation §4, hotspot hot-8 / hot-5 race 23505).

**Inne dwa:** (a) wiedza tylko w kodzie — reguły empty-section hiding żyją w komentarzach
`pdf/sections.ts`, nie w PRD; (b) jeden byt, trzy nazwy: `plugins` (DB) / `PluginRow` (API) / „wiersz" (UI).

**Skąd to mam:** Event Storming (`event-storming-board.json`) — hotspoty hot-4/hot-5/hot-8
zasiliły listę rozjazdów. Struktura raportu z lekcji nie ma osobnej sekcji ES, więc wpiąłem je w §5.

---

## Q6. Czemu plan refaktoru (L4) jest tak wąski — tylko „glue"?

**Odpowiedź:** Wybrałem opcję #1 — *collapse accidental complexity in the glue* modelu stanu.
Konkret: `computeInscribedRect` ma dziś **3 wywołania** (reducer + 2× `cropper.tsx`); cel =
jeden właściciel (composite reducer), widok dispatchuje zamiast re-derywować (plan B1–B4).

**Co świadomie ODRZUCIŁEM i dlaczego:**
- **modal-contract** i **save-format [REJECTED]** — wymuszone regułą warstw / zewnętrznym
  kontraktem WP Core REST (`/wp/v2/media/{id}/edit`). Poprawianie „przy okazji" tylko
  zwiększyłoby zakres i ryzyko bez wartości.
- **charakteryzacja save-path** (`use-save-media-editor.ts`, 0 testów) — najwyższy ROI,
  ale to **osobna zmiana coverage**, nie ten refaktor.

**To była MOJA decyzja** (§6): wąski plan = mniejsze ryzyko. Agent dał opcje, zakres wybrałem ja.

---

## Szybkie fakty (gdyby padło pytanie o szczegół)

| Pytanie | Odpowiedź | Źródło |
|---|---|---|
| Ile commitów / jakie okno? | 4313 / 12 mies. (2025-06-09→2026-06-09) | repo-map nagłówek |
| Granica warstw respektowana? | tak, w 100% (niższe nie importują wyższych) | repo-map §1, research C5 |
| Czy media-editor importuje block-editor? | NIE — ast-grep 0 **+ grep 0** (prawdziwe zero) | research C5 |
| Ile plików zna Supabase (L5 ACL)? | 34 pliki, 2 warstwy, 3 kanały kontraktu | 03-ACL §1 |
| Czemu Supabase to #1 przeciek? | dokumenty 3× deklarują „wymienialny", kod nie ma punktu wymiany | 03-ACL §1-2 |
| Co liczą „liczby" w mapie? | dotknięcia/commity = proxy aktywności, NIE jakość | repo-map §7 |

---

## Test gotowości (zrób przed wysyłką)

Zakryj raport. Opowiedz na głos: Q1 (czemu media-editor), Q2 (co to C6), Q3 (czemu send-log a nie no-leak).
Jeśli płynnie → broni się. Jeśli zacinasz się na którymś → otwórz dany artefakt i przejdź go raz jeszcze.
