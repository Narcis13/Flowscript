import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { WorkflowDefinitionSchema } from '../../core/types';
import { getNodeRegistry } from '../../nodes/registry';
import { registerAllNodes } from '../../nodes/registerAll';

interface ValidateOptions {
  verbose?: boolean;
}

export async function validateCommand(workflowPath: string, options: ValidateOptions) {
  try {
    // Resolve workflow path
    const resolvedPath = path.resolve(workflowPath);
    
    // Check if file exists
    await fs.access(resolvedPath);
    
    // Read workflow file
    const workflowContent = await fs.readFile(resolvedPath, 'utf-8');
    
    console.log(`🔍 Validating workflow: ${path.basename(workflowPath)}`);
    
    // Parse JSON
    let workflow: any;
    try {
      workflow = JSON.parse(workflowContent);
    } catch (e) {
      console.error('❌ Invalid JSON format');
      if (options.verbose && e instanceof Error) {
        console.error(`   ${e.message}`);
      }
      process.exit(1);
    }
    
    // Validate against schema
    try {
      WorkflowDefinitionSchema.parse(workflow);
      console.log('✅ Workflow structure is valid');
    } catch (e) {
      console.error('❌ Workflow validation failed');
      if (e instanceof z.ZodError) {
        console.error('\nValidation errors:');
        e.errors.forEach((error, index) => {
          console.error(`${index + 1}. Path: ${error.path.join('.')}`);
          console.error(`   Error: ${error.message}`);
        });
      }
      process.exit(1);
    }
    
    // Validate node references if verbose
    if (options.verbose) {
      console.log('\n📋 Checking node references...');
      registerAllNodes();
      const registry = getNodeRegistry();
      
      const nodeRefs = extractNodeReferences(workflow.nodes);
      const missingNodes: string[] = [];
      
      for (const ref of nodeRefs) {
        if (!registry.has(ref)) {
          missingNodes.push(ref);
        }
      }
      
      if (missingNodes.length > 0) {
        console.warn('\n⚠️  Warning: The following nodes are not registered:');
        missingNodes.forEach(node => console.warn(`   - ${node}`));
      } else {
        console.log('✅ All node references are valid');
      }
      
      // Display workflow summary
      console.log('\n📊 Workflow Summary:');
      console.log(`   ID: ${workflow.id}`);
      console.log(`   Total nodes: ${nodeRefs.length}`);
      console.log(`   Unique nodes: ${new Set(nodeRefs).size}`);
      
      if (workflow.initialState) {
        console.log(`   Initial state keys: ${Object.keys(workflow.initialState).join(', ')}`);
      }
    }
    
    console.log('\n✨ Workflow validation complete');
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function extractNodeReferences(nodes: any[]): string[] {
  const refs: string[] = [];
  
  function extractFromElement(element: any) {
    if (typeof element === 'string') {
      refs.push(element);
    } else if (typeof element === 'object' && !Array.isArray(element)) {
      const keys = Object.keys(element);
      if (keys.length === 1) {
        refs.push(keys[0]);
      }
    } else if (Array.isArray(element)) {
      if (element.length === 2) {
        // Branch or loop structure
        extractFromElement(element[0]);
        
        if (typeof element[1] === 'object' && !Array.isArray(element[1])) {
          // Branch map
          Object.values(element[1]).forEach(branch => {
            if (Array.isArray(branch)) {
              branch.forEach(extractFromElement);
            } else if (branch !== null) {
              extractFromElement(branch);
            }
          });
        } else if (Array.isArray(element[1])) {
          // Loop body
          element[1].forEach(extractFromElement);
        }
      }
    }
  }
  
  nodes.forEach(extractFromElement);
  return refs;
}