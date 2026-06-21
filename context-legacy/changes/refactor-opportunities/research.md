---
date: 2026-06-10T00:00:00Z
researcher: Rafal Puczel
git_commit: 3d2311195c74d86fac6f5e05350d1e1210136c60
branch: trunk
repository: gutenberg
topic: "Refactor opportunities w @wordpress/media-editor — ranking długu strukturalnego z media-editor-flow/research.md"
tags: [research, codebase, media-editor, refactor, technical-debt, state-model, layering, blast-radius, verified]
status: complete
last_updated: 2026-06-10
last_updated_by: Rafal Puczel
last_updated_note: "Weryfikacja twierdzeń strukturalnych ast-grep 0.43.0 (S1-S9); 8 potwierdzonych, 1 obalone (C3b: cropperReducer ma 3 prod. importery, nie 1; linia importu :24 nie :27). Ranking i werdykty intencjonalności bez zmian."
verification_commit: 3d2311195c74d86fac6f5e05350d1e1210136c60
---

# Research: Refactor opportunities w `@wordpress/media-editor`

**Date**: 2026-06-10
**Researcher**: Rafal Puczel
**Git Commit**: `3d2311195c74d86fac6f5e05350d1e1210136c60`
**Branch**: `trunk`
**Repository**: gutenberg

## Research Question

Raport `context/changes/media-editor-flow/research.md` udokumentował dług techniczny i ryzyka strukturalne pakietu `@wordpress/media-editor`, ale celowo zostawił otwarte pytanie: **KTÓRE z tych problemów warto naprawić, w jakim docelowym kształcie i w jakiej kolejności.** Ta zmiana odpowiada na to pytanie wyłącznie na etapie **eksploracji** — bez refaktoru, bez decyzji.

Metoda zlecona przez użytkownika: wypisać każdy problem z raportu, sklasyfikować na **KANDYDAT** (naprawa zmieniłaby strukturę kodu) vs **nie-kandydat** (brak testu / luka dokumentacji — zachowany jako wejście do oceny kosztu/wykonalności), a potem każdego kandydata zbadać trzema sub-agentami: (1) obecny kształt, (2) historia i intencjonalność, (3) wykonalność migracji. Dowody przed interpretacją; każde twierdzenie oznaczone evidence / inference / unknown. Granica twarda: jeśli prawdziwa naprawa to przeprojektowanie kontraktu między systemami, nie struktury kodu — nazwać to i zatrzymać się.

> **Metoda i priory.** Ustalenia raportu `media-editor-flow/research.md` oraz `context/map/repo-map.md` przyjęto jako zebrane dowody (nie wyprowadzano ich na nowo). 9 równoległych sub-agentów eksploracyjnych (read-only) zweryfikowało twierdzenia bezpośrednim czytaniem plików, archeologią gita (`git log`/`git show`/`gh pr view`) i inwentaryzacją testów/CI. Gdzie sub-agent skorygował prior — odnotowano poniżej (np. liczba przypadków siatki parity, istnienie e2e crop, liczba punktów wpięcia w `editor`).

---

## Klasyfikacja kandydatów (do audytu)

Problemy odnotowane przez `media-editor-flow/research.md`, niezależnie od etykiety, plus werdykt strukturalny:

| # | Problem (źródło: media-editor-flow §) | Etykieta tam | Strukturalny? | Klasyfikacja |
|---|---|---|---|---|
| P1 | Ścieżka zapisu + orkiestracja UI bez testów (`use-save-media-editor.ts`, `index.tsx`) | KRYTYCZNE (dług) | nie — brak testów, nie kształt kodu | **NIE-KANDYDAT** (wejście do kosztu) |
| P2 | Komponenty React + hooki gestów bez testów | WYSOKIE (dług) | nie — brak testów | **NIE-KANDYDAT** |
| P3 | Czyste moduły geometrii częściowo niepokryte | ŚREDNIE (dług) | nie — brak testów | **NIE-KANDYDAT** |
| P4a | **Trójwarstwowy model stanu + osobny store** (pure cropper reducer / composite reducer / context provider + `@wordpress/data` modal store + core-data) — najwyższy fan-in, „nie ruszaj lekko" | blast radius / ryzyko | **tak — to pytanie o kształt kodu** | **KANDYDAT C-A** |
| P4b | **Kontrakt modala cross-package** (kształt `{isOpen,id,onUpdate,onClose}` + setting-key `openMediaEditorModalKey` współzmienne w editor + block-editor + block-library) | blast radius / co-change | tak — kształt szwu integracyjnego | **KANDYDAT C-B** |
| P4c | **Format zapisu** (`[flip,rotate,crop]` modyfikatory w sync między `use-save-media-editor.ts` + `build-modifiers.ts` + serwer `/edit`) | blast radius | częściowo — szew kodu vs kontrakt klient↔serwer | **KANDYDAT C-C** (słaby) |
| P5 | Ryzyko organizacyjne: najgorętszy obszar + grono 2 osób | ryzyko | nie — proces/ludzie, nie kod | **NIE-KANDYDAT** (mnożnik blast radius) |

**Trzej kandydaci do zbadania:** C-A (model stanu), C-B (szew kontraktu modala), C-C (szew formatu zapisu). Nie-kandydaci P1/P2/P3/P5 zachowane jako wejście do oceny: P1/P2/P3 to istniejące (lub brakujące) osłony testowe, które chronią albo nie chronią refaktoru; P5 to mnożnik ryzyka kolizji.

---

## Kandydat C-A — Trójwarstwowy model stanu

### Obecny kształt (z dowodami)

Opis raportu się potwierdza co do joty. Dwa **równoległe** systemy stanu: 4-warstwowy stos cropper/composite przez React context, oraz osobny Redux modal store; plus zewnętrzne `core-data` dla encji attachment. **(evidence)**

- **Warstwa A — pure cropper reducer:** `image-editor/core/state.ts` — `cropperReducer` (`:220`), `enforceContainment` (`:123`), `commitBase` (`:186`), `areCropperStatesEqual` (`:32`), `isStateDirty` (`:471`). Framework-agnostyczny, własny katalog testów.
- **Warstwa A′ — pure hook:** `use-cropper-reducer.ts:96` — `useReducer` (`:99`), baseline `isDirty` (`:109`), `stateRef`/`dispatchAndSync` (`:116-123`), zwraca `CropperController` (`:42`).
- **Warstwa B — composite reducer:** `state/composite-reducer.ts:32` — `mediaEditorReducer`; dokłada `cropOptions.aspectRatioValue`; `SET_ASPECT_RATIO_VALUE` (`:44`), `RESTORE_SNAPSHOT` (`:86`), `VIEWPORT_ADJUST_CROP_RECT` (`:88`), `areMediaEditorStatesEqual` (`:109`).
- **Warstwa B′ — composite hook:** `use-media-editor-state.ts:168` — undo/redo w refach (`historyRef:199`, `redoStackRef:200`), koalescencja gestów (`beginGesture:246`/`endGesture:257`), dedup no-op przez `areMediaEditorStatesEqual` w `dispatchWithHistory:225`. Zwraca `MediaEditorController extends CropperController` (`:97`).
- **Warstwa C — context provider:** `media-editor-state-provider.tsx:16,39,62`. ~70 linii czystego plumbingu, bez bleedu.
- **Osobny modal store:** `store/reducer.ts:9` — `{isOpen,id,onUpdate,onClose}`, czysto lifecycle, zero geometrii. **Słusznie odseparowany.**

**Bleed odpowiedzialności (evidence, chyba że oznaczono):**

