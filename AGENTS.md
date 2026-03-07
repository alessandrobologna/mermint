# AGENTS.md

Guidance for coding agents working in this repository.

## Scope

These instructions apply to the whole repo.

## Environment

- Node.js: `>=22`
- Package manager: `pnpm`
- Install dependencies: `pnpm install`
- Build: `pnpm run build`
- Test: `pnpm test`

If Playwright browsers are missing, run:

```bash
npx playwright install
```

## Project Map

- `src/cli.ts`: CLI entrypoint and option parsing.
- `src/render.ts`: Mermaid -> SVG rendering pipeline (Playwright runtime).
- `src/markdown.ts`: Markdown mode conversion (` ```mermaid ` blocks -> `<picture>` + SVG assets).
- `src/confirm.ts`: confirmation flow for destructive in-place markdown overwrites.
- `src/ui.ts`: terminal UI output formatting.
- `tests/*.test.ts`: Vitest suite for parsing, rendering, markdown conversion, and CLI behavior.
- `assets/`: static assets (including bundled font files).
- `assets/icon-packs/`: bundled icon packs shipped by the CLI (including the built-in AWS pack).
- `packages/aws-iconify-json/`: AWS icon-pack builder and source JSON used to refresh the bundled AWS pack.
- `skills/`: distributable Codex skills that ship with this repo.
- `svgs/`: generated SVG assets used by README examples.

## Working Rules

- Keep changes focused and minimal; avoid unrelated refactors.
- Preserve strict TypeScript behavior and current ESM module style.
- Use `UserFacingError` for user-facing CLI failures.
- Keep CLI flags/help text, tests, and README docs in sync.
- Add or update tests for any behavior change.

## Safety Rules

- In markdown mode, in-place output (`-i README.md` without `-o`) is destructive.

Expected behavior:
1. Ask for confirmation in interactive terminals.
2. Refuse in non-interactive mode unless `--yes` is provided.

If behavior around `--keep-mermaid` or overwrite safety changes, update:
- `src/cli.ts`
- `src/confirm.ts`
- related tests
- README option/notes sections

## Generated Artifacts

- `dist/` is build output and is ignored by git; do not commit it.
- Avoid touching `svgs/` unless the task explicitly requires refreshing README/example diagrams.
- If README Mermaid source changes, refresh `README.md` and `svgs/` together with:

```bash
node dist/cli.js --input README.md --mode markdown --svg-dir svgs --light-theme default --theme dark --keep-mermaid --yes
```

## Validation Before Commit

Run at least:

```bash
pnpm test
```

For CLI or packaging changes, also run:

```bash
pnpm run build
node dist/cli.js --help
```

## Commit Guidance

- Prefer clear, scoped commit subjects (Conventional Commit style is preferred).
- Include why the change was made and what was validated.
