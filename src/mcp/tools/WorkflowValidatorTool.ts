/**
 * Workflow Validator Tool for FlowScript MCP
 * 
 * This tool validates FlowScript workflow definitions, checking for:
 * - Syntax correctness
 * - Node existence and compatibility
 * - Edge connections between nodes
 * - Configuration validity
 * - Common workflow anti-patterns
 * 
 * It helps AI models ensure that composed or modified workflows are valid
 * before execution.
 */

import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';
import { WorkflowDefinition, FlowElement } from '../../core/types/workflow';
import { NodeRegistry, getNodeRegistry } from '../../nodes/registry';

/**
 * Validation request
 */
export interface ValidationRequest {
  /** The workflow to validate */
  workflow: WorkflowDefinition;
  
  /** Validation strictness level */
  strictness?: 'strict' | 'normal' | 'lenient';
  
  /** Check for specific issues */
  checks?: {
    nodeExistence?: boolean;
    edgeCompatibility?: boolean;
    configValidation?: boolean;
    antiPatterns?: boolean;
  };
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Overall validation status */
  isValid: boolean;
  
  /** List of errors that must be fixed */
  errors: ValidationIssue[];
  
  /** List of warnings to consider */
  warnings: ValidationIssue[];
  
  /** Suggestions for improvement */
  suggestions: string[];
  
  /** Summary of validation */
  summary: string;
}

/**
 * Validation issue details
 */
export interface ValidationIssue {
  /** Issue type */
  type: 'node' | 'edge' | 'config' | 'structure' | 'pattern';
  
  /** Severity level */
  severity: 'error' | 'warning';
  
  /** Issue description */
  message: string;
  
  /** Location in workflow */
  location?: {
    nodeIndex?: number;
    nodeName?: string;
    path?: string;
  };
  
  /** Suggested fix */
  fix?: string;
}

/**
 * Workflow Validator Tool Implementation
 */
export class WorkflowValidatorTool implements Node {
  metadata: NodeMetadata = {
    name: 'validateWorkflow',
    description: 'Validate a FlowScript workflow definition for correctness and best practices',
    type: 'action',
    ai_hints: {
      purpose: 'Check workflow validity before execution',
      when_to_use: 'After composing or modifying a workflow to ensure it will run correctly',
      expected_edges: ['valid', 'invalid'],
      example_usage: 'Validate workflow syntax, node compatibility, and configuration'
    }
  };
  
  private nodeRegistry: NodeRegistry;
  
  constructor(nodeRegistry?: NodeRegistry) {
    this.nodeRegistry = nodeRegistry || getNodeRegistry();
  }
  
  async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
    const request = context.config as ValidationRequest;
    
    if (!request.workflow) {
      return {
        invalid: () => ({
          error: 'No workflow provided for validation'
        })
      };
    }
    
