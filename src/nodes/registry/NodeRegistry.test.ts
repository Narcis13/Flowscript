/**
 * Tests for NodeRegistry
 */

import { NodeRegistry, getNodeRegistry, RegisterNode } from './NodeRegistry';
import { Node, SimpleEdgeMap, NodeMetadata } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';

// Mock node implementation
class TestNode implements Node {
  metadata: NodeMetadata = {
    name: 'testNode',
    description: 'A test node',
    type: 'action',
    ai_hints: {
      purpose: 'Testing',
      when_to_use: 'In tests',
      expected_edges: ['success', 'error']
    }
  };

  async execute(_context: ExecutionContext): Promise<SimpleEdgeMap> {
    return {
      success: () => ({ result: 'test' })
    };
  }
}

// Another mock node
class AnotherTestNode implements Node {
  metadata: NodeMetadata = {
    name: 'anotherNode',
    description: 'Another test node',
    type: 'control',
    ai_hints: {
      purpose: 'Control flow testing',
      when_to_use: 'In control flow tests',
      expected_edges: ['next', 'skip']
    }
  };

  async execute(_context: ExecutionContext): Promise<SimpleEdgeMap> {
    return {
      next: () => ({ continue: true })
    };
  }
}

describe('NodeRegistry', () => {
  let registry: NodeRegistry;

  beforeEach(() => {
    // Get a fresh instance and clear it
    registry = NodeRegistry.getInstance();
    registry.clear();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = NodeRegistry.getInstance();
      const instance2 = NodeRegistry.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should work with helper function', () => {
      const instance = getNodeRegistry();
      expect(instance).toBe(NodeRegistry.getInstance());
    });
  });

  describe('register', () => {
    it('should register a node class', () => {
      registry.register(TestNode);
      expect(registry.has('testNode')).toBe(true);
    });

    it('should throw if node has no metadata', () => {
      class BadNode implements Node {
        metadata: any = null;
        async execute(): Promise<SimpleEdgeMap> {
          return {};
        }
      }

      expect(() => registry.register(BadNode)).toThrow('Node must have metadata');
    });

    it('should throw if registering duplicate name', () => {
      registry.register(TestNode);
      expect(() => registry.register(TestNode)).toThrow('already registered');
    });

    it('should index nodes by type', () => {
      registry.register(TestNode);
      registry.register(AnotherTestNode);

      expect(registry.getNodesByType('action')).toContain('testNode');
      expect(registry.getNodesByType('control')).toContain('anotherNode');
    });
  });

  describe('registerWithFactory', () => {
    it('should register with custom factory', () => {
      const metadata: NodeMetadata = {
        name: 'factoryNode',
        description: 'Factory created node',
        type: 'action',
        ai_hints: {
          purpose: 'Testing factories',
          when_to_use: 'Always',
          expected_edges: ['done']
        }
      };

      const factory = () => new TestNode();

      registry.registerWithFactory(metadata, factory);
      expect(registry.has('factoryNode')).toBe(true);
    });
  });

  describe('registerInstance', () => {
    it('should register a node instance', () => {
      const node = new TestNode();
      registry.registerInstance(node);
      expect(registry.has('testNode')).toBe(true);
    });
  });

  describe('create', () => {
    it('should create node instances', () => {
      registry.register(TestNode);
      const node = registry.create('testNode');
      
      expect(node).toBeInstanceOf(TestNode);
      expect(node.metadata.name).toBe('testNode');
    });

    it('should throw if node not found', () => {
      expect(() => registry.create('nonExistent')).toThrow('not found');
    });

    it('should create new instances each time', () => {
      registry.register(TestNode);
      const node1 = registry.create('testNode');
      const node2 = registry.create('testNode');
      
      expect(node1).not.toBe(node2);
    });
  });

  describe('metadata operations', () => {
    beforeEach(() => {
      registry.register(TestNode);
      registry.register(AnotherTestNode);
    });

    it('should get metadata by name', () => {
      const metadata = registry.getMetadata('testNode');
      expect(metadata?.name).toBe('testNode');
      expect(metadata?.type).toBe('action');
    });

    it('should get all node names', () => {
      const names = registry.getAllNodeNames();
      expect(names).toContain('testNode');
      expect(names).toContain('anotherNode');
      expect(names).toHaveLength(2);
    });

    it('should get all metadata', () => {
      const allMetadata = registry.getAllMetadata();
      expect(allMetadata).toHaveLength(2);
      expect(allMetadata.map(m => m.name)).toContain('testNode');
    });
  });

  describe('search', () => {
    beforeEach(() => {
      registry.register(TestNode);
      registry.register(AnotherTestNode);
    });

    it('should search by type', () => {
      const results = registry.search({ type: 'action' });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('testNode');
    });

    it('should search by expected edges', () => {
      const results = registry.search({ expectedEdges: ['success'] });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('testNode');
    });

    it('should search by name pattern', () => {
      const results = registry.search({ namePattern: /another/i });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('anotherNode');
    });

    it('should combine search criteria', () => {
      const results = registry.search({
        type: 'control',
        expectedEdges: ['next']
      });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('anotherNode');
    });
  });

  describe('unregister', () => {
    it('should remove nodes', () => {
      registry.register(TestNode);
      expect(registry.has('testNode')).toBe(true);

      const removed = registry.unregister('testNode');
      expect(removed).toBe(true);
      expect(registry.has('testNode')).toBe(false);
    });

    it('should remove from type index', () => {
      registry.register(TestNode);
      registry.unregister('testNode');
      
      expect(registry.getNodesByType('action')).not.toContain('testNode');
    });

    it('should return false if node not found', () => {
      const removed = registry.unregister('nonExistent');
      expect(removed).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('should export registry as JSON', () => {
      registry.register(TestNode);
      registry.register(AnotherTestNode);

      const json = registry.toJSON();
      expect(json).toHaveProperty('testNode');
      expect(json).toHaveProperty('anotherNode');
      expect(json.testNode.type).toBe('action');
    });
  });
});

describe('RegisterNode decorator', () => {
  it('should auto-register decorated nodes', () => {
    const registry = getNodeRegistry();
    registry.clear();

    @RegisterNode
    class DecoratedNode implements Node {
      metadata: NodeMetadata = {
        name: 'decoratedNode',
        description: 'Auto-registered node',
        type: 'action',
        ai_hints: {
          purpose: 'Testing decorators',
          when_to_use: 'Always',
          expected_edges: ['done']
        }
      };

      async execute(): Promise<SimpleEdgeMap> {
        return { done: () => ({}) };
      }
    }

    // Use the class to avoid unused warning
    const instance = new DecoratedNode();
    expect(instance).toBeDefined();
    expect(registry.has('decoratedNode')).toBe(true);
  });
});