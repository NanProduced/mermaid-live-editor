import { describe, it, expect } from 'vitest';
import { parseSource } from './mermaidSourceParser';

describe('parseSource', () => {
  it('parses a simple 3-node flowchart', () => {
    const code = `flowchart TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}`;
    const result = parseSource(code);

    expect(result.diagramType).toBe('flowchart');
    expect(result.nodes.size).toBe(3);
    expect(result.nodes.get('A')).toBeDefined();
    expect(result.nodes.get('A')!.line).toBe(2);
    expect(result.nodes.get('A')!.label).toBe('Christmas');
    expect(result.nodes.get('A')!.shapeType).toBe('rect');
    expect(result.nodes.get('B')!.line).toBe(2);
    expect(result.nodes.get('B')!.label).toBe('Go shopping');
    expect(result.nodes.get('B')!.shapeType).toBe('rounded');
    expect(result.nodes.get('C')!.line).toBe(3);
    expect(result.nodes.get('C')!.label).toBe('Let me think');
    expect(result.nodes.get('C')!.shapeType).toBe('diamond');
  });

  it('builds lineToNodeId reverse mapping', () => {
    const code = `flowchart TD
    A[First] --> B[Second]
    C[Third]`;
    const result = parseSource(code);

    expect(result.lineToNodeId.get(2)).toBe('A');
    expect(result.lineToNodeId.get(3)).toBe('C');
  });

  it('handles multi-statement lines', () => {
    const code = `flowchart LR
    A --> B --> C[Third]`;
    const result = parseSource(code);

    expect(result.nodes.get('C')).toBeDefined();
    expect(result.nodes.get('C')!.line).toBe(2);
    expect(result.nodes.get('C')!.label).toBe('Third');
  });

  it('handles various node shapes', () => {
    const code = `flowchart TD
    A[Rectangle]
    B(Rounded)
    C{Diamond}
    D((Circle))
    E([Stadium])
    F[[Subroutine]]
    G[(Cylinder)]
    H{{Hexagon}}`;
    const result = parseSource(code);

    expect(result.nodes.get('A')!.shapeType).toBe('rect');
    expect(result.nodes.get('B')!.shapeType).toBe('rounded');
    expect(result.nodes.get('C')!.shapeType).toBe('diamond');
    expect(result.nodes.get('D')!.shapeType).toBe('double-circle');
    expect(result.nodes.get('E')!.shapeType).toBe('stadium');
    expect(result.nodes.get('F')!.shapeType).toBe('subroutine');
    expect(result.nodes.get('G')!.shapeType).toBe('cylinder');
    expect(result.nodes.get('H')!.shapeType).toBe('hexagon');
  });

  it('skips classDef and style lines', () => {
    const code = `flowchart TD
    A[Test]
    classDef highlight fill:#f96
    style A fill:#f96`;
    const result = parseSource(code);

    expect(result.nodes.size).toBe(1);
    expect(result.nodes.get('A')).toBeDefined();
  });

  it('skips subgraph and end lines', () => {
    const code = `flowchart TD
    subgraph sg1 [My Subgraph]
    A[Test]
    end`;
    const result = parseSource(code);

    expect(result.nodes.has('sg1')).toBe(false);
    expect(result.nodes.get('A')).toBeDefined();
  });

  it('returns empty for empty source', () => {
    const result = parseSource('');
    expect(result.nodes.size).toBe(0);
    expect(result.lineToNodeId.size).toBe(0);
  });

  it('handles graph keyword', () => {
    const code = `graph LR
    A[Hello] --> B[World]`;
    const result = parseSource(code);

    expect(result.diagramType).toBe('flowchart');
    expect(result.nodes.size).toBe(2);
  });

  it('handles nodes with FontAwesome icons', () => {
    const code = `flowchart TD
    C -->|Three| F[fa:fa-car Car]`;
    const result = parseSource(code);

    expect(result.nodes.get('F')).toBeDefined();
    expect(result.nodes.get('F')!.label).toBe('fa:fa-car Car');
  });
});
