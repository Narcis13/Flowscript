/**
 * PauseToken implementation for HITL support
 */

/**
 * Represents a pause token for workflow execution
 */
export class PauseToken {
  private static _counter = 0;
  private _resolved: boolean = false;
  private _resolvePromise?: (value: any) => void;
  private _rejectPromise?: (reason: any) => void;
  private _promise: Promise<any>;
  private _resumeData?: any;
  private _uniqueId: string;

  constructor(
    public readonly workflowId: string,
    public readonly executionId: string,
    public readonly nodeId: string,
    public readonly timestamp: number = Date.now()
  ) {
    // Create a promise that will be resolved when resume is called
    this._promise = new Promise((resolve, reject) => {
      this._resolvePromise = resolve;
      this._rejectPromise = reject;
    });
    
    // Generate unique ID with counter
    this._uniqueId = `${this.executionId}-${this.nodeId}-${this.timestamp}-${++PauseToken._counter}`;
  }

  /**
   * Get the unique identifier for this pause token
   */
  get id(): string {
    return this._uniqueId;
  }

  /**
   * Check if the token has been resolved
   */
  get isResolved(): boolean {
    return this._resolved;
  }

  /**
   * Get the resume data if available
   */
  get resumeData(): any {
    return this._resumeData;
  }

  /**
   * Wait for the token to be resumed
   */
  async wait(): Promise<any> {
    return this._promise;
  }

  /**
   * Resume the execution with data
   */
  resume(data: any): void {
    if (this._resolved) {
      throw new Error(`PauseToken ${this.id} has already been resolved`);
    }

    this._resolved = true;
    this._resumeData = data;
    
    if (this._resolvePromise) {
      this._resolvePromise(data);
    }
  }

  /**
   * Reject the token with an error
   */
  reject(error: Error | string): void {
    if (this._resolved) {
      throw new Error(`PauseToken ${this.id} has already been resolved`);
    }

    this._resolved = true;
    
    if (this._rejectPromise) {
      this._rejectPromise(error instanceof Error ? error : new Error(error));
    }
  }

  /**
   * Cancel the token (reject with cancellation error)
   */
  cancel(): void {
    this.reject(new Error('Execution cancelled'));
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): object {
    return {
      id: this.id,
      workflowId: this.workflowId,
      executionId: this.executionId,
      nodeId: this.nodeId,
      timestamp: this.timestamp,
      isResolved: this._resolved,
      resumeData: this._resumeData
    };
  }
}