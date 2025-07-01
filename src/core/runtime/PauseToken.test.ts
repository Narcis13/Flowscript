/**
 * Tests for PauseToken
 */

import { PauseToken } from './PauseToken';

describe('PauseToken', () => {
  const workflowId = 'test-workflow';
  const executionId = 'exec-123';
  const nodeId = 'node-456';

  describe('constructor', () => {
    it('should create a pause token with correct properties', () => {
      const token = new PauseToken(workflowId, executionId, nodeId);

      expect(token.workflowId).toBe(workflowId);
      expect(token.executionId).toBe(executionId);
      expect(token.nodeId).toBe(nodeId);
      expect(token.timestamp).toBeDefined();
      expect(token.isResolved).toBe(false);
    });

    it('should generate unique ID', () => {
      const token1 = new PauseToken(workflowId, executionId, nodeId);
      const token2 = new PauseToken(workflowId, executionId, nodeId);

      expect(token1.id).not.toBe(token2.id);
    });
  });

  describe('resume', () => {
    it('should resolve the token with data', async () => {
      const token = new PauseToken(workflowId, executionId, nodeId);
      const resumeData = { decision: 'approved', comment: 'Looks good' };

      const waitPromise = token.wait();
      token.resume(resumeData);

      const result = await waitPromise;
      expect(result).toEqual(resumeData);
      expect(token.isResolved).toBe(true);
      expect(token.resumeData).toEqual(resumeData);
    });

    it('should throw if token is already resolved', () => {
      const token = new PauseToken(workflowId, executionId, nodeId);
      token.resume({ data: 'first' });

      expect(() => token.resume({ data: 'second' })).toThrow('already been resolved');
    });
  });

  describe('reject', () => {
    it('should reject the token with error', async () => {
      const token = new PauseToken(workflowId, executionId, nodeId);
      const error = new Error('Test error');

      const waitPromise = token.wait();
      token.reject(error);

      await expect(waitPromise).rejects.toThrow('Test error');
      expect(token.isResolved).toBe(true);
    });

    it('should convert string to error', async () => {
      const token = new PauseToken(workflowId, executionId, nodeId);

      const waitPromise = token.wait();
      token.reject('String error');

      await expect(waitPromise).rejects.toThrow('String error');
    });
  });

  describe('cancel', () => {
    it('should reject with cancellation error', async () => {
      const token = new PauseToken(workflowId, executionId, nodeId);

      const waitPromise = token.wait();
      token.cancel();

      await expect(waitPromise).rejects.toThrow('Execution cancelled');
    });
  });

  describe('toJSON', () => {
    it('should serialize token to JSON', () => {
      const token = new PauseToken(workflowId, executionId, nodeId, 1234567890);
      const json = token.toJSON();

      expect(json).toEqual({
        id: token.id,
        workflowId: workflowId,
        executionId: executionId,
        nodeId: nodeId,
        timestamp: 1234567890,
        isResolved: false,
        resumeData: undefined
      });
    });

    it('should include resume data if resolved', () => {
      const token = new PauseToken(workflowId, executionId, nodeId);
      const resumeData = { test: 'data' };
      token.resume(resumeData);

      const json = token.toJSON();
      expect(json).toMatchObject({
        isResolved: true,
        resumeData: resumeData
      });
    });
  });
});