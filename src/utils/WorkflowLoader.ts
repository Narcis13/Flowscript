/**
 * WorkflowLoader - Utility for loading and validating workflow JSON files
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { WorkflowDefinition } from '../core/types/workflow';
import { WorkflowDefinitionSchema, ValidatedWorkflowDefinition } from '../core/types/workflow-schema';

export interface LoadOptions {
  /** Base directory for workflows */
  baseDir?: string;
  /** Whether to validate workflows */
  validate?: boolean;
  /** Whether to watch for changes */
  watch?: boolean;
  /** File extension to look for */
  extension?: string;
}

export interface LoadResult {
  workflow: WorkflowDefinition;
  filePath: string;
  validation?: {
    valid: boolean;
    errors?: z.ZodError;
  };
}

export interface LoadError {
  filePath: string;
  error: Error;
  type: 'read' | 'parse' | 'validation';
}

export class WorkflowLoader {
  private baseDir: string;
  private extension: string;
  private cache: Map<string, LoadResult> = new Map();

  constructor(options: LoadOptions = {}) {
    this.baseDir = options.baseDir || path.join(process.cwd(), 'workflows');
    this.extension = options.extension || '.json';
  }

  /**
   * Load a single workflow from file
   */
  async loadWorkflow(filePath: string, options: LoadOptions = {}): Promise<LoadResult> {
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.baseDir, filePath);

    try {
      // Read file
      const content = await fs.readFile(fullPath, 'utf-8');
      
      // Parse JSON
      let data: any;
      try {
        data = JSON.parse(content);
      } catch (error) {
        throw {
          filePath: fullPath,
          error: error as Error,
          type: 'parse' as const
        };
      }

      // Validate if requested
      let validation;
      if (options.validate !== false) {
        const result = WorkflowDefinitionSchema.safeParse(data);
        validation = {
          valid: result.success,
          errors: result.success ? undefined : result.error
        };

        if (!result.success) {
          throw {
            filePath: fullPath,
            error: new Error(`Validation failed: ${result.error.message}`),
            type: 'validation' as const
          };
        }

        // Use validated data
        data = result.data;
      }

      const loadResult: LoadResult = {
        workflow: data as WorkflowDefinition,
        filePath: fullPath,
        validation
      };

      // Cache result
      this.cache.set(fullPath, loadResult);

      return loadResult;
    } catch (error) {
      if ((error as any).type) {
        throw error; // Re-throw LoadError
      }
      
      // File read error
      throw {
        filePath: fullPath,
        error: error as Error,
        type: 'read' as const
      } as LoadError;
    }
  }

  /**
   * Load all workflows from a directory
   */
  async loadDirectory(
    dirPath: string = '', 
    options: LoadOptions = {}
  ): Promise<{
    workflows: LoadResult[];
    errors: LoadError[];
  }> {
    const fullPath = path.join(this.baseDir, dirPath);
    const workflows: LoadResult[] = [];
    const errors: LoadError[] = [];

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(this.extension)) {
          try {
            const workflow = await this.loadWorkflow(
              path.join(dirPath, entry.name),
              options
            );
            workflows.push(workflow);
          } catch (error) {
            errors.push(error as LoadError);
          }
        }
      }
    } catch (error) {
      errors.push({
        filePath: fullPath,
        error: error as Error,
        type: 'read'
      });
    }

    return { workflows, errors };
  }

  /**
   * Load workflows from multiple directories
   */
  async loadFromPaths(
    paths: string[],
    options: LoadOptions = {}
  ): Promise<{
    workflows: Map<string, LoadResult>;
    errors: LoadError[];
  }> {
    const workflows = new Map<string, LoadResult>();
    const errors: LoadError[] = [];

    for (const dirPath of paths) {
      const result = await this.loadDirectory(dirPath, options);
      
      // Add workflows to map
      for (const workflow of result.workflows) {
        workflows.set(workflow.workflow.id, workflow);
      }

      // Collect errors
      errors.push(...result.errors);
    }

    return { workflows, errors };
  }

  /**
   * Validate a workflow without loading it
   */
  static validateWorkflow(data: any): {
    valid: boolean;
    errors?: z.ZodError;
    validated?: ValidatedWorkflowDefinition;
  } {
    const result = WorkflowDefinitionSchema.safeParse(data);
    return {
      valid: result.success,
      errors: result.success ? undefined : result.error,
      validated: result.success ? result.data : undefined
    };
  }

  /**
   * List all workflow files in a directory
   */
  async listWorkflows(dirPath: string = ''): Promise<string[]> {
    const fullPath = path.join(this.baseDir, dirPath);
    const files: string[] = [];

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(this.extension)) {
          files.push(path.join(dirPath, entry.name));
        } else if (entry.isDirectory()) {
          // Recursively list subdirectories
          const subFiles = await this.listWorkflows(path.join(dirPath, entry.name));
          files.push(...subFiles);
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
      return [];
    }

    return files;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get a cached workflow
   */
  getCached(filePath: string): LoadResult | undefined {
    return this.cache.get(filePath);
  }

  /**
   * Create a workflow file
   */
  async saveWorkflow(
    workflow: WorkflowDefinition,
    filePath: string
  ): Promise<void> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.baseDir, filePath);

    // Validate before saving
    const validation = WorkflowLoader.validateWorkflow(workflow);
    if (!validation.valid) {
      throw new Error(`Invalid workflow: ${validation.errors?.message}`);
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    // Write file
    await fs.writeFile(
      fullPath,
      JSON.stringify(workflow, null, 2),
      'utf-8'
    );

    // Update cache
    this.cache.set(fullPath, {
      workflow,
      filePath: fullPath,
      validation: { valid: true }
    });
  }
}

/**
 * Create a default workflow loader instance
 */
export function createWorkflowLoader(options?: LoadOptions): WorkflowLoader {
  return new WorkflowLoader(options);
}