import { describe, expect, it } from 'vitest';
import {
  changeNodeColor,
  deleteNode,
  matchSvgToNodeId,
  parseNodes,
  renameNode
} from './nodeParser';

const sampleCode = `flowchart TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}
    C -->|One| D[Laptop]
    C -->|Two| E[iPhone]
    C -->|Three| F[fa:fa-car Car]
`;

describe('parseNodes', () => {
  it('should extract all node definitions with correct positions', () => {
    const nodes = parseNodes(sampleCode);
    expect(nodes).toHaveLength(6);

    const nodeA = nodes.find((n) => n.id === 'A');
    expect(nodeA).toBeDefined();
    expect(nodeA!.label).toBe('Christmas');
    expect(nodeA!.shape).toBe('rect');
    expect(nodeA!.line).toBe(2);

    const nodeB = nodes.find((n) => n.id === 'B');
    expect(nodeB).toBeDefined();
    expect(nodeB!.label).toBe('Go shopping');
    expect(nodeB!.shape).toBe('round');
    expect(nodeB!.line).toBe(2);

    const nodeC = nodes.find((n) => n.id === 'C');
    expect(nodeC).toBeDefined();
    expect(nodeC!.label).toBe('Let me think');
    expect(nodeC!.shape).toBe('diamond');
    expect(nodeC!.line).toBe(3);

    const nodeD = nodes.find((n) => n.id === 'D');
    expect(nodeD).toBeDefined();
    expect(nodeD!.label).toBe('Laptop');
    expect(nodeD!.shape).toBe('rect');

    const nodeF = nodes.find((n) => n.id === 'F');
    expect(nodeF).toBeDefined();
    expect(nodeF!.label).toBe('fa:fa-car Car');
  });

  it('should only return first occurrence of each node', () => {
    const code = `flowchart TD
    A[First] --> B[Second]
    A --> C[Third]`;
    const nodes = parseNodes(code);
    const aNodes = nodes.filter((n) => n.id === 'A');
    expect(aNodes).toHaveLength(1);
    expect(aNodes[0].label).toBe('First');
  });

  it('should skip style and classDef lines', () => {
    const code = `flowchart TD
    A[Node A]
    style A fill:#f9f,stroke:#333
    classDef myClass fill:#fff`;
    const nodes = parseNodes(code);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('A');
  });

  it('should handle various node shapes', () => {
    const code = `flowchart TD
    A[rect]
    B(round)
    C{diamond}
    D((circle))
    E[[subroutine]]
    F[(cylinder)]
    G{{hexagon}}
    H>flag]`;
    const nodes = parseNodes(code);
    expect(nodes).toHaveLength(8);
    expect(nodes.find((n) => n.id === 'A')!.shape).toBe('rect');
    expect(nodes.find((n) => n.id === 'B')!.shape).toBe('round');
    expect(nodes.find((n) => n.id === 'C')!.shape).toBe('diamond');
    expect(nodes.find((n) => n.id === 'D')!.shape).toBe('circle');
    expect(nodes.find((n) => n.id === 'E')!.shape).toBe('subroutine');
    expect(nodes.find((n) => n.id === 'G')!.shape).toBe('hexagon');
    expect(nodes.find((n) => n.id === 'H')!.shape).toBe('asymmetric');
  });

  it('should return empty array for non-flowchart code', () => {
    const code = `classDiagram
    class Animal {
        +String name
    }`;
    const nodes = parseNodes(code);
    expect(nodes).toHaveLength(0);
  });

  it('should handle empty code', () => {
    expect(parseNodes('')).toHaveLength(0);
  });
});

describe('renameNode', () => {
  it('should rename a node label precisely', () => {
    const result = renameNode(sampleCode, 'A', 'New Year');
    expect(result).toContain('A[New Year]');
    // Original label should be gone
    expect(result).not.toContain('A[Christmas]');
    // Other nodes should be unchanged
    expect(result).toContain('B(Go shopping)');
    expect(result).toContain('D[Laptop]');
  });

  it('should not affect other nodes with similar IDs', () => {
    const code = `flowchart TD
    A[Alpha]
    AB[Beta]
    A --> AB`;
    const result = renameNode(code, 'A', 'Gamma');
    expect(result).toContain('A[Gamma]');
    expect(result).toContain('AB[Beta]'); // AB should not be affected
  });

  it('should not affect comments or style lines', () => {
    const code = `flowchart TD
    %% A[Christmas] is the first node
    A[Christmas] --> B[Shopping]
    style A fill:#f9f`;
    const result = renameNode(code, 'A', 'New Year');
    // Comment should remain unchanged
    expect(result).toContain('%% A[Christmas] is the first node');
    // Style line should remain unchanged
    expect(result).toContain('style A fill:#f9f');
    // Only the node definition should change
    expect(result).toContain('A[New Year]');
  });

  it('should return unchanged code if node not found', () => {
    const result = renameNode(sampleCode, 'Z', 'New');
    expect(result).toBe(sampleCode);
  });
});

