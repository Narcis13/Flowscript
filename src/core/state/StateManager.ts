/**
 * StateManager implementation for FlowScript
 * Manages workflow state with JSONPath-like access patterns
 */

export class StateManager {
  private state: Record<string, any>;
  private readonly hooks: {
    beforeUpdate?: (path: string, oldValue: any, newValue: any) => void;
    afterUpdate?: (path: string, value: any) => void;
  };

  constructor(initialState: Record<string, any> = {}, hooks?: StateManager['hooks']) {
    this.state = this.deepClone(initialState);
    this.hooks = hooks || {};
  }

  /**
   * Get a value from the state using JSONPath-like syntax
   * @param path - JSONPath-like string (e.g., "$.user.name" or "user.name")
   * @returns The value at the path or undefined if not found
   */
  get(path: string): any {
    // Handle root path
    if (path === '$' || path === '') {
      return this.deepClone(this.state);
    }

    // Normalize path (remove leading $ and .)
    const normalizedPath = path.replace(/^\$\.?/, '');
    
    // Split path into segments
    const segments = this.parsePath(normalizedPath);
    
    // Navigate through the state
    let current: any = this.state;
    for (const segment of segments) {
      if (current === null || current === undefined) {
        return undefined;
      }
      
      // Handle array index access
      if (segment.match(/^\d+$/)) {
        current = current[parseInt(segment, 10)];
      } else {
        current = current[segment];
      }
    }
    
    return this.deepClone(current);
  }

  /**
   * Set a value in the state using JSONPath-like syntax
   * @param path - JSONPath-like string
   * @param value - The value to set
   */
  set(path: string, value: any): void {
    // Handle root path
    if (path === '$' || path === '') {
      const oldState = this.deepClone(this.state);
      this.state = this.deepClone(value);
      this.hooks.beforeUpdate?.(path, oldState, this.state);
      this.hooks.afterUpdate?.(path, this.state);
      return;
    }

    // Normalize path
    const normalizedPath = path.replace(/^\$\.?/, '');
    const segments = this.parsePath(normalizedPath);
    
    if (segments.length === 0) {
      return;
    }

    // Navigate to parent object
    let current: any = this.state;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      
      // Create intermediate objects/arrays if they don't exist
      if (current[segment] === undefined) {
        const nextSegment = segments[i + 1];
        current[segment] = nextSegment.match(/^\d+$/) ? [] : {};
      }
      
      current = current[segment];
    }

    // Set the value
    const lastSegment = segments[segments.length - 1];
    const oldValue = this.deepClone(current[lastSegment]);
    
    this.hooks.beforeUpdate?.(path, oldValue, value);
    
    if (lastSegment.match(/^\d+$/)) {
      current[parseInt(lastSegment, 10)] = this.deepClone(value);
    } else {
      current[lastSegment] = this.deepClone(value);
    }
    
    this.hooks.afterUpdate?.(path, value);
  }

  /**
   * Update the state by merging with new data
   * @param updates - Object to merge with current state
   */
  update(updates: Record<string, any>): void {
    const oldState = this.deepClone(this.state);
    
    this.hooks.beforeUpdate?.('$', oldState, updates);
    
    // Deep merge the updates
    this.state = this.deepMerge(this.state, updates);
    
    this.hooks.afterUpdate?.('$', this.state);
  }

  /**
   * Get a snapshot of the entire state
   * @returns A deep clone of the current state
   */
  getState(): Record<string, any> {
    return this.deepClone(this.state);
  }

  /**
   * Replace the entire state
   * @param newState - The new state
   */
  setState(newState: Record<string, any>): void {
    const oldState = this.deepClone(this.state);
    this.hooks.beforeUpdate?.('$', oldState, newState);
    this.state = this.deepClone(newState);
    this.hooks.afterUpdate?.('$', this.state);
  }

  /**
   * Check if a path exists in the state
   * @param path - JSONPath-like string
   * @returns true if the path exists
   */
  has(path: string): boolean {
    return this.get(path) !== undefined;
  }

  /**
   * Delete a value from the state
   * @param path - JSONPath-like string
   */
  delete(path: string): void {
    if (path === '$' || path === '') {
      this.setState({});
      return;
    }

    const normalizedPath = path.replace(/^\$\.?/, '');
    const segments = this.parsePath(normalizedPath);
    
    if (segments.length === 0) {
      return;
    }

    // Navigate to parent object
    let current: any = this.state;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      if (current[segment] === undefined) {
        return; // Path doesn't exist
      }
      current = current[segment];
    }

    const lastSegment = segments[segments.length - 1];
    const oldValue = this.deepClone(current[lastSegment]);
    
    this.hooks.beforeUpdate?.(path, oldValue, undefined);
    
    if (Array.isArray(current) && lastSegment.match(/^\d+$/)) {
      current.splice(parseInt(lastSegment, 10), 1);
    } else {
      delete current[lastSegment];
    }
    
    this.hooks.afterUpdate?.(path, undefined);
  }

  /**
   * Parse a path string into segments
   * @param path - Path string to parse
   * @returns Array of path segments
   */
  private parsePath(path: string): string[] {
    if (!path) return [];
    
    // Handle bracket notation and dot notation
    const segments: string[] = [];
    const parts = path.split(/\.|\[|\]/g).filter(Boolean);
    
    for (const part of parts) {
      // Remove quotes from string keys
      const cleaned = part.replace(/^["']|["']$/g, '');
      if (cleaned) {
        segments.push(cleaned);
      }
    }
    
    return segments;
  }

  /**
   * Deep clone an object
   * @param obj - Object to clone
   * @returns Deep cloned object
   */
  private deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (obj instanceof Date) {
      return new Date(obj.getTime()) as any;
    }
    
    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item)) as any;
    }
    
    if (obj instanceof Object) {
      const clonedObj = {} as any;
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          clonedObj[key] = this.deepClone(obj[key]);
        }
      }
      return clonedObj;
    }
    
    return obj;
  }

  /**
   * Deep merge two objects
   * @param target - Target object
   * @param source - Source object to merge
   * @returns Merged object
   */
  private deepMerge(target: any, source: any): any {
    if (source === null || typeof source !== 'object') {
      return source;
    }
    
    if (source instanceof Date) {
      return new Date(source.getTime());
    }
    
    if (source instanceof Array) {
      return source.map(item => this.deepClone(item));
    }
    
    const result = this.deepClone(target);
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] instanceof Object && !Array.isArray(source[key]) && 
            result[key] instanceof Object && !Array.isArray(result[key])) {
          result[key] = this.deepMerge(result[key], source[key]);
        } else {
          result[key] = this.deepClone(source[key]);
        }
      }
    }
    
    return result;
  }
}