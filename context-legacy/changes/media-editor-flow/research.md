---
date: 2026-06-09T00:00:00Z
researcher: Rafal Puczel
git_commit: 57f0ab2f9eb5729a71cfcffcdbd06d7fbba2944b
branch: trunk
repository: gutenberg
topic: "Przepływ edycji obrazu w @wordpress/media-editor (crop / rotate / zoom → zapis)"
tags: [research, codebase, media-editor, image-editor, cropper, state, save, blast-radius]
status: complete
last_updated: 2026-06-09
last_updated_by: Rafal Puczel
last_updated_note: "Dodano weryfikację ast-grep twierdzeń strukturalnych (C1-C10); skorygowano C6 (konsumenci), doprecyzowano C1/C2."
---

# Research: Przepływ edycji obrazu w `@wordpress/media-editor`

**Date**: 2026-06-09
**Researcher**: Rafal Puczel
**Git Commit**: `57f0ab2f9eb5729a71cfcffcdbd06d7fbba2944b`
**Branch**: `trunk`
**Repository**: gutenberg

## Research Question

Przeanalizuj przepływ edycji obrazu w pakiecie `@wordpress/media-editor` (crop / rotate / zoom → zapis), z uwagą na obszary powiązane z `context/map/repo-map.md`. Entry point: `packages/media-editor/src/image-editor/`. Trzy osie: (1) trace e2e gesture→reducer→export→block editor, (2) luki w testach, (3) blast radius (private-apis, granice warstw, store, model stanu; graf + co-change z gita). Skupienie wyłącznie na stanie obecnym repo. Wymagane sekcje: **Feature overview** i **Technical debt**, z rozdziałem na **evidence / inference / unknown**.

> **Metoda.** Analiza wykonana trzema równoległymi sub-agentami (trace / coverage / blast-radius), a kluczowe twierdzenia zweryfikowane bezpośrednim czytaniem plików w głównym kontekście (`use-save-media-editor.ts`, `private-apis.ts`, `index.ts`) oraz grepem konsumentów. Convention z repo-map: **[H]** = git history (co-change), **[G]** = graf importów / bezpośrednie odczyty, **[?]** = unknown.

---

## Summary

`@wordpress/media-editor` to **niskopoziomowy, WP-agnostyczny** pakiet edytora obrazu z czystym jądrem geometrii (`image-editor/core/**`) i trzema oddzielnymi mechanizmami stanu nałożonymi warstwowo. Przepływ edycji to: **gest → pure cropper reducer → composite reducer (undo/redo + aspect ratio) → eksport modyfikatorów → REST `/wp/v2/media/{id}/edit` → callback `onUpdate` do bloku obrazu**. Pakiet **nie importuje** `block-editor` ani `editor` (granica warstw respektowana, [G]); integracja z edytorem bloków idzie przez osobny, zarejestrowany store `core/media-editor` (kontrola modala) i klucz-setting `openMediaEditorModalKey` rejestrowany w block-editor przez warstwę `editor`.

