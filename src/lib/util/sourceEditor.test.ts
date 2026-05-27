import { describe, it, expect } from 'vitest';
import { renameNode, renameNodeLabel, changeNodeColor, deleteNode } from './sourceEditor';

const sampleCode = `flowchart TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}
    C -->|One| D[Laptop]
    C -->|Two| E[iPhone]
    C -->|Three| F[fa:fa-car Car]`;

describe('renameNode', () => {
  it('renames a node definition and preserves edges', () => {
    const result = renameNode(sampleCode, 'A', 'X');
    expect(result).toContain('X[Christmas]');
    expect(result).toContain('X[Christmas] -->|Get money|');
    expect(result).not.toMatch(/(?:^|\s)A\[Christmas\]/);
  });

  it('does not rename node ID inside label text', () => {
    const code = `flowchart TD
    A[Text with A inside] --> B[End]`;
    const result = renameNode(code, 'A', 'X');
    expect(result).toContain('Text with A inside');
    expect(result).toContain('X[Text with A inside]');
  });

  it('renames node in edge references on other lines', () => {
    const code = `flowchart TD
    A[Start] --> B[End]
    A --> C[Other]`;
    const result = renameNode(code, 'A', 'X');
    expect(result).toContain('X[Start]');
    expect(result).toContain('X --> C');
  });

  it('renames standalone node ID on same line as definition', () => {
    const code = `flowchart TD
    A[Start] --> B[End]`;
    const result = renameNode(code, 'A', 'X');
    expect(result).toContain('X[Start]');
    expect(result).toContain('X[Start] --> B');
  });

  it('renames node when used as edge target', () => {
    const code = `flowchart TD
    A[Start] --> B[End]`;
    const result = renameNode(code, 'B', 'Y');
    expect(result).toContain('Y[End]');
    expect(result).toContain('A[Start] --> Y');
  });
});

describe('renameNodeLabel', () => {
  it('renames label of a rect node', () => {
    const result = renameNodeLabel(sampleCode, 'A', 'New Year');
    expect(result).toContain('A[New Year]');
    expect(result).not.toContain('A[Christmas]');
    expect(result).toContain('B(Go shopping)');
  });

  it('renames label of a rounded node', () => {
    const result = renameNodeLabel(sampleCode, 'B', 'Browse shops');
    expect(result).toContain('B(Browse shops)');
    expect(result).not.toContain('B(Go shopping)');
  });

  it('renames label of a diamond node', () => {
    const result = renameNodeLabel(sampleCode, 'C', 'Decide');
    expect(result).toContain('C{Decide}');
    expect(result).not.toContain('C{Let me think}');
  });

  it('does not change the node ID', () => {
    const result = renameNodeLabel(sampleCode, 'A', 'New Year');
    expect(result).toContain('A[New Year]');
    expect(result).toContain('A[New Year] -->|Get money| B');
  });
});

describe('changeNodeColor', () => {
  it('appends style line when no existing style', () => {
    const result = changeNodeColor(sampleCode, 'A', '#ff0000');
    expect(result).toContain('style A fill:#ff0000,stroke:#ff0000');
  });

  it('updates existing style line', () => {
    const code = `flowchart TD
    A[Start]
    style A fill:#00ff00`;
    const result = changeNodeColor(code, 'A', '#ff0000');
    expect(result).toContain('fill:#ff0000');
    expect(result).not.toContain('fill:#00ff00');
  });

  it('adds stroke to existing style line without stroke', () => {
    const code = `flowchart TD
    A[Start]
    style A fill:#00ff00`;
    const result = changeNodeColor(code, 'A', '#ff0000');
    expect(result).toContain('stroke:#ff0000');
  });
});

describe('deleteNode', () => {
  it('removes node definition and referencing edge lines', () => {
    const result = deleteNode(sampleCode, 'C');
    expect(result).not.toContain('C{Let me think}');
    expect(result).not.toContain('C -->|One|');
    expect(result).not.toContain('B --> C');
    expect(result).toContain('A[Christmas]');
    expect(result).toContain('B(Go shopping)');
  });

  it('removes style and click lines for the node', () => {
    const code = `flowchart TD
    A[Start] --> B[End]
    style A fill:#ff0000
    click A "https://example.com"`;
    const result = deleteNode(code, 'A');
    expect(result).not.toContain('style A');
    expect(result).not.toContain('click A');
  });

  it('removes edge lines that reference the deleted node', () => {
    const result = deleteNode(sampleCode, 'D');
    expect(result).not.toContain('C -->|One| D[Laptop]');
    expect(result).toContain('C -->|Two| E[iPhone]');
  });

  it('preserves other nodes on same line when deleting middle node', () => {
    const code = `flowchart TD
    A[Start] --> B[Middle] --> C[End]`;
    const result = deleteNode(code, 'B');
    expect(result).toContain('A[Start]');
    expect(result).toContain('C[End]');
    expect(result).not.toContain('B[Middle]');
    expect(result).toContain('A[Start] --> C[End]');
  });

  it('preserves first and last nodes when deleting middle of chain', () => {
    const code = `flowchart TD
    A[First] --> B[Second] --> C[Third] --> D[Fourth]`;
    const result = deleteNode(code, 'C');
    expect(result).toContain('A[First]');
    expect(result).toContain('B[Second]');
    expect(result).toContain('D[Fourth]');
    expect(result).not.toContain('C[Third]');
  });
});
