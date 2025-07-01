/**
 * Node Loader for bulk registration and dynamic loading
 */

import { Node } from '../../core/types/node';
import { NodeRegistry, NodeConstructor, getNodeRegistry } from './NodeRegistry';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Options for loading nodes
 */
export interface LoadOptions {
  /** Directory to load nodes from */
  directory?: string;
  /** File pattern to match (default: *.node.ts, *.node.js) */
  pattern?: RegExp;
  /** Whether to load recursively */
  recursive?: boolean;
}

/**
 * Node module structure
 */
export interface NodeModule {
  default?: NodeConstructor | Node;
  [key: string]: any;
}

/**
 * Node Loader class for bulk registration
 */
export class NodeLoader {
  private registry: NodeRegistry;

  constructor(registry?: NodeRegistry) {
    this.registry = registry || getNodeRegistry();
  }

  /**
   * Load nodes from an array
   */
  loadNodes(nodes: (NodeConstructor | Node)[]): void {
    for (const node of nodes) {
      if (typeof node === 'function') {
        // It's a constructor
        this.registry.register(node as NodeConstructor);
      } else {
        // It's an instance
        this.registry.registerInstance(node as Node);
      }
    }
  }

  /**
   * Load nodes from a directory (Node.js only)
   */
  async loadFromDirectory(options: LoadOptions = {}): Promise<void> {
    const {
      directory = './nodes',
      pattern = /\.(node)\.(ts|js)$/,
      recursive = true
    } = options;

    const resolvedDir = path.resolve(directory);
    
    if (!fs.existsSync(resolvedDir)) {
      throw new Error(`Directory not found: ${resolvedDir}`);
    }

    await this.loadFilesFromDir(resolvedDir, pattern, recursive);
  }

  /**
   * Recursively load files from directory
   */
  private async loadFilesFromDir(
    dir: string,
    pattern: RegExp,
    recursive: boolean
  ): Promise<void> {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && recursive) {
        await this.loadFilesFromDir(fullPath, pattern, recursive);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        await this.loadNodeFile(fullPath);
      }
    }
  }

  /**
   * Load a single node file
   */
  private async loadNodeFile(filePath: string): Promise<void> {
    try {
      // Dynamic import
      const module = await import(filePath) as NodeModule;

      // Check for default export
      if (module.default) {
        const exported = module.default;
        if (typeof exported === 'function') {
          this.registry.register(exported as NodeConstructor);
        } else if (exported && typeof exported === 'object' && 'metadata' in exported) {
          this.registry.registerInstance(exported as Node);
        }
      }

      // Check for named exports
      for (const [key, value] of Object.entries(module)) {
        if (key !== 'default' && value) {
          if (typeof value === 'function' && value.prototype && value.prototype.metadata) {
            this.registry.register(value as NodeConstructor);
          } else if (typeof value === 'object' && 'metadata' in value && 'execute' in value) {
            this.registry.registerInstance(value as Node);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to load node from ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Load nodes from a module map (useful for bundlers)
   */
  loadFromModuleMap(moduleMap: Record<string, NodeConstructor | Node>): void {
    for (const [, nodeOrConstructor] of Object.entries(moduleMap)) {
      if (typeof nodeOrConstructor === 'function') {
        this.registry.register(nodeOrConstructor as NodeConstructor);
      } else {
        this.registry.registerInstance(nodeOrConstructor as Node);
      }
    }
  }

  /**
   * Create a module map for static imports (useful for bundlers)
   */
  static createModuleMap(modules: Record<string, any>): Record<string, NodeConstructor | Node> {
    const result: Record<string, NodeConstructor | Node> = {};

    for (const [path, module] of Object.entries(modules)) {
      if (module.default) {
        const name = path.split('/').pop()?.replace(/\.(node)\.(ts|js)$/, '') || path;
        result[name] = module.default;
      }

      // Also check for named exports
      for (const [key, value] of Object.entries(module)) {
        if (key !== 'default' && value && (typeof value === 'function' || typeof value === 'object')) {
          result[key] = value as NodeConstructor | Node;
        }
      }
    }

    return result;
  }
}

/**
 * Convenience function to create a node loader
 */
export function createNodeLoader(registry?: NodeRegistry): NodeLoader {
  return new NodeLoader(registry);
}