---
name: mermint-markdown-workflow
description: |
  Process Markdown Mermaid blocks with mermint using README-style output (`<picture>` + light/dark SVGs),
  preserve source blocks with `--keep-mermaid`, and refresh generated SVG assets safely.

  Use this skill when:
  1. User asks to convert Mermaid code blocks in Markdown files
  2. User asks to render/update README diagrams like this repo
  3. User asks to regenerate `svgs/*-light.svg` and `svgs/*-dark.svg` assets
  4. User asks to run idempotent markdown reprocessing with preserved Mermaid source
---

# Mermint Markdown Workflow

Use this workflow to render Markdown Mermaid blocks into GitHub-friendly `<picture>` markup and SVG assets.
Prefer running `mermint` directly from this GitHub repo with `npx`; do not assume a local checkout or global install.

## Inputs To Confirm

- Target markdown file (example: `README.md`)
- SVG output directory (example: `svgs`)
- In-place overwrite vs separate output path
- Whether Mermaid source must be preserved (`--keep-mermaid`)

## Preflight Checks

Before rendering, check:

- `node` is installed and version `>= 22`
- `npx` is available
- network access is available, because the CLI is fetched from GitHub

Example:

```bash
node --version
npx --version
```

## Standard Commands

Primary command:

```bash
npx --yes git+https://github.com/alessandrobologna/mermint.git \
  --input README.md \
  --svg-dir svgs \
  --keep-mermaid
```

Use explicit themes when you want stable readme-style output:

```bash
npx --yes git+https://github.com/alessandrobologna/mermint.git \
  --input README.md \
  --svg-dir svgs \
  --light-theme default \
  --theme dark \
  --keep-mermaid
```

For non-interactive in-place conversion (CI/automation), add `--yes`:

```bash
npx --yes git+https://github.com/alessandrobologna/mermint.git \
  --input README.md \
  --svg-dir svgs \
  --keep-mermaid \
  --yes
```

For a non-destructive preview, write to a separate markdown output:

```bash
npx --yes git+https://github.com/alessandrobologna/mermint.git \
  --input README.md \
  --output /tmp/README.rendered.md \
  --svg-dir /tmp/mermint-svgs \
  --keep-mermaid
```

## Frontmatter / Init Conventions

This workflow supports source-level Mermaid config in frontmatter/init, including:

- `config.look`
- `config.fontFamily`
- `config.architecture.iconPacks`
- `x-mermint.rough`

If icon packs use relative paths, they resolve from:

- diagram mode: directory of the input `.mmd` file
- markdown mode: directory of the markdown file

## Verification Checklist

After rendering:

1. Confirm markdown contains `<picture>` blocks:
```bash
rg -n "<picture>" README.md
```
2. If `--keep-mermaid` is expected, confirm preserved source blocks:
```bash
rg -n "data-mermint-source=\"true\"" README.md
```
3. Confirm SVG assets exist and are non-empty:
```bash
ls -la svgs
```

## Failure Recovery

- If `node --version` is lower than `22`, upgrade Node before running `mermint`.
- If `npx` is unavailable, install a recent Node.js distribution that includes npm/npx.
- If Playwright browsers are missing:
```bash
npx playwright install
```
- If verification uses `rg` and it is unavailable, use `grep` instead.
- If rendering fails due to invalid source rough config, fix `x-mermint.rough` values in source or remove conflicting `--look classic`.
