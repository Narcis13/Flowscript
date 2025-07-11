/**
 * Node Discovery Tool for FlowScript MCP
 * 
 * This tool allows AI models to discover available FlowScript nodes based on
 * natural language descriptions of tasks. It uses fuzzy matching and semantic
 * analysis to find the most appropriate nodes for a given requirement.
 * 
 * Key features:
 * 1. Natural language search for nodes
 * 2. Filtering by node type (action, human, control)
 * 3. Semantic matching based on AI hints
 * 4. Suggestions for node combinations
 * 
 * This tool is essential for AI models to understand what capabilities
 * are available in the FlowScript system.
 * 
 * @example
 * // AI asks: "I need to make an HTTP request"
 * // Tool returns: httpRequest node with details
 */

import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';
import { NodeRegistry, getNodeRegistry } from '../../nodes/registry';

/**
 * Search criteria for node discovery
 */
export interface NodeSearchCriteria {
  /** Natural language description of the task */
  task: string;
  
  /** Filter by node type */
  type?: 'action' | 'human' | 'control';
  
  /** Expected edge names to filter by */
  expectedEdges?: string[];
  
  /** Keywords to match */
  keywords?: string[];
  
  /** Maximum number of results */
  limit?: number;
}

/**
 * Node match result with relevance scoring
 */
export interface NodeMatch {
  /** Node metadata */
  metadata: NodeMetadata;
  
  /** Relevance score (0-1) */
  score: number;
  
  /** Reasons for the match */
  matchReasons: string[];
  
  /** Usage examples specific to the query */
  contextualExample?: string;
}

/**
 * Node Discovery Tool Implementation
 */
export class NodeDiscoveryTool implements Node {
  metadata: NodeMetadata = {
    name: 'findNodes',
    description: 'Search for FlowScript nodes that can perform specific tasks',
    type: 'action',
    ai_hints: {
      purpose: 'Discover available nodes based on task descriptions',
      when_to_use: 'When you need to find nodes that can perform a specific task or match certain criteria',
      expected_edges: ['found', 'notFound'],
      example_usage: 'Find nodes for "send email", "validate data", "wait for user input"'
    }
  };
  
  private nodeRegistry: NodeRegistry;
  
  constructor(nodeRegistry?: NodeRegistry) {
    this.nodeRegistry = nodeRegistry || getNodeRegistry();
  }
  
  async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
    const config = context.config as NodeSearchCriteria;
    
    if (!config.task) {
      return {
        notFound: () => ({
          error: 'No task description provided',
          hint: 'Please provide a task description to search for nodes'
        })
      };
    }
    
