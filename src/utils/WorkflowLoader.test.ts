/**
 * Tests for WorkflowLoader
 */

import { WorkflowLoader } from './WorkflowLoader';
import { WorkflowDefinition } from '../core/types/workflow';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
jest.mock('fs/promises');

describe('WorkflowLoader', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadWorkflow', () => {
    it('should load and validate a valid workflow', async () => {
      const validWorkflow: WorkflowDefinition = {
        id: 'test-workflow',
        name: 'Test Workflow',
        initialState: { count: 0 },
        nodes: ['node1', 'node2']
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(validWorkflow));

      const loader = new WorkflowLoader();
      const result = await loader.loadWorkflow('test.json');

      expect(result.workflow).toEqual(validWorkflow);
      expect(result.validation?.valid).toBe(true);
      expect(result.filePath).toContain('test.json');
    });

    it('should throw on invalid JSON', async () => {
      mockFs.readFile.mockResolvedValue('invalid json');

      const loader = new WorkflowLoader();
      
      await expect(loader.loadWorkflow('invalid.json')).rejects.toMatchObject({
        type: 'parse',
        filePath: expect.stringContaining('invalid.json')
      });
    });

    it('should throw on validation failure', async () => {
      const invalidWorkflow = {
        // Missing required fields
        nodes: ['node1']
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(invalidWorkflow));

      const loader = new WorkflowLoader();
      
      await expect(loader.loadWorkflow('invalid.json')).rejects.toMatchObject({
        type: 'validation',
        filePath: expect.stringContaining('invalid.json')
      });
    });

    it('should skip validation when validate is false', async () => {
      const invalidWorkflow = {
        nodes: ['node1']
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(invalidWorkflow));

      const loader = new WorkflowLoader();
      const result = await loader.loadWorkflow('test.json', { validate: false });

      expect(result.workflow).toEqual(invalidWorkflow);
      expect(result.validation).toBeUndefined();
    });
  });

  describe('loadDirectory', () => {
    it('should load all JSON files from directory', async () => {
      const workflow1: WorkflowDefinition = {
        id: 'workflow1',
        name: 'Workflow 1',
        initialState: {},
        nodes: []
      };

      const workflow2: WorkflowDefinition = {
        id: 'workflow2',
        name: 'Workflow 2',
        initialState: {},
        nodes: []
      };

      mockFs.readdir.mockResolvedValue([
        { name: 'workflow1.json', isFile: () => true, isDirectory: () => false },
        { name: 'workflow2.json', isFile: () => true, isDirectory: () => false },
        { name: 'readme.txt', isFile: () => true, isDirectory: () => false },
        { name: 'subdir', isFile: () => false, isDirectory: () => true }
      ] as any);

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(workflow1))
        .mockResolvedValueOnce(JSON.stringify(workflow2));

      const loader = new WorkflowLoader();
      const result = await loader.loadDirectory('examples');

      expect(result.workflows).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.workflows[0].workflow.id).toBe('workflow1');
      expect(result.workflows[1].workflow.id).toBe('workflow2');
    });

    it('should collect errors for invalid files', async () => {
      mockFs.readdir.mockResolvedValue([
        { name: 'valid.json', isFile: () => true, isDirectory: () => false },
        { name: 'invalid.json', isFile: () => true, isDirectory: () => false }
      ] as any);

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify({
          id: 'valid',
          name: 'Valid',
          initialState: {},
          nodes: []
        }))
        .mockResolvedValueOnce('invalid json');

      const loader = new WorkflowLoader();
      const result = await loader.loadDirectory('examples');

      expect(result.workflows).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('parse');
    });
  });

  describe('validateWorkflow', () => {
    it('should validate a correct workflow', () => {
      const workflow: WorkflowDefinition = {
        id: 'test',
        name: 'Test',
        initialState: {},
        nodes: ['node1', { node2: { config: true } }]
      };

      const result = WorkflowLoader.validateWorkflow(workflow);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.validated).toBeDefined();
    });

    it('should return errors for invalid workflow', () => {
      const workflow = {
        // Missing id and name
        nodes: []
      };

      const result = WorkflowLoader.validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.validated).toBeUndefined();
    });

    it('should validate complex workflow structures', () => {
      const workflow: WorkflowDefinition = {
        id: 'complex',
        name: 'Complex Workflow',
        initialState: { items: [] },
        nodes: [
          'initNode',
          [
            'conditionNode',
            {
              'true': 'processNode',
              'false': ['errorNode', 'cleanupNode']
            }
          ],
          [
            { forEach: { items: '$.items' } },
            [
              'processItem',
              'updateProgress'
            ]
          ]
        ]
      };

      const result = WorkflowLoader.validateWorkflow(workflow);

      expect(result.valid).toBe(true);
    });
  });

  describe('listWorkflows', () => {
    it('should list all workflow files recursively', async () => {
      // Mock directory structure
      mockFs.readdir
        .mockResolvedValueOnce([
          { name: 'workflow1.json', isFile: () => true, isDirectory: () => false },
          { name: 'subdir', isFile: () => false, isDirectory: () => true },
          { name: 'readme.md', isFile: () => true, isDirectory: () => false }
        ] as any)
        .mockResolvedValueOnce([
          { name: 'workflow2.json', isFile: () => true, isDirectory: () => false }
        ] as any);

      const loader = new WorkflowLoader();
      const files = await loader.listWorkflows();

      expect(files).toEqual([
        'workflow1.json',
        path.join('subdir', 'workflow2.json')
      ]);
    });
  });

  describe('saveWorkflow', () => {
    it('should save a valid workflow', async () => {
      const workflow: WorkflowDefinition = {
        id: 'new-workflow',
        name: 'New Workflow',
        initialState: {},
        nodes: ['node1']
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const loader = new WorkflowLoader();
      await loader.saveWorkflow(workflow, 'new.json');

      expect(mockFs.mkdir).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('new.json'),
        JSON.stringify(workflow, null, 2),
        'utf-8'
      );
    });

    it('should throw on invalid workflow', async () => {
      const invalidWorkflow = {
        nodes: []
      } as any;

      const loader = new WorkflowLoader();
      
      await expect(loader.saveWorkflow(invalidWorkflow, 'invalid.json'))
        .rejects.toThrow('Invalid workflow');
    });
  });
});