describe('changeNodeColor', () => {
  it('should add a style line for the node', () => {
    const result = changeNodeColor(sampleCode, 'A', '#ff0000', '#cc0000');
    expect(result).toContain('style A fill:#ff0000,stroke:#cc0000');
    // Rest of the code should be intact
    expect(result).toContain('A[Christmas]');
    expect(result).toContain('B(Go shopping)');
  });

  it('should replace existing style for the same node', () => {
    const codeWithStyle = `${sampleCode}style A fill:#00ff00`;
    const result = changeNodeColor(codeWithStyle, 'A', '#ff0000');
    // Should not have duplicate style lines for A
    const styleLines = result.split('\n').filter((l) => l.includes('style A'));
    expect(styleLines).toHaveLength(1);
    expect(styleLines[0]).toContain('fill:#ff0000');
  });

  it('should not affect style lines for other nodes', () => {
    const codeWithStyle = `${sampleCode}style B fill:#00ff00`;
    const result = changeNodeColor(codeWithStyle, 'A', '#ff0000');
    expect(result).toContain('style B fill:#00ff00');
  });

  it('should include text color when provided', () => {
    const result = changeNodeColor(sampleCode, 'A', '#ff0000', '#cc0000', '#ffffff');
    expect(result).toContain('style A fill:#ff0000,stroke:#cc0000,color:#ffffff');
  });
});

describe('deleteNode', () => {
  it('should remove the node definition line', () => {
    const result = deleteNode(sampleCode, 'D');
    expect(result).not.toContain('D[Laptop]');
    // Other nodes should remain
    expect(result).toContain('A[Christmas]');
    expect(result).toContain('B(Go shopping)');
  });

  it('should remove edges involving the deleted node', () => {
    const code = `flowchart TD
    A[Start] --> B[Middle]
    B --> C[End]`;
    const result = deleteNode(code, 'B');
    expect(result).not.toContain('B[Middle]');
    // Edges involving B should be removed
    expect(result).not.toContain('A[Start] --> B[Middle]');
    expect(result).not.toContain('B --> C[End]');
    // A and C definitions should remain (if they are defined elsewhere)
  });

  it('should remove style lines for the deleted node', () => {
    const codeWithStyle = `${sampleCode}style A fill:#f9f`;
    const result = deleteNode(codeWithStyle, 'A');
    expect(result).not.toContain('style A');
  });

  it('should not affect other nodes', () => {
    const result = deleteNode(sampleCode, 'D');
    expect(result).toContain('A[Christmas]');
    expect(result).toContain('C{Let me think}');
    expect(result).toContain('E[iPhone]');
  });

  it('should not break sibling node label when two nodes are on the same line', () => {
    const code = `flowchart TD
    A[Alpha] --> AB[beta]`;
    const result = deleteNode(code, 'A');
    // AB[beta] should remain intact
    expect(result).toContain('AB[beta]');
    // A's label should be stripped, but the line should remain (edge still exists)
    expect(result).not.toContain('A[Alpha]');
  });

  it('should strip target label without removing the line', () => {
    const code = `flowchart TD
    C -->|One| D[Laptop]`;
    const result = deleteNode(code, 'D');
    // The line should not contain D[Laptop] anymore
    expect(result).not.toContain('D[Laptop]');
  });

  it('should handle bare source node removal', () => {
    const code = `flowchart TD
    A[Start] --> B[Middle]
    B --> C[End]`;
    const result = deleteNode(code, 'B');
    // Both lines involving B should be gone
    expect(result).not.toContain('B[Middle]');
    expect(result).not.toContain('B --> C[End]');
  });
  it('should not corrupt sibling labels when node ID is a substring of another', () => {
    const code = `flowchart TD
    AB[Alpha] --> C[Gamma]`;
    const result = deleteNode(code, 'A');
    // AB[Alpha] must be completely untouched since we're deleting A, not AB
    expect(result).toContain('AB[Alpha]');
    expect(result).toContain('C[Gamma]');
  });

  it('should handle chain pattern without consuming sibling nodes', () => {
    const code = `flowchart TD
    Start --> A[Alpha] --> AB[beta] --> End`;
    const result = deleteNode(code, 'A');
    // AB[beta] and End must be preserved
    expect(result).toContain('AB[beta]');
    expect(result).toContain('End');
    expect(result).not.toContain('A[Alpha]');
  });

  it('should reconnect chain when deleting middle bare node', () => {
    const code = `flowchart TD
    A --> B --> C`;
    const result = deleteNode(code, 'B');
    // Chain should reconnect: A --> C
    expect(result).toContain('A');
    expect(result).toContain('C');
    // B should be gone
    expect(result).not.toContain('B -->');
    expect(result).not.toContain('--> B');
  });

  it('should preserve all other node labels in complex graph', () => {
    const code = `flowchart TD
    A[Alpha] --> B[Beta]
    A --> C[Gamma]
    B --> D[Delta]
    C --> D`;
    const result = deleteNode(code, 'B');
    // A[Alpha] and C[Gamma] must be preserved (defined on lines not removed)
    expect(result).toContain('A[Alpha]');
    expect(result).toContain('C[Gamma]');
    // B's label should be stripped from the first line
    expect(result).not.toContain('B[Beta]');
    // Line "B --> D[Delta]" is removed entirely (bare source B),
    // so D[Delta] is lost (its only definition was on that line)
    expect(result).not.toContain('B -->');
  });
});

describe('matchSvgToNodeId', () => {
  it('should match SVG element ID to node ID', () => {
    const known = ['A', 'B', 'C'];
    expect(matchSvgToNodeId('flowchart-A-0', known)).toBe('A');
    expect(matchSvgToNodeId('flowchart-B-1', known)).toBe('B');
    expect(matchSvgToNodeId('flowchart-C-2', known)).toBe('C');
  });

  it('should prefer longer IDs to avoid partial matches', () => {
    const known = ['A', 'AB'];
    expect(matchSvgToNodeId('flowchart-AB-0', known)).toBe('AB');
    expect(matchSvgToNodeId('flowchart-A-0', known)).toBe('A');
  });

  it('should return null for unmatched IDs', () => {
    const known = ['A', 'B'];
    expect(matchSvgToNodeId('flowchart-Z-0', known)).toBeNull();
  });
});