- **B1 — geometria przecieka W GÓRĘ do composite reducera:** `composite-reducer.ts:64` woła `computeInscribedRect()` i dispatch'uje syntetyczny `SET_CROP_RECT` (`:65-68`) wewnątrz `SET_ASPECT_RATIO_VALUE`. Helper geometrii (domena warstwy A) wołany z warstwy B.
- **B2 — ta sama geometria przecieka W BOK do widoku:** `cropper.tsx:332,372` niezależnie woła `computeInscribedRect()` przez `adjustCropRectForViewport`, duplikując reshape, który composite reducer już robi. Komentarze komponentu przyznają nakładkę (`cropper.tsx:354-355,320-321`). Reshape inscribed-rect żyje w **3 miejscach**, spójny tylko przez dedup epsilonowy. **(inference)**
- **B3 — dirty/baseline przecieka W DÓŁ do pure hooka:** `use-cropper-reducer.ts:109-163` trzyma baseline + `isStateDirty`, choć komentarz interfejsu (`:36-40`) mówi „History … is intentionally NOT part of this interface". Pure reducer hostuje też `areCropperStatesEqual`/`isStateDirty` (`state.ts:32,471`) — konsumowane wyłącznie przez warstwy wyżej. **(inference)**
- **B4 — kontrakt `CropperController` skażony potrzebami composite:** `use-cropper-reducer.ts:62-70` deklaruje `setVisualSize`/`adjustCropRectForViewport` na **pure** interfejsie, implementuje jako no-op/alias (`:187`,`:191`). Publiczny kontrakt warstwy A′ ukształtowany przez potrzeby B′.
- **B5 — czwarty mechanizm wejściowy (poza listą raportu):** `image-editor/core/interaction-controller.ts:62` — `InteractionController` tłumaczy pointer/wheel/touch/keyboard na podzbiór setterów (`use-interaction.ts:161-172`). Kolejna warstwa, którą gest przemierza, kolejne lustro semantyki setterów. **(inference)**

**Istniejące abstrakcje i powiązania (inwentarz):**

