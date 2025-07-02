/**
 * WorkflowStorage - Simple in-memory storage for workflow definitions
 */

import { WorkflowDefinition } from '../../core/types/workflow';

/**
 * Workflow storage service
 */
export class WorkflowStorage {
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private static instance: WorkflowStorage;

  /**
   * Get singleton instance
   */
  static getInstance(): WorkflowStorage {
    if (!WorkflowStorage.instance) {
      WorkflowStorage.instance = new WorkflowStorage();
    }
    return WorkflowStorage.instance;
  }

  /**
   * Register a workflow definition
   */
  registerWorkflow(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow);
  }

  /**
   * Get workflow by ID
   */
  getWorkflow(workflowId: string): WorkflowDefinition | null {
    return this.workflows.get(workflowId) || null;
  }

  /**
   * Get all workflow IDs
   */
  getAllWorkflowIds(): string[] {
    return Array.from(this.workflows.keys());
  }

  /**
   * Delete a workflow
   */
  deleteWorkflow(workflowId: string): boolean {
    return this.workflows.delete(workflowId);
  }

  /**
   * Clear all workflows
   */
  clear(): void {
    this.workflows.clear();
  }

  /**
   * Load example workflows
   */
  loadExampleWorkflows(): void {
    // Example 1: Simple approval workflow
    this.registerWorkflow({
      id: 'simple-approval',
      name: 'Simple Approval Workflow',
      initialState: {
        requestId: null,
        approved: false,
        approver: null
      },
      nodes: [
        'validateRequest',
        [
          'checkAmount',
          {
            'under100': 'autoApprove',
            'over100': 'requestApproval'
          }
        ],
        'requestApproval',
        [
          'requestApproval',
          {
            'approved': 'processRequest',
            'rejected': 'notifyRejection'
          }
        ],
        'finalizeRequest'
      ]
    });

    // Example 2: Data processing workflow
    this.registerWorkflow({
      id: 'data-processing',
      name: 'Data Processing Pipeline',
      initialState: {
        items: [],
        processed: 0,
        errors: 0
      },
      nodes: [
        { 'setData': { path: '$.items', value: [1, 2, 3, 4, 5] } },
        [
          { 'forEach': { items: '$.items', as: 'currentItem' } },
          [
            'validateItem',
            [
              'validateItem',
              {
                'valid': 'processItem',
                'invalid': 'logError'
              }
            ],
            'updateProgress'
          ]
        ],
        'generateReport'
      ]
    });

    // Example 3: Multi-step form workflow
    this.registerWorkflow({
      id: 'multi-step-form',
      name: 'Multi-Step Form Process',
      initialState: {
        step: 1,
        formData: {
          personalInfo: {},
          businessInfo: {},
          documents: []
        }
      },
      nodes: [
        'collectPersonalInfo',
        'validatePersonalInfo',
        'collectBusinessInfo', 
        'validateBusinessInfo',
        'uploadDocuments',
        'reviewSubmission',
        [
          'reviewSubmission',
          {
            'approved': 'submitApplication',
            'needsRevision': 'requestRevisions',
            'rejected': 'notifyRejection'
          }
        ],
        'confirmSubmission'
      ]
    });

    // Example 4: Retry with backoff workflow
    this.registerWorkflow({
      id: 'retry-workflow',
      name: 'API Call with Retry',
      initialState: {
        attempts: 0,
        maxAttempts: 3,
        backoffMs: 1000,
        result: null
      },
      nodes: [
        [
          { 'whileCondition': { condition: '$.attempts < $.maxAttempts' } },
          [
            'callExternalAPI',
            [
              'checkAPIResult',
              {
                'success': 'exit',
                'failure': [
                  { 'delay': { ms: '$.backoffMs' } },
                  { 'setData': { 
                    path: '$.attempts', 
                    value: '$.attempts + 1' 
                  } },
                  { 'setData': { 
                    path: '$.backoffMs', 
                    value: '$.backoffMs * 2' 
                  } }
                ]
              }
            ]
          ]
        ],
        'handleFinalResult'
      ]
    });
  }
}