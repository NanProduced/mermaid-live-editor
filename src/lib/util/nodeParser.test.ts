import { describe, expect, it } from 'vitest';
import {
  changeNodeColorInCode,
  deleteNodeInCode,
  isFlowchartDiagram,
  parseNodes,
  parseStyles,
  renameNodeInCode
} from './nodeParser';

describe('isFlowchartDiagram', () => {
  it('should detect flowchart declaration', () => {
    expect(isFlowchartDiagram('flowchart TD')).toBe(true);
    expect(isFlowchartDiagram('flowchart LR')).toBe(true);
    expect(isFlowchartDiagram('graph TD')).toBe(true);
    expect(isFlowchartDiagram('graph LR')).toBe(true);
  });

  it('should detect with leading whitespace', () => {
    expect(isFlowchartDiagram('  flowchart TD')).toBe(true);
  });

  it('should reject non-flowchart declarations', () => {
    expect(isFlowchartDiagram('sequenceDiagram')).toBe(false);
    expect(isFlowchartDiagram('classDiagram')).toBe(false);
    expect(isFlowchartDiagram('%% comment')).toBe(false);
  });
});

describe('parseNodes', () => {
  it('should parse basic flowchart node definitions', () => {
    const code = `flowchart TD
    A[Christmas]
    B(Go shopping)`;

    const nodes = parseNodes(code);
    expect(nodes.size).toBe(2);

    const a = nodes.get('A');
    expect(a).toBeDefined();
    expect(a?.label).toBe('Christmas');
    expect(a?.line).toBe(2);
    expect(a?.shape).toBe('rect');

    const b = nodes.get('B');
    expect(b).toBeDefined();
    expect(b?.label).toBe('Go shopping');
    expect(b?.line).toBe(3);
    expect(b?.shape).toBe('rounded');
  });

  it('should parse nodes from edge definitions', () => {
    const code = `flowchart TD
    A[Start] --> B[End]`;

    const nodes = parseNodes(code);
    expect(nodes.size).toBe(2);
    expect(nodes.has('A')).toBe(true);
    expect(nodes.has('B')).toBe(true);
    expect(nodes.get('A')?.label).toBe('Start');
    expect(nodes.get('B')?.label).toBe('End');
  });

  it('should parse various node shapes', () => {
    const code = `flowchart TD
    A[Rectangle]
    B(Rounded)
    C{Diamond}
    D((Circle))
    E([Stadium])
    F{{Hexagon}}`;

    const nodes = parseNodes(code);
    expect(nodes.size).toBe(6);
    expect(nodes.get('A')?.shape).toBe('rect');
    expect(nodes.get('B')?.shape).toBe('rounded');
    expect(nodes.get('C')?.shape).toBe('diamond');
    expect(nodes.get('D')?.shape).toBe('circle');
    expect(nodes.get('E')?.shape).toBe('stadium');
    expect(nodes.get('F')?.shape).toBe('hexagon');
  });

  it('should parse nodes with edge labels', () => {
    const code = `flowchart TD
    C -->|One| D[Laptop]
    C -->|Two| E[iPhone]`;

    const nodes = parseNodes(code);
    // Only D and E have explicit definitions
    expect(nodes.has('D')).toBe(true);
    expect(nodes.has('E')).toBe(true);
    expect(nodes.get('D')?.label).toBe('Laptop');
    expect(nodes.get('E')?.label).toBe('iPhone');
  });

  it('should only store the first definition of a node', () => {
    const code = `flowchart TD
    A[First]
    A[Second]`;

    const nodes = parseNodes(code);
    expect(nodes.size).toBe(1);
    expect(nodes.get('A')?.label).toBe('First');
    expect(nodes.get('A')?.line).toBe(2);
  });

  it('should skip comment lines', () => {
    const code = `flowchart TD
    %% A[This should be skipped]
    A[Real Node]`;

    const nodes = parseNodes(code);
    expect(nodes.size).toBe(1);
    expect(nodes.get('A')?.label).toBe('Real Node');
  });

  it('should skip style and classDef declarations', () => {
    const code = `flowchart TD
    A[Node]
    style A fill:#f9f
    classDef custom fill:#bbf`;

    const nodes = parseNodes(code);
    expect(nodes.size).toBe(1);
    expect(nodes.get('A')?.label).toBe('Node');
  });

  it('should skip subgraph declarations', () => {
    const code = `flowchart TD
    subgraph MySubgraph
    A[Node]
    end`;

    const nodes = parseNodes(code);
    expect(nodes.size).toBe(1);
    expect(nodes.get('A')?.label).toBe('Node');
  });

  it('should handle empty code', () => {
    expect(parseNodes('').size).toBe(0);
    expect(parseNodes('flowchart TD').size).toBe(0);
  });

  it('should return empty for non-flowchart diagrams', () => {
    const code = `sequenceDiagram
    A->>B: Hello`;
    expect(parseNodes(code).size).toBe(0);
  });

  it('should handle the default state code', () => {
    const code = `flowchart TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}
    C -->|One| D[Laptop]
    C -->|Two| E[iPhone]
    C -->|Three| F[fa:fa-car Car]`;

    const nodes = parseNodes(code);
    expect(nodes.size).toBe(6);
    expect(nodes.get('A')?.label).toBe('Christmas');
    expect(nodes.get('B')?.label).toBe('Go shopping');
    expect(nodes.get('C')?.label).toBe('Let me think');
    expect(nodes.get('D')?.label).toBe('Laptop');
    expect(nodes.get('E')?.label).toBe('iPhone');
    expect(nodes.get('F')?.label).toBe('fa:fa-car Car');
  });

  it('should track correct line numbers', () => {
    const code = `flowchart TD
    %% comment line
    A[Node A]

    B[Node B]`;

    const nodes = parseNodes(code);
    expect(nodes.get('A')?.line).toBe(3);
    expect(nodes.get('B')?.line).toBe(5);
  });
});

