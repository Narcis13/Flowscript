#!/usr/bin/env node

import { Command } from 'commander';
import { runCommand } from './commands/run';
import { validateCommand } from './commands/validate';
import { listCommand } from './commands/list';

const program = new Command();

program
  .name('flowscript')
  .description('CLI tool for FlowScript workflow management')
  .version('0.1.0');

program
  .command('run <workflow>')
  .description('Execute a workflow from file')
  .option('-i, --input <data>', 'Initial input data (JSON string)')
  .option('-w, --watch', 'Watch for human interactions')
  .action(runCommand);

program
  .command('validate <workflow>')
  .description('Validate workflow syntax and structure')
  .option('-v, --verbose', 'Show detailed validation output')
  .action(validateCommand);

program
  .command('list')
  .description('List available workflows')
  .option('-d, --directory <dir>', 'Workflow directory', './workflows')
  .action(listCommand);

program.parse();