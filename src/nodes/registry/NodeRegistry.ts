/**
 * Node Registry for dynamic node loading and management
 */

import { Node, NodeMetadata } from '../../core/types/node';

/**
 * Node constructor type
 */
export type NodeConstructor = new () => Node;

/**
 * Node factory function type
 */
export type NodeFactory = () => Node;

/**
 * Registry entry for a node
 */
export interface RegistryEntry {
  metadata: NodeMetadata;
  factory: NodeFactory;
}

/**
 * Node Registry class for managing available nodes
 */
export class NodeRegistry {
  private static instance: NodeRegistry;
  private nodes: Map<string, RegistryEntry> = new Map();
  private nodesByType: Map<string, Set<string>> = new Map();

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    // Initialize type categories
    this.nodesByType.set('action', new Set());
    this.nodesByType.set('human', new Set());
    this.nodesByType.set('control', new Set());
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): NodeRegistry {
    if (!NodeRegistry.instance) {
      NodeRegistry.instance = new NodeRegistry();
    }
    return NodeRegistry.instance;
  }

  /**
   * Register a node class
   */
  register(nodeClass: NodeConstructor): void {
    // Create a temporary instance to get metadata
    const tempInstance = new nodeClass();
    const metadata = tempInstance.metadata;
    
    if (!metadata || !metadata.name) {
      throw new Error('Node must have metadata with a name');
    }

    if (this.nodes.has(metadata.name)) {
      throw new Error(`Node with name '${metadata.name}' is already registered`);
    }

    // Create factory function
    const factory = () => new nodeClass();

    // Store in registry
    this.nodes.set(metadata.name, { metadata, factory });

    // Add to type index
    if (metadata.type) {
      const typeSet = this.nodesByType.get(metadata.type);
      if (typeSet) {
        typeSet.add(metadata.name);
      }
    }
  }

  /**
   * Register a node with a factory function
   */
  registerWithFactory(metadata: NodeMetadata, factory: NodeFactory): void {
    if (!metadata || !metadata.name) {
      throw new Error('Node must have metadata with a name');
    }

    if (this.nodes.has(metadata.name)) {
      throw new Error(`Node with name '${metadata.name}' is already registered`);
    }

    // Store in registry
    this.nodes.set(metadata.name, { metadata, factory });

    // Add to type index
    if (metadata.type) {
      const typeSet = this.nodesByType.get(metadata.type);
      if (typeSet) {
        typeSet.add(metadata.name);
      }
    }
  }

  /**
   * Register a node instance (creates a factory that returns clones)
   */
  registerInstance(node: Node): void {
    const metadata = node.metadata;
    
    if (!metadata || !metadata.name) {
      throw new Error('Node must have metadata with a name');
    }

    // Create a factory that returns the same node instance
    // Note: In production, you might want to clone the node
    const factory = () => node;

    this.registerWithFactory(metadata, factory);
  }

  /**
   * Create a node instance by name
   */
  create(name: string): Node {
    const entry = this.nodes.get(name);
    if (!entry) {
      throw new Error(`Node '${name}' not found in registry`);
    }

    return entry.factory();
  }

  /**
   * Check if a node is registered
   */
  has(name: string): boolean {
    return this.nodes.has(name);
  }

  /**
   * Get node metadata by name
   */
  getMetadata(name: string): NodeMetadata | undefined {
    const entry = this.nodes.get(name);
    return entry?.metadata;
  }

  /**
   * Get all registered node names
   */
  getAllNodeNames(): string[] {
    return Array.from(this.nodes.keys());
  }

  /**
   * Get all nodes of a specific type
   */
  getNodesByType(type: 'action' | 'human' | 'control'): string[] {
    const typeSet = this.nodesByType.get(type);
    return typeSet ? Array.from(typeSet) : [];
  }

  /**
   * Get all node metadata
   */
  getAllMetadata(): NodeMetadata[] {
    return Array.from(this.nodes.values()).map(entry => entry.metadata);
  }

  /**
   * Search nodes by criteria
   */
  search(criteria: {
    type?: 'action' | 'human' | 'control';
    expectedEdges?: string[];
    namePattern?: RegExp;
  }): NodeMetadata[] {
    let results = this.getAllMetadata();

    // Filter by type
    if (criteria.type) {
      results = results.filter(meta => meta.type === criteria.type);
    }

    // Filter by expected edges
    if (criteria.expectedEdges) {
      results = results.filter(meta => {
        const nodeEdges = meta.ai_hints.expected_edges;
        return criteria.expectedEdges!.every(edge => nodeEdges.includes(edge));
      });
    }

    // Filter by name pattern
    if (criteria.namePattern) {
      results = results.filter(meta => criteria.namePattern!.test(meta.name));
    }

    return results;
  }

  /**
   * Clear the registry (useful for testing)
   */
  clear(): void {
    this.nodes.clear();
    this.nodesByType.forEach(set => set.clear());
  }

  /**
   * Unregister a node
   */
  unregister(name: string): boolean {
    const entry = this.nodes.get(name);
    if (!entry) {
      return false;
    }

    // Remove from main registry
    this.nodes.delete(name);

    // Remove from type index
    if (entry.metadata.type) {
      const typeSet = this.nodesByType.get(entry.metadata.type);
      if (typeSet) {
        typeSet.delete(name);
      }
    }

    return true;
  }

  /**
   * Export registry as JSON (for debugging/persistence)
   */
  toJSON(): Record<string, NodeMetadata> {
    const result: Record<string, NodeMetadata> = {};
    this.nodes.forEach((entry, name) => {
      result[name] = entry.metadata;
    });
    return result;
  }

  /**
   * Get all nodes (returns a map of node names to node instances)
   */
  getAllNodes(): Record<string, Node> {
    const result: Record<string, Node> = {};
    this.nodes.forEach((entry, name) => {
      result[name] = entry.factory();
    });
    return result;
  }

  /**
   * Get a node instance by name (alias for create)
   */
  getNode(name: string): Node | undefined {
    try {
      return this.create(name);
    } catch {
      return undefined;
    }
  }
}

/**
 * Convenience function to get the global registry instance
 */
export function getNodeRegistry(): NodeRegistry {
  return NodeRegistry.getInstance();
}

/**
 * Decorator for auto-registering nodes
 */
export function RegisterNode(target: NodeConstructor): void {
  const registry = getNodeRegistry();
  registry.register(target);
}