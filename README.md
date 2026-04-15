# mermint

Mint GitHub-ready Mermaid diagrams.

## Why mermint

- GitHub-faithful rendering: renders locally with Mermaid.js and applies GitHub-like defaults.
- Reliable hand-drawn style: normalizes `look: handDrawn` input and applies a consistent Rough.js pipeline across diagram types.
- Idempotent Markdown processing: re-running conversion does not destroy Mermaid sources.

## Install

Node 22.16.0+ is required.

One-off run from npm:

```bash
npx mermint@latest --help
```

Global install from npm (`pnpm`):

```bash
pnpm add -g --allow-build=mermint mermint
```

From this repository:

```bash
pnpm install
pnpm run build
pnpm link --global
```

If Playwright browsers are not installed yet:

```bash
npx playwright install
```

If you get `Executable doesn't exist at .../chromium_headless_shell-<rev>/...`, a generic `npx playwright install` may have installed the wrong browser revision. Re-run the install with the exact Playwright version this project resolved instead of relying on an unpinned Playwright CLI.

## Quickstart

Render one Mermaid file:

```bash
mermint --input path/to/diagram.mmd --output path/to/diagram.svg
```

Convert Markdown Mermaid blocks to `<picture>` + light/dark SVGs:

```bash
mermint \
  --input README.md \
  --svg-dir svgs \
  --keep-mermaid
```

## Codex Skill

This repository also ships a reusable Codex skill at `skills/mermint-markdown-workflow`.

- Use `skills/` for distribution and installation from a repo path.
- This repo does not use `.agents/skills`, because the skill is intended to be consumed by other repos/users rather than auto-discovered only inside this workspace.
- If you use the Skills CLI, install it globally with:

```bash
npx skills add -g alessandrobologna/mermint@mermint-markdown-workflow
```

- If you install skills from GitHub repo paths, point the installer at `skills/mermint-markdown-workflow`.
- The skill is written to execute `mermint` via `npx --yes git+https://github.com/alessandrobologna/mermint.git ...`, not via a local checkout.

`npx --yes git+https://github.com/alessandrobologna/mermint.git ...` only runs the CLI. It does not install or auto-register the skill, and the current published package does not include `skills/**`.

## AWS Diagram

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./svgs/readme-1-dark.svg">
  <img src="./svgs/readme-1-light.svg" alt="Architecture diagram" height="702">
</picture>
</div>

<details data-mermint-source="true">
  <summary>Mermaid source</summary>

```mermaid
---
config:
  look: handDrawn
  x-mermint:
    rough:
      hachureGap: 1
---
architecture-beta
  group api(aws:aws-api-gateway)[API Layer]
  service apigw(aws:aws-api-gateway)[API Gateway] in api

  group compute(aws:aws-lambda)[Compute]
  service lambda(aws:aws-lambda)[Lambda] in compute
  junction fanout in compute

  group messaging(aws:simple-queue-service)[Messaging]
  service sqs(aws:simple-queue-service)[SQS] in messaging

  group data(aws:dynamodb)[Data]
  service ddb(aws:dynamodb)[DynamoDB] in data
  service s3(aws:simple-storage-service)[S3] in data
  junction datahub in data

  apigw:R --> L:lambda
  lambda:R -- L:fanout
  fanout:B --> T:sqs
  fanout:R --> L:datahub
  datahub:T --> B:ddb
  datahub:B --> T:s3
```

</details>

## Usage

```bash
mermint --help
```

Command synopsis:

`mermint --input <file> [--output <file>] [options]`

Most used options:

| Option | Purpose |
| --- | --- |
| `--mode <diagram\|markdown>` | Override mode detection from `--input` extension. |
| `--look <classic\|handDrawn>` | Force style for this run. |
| `--theme <name>` | Set Mermaid theme (diagram mode, and dark render in markdown mode). |
| `--light-theme <name>` | Light render theme in markdown mode. |
| `--svg-dir <dir>` | Choose output directory for markdown-generated SVGs. |
| `--keep-mermaid` | Keep original Mermaid source in a `<details>` block. |
| `--icon-pack <spec>` | Load additional icon packs for architecture/icon syntax. Repeatable. Built-in: `aws`. |
| `--roughness <value>` | Tune hand-drawn intensity (default: `0.5` when hand-drawn is active). |
| `--no-transparent-bg` | Keep a visible background instead of transparent output. |