describe('parseStyles', () => {
  it('should parse style declarations', () => {
    const code = `flowchart TD
    A[Node]
    style A fill:#f9f,stroke:#333`;

    const styles = parseStyles(code);
    expect(styles.has('A')).toBe(true);
    expect(styles.get('A')?.length).toBe(1);
    expect(styles.get('A')?.[0].line).toBe(3);
  });

  it('should parse multiple styles for the same node', () => {
    const code = `flowchart TD
    style A fill:#f9f
    style A stroke:#333`;

    const styles = parseStyles(code);
    expect(styles.get('A')?.length).toBe(2);
  });
});

describe('renameNodeInCode', () => {
  it('should rename a node label', () => {
    const code = `flowchart TD\n    A[Christmas] --> B(Go shopping)`;
    const result = renameNodeInCode(code, 'A', 'Birthday');
    expect(result).toContain('A[Birthday]');
    expect(result).toContain('B(Go shopping)');
  });

  it('should preserve other nodes', () => {
    const code = `flowchart TD
    A[Hello] --> B[World]`;
    const result = renameNodeInCode(code, 'A', 'Hi');
    expect(result).toContain('A[Hi]');
    expect(result).toContain('B[World]');
  });

  it('should only rename the specific node, not references', () => {
    const code = `flowchart TD
    A[Node A] --> B[Node B]
    B --> C[End]`;

    const result = renameNodeInCode(code, 'B', 'Middle');
    expect(result).toContain('A[Node A]');
    expect(result).toContain('B[Middle]');
    expect(result).toContain('C[End]');
  });

  it('should return unchanged code if node not found', () => {
    const code = `flowchart TD\n    A[Hello]`;
    const result = renameNodeInCode(code, 'X', 'New');
    expect(result).toBe(code);
  });

  it('should handle nodes with special characters in labels', () => {
    const code = `flowchart TD\n    A[Hello <br/> World]`;
    const result = renameNodeInCode(code, 'A', 'New<br/>Label');
    expect(result).toContain('A[New<br/>Label]');
  });
});

describe('changeNodeColorInCode', () => {
  it('should add a new style declaration when none exists', () => {
    const code = `flowchart TD\n    A[Node]`;
    const result = changeNodeColorInCode(code, 'A', '#ff0000');
    expect(result).toContain('style A fill:#ff0000');
  });

  it('should update existing fill color in style', () => {
    const code = `flowchart TD
    A[Node]
    style A fill:#00ff00,stroke:#333`;

    const result = changeNodeColorInCode(code, 'A', '#ff0000');
    expect(result).toContain('fill:#ff0000');
    expect(result).toContain('stroke:#333');
    expect(result).not.toContain('fill:#00ff00');
  });

  it('should append fill to style without fill', () => {
    const code = `flowchart TD
    A[Node]
    style A stroke:#333`;

    const result = changeNodeColorInCode(code, 'A', '#ff0000');
    expect(result).toContain('style A stroke:#333,fill:#ff0000');
  });

  it('should return unchanged code if node not found in map', () => {
    // Node X is not in any style map, so a new style line is added
    const code = `flowchart TD\n    A[Node]`;
    const result = changeNodeColorInCode(code, 'X', '#ff0000');
    expect(result).toContain('style X fill:#ff0000');
  });
});

describe('deleteNodeInCode', () => {
  it('should delete a standalone node definition line', () => {
    const code = `flowchart TD
    A[Node A]
    B[Node B]
    C[Node C]`;

    const result = deleteNodeInCode(code, 'B');
    expect(result).toContain('A[Node A]');
    expect(result).not.toContain('B[Node B]');
    expect(result).toContain('C[Node C]');
  });

  it('should delete edges referencing the node', () => {
    const code = `flowchart TD
    A[Node A] --> B[Node B]
    B --> C[Node C]`;

    const result = deleteNodeInCode(code, 'B');
    expect(result).toContain('A[Node A]');
    expect(result).not.toContain('B[Node B]');
    expect(result).toContain('C[Node C]');
  });

  it('should delete style declarations for the node', () => {
    const code = `flowchart TD
    A[Node]
    style A fill:#ff0000`;

    const result = deleteNodeInCode(code, 'A');
    expect(result).not.toContain('A[Node]');
    expect(result).not.toContain('style A');
  });

  it('should not affect other nodes or edges', () => {
    const code = `flowchart TD
    A[Start] --> B[Decision]
    B -->|Yes| C[End]
    B -->|No| D[Retry]
    D --> A`;

    const result = deleteNodeInCode(code, 'B');
    expect(result).toContain('A[Start]');
    expect(result).toContain('C[End]');
    expect(result).toContain('D[Retry]');
    // Edges that reference B should be gone
    expect(result).not.toContain('B');
  });

  it('should preserve the diagram type declaration', () => {
    const code = `flowchart LR
    A[Only Node]`;

    const result = deleteNodeInCode(code, 'A');
    expect(result).toContain('flowchart LR');
  });

  it('should preserve comments', () => {
    const code = `flowchart TD
    %% This is a comment
    A[Node A]
    B[Node B]`;

    const result = deleteNodeInCode(code, 'A');
    expect(result).toContain('%% This is a comment');
    expect(result).toContain('B[Node B]');
  });

  it('should not confuse similar node IDs', () => {
    const code = `flowchart TD
    A[Node A]
    AB[Node AB]`;

    const result = deleteNodeInCode(code, 'A');
    expect(result).not.toContain('A[Node A]');
    // AB should NOT be deleted (different node)
    expect(result).toContain('AB[Node AB]');
  });
});
