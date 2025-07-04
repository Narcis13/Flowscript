/**
 * Interactive mode utilities for CLI
 */

import inquirer from 'inquirer';
import { JSONSchema7 } from 'json-schema';

/**
 * Convert JSON Schema to Inquirer questions
 */
export function schemaToQuestions(
  schema: JSONSchema7,
  defaultValues?: Record<string, any>,
  state?: Record<string, any>
): any[] {
  const questions: any[] = [];
  
  if (schema.type === 'object' && schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const prop = propSchema as JSONSchema7;
      
      // Substitute templates in description and title if state is provided
      let description = prop.description || prop.title || key;
      if (state && typeof description === 'string') {
        description = substituteTemplates(description, state);
      }
      
      const question: any = {
        name: key,
        message: description,
        default: defaultValues?.[key] || prop.default,
        type: 'input' // default type
      };
      
      // Map JSON Schema types to inquirer types
      switch (prop.type) {
        case 'string':
          if (prop.enum) {
            question.type = 'list';
            question.choices = prop.enum as string[];
          } else {
            question.type = 'input';
          }
          break;
          
        case 'number':
        case 'integer':
          question.type = 'number';
          if (prop.minimum !== undefined) {
            question.validate = (input: number) => {
              if (input < prop.minimum!) {
                return `Value must be at least ${prop.minimum}`;
              }
              return true;
            };
          }
          if (prop.maximum !== undefined) {
            const previousValidate = question.validate;
            question.validate = (input: number) => {
              if (previousValidate) {
                const result = previousValidate(input);
                if (result !== true) return result;
              }
              if (input > prop.maximum!) {
                return `Value must be at most ${prop.maximum}`;
              }
              return true;
            };
          }
          break;
          
        case 'boolean':
          question.type = 'confirm';
          break;
          
        case 'array':
          question.type = 'checkbox';
          if (prop.items && (prop.items as JSONSchema7).enum) {
            question.choices = (prop.items as JSONSchema7).enum as string[];
          }
          break;
      }
      
      // Handle required fields
      if (schema.required?.includes(key)) {
        const previousValidate = question.validate;
        question.validate = (input: any) => {
          if (previousValidate) {
            const result = previousValidate(input);
            if (result !== true) return result;
          }
          if (!input || (typeof input === 'string' && !input.trim())) {
            return 'This field is required';
          }
          return true;
        };
      }
      
      questions.push(question);
    }
  }
  
  return questions;
}

/**
 * Prompt user with form schema
 */
export async function promptForInput(
  formSchema: JSONSchema7,
  title?: string,
  description?: string,
  defaultValues?: Record<string, any>,
  state?: Record<string, any>
): Promise<any> {
  if (title || description) {
    console.log('');
    if (title) console.log(`📋 ${title}`);
    if (description) console.log(`   ${description}`);
    console.log('');
  }
  
  const questions = schemaToQuestions(formSchema, defaultValues, state);
  return await inquirer.prompt(questions);
}

/**
 * Format context data for display
 */
export function formatContextData(data: Record<string, any>, indent: number = 2): string {
  const spaces = ' '.repeat(indent);
  const lines: string[] = [];
  
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      lines.push(`${spaces}${key}: null`);
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${spaces}${key}:`);
      lines.push(formatContextData(value, indent + 2));
    } else if (Array.isArray(value)) {
      lines.push(`${spaces}${key}: [${value.length} items]`);
    } else {
      lines.push(`${spaces}${key}: ${JSON.stringify(value)}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Handle template substitution in strings
 */
export function substituteTemplates(template: string, state: Record<string, any>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const keys = path.trim().split('.');
    let value: any = state;
    
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      // Skip 'state' only if it's the first key and we have a state wrapper
      if (i === 0 && key === 'state' && value.hasOwnProperty('state')) {
        value = value.state;
      } else {
        value = value?.[key];
      }
      
      if (value === undefined) {
        return match;
      }
    }
    
    return value !== undefined ? String(value) : match;
  });
}