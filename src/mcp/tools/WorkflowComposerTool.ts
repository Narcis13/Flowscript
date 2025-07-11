/**
 * Workflow Composer Tool for FlowScript MCP
 * 
 * This tool enables AI models to compose complete FlowScript workflows from
 * natural language descriptions. It analyzes requirements, selects appropriate
 * nodes, and generates valid workflow JSON.
 * 
 * Key capabilities:
 * 1. Natural language to workflow translation
 * 2. Automatic node selection and configuration
 * 3. Control flow structure generation
 * 4. Human-in-the-loop integration when needed
 * 5. Workflow validation and optimization
 * 
 * This tool demonstrates how AI can assist in workflow authoring, making
 * FlowScript accessible to non-technical users.
 * 
 * @example
 * // AI input: "Create a workflow that fetches user data, validates it, and sends a notification"
 * // Tool output: Complete workflow JSON with fetchData, validateData, and sendNotification nodes
 */

import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';
import { WorkflowDefinition, FlowElement } from '../../core/types/workflow';
import { NodeRegistry, getNodeRegistry } from '../../nodes/registry';
import { NodeDiscoveryTool } from './NodeDiscoveryTool';

/**
 * Workflow composition request
 */
export interface WorkflowCompositionRequest {
  /** Natural language description of the workflow */
  description: string;
  
  /** Specific requirements or constraints */
  constraints?: string[];
  
  /** Whether to include human interaction steps */
  includeHumanSteps?: boolean;
  
  /** Initial state for the workflow */
  initialState?: Record<string, any>;
  
  /** Preferred node types to use */
  preferredNodes?: string[];
  
  /** Workflow metadata */
  metadata?: {
    name?: string;
    tags?: string[];
    author?: string;
  };
}

/**
 * Workflow composition result
 */
export interface WorkflowCompositionResult {
  /** The generated workflow */
  workflow: WorkflowDefinition;
  
  /** Explanation of the composition */
  explanation: string;
  
  /** List of nodes used */
  nodesUsed: string[];
  
  /** Suggestions for improvement */
  suggestions?: string[];
  
  /** Validation results */
  validation: {
    isValid: boolean;
    warnings?: string[];
    errors?: string[];
  };
}

/**
 * Workflow pattern templates
 */
const WORKFLOW_PATTERNS = {
  dataProcessing: {
    pattern: ['fetch', 'validate', 'process', 'save'],
    description: 'Standard data processing pipeline'
  },
  approval: {
    pattern: ['prepare', 'human-review', 'conditional', 'action'],
    description: 'Approval workflow with human decision'
  },
  notification: {
    pattern: ['trigger', 'prepare', 'send', 'log'],
    description: 'Notification sending workflow'
  },
  etl: {
    pattern: ['extract', 'transform', 'validate', 'load'],
    description: 'ETL (Extract, Transform, Load) workflow'
  },
  retry: {
    pattern: ['attempt', 'check', 'retry-logic', 'complete'],
    description: 'Workflow with retry logic'
  }
};

/**
 * Workflow Composer Tool Implementation
 */
export class WorkflowComposerTool implements Node {
  metadata: NodeMetadata = {
    name: 'composeWorkflow',
    description: 'Compose a complete FlowScript workflow from natural language description',
    type: 'action',
    ai_hints: {
      purpose: 'Generate workflow definitions from requirements',
      when_to_use: 'When you need to create a new workflow based on a description of what it should do',
      expected_edges: ['composed', 'failed'],
      example_usage: 'Create workflows for data processing, approvals, notifications, etc.'
    }
  };
  
  private nodeRegistry: NodeRegistry;
  private nodeDiscovery: NodeDiscoveryTool;
  
  constructor(nodeRegistry?: NodeRegistry) {
    this.nodeRegistry = nodeRegistry || getNodeRegistry();
    this.nodeDiscovery = new NodeDiscoveryTool(this.nodeRegistry);
  }
  
  async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
    const request = context.config as WorkflowCompositionRequest;
    
    if (!request.description) {
      return {
        failed: () => ({
          error: 'No workflow description provided',
          hint: 'Please provide a description of what the workflow should do'
        })
      };
    }
    