## Diagram Showcase

### Flowchart

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./svgs/readme-2-dark.svg">
  <img src="./svgs/readme-2-light.svg" alt="Flowchart diagram" height="600">
</picture>
</div>

<details data-mermint-source="true">
  <summary>Mermaid source</summary>

```mermaid
---
config:
  look: handDrawn
---
flowchart TD
  A[Start] --> B{Has account?}
  B -->|Yes| C[Sign in]
  B -->|No| D[Create account]
  C --> E[Checkout]
  D --> E
  E --> F[Order placed]
```

</details>

### Sequence

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./svgs/readme-3-dark.svg">
  <img src="./svgs/readme-3-light.svg" alt="Sequence diagram" height="288">
</picture>
</div>

<details data-mermint-source="true">
  <summary>Mermaid source</summary>

```mermaid
---
config:
  look: handDrawn
---
sequenceDiagram
  participant U as User
  participant S as Service
  U->>S: Request
  S-->>U: Response
```

</details>

### Class

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./svgs/readme-4-dark.svg">
  <img src="./svgs/readme-4-light.svg" alt="Class diagram" height="348">
</picture>
</div>

<details data-mermint-source="true">
  <summary>Mermaid source</summary>

```mermaid
---
config:
  look: handDrawn
---
classDiagram
  class Animal {
    +String name
    +eat()
  }
  class Dog {
    +bark()
  }
  Animal <|-- Dog
```

</details>

### Block

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./svgs/readme-5-dark.svg">
  <img src="./svgs/readme-5-light.svg" alt="Block diagram" height="281">
</picture>
</div>

<details data-mermint-source="true">
  <summary>Mermaid source</summary>

```mermaid
---
config:
  look: handDrawn
---
block-beta
columns 1
  db(("DB"))
  blockArrowId6<["&nbsp;&nbsp;&nbsp;"]>(down)
  block:ID
    A
    B["A wide one in the middle"]
    C
  end
  space
  D
  ID --> D
  C --> D
  style B fill:#969,stroke:#333,stroke-width:4px
```

</details>

### Git

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./svgs/readme-6-dark.svg">
  <img src="./svgs/readme-6-light.svg" alt="Git diagram" height="313">
</picture>
</div>

<details data-mermint-source="true">
  <summary>Mermaid source</summary>

```mermaid
---
config:
  look: handDrawn
---
gitGraph
    commit
    branch develop
    checkout develop
    commit
    commit
    checkout main
    merge develop
    commit
    branch feature
    checkout feature
    commit
    commit
    checkout main
    merge feature
```

</details>

### Kanban

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./svgs/readme-7-dark.svg">
  <img src="./svgs/readme-7-light.svg" alt="Kanban diagram" height="291">
</picture>
</div>

<details data-mermint-source="true">
  <summary>Mermaid source</summary>

```mermaid
---
config:
  look: handDrawn
  kanban:
    ticketBaseUrl: 'https://github.com/mermaid-js/mermaid/issues/#TICKET#'
---
kanban
  Todo
    [Create Documentation]
    docs[Create Blog about the new diagram]
  [In progress]
    id6[Create renderer so that it works in all cases. We also add some extra text here for testing purposes. And some more just for the extra flare.]
  id9[Ready for deploy]
    id8[Design grammar]@{ assigned: 'knsv' }
  id10[Ready for test]
    id4[Create parsing tests]@{ ticket: 2038, assigned: 'K.Sveidqvist', priority: 'High' }
    id66[last item]@{ priority: 'Very Low', assigned: 'knsv' }
  id11[Done]
    id5[define getData]
    id2[Title of diagram is more than 100 chars when user duplicates diagram with 100 char]@{ ticket: 2036, priority: 'Very High'}
    id3[Update DB function]@{ ticket: 2037, assigned: knsv, priority: 'High' }

  id12[Can't reproduce]
    id3[Weird flickering in Firefox]
```

</details>

