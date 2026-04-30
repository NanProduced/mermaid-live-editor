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

        expect(userNode?.svgSelector).toBe('g.actor.User, g.participant.User');
        expect(browserNode?.svgSelector).toBe('g.actor.Browser, g.participant.Browser');
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

        expect(animalNode?.svgSelector).toBe('g.node.Animal');
        expect(dogNode?.svgSelector).toBe('g.node.Dog');
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
        expect(nodeNames).not.toContain('String');
        expect(nodeNames).not.toContain('int');
        expect(nodeNames).not.toContain('string');
        expect(nodeNames).not.toContain('float');
        expect(nodeNames).not.toContain('boolean');
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

        expect(nodeA?.svgSelector).toBe('g.node.A');
        expect(nodeB?.svgSelector).toBe('g.node.B');
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

        expect(customerNode?.svgSelector).toBe('g.entity.CUSTOMER');
        expect(orderNode?.svgSelector).toBe('g.entity.ORDER');
        expect(orderItemNode?.svgSelector).toBe('g.entity.ORDER_ITEM');
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
    it('should find flowchart nodes with node class and nodeName class', () => {
      const mappings: NodeMapping[] = [
        { lineNumber: 2, nodeName: 'A', svgSelector: 'g.node.A', diagramType: 'flowchart' },
        { lineNumber: 2, nodeName: 'B', svgSelector: 'g.node.B', diagramType: 'flowchart' }
      ];

      const mockElementA = {
        classList: {
          contains: (cls: string) => cls === 'node' || cls === 'A'
        }
      } as unknown as HTMLElement;

      const mockElementB = {
        classList: {
          contains: (cls: string) => cls === 'node' || cls === 'B'
        }
      } as unknown as HTMLElement;

      const nodeA = findNodeBySvgId(mappings, 'any-id', mockElementA);
      expect(nodeA).toBeDefined();
      expect(nodeA?.nodeName).toBe('A');

      const nodeB = findNodeBySvgId(mappings, 'any-id', mockElementB);
      expect(nodeB).toBeDefined();
      expect(nodeB?.nodeName).toBe('B');
    });

    it('should find sequence diagram actors and participants by class', () => {
      const mappings: NodeMapping[] = [
        { lineNumber: 2, nodeName: 'User', svgSelector: 'g.actor.User, g.participant.User', diagramType: 'sequenceDiagram' },
        { lineNumber: 3, nodeName: 'Server', svgSelector: 'g.actor.Server, g.participant.Server', diagramType: 'sequenceDiagram' }
      ];

      const mockActorElement = {
        classList: {
          contains: (cls: string) => cls === 'actor' || cls === 'User'
        }
      } as unknown as HTMLElement;

      const mockParticipantElement = {
        classList: {
          contains: (cls: string) => cls === 'participant' || cls === 'Server'
        }
      } as unknown as HTMLElement;

      const userNode = findNodeBySvgId(mappings, 'any-id', mockActorElement);
      expect(userNode).toBeDefined();
      expect(userNode?.nodeName).toBe('User');

      const serverNode = findNodeBySvgId(mappings, 'any-id', mockParticipantElement);
      expect(serverNode).toBeDefined();
      expect(serverNode?.nodeName).toBe('Server');
    });

    it('should find class diagram nodes by node class and nodeName class', () => {
      const mappings: NodeMapping[] = [
        { lineNumber: 2, nodeName: 'Animal', svgSelector: 'g.node.Animal', diagramType: 'classDiagram' },
        { lineNumber: 3, nodeName: 'Dog', svgSelector: 'g.node.Dog', diagramType: 'classDiagram' }
      ];

      const mockAnimalElement = {
        classList: {
          contains: (cls: string) => cls === 'node' || cls === 'Animal'
        }
      } as unknown as HTMLElement;

      const mockDogElement = {
        classList: {
          contains: (cls: string) => cls === 'node' || cls === 'Dog'
        }
      } as unknown as HTMLElement;

      const animalNode = findNodeBySvgId(mappings, 'any-id', mockAnimalElement);
      expect(animalNode).toBeDefined();
      expect(animalNode?.nodeName).toBe('Animal');

      const dogNode = findNodeBySvgId(mappings, 'any-id', mockDogElement);
      expect(dogNode).toBeDefined();
      expect(dogNode?.nodeName).toBe('Dog');
    });

    it('should find ER diagram entities with precise class matching', () => {
      const mappings: NodeMapping[] = [
        { lineNumber: 2, nodeName: 'CUSTOMER', svgSelector: 'g.entity.CUSTOMER', diagramType: 'erDiagram' },
        { lineNumber: 2, nodeName: 'ORDER', svgSelector: 'g.entity.ORDER', diagramType: 'erDiagram' }
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

      const customerNode = findNodeBySvgId(mappings, 'any-id', mockCustomerElement);
      expect(customerNode).toBeDefined();
      expect(customerNode?.nodeName).toBe('CUSTOMER');

      const orderNode = findNodeBySvgId(mappings, 'any-id', mockOrderElement);
      expect(orderNode).toBeDefined();
      expect(orderNode?.nodeName).toBe('ORDER');
    });

    it('should not match unrelated elements in ER diagram', () => {
      const mappings: NodeMapping[] = [
        { lineNumber: 2, nodeName: 'CUSTOMER', svgSelector: 'g.entity.CUSTOMER', diagramType: 'erDiagram' }
      ];

      const mockAttributeElement = {
        classList: {
          contains: (cls: string) => cls === 'attribute' || cls === 'CUSTOMER'
        }
      } as unknown as HTMLElement;

      const attributeNode = findNodeBySvgId(mappings, 'any-id', mockAttributeElement);
      expect(attributeNode).toBeNull();
    });

    it('should find state diagram nodes by state class and nodeName class', () => {
      const mappings: NodeMapping[] = [
        { lineNumber: 2, nodeName: 'Idle', svgSelector: 'g.state.Idle', diagramType: 'stateDiagram' },
        { lineNumber: 3, nodeName: 'Running', svgSelector: 'g.state.Running', diagramType: 'stateDiagram' }
      ];

      const mockIdleElement = {
        classList: {
          contains: (cls: string) => cls === 'state' || cls === 'Idle'
        }
      } as unknown as HTMLElement;

      const mockRunningElement = {
        classList: {
          contains: (cls: string) => cls === 'state' || cls === 'Running'
        }
      } as unknown as HTMLElement;

      const idleNode = findNodeBySvgId(mappings, 'any-id', mockIdleElement);
      expect(idleNode).toBeDefined();
      expect(idleNode?.nodeName).toBe('Idle');

      const runningNode = findNodeBySvgId(mappings, 'any-id', mockRunningElement);
      expect(runningNode).toBeDefined();
      expect(runningNode?.nodeName).toBe('Running');
    });

    it('should use longest matching nodeName when multiple classes match', () => {
      const mappings: NodeMapping[] = [
        { lineNumber: 2, nodeName: 'API', svgSelector: 'g.node.API', diagramType: 'flowchart' },
        { lineNumber: 2, nodeName: 'API_Gateway', svgSelector: 'g.node.API_Gateway', diagramType: 'flowchart' }
      ];

      const mockGatewayElement = {
        classList: {
          contains: (cls: string) => cls === 'node' || cls === 'API_Gateway' || cls === 'API'
        }
      } as unknown as HTMLElement;

      const gatewayNode = findNodeBySvgId(mappings, 'any-id', mockGatewayElement);
      expect(gatewayNode).toBeDefined();
      expect(gatewayNode?.nodeName).toBe('API_Gateway');
    });

    it('should return null when element is null', () => {
      const mappings: NodeMapping[] = [
        { lineNumber: 2, nodeName: 'A', svgSelector: 'g.node.A', diagramType: 'flowchart' }
      ];

      const result = findNodeBySvgId(mappings, 'any-id', null);
      expect(result).toBeNull();
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

      const nullNode1 = findNodeByPosition(result.mappings, 999, 1, code);
      expect(nullNode1).toBeNull();

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

      const clientNode = findNodeByPosition(result.mappings, 2, 17, code);
      expect(clientNode).toBeDefined();
      expect(clientNode?.nodeName).toBe('Client');

      const mockParticipantElement = {
        classList: {
          contains: (cls: string) => cls === 'participant' || cls === 'API'
        }
      } as unknown as HTMLElement;

      const apiNode = findNodeBySvgId(result.mappings, 'any-id', mockParticipantElement);
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

      const customerNode = result.mappings.find((m) => m.nodeName === 'CUSTOMER');
      expect(customerNode?.svgSelector).toBe('g.entity.CUSTOMER');
    });
  });
});
