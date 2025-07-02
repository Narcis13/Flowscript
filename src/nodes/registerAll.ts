/**
 * Register all available nodes with the NodeRegistry
 */

import { getNodeRegistry } from './registry';

// Import all action nodes
import { validateData } from './actions/validateData';
import { setData } from './actions/setData';
import { httpRequest } from './actions/httpRequest';
import { delay } from './actions/delay';
import { checkValue } from './actions/checkValue';
import { fetchData } from './actions/fetchData';
import { processData } from './actions/processData';
import { saveResults } from './actions/saveResults';
import { initializePipeline } from './actions/initializePipeline';
import { generateReport } from './actions/generateReport';
import { sendNotifications } from './actions/sendNotifications';
import { incrementCounter } from './actions/incrementCounter';
import { setFlag } from './actions/setFlag';
import { logError } from './actions/logError';

// Import all control nodes
import { whileCondition } from './controls/whileCondition';
import { forEach } from './controls/forEach';

// Import all human nodes
import { approveExpense } from './human/approveExpense';
import { formInput } from './human/formInput';
import { reviewData } from './human/reviewData';

/**
 * Register all nodes with the global registry
 */
export function registerAllNodes(): void {
  const registry = getNodeRegistry();
  
  // Clear existing registrations to avoid duplicates
  registry.clear();
  
  // Register action nodes
  registry.registerInstance(validateData);
  registry.registerInstance(setData);
  registry.registerInstance(httpRequest);
  registry.registerInstance(delay);
  registry.registerInstance(checkValue);
  registry.registerInstance(fetchData);
  registry.registerInstance(processData);
  registry.registerInstance(saveResults);
  registry.registerInstance(initializePipeline);
  registry.registerInstance(generateReport);
  registry.registerInstance(sendNotifications);
  registry.registerInstance(incrementCounter);
  registry.registerInstance(setFlag);
  registry.registerInstance(logError);
  
  // Register control nodes
  registry.registerInstance(whileCondition);
  registry.registerInstance(forEach);
  
  // Register human nodes
  registry.registerInstance(approveExpense);
  registry.registerInstance(formInput);
  registry.registerInstance(reviewData);
}

/**
 * Convenience function to ensure nodes are registered
 */
export function ensureNodesRegistered(): void {
  const registry = getNodeRegistry();
  
  // Only register if the registry is empty
  if (registry.getAllNodeNames().length === 0) {
    registerAllNodes();
  }
}