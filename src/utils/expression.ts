/**
 * Expression evaluation utilities for FlowScript
 */

import { StateManager } from '../core/state';

/**
 * Evaluates a simple expression against the state
 * Supports:
 * - Direct state path references: "state.user.age > 18"
 * - Comparisons: <, >, <=, >=, ==, ===, !=, !==
 * - Logical operators: &&, ||, !
 * - Basic arithmetic: +, -, *, /
 * - Property access: state.path.to.value
 * 
 * @param expression - The expression string to evaluate
 * @param state - The StateManager instance
 * @returns The result of the expression evaluation
 */
export function evaluateExpression(expression: string, state: StateManager): any {
  // Security note: In production, use a proper expression parser
  // This is a simplified implementation for the prototype
  
  try {
    // Create a safe evaluation context
    const context = {
      state: createStateProxy(state),
      true: true,
      false: false,
      null: null,
      undefined: undefined,
      // Add safe math functions
      Math: Math,
      Date: Date,
      // Helper functions
      exists: (path: string) => state.has(path),
      length: (arr: any) => Array.isArray(arr) ? arr.length : 0,
      isEmpty: (val: any) => {
        if (val === null || val === undefined) return true;
        if (Array.isArray(val)) return val.length === 0;
        if (typeof val === 'object') return Object.keys(val).length === 0;
        if (typeof val === 'string') return val.length === 0;
        return false;
      }
    };
    
    // Create a function that evaluates the expression in the context
    const func = new Function(...Object.keys(context), `return ${expression}`);
    
    // Execute with the context values
    return func(...Object.values(context));
  } catch (error) {
    throw new Error(`Expression evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Creates a proxy object for safe state access in expressions
 */
function createStateProxy(state: StateManager): any {
  return new Proxy({}, {
    get(_target, prop) {
      if (typeof prop === 'string') {
        // Handle root state access
        if (prop === '$' || prop === 'root') {
          return state.getState();
        }
        
        // For other properties, get from state
        const value = state.get(prop);
        
        // If value is an object, wrap it in a proxy for nested access
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return createNestedProxy(value, prop, state);
        }
        
        return value;
      }
      return undefined;
    },
    has(_target, prop) {
      return typeof prop === 'string' && state.has(prop);
    }
  });
}

/**
 * Creates a nested proxy for deep property access
 */
function createNestedProxy(obj: any, basePath: string, state: StateManager): any {
  return new Proxy(obj, {
    get(target, prop) {
      if (typeof prop === 'string') {
        const path = `${basePath}.${prop}`;
        const value = state.get(path);
        
        // Continue proxying nested objects
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return createNestedProxy(value, path, state);
        }
        
        return value;
      }
      return target[prop];
    }
  });
}

/**
 * Validates an expression without executing it
 */
export function validateExpression(expression: string): { valid: boolean; error?: string } {
  try {
    // Basic validation - check for dangerous patterns
    const dangerous = [
      'eval',
      'Function',
      'require',
      'import',
      '__proto__',
      'constructor',
      'process',
      'global',
      'window'
    ];
    
    for (const pattern of dangerous) {
      if (expression.includes(pattern)) {
        return {
          valid: false,
          error: `Expression contains forbidden pattern: ${pattern}`
        };
      }
    }
    
    // Try to parse as a function
    new Function('state', `return ${expression}`);
    
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}