    try {
      const result = this.validateWorkflow(request);
      
      if (result.isValid) {
        return {
          valid: () => result
        };
      } else {
        return {
          invalid: () => result
        };
      }
    } catch (error) {
      return {
        invalid: () => ({
          error: 'Validation failed',
          message: error instanceof Error ? error.message : String(error)
        })
      };
    }
  }
  
  /**
   * Perform comprehensive workflow validation
   */
  private validateWorkflow(request: ValidationRequest): ValidationResult {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];
    const suggestions: string[] = [];
    
    const checks = {
      nodeExistence: true,
      edgeCompatibility: true,
      configValidation: true,
      antiPatterns: true,
      ...request.checks
    };
    
    // Basic structure validation
    this.validateStructure(request.workflow, errors, warnings);
    
    // Node validation
    if (checks.nodeExistence) {
      this.validateNodes(request.workflow, errors, warnings);
    }
    
    // Edge compatibility validation
    if (checks.edgeCompatibility) {
      this.validateEdgeCompatibility(request.workflow, errors, warnings);
    }
    
    // Configuration validation
    if (checks.configValidation) {
      this.validateConfigurations(request.workflow, errors, warnings);
    }
    
    // Anti-pattern detection
    if (checks.antiPatterns) {
      this.detectAntiPatterns(request.workflow, warnings, suggestions);
    }
    
    // Generate summary
    const summary = this.generateSummary(errors, warnings, request.workflow);
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      summary
    };
  }
  
  /**
   * Validate basic workflow structure
   */
  private validateStructure(
    workflow: WorkflowDefinition,
    errors: ValidationIssue[],
    warnings: ValidationIssue[]
  ): void {
    // Check required fields
    if (!workflow.id) {
      errors.push({
        type: 'structure',
        severity: 'error',
        message: 'Workflow ID is required'
      });
    }
    
    if (!workflow.name) {
      warnings.push({
        type: 'structure',
        severity: 'warning',
        message: 'Workflow name is recommended'
      });
    }
    
    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      errors.push({
        type: 'structure',
        severity: 'error',
        message: 'Workflow must have a nodes array'
      });
      return;
    }
    
    if (workflow.nodes.length === 0) {
      errors.push({
        type: 'structure',
        severity: 'error',
        message: 'Workflow must contain at least one node'
      });
    }
    
    // Check initial state
    if (!workflow.initialState || typeof workflow.initialState !== 'object') {
      warnings.push({
        type: 'structure',
        severity: 'warning',
        message: 'Initial state should be an object',
        fix: 'Set initialState to an empty object {}'
      });
    }
  }
  
  /**
   * Validate all nodes exist and are properly structured
   */
  private validateNodes(
    workflow: WorkflowDefinition,
    errors: ValidationIssue[],
    warnings: ValidationIssue[]
  ): void {
    workflow.nodes.forEach((node, index) => {
      this.validateFlowElement(node, index, errors, warnings);
    });
  }
  
  /**
   * Validate a single flow element
   */
  private validateFlowElement(
    element: FlowElement,
    index: number,
    errors: ValidationIssue[],
    warnings: ValidationIssue[]
  ): void {
    if (typeof element === 'string') {
      // Simple node reference
      if (!this.nodeRegistry.has(element)) {
        errors.push({
          type: 'node',
          severity: 'error',
          message: `Unknown node: ${element}`,
          location: { nodeIndex: index, nodeName: element }
        });
      }
    } else if (typeof element === 'object' && !Array.isArray(element)) {
      // Node with configuration
      const nodeNames = Object.keys(element);
      if (nodeNames.length !== 1) {
        errors.push({
          type: 'node',
          severity: 'error',
          message: 'Node configuration object must have exactly one key',
          location: { nodeIndex: index }
        });
        return;
      }
      
      const nodeName = nodeNames[0];
      if (!this.nodeRegistry.has(nodeName)) {
        errors.push({
          type: 'node',
          severity: 'error',
          message: `Unknown node: ${nodeName}`,
          location: { nodeIndex: index, nodeName }
        });
      }
    } else if (Array.isArray(element)) {
      // Branch or loop structure
      if (element.length !== 2) {
        errors.push({
          type: 'structure',
          severity: 'error',
          message: 'Control structure must have exactly 2 elements',
          location: { nodeIndex: index }
        });
        return;
      }
      
      // Validate condition node
      this.validateFlowElement(element[0], index, errors, warnings);
      
      // Validate branches/body
      if (typeof element[1] === 'object' && !Array.isArray(element[1])) {
        // Branch map
        for (const [edge, branch] of Object.entries(element[1])) {
          if (branch !== null) {
            if (Array.isArray(branch)) {
              branch.forEach((node, i) => {
                this.validateFlowElement(node, index, errors, warnings);
              });
            } else {
              this.validateFlowElement(branch, index, errors, warnings);
            }
          }
        }
      } else if (Array.isArray(element[1])) {
        // Loop body
        element[1].forEach((node, i) => {
          this.validateFlowElement(node, index, errors, warnings);
        });
      }
    } else {
      errors.push({
        type: 'structure',
        severity: 'error',
        message: `Invalid flow element type: ${typeof element}`,
        location: { nodeIndex: index }
      });
    }
  }
  
  /**
   * Validate edge compatibility between nodes
   */
  private validateEdgeCompatibility(
    workflow: WorkflowDefinition,
    errors: ValidationIssue[],
    warnings: ValidationIssue[]
  ): void {
    // This would require more complex analysis of the workflow structure
    // to ensure that node edges match up properly
    // For now, we'll add a basic check
    
    // Check for orphaned branches
    workflow.nodes.forEach((node, index) => {
      if (Array.isArray(node) && node.length === 2) {
        const conditionNode = this.getNodeName(node[0]);
        if (conditionNode) {
          const metadata = this.nodeRegistry.getMetadata(conditionNode);
          if (metadata) {
            const branches = node[1] as any;
            if (typeof branches === 'object' && !Array.isArray(branches)) {
              // Check if all expected edges are handled
              const handledEdges = Object.keys(branches);
              const missingEdges = metadata.ai_hints.expected_edges.filter(
                edge => !handledEdges.includes(edge)
              );
              
              if (missingEdges.length > 0) {
                warnings.push({
                  type: 'edge',
                  severity: 'warning',
                  message: `Node ${conditionNode} has unhandled edges: ${missingEdges.join(', ')}`,
                  location: { nodeIndex: index, nodeName: conditionNode }
                });
              }
            }
          }
        }
      }
    });
  }
  
  /**
   * Validate node configurations
   */
  private validateConfigurations(
    workflow: WorkflowDefinition,
    errors: ValidationIssue[],
    warnings: ValidationIssue[]
  ): void {
    // Validate configurations against schemas
    workflow.nodes.forEach((element, index) => {
      if (typeof element === 'object' && !Array.isArray(element)) {
        const nodeName = Object.keys(element)[0];
        const config = element[nodeName];
        
        // Basic config validation
        if (config === null || config === undefined) {
          warnings.push({
            type: 'config',
            severity: 'warning',
            message: `Node ${nodeName} has empty configuration`,
            location: { nodeIndex: index, nodeName }
          });
        }
      }
    });
  }
  
  /**
   * Detect common anti-patterns
   */
  private detectAntiPatterns(
    workflow: WorkflowDefinition,
    warnings: ValidationIssue[],
    suggestions: string[]
  ): void {
    // Detect infinite loops
    const loopNodes = this.findLoopNodes(workflow.nodes);
    loopNodes.forEach(({ node, index }) => {
      if (!this.hasLoopTermination(node)) {
        warnings.push({
          type: 'pattern',
          severity: 'warning',
          message: 'Potential infinite loop detected',
          location: { nodeIndex: index },
          fix: 'Ensure loop has proper termination conditions'
        });
      }
    });
    
    // Detect missing error handling
    if (!this.hasErrorHandling(workflow.nodes)) {
      suggestions.push('Consider adding error handling nodes for robustness');
    }
    
    // Detect excessive nesting
    const maxDepth = this.calculateMaxDepth(workflow.nodes);
    if (maxDepth > 3) {
      warnings.push({
        type: 'pattern',
        severity: 'warning',
        message: `Workflow has deep nesting (depth: ${maxDepth})`,
        fix: 'Consider flattening the workflow structure'
      });
    }
    
    // Detect sequential human tasks
    const humanNodes = this.findHumanNodes(workflow.nodes);
    for (let i = 0; i < humanNodes.length - 1; i++) {
      if (humanNodes[i].index + 1 === humanNodes[i + 1].index) {
        warnings.push({
          type: 'pattern',
          severity: 'warning',
          message: 'Sequential human tasks detected',
          location: { nodeIndex: humanNodes[i].index },
          fix: 'Consider combining sequential human tasks'
        });
      }
    }
  }
  
  /**
   * Helper: Get node name from flow element
   */
  private getNodeName(element: FlowElement): string | null {
    if (typeof element === 'string') {
      return element;
    } else if (typeof element === 'object' && !Array.isArray(element)) {
      return Object.keys(element)[0];
    }
    return null;
  }
  
  /**
   * Helper: Find loop nodes
   */
  private findLoopNodes(nodes: FlowElement[]): Array<{ node: FlowElement; index: number }> {
    const loopNodes: Array<{ node: FlowElement; index: number }> = [];
    
    nodes.forEach((node, index) => {
      const nodeName = this.getNodeName(node);
      if (nodeName && (nodeName.includes('while') || nodeName.includes('loop') || nodeName === 'forEach')) {
        loopNodes.push({ node, index });
      }
    });
    
    return loopNodes;
  }
  
  /**
   * Helper: Check if loop has termination
   */
  private hasLoopTermination(node: FlowElement): boolean {
    // Check if loop configuration has max iterations or proper conditions
    if (typeof node === 'object' && !Array.isArray(node)) {
      const config = Object.values(node)[0] as any;
      return config && (config.maxIterations || config.condition);
    }
    return false;
  }
  
  /**
   * Helper: Check for error handling
   */
  private hasErrorHandling(nodes: FlowElement[]): boolean {
    return nodes.some(node => {
      const nodeName = this.getNodeName(node);
      return nodeName && (nodeName.includes('error') || nodeName.includes('catch'));
    });
  }
  
  /**
   * Helper: Calculate maximum nesting depth
   */
  private calculateMaxDepth(nodes: FlowElement[], currentDepth = 0): number {
    let maxDepth = currentDepth;
    
    for (const node of nodes) {
      if (Array.isArray(node) && node.length === 2) {
        const branches = node[1];
        if (typeof branches === 'object' && !Array.isArray(branches)) {
          // Branch structure
          for (const branch of Object.values(branches)) {
            if (Array.isArray(branch)) {
              maxDepth = Math.max(maxDepth, this.calculateMaxDepth(branch, currentDepth + 1));
            }
          }
        } else if (Array.isArray(branches)) {
          // Loop structure
          maxDepth = Math.max(maxDepth, this.calculateMaxDepth(branches, currentDepth + 1));
        }
      }
    }
    
    return maxDepth;
  }
  
  /**
   * Helper: Find human interaction nodes
   */
  private findHumanNodes(nodes: FlowElement[]): Array<{ node: string; index: number }> {
    const humanNodes: Array<{ node: string; index: number }> = [];
    
    nodes.forEach((node, index) => {
      const nodeName = this.getNodeName(node);
      if (nodeName) {
        const metadata = this.nodeRegistry.getMetadata(nodeName);
        if (metadata && metadata.type === 'human') {
          humanNodes.push({ node: nodeName, index });
        }
      }
    });
    
    return humanNodes;
  }
  
  /**
   * Generate validation summary
   */
  private generateSummary(
    errors: ValidationIssue[],
    warnings: ValidationIssue[],
    workflow: WorkflowDefinition
  ): string {
    const parts: string[] = [];
    
    if (errors.length === 0) {
      parts.push(`✓ Workflow "${workflow.name}" is valid.`);
    } else {
      parts.push(`✗ Workflow "${workflow.name}" has ${errors.length} error(s).`);
    }
    
    if (warnings.length > 0) {
      parts.push(`${warnings.length} warning(s) found.`);
    }
    
    parts.push(`${workflow.nodes.length} nodes validated.`);
    
    return parts.join(' ');
  }
}