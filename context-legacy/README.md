# Architect (M4) — artefakty źródłowe (legacy `gutenberg`)

Artefakty L2/L3/L4, z których zsyntetyzowano `../context/architect-report.md` (odznaka 10xArchitect).
Trzymane poza `context/` (w `context-legacy/`), żeby nie mieszać kontekstu obcego repo z tym projektem.

L2/L3/L4 powstały na **legacy repo `gutenberg`** (`@wordpress/media-editor`); L5 powstał na **tym
projekcie** i żyje w `../context/domain/`. Skopiowane tu, żeby raport był samowystarczalny dla recenzenta —
oryginały L2/L3/L4 żyją w `gutenberg/context/`.

| Artefakt | Lekcja | Plik | Oryginał |
|---|---|---|---|
| Mapa repozytorium | L2 | `map/repo-map.md` (+ artifact-1/2/3) | `gutenberg/context/map/` |
| Research ficzera (media-editor) | L3 | `changes/media-editor-flow/research.md` | `gutenberg/context/changes/media-editor-flow/` |
| Plan refaktoryzacji | L4 | `changes/refactor-opportunities/plan.md` (+ research, plan-brief) | `gutenberg/context/changes/refactor-opportunities/` |
| Notatki o domenie (DDD) | L5 | `../context/domain/` (`01`/`02`/`03` + `event-storming-board.json`) | ten projekt (oryginał) |

Raport: `../context/architect-report.md`. Korekta C6 (ast-grep false-zero → grep): `changes/media-editor-flow/research.md` (tabela weryfikacji, wiersz C6).