Stan jakości jest **dwubiegunowy**: czyste jądro matematyczne i reducery są pokryte testami wybitnej jakości (m.in. ~2 352-przypadkowa siatka parity preview↔export w `build-modifiers.test.ts`), natomiast **cała ścieżka zapisu i orkiestracja UI nie mają testów** — `use-save-media-editor.ts` (serce zapisu), `media-editor/index.tsx` oraz integracja gesture→save→callback są niepokryte, a e2e media-editora **nie istnieje** (spec `client-side-media-processing` dotyczy tylko uploadu). To jest główny dług. Ryzyko strukturalne potwierdza repo-map: najgorętszy obszar repo (Q2'26) z 2-osobowym gronem.

---

## Feature overview

### Architektura stanu — trzy warstwy + osobny store

| Warstwa | Plik | Co posiada | Przepływ |
|---|---|---|---|
| **A. Pure cropper reducer** | `image-editor/core/state.ts:32` (`cropperReducer`) | Czysta geometria: `pan, zoom, rotation, flip, cropRect`. Bez historii. `enforceContainment()` po każdej mutacji. | Akcje `SET_PAN/SET_ZOOM/SET_ROTATION/SNAP_ROTATE_90/SET_FLIP/SET_CROP_RECT/SETTLE_CROP/RESET` → reducer → next state |
| **A′. Pure hook** | `image-editor/react/hooks/use-cropper-reducer.ts:96` | Opakowanie reducera w React + named setters + baseline `isDirty` | settery → `dispatchCropperAction` → `useReducer` |
| **B. Composite reducer** | `state/composite-reducer.ts:32` (`mediaEditorReducer`) | Deleguje geometrię do A; **dokłada `cropOptions.aspectRatioValue`**; atomowa zmiana presetu + reshape cropRect | akcje opakowane w kopertę `CROPPER`, plus `SET_ASPECT_RATIO_VALUE`, `RESTORE_SNAPSHOT`, `VIEWPORT_ADJUST_CROP_RECT` |
| **B′. Composite hook** | `state/use-media-editor-state.ts:171` | **Undo/redo** (stosy w refach, flagi w stanie); **koalescencja gestów** `beginGesture`/`endGesture`; dedup no-op | `dispatchWithHistory` owija reducer; snapshot pushowany dopiero na końcu gestu |
| **C. Context provider** | `state/media-editor-state-provider.tsx:16` | Udostępnia `MediaEditorController` przez React context (`useMediaEditor()`) | jeden kontroler współdzielony przez komponenty |
| **Osobny: modal store** | `store/index.ts` + `store/reducer.ts` | `@wordpress/data` `core/media-editor`: `{ isOpen, id, onUpdate, onClose }` — sterowanie modalem | akcje `openMediaEditorModal` / `closeMediaEditorModal` |
| **Zewnętrzny: core-data** | `@wordpress/core-data` | Encja attachment (metadane) | `editEntityRecord` / `getEntityRecordNonTransientEdits` / `saveEditedEntityRecord` |

**Kluczowy insight:** geometria edytowanego obrazu (warstwy A/B/C, lokalny stan React) jest **całkowicie odseparowana** od cyklu życia modala (store `@wordpress/data`). Edytor jest „bezstanowy" względem swojego otwarcia/zamknięcia — tylko renderuje i woła `onSaved`. To świadomy decoupling od wnętrzności edytora WP.

### Sekwencja e2e (z file:line)

**Hop 1 — gest → cropper**
- `components/media-editor-canvas/index.tsx:75` — efekt `setImage()` po dostarczeniu `mediaUrl`/wymiarów
- `image-editor/react/hooks/use-interaction.ts:100` — `useInteraction()` buduje handlery `onPointerDown/onTouchStart/onKeyDown/onWheelNative`
- `image-editor/react/components/cropper.tsx:414` — handlery rozpięte na kontenerze canvas
- `hooks/use-crop-gesture-handlers.ts:68` — `onPointerDownCapture → beginGesture()`, `onPointerUp → endGesture()` (koalescencja sliderów/ruler)
- `image-editor/react/components/stencils/rectangle-stencil.tsx:85` — uchwyty resize emitują `onCropChange`

**Hop 2 — reducer/stan**
- `image-editor/react/hooks/build-cropper-setters.ts:56` — wspólna fabryka setterów (jeden punkt prawdy dla A i B); **10 setterów**, wołana z **dokładnie 2** miejsc: `use-cropper-reducer.ts:159` i `use-media-editor-state.ts:284` ([G] ast-grep, patrz §Weryfikacja C2)
- `image-editor/core/state.ts:32` — `cropperReducer`; **każda z 9 gałęzi mutujących** kończy się `enforceContainment()` (`state.ts:229,237,246,256,294,334,362,381,425`) + gałąź `RESET` (`:454`); definicja `:123`, intencja w komentarzu `:224` ([G] ast-grep, patrz §Weryfikacja C1)
- `state/composite-reducer.ts:44` — `SET_ASPECT_RATIO_VALUE` atomowo: resolve presetu + `computeInscribedRect()` reshape cropRect
- `state/use-media-editor-state.ts:225` — `dispatchWithHistory()`; `:246` gesty; `:353`/`:367` undo/redo → `RESTORE_SNAPSHOT`

**Hop 3 — eksport**
- `components/media-editor/use-save-media-editor.ts:59` — `getCropModifiers()` → `buildModifiers(cropper.state, {naturalWidth, naturalHeight})` tylko gdy `isCropperDirty` ([G] zweryfikowane bezpośrednio)
- `components/media-editor-modal/build-modifiers.ts:81` — buduje uporządkowaną tablicę `[flip, rotate, crop]` zgodną z REST
- `image-editor/core/export/canvas-renderer.ts:36` — `renderToCanvas()` + `createExportCamera()`; `canvasToBlob()` (client-side render, używany do podglądu/parity)

**Hop 4 — zapis i powrót do bloku** ([G] zweryfikowane czytaniem `use-save-media-editor.ts:105-214`)
- Jeśli `modifiers.length > 0`: `apiFetch POST /wp/v2/media/{id}/edit` z `{ src, modifiers, ...metadataEdits }` (`:129`), potem `receiveEntityRecords('postType','attachment', saved, undefined, true)` (`:140`)
- Inaczej (tylko metadane): `saveEditedEntityRecord('postType','attachment', id)` (`:149`)
- `previous = { id, url }` zapamiętane gdy był crop (`:111`) — pod snackbar „Undo"
- `onSaved?.({ id, url, media, previous })` (`:166`); gdy nowy `id === stary` to `cropper.reset()` (refresh baseline `isDirty`)
- `components/media-editor-modal/index.tsx:88` — `onSaved` → `onUpdate({ id, url })` → zamknięcie modala → snackbar „Undo" w hoście

**Granica metadanych:** whitelist `title, caption, description, alt_text, post` (`use-save-media-editor.ts:23`); `post` przenoszony z oryginału gdy user go nie edytował (bo `/edit` tworzy nowy attachment bez dziedziczenia `post_parent`, `:79-85`).

### Diagram (Mermaid)

```mermaid
flowchart TD
    A["👤 Gest: drag / pinch / wheel / klawiatura"]
    A -->|use-interaction.ts:100| B["useInteraction → handlery"]
    B -->|build-cropper-setters.ts:56| C["cropper setters"]
    C -->|dispatch| D{"Warstwa stanu"}
    D -->|pure| E["cropperReducer\ncore/state.ts:32"]
    D -->|composite| F["mediaEditorReducer\nstate/composite-reducer.ts:32"]
    E -->|enforceContainment state.ts:123| G["CropperState"]
    F -->|+ cropOptions / undo-redo| G
    F -->|dispatchWithHistory :225| H["History (refy)\nuse-media-editor-state.ts:196"]
    G -->|render| L["useTransformStyle → canvas + stencil + overlays\ncropper.tsx"]
    L -->|Save| M["getCropModifiers\nuse-save-media-editor.ts:59"]
    M -->|isCropperDirty| N["buildModifiers [flip,rotate,crop]\nbuild-modifiers.ts:81"]
    N -->|POST /wp/v2/media/{id}/edit :129| O["WP REST (server-side render)"]
    O -->|receiveEntityRecords :140| P["onSaved {id,url,media,previous} :166"]
    P -->|media-editor-modal/index.tsx:88| Q["onUpdate({id,url}) → blok obrazu\n+ snackbar Undo"]
    Q --> R["Block editor: atrybut url/id zaktualizowany"]
```

### Integracja z edytorem bloków ([G]+[H], zweryfikowane grepem)

Pakiet jest konsumowany w kodzie produkcyjnym przez **dokładnie 2 pliki, oba w warstwie `editor`** (nie `block-editor`, nie `block-library` bezpośrednio; weryfikacja C6 niżej):
- `packages/editor/src/components/provider/use-block-editor-settings.js:20` — `import { privateApis as mediaEditorPrivateApis }`, `unlock(...)`, dispatch `openMediaEditorModal`, i **rejestracja `openMediaEditorModalKey` jako ustawienia block-editora**
- `packages/editor/src/components/media/media-editor-modal.js:7` — `import { privateApis ... }`, montuje `MediaEditorModal` (z `fields`, `aspectRatioPresets`)
- `packages/block-library/src/image/use-open-image-media-editor-modal.js` i `site-logo/edit.js` — konsumują **klucz-setting** `openMediaEditorModalKey` z block-editora (NIE importują `@wordpress/media-editor`); obsługują sync metadanych (alt, caption) w `onUpdate`

To jest poprawny wzorzec warstw: `media-editor` (niski) ← `editor` (mostkuje w dół do block-editora przez setting) ← `block-library` (konsument settinga). Historia [H] potwierdza wspólne PR-y: `898fda7c463` (focus return) i `5a4d70d134c` (undo snackbar) dotykały jednocześnie store media-editora + image/site-logo + use-block-editor-settings.

---

## Technical debt

### 1. Ścieżka zapisu i orkiestracja UI bez testów (KRYTYCZNE)

[G] (potwierdzone brakiem plików + czytaniem testu modala):
- **`components/media-editor/use-save-media-editor.ts` — 0 testów.** To serce zapisu: budowa modyfikatorów, filtr metadanych, `POST /edit`, `receiveEntityRecords`, obsługa błędów (snackbar), callback `onSaved`. Regresja w serializacji modyfikatorów lub filtrze metadanych nie zostanie złapana.
- **`components/media-editor/index.tsx` — 0 testów.** Główny orkiestrator UI (przycisk Save, okablowanie stanu, dialogi błędów).
- **`components/media-editor-modal/test/index.tsx` — test słaby:** mockuje całe `<MediaEditor>` (jako przycisk) i sprawdza tylko utworzenie snackbara — **nie ćwiczy `useSaveMediaEditor`**.
- **Brak testu integracyjnego** całego łańcucha gest→reducer→`buildModifiers`→POST→`onSaved`. Każdy etap przetestowany w izolacji, łańcuch — nie.
- **Brak e2e.** `test/e2e/specs/editor/various/client-side-media-processing.spec.js` dotyczy uploadu, **nie** otwierania modala / crop / rotate / zoom / save.

### 2. Komponenty React i hooki gestów bez testów (WYSOKIE)

[G]: bez testów — `media-editor-canvas/index.tsx`, `media-editor-provider/index.tsx`, `cropper-provider.tsx`, `viewport-provider.tsx`, overlaye (`dimensions/dimming/grid-overlay.tsx`), `media-form/index.tsx`, `media-editor-fine-rotation/index.tsx`, `hooks/use-crop-gesture-handlers.ts`, `rotation-ruler/use-ruler-drag.ts`. Testy `cropper.tsx`, `media-editor-crop-panel`, `media-editor-image-controls` istnieją, ale [inference] są płytkie (render + ARIA; nie ćwiczą realnych gestów ani sync stanu do reducera).

### 3. Czyste moduły geometrii częściowo niepokryte (ŚREDNIE)

[G]: bez własnych testów jednostkowych — `core/containment.ts`, `core/crop-rect.ts`, `core/setter-helpers.ts`, `core/source-region.ts`, `core/transform-style.ts`, `core/viewport-state.ts`, `core/math/rotation.ts`, `state/composite-reducer.ts`. [inference] część jest ćwiczona pośrednio (np. `enforceContainment` przez testy `use-cropper-reducer`), ale `composite-reducer` testowany jest tylko przez hook, nie wprost.

> **Co JEST mocne (kontrapunkt, [G]):** `use-cropper-reducer` (~1056 linii testu, koalescencja/containment/dirty), `use-media-editor-state` (undo/redo, atomowość aspect-ratio), `build-modifiers.test.ts` (~2 352 przypadki parity preview↔export, konwencja znaku rotacji), `canvas-renderer` (macierze transformacji, CORS-taint, brak kontekstu canvas), `store/reducer`, `use-crop-options`. Metryka sub-agenta: ~22/57 plików źródłowych ma test (~39%) — z dziurą skoncentrowaną dokładnie na ścieżce zapisu.

### 4. Blast radius — co zmienia się razem

**Model stanu (najwyższy fan-in wewnętrzny, „nie ruszaj lekko"):** [G]
- `image-editor/core/types.ts` — `CropperState/CropperAction/NormalizedRect/Size/Flip`, importowane przez kilkanaście modułów (type-only, ale każda operacja geometrii o to zahacza)
- `state/types.ts` — kształt `MediaEditorState` (wpływ na historię undo)
- `core/state.ts` (`cropperReducer`) — konsumowany przez `use-cropper-reducer` + `composite-reducer` + stories
- `state/composite-reducer.ts` — **każda akcja UI przez to przepływa**; dedup historii zależy od `areMediaEditorStatesEqual` w sync z reducerem

**Kontrakt modala (co-change cross-package, [H]+[G]):** zmiana `store/actions.ts`/`reducer.ts` (`openMediaEditorModal`, kształt `{isOpen,id,onUpdate,onClose}`) wymaga skoordynowanej zmiany w:
- `packages/editor/src/components/provider/use-block-editor-settings.js`
- `packages/editor/src/components/media/media-editor-modal.js`
- `packages/block-editor/src/store/private-keys.js` (symbol `openMediaEditorModalKey`) + `block-editor/src/private-apis.js`
- `packages/block-library/src/image/use-open-image-media-editor-modal.js` i `site-logo/edit.js`

**Format zapisu (crop modifiers / REST):** zmiana schematu `[flip,rotate,crop]` lub body `/edit` dotyka `use-save-media-editor.ts` + `build-modifiers.ts` + callback `onUpdate` w bloku obrazu; musi pozostać w sync z serwerowym `/wp/v2/media/:id/edit`. Parity preview↔export pilnowana przez `build-modifiers.test.ts`.

**Granica warstw:** [G] zweryfikowane — `media-editor/src` **nie importuje** `@wordpress/block-editor` ani `@wordpress/editor` (grep pusty). Zależy (legalnie, na swojej warstwie) od `core-data`, `data`, `components`, `dataviews`, `notices`, `private-apis`. Brak cyklu `selectors ↔ private-selectors` w tym pakiecie (kontrast do block-editor/core-data z repo-map).

**Ryzyko organizacyjne (z repo-map):** najgorętszy obszar repo (516 dotknięć Q2'26) + grono 2 osób (Ramon = owner crop/zoom/reducer/a11y; Andrew Serong = drugi filar/łącznik) → ryzyko kolizji merge, koordynacja z Ramonem zalecana przy zmianach przepływu.

---

## Weryfikacja twierdzeń strukturalnych (ast-grep)

Twierdzenia liczbowe/„tylko tutaj"/„zawsze przez X" z tego raportu sprawdzone narzędziem `ast-grep 0.43.0`. **Reguła z lekcji:** licz ast-grepem dla precyzji, ale **każde zero potwierdzaj `grep`em** — bo ast-grep z literałem string-owym (`"..."`) nie dopasowuje cudzysłowów pojedynczych i daje fałszywe zera. Tutaj dokładnie tak było dla C6.

| # | Twierdzenie | Werdykt | Dowód (file:line) |
|---|---|---|---|
| C1 | `enforceContainment` po każdej mutacji `cropperReducer` | **doprecyzowane** | 9 gałęzi: `core/state.ts:229,237,246,256,294,334,362,381,425` + RESET `:454`; init `use-cropper-reducer.ts:102,110`, `use-media-editor-state.ts:173`; intencja `state.ts:224` |
| C2 | jedna fabryka setterów, punkt prawdy dla A i B | **potwierdzone+doprecyzowane** | def. `build-cropper-setters.ts:56`; **10** setterów; **2** call-site'y `use-cropper-reducer.ts:159`, `use-media-editor-state.ts:284` |
| C3 | dokładnie 1 `apiFetch POST /edit` | **potwierdzone** | `use-save-media-editor.ts:129` (count=1) |
| C4 | `receiveEntityRecords` przy zapisie crop | **potwierdzone** | `use-save-media-editor.ts:140` |
| C5 | media-editor nie importuje block-editor/editor | **potwierdzone** | ast-grep 0 **+ grep 0 (prawdziwe zero)** w `media-editor/src` |
| C6 | konsumenci media-editora | **OBALONE/skorygowane** | produkcyjnie **dokładnie 2**: `editor/.../use-block-editor-settings.js:20`, `editor/.../media-editor-modal.js:7`. Wcześniejszy roboczy `grep -l` wskazał też `private-apis/src/implementation.ts` — to **fałszywe trafienie** (generyczna infra lock/unlock, nie konsument). ast-grep literałem dał fałszywe 0; grep `from ['"]...['"]` skorygował |
| C7 | `openMediaEditorModalKey` symbol w block-editor, konsumowany przez block-library bez importu media-editora | **potwierdzone** | def. `block-editor/src/store/private-keys.js:19`; konsumpcja przez `unlock()`: `block-library/src/image/use-open-image-media-editor-modal.js:106,151`, `site-logo/edit.js:55,102` |
| C8 | whitelist metadanych = 5 kluczy | **potwierdzone** | `use-save-media-editor.ts:23-29` |
| C9 | `MediaEditorController extends CropperController` | **potwierdzone** | `use-media-editor-state.ts:97-136` |
| C10 | `lock(privateApis,{...})` = dokładnie 3 eksporty | **potwierdzone** | `private-apis.ts:10-14` (`store, MediaEditor, MediaEditorModal`) |

**Wynik netto:** 7 potwierdzonych, 2 doprecyzowane (C1, C2), 1 obalone (C6 — usunięty błędny trzeci konsument). Jedyny błąd merytoryczny w pierwotnym raporcie to fałszywe trafienie w roboczym grepie konsumentów; sama treść raportu mówiła „wyłącznie warstwa editor", co się obroniło.

## Code References

- `packages/media-editor/src/image-editor/core/state.ts:32` — `cropperReducer` (pure geometry)
- `packages/media-editor/src/image-editor/core/state.ts:123` — `enforceContainment`
- `packages/media-editor/src/state/composite-reducer.ts:32` — `mediaEditorReducer`
- `packages/media-editor/src/state/composite-reducer.ts:44` — `SET_ASPECT_RATIO_VALUE` (atomowy reshape)
- `packages/media-editor/src/state/use-media-editor-state.ts:171` — composite hook (undo/redo, gesty)
- `packages/media-editor/src/state/use-media-editor-state.ts:225` — `dispatchWithHistory`
- `packages/media-editor/src/image-editor/react/hooks/use-cropper-reducer.ts:96` — pure cropper hook
- `packages/media-editor/src/image-editor/react/hooks/build-cropper-setters.ts:56` — fabryka setterów
- `packages/media-editor/src/image-editor/react/hooks/use-interaction.ts:100` — handlery wejścia
- `packages/media-editor/src/hooks/use-crop-gesture-handlers.ts:68` — koalescencja gestów
- `packages/media-editor/src/components/media-editor/use-save-media-editor.ts:59` — `getCropModifiers`
- `packages/media-editor/src/components/media-editor/use-save-media-editor.ts:129` — `POST /wp/v2/media/{id}/edit`
- `packages/media-editor/src/components/media-editor-modal/build-modifiers.ts:81` — `buildModifiers [flip,rotate,crop]`
- `packages/media-editor/src/image-editor/core/export/canvas-renderer.ts:36` — `renderToCanvas`
- `packages/media-editor/src/components/media-editor-modal/index.tsx:88` — `onSaved → onUpdate`
- `packages/media-editor/src/private-apis.ts:9-14` — lock `{ store, MediaEditor, MediaEditorModal }`
- `packages/media-editor/src/index.ts:2-12` — publiczne: `MediaEditorProvider`, `MediaPreview`, `MediaForm`
- `packages/editor/src/components/provider/use-block-editor-settings.js` — dispatch + rejestracja `openMediaEditorModalKey`
- `packages/block-editor/src/store/private-keys.js:19` — `openMediaEditorModalKey` symbol
- `packages/block-library/src/image/use-open-image-media-editor-modal.js` — konsument settinga, sync metadanych
- `packages/media-editor/src/components/media-editor-modal/test/build-modifiers.test.ts` — siatka parity (~2 352 przyp.)

## Architecture Insights

- **Pure core → React hook → Context provider:** każda warstwa dokłada jeden koncept (geometria → React/dirty → undo/redo+aspect → współdzielony kontekher). Ułatwia testowanie jądra i pozwoliłoby na reużycie poza Reactem ([inference]).
- **Decoupling cyklu życia od treści:** modal store (`@wordpress/data`) odpowiada za otwarcie/zamknięcie i callbacki, lokalny stan React za edytowany obraz. Edytor jest „bezstanowy" względem swojego otwarcia.
- **Integracja przez setting, nie przez import:** block-library nigdy nie importuje media-editora — dostaje funkcję `openMediaEditorModal` jako ustawienie block-editora, rejestrowane przez warstwę `editor`. To utrzymuje granicę warstw przy faktycznej współzmianie [H].
- **Atomowość i dedup historii:** `SET_ASPECT_RATIO_VALUE`/`RESTORE_SNAPSHOT` jako pojedyncze transakcje; `dispatchWithHistory` pomija no-opy (`areMediaEditorStatesEqual` z epsilonem) → undo odpowiada modelowi mentalnemu użytkownika.
- **Parity preview↔export jako kontrakt:** client-side render (`canvas-renderer`) i serwerowy `/edit` muszą dawać identyczny wynik; pilnuje tego osobny, ciężki test macierzowy — to świadoma inwestycja w poprawność geometrii, kontrastująca z brakiem testów wokół samego zapisu.

## Historical Context (from prior changes)

- Brak wcześniejszych artefaktów `context/changes/**` ani `context/archive/**` poza bieżącym (`context/` zawiera tylko `map/` oraz świeżo scaffoldowane `changes/media-editor-flow/`). Jedynym źródłem historycznym jest `context/map/repo-map.md` (okno 12 mies., 4313 commitów).
- Z gita [H]: `c3bf086499c` (refaktor stanu cropera do composite-reducer, ~30 plików, bez spillover poza pakiet), `898fda7c463` (focus return po zamknięciu modala — store + image/site-logo + use-block-editor-settings), `5a4d70d134c` (undo snackbar — store + sync metadanych bloku).

## Related Research

- `context/map/repo-map.md` — onboarding map; §2/§4/§5 wskazują media-editor jako najgorętszy front Q2'26, strefa ryzyka #3 (2-os. grono), kontakt: Ramon + Andrew Serong.

## Open Questions

- **[?] Faktyczne pokrycie przy uruchomieniu suite** — analiza statyczna pliki↔testy nie mierzy realnego coverage gałęzi; potrzebny `npm run test:unit packages/media-editor` z `--coverage`.
- **[?] depcruise dla workspace** — repo-map odnotowuje, że depcruise nie rozwiązuje specyfikatorów `@wordpress/*` do `packages/*/src`; fan-in liczony grepem importów, nie pełnym grafem.
- **[?] `use-transform-style` / `viewport-state`** — relacja viewport (kamera canvas) vs cropper (pan/zoom w współrzędnych obrazu) ustalona [inference], nie potwierdzona pełnym odczytem `use-viewport-state.ts`.
- **[?] Strona serwerowa `/wp/v2/media/:id/edit`** — implementacja PHP poza grafem JS; kontrakt modyfikatorów znany od strony klienta, nie zweryfikowany od strony serwera.
- **[?] Trwałość presetu aspect-ratio** — `aspectRatioValue` w stanie sesji; brak śladu persystencji (localStorage/encja) → [inference] gubione po reloadzie.
