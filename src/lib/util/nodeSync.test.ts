import { describe, expect, it, beforeEach } from 'vitest';
import { parseNodes, findNodeByPosition, findNodeBySvgId, type NodeMapping, type ParseResult } from './nodeSync';

describe('nodeSync', () => {
  describe('parseNodes', () => {
    describe('Sequence Diagram', () => {
      it('should extract both sender and receiver from messages', () => {
        const code = `sequenceDiagram
    participant User
    participant Browser
    participant Server
    
    User->>Browser: Login Request
    Browser->>Server: Authentication Request
    Server-->>Browser: Response
`;

        const result: ParseResult = parseNodes(code);

        expect(result.success).toBe(true);
        expect(result.diagramType).toBe('sequenceDiagram');

        const nodeNames = result.mappings.map((m) => m.nodeName);
        expect(nodeNames).toContain('User');
        expect(nodeNames).toContain('Browser');
        expect(nodeNames).toContain('Server');
      });

      it('should generate correct SVG selectors for sequence diagram', () => {
        const code = `sequenceDiagram
    actor User
    participant Browser
    
    User->>Browser: Message
`;

        const result: ParseResult = parseNodes(code);

        expect(result.success).toBe(true);

        const userNode = result.mappings.find((m) => m.nodeName === 'User');
        const browserNode = result.mappings.find((m) => m.nodeName === 'Browser');

        expect(userNode?.svgSelector).toBe('.actor[id*="User"], .participant[id*="User"]');
        expect(browserNode?.svgSelector).toBe('.actor[id*="Browser"], .participant[id*="Browser"]');
      });
    });

    describe('Class Diagram', () => {
      it('should extract both sides of class relations', () => {
        const code = `classDiagram
    class Animal
    class Dog
    class Cat
    
    Animal <|-- Dog
    Animal <|-- Cat
`;

        const result: ParseResult = parseNodes(code);

        expect(result.success).toBe(true);
        expect(result.diagramType).toBe('classDiagram');

        const nodeNames = result.mappings.map((m) => m.nodeName);
        expect(nodeNames).toContain('Animal');
        expect(nodeNames).toContain('Dog');
        expect(nodeNames).toContain('Cat');
      });

      it('should generate correct SVG selectors for class diagram', () => {
        const code = `classDiagram
    class Animal
    class Dog
    
    Animal <|-- Dog
`;

        const result: ParseResult = parseNodes(code);

        expect(result.success).toBe(true);

        const animalNode = result.mappings.find((m) => m.nodeName === 'Animal');
        const dogNode = result.mappings.find((m) => m.nodeName === 'Dog');

        expect(animalNode?.svgSelector).toBe('.node[class*="Animal"]');
        expect(dogNode?.svgSelector).toBe('.node[class*="Dog"]');
      });

      it('should not conflict with member definitions', () => {
        const code = `classDiagram
    class Animal {
        +String name
        +int age
    }
    class Dog {
        +breed: String
    }
    
    Animal <|-- Dog
`;

        const result: ParseResult = parseNodes(code);

        expect(result.success).toBe(true);

        const nodeNames = result.mappings.map((m) => m.nodeName);
        expect(nodeNames).toContain('Animal');
        expect(nodeNames).toContain('Dog');
        // Should not include type names like String, int
        expect(nodeNames).not.toContain('String');
        expect(nodeNames).not.toContain('int');
      });
    });

    describe('Flowchart', () => {
      it('should generate correct SVG selectors for flowchart', () => {
        const code = `flowchart TD
    A[Start] --> B[End]
`;

        const result: ParseResult = parseNodes(code);

        expect(result.success).toBe(true);

        const nodeA = result.mappings.find((m) => m.nodeName === 'A');
        const nodeB = result.mappings.find((m) => m.nodeName === 'B');

        expect(nodeA?.svgSelector).toBe('.node[id*="A"]');
        expect(nodeB?.svgSelector).toBe('.node[id*="B"]');
      });

      it('should extract nodes on both sides of arrows', () => {
        const code = `flowchart TD
    A --> B
    B --> C
    C --> D
`;

        const result: ParseResult = parseNodes(code);

        expect(result.success).toBe(true);

        const nodeNames = result.mappings.map((m) => m.nodeName);
        expect(nodeNames).toContain('A');
        expect(nodeNames).toContain('B');
        expect(nodeNames).toContain('C');
        expect(nodeNames).toContain('D');
      });
    });

    describe('ER Diagram', () => {
      it('should generate precise SVG selectors for ER diagram', () => {
        const code = `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ ORDER_ITEM : contains
`;

        const result: ParseResult = parseNodes(code);

        expect(result.success).toBe(true);

        const customerNode = result.mappings.find((m) => m.nodeName === 'CUSTOMER');
        const orderNode = result.mappings.find((m) => m.nodeName === 'ORDER');
        const orderItemNode = result.mappings.find((m) => m.nodeName === 'ORDER_ITEM');

        // ER diagram should use precise class-based selectors
        expect(customerNode?.svgSelector).toBe('.entity.CUSTOMER');
        expect(orderNode?.svgSelector).toBe('.entity.ORDER');
        expect(orderItemNode?.svgSelector).toBe('.entity.ORDER_ITEM');
      });

      it('should extract entities from relation lines', () => {
        const code = `erDiagram
    CUSTOMER ||--o{ ORDER : places
`;

        const result: ParseResult = parseNodes(code);

        expect(result.success).toBe(true);

        const nodeNames = result.mappings.map((m) => m.nodeName);
        expect(nodeNames).toContain('CUSTOMER');
        expect(nodeNames).toContain('ORDER');
      });
    });
  });

  describe('findNodeBySvgId', () => {
    it('should find flowchart nodes with node class', () => {
      const mappings: NodeMapping[] = [
        { lineNumber: 2, nodeName: 'A', svgSelector: '.node[id*="A"]', diagramType: 'flowchart' },
        { lineNumber: 2, nodeName: 'B', svgSelector: '.node[id*="B"]', diagramType: 'flowchart' }
      ];

      // Simulate a real mermaid SVG element with node class
      const mockElement = {
        classList: {
          contains: (cls: string) => cls === 'node'
        }
      } as unknown as HTMLElement;

      const nodeA = findNodeBySvgId(mappings, 'flowchart-A-1', mockElement);
      expect(nodeA).toBeDefined();
      expect(nodeA?.nodeName).toBe('A');

      const nodeB = findNodeBySvgId(mappings, 'graph-B-2', mockElement);
      expect(nodeB).toBeDefined();
      expect(nodeB?.nodeName).toBe('B');
    });

    it('should find sequence diagram actors and participants', () => {
      const mappings: NodeMapping[] = [
        { lineNumber: 2, nodeName: 'User', svgSelector: '.actor[id*="User"], .participant[id*="User"]', diagramType: 'sequenceDiagram' },
        { lineNumber: 3, nodeName: 'Server', svgSelector: '.actor[id*="Server"], .participant[id*="Server"]', diagramType: 'sequenceDiagram' }
      ];

      const mockActorElement = {
        classList: {
          contains: (cls: string) => cls === 'actor'
        }
      } as unknown as HTMLElement;

      const mockParticipantElement = {
        classList: {
          contains: (cls: string) => cls === 'participant'
        }
      } as unknown as HTMLElement;

      const userNode = findNodeBySvgId(mappings, 'actor-User', mockActorElement);
      expect(userNode).toBeDefined();
      expect(userNode?.nodeName).toBe('User');

      const serverNode = findNodeBySvgId(mappings, 'participant-Server', mockParticipantElement);
      expect(serverNode).toBeDefined();
      expect(serverNode?.nodeName).toBe('Server');
    });

    it('should find ER diagram entities with precise class matching', () => {
      const mappings: NodeMapping[] = [
        { lineNumber: 2, nodeName: 'CUSTOMER', svgSelector: '.entity.CUSTOMER', diagramType: 'erDiagram' },
        { lineNumber: 2, nodeName: 'ORDER', svgSelector: '.entity.ORDER', diagramType: 'erDiagram' }
      ];

      const mockCustomerElement = {
        classList: {
          contains: (cls: string) => cls === 'entity' || cls === 'CUSTOMER'
        }
      } as unknown as HTMLElement;

      const mockOrderElement = {
        classList: {
          contains: (cls: string) => cls === 'entity' || cls === 'ORDER'
        }
      } as unknown as HTMLElement;

      const customerNode = findNodeBySvgId(mappings, 'er-CUSTOMER', mockCustomerElement);
      expect(customerNode).toBeDefined();
      expect(customerNode?.nodeName).toBe('CUSTOMER');

      const orderNode = findNodeBySvgId(mappings, 'er-ORDER', mockOrderElement);
      expect(orderNode).toBeDefined();
      expect(orderNode?.nodeName).toBe('ORDER');
    });

    it('should not match unrelated elements in ER diagram', () => {
      const mappings: NodeMapping[] = [
        { lineNumber: 2, nodeName: 'CUSTOMER', svgSelector: '.entity.CUSTOMER', diagramType: 'erDiagram' }
      ];

      // An attribute element (not an entity)
      const mockAttributeElement = {
        classList: {
          contains: (cls: string) => cls === 'attribute' || cls === 'CUSTOMER_name'
        }
      } as unknown as HTMLElement;

      // Should not match because it's not an entity
      const attributeNode = findNodeBySvgId(mappings, 'CUSTOMER_name-attr', mockAttributeElement);
      expect(attributeNode).toBeNull();
    });
  });

  describe('findNodeByPosition', () => {
    it('should find node by position in line', () => {
      const code = `sequenceDiagram
    participant Client
    participant API
    participant DB
`;

      const result: ParseResult = parseNodes(code);
      expect(result.success).toBe(true);

      // Line 2: "    participant Client"
      // Index 0-3: 4 spaces
      // Index 4-14: "participant" (11 chars)
      // Index 15: space
      // Index 16-21: "Client"
      // Column 17 (1-based) is 'C'
      const clientNode = findNodeByPosition(result.mappings, 2, 17, code);
      expect(clientNode).toBeDefined();
      expect(clientNode?.nodeName).toBe('Client');
    });

    it('should return null for invalid positions', () => {
      const code = `flowchart TD
    A[Start]
`;

      const result: ParseResult = parseNodes(code);
      expect(result.success).toBe(true);

      // Invalid line number
      const nullNode1 = findNodeByPosition(result.mappings, 999, 1, code);
      expect(nullNode1).toBeNull();

      // Invalid column (on whitespace)
      const nullNode2 = findNodeByPosition(result.mappings, 1, 1, code);
      expect(nullNode2).toBeNull();
    });
  });

  describe('integration tests', () => {
    it('should handle complete sequence diagram workflow', () => {
      const code = `sequenceDiagram
    participant Client
    participant API
    participant DB
    
    Client->>API: Request
    API->>DB: Query
    DB-->>API: Result
    API-->>Client: Response
`;

      const result: ParseResult = parseNodes(code);
      expect(result.success).toBe(true);

      const nodeNames = result.mappings.map((m) => m.nodeName);
      expect(nodeNames).toContain('Client');
      expect(nodeNames).toContain('API');
      expect(nodeNames).toContain('DB');

      // Test position lookup
      const clientNode = findNodeByPosition(result.mappings, 2, 17, code);
      expect(clientNode).toBeDefined();
      expect(clientNode?.nodeName).toBe('Client');

      // Test SVG ID lookup (simulating real mermaid format)
      const mockParticipantElement = {
        classList: {
          contains: (cls: string) => cls === 'participant'
        }
      } as unknown as HTMLElement;

      const apiNode = findNodeBySvgId(result.mappings, 'participant-API', mockParticipantElement);
      expect(apiNode).toBeDefined();
      expect(apiNode?.nodeName).toBe('API');
    });

    it('should handle complete class diagram workflow', () => {
      const code = `classDiagram
    class Vehicle {
        +String brand
        +start()
    }
    class Car {
        +int doors
        +drive()
    }
    class Motorcycle {
        +boolean hasSideCar
        +ride()
    }
    
    Vehicle <|-- Car
    Vehicle <|-- Motorcycle
`;

      const result: ParseResult = parseNodes(code);
      expect(result.success).toBe(true);

      const nodeNames = result.mappings.map((m) => m.nodeName);
      expect(nodeNames).toContain('Vehicle');
      expect(nodeNames).toContain('Car');
      expect(nodeNames).toContain('Motorcycle');
      // Should not include type names
      expect(nodeNames).not.toContain('String');
      expect(nodeNames).not.toContain('int');
      expect(nodeNames).not.toContain('boolean');
    });

    it('should handle complete ER diagram workflow', () => {
      const code = `erDiagram
    CUSTOMER {
        string name
        string email
    }
    ORDER {
        date orderDate
        float total
    }
    CUSTOMER ||--o{ ORDER : places
`;

      const result: ParseResult = parseNodes(code);
      expect(result.success).toBe(true);

      const nodeNames = result.mappings.map((m) => m.nodeName);
      expect(nodeNames).toContain('CUSTOMER');
      expect(nodeNames).toContain('ORDER');

      // Verify selectors are precise
      const customerNode = result.mappings.find((m) => m.nodeName === 'CUSTOMER');
      expect(customerNode?.svgSelector).toBe('.entity.CUSTOMER');
    });
  });
});
