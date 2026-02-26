import { describe, expect, it } from 'vitest';
import { inferDiagramAlt } from '../src/markdown.js';

describe('inferDiagramAlt', () => {
  it('infers type when frontmatter precedes the diagram declaration', () => {
    const code = `---
config:
  look: handDrawn
---
sequenceDiagram
  A->>B: ping
`;
    expect(inferDiagramAlt(code, 1)).toBe('Sequence diagram');
  });

  it('infers type when init directives and comments precede declaration', () => {
    const code = `%%{init: { \"look\": \"handDrawn\" }}%%
%% this is a comment
classDiagram
  class A
`;
    expect(inferDiagramAlt(code, 2)).toBe('Class diagram');
  });

  it('falls back to generic alt for unknown diagram heads', () => {
    const code = `---
title: Example
---
customDiagram
  A --> B
`;
    expect(inferDiagramAlt(code, 7)).toBe('Mermaid diagram 7');
  });
});
