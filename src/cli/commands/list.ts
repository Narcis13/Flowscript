import * as fs from 'fs/promises';
import * as path from 'path';
import { WorkflowDefinition } from '../../core/types';

interface ListOptions {
  directory?: string;
}

export async function listCommand(options: ListOptions) {
  try {
    const workflowDir = path.resolve(options.directory || './workflows');
    
    console.log(`📂 Searching for workflows in: ${workflowDir}`);
    
    // Check if directory exists
    try {
      await fs.access(workflowDir);
    } catch {
      console.error(`❌ Directory not found: ${workflowDir}`);
      console.log('\n💡 Tip: Use -d option to specify a different directory');
      process.exit(1);
    }
    
    // Read directory contents
    const files = await fs.readdir(workflowDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    if (jsonFiles.length === 0) {
      console.log('\n📭 No workflow files found (*.json)');
      return;
    }
    
    console.log(`\n📋 Found ${jsonFiles.length} workflow file(s):\n`);
    
    // Process each workflow file
    const workflows: Array<{
      file: string;
      id?: string;
      nodeCount: number;
      hasHitl: boolean;
      error?: string;
    }> = [];
    
    for (const file of jsonFiles) {
      const filePath = path.join(workflowDir, file);
      
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const workflow: WorkflowDefinition = JSON.parse(content);
        
        // Count nodes and check for HITL
        const nodeRefs = extractNodeReferences(workflow.nodes);
        const hasHitl = nodeRefs.some(ref => 
          ref.includes('human') || 
          ref.includes('approve') || 
          ref.includes('review') ||
          ref.includes('input')
        );
        
        workflows.push({
          file,
          id: workflow.id,
          nodeCount: nodeRefs.length,
          hasHitl
        });
      } catch (error) {
        workflows.push({
          file,
          nodeCount: 0,
          hasHitl: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Display workflows in a table format
    console.log('File                          | ID                    | Nodes | HITL | Status');
    console.log('----------------------------- | --------------------- | ----- | ---- | -------');
    
    workflows.forEach(wf => {
      const fileName = wf.file.padEnd(28, ' ');
      const id = (wf.id || '-').padEnd(21, ' ');
      const nodes = wf.nodeCount.toString().padEnd(5, ' ');
      const hitl = (wf.hasHitl ? '✓' : '-').padEnd(4, ' ');
      const status = wf.error ? '❌ Error' : '✅ Valid';
      
      console.log(`${fileName} | ${id} | ${nodes} | ${hitl} | ${status}`);
      
      if (wf.error) {
        console.log(`  └─ ${wf.error}`);
      }
    });
    
    // Summary
    const validCount = workflows.filter(w => !w.error).length;
    const hitlCount = workflows.filter(w => w.hasHitl).length;
    
    console.log('\n📊 Summary:');
    console.log(`   Total workflows: ${workflows.length}`);
    console.log(`   Valid workflows: ${validCount}`);
    console.log(`   With HITL: ${hitlCount}`);
    
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
        extractFromElement(element[0]);
        
        if (typeof element[1] === 'object' && !Array.isArray(element[1])) {
          Object.values(element[1]).forEach(branch => {
            if (Array.isArray(branch)) {
              branch.forEach(extractFromElement);
            } else if (branch !== null) {
              extractFromElement(branch);
            }
          });
        } else if (Array.isArray(element[1])) {
          element[1].forEach(extractFromElement);
        }
      }
    }
  }
  
  nodes.forEach(extractFromElement);
  return refs;
}