Example source attribution: Mermaid Live Editor examples from [`mermaid-js/mermaid-live-editor`](https://github.com/mermaid-js/mermaid-live-editor).

## Option Reference

### General

| Option | Default | Description |
| --- | --- | --- |
| `--input <file>` | required | Input file (Mermaid or Markdown). |
| `--output <file>` | unset | Output path (`.svg` in diagram mode, Markdown path in markdown mode). |
| `--mode <diagram\|markdown>` | inferred from `--input` extension | Override mode detection. |
| `--theme <name>` | diagram: `default` / markdown dark: `dark` | Mermaid theme. |
| `--look <classic\|handDrawn>` | unset | Override Mermaid look. |
| `--icon-pack <spec>` | built-in `aws` pack | Register additional icon pack (`name=path-or-url` or `path-or-url`). Repeatable. |

### Markdown Mode

| Option | Default | Description |
| --- | --- | --- |
| `--svg-dir <dir>` | `svgs` | Directory for rendered SVGs. |
| `--light-theme <name>` | `default` | Mermaid theme for light SVGs. |
| `--keep-mermaid` | on for in-place conversions | Keep Mermaid source in a `<details>` block. |
| `--base-url <url>` | `https://mermaid.live` | Base URL used for Mermaid edit links. |

### Hand-Drawn / Rough.js

| Option | Default | Description |
| --- | --- | --- |
| `--roughness <value>` | `0.5` when hand-drawn active | Rough.js roughness. |
| `--fill-weight <value>` | unset | Rough.js fill weight for hatching. |
| `--fill-style <value>` | unset | `hachure`, `solid`, `zigzag`, `cross-hatch`, `dots`, `dashed`, `zigzag-line`. |
| `--hachure-gap <value>` | unset | Rough.js hachure gap override. |
| `--hachure-angle <value>` | unset | Rough.js hachure angle override. |
| `--bowing <value>` | unset | Rough.js bowing amount override. |
| `--stroke-width <value>` | unset | Rough.js stroke width override. |
| `--seed <value>` | unset | Rough.js deterministic seed (strict integer). |
| `--multi-stroke` / `--no-multi-stroke` | unset | Enable/disable Rough.js multi-stroke. |
| `--multi-stroke-fill` / `--no-multi-stroke-fill` | unset | Enable/disable Rough.js multi-stroke fill. |
| `--preserve-vertices` / `--no-preserve-vertices` | unset | Enable/disable Rough.js vertex preservation. |

### Fonts

| Option | Default | Description |
| --- | --- | --- |
| `--use-excalifont` | off | Use Excalifont without hand-drawn look. |
| `--font-family <list>` | unset | Override font-family list. |
| `--font-size <px>` | `13` | Label font size (strict integer). |
| `--embed-font <path>` | unset | Embed a custom font file into SVG. |
| `--embed-font-family <name>` | unset | Font-family name for `--embed-font`. |
| `--no-embed-excalifont` | active when Excalifont active | Disable bundled Excalifont embedding. Errors if Excalifont is not active. |

### Rendering and Runtime

| Option | Default | Description |
| --- | --- | --- |
| `--no-transparent-bg` | off | Keep non-transparent background in output. |
| `--settle-ms <ms>` | `1500` | Extra wait after render (strict integer). |
| `--timeout-ms <ms>` | `60000` | Playwright timeout in ms (strict integer). |
| `--headed` | off | Run browser in headed mode. |
| `-y, --yes` | off | Skip confirmation prompts for in-place markdown overwrite. |
| `--quiet` | off | Suppress output. |
| `--no-spinner` | off | Disable spinner output. |
| `--verbose` | off | Show extra details. |

## Frontmatter / Init Config Reference

`mermint` reads source-level config from either:

- leading YAML frontmatter (`--- ... ---`)
- Mermaid init directives (`%%{init: {...}}%%`)

Supported keys:

| Key Path | Type | Notes |
| --- | --- | --- |
| `config.look` | `classic \| handDrawn` | Used when `--look` is not set. |
| `config.fontFamily` | string | Used when `--font-family` is not set. |
| `config.architecture.iconPacks` | mapping (`name: path-or-url`) | Additional `architecture-beta` packs, or overrides for named built-ins such as `aws`. |
| `x-mermint.rough` | object | Source-level Rough.js overrides (see keys below). |

`x-mermint.rough` supports:

- `roughness` (number, `>= 0`)
- `fillWeight` (number, `>= 0`)
- `fillStyle` (`hachure`, `solid`, `zigzag`, `cross-hatch`, `dots`, `dashed`, `zigzag-line`)
- `hachureGap` (number)
- `hachureAngle` (number)
- `bowing` (number)
- `strokeWidth` (number, `>= 0`)
- `seed` (integer)
- `disableMultiStroke` (boolean)
- `disableMultiStrokeFill` (boolean)
- `preserveVertices` (boolean)

YAML frontmatter example:

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./svgs/readme-8-dark.svg">
  <img src="./svgs/readme-8-light.svg" alt="Architecture diagram" height="162">
</picture>
</div>

<details data-mermint-source="true">
  <summary>Mermaid source</summary>

```mermaid
---
config:
  look: handDrawn
  fontFamily: "Virgil, Excalifont, cursive"
  architecture:
    iconPacks:
      aws: ./assets/icon-packs/aws-architecture-service-icons.json
x-mermint:
  rough:
    roughness: 0.55
    fillStyle: cross-hatch
    hachureGap: 1
    seed: 42
---
architecture-beta
  group api(aws:aws-api-gateway)[API Layer]
```

</details>

Init-directive example:

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./svgs/readme-9-dark.svg">
  <img src="./svgs/readme-9-light.svg" alt="Flowchart diagram" height="101">
</picture>
</div>

<details data-mermint-source="true">
  <summary>Mermaid source</summary>

```mermaid
%%{init: {
  "look": "handDrawn",
  "fontFamily": "Virgil, Excalifont, cursive",
  "architecture": {
    "iconPacks": {
      "aws": "./assets/icon-packs/aws-architecture-service-icons.json"
    }
  },
  "x-mermint": {
    "rough": {
      "roughness": 0.55,
      "seed": 42
    }
  }
}}%%
flowchart LR
  A --> B
```

</details>

Configuration behavior:

- Precedence for rough options is `CLI > source config > defaults`.
- Built-in icon packs register first. `aws` is always available without configuration.
- Icon pack precedence on named conflicts is `CLI > source config > built-ins`.
- To override the built-in AWS pack from the CLI, use `--icon-pack aws=path-or-url`.
- If `--look classic` is set, rough overrides are rejected.
- Unknown `x-mermint.rough` keys are ignored; invalid values fail rendering.
- Relative icon pack sources resolve from the diagram input file directory in diagram mode, and from the markdown file directory in markdown mode.
- Hand-drawn `architecture-beta` diagrams with icon references default to `fillStyle: solid` for icon legibility unless you explicitly set a fill style.

## Notes

- If `--look` is unset, the tool respects `look` from frontmatter/init.
- Mode inference: diagram (`.mmd`, `.mermaid`), markdown (`.md`, `.markdown`, `.mdx`). Use `--mode` for non-standard extensions.
- In diagram mode, `--output` is required. In markdown mode, omitting `--output` updates the input file in place.
- In-place markdown updates ask for confirmation before overwrite. Use `--yes` to bypass the prompt.
- In hand-drawn mode, Mermaid `look: handDrawn` is normalized to classic before render, then the tool applies a consistent Rough.js pipeline.
- Rough overrides can be set in source via `x-mermint.rough` (frontmatter/init) with precedence `CLI > source > defaults`.
- `--look classic` disables hand-drawn rendering and is incompatible with rough overrides.
- The built-in `aws` pack is always available for Mermaid architecture diagrams.
- Icon packs can be configured via `--icon-pack` or source config (`architecture.iconPacks`); CLI values win on named conflicts.
- `architecture-beta` layout is weakly constrained. Keep labels short, avoid punctuation-heavy labels unless render-tested, prefer `junction` for optional branches, and visually inspect the rendered SVG because a successful render can still overlap.
- Numeric parsing is strict: integer-only flags reject suffixes; rough scalar flags require numeric values.

## Release

Maintainers publish `mermint` with the manual `Publish npm package` GitHub Actions workflow.

- Run the workflow from `main`.
- The workflow reads `name` and `version` directly from the root `package.json`.
- The workflow publishes from the `npm-publish` GitHub Actions environment.
- It validates the repo state, publishes to npm, and only tags the repo as `v<version>` after publish succeeds.
- One-time setup: create the `npm-publish` GitHub Actions environment and configure npm trusted publishing for this repository, the `.github/workflows/publish-npm.yml` workflow file, and the `npm-publish` environment name.

## License

Project license: `MIT` (see `LICENSE`).

Font note: the example SVGs may embed Excalifont. The OFL-1.1 text is included at `LICENSES/Excalifont-OFL-1.1.txt` and the bundled font file is `assets/fonts/Excalifont-Regular.woff2`.