1. **Dziedziczenie `CropperController` → `MediaEditorController`** (`use-media-editor-state.ts:97`) — to **typowanie strukturalne, NIE klasa**: kontroler składany przez spread obiektu (`:426-449`: `...cropperSetters, state: state.cropper`), bez `class`/`super`/prototypu. **Partial migration nie ma twardego węzła do rozplątania.** (evidence)
2. **Wspólna fabryka setterów** `build-cropper-setters.ts:56` — 10 setterów, **dokładnie 2 call-site'y** (`use-cropper-reducer.ts:159`, `use-media-editor-state.ts:284`). Stabilny choke point.
3. **Wzorzec koperty akcji** `{type:'CROPPER', action}` (`types.ts:58-61`), rozpakowywany w `composite-reducer.ts:37-43`. Pozwala B reużyć A w całości.
4. **Powiązanie dedup-equality (kruchość #1):** `areMediaEditorStatesEqual` (`composite-reducer.ts:109`) porównuje tylko `cropper` + `cropOptions.aspectRatioValue` (`:117-118`). Musi być ręcznie w sync z kształtem `MediaEditorState` i z polami `areCropperStatesEqual`. Dodanie pola do `CropOptionsSlice`/`CropperState` cicho psuje dedup no-op i dedup undo — **typ tego nie łapie**. (inference)
5. **`stateRef` (synchroniczny cień) zduplikowany 3×:** `use-cropper-reducer.ts:118-123`, `use-media-editor-state.ts:225-244`, `use-interaction.ts:119-120`. Ten sam idiom, trzy implementacje.

**Hop count gestu → stan:** pojedynczy drag-pan przemierza **~7 hopów** (8 z bocznym kanałem gestu) przez 5 plików: `cropper.tsx` → `use-interaction.ts` → `interaction-controller.ts` → `build-cropper-setters.ts` → `use-media-editor-state.ts` → `composite-reducer.ts` → `state.ts`. Ścieżka pure-hooka (standalone/testy/docs) jest krótsza o 2 hopy (bez koperty, bez wrappera historii). (evidence)

**Czyste vs przypadkowe (per warstwa):**

- **A (cropperReducer + math): GENUINIE CZYSTE, realny szew.** Zostaw. Jedyny zapach: hostowanie equality/dirty dla warstw wyżej (B3).
- **A′ (useCropperReducer): w większości realny szew, ale leaky.** Reużywany poza composite (docs/recipes, testy, `<Cropper>` prop). Kontrakt skażony no-opami (B4) + bookkeeping baseline nakłada się na composite (B3).
- **B (mediaEditorReducer): CIENKI, nie czysty pass-through.** ~70% pass-through; realna wartość dodana to jedno pole slice + atomowy `SET_ASPECT_RATIO_VALUE` (gdzie też bleeduje geometria, B1). **(inference)**
- **B′ (useMediaEditorState): GENUINIE ZŁOŻONY, prawdziwy właściciel semantyki edytora.** Undo/redo, koalescencja, dirty. Legalny szew, ale duplikuje idiom `stateRef` i jest sztywno sprzężony z ręcznie synconymi funkcjami equality.
- **C (provider) i modal store: CZYSTE, uzasadnione.**

**Netto przypadkowa złożoność:** duplikacja A′/B′ (dwa hooki, dwa `stateRef`, dwa baseline'y dirty, dwa niemal-identyczne okablowania setterów spięte tylko fabryką i komentarzami), reshape inscribed-rect w 3 miejscach (B1+B2), oraz ręcznie synchronizowane funkcje equality (#4). Genuine szwy: warstwa A (geometria) i B′ (semantyka sesji edytora).

**Adekwatny docelowy kształt (nazwa, bez projektowania):** *jedna warstwa composite store, której czyste jądro geometrii (A) jest jedynym reducerem, a historia/gesty/dirty są komponowalnym middleware nad nim* — kolaps A′ i B do jednego szwu B′, usunięcie duplikatu pure-hooka.

### Werdykt intencjonalności

**Wszystkie trzy decyzje są świadome i nośne.** Historia jest tu wyjątkowo jawna — jest dedykowany dokument architektury, opisy PR podają uzasadnienie, autor (`ramonjd`) zostawił inline-komentarze czytające się jak notatki ADR. **To NIE jest przypadkowa złożoność.** (evidence)

- **Split pure/composite reducer — ŚWIADOMY szew.** `image-editor/docs/architecture.md:9-11`: *„The cropper layer does not own editor history. History belongs to the composite media editor controller because sidebar controls and cropper gestures need one shared undo stack."* Wprowadzone commitem **`c3bf086499c`** (PR #78480, „Refactor media editor crop state into composite reducer", Ramon, 2026-05-22). Opis PR i inline-komentarze definiują podział: `cropperReducer` = generyczna geometria; `mediaEditorReducer` = kompozycja editor-level + akcje atomowe wielu slice'ów. Reviewer `andrewserong` zatwierdził architektonicznie („sets things up nicely … for extensibility"). Pure hook celowo standalone (Storybook/demo) — realny drugi konsument.
- **Osobny `@wordpress/data` store — ŚWIADOMY decoupling.** Store wprowadzony commitem **`44e61939159`** (PR #77480) jako rusztowanie modala **przed** istnieniem croppingu. PR #77782 (undo/redo): *„the local approach to undo/redo means we don't muddy any entity state and everything can be tossed out when we close the modal."* Świadome: efemeryczny stan in-modal w React, lifecycle w data store, dane persystowane przez `core-data` gdzie indziej.
- **Undo/redo-in-refs — ŚWIADOMY.** Komentarze `use-media-editor-state.ts:198-200`: *„Refs avoid re-renders on every push; a boolean state pair drives … undo/redo buttons."* `stateRef` (`:188-194`) load-bearing dla poprawności (wiele dispatchy w jednym evencie). Ewolucja #77782 (debounce) → #78480 (jawne `beginGesture`/`endGesture`) — strategia refów zachowana celowo.
- **Unknowns (uczciwie):** brak dokumentu/PR jawnie odrzucającego „jeden zunifikowany store" jako alternatywę — werdykt „świadome" opiera się na afirmatywnych uzasadnieniach każdej warstwy, nie na zapisanym porównaniu z designem zunifikowanym. Brak formalnego ADR (rekord rozproszony: architecture.md + opisy PR + inline review).

> **Implikacja dla refaktoru:** warstwy są świadome, ale **przypadkowa złożoność jest w glue między nimi (A′/B′), nie w samym podziale**. Cel kandydata C-A to *zebranie glue*, nie obalenie świadomych szwów — co czyni go bezpiecznym i zgodnym z intencją autorów.

### Notatki o wykonalności

- **Inwentarz testów (zweryfikowany):** 23 pliki testów pod `media-editor/src/` (wszystkie pod `test/`). `cropperReducer` — test bezpośredni (`core/test/state.ts`, 875 L) **i** przez hook (`use-cropper-reducer` test, 1055 L). `useMediaEditorState` — test (330 L). **`mediaEditorReducer` (composite) — BRAK testu bezpośredniego** (prior potwierdzony; jedyny importer = `use-media-editor-state.ts`). **`buildCropperSetters` — BRAK testu bezpośredniego** (prior tego nie flagował). Modal store — test (66 L). (evidence)
- **CI/osłony:** PR uruchamia JS unit (sharded 4×, `unit-test.yml:27-72`), lint JS (`static-checks.yml:82-84`), TS type-check via `build` (`:90-91`). **dependency-cruiser NIE biegnie w CI** (brak skryptu `depcruise`; `.dependency-cruiser.cjs` to lokalny overlay z commita `3d2311195c7`, nie upstream). **Brak reguły eslint/depcruise egzekwującej warstwy media-editora.** **Realny backstop refaktoru stanu = JS unit suite + lint + type-check; granice TS (`CropperController`/`MediaEditorController`/`MediaEditorState`) to jedyna osłona strukturalna.** (evidence/inference)
- **Fan-in (zmierzony, `from '…'`):** `core/types.ts` — 17 importerów (wszystkie wewnątrz pakietu; type-only, najszerszy ale najniższego ryzyka). `core/state.ts` (`cropperReducer`) — **3 produkcyjne importery (raport: 1)** (`use-cropper-reducer.ts:24 (raport: 27)`, `composite-reducer.ts:5`, `transforms/pipeline.ts:6`), plus 2 barrele (`core/index.ts:27`, `image-editor/index.ts:37`) — patrz korekta C3b w sekcji weryfikacji. `state/types.ts` — 4 (wszystkie w `state/`). `composite-reducer.ts` — **1 produkcyjny importer** (`use-media-editor-state.ts:29`, wołany w 3 miejscach: `:171,:228,:301`). **Blast radius warstwy stanu jest CAŁKOWICIE wewnątrz pakietu** — zewnętrzni konsumenci (`editor`, dev-route) dotykają wejść modala/komponentów, nie typów stanu. (evidence)
- **Odwracalność:** **partial migration low-risk.** „Dziedziczenie" to typing strukturalny złożony spreadem (nie klasa) — nic do rozplątania. Każda warstwa ma wąski, pojedynczy produkcyjny importer na granicy. Modal store ortogonalny — zostaje nietknięty. Dwa ryzyka do pilnowania (nie blokujące): (1) `areMediaEditorStatesEqual` ręcznie w sync z polami stanu i reducerem; (2) atomowy kontrakt „jedna transakcja = jeden undo entry" (`composite-reducer.ts:64-72`) weryfikowany dziś tylko przez test hooka, nie reducera.
- **Pierwszy krok-prerekwizyt (NAZWA):** **napisać brakujący characterization test dla `mediaEditorReducer` + `areMediaEditorStatesEqual`** (golden test). Czysty, jeden importer, największa nietknięta powierzchnia behawioralna w łańcuchu; pinuje delegację `CROPPER`, atomowy `SET_ASPECT_RATIO_VALUE`, `RESTORE_SNAPSHOT`, `VIEWPORT_ADJUST_CROP_RECT` i inwariant dedup-equality. Czysto addytywny, w pełni odwracalny. Bez feature flagi na etapie 1 (reducer wewnętrzny, jeden call-site).

---

## Kandydat C-B — Szew kontraktu modala (cross-package)

### Obecny kształt (z dowodami)

- **Kształt store (potwierdzony `{isOpen,id,onUpdate,onClose}`):** `store/reducer.ts:9-21`; name `core/media-editor` (`constants.ts:1`); selektory 1:1 (`selectors.ts:6,10,14,18`). **(evidence)**
- **Sygnatury akcji:** `openMediaEditorModal({id,onUpdate?,onClose?})` → `OPEN_MEDIA_EDITOR_MODAL` (`actions.ts:21-32`); `closeMediaEditorModal()` (`:34-36`). **Drugi, ciaśniejszy kontrakt:** payload `onUpdate` = `MediaEditorModalUpdate = {id:number; url?:string}` (`actions.ts:10-13`), celowo znormalizowany (`url`, nie REST-owy `source_url`). **(evidence)**
- **Lock private-API:** dokładnie `{store, MediaEditor, MediaEditorModal}` (`private-apis.ts:9-14`). **(evidence)**
- **Pełny zbiór co-change** (5 pakietów; lockstep przy zmianie kształtu open lub payloadu):

| Pakiet | File:line | Symbol / rola |
|---|---|---|
| `media-editor` | `store/actions.ts:21,34`, `reducer.ts:9`, `selectors.ts:6-18`, `private-apis.ts:10` | źródło prawdy |
| `editor` | `use-block-editor-settings.js:20,283,354-355` | import `mediaEditorPrivateApis`, dispatch `openMediaEditorModal`, **rejestracja pod `[openMediaEditorModalKey]`** |
| `editor` | `media/media-editor-modal.js`, mount w `provider/index.js:48,454` | `MediaEditorModalMount` mostkuje `usePostFields('attachment')` |
| `block-editor` | `store/private-keys.js:19`; `private-apis.js:55,141` | definicja + eksport symbolu `openMediaEditorModalKey` (pass-through, nigdy nie odczytuje) |
| `block-library` (image) | `use-open-image-media-editor-modal.js:106,151,346-350` | odczyt klucza z `getSettings()`, wołanie; `onUpdate` = sync alt/caption (`:249-316`) |
| `block-library` (site-logo) | `site-logo/edit.js:55,102,410-415` | ta sama ścieżka; `onUpdate` = `setLogo(newId)` (`:122-126`) |

**Łańcuch indirekcji (block-library NIE importuje media-editora):** `media-editor` *definiuje* akcję → `editor` ją *importuje, dispatch'uje i re-rejestruje* pod symbolem block-editora → `block-editor` *posiada symbol* (`private-keys.js:19`) ale nigdy nie importuje media-editora → `block-library` *odczytuje symbol z settingsów* (`use-open-image-media-editor-modal.js:151`). Funkcja podróżuje jako runtime-data przez `getSettings()[openMediaEditorModalKey]`. **(evidence)**

**Charakterystyka coupling-shape:** kontrakt dwupoziomowy (`{id,onUpdate,onClose}` + `{id,url}`), oba **restated/ręcznie kopiowane na 3 hopach bez wspólnego typu** (block-library to JS; `OpenMediaEditorModalArgs` z `actions.ts:15` nie jest eksportowany). Symbol-key = „wąska talia" kontraktu (4 pliki produkcyjne). Block-editor niesie symbol, którego nigdy nie czyta — czysty kanał. (evidence + inference)

**Werdykt: szew architektonicznie WYMUSZONY, nie przypadkowa złożoność.** `block-library` i `block-editor` (WP-agnostyczny) legalnie NIE MOGĄ importować `@wordpress/media-editor` (WP-aware: zależy od `core-data`, `dataviews`, REST). *Jakaś* iniekcja runtime przez block-editor settings jest **wymagana** regułami warstw — ten sam wzorzec co `mediaEditKey`, `mediaUploadOnSuccessKey` w tym samym obiekcie settingsów (`private-keys.js:9-18`). **Adekwatny docelowy kształt (nazwa):** *jeden współdzielony, otypowany kontrakt „media-editor open" wstrzykiwany raz jako setting block-editora* — kolaps ręcznie kopiowanych literałów do jednego eksportowanego typu. **unknown:** czy otypowany kontrakt da się współdzielić bez type-zależności block-library od media-editora.

### Werdykt intencjonalności

**Świadomy most wymuszony regułą warstw — UDOWODNIONE** (commit + komentarze + graf importów zbiegają się). (evidence)

- **Reguła:** `AGENTS.md:64` — *„Lower layers MUST NOT depend on higher ones"*; `AGENTS.md:78` — *„`block-editor` is a WordPress-agnostic package."*
- **Komentarze-dowody w kodzie:** `editor/.../media-editor-modal.js:51-52` i `media-editor/.../media-editor-modal/index.tsx:26` — *„since `@wordpress/media-editor` cannot depend on `@wordpress/editor`"*. `media-editor/store/actions.ts:1-8` — payload znormalizowany *„leaves room to reuse the modal outside a WordPress REST context (e.g. native/Electron hosts)"*.
- **Jeden commit wprowadzający atomowo** store + symbol + rejestrację + konsumenta: **`44e61939159`** (PR #77480, Andrew Serong). PR opisuje trójhopowy plan wprost. Co-change'e `898fda7c463` (onClose/focus return) i `5a4d70d134c` (undo snackbar) **rozszerzają** ten sam szew — nie ujawniają innego uzasadnienia (szew stabilny, nie churn).
- **Audyt cross-import (evidence):** `block-library/`→media-editor: **0**; `block-editor/src/`→media-editor: **0**; `editor/package.json`: **zależy** (jedyny legalny konsument w górę); `media-editor/src/`→block-editor/editor/block-library: **0** (tylko komentarz tłumaczący dlaczego nie może). Graf dokładnie taki, jaki reguła przepisuje.
- **Caveat:** brak inline-review jawnie cytującego „layer boundary" w wątku PR #77480 (tylko approval); werdykt opiera się na komentarzach w kodzie + regule AGENTS.md + grafie, nie na dyskusji review.

### Notatki o wykonalności

- **Egzekwowanie reguły:** **NIE mechanicznie w CI** — `.dependency-cruiser.cjs` koduje reguły warstw (`:19-61`) ale to lokalny overlay (commit `3d2311195c7`), bez skryptu `depcruise`, bez referencji w workflow; brak reguły eslint `import/no-restricted-paths`. Egzekwowanie = code review + dokumentacja + faktyczny graf importów. (evidence/inference)
- **Osłony/testy:** `store/test/reducer.ts` pinuje kształt `{isOpen,id,onUpdate,onClose}`. `block-library/.../test/use-open-image-media-editor-modal.js` (893 L) pinuje payload od strony konsumenta. **E2E ISTNIEJE — prior raport BŁĘDNY:** `test/e2e/specs/editor/blocks/image.spec.js:244` (*„allows rotating an image using the media editor modal"*) ćwiczy **cały szew** end-to-end (block-library → setting → store → modal → onUpdate → setAttributes), `:273` klika Crop, `:286-295` asercja id/url. **Brak** e2e dla ścieżki site-logo. Brak testu dla `use-block-editor-settings.js` (rejestracja settinga niepokryta w izolacji). Brak katalogu test dla site-logo. (evidence)
- **Blast radius (skorygowany):** **~4 pakiety, ~10 plików produkcyjnych** (media-editor store + editor **3 punkty wpięcia, nie 2** — prior niedoliczył `provider/index.js` mount + block-editor 2 pliki plumbingu + block-library 2 konsumenci) + 2 pliki testów.
- **Viable-or-not:** **szew SAM W SOBIE nie jest viable do uproszczenia — rekomendacja: ODRZUCIĆ.** Każde „oczywiste" uproszczenie łamie regułę warstw (block-library importujący media-editor; przeniesienie store do block-editora; itd.). Kontrakt już minimalny i otypowany po stronie media-editora.
- **Realny, layer-safe cel (faktyczna okazja, ODRĘBNA od szwu):** **duplikacja między dwoma konsumentami block-library.** `use-open-image-media-editor-modal.js:249-316` (`handleMediaUpdate`) vs `site-logo/edit.js:122-126` — oba implementują ten sam handler kontraktu `onUpdate` + ten sam open-call shape z `onClose: () => ref.focus()` (`:346-350` vs `:408-422`). **Pierwszy krok (NAZWA):** wyekstrahować wspólny open-call + guard `typeof id === 'number'` + focus-return do jednego hooka wewnątrz block-library, generalizując istniejący `useOpenImageMediaEditorModal`; sync metadanych zostaje rozszerzeniem image-specific. Czysto wewnątrz-pakietowy, odwracalny; chroniony istniejącym testem hooka + `image.spec.js:244`. Drugi mały krok: dodać test rejestracji settinga w `use-block-editor-settings.js`.

---

## Kandydat C-C — Szew formatu zapisu

### Obecny kształt (z dowodami)

- **Ścieżka zapisu (`use-save-media-editor.ts`, evidence):** whitelist metadanych `[title,caption,description,alt_text,post]` (`:23-29`); `getCropModifiers` zwraca `[]` gdy nie-dirty, inaczej `buildModifiers(cropper.state, {width,height})` (`:59-67`); carry-over `post` gdy nieedytowany (`:69-87`, bo `/edit` tworzy NOWY attachment bez `post_parent`); POST body `{src, modifiers, ...metadataEdits}` → `/wp/v2/media/${id}/edit` (`:129-137`); branching crop (`modifiers.length>0` → POST + `receiveEntityRecords(... true)` `:119-147`) vs metadata-only (`saveEditedEntityRecord` `:148-154`); `onSaved` = `{id,url,media,previous}` (`:166-171`).
- **Mapa lokalizacji schematu modyfikatorów:** schemat REST `[flip,rotate,crop]` zakodowany w **dokładnie jednym miejscu** — `build-modifiers.ts` (typ `:23-32`, emiter `:81-164`, inwersja znaku rotacji `:102-109`, normalizacja crop-percent `:140-149`). `use-save-media-editor.ts` jest schema-agnostyczny (spread opaque). Body-envelope `{src,modifiers,...meta}` + whitelist tylko w `use-save-media-editor.ts`. **Wiedza o schemacie i o envelope czysto rozdzielona, po jednym miejscu.** (evidence)
- **Preview ↔ export — WSPÓLNE JĄDRO, nie duplikat geometrii:** export renderer i builder modyfikatorów wywodzą się z tej samej fabryki macierzy — `canvas-renderer.ts:62` woła `createExportCamera`; `build-modifiers.ts:5,112,117` używa `getRotatedBBox` i odwraca tę samą kompozycję `createExportCamera`. Live DOM preview (`transform-style.ts:28`) = trzecia ekspresja tego samego łańcucha („Must match the matrix order in `createCamera`"). **Trzy powierzchnie (CSS preview / canvas export / server modifiers) zakotwiczone w jednym porządku kompozycji z `camera.ts`.** To inherentny split client-preview/server-authority, nie dwie rozjeżdżające się implementacje. (evidence)
- **Dwie siatki parity:** `core/test/preview-export-parity.ts` (preview↔export camera, ~2016 rows) + `build-modifiers-test` (export↔**reverse-symulacja serwerowego `[flip,rotate,crop]`**, `serverSourcePixel`). Siatka liczy się do **~6048-6055 przypadków** (8 rot × 3 zoom × 3 pan × 4 flip × 3 crop × 7 probes) — prior „~2352" nie zgadza się z obecną siatką (rozszerzona po raporcie). Test **nie woła serwera** — ręcznie odtwarza matematykę Core w JS i asercjuje do 1px. (evidence; korekta prioru)

### Werdykt intencjonalności

**Format modyfikatorów jest ZEWNĘTRZNYM, prefiniowanym kontraktem API WordPress Core — świadomy i nośny, NIE przypadkowa złożoność kodu.** (evidence)

- Commit wprowadzający dosłownie zatytułowany **„Media Editor Modal: save via Core's /edit modifiers"** (`773d176d189`, PR #77641). Plik dokumentuje kontrakt i wskazuje serwer jako autorytet od pierwszej wersji: *„Order is significant — the server applies modifiers sequentially (see `WP_REST_Attachments_Controller::edit_media_item`)"*; *„rotate … Core negates it internally for `WP_Image_Editor::rotate`"*; crop = procenty względem post-rotate AABB.
- **Endpoint i semantyka `[flip,rotate,crop]` żyją w WordPress Core**, nie w pakiecie. Gutenbergowy shim PHP `lib/media/class-gutenberg-rest-attachments-controller.php` nadpisuje tylko sub-size/permission/EXIF (`:104,276,387,555`), **NIE pipeline modyfikatorów** — kontrakt nie da się zmienić od wewnątrz Gutenberga.
- **Dowód, że kontrakt poprzedza pakiet:** legacy `block-editor/.../image-editor/use-save-image.js` buduje **identyczny** kształt `{type:'rotate',args:{angle}}`/`{type:'crop',args:{...}}`, POST-uje `{src,modifiers}`, tę samą tolerancję 0.1%, tę samą semantykę pustej tablicy → skip. Nowy pakiet konformuje do kontraktu, który istniał wcześniej.
- **Brak śladu bug-fixów na porządku/znaku:** `git log -S` dla `signedAngle`/`360 - rawAngle`/`flip, rotate, crop` zwraca **tylko** commit wprowadzający — porządek i inwersja znaku wyprowadzone poprawnie **z góry** z kontraktu, nie reverse-engineerowane przez serię korekt → świadomy design.
- **Siatka parity = świadoma inwestycja** w pilnowanie kontraktu (header testu deklaruje cel: „what the user framed … is what the server crops"). Split preview/authority intencjonalny: canvas to tylko podgląd, serwer renderuje autorytatywnie.
- **unknown:** `gh` nieuwierzytelniony w jednym przebiegu — treść dyskusji review PR #77641 nieodczytana; werdykt oparty na tytułach commitów, komentarzach w źródle/teście (obecnych od pierwszego commita), referencji do Core PHP i legacy `use-save-image.js`.

### Notatki o wykonalności

- **Asymetria osłon (kluczowy fakt):** serializacja **mocno** osłonięta (`build-modifiers-test`, siatka ~6k), **orkiestracja zapisu `use-save-media-editor.ts` — 0 testów**. canvas-renderer — test (813 L). (evidence)
- **CI:** JS unit (`unit-test.yml` job `unit-js`) i PHP unit (job `unit-php`, `npm run test:unit:php`) biegną na PR. **Brak testu PHP pinującego kontrakt `/edit`** w tym repo — `phpunit/.../class-gutenberg-rest-attachments-controller-test.php` (1610 L) pokrywa `create_item`/`sideload`/`finalize`/EXIF, zero `/edit`. Kontrakt serwerowy crop/rotate/flip **niepinowany po stronie PHP w tym repo** (żyje w wordpress-develop core). Brak e2e ćwiczącego save media-editora. (evidence)
- **Centralizacja + blast radius:** schemat modyfikatorów **scentralizowany** dla media-editora (producent `build-modifiers.ts:23-32,96/108/152`; jedyny konsument `use-save-media-editor.ts:63→134→130`). **Ale istnieje równoległa, niezsynchronizowana implementacja TEGO SAMEGO kontraktu poza media-editorem:** legacy `block-editor/.../use-save-image.js:60-103` buduje własną tablicę `[rotate,crop]` (bez flip) i zapisuje przez `core-data` action `editMediaEntity` (`private-actions.js:52-101`). Kontrakt `{type,args}` zduplikowany w dwóch niezsynchronizowanych implementacjach klienckich (każda scentralizowana w swoim pakiecie). **Nie mylić** z wewnętrznym kształtem cropper-pipeline `image-editor/core/types.ts:57-59` (`{type:'crop',rect}` itd.) — to inny, klient-wewnętrzny słownik. (evidence)
- **Drugi wewnętrzny zapach (latent drift):** `source-region.ts` — `getSourceRegion`/`getSourceRegionPercent` (`:51-128,:159-173`) reklamują kompatybilność `/edit` (docs `architecture.md:52`, `recipes.md:119`) ale **nie są** enkoderem używanym przez ścieżkę zapisu (`buildModifiers` jest) i **nie niosą** inwersji znaku rotacji dla single-axis flip. Dwa równoległe enkodery kontraktu crop→percent: żywy (`buildModifiers`) i udokumentowany-ale-nieużywany-do-zapisu (`getSourceRegionPercent`). (inference)
- **PIVOTAL VERDICT: server-dictated + scentralizowany → ODRZUCIĆ jako refaktor strukturalny.** Porządek `[flip,rotate,crop]` i jednostki ustalone przez Core; refaktor kliencki nie zmieni formatu bez złamania API. Brak „rozproszonego schematu do scentralizowania" wewnątrz media-editora. **Szew kolapsuje w problem nietestowanej ścieżki zapisu** (P1) — `use-save-media-editor.ts` (0 testów): whitelist + carry-over `post` (`:74-85`), gałąź `modifiers.length===0` (`:119/:148`), swap id / `clearEntityRecordEdits` / `cropper.reset()` (`:156-165`), scoping notice błędu (`:173-195`).
- **Pierwszy krok IF jakakolwiek praca (NAZWA — to zadanie pokryciowe, nie refaktor):** **characterization test `use-save-media-editor.ts`** — mock `apiFetch` + dispatch'ów core-data/notices, pinujący POST body (`/wp/v2/media/${id}/edit`, `{src,modifiers,...whitelisted}`), whitelist + carry-over `post`, gałąź no-modifiers przez `saveEditedEntityRecord`, swap id / reset / payload `onSaved`. Domyka asymetrię (serializer pilnowany, sender nie) bez dotykania formatu.
- **Opcjonalny, niskiej wartości cleanup (flaga, nie wymagane):** unifikacja `getSourceRegionPercent` z `buildModifiers` (jeden enkoder crop→percent) — czysto wewnątrz media-editora. Unifikacja `build-modifiers.ts` ↔ legacy `use-save-image.js` to zmiana **cross-layer** (`media-editor` vs `block-editor` musi zostać WP-agnostyczny) → poza zakresem tego szwu, unknown-benefit.

---

## Refactor opportunities (ranking — propozycja dla sesji planowania)

> Ranking to **propozycja**, nie decyzja. Zapadnie ona w osobnej sesji planowania po lekturze. Oceniany na dowodach: koszt długu vs koszt zmiany, blast radius, ścieżka inkrementalna, pierwszy krok-prerekwizyt.

### #1 — Kolaps glue modelu stanu (C-A: zebranie warstw A′/B′ + jednoźródłowy reshape + osłonięcie equality)

- **Obecny → docelowy:** dziś 4 warstwy stanu + osobny store, z przypadkową złożonością w glue (A′/B′ duplikacja `stateRef`/dirty/okablowania setterów, reshape inscribed-rect w 3 miejscach B1+B2, ręcznie synchronizowane funkcje equality #4). Docelowo: *jedna warstwa composite, czyste jądro geometrii (A) jako jedyny reducer, historia/gesty/dirty jako komponowalne middleware* — kolaps A′ i B do jednego szwu B′; usunięcie duplikatu pure-hooka. **Świadome szwy (A geometria, B′ semantyka edytora) zostają — zbierane jest tylko glue.**
- **Dlaczego #1 (koszt długu vs koszt zmiany):** to **jedyny kandydat będący prawdziwym długiem strukturalnym, którego naprawa nie łamie reguły ani kontraktu zewnętrznego.** Koszt długu realny i powtarzalny: każde nowe pole stanu wymaga ręcznej edycji reducera + dwóch funkcji equality + typów (czego typ nie łapie) — kruchość udokumentowana, nie hipotetyczna. Koszt zmiany **niski**: blast radius całkowicie wewnątrz pakietu; „dziedziczenie" to typing strukturalny złożony spreadem (brak klasy do rozplątania); każda warstwa ma pojedynczy produkcyjny importer na granicy. Intencja autorów (composite jako właściciel kompozycji) **wspiera** kierunek.
- **Blast radius:** wewnątrz `media-editor/src` (fan-in: `core/types.ts` 17 type-only; `core/state.ts` i `composite-reducer.ts` po 1 produkcyjnym importerze). Zewnętrzni konsumenci nie dotykają typów stanu. Mnożnik ryzyka: P5 (grono 2 os., Ramon owner) → **koordynacja z Ramonem obowiązkowa** (to on jest autorem composite reducera).
- **Szkic inkrementalny:** (1) characterization test `mediaEditorReducer` + `areMediaEditorStatesEqual` [prerekwizyt]; (2) test bezpośredni `buildCropperSetters`; (3) zebrać reshape inscribed-rect do jednego miejsca (reducer), usuwając duplikaty w `cropper.tsx` chronione dziś dedupem; (4) skonsolidować dirty/baseline; (5) rozważyć middleware-izację historii/gestów nad jądrem. Każdy krok addytywny i odwracalny.
- **Pierwszy krok-prerekwizyt:** **characterization (golden) test `mediaEditorReducer` + `areMediaEditorStatesEqual`** — pinuje delegację `CROPPER`, atomowy `SET_ASPECT_RATIO_VALUE`, snapshot/viewport, inwariant dedup; czysto addytywny.

### #2 — Dedup konsumentów block-library (wynik C-B, ODRĘBNY od szwu)

- **Obecny → docelowy:** dziś `image/use-open-image-media-editor-modal.js` i `site-logo/edit.js` duplikują handler `onUpdate` (guard `typeof id === 'number'`) + open-call shape z `onClose: () => ref.focus()`. Docelowo: *jeden hook wewnątrz block-library* opakowujący wspólny open-call + guard + focus-return; sync metadanych zostaje rozszerzeniem image-specific.
- **Dlaczego #2:** realny, **layer-safe** dług (czysta duplikacja, niski koszt zmiany, czysto wewnątrz-pakietowy, odwracalny) — ale **mniejszy zasięg** i mniej dotkliwy niż C-A. **Sam szew kontraktu modala ODRZUCONY** (architektonicznie wymuszony, patrz niżej); to jego jedyna legalna pochodna wartościowa do tknięcia.
- **Blast radius:** wewnątrz `block-library` (2 konsumenci). Chroniony istniejącym testem hooka (893 L) + **e2e `image.spec.js:244`** (ścieżka image). Brak osłony site-logo → uwaga.
- **Szkic inkrementalny:** (1) wyekstrahować wspólny open-call + guard do hooka block-library; (2) `site-logo/edit.js` konsumuje hook; (3) opcjonalnie dodać e2e site-logo / test rejestracji settinga `use-block-editor-settings.js`.
- **Pierwszy krok-prerekwizyt:** ekstrakcja wspólnego open-call + guard `typeof id === 'number'` + focus-return `onClose` do jednego hooka block-library, generalizując istniejący `useOpenImageMediaEditorModal`.

> **Brak silnego kandydata #3.** Trzeci slot świadomie pusty: pozostałe problemy to albo odrzucone szwy (C-B core, C-C), albo nie-kandydaci (P1/P2/P3 = pokrycie testowe, P5 = proces). Wymuszanie #3 sprzeciwiałoby się dowodom.

### Kandydaci rozważeni i ODRZUCENI

- **C-B (szew kontraktu modala) — ODRZUCONY jako refaktor.** Indirekcja `openMediaEditorModalKey` jest **architektonicznie wymuszona** regułą warstw (`AGENTS.md:64,78`; udowodnione komentarzami w kodzie + grafem importów: block-library/block-editor → media-editor = 0). To nie przypadkowa złożoność, to dependency-inversion przez fixed boundary — ten sam wzorzec co `mediaEditKey`/`mediaUploadOnSuccessKey`. Każde uproszczenie szwu łamie regułę. *Pochodna wartościowa* (dedup konsumentów) wyodrębniona jako opportunity #2.
- **C-C (szew formatu zapisu) — ODRZUCONY jako refaktor strukturalny.** Format `[flip,rotate,crop]` to **zewnętrzny kontrakt REST API WordPress Core** (`WP_REST_Attachments_Controller::edit_media_item`), do którego klient konformuje (kontrakt poprzedza pakiet — legacy `use-save-image.js` już go realizował). Już scentralizowany w jednym pliku, pilnowany siatką parity ~6k. **Nie da się go „odsprząc" bez zmiany tego, co Core akceptuje — to redesign cross-system, poza granicą refaktoru kodu (STOP, zgodnie z twardą granicą zadania).** Szew kolapsuje w nie-kandydata P1 (nietestowana ścieżka zapisu). Drobne wewnętrzne zapachy (duplikat enkodera `getSourceRegionPercent`; równoległy `use-save-image.js` w block-editorze) odnotowane jako opcjonalny, niskiej wartości cleanup — nie refaktor strukturalny.
- **P1/P2/P3 (luki testowe) — NIE-KANDYDACI.** To zadania pokryciowe, nie zmiany kształtu kodu. **Ale są prerekwizytami:** characterization testy `mediaEditorReducer` (C-A) i `use-save-media-editor.ts` (P1, do którego kolapsuje C-C) to dokładnie pierwsze kroki, które czynią jakikolwiek późniejszy refaktor obserwowalnym i odwracalnym. Najlepszy ROI testowy: ścieżka zapisu (`use-save-media-editor.ts`, 0 testów) + composite reducer (0 testów bezpośrednich) + `buildCropperSetters` (0 testów).
- **P5 (ryzyko organizacyjne) — NIE-KANDYDAT, mnożnik.** Grono 2 os. (Ramon owner crop/zoom/reducer/a11y; Andrew Serong drugi filar) → koordynacja z Ramonem przy C-A obowiązkowa; nie problem do refaktoru, lecz ograniczenie wykonalności każdego z powyższych.

---

## Weryfikacja twierdzeń (ast-grep)

Twierdzenia STRUKTURALNE, na których stoi ranking (liczby metod, „nadpisuje X, ale nie Y", liczność call-site'ów, pary lustrzanych typów), zweryfikowane narzędziem **`ast-grep 0.43.0`** na commicie `3d2311195c74d86fac6f5e05350d1e1210136c60`. **Reguła z lekcji [[astgrep-zero-confirm-with-grep]]:** każde zero z ast-grep potwierdzone klasycznym `grep` — bo ast-grep na niektórych kształtach (literał string-owy, member-y typu strzałkowego w `interface`) daje fałszywe zera na tej wersji gramatyki.

| # | Twierdzenie (strukturalne) | Werdykt | Dowód (plik:linia) | Metoda (wzorzec / reguła) |
|---|---|---|---|---|
| S1a | `CropperSetters` = **10 setterów** (fabryka `buildCropperSetters`) | **potwierdzone** | 10 member-ów interfejsu `build-cropper-setters.ts:24-33` + 10 kluczy zwracanego obiektu `:61-99` | ast-grep `property_signature inside interface` → **0 (fałszywe)**; grep `^\s+(setPan\|…):` → 10 |
| S1b | `buildCropperSetters` wołany w **dokładnie 2 call-site'ach** | **potwierdzone** | `use-cropper-reducer.ts:159`, `use-media-editor-state.ts:284` (def. `:56`) | ast-grep `buildCropperSetters($$$)` (2 trafienia, bez def.) + grep zgodny |
| S2 | `MediaEditorController extends CropperController` = **typing strukturalny, NIE klasa**; kontroler składany **spreadem** | **potwierdzone** | `interface MediaEditorController extends CropperController` `use-media-editor-state.ts:97`; spread `...cropperSetters` `:430`, `state: state.cropper` `:431`; **0** `class`/`super` w pliku | ast-grep `class $N extends $B {…}` → **0 (prawdziwe)**; grep `\bclass\b\|\bsuper\b` → 0; grep `...cropperSetters` → :430 |
| S3a | `mediaEditorReducer` — **1 produkcyjny importer** | **potwierdzone** | `use-media-editor-state.ts:29` (+ barrel `state/index.ts:11`); wołany w `:171,:228,:301` | grep `mediaEditorReducer` w `packages/` — 1 import prod. + 1 barrel |
| **S3b** | `cropperReducer` (`core/state.ts`) — **„1 produkcyjny importer (`use-cropper-reducer.ts:27`)"** | **OBALONE / skorygowane** | **3** prod. importery: `use-cropper-reducer.ts:24`, `composite-reducer.ts:5`, `transforms/pipeline.ts:6` (+ barrele `core/index.ts:27`, `image-editor/index.ts:37`). Linia importu = **:24**, nie :27 | grep `\bcropperReducer\b` w `packages/` (pełna lista importów) |
| S4 | `core/types.ts` — **17 importerów**, wszystkie wewnątrz pakietu | **potwierdzone** | 17 plików w `media-editor/src/` (lista w korekcie fan-in); 0 poza pakietem | grep `-l "from '…core/types'"` → 17 |
| S5 | `areMediaEditorStatesEqual` porównuje **tylko** `cropper` + `cropOptions.aspectRatioValue` | **potwierdzone** | `composite-reducer.ts:117-118` (dwa warunki, koniunkcja) | odczyt bezpośredni `:109-120` |
| S6 | Granica warstw: block-library/block-editor → `@wordpress/media-editor` = **0**; media-editor → block-editor/editor/block-library = **0** | **potwierdzone** | `block-library/src` 0, `block-editor/src` 0, `block-library/package.json` 0; `media-editor/src` 0 importów (tylko komentarz w `.tsx` o `@wordpress/editor`) | grep `from '@wordpress/media-editor'` → **0 (prawdziwe, potwierdzone grepem)** w obu pakietach; grep odwrotny w media-editor → 0 |
| S7 | B5: `InteractionController` mapuje **PODZBIÓR** setterów (nie pełną fabrykę 10) | **potwierdzone** | `CropperInteractionActions` `interaction-controller.ts:62` = `setPan,setZoom,setZoomAtPoint,snapRotate90,toggleFlip?` (`:64-76`) — **5 z 10**, brak `setRotation/setFlip/setCropRect/settleCrop/applyOperation` | grep member-ów interfejsu |
| S8 | B1/B2: `computeInscribedRect` wołany w **3 miejscach** (reshape zduplikowany) | **potwierdzone** | `composite-reducer.ts:64`, `cropper.tsx:332`, `cropper.tsx:372` | ast-grep `computeInscribedRect($$$)` (3 trafienia, bez def.) + grep zgodny |
| S9 | C-C: `build-modifiers.ts` = jedyny enkoder **`[flip,rotate,crop]`**; legacy `use-save-image.js` = **`[rotate,crop]` bez flip** | **potwierdzone** | push: `flip` `build-modifiers.ts:96-97`, `rotate` `:108`, `crop` `:152-153`; legacy `use-save-image.js:64 (rotate),:75 (crop)`, **brak** `flip` | grep `type: '(flip\|rotate\|crop)'` w obu plikach |
| S10 | Para lustrzanych typów (interface extension chain) | **potwierdzone+rozszerzone** | **Trzypoziomowy łańcuch:** `CropperSetters` ← `CropperController extends CropperSetters` `use-cropper-reducer.ts:42` ← `MediaEditorController extends CropperController` `use-media-editor-state.ts:97` | grep `interface … extends …` |

**Wynik netto:** **10 potwierdzonych** (w tym S10 rozszerzone o trzeci poziom łańcucha typów), **1 obalone** (S3b). Jedyny błąd merytoryczny: liczność importerów `cropperReducer` i numer linii importu.

### Wpływ na ranking (do decyzji na etapie planowania)

Korekta S3b **nie obala** pozycji #1 (C-A), ale **niuansuje** jeden argument za nią:

- Raport (sekcja feasibility i blast-radius #1) opiera odwracalność C-A m.in. na tezie „każda warstwa ma wąski, **pojedynczy** produkcyjny importer na granicy". Dla `composite-reducer`/`mediaEditorReducer` to **prawda** (1 importer). Dla `cropperReducer` to **nieprawda** — ma **3** produkcyjne importery (`use-cropper-reducer`, `composite-reducer`, `transforms/pipeline`). Konsekwencja: tknięcie *sygnatury* `cropperReducer` przy konsolidacji warstw dotyka 3, nie 1 miejsca.
- **Dlaczego pozycja #1 się broni mimo to:** (a) wszystkie 3 importery są **wewnątrz `media-editor/src`** — blast radius pozostaje całkowicie wewnątrz-pakietowy, zgodnie z głównym argumentem rankingu; (b) docelowy kształt C-A zakłada zachowanie czystego jądra geometrii (warstwa A = `cropperReducer`) jako jedynego reducera — konsolidacja zbiera glue *nad* nim (A′/B′), więc sam `cropperReducer` jest punktem **docelowym**, nie usuwanym; trzej jego konsumenci to dokładnie te ścieżki, które mają się do niego zbiegać.
- **Adnotacja:** czy `transforms/pipeline.ts` (trzeci, „cichy" konsument `cropperReducer`, poza osią cropper/composite) wymaga osobnego potraktowania w ścieżce inkrementalnej — **do decyzji na etapie planowania**. Nie zmienia pozycji #1, ale dodaje jeden węzeł do szkicu migracji, którego raport nie uwzględniał.

> Zgodnie z poleceniem: sekcja „Refactor opportunities (ranking …)" oraz werdykty intencjonalności pozostały **niezmienione**; powyższy wpływ na ranking opisano wyłącznie tutaj, z adnotacją „do decyzji na etapie planowania". Linia 199 (blast-radius #1, „po 1 produkcyjnym importerze") celowo nietknięta — jej doprecyzowanie należy do tej sekcji: dla `composite-reducer` teza trzyma (1), dla `cropperReducer` nie (3, wszystkie wewnątrz pakietu).

---

## Code References

- `packages/media-editor/src/image-editor/core/state.ts:220` — `cropperReducer` (pure geometry); `:123` `enforceContainment`; `:32` `areCropperStatesEqual`; `:471` `isStateDirty`
- `packages/media-editor/src/state/composite-reducer.ts:32` — `mediaEditorReducer`; `:44` atomowy `SET_ASPECT_RATIO_VALUE`; `:64` bleed `computeInscribedRect` (B1); `:109` `areMediaEditorStatesEqual` (kruchość #4)
- `packages/media-editor/src/state/use-media-editor-state.ts:97` — `MediaEditorController extends CropperController` (typing strukturalny); `:198-220` undo/redo-in-refs; `:426-449` montaż przez spread
- `packages/media-editor/src/image-editor/react/hooks/use-cropper-reducer.ts:42` — `CropperController`; `:62-70` no-opy composite (B4); `:109-163` baseline/dirty (B3)
- `packages/media-editor/src/image-editor/react/hooks/build-cropper-setters.ts:56` — fabryka setterów (2 call-site'y; 0 testów bezpośrednich)
- `packages/media-editor/src/image-editor/core/interaction-controller.ts:62` — czwarty mechanizm wejściowy (B5)
- `packages/media-editor/src/image-editor/react/components/cropper.tsx:332,372` — duplikat reshape inscribed-rect (B2)
- `packages/media-editor/src/image-editor/docs/architecture.md:9-11` — uzasadnienie shared undo stack (intencja C-A)
- `packages/media-editor/src/store/{reducer,actions,selectors}.ts` — modal store `{isOpen,id,onUpdate,onClose}`; `actions.ts:10-13` payload `MediaEditorModalUpdate`
- `packages/media-editor/src/private-apis.ts:9-14` — lock `{store, MediaEditor, MediaEditorModal}`
- `packages/editor/src/components/provider/use-block-editor-settings.js:20,283,354-355` — import + dispatch + rejestracja `openMediaEditorModalKey`
- `packages/editor/src/components/media/media-editor-modal.js:51-52` — komentarz granicy warstw (intencja C-B)
- `packages/editor/src/components/provider/index.js:48,454` — mount `MediaEditorModalMount` (3. punkt wpięcia editor)
- `packages/block-editor/src/store/private-keys.js:19` — symbol `openMediaEditorModalKey` (pass-through)
- `packages/block-library/src/image/use-open-image-media-editor-modal.js:249-316,346-350` — handler `onUpdate` + open-call (dedup target #2)
- `packages/block-library/src/site-logo/edit.js:122-126,410-415` — duplikat handlera + open-call (dedup target #2)
- `packages/media-editor/src/components/media-editor/use-save-media-editor.ts:23-29,129-137,166-171` — whitelist + POST `/edit` + `onSaved` (0 testów; P1)
- `packages/media-editor/src/components/media-editor-modal/build-modifiers.ts:23-32,81-164` — jedyny enkoder `[flip,rotate,crop]` (kontrakt Core)
- `packages/media-editor/src/image-editor/core/source-region.ts:159-173` — `getSourceRegionPercent` (równoległy enkoder, drift; inference)
- `packages/block-editor/src/components/image-editor/use-save-image.js:60-103` — legacy enkoder `[rotate,crop]` (dowód, że kontrakt poprzedza pakiet)
- `lib/media/class-gutenberg-rest-attachments-controller.php` — shim PHP (tylko permission/sub-size; pipeline `/edit` = Core)
- `test/e2e/specs/editor/blocks/image.spec.js:244` — e2e crop przez modal (korekta prioru: e2e ISTNIEJE)
- `.github/workflows/unit-test.yml:27-72` (`unit-js`), `:356` (`unit-php`) — osłony CI
- `AGENTS.md:64,78` — reguła warstw (wymusza szew C-B)

## Architecture Insights

- **Świadomy split ≠ brak długu.** Wszystkie trzy szwy są intencjonalne i nośne (architecture.md + opisy PR + inline review), ale przypadkowa złożoność żyje w **glue między warstwami** (C-A), nie w samym podziale. Refaktor wartościowy zbiera glue, nie obala szwy.
- **Reguła warstw jako generator indirekcji.** `block-editor` WP-agnostyczny + zakaz importu w górę wymuszają wzorzec injection-przez-setting (`openMediaEditorModalKey`). To czyni szew C-B nie-refaktorowalnym, a jedyną legalną poprawę przenosi do wnętrza konsumenta (dedup block-library).
- **Kontrakt zewnętrzny jako twarda granica.** Format zapisu konformuje do WP Core REST; siatka parity ~6k to świadoma inwestycja pilnująca tej granicy. „Odsprzęganie" = redesign cross-system, poza zakresem refaktoru kodu.
- **Asymetria osłon = mapa ROI.** Geometria/serializacja osłonięte wybitnie; orkiestracja zapisu i composite reducer mają 0 testów bezpośrednich. Pierwsze kroki obu opportunities to characterization testy dokładnie w tych dziurach — pokrycie i refaktor zbiegają się.
- **Egzekwowanie warstw tylko po stronie ludzi.** dependency-cruiser/eslint **nie** egzekwują granic media-editora w CI; backstopem refaktoru są granice TS + JS unit suite + code review. Każdy plan musi to uwzględnić.

## Historical Context (from prior changes)

- `context/changes/media-editor-flow/research.md` — źródłowa analiza długu/ryzyk; dostarczyła listy problemów P1-P5 i anchorów file:line. Korekty wprowadzone w tej eksploracji: siatka parity ~6048-6055 (nie ~2352); e2e crop ISTNIEJE (`image.spec.js:244`); editor ma 3 punkty wpięcia (nie 2); `buildCropperSetters` też bez testu bezpośredniego.
- `context/map/repo-map.md` — media-editor najgorętszy front Q2'26 (516 dotknięć), grono 2 os. (strefa ryzyka #3); dependency-cruiser config to lokalny overlay, nie egzekwowany w CI.
- Commity-priory zweryfikowane: `c3bf086499c` (#78480 composite split), `44e61939159` (#77480 modal store + setting bridge), `933a7a1bc18` (#77782 undo/redo + refs), `773d176d189` (#77641 save via Core's /edit modifiers), `898fda7c463`/`5a4d70d134c` (co-change szwu modala).

## Related Research

- `context/changes/media-editor-flow/research.md` — bezpośredni prior (feature overview + technical debt + weryfikacja ast-grep C1-C10).
- `context/map/repo-map.md` — mapa onboardingowa; §4 strefy ryzyka, §5 kontakty (Ramon dla media-editora).

## Open Questions

- **[?] Realne pokrycie gałęzi** — analiza plik↔test nie mierzy coverage; `npm run test:unit packages/media-editor --coverage` potwierdziłby dziury (composite reducer, save path, buildCropperSetters).
- **[?] Zewnętrzni konsumenci typów stanu** — niemierzalne z tego checkoutu; w repo tylko `editor` + dev-route konsumują pakiet i nie dotykają typów stanu. Plugin/core poza repo: unknown.
- **[?] Intencja wpięcia dependency-cruiser do CI** — config dormant overlay; czy maintainerzy planują go uruchamiać: unknown.
- **[?] Treść dyskusji review PR #77641/#77480** — częściowo nieodczytana (`gh` raz nieuwierzytelniony); werdykty oparte na commitach/komentarzach/grafie, nie pełnych wątkach review.
- **[?] Czy otypowany kontrakt modala da się współdzielić bez type-zależności block-library → media-editor** — niezbadane; warunkuje wartość docelowego kształtu C-B (gdyby kiedyś nie był odrzucony).
- **[?] Czy `getSourceRegionPercent` ma realnych konsumentów wymagających `/edit`-kompatybilności** — dziś tylko stories/overlay/docs/testy; jeśli zero realnych, retire zamiast unifikacji.