    try {
      // Perform the search
      const matches = this.searchNodes(config);
      
      if (matches.length === 0) {
        return {
          notFound: () => ({
            message: `No nodes found for task: "${config.task}"`,
            suggestion: this.getSuggestion(config.task),
            availableTypes: this.getAvailableNodeTypes()
          })
        };
      }
      
      // Format the results
      const results = this.formatResults(matches, config);
      
      return {
        found: () => ({
          count: matches.length,
          nodes: results,
          bestMatch: results[0],
          searchCriteria: config
        })
      };
      
    } catch (error) {
      return {
        error: () => ({
          message: 'Error during node search',
          error: error instanceof Error ? error.message : String(error)
        })
      };
    }
  }
  
  /**
   * Search for nodes based on criteria
   */
  private searchNodes(criteria: NodeSearchCriteria): NodeMatch[] {
    const allMetadata = this.nodeRegistry.getAllMetadata();
    const matches: NodeMatch[] = [];
    
    // Filter by type first if specified
    let candidates = allMetadata;
    if (criteria.type) {
      candidates = candidates.filter(meta => meta.type === criteria.type);
    }
    
    // Score each candidate
    for (const metadata of candidates) {
      const match = this.scoreNode(metadata, criteria);
      if (match.score > 0.1) { // Minimum threshold
        matches.push(match);
      }
    }
    
    // Sort by score (highest first)
    matches.sort((a, b) => b.score - a.score);
    
    // Apply limit if specified
    if (criteria.limit && criteria.limit > 0) {
      return matches.slice(0, criteria.limit);
    }
    
    return matches;
  }
  
  /**
   * Score a node's relevance to the search criteria
   */
  private scoreNode(metadata: NodeMetadata, criteria: NodeSearchCriteria): NodeMatch {
    let score = 0;
    const matchReasons: string[] = [];
    
    const taskLower = criteria.task.toLowerCase();
    const nameLower = metadata.name.toLowerCase();
    const descLower = metadata.description.toLowerCase();
    const purposeLower = metadata.ai_hints.purpose.toLowerCase();
    const whenToUseLower = metadata.ai_hints.when_to_use.toLowerCase();
    
    // Direct name match
    if (nameLower.includes(taskLower) || taskLower.includes(nameLower)) {
      score += 0.5;
      matchReasons.push('Name matches task');
    }
    
    // Description match
    const descWords = this.extractKeywords(criteria.task);
    let descMatchCount = 0;
    for (const word of descWords) {
      if (descLower.includes(word.toLowerCase())) {
        descMatchCount++;
      }
    }
    if (descMatchCount > 0) {
      score += 0.3 * (descMatchCount / descWords.length);
      matchReasons.push('Description contains relevant keywords');
    }
    
    // Purpose match
    if (purposeLower.includes(taskLower) || this.hasCommonWords(purposeLower, taskLower)) {
      score += 0.3;
      matchReasons.push('Purpose aligns with task');
    }
    
    // When to use match
    if (whenToUseLower.includes(taskLower) || this.hasCommonWords(whenToUseLower, taskLower)) {
      score += 0.4;
      matchReasons.push('Usage scenario matches');
    }
    
    // Keyword matching
    if (criteria.keywords) {
      const keywordMatches = criteria.keywords.filter(kw => 
        nameLower.includes(kw.toLowerCase()) ||
        descLower.includes(kw.toLowerCase()) ||
        purposeLower.includes(kw.toLowerCase())
      ).length;
      
      if (keywordMatches > 0) {
        score += 0.2 * (keywordMatches / criteria.keywords.length);
        matchReasons.push(`Matches ${keywordMatches} keywords`);
      }
    }
    
    // Expected edges matching
    if (criteria.expectedEdges && criteria.expectedEdges.length > 0) {
      const edgeMatches = criteria.expectedEdges.filter(edge =>
        metadata.ai_hints.expected_edges.includes(edge)
      ).length;
      
      if (edgeMatches > 0) {
        score += 0.3 * (edgeMatches / criteria.expectedEdges.length);
        matchReasons.push('Has expected edges');
      }
    }
    
    // Semantic matching for common patterns
    score += this.semanticMatch(metadata, criteria.task);
    
    // Cap score at 1.0
    score = Math.min(score, 1.0);
    
    return {
      metadata,
      score,
      matchReasons,
      contextualExample: this.generateContextualExample(metadata, criteria.task)
    };
  }
  
  /**
   * Extract keywords from a task description
   */
  private extractKeywords(task: string): string[] {
    // Remove common words and extract meaningful terms
    const commonWords = new Set([
      'i', 'need', 'want', 'to', 'a', 'an', 'the', 'for', 'with',
      'can', 'how', 'do', 'make', 'create', 'find', 'get', 'node'
    ]);
    
    const words = task.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !commonWords.has(word));
    
    return words;
  }
  
  /**
   * Check if two strings have common meaningful words
   */
  private hasCommonWords(str1: string, str2: string): boolean {
    const words1 = this.extractKeywords(str1);
    const words2 = this.extractKeywords(str2);
    
    return words1.some(w1 => words2.some(w2 => 
      w1.includes(w2) || w2.includes(w1)
    ));
  }
  
  /**
   * Semantic matching for common task patterns
   */
  private semanticMatch(metadata: NodeMetadata, task: string): number {
    const taskLower = task.toLowerCase();
    let score = 0;
    
    // HTTP/API patterns
    if ((taskLower.includes('http') || taskLower.includes('api') || 
         taskLower.includes('rest') || taskLower.includes('fetch')) &&
        metadata.name === 'httpRequest') {
      score += 0.5;
    }
    
    // Data validation patterns
    if ((taskLower.includes('validat') || taskLower.includes('check') ||
         taskLower.includes('verify')) &&
        metadata.name === 'validateData') {
      score += 0.4;
    }
    
    // Human interaction patterns
    if ((taskLower.includes('user') || taskLower.includes('human') ||
         taskLower.includes('approve') || taskLower.includes('input')) &&
        metadata.type === 'human') {
      score += 0.3;
    }
    
    // Control flow patterns
    if ((taskLower.includes('loop') || taskLower.includes('repeat') ||
         taskLower.includes('condition') || taskLower.includes('branch')) &&
        metadata.type === 'control') {
      score += 0.3;
    }
    
    // Delay/wait patterns
    if ((taskLower.includes('wait') || taskLower.includes('delay') ||
         taskLower.includes('pause')) &&
        metadata.name === 'delay') {
      score += 0.5;
    }
    
    return score;
  }
  
  /**
   * Generate a contextual example for the matched node
   */
  private generateContextualExample(metadata: NodeMetadata, task: string): string {
    // Generate examples based on the task and node combination
    const examples: Record<string, (task: string) => string> = {
      httpRequest: (t) => `Use httpRequest to ${t} with config: { url: "https://api.example.com", method: "GET" }`,
      validateData: (t) => `Use validateData to ${t} with a JSON schema`,
      setData: (t) => `Use setData to store the results of "${t}" in the workflow state`,
      checkValue: (t) => `Use checkValue to verify conditions after "${t}"`,
      delay: (t) => `Use delay to pause execution while "${t}"`,
      approveExpense: (t) => `Use approveExpense for human approval in "${t}" workflow`
    };
    
    const generator = examples[metadata.name];
    if (generator) {
      return generator(task);
    }
    
    // Generic example
    return `Use ${metadata.name} node for: ${task}`;
  }
  
  /**
   * Format search results for output
   */
  private formatResults(matches: NodeMatch[], criteria: NodeSearchCriteria): any[] {
    return matches.map(match => ({
      name: match.metadata.name,
      type: match.metadata.type,
      description: match.metadata.description,
      score: Math.round(match.score * 100) / 100,
      matchReasons: match.matchReasons,
      usage: {
        purpose: match.metadata.ai_hints.purpose,
        whenToUse: match.metadata.ai_hints.when_to_use,
        expectedEdges: match.metadata.ai_hints.expected_edges,
        example: match.contextualExample || match.metadata.ai_hints.example_usage
      },
      toolName: `flowscript_${match.metadata.name}`
    }));
  }
  
  /**
   * Get suggestions when no nodes are found
   */
  private getSuggestion(task: string): string {
    const suggestions = [
      'Try using more specific keywords',
      'Check available node types with type filter',
      'Break down complex tasks into simpler operations',
      'Use the workflow composer for multi-step tasks'
    ];
    
    // Task-specific suggestions
    if (task.includes('email')) {
      return 'Email functionality might require custom nodes. Try "httpRequest" for email APIs.';
    }
    
    if (task.includes('database') || task.includes('sql')) {
      return 'Database operations might need custom nodes. Consider using httpRequest for REST APIs.';
    }
    
    return suggestions[Math.floor(Math.random() * suggestions.length)];
  }
  
  /**
   * Get available node types for suggestions
   */
  private getAvailableNodeTypes(): Record<string, string[]> {
    const types: Record<string, string[]> = {
      action: [],
      human: [],
      control: []
    };
    
    const allMetadata = this.nodeRegistry.getAllMetadata();
    for (const metadata of allMetadata) {
      if (metadata.type && types[metadata.type]) {
        types[metadata.type].push(metadata.name);
      }
    }
    
    return types;
  }
}