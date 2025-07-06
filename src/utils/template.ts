/**
 * Template interpolation utilities for workflow parameters
 */

/**
 * Interpolate template strings with values from state
 * Supports {{variable}} syntax
 * 
 * @param template - The template string containing {{variable}} placeholders
 * @param state - The state object to extract values from
 * @returns The interpolated string
 */
export function interpolateTemplate(template: string, state: Record<string, any>): string {
  if (typeof template !== 'string') {
    return template;
  }

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    // Handle special dynamic variables
    if (key === '_timestamp') {
      return new Date().toISOString();
    }
    
    if (state.hasOwnProperty(key)) {
      const value = state[key];
      // Convert value to string representation
      if (value === null || value === undefined) {
        return '';
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
    }
    // If key not found, return the original placeholder
    return match;
  });
}

/**
 * Recursively interpolate templates in an object
 * 
 * @param obj - The object containing template strings
 * @param state - The state object to extract values from
 * @returns A new object with interpolated values
 */
export function interpolateObject(obj: any, state: Record<string, any>): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return interpolateTemplate(obj, state);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => interpolateObject(item, state));
  }

  if (typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateObject(value, state);
    }
    return result;
  }

  return obj;
}

/**
 * Check if a string contains template placeholders
 * 
 * @param str - The string to check
 * @returns True if the string contains {{}} placeholders
 */
export function hasTemplates(str: string): boolean {
  if (typeof str !== 'string') {
    return false;
  }
  return /\{\{[\w.]+\}\}/.test(str);
}