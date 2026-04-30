import { describe, expect, it, beforeEach } from 'vitest';
import { parseNodes, findNodeByPosition, findNodeBySvgId, type NodeMapping, type ParseResult } from './nodeSync';

describe('nodeSync', () => {
  describe('parseNodes', () => {
    it('should parse flowchart nodes correctly', () => {
      const code = `flowchart TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}
    C -->|One| D[Laptop]
    C -->|Two| E[iPhone]
    C -->|Three| F[fa:fa-car Car]
  `;

      const result: ParseResult = parseNodes(code);

      expect(result.success).toBe(true);
      expect(result.diagramType).toBe('flowchart');
      expect(result.mappings.length).toBeGreaterThan(0);

      const nodeNames = result.mappings.map((m) => m.nodeName);
      expect(nodeNames).toContain('A');
      expect(nodeNames).toContain('B');
      expect(nodeNames).toContain('C');
      expect(nodeNames).toContain('D');
      expect(nodeNames).toContain('E');
      expect(nodeNames).toContain('F');
    });

    it('should parse class diagram nodes correctly', () => {
      const code = `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +breed: String
        +bark()
    }
    class Cat {
        +color: String
        +meow()
    }
    Animal <|-- Dog
    Animal <|-- Cat
  `;

      const result: ParseResult = parseNodes(code);

      expect(result.success).toBe(true);
      expect(result.diagramType).toBe('classDiagram');
      expect(result.mappings.length).toBeGreaterThan(0);

      const nodeNames = result.mappings.map((m) => m.nodeName);
      expect(nodeNames).toContain('Animal');
      expect(nodeNames).toContain('Dog');
      expect(nodeNames).toContain('Cat');
    });

    it('should parse sequence diagram nodes correctly', () => {
      const code = `sequenceDiagram
    participant User
    participant Browser
    participant Server
    participant Database

    User->>Browser: Login Request
    Browser->>Server: Authentication Request
    Server->>Database: Query User
    Database-->>Server: User Data
    Server-->>Browser: Authentication Response
    Browser-->>User: Login Success
  `;

      const result: ParseResult = parseNodes(code);

      expect(result.success).toBe(true);
      expect(result.diagramType).toBe('sequenceDiagram');
      expect(result.mappings.length).toBeGreaterThan(0);

      const nodeNames = result.mappings.map((m) => m.nodeName);
      expect(nodeNames).toContain('User');
      expect(nodeNames).toContain('Browser');
      expect(nodeNames).toContain('Server');
      expect(nodeNames).toContain('Database');
    });

    it('should parse state diagram nodes correctly', () => {
      const code = `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing: Event1
    Processing --> Success: Event2
    Processing --> Failed: Event3
    Success --> [*]
    Failed --> [*]
  `;

      const result: ParseResult = parseNodes(code);

      expect(result.success).toBe(true);
      expect(result.diagramType).toBe('stateDiagram');
      expect(result.mappings.length).toBeGreaterThan(0);

      const nodeNames = result.mappings.map((m) => m.nodeName);
      expect(nodeNames).toContain('Idle');
      expect(nodeNames).toContain('Processing');
      expect(nodeNames).toContain('Success');
      expect(nodeNames).toContain('Failed');
    });

    it('should parse ER diagram nodes correctly', () => {
      const code = `erDiagram
    CUSTOMER ||--o{ ORDER : places
    CUSTOMER {
        string name
        string email
        int age
    }
    ORDER ||--|{ ORDER_ITEM : contains
    ORDER {
        date orderDate
        float totalAmount
    }
    ORDER_ITEM }|--|| PRODUCT : includes
    PRODUCT {
        string name
        float price
        string category
    }
  `;

      const result: ParseResult = parseNodes(code);

      expect(result.success).toBe(true);
      expect(result.diagramType).toBe('erDiagram');
      expect(result.mappings.length).toBeGreaterThan(0);

      const nodeNames = result.mappings.map((m) => m.nodeName);
      expect(nodeNames).toContain('CUSTOMER');
      expect(nodeNames).toContain('ORDER');
      expect(nodeNames).toContain('ORDER_ITEM');
      expect(nodeNames).toContain('PRODUCT');
    });

    it('should return error for unsupported diagram types', () => {
      const code = `gantt
    title A Gantt Diagram
    dateFormat  YYYY-MM-DD
    section Section
    A task           :a1, 2014-01-01, 30d
    Another task     :after a1  , 20d
  `;

      const result: ParseResult = parseNodes(code);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.diagramType).toBe('gantt');
    });

    it('should return error for unrecognized diagram types', () => {
      const code = `This is not a valid mermaid diagram
    Just some random text
  `;

      const result: ParseResult = parseNodes(code);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should map line numbers correctly for flowchart', () => {
      const code = `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Process]
    B -->|No| D[End]
    C --> D
  `;

      const result: ParseResult = parseNodes(code);

      expect(result.success).toBe(true);

      const nodeA = result.mappings.find((m) => m.nodeName === 'A');
      const nodeB = result.mappings.find((m) => m.nodeName === 'B');
      const nodeC = result.mappings.find((m) => m.nodeName === 'C');
      const nodeD = result.mappings.find((m) => m.nodeName === 'D');

      expect(nodeA?.lineNumber).toBe(2);
      expect(nodeB?.lineNumber).toBe(2);
      expect(nodeC?.lineNumber).toBe(3);
      expect(nodeD?.lineNumber).toBe(4);
    });

    it('should generate correct SVG selectors', () => {
      const code = `flowchart TD
    A[Test] --> B[Another]
  `;

      const result: ParseResult = parseNodes(code);

      expect(result.success).toBe(true);

      const nodeA = result.mappings.find((m) => m.nodeName === 'A');
      const nodeB = result.mappings.find((m) => m.nodeName === 'B');

      expect(nodeA?.svgSelector).toBe('[id*="A"]');
      expect(nodeB?.svgSelector).toBe('[id*="B"]');
    });
  });

  describe('findNodeByPosition', () => {
    it('should find node by position in flowchart', () => {
      const code = `flowchart TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}
  `;

      const result: ParseResult = parseNodes(code);
      expect(result.success).toBe(true);

      // Find node A on line 2, column 5 (where 'A' is)
      const nodeA = findNodeByPosition(result.mappings, 2, 5, code);
      expect(nodeA).toBeDefined();
      expect(nodeA?.nodeName).toBe('A');

      // Find node B on line 2, column 40 (where 'B' is)
      const nodeB = findNodeByPosition(result.mappings, 2, 40, code);
      expect(nodeB).toBeDefined();
      expect(nodeB?.nodeName).toBe('B');

      // Find node C on line 3, column 10 (where 'C' is)
      const nodeC = findNodeByPosition(result.mappings, 3, 10, code);
      expect(nodeC).toBeDefined();
      expect(nodeC?.nodeName).toBe('C');
    });

    it('should return null for positions not on any node', () => {
      const code = `flowchart TD
    A[Test] --> B[Another]
  `;

      const result: ParseResult = parseNodes(code);
      expect(result.success).toBe(true);

      // Position on whitespace
      const nullNode = findNodeByPosition(result.mappings, 1, 1, code);
      expect(nullNode).toBeNull();
    });
  });

  describe('findNodeBySvgId', () => {
    it('should find node by SVG id containing node name', () => {
      const code = `flowchart TD
    A[Test] --> B[Another]
  `;

      const result: ParseResult = parseNodes(code);
      expect(result.success).toBe(true);

      // Simulate mermaid's SVG id format (usually includes the node name)
      const nodeA = findNodeBySvgId(result.mappings, 'graph-A');
      expect(nodeA).toBeDefined();
      expect(nodeA?.nodeName).toBe('A');

      const nodeB = findNodeBySvgId(result.mappings, 'flowchart-B-123');
      expect(nodeB).toBeDefined();
      expect(nodeB?.nodeName).toBe('B');
    });

    it('should return null for SVG ids not matching any node', () => {
      const code = `flowchart TD
    A[Test] --> B[Another]
  `;

      const result: ParseResult = parseNodes(code);
      expect(result.success).toBe(true);

      const nullNode = findNodeBySvgId(result.mappings, 'some-other-id');
      expect(nullNode).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty code', () => {
      const result: ParseResult = parseNodes('');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle code with only comments', () => {
      const code = `%% This is a comment
    %% Another comment
  `;

      const result: ParseResult = parseNodes(code);
      expect(result.success).toBe(false);
    });

    it('should handle nodes with hyphens in names', () => {
      const code = `flowchart TD
    node-1[Start] --> node-2[End]
  `;

      const result: ParseResult = parseNodes(code);
      expect(result.success).toBe(true);

      const nodeNames = result.mappings.map((m) => m.nodeName);
      expect(nodeNames).toContain('node-1');
      expect(nodeNames).toContain('node-2');
    });

    it('should handle nodes with underscores in names', () => {
      const code = `flowchart TD
    node_1[Start] --> node_2[End]
  `;

      const result: ParseResult = parseNodes(code);
      expect(result.success).toBe(true);

      const nodeNames = result.mappings.map((m) => m.nodeName);
      expect(nodeNames).toContain('node_1');
      expect(nodeNames).toContain('node_2');
    });
  });
});
