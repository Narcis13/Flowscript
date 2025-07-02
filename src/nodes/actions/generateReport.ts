import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';

export class GenerateReportNode implements Node {
  metadata: NodeMetadata = {
    name: 'generateReport',
    description: 'Generate workflow execution reports in various formats',
    type: 'action',
    ai_hints: {
      purpose: 'Report generation and workflow summary',
      when_to_use: 'When you need to create reports about workflow execution, metrics, or results',
      expected_edges: ['success', 'error']
    }
  };
  
  async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
    const { 
      reportType = 'summary',
      format = 'json',
      includeMetrics = true,
      includeErrors = true,
      includeState = false,
      outputPath,
      customTemplate
    } = context.config || {};
    
    try {
      let report: any = {};
      
      // Basic pipeline information
      const pipelineInfo = context.state.get('pipeline');
      if (pipelineInfo) {
        report.pipeline = {
          id: pipelineInfo.id,
          startTime: pipelineInfo.startTime,
          endTime: new Date().toISOString(),
          status: pipelineInfo.status,
          metadata: pipelineInfo.metadata
        };
      }
      
      // Add metrics if requested
      if (includeMetrics) {
        const metrics = context.state.get('pipeline.metrics');
        if (metrics) {
          const duration = Date.now() - metrics.startTime;
          report.metrics = {
            ...metrics,
            duration,
            averageProcessingTime: metrics.itemsProcessed > 0 
              ? duration / metrics.itemsProcessed 
              : 0
          };
        }
      }
      
      // Add errors and warnings if requested
      if (includeErrors) {
        report.errors = context.state.get('pipeline.errors') || [];
        report.warnings = context.state.get('pipeline.warnings') || [];
        report.errorCount = report.errors.length;
        report.warningCount = report.warnings.length;
      }
      
      // Add full state if requested (be careful with large states)
      if (includeState) {
        report.finalState = context.state.get('$');
      }
      
      // Generate report based on type
      switch (reportType) {
        case 'summary':
          // Already built above
          break;
          
        case 'detailed':
          // Add more detailed information
          report.executionDetails = {
            nodesExecuted: context.state.get('pipeline.nodesExecuted') || [],
            branchesEntered: context.state.get('pipeline.branchesEntered') || [],
            loopsCompleted: context.state.get('pipeline.loopsCompleted') || 0
          };
          break;
          
        case 'custom':
          if (customTemplate) {
            // Apply custom template logic
            report = applyCustomTemplate(report, customTemplate, context.state);
          }
          break;
          
        default:
          throw new Error(`Unknown report type: ${reportType}`);
      }
      
      // Format the report
      let formattedReport: string;
      switch (format) {
        case 'json':
          formattedReport = JSON.stringify(report, null, 2);
          break;
          
        case 'text':
          formattedReport = generateTextReport(report);
          break;
          
        case 'html':
          formattedReport = generateHtmlReport(report);
          break;
          
        case 'csv':
          formattedReport = generateCsvReport(report);
          break;
          
        default:
          throw new Error(`Unknown format: ${format}`);
      }
      
      // Save to state if outputPath is provided
      if (outputPath) {
        context.state.set(outputPath, formattedReport);
      }
      
      return {
        success: () => ({
          report: format === 'json' ? report : formattedReport,
          format,
          reportType,
          timestamp: new Date().toISOString()
        })
      };
    } catch (error) {
      return {
        error: () => ({
          error: error instanceof Error ? error.message : 'Unknown error',
          reportType,
          format
        })
      };
    }
  }
}

function applyCustomTemplate(report: any, template: any, state: any): any {
  // Simple template application - can be enhanced
  const customReport: any = {};
  
  for (const [key, path] of Object.entries(template)) {
    if (typeof path === 'string') {
      customReport[key] = state.get(path);
    } else {
      customReport[key] = path;
    }
  }
  
  return { ...report, custom: customReport };
}

function generateTextReport(report: any): string {
  const lines: string[] = [];
  
  lines.push('=== Workflow Execution Report ===');
  lines.push('');
  
  if (report.pipeline) {
    lines.push(`Pipeline ID: ${report.pipeline.id}`);
    lines.push(`Status: ${report.pipeline.status}`);
    lines.push(`Start Time: ${report.pipeline.startTime}`);
    lines.push(`End Time: ${report.pipeline.endTime}`);
    lines.push('');
  }
  
  if (report.metrics) {
    lines.push('Metrics:');
    lines.push(`  Items Processed: ${report.metrics.itemsProcessed}`);
    lines.push(`  Duration: ${report.metrics.duration}ms`);
    lines.push(`  Average Processing Time: ${report.metrics.averageProcessingTime.toFixed(2)}ms`);
    lines.push('');
  }
  
  if (report.errorCount !== undefined) {
    lines.push(`Errors: ${report.errorCount}`);
    lines.push(`Warnings: ${report.warningCount}`);
    
    if (report.errors.length > 0) {
      lines.push('');
      lines.push('Error Details:');
      report.errors.forEach((error: any, index: number) => {
        lines.push(`  ${index + 1}. ${error.message || error}`);
      });
    }
  }
  
  return lines.join('\n');
}

function generateHtmlReport(report: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Workflow Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    .section { margin: 20px 0; padding: 10px; background: #f5f5f5; }
    .metric { margin: 5px 0; }
    .error { color: #d00; }
    .warning { color: #f90; }
  </style>
</head>
<body>
  <h1>Workflow Execution Report</h1>
  ${report.pipeline ? `
  <div class="section">
    <h2>Pipeline Information</h2>
    <div class="metric">ID: ${report.pipeline.id}</div>
    <div class="metric">Status: ${report.pipeline.status}</div>
    <div class="metric">Duration: ${report.pipeline.startTime} - ${report.pipeline.endTime}</div>
  </div>
  ` : ''}
  ${report.metrics ? `
  <div class="section">
    <h2>Metrics</h2>
    <div class="metric">Items Processed: ${report.metrics.itemsProcessed}</div>
    <div class="metric">Total Duration: ${report.metrics.duration}ms</div>
  </div>
  ` : ''}
  ${report.errorCount !== undefined ? `
  <div class="section">
    <h2>Issues</h2>
    <div class="metric error">Errors: ${report.errorCount}</div>
    <div class="metric warning">Warnings: ${report.warningCount}</div>
  </div>
  ` : ''}
</body>
</html>`;
}

function generateCsvReport(report: any): string {
  const rows: string[] = [];
  
  // Header
  rows.push('Category,Metric,Value');
  
  if (report.pipeline) {
    rows.push(`Pipeline,ID,${report.pipeline.id}`);
    rows.push(`Pipeline,Status,${report.pipeline.status}`);
    rows.push(`Pipeline,Start Time,${report.pipeline.startTime}`);
    rows.push(`Pipeline,End Time,${report.pipeline.endTime}`);
  }
  
  if (report.metrics) {
    rows.push(`Metrics,Items Processed,${report.metrics.itemsProcessed}`);
    rows.push(`Metrics,Duration (ms),${report.metrics.duration}`);
    rows.push(`Metrics,Avg Processing Time (ms),${report.metrics.averageProcessingTime}`);
  }
  
  if (report.errorCount !== undefined) {
    rows.push(`Issues,Errors,${report.errorCount}`);
    rows.push(`Issues,Warnings,${report.warningCount}`);
  }
  
  return rows.join('\n');
}

// Export the node instance for direct use
export const generateReport = new GenerateReportNode();