import { describe, expect, it } from 'vitest';
import {
  parseFlowchartNodes,
  getEdgeLinesForNode,
  getStyleLinesForNode
} from './mermaidParser';

describe('parseFlowchartNodes', () => {
  it('parses basic node definitions', () => {
    const code = `flowchart TD
    A[Hello] --> B[World]`;
    const mappings = parseFlowchartNodes(code);
    expect(mappings).toHaveLength(2);
    expect(mappings[0]).toMatchObject({ nodeId: 'A', label: 'Hello', lineNumber: 2 });
    expect(mappings[1]).toMatchObject({ nodeId: 'B', label: 'World', lineNumber: 2 });
  });

  it('parses nodes with different bracket types', () => {
    const code = `flowchart TD
    A[Square]
    B(Round)
    C{{Diamond}}`;
    const mappings = parseFlowchartNodes(code);
    expect(mappings).toHaveLength(3);
    expect(mappings[0]).toMatchObject({ nodeId: 'A', label: 'Square' });
    expect(mappings[1]).toMatchObject({ nodeId: 'B', label: 'Round' });
    expect(mappings[2]).toMatchObject({ nodeId: 'C', label: 'Diamond' });
  });

  it('records first occurrence only for repeated node IDs', () => {
    const code = `flowchart TD
    A[First] --> B[Second]
    A --> C[Third]`;
    const mappings = parseFlowchartNodes(code);
    const aMapping = mappings.find((m) => m.nodeId === 'A');
    expect(aMapping).toBeDefined();
    expect(aMapping!.label).toBe('First');
    expect(aMapping!.lineNumber).toBe(2);
  });

  it('skips comment lines', () => {
    const code = `flowchart TD
    %% A[Comment]
    B[Real]`;
    const mappings = parseFlowchartNodes(code);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].nodeId).toBe('B');
  });

  it('skips keyword lines', () => {
    const code = `flowchart TD
    A[Node]
    style A fill:#f00
    classDef blue fill:#00f
    class A blue`;
    const mappings = parseFlowchartNodes(code);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].nodeId).toBe('A');
  });

  it('skips subgraph/end lines', () => {
    const code = `flowchart TD
    subgraph sub1
    A[Inside]
    end`;
    const mappings = parseFlowchartNodes(code);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].nodeId).toBe('A');
  });

  it('skips direction lines', () => {
    const code = `flowchart LR
    A[Node]`;
    const mappings = parseFlowchartNodes(code);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].nodeId).toBe('A');
  });

  it('provides accurate label column offsets', () => {
    const code = `flowchart TD
    A[Hello]`;
    const mappings = parseFlowchartNodes(code);
    const m = mappings[0];
    const line = code.split('\n')[1];
    const extractedLabel = line.slice(m.labelStart - 1, m.labelEnd - 1);
    expect(extractedLabel).toBe('Hello');
  });

  it('handles empty code', () => {
    expect(parseFlowchartNodes('')).toEqual([]);
  });

  it('handles code with no nodes', () => {
    const code = `flowchart TD
    %% just a comment`;
    expect(parseFlowchartNodes(code)).toEqual([]);
  });

  it('parses nodes connected by different arrow types', () => {
    const code = `flowchart TD
    A[Start] ==> B[Middle] -.-> C[End]`;
    const mappings = parseFlowchartNodes(code);
    expect(mappings).toHaveLength(3);
    expect(mappings.map((m) => m.nodeId)).toEqual(['A', 'B', 'C']);
  });
});

describe('getEdgeLinesForNode', () => {
  it('finds lines containing edges for a node', () => {
    const code = `flowchart TD
    A[Start] --> B[End]
    B --> C[Other]
    A --> C`;
    const edgeLines = getEdgeLinesForNode(code, 'A');
    expect(edgeLines).toContain(2);
    expect(edgeLines).toContain(4);
    expect(edgeLines).not.toContain(3);
  });

  it('does not match keyword or comment lines', () => {
    const code = `flowchart TD
    A[Node] --> B[Other]
    %% A --> B
    style A fill:#f00`;
    const edgeLines = getEdgeLinesForNode(code, 'A');
    expect(edgeLines).toEqual([2]);
  });

  it('returns empty for non-existent node', () => {
    const code = `flowchart TD
    A[Start] --> B[End]`;
    expect(getEdgeLinesForNode(code, 'Z')).toEqual([]);
  });
});

describe('getStyleLinesForNode', () => {
  it('finds style lines for a node', () => {
    const code = `flowchart TD
    A[Node]
    style A fill:#f00,color:#fff`;
    expect(getStyleLinesForNode(code, 'A')).toEqual([3]);
  });

  it('does not match style lines for other nodes', () => {
    const code = `flowchart TD
    A[Node]
    B[Other]
    style B fill:#00f`;
    expect(getStyleLinesForNode(code, 'A')).toEqual([]);
  });

  it('returns empty when no style lines exist', () => {
    const code = `flowchart TD
    A[Node]`;
    expect(getStyleLinesForNode(code, 'A')).toEqual([]);
  });
});
