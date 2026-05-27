import { describe, expect, it } from 'vitest';
import { renameNodeLabel, changeNodeColor, deleteNode } from './mermaidEdits';
import { parseFlowchartNodes } from './mermaidParser';

describe('renameNodeLabel', () => {
  it('renames a node label without affecting other content', () => {
    const code = `flowchart TD
    A[Hello] --> B[World]`;
    const mappings = parseFlowchartNodes(code);
    const mappingA = mappings.find((m) => m.nodeId === 'A')!;
    const result = renameNodeLabel(code, mappingA, 'Goodbye');
    expect(result).toContain('A[Goodbye]');
    expect(result).toContain('B[World]');
  });

  it('does not affect same-named content on other lines', () => {
    const code = `flowchart TD
    A[Hello] --> B[Hello]
    %% Hello is a greeting`;
    const mappings = parseFlowchartNodes(code);
    const mappingA = mappings.find((m) => m.nodeId === 'A')!;
    const result = renameNodeLabel(code, mappingA, 'Changed');
    expect(result).toContain('A[Changed]');
    expect(result).toContain('B[Hello]');
    expect(result).toContain('%% Hello is a greeting');
  });

  it('handles label with special characters', () => {
    const code = `flowchart TD
    A[Hello World!]`;
    const mappings = parseFlowchartNodes(code);
    const result = renameNodeLabel(code, mappings[0], 'New Label');
    expect(result).toContain('A[New Label]');
  });

  it('returns code unchanged for invalid line number', () => {
    const code = `flowchart TD
    A[Hello]`;
    const fakeMapping = {
      nodeId: 'A',
      lineNumber: 99,
      startColumn: 1,
      endColumn: 10,
      label: 'Hello',
      labelStart: 1,
      labelEnd: 6
    };
    expect(renameNodeLabel(code, fakeMapping, 'X')).toBe(code);
  });
});

describe('changeNodeColor', () => {
  it('adds a style line when no existing style', () => {
    const code = `flowchart TD
    A[Hello]`;
    const result = changeNodeColor(code, 'A', '#ff0000');
    expect(result).toContain('style A fill:#ff0000,color:#fff,stroke:#ff0000');
  });

  it('replaces existing style line', () => {
    const code = `flowchart TD
    A[Hello]
    style A fill:#00f,color:#fff,stroke:#00f`;
    const result = changeNodeColor(code, 'A', '#ff0000');
    const styleLines = result.split('\n').filter((l) => l.trim().startsWith('style A'));
    expect(styleLines).toHaveLength(1);
    expect(styleLines[0]).toContain('fill:#ff0000');
  });

  it('does not affect styles for other nodes', () => {
    const code = `flowchart TD
    A[Hello]
    B[World]
    style B fill:#0f0,color:#fff,stroke:#0f0`;
    const result = changeNodeColor(code, 'A', '#ff0000');
    expect(result).toContain('style B fill:#0f0,color:#fff,stroke:#0f0');
    expect(result).toContain('style A fill:#ff0000');
  });
});

describe('deleteNode', () => {
  it('removes node definition and its edges', () => {
    const code = `flowchart TD
    A[Start] --> B[Middle]
    B --> C[End]
    A --> C`;
    const mappings = parseFlowchartNodes(code);
    const result = deleteNode(code, 'A', mappings);
    expect(result).not.toContain('A[Start]');
    expect(result).not.toContain('A -->');
    expect(result).toContain('B --> C');
  });

  it('removes associated style lines', () => {
    const code = `flowchart TD
    A[Hello]
    B[World]
    style A fill:#f00,color:#fff`;
    const mappings = parseFlowchartNodes(code);
    const result = deleteNode(code, 'A', mappings);
    expect(result).not.toContain('style A');
    expect(result).toContain('B[World]');
  });

  it('preserves unrelated lines', () => {
    const code = `flowchart TD
    A[Start] --> B[End]
    C[Other] --> D[Node]
    %% This is a comment`;
    const mappings = parseFlowchartNodes(code);
    const result = deleteNode(code, 'A', mappings);
    expect(result).toContain('C[Other] --> D[Node]');
    expect(result).toContain('%% This is a comment');
  });

  it('handles node with no edges or styles', () => {
    const code = `flowchart TD
    A[Alone]
    B[Other]`;
    const mappings = parseFlowchartNodes(code);
    const result = deleteNode(code, 'A', mappings);
    expect(result).not.toContain('A[Alone]');
    expect(result).toContain('B[Other]');
  });

  it('handles non-existent node gracefully', () => {
    const code = `flowchart TD
    A[Hello]`;
    const mappings = parseFlowchartNodes(code);
    const result = deleteNode(code, 'Z', mappings);
    expect(result).toBe(code);
  });
});