    try {
      // Compose the workflow
      const result = await this.composeWorkflow(request);
      
      // Validate the composition
      this.validateWorkflow(result);
      
      return {
        composed: () => result
      };
      
    } catch (error) {
      return {
        failed: () => ({
          error: 'Failed to compose workflow',
          message: error instanceof Error ? error.message : String(error),
          hint: 'Try breaking down the description into simpler steps'
        })
      };
    }
  }
  
  /**
   * Main workflow composition logic
   */
  private async composeWorkflow(
    request: WorkflowCompositionRequest
  ): Promise<WorkflowCompositionResult> {
    // Analyze the description
    const analysis = this.analyzeDescription(request.description);
    
    // Identify workflow pattern
    const pattern = this.identifyPattern(analysis);
    
    // Generate workflow structure
    const nodes = await this.generateNodes(analysis, pattern, request);
    
    // Create workflow definition
    const workflow: WorkflowDefinition = {
      id: this.generateWorkflowId(request),
      name: request.metadata?.name || this.generateWorkflowName(request.description),
      initialState: request.initialState || {},
      nodes: nodes,
      metadata: {
        ...request.metadata,
        generatedBy: 'FlowScript MCP Workflow Composer',
        generatedAt: new Date().toISOString(),
        pattern: pattern?.description
      }
    };
    
    // Generate explanation
    const explanation = this.generateExplanation(workflow, analysis, pattern);
    
    // Extract node names
    const nodesUsed = this.extractNodeNames(nodes);
    
    // Generate suggestions
    const suggestions = this.generateSuggestions(workflow, analysis);
    
    return {
      workflow,
      explanation,
      nodesUsed,
      suggestions,
      validation: {
        isValid: true,
        warnings: []
      }
    };
  }
  
  /**
   * Analyze the workflow description
   */
  private analyzeDescription(description: string): {
    actions: string[];
    conditions: string[];
    humanSteps: string[];
    dataFlows: string[];
    keywords: string[];
  } {
    const lower = description.toLowerCase();
    
    // Extract action verbs
    const actionVerbs = [
      'fetch', 'get', 'retrieve', 'send', 'validate', 'check', 'process',
      'transform', 'save', 'store', 'notify', 'alert', 'approve', 'review',
      'calculate', 'generate', 'create', 'update', 'delete', 'wait', 'delay'
    ];
    
    const actions = actionVerbs.filter(verb => lower.includes(verb));
    
    // Extract conditions
    const conditionWords = ['if', 'when', 'unless', 'while', 'until'];
    const conditions = conditionWords.filter(word => lower.includes(word));
    
    // Extract human interaction indicators
    const humanIndicators = ['approve', 'review', 'input', 'decision', 'manual'];
    const humanSteps = humanIndicators.filter(word => lower.includes(word));
    
    // Extract data flow indicators
    const dataWords = ['data', 'information', 'result', 'response', 'value'];
    const dataFlows = dataWords.filter(word => lower.includes(word));
    
    // Extract all meaningful keywords
    const keywords = this.extractKeywords(description);
    
    return {
      actions,
      conditions,
      humanSteps,
      dataFlows,
      keywords
    };
  }
  
  /**
   * Identify the best matching workflow pattern
   */
  private identifyPattern(
    analysis: ReturnType<typeof this.analyzeDescription>
  ): typeof WORKFLOW_PATTERNS[keyof typeof WORKFLOW_PATTERNS] | null {
    let bestMatch: {
      pattern: typeof WORKFLOW_PATTERNS[keyof typeof WORKFLOW_PATTERNS];
      score: number;
    } | null = null;
    
    for (const [key, pattern] of Object.entries(WORKFLOW_PATTERNS)) {
      let score = 0;
      
      // Check if actions match pattern
      for (const patternStep of pattern.pattern) {
        if (analysis.actions.some(action => patternStep.includes(action))) {
          score += 0.25;
        }
      }
      
      // Special scoring for specific patterns
      if (key === 'approval' && analysis.humanSteps.length > 0) {
        score += 0.5;
      }
      
      if (key === 'dataProcessing' && analysis.dataFlows.length > 0) {
        score += 0.3;
      }
      
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { pattern, score };
      }
    }
    
    return bestMatch && bestMatch.score > 0.3 ? bestMatch.pattern : null;
  }
  
  /**
   * Generate workflow nodes based on analysis
   */
  private async generateNodes(
    analysis: ReturnType<typeof this.analyzeDescription>,
    pattern: typeof WORKFLOW_PATTERNS[keyof typeof WORKFLOW_PATTERNS] | null,
    request: WorkflowCompositionRequest
  ): Promise<FlowElement[]> {
    const nodes: FlowElement[] = [];
    
    // If we have a pattern, use it as a guide
    if (pattern) {
      for (const step of pattern.pattern) {
        const node = await this.findBestNodeForStep(step, analysis);
        if (node) {
          nodes.push(node);
        }
      }
    } else {
      // Generate nodes based on actions found
      for (const action of analysis.actions) {
        const node = await this.findBestNodeForAction(action, analysis);
        if (node) {
          nodes.push(node);
        }
      }
    }
    
    // Add conditional logic if needed
    if (analysis.conditions.length > 0) {
      this.addConditionalLogic(nodes, analysis);
    }
    
    // Add human steps if requested
    if (request.includeHumanSteps || analysis.humanSteps.length > 0) {
      this.addHumanSteps(nodes, analysis);
    }
    
    // Ensure we have at least some nodes
    if (nodes.length === 0) {
      nodes.push(this.createDefaultNode(request.description));
    }
    
    return nodes;
  }
  
  /**
   * Find the best node for a pattern step
   */
  private async findBestNodeForStep(
    step: string,
    analysis: ReturnType<typeof this.analyzeDescription>
  ): Promise<FlowElement | null> {
    // Map pattern steps to node types
    const stepToNode: Record<string, string> = {
      'fetch': 'fetchData',
      'validate': 'validateData',
      'process': 'processData',
      'save': 'saveResults',
      'prepare': 'setData',
      'human-review': 'approveExpense',
      'conditional': 'checkValue',
      'action': 'httpRequest',
      'send': 'sendNotifications',
      'log': 'logError',
      'extract': 'fetchData',
      'transform': 'processData',
      'load': 'saveResults',
      'attempt': 'httpRequest',
      'check': 'checkValue',
      'retry-logic': 'whileCondition'
    };
    
    const nodeName = stepToNode[step];
    if (nodeName && this.nodeRegistry.has(nodeName)) {
      return this.createNodeElement(nodeName, step, analysis);
    }
    
    return null;
  }
  
  /**
   * Find the best node for an action verb
   */
  private async findBestNodeForAction(
    action: string,
    analysis: ReturnType<typeof this.analyzeDescription>
  ): Promise<FlowElement | null> {
    // Use node discovery to find matching nodes
    const searchResult = await this.nodeDiscovery.execute({
      config: {
        task: action,
        keywords: analysis.keywords
      },
      state: {},
      executionId: 'composer',
      updateState: async () => {}
    });
    
    // Get the result from the 'found' edge
    const foundEdge = searchResult.found;
    if (foundEdge) {
      const result = foundEdge();
      if (result && result.nodes && result.nodes.length > 0) {
        const bestMatch = result.nodes[0];
        return this.createNodeElement(bestMatch.name, action, analysis);
      }
    }
    
    return null;
  }
  
  /**
   * Create a node element with configuration
   */
  private createNodeElement(
    nodeName: string,
    context: string,
    analysis: ReturnType<typeof this.analyzeDescription>
  ): FlowElement {
    // Generate appropriate configuration based on node type
    const config = this.generateNodeConfig(nodeName, context, analysis);
    
    if (config && Object.keys(config).length > 0) {
      return { [nodeName]: config };
    } else {
      return nodeName;
    }
  }
  
  /**
   * Generate node configuration based on context
   */
  private generateNodeConfig(
    nodeName: string,
    context: string,
    analysis: ReturnType<typeof this.analyzeDescription>
  ): Record<string, any> | null {
    // Node-specific configuration generation
    switch (nodeName) {
      case 'httpRequest':
        return {
          url: 'https://api.example.com/endpoint',
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        };
        
      case 'validateData':
        return {
          schema: {
            type: 'object',
            required: ['id', 'data'],
            properties: {
              id: { type: 'string' },
              data: { type: 'object' }
            }
          }
        };
        
      case 'checkValue':
        return {
          expression: 'state.result',
          operator: '!=',
          expectedValue: null
        };
        
      case 'delay':
        return {
          duration: 1000
        };
        
      case 'setData':
        return {
          updates: {
            timestamp: '{{new Date().toISOString()}}',
            status: 'processing'
          }
        };
        
      case 'whileCondition':
        return {
          condition: 'state.retryCount < 3',
          maxIterations: 5
        };
        
      default:
        return null;
    }
  }
  
  /**
   * Add conditional logic to the workflow
   */
  private addConditionalLogic(
    nodes: FlowElement[],
    analysis: ReturnType<typeof this.analyzeDescription>
  ): void {
    // Find a good place to insert conditional logic
    const insertIndex = Math.floor(nodes.length / 2);
    
    // Create a branch structure
    const branchStructure: FlowElement = [
      'checkValue',
      {
        'true': nodes.slice(insertIndex),
        'false': 'logError'
      }
    ];
    
    // Replace the second half with the branch
    nodes.splice(insertIndex, nodes.length - insertIndex, branchStructure);
  }
  
  /**
   * Add human interaction steps
   */
  private addHumanSteps(
    nodes: FlowElement[],
    analysis: ReturnType<typeof this.analyzeDescription>
  ): void {
    // Add human step after data preparation
    const humanNode = analysis.humanSteps.includes('approve') 
      ? 'approveExpense'
      : 'formInput';
    
    // Find a good insertion point (after initial processing)
    const insertIndex = Math.min(2, nodes.length);
    nodes.splice(insertIndex, 0, humanNode);
  }
  
  /**
   * Create a default node when nothing else matches
   */
  private createDefaultNode(description: string): FlowElement {
    return {
      setData: {
        updates: {
          description: description,
          status: 'initialized',
          timestamp: '{{new Date().toISOString()}}'
        }
      }
    };
  }
  
  /**
   * Extract keywords from description
   */
  private extractKeywords(text: string): string[] {
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'under', 'again',
      'further', 'then', 'once', 'that', 'this', 'those', 'these'
    ]);
    
    return text.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 3 && !commonWords.has(word));
  }
  
  /**
   * Generate workflow ID
   */
  private generateWorkflowId(request: WorkflowCompositionRequest): string {
    const timestamp = Date.now();
    const descriptor = request.metadata?.name || 
      request.description.substring(0, 20).replace(/\W+/g, '-');
    return `workflow-${descriptor}-${timestamp}`.toLowerCase();
  }
  
  /**
   * Generate workflow name from description
   */
  private generateWorkflowName(description: string): string {
    // Take first few words and capitalize
    const words = description.split(/\s+/).slice(0, 5);
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  
  /**
   * Extract node names from flow elements
   */
  private extractNodeNames(nodes: FlowElement[]): string[] {
    const names: string[] = [];
    
    for (const node of nodes) {
      if (typeof node === 'string') {
        names.push(node);
      } else if (typeof node === 'object' && !Array.isArray(node)) {
        names.push(...Object.keys(node));
      } else if (Array.isArray(node)) {
        // Branch or loop structure
        if (node[0]) {
          names.push(...this.extractNodeNames([node[0]]));
        }
      }
    }
    
    return [...new Set(names)]; // Remove duplicates
  }
  
  /**
   * Generate explanation of the workflow
   */
  private generateExplanation(
    workflow: WorkflowDefinition,
    analysis: ReturnType<typeof this.analyzeDescription>,
    pattern: typeof WORKFLOW_PATTERNS[keyof typeof WORKFLOW_PATTERNS] | null
  ): string {
    const parts: string[] = [];
    
    parts.push(`Generated workflow "${workflow.name}" with ${workflow.nodes.length} steps.`);
    
    if (pattern) {
      parts.push(`Used ${pattern.description} pattern.`);
    }
    
    parts.push(`The workflow includes: ${this.extractNodeNames(workflow.nodes).join(', ')}.`);
    
    if (analysis.conditions.length > 0) {
      parts.push('Added conditional logic for decision points.');
    }
    
    if (analysis.humanSteps.length > 0) {
      parts.push('Included human interaction steps as requested.');
    }
    
    return parts.join(' ');
  }
  
  /**
   * Generate suggestions for improvement
   */
  private generateSuggestions(
    workflow: WorkflowDefinition,
    analysis: ReturnType<typeof this.analyzeDescription>
  ): string[] {
    const suggestions: string[] = [];
    
    // Check for error handling
    const hasErrorHandling = workflow.nodes.some(node => 
      typeof node === 'string' && node.includes('error')
    );
    if (!hasErrorHandling) {
      suggestions.push('Consider adding error handling nodes');
    }
    
    // Check for logging
    const hasLogging = workflow.nodes.some(node =>
      typeof node === 'string' && node.includes('log')
    );
    if (!hasLogging && workflow.nodes.length > 3) {
      suggestions.push('Add logging for better observability');
    }
    
    // Check for validation
    if (analysis.dataFlows.length > 0) {
      const hasValidation = workflow.nodes.some(node =>
        typeof node === 'string' && node.includes('validate')
      );
      if (!hasValidation) {
        suggestions.push('Consider adding data validation steps');
      }
    }
    
    return suggestions;
  }
  
  /**
   * Validate the generated workflow
   */
  private validateWorkflow(result: WorkflowCompositionResult): void {
    const warnings: string[] = [];
    const errors: string[] = [];
    
    // Check for empty workflow
    if (result.workflow.nodes.length === 0) {
      errors.push('Workflow has no nodes');
    }
    
    // Check for unknown nodes
    for (const nodeName of result.nodesUsed) {
      if (!this.nodeRegistry.has(nodeName)) {
        warnings.push(`Unknown node: ${nodeName}`);
      }
    }
    
    // Update validation results
    result.validation = {
      isValid: errors.length === 0,
      warnings: warnings.length > 0 ? warnings : undefined,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}