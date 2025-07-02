import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';

export class LogErrorNode implements Node {
  metadata: NodeMetadata = {
    name: 'logError',
    description: 'Log errors and warnings to workflow state with tracking',
    type: 'action',
    ai_hints: {
      purpose: 'Error logging and tracking',
      when_to_use: 'When you need to capture and log errors, warnings, or debug information',
      expected_edges: ['success', 'error']
    }
  };
  
  async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
    const { 
      level = 'error',
      message,
      code,
      details,
      errorPath = 'pipeline.errors',
      warningPath = 'pipeline.warnings',
      debugPath = 'pipeline.debug',
      maxItems = 100,
      includeStackTrace = true,
      includeTimestamp = true,
      includeNodeInfo = true
    } = context.config || {};
    
    try {
      if (!message) {
        throw new Error('message is required for logging');
      }
      
      // Build log entry
      const logEntry: any = {
        message,
        level
      };
      
      if (code) {
        logEntry.code = code;
      }
      
      if (details) {
        logEntry.details = details;
      }
      
      if (includeTimestamp) {
        logEntry.timestamp = new Date().toISOString();
      }
      
      if (includeNodeInfo && context.runtime) {
        logEntry.nodeInfo = {
          workflowId: context.runtime.workflowId,
          executionId: context.runtime.executionId,
          nodeId: context.runtime.currentNodeId
        };
      }
      
      if (includeStackTrace && details instanceof Error) {
        logEntry.stackTrace = details.stack;
      }
      
      // Determine target path based on level
      let targetPath: string;
      switch (level) {
        case 'error':
          targetPath = errorPath;
          break;
        case 'warning':
        case 'warn':
          targetPath = warningPath;
          break;
        case 'debug':
        case 'info':
          targetPath = debugPath;
          break;
        default:
          targetPath = errorPath;
      }
      
      // Get current log array
      let logs = context.state.get(targetPath) || [];
      
      // Ensure it's an array
      if (!Array.isArray(logs)) {
        logs = [];
      }
      
      // Add new entry
      logs.push(logEntry);
      
      // Trim to max items (keep most recent)
      if (logs.length > maxItems) {
        logs = logs.slice(logs.length - maxItems);
      }
      
      // Update state
      context.state.set(targetPath, logs);
      
      // Update metrics
      const metricsPath = 'pipeline.metrics';
      const metrics = context.state.get(metricsPath) || {};
      
      switch (level) {
        case 'error':
          metrics.errorCount = (metrics.errorCount || 0) + 1;
          break;
        case 'warning':
        case 'warn':
          metrics.warningCount = (metrics.warningCount || 0) + 1;
          break;
      }
      
      metrics.lastLogTime = Date.now();
      context.state.set(metricsPath, metrics);
      
      // Emit event if runtime is available
      if (context.runtime && context.runtime.emit) {
        context.runtime.emit({
          event: 'LOG_ENTRY',
          workflowId: context.runtime.workflowId,
          executionId: context.runtime.executionId,
          timestamp: Date.now(),
          data: {
            level,
            message,
            code
          }
        });
      }
      
      return {
        success: () => ({
          logged: true,
          level,
          message,
          targetPath,
          totalLogs: logs.length
        })
      };
    } catch (error) {
      return {
        error: () => ({
          error: error instanceof Error ? error.message : 'Unknown error',
          originalMessage: message,
          level
        })
      };
    }
  }
}

// Export the node instance for direct use
export const logError = new LogErrorNode();