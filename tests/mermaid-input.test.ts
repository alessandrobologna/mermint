import { describe, expect, it } from 'vitest';
import {
  extractConfiguredFontFamilyFromInput,
  extractConfiguredIconPacksFromInput,
  extractConfiguredRoughOptionsFromInput,
  stripHandDrawnLookFromInput
} from '../src/mermaid-input.js';

describe('stripHandDrawnLookFromInput', () => {
  it('normalizes handDrawn look in frontmatter', () => {
    const code = `---
config:
  look: handDrawn
  theme: default
---
flowchart LR
  A --> B
`;
    const result = stripHandDrawnLookFromInput(code);
    expect(result.stripped).toBe(true);
    expect(result.code).toContain('look: classic');
  });

  it('normalizes handDrawn look in init directive', () => {
    const code = `%%{init: { "look": "handDrawn", "theme": "default" }}%%
flowchart LR
  A --> B
`;
    const result = stripHandDrawnLookFromInput(code);
    expect(result.stripped).toBe(true);
    expect(result.code).toContain('"look": "classic"');
  });

  it('leaves classic look unchanged', () => {
    const code = `---
config:
  look: classic
---
flowchart LR
  A --> B
`;
    const result = stripHandDrawnLookFromInput(code);
    expect(result.stripped).toBe(false);
    expect(result.code).toContain('look: classic');
  });

  it('normalizes handDrawn look in frontmatter with leading blank lines', () => {
    const code = `

---
config:
  look: handDrawn
---
sequenceDiagram
  A->>B: ping
`;
    const result = stripHandDrawnLookFromInput(code);
    expect(result.stripped).toBe(true);
    expect(result.code).toContain('look: classic');
  });
});

describe('extractConfiguredFontFamilyFromInput', () => {
  it('reads fontFamily from frontmatter', () => {
    const code = `---
config:
  look: handDrawn
  fontFamily: virgil, excalifont, cursive
---
flowchart LR
  A --> B
`;
    expect(extractConfiguredFontFamilyFromInput(code)).toBe('virgil, excalifont, cursive');
  });

  it('reads quoted fontFamily from init directive', () => {
    const code = `%%{init: { "look": "handDrawn", "fontFamily": "Virgil, cursive" }}%%
flowchart LR
  A --> B
`;
    expect(extractConfiguredFontFamilyFromInput(code)).toBe('Virgil, cursive');
  });

  it('returns undefined when no fontFamily is configured', () => {
    const code = `flowchart LR
  A --> B
`;
    expect(extractConfiguredFontFamilyFromInput(code)).toBeUndefined();
  });

  it('reads fontFamily from BOM-prefixed frontmatter', () => {
    const code = `\uFEFF
---
config:
  fontFamily: "Virgil, cursive"
---
flowchart LR
  A --> B
`;
    expect(extractConfiguredFontFamilyFromInput(code)).toBe('Virgil, cursive');
  });
});

describe('extractConfiguredIconPacksFromInput', () => {
  it('reads iconPacks from init directives', () => {
    const code = `%%{init: {
  "theme": "default",
  "architecture": {
    "iconPacks": {
      "aws": "https://unpkg.com/@iconify-json/logos@1/icons.json"
    }
  }
}}%%
architecture-beta
  group api(aws:aws-api-gateway)[API Layer]
`;

    expect(extractConfiguredIconPacksFromInput(code)).toEqual([
      {
        name: 'aws',
        source: 'https://unpkg.com/@iconify-json/logos@1/icons.json'
      }
    ]);
  });

  it('reads iconPacks from frontmatter yaml mappings', () => {
    const code = `---
config:
  architecture:
    iconPacks:
      aws: https://unpkg.com/@iconify-json/logos@1/icons.json
      local: ./icons/aws.json
---
architecture-beta
  group api(aws:aws-api-gateway)[API Layer]
`;

    expect(extractConfiguredIconPacksFromInput(code)).toEqual([
      {
        name: 'aws',
        source: 'https://unpkg.com/@iconify-json/logos@1/icons.json'
      },
      {
        name: 'local',
        source: './icons/aws.json'
      }
    ]);
  });

  it('ignores non-path non-url unquoted values', () => {
    const code = `%%{init: {
  "architecture": {
    "iconPacks": {
      "aws": iconLoader
    }
  }
}}%%
architecture-beta
  group api(aws:aws-api-gateway)[API Layer]
`;

    expect(extractConfiguredIconPacksFromInput(code)).toEqual([]);
  });
});

describe('extractConfiguredRoughOptionsFromInput', () => {
  it('reads rough options from init directives', () => {
    const code = `%%{init: {
  "x-mermint": {
    "rough": {
      "roughness": 0.5,
      "fillWeight": 11,
      "fillStyle": "cross-hatch",
      "seed": 42,
      "disableMultiStroke": true
    }
  }
}}%%
flowchart LR
  A --> B
`;

    const result = extractConfiguredRoughOptionsFromInput(code);
    expect(result.options).toEqual({
      roughness: 0.5,
      fillWeight: 11,
      fillStyle: 'cross-hatch',
      seed: 42,
      disableMultiStroke: true
    });
    expect(result.unknownKeys).toEqual([]);
    expect(result.invalidEntries).toEqual([]);
  });

  it('reads rough options from frontmatter yaml mappings', () => {
    const code = `---
x-mermint:
  rough:
    hachureGap: 6
    hachureAngle: -30
    preserveVertices: true
---
flowchart LR
  A --> B
`;

    const result = extractConfiguredRoughOptionsFromInput(code);
    expect(result.options).toEqual({
      hachureGap: 6,
      hachureAngle: -30,
      preserveVertices: true
    });
    expect(result.unknownKeys).toEqual([]);
    expect(result.invalidEntries).toEqual([]);
  });

  it('captures unknown and invalid rough entries without failing parse', () => {
    const code = `%%{init: {
  "x-mermint": {
    "rough": {
      "fooBar": 1,
      "seed": "nope"
    }
  }
}}%%
flowchart LR
  A --> B
`;

    const result = extractConfiguredRoughOptionsFromInput(code);
    expect(result.options).toEqual({});
    expect(result.unknownKeys).toEqual(['fooBar']);
    expect(result.invalidEntries).toEqual([{ key: 'seed', value: 'nope' }]);
  });
});
