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
import { initializeGame, checkGuess, displayResults } from './actions/gameLogic';

// Import all control nodes
import { whileCondition } from './controls/whileCondition';
import { forEach } from './controls/forEach';

// Import all human nodes
import { approveExpense } from './human/approveExpense';
import { formInput } from './human/formInput';
import { reviewData } from './human/reviewData';
import { googleConnect } from './custom/google/gmail/googleConnect';
import { listEmails } from './custom/google/gmail/listEmails';
import { sendEmail } from './custom/google/gmail/sendEmail';
import { getEmail } from './custom/google/gmail/getEmail';
import { deleteEmail } from './custom/google/gmail/deleteEmail';
import { markAsRead } from './custom/google/gmail/markAsRead';
import { markAsUnread } from './custom/google/gmail/markAsUnread';
import { searchEmails } from './custom/google/gmail/searchEmails';

// Import Google Drive nodes
import { listFiles } from './custom/google/gdrive/listFiles';
import { uploadFile } from './custom/google/gdrive/uploadFile';
import { downloadFile } from './custom/google/gdrive/downloadFile';
import { createFolder } from './custom/google/gdrive/createFolder';
import { deleteFile } from './custom/google/gdrive/deleteFile';
import { shareFile } from './custom/google/gdrive/shareFile';
import { searchFiles } from './custom/google/gdrive/searchFiles';
import { getFileMetadata } from './custom/google/gdrive/getFileMetadata';

// Import Google Sheets nodes
import { createSpreadsheet } from './custom/google/sheets/createSpreadsheet';
import { readRange } from './custom/google/sheets/readRange';
import { writeRange } from './custom/google/sheets/writeRange';
import { appendRows } from './custom/google/sheets/appendRows';
import { updateCell } from './custom/google/sheets/updateCell';
import { clearRange } from './custom/google/sheets/clearRange';
import { addSheet } from './custom/google/sheets/addSheet';
import { deleteSheet } from './custom/google/sheets/deleteSheet';
import { getSheetMetadata } from './custom/google/sheets/getSheetMetadata';
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
  registry.registerInstance(initializeGame);
  registry.registerInstance(checkGuess);
  registry.registerInstance(displayResults);
  
  // Register control nodes
  registry.registerInstance(whileCondition);
  registry.registerInstance(forEach);
  
  // Register human nodes
  registry.registerInstance(approveExpense);
  registry.registerInstance(formInput);
  registry.registerInstance(reviewData);
  
  // Register Google/Gmail nodes
  registry.registerInstance(googleConnect);
  registry.registerInstance(listEmails);
  registry.registerInstance(sendEmail);
  registry.registerInstance(getEmail);
  registry.registerInstance(deleteEmail);
  registry.registerInstance(markAsRead);
  registry.registerInstance(markAsUnread);
  registry.registerInstance(searchEmails);
  
  // Register Google Drive nodes
  registry.registerInstance(listFiles);
  registry.registerInstance(uploadFile);
  registry.registerInstance(downloadFile);
  registry.registerInstance(createFolder);
  registry.registerInstance(deleteFile);
  registry.registerInstance(shareFile);
  registry.registerInstance(searchFiles);
  registry.registerInstance(getFileMetadata);
  
  // Register Google Sheets nodes
  registry.registerInstance(createSpreadsheet);
  registry.registerInstance(readRange);
  registry.registerInstance(writeRange);
  registry.registerInstance(appendRows);
  registry.registerInstance(updateCell);
  registry.registerInstance(clearRange);
  registry.registerInstance(addSheet);
  registry.registerInstance(deleteSheet);
  registry.registerInstance(getSheetMetadata);
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