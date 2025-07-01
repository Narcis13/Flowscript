/**
 * Context-related type definitions
 */

import { StateManager } from '../state';
import { RuntimeContext } from '../runtime';

/**
 * Represents the execution context passed to nodes
 */
export interface ExecutionContext {
  /** Current workflow state */
  state: StateManager;
  
  /** Node-specific configuration */
  config?: Record<string, any>;
  
  /** Runtime context for advanced interactions */
  runtime: RuntimeContext;
  
  /** Previous node's output data */
  previousData?: any;
}