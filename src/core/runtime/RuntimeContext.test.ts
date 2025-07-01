/**
 * Tests for RuntimeContext
 */

import { EventEmitter } from 'events';
import { RuntimeContextImpl } from './RuntimeContext';
import { WorkflowEvent } from '../types/events';

describe('RuntimeContext', () => {
  let eventEmitter: EventEmitter;
  let runtime: RuntimeContextImpl;
  const workflowId = 'test-workflow';
  const executionId = 'exec-123';

  beforeEach(() => {
    eventEmitter = new EventEmitter();
    runtime = new RuntimeContextImpl(workflowId, executionId, eventEmitter);
  });

  describe('constructor', () => {
    it('should create runtime context with correct properties', () => {
      expect(runtime.workflowId).toBe(workflowId);
      expect(runtime.executionId).toBe(executionId);
    });
  });

  describe('emit', () => {
    it('should emit workflow events', (done) => {
      const eventData = {
        event: WorkflowEvent.NODE_EXECUTING,
        workflowId: workflowId,
        executionId: executionId,
        timestamp: Date.now(),
        data: { nodeId: 'test-node' }
      };

      eventEmitter.on(WorkflowEvent.NODE_EXECUTING, (event) => {
        expect(event).toEqual(eventData);
        done();
      });

      runtime.emit(eventData);
    });

    it('should emit to general workflow:event listener', (done) => {
      const eventData = {
        event: WorkflowEvent.NODE_COMPLETED,
        workflowId: workflowId,
        executionId: executionId,
        timestamp: Date.now(),
        data: { result: 'success' }
      };

      eventEmitter.on('workflow:event', (event) => {
        expect(event).toEqual(eventData);
        done();
      });

      runtime.emit(eventData);
    });

    it('should add missing fields to event', (done) => {
      eventEmitter.on('workflow:event', (event) => {
        expect(event.workflowId).toBe(workflowId);
        expect(event.executionId).toBe(executionId);
        expect(event.timestamp).toBeDefined();
        done();
      });

      runtime.emit({
        event: WorkflowEvent.STATE_UPDATED,
        workflowId: '',
        executionId: '',
        timestamp: 0,
        data: {}
      });
    });
  });

  describe('pause and waitForResume', () => {
    beforeEach(() => {
      runtime.setCurrentNode('test-node');
    });

    it('should create pause token and wait for resume', async () => {
      const pausePromise = new Promise((resolve) => {
        eventEmitter.on(WorkflowEvent.WORKFLOW_PAUSED, (event) => {
          expect(event.data.nodeId).toBe('test-node');
          resolve(event);
        });
      });

      const token = runtime.pause();
      await pausePromise;

      expect(token.nodeId).toBe('test-node');
      expect(runtime.isPaused()).toBe(true);

      // Resume in next tick
      const resumeData = { decision: 'continue' };
      setTimeout(() => runtime.resume(token.id, resumeData), 0);

      const result = await runtime.waitForResume(token);
      expect(result).toEqual(resumeData);
      expect(runtime.isPaused()).toBe(false);
    });

    it('should emit resume event', async () => {
      const token = runtime.pause();

      const resumePromise = new Promise((resolve) => {
        eventEmitter.on(WorkflowEvent.WORKFLOW_RESUMED, (event) => {
          expect(event.data.nodeId).toBe('test-node');
          expect(event.data.resumeData).toEqual({ decision: 'approved' });
          resolve(event);
        });
      });

      setTimeout(() => runtime.resume(token.id, { decision: 'approved' }), 0);
      
      await runtime.waitForResume(token);
      await resumePromise;
    });

    it('should throw if no current node is set', () => {
      const rt = new RuntimeContextImpl(workflowId, executionId, eventEmitter);
      expect(() => rt.pause()).toThrow('no current node ID');
    });

    it('should validate token belongs to execution', async () => {
      const otherRuntime = new RuntimeContextImpl('other-workflow', 'other-exec', eventEmitter);
      otherRuntime.setCurrentNode('other-node');
      const otherToken = otherRuntime.pause();

      await expect(runtime.waitForResume(otherToken)).rejects.toThrow('does not belong to this execution');
    });

    it('should handle multiple pause tokens', () => {
      runtime.setCurrentNode('node1');
      const token1 = runtime.pause();

      runtime.setCurrentNode('node2');
      const token2 = runtime.pause();

      expect(runtime.getActivePauseTokens()).toHaveLength(2);
      expect(runtime.isPaused()).toBe(true);

      runtime.resume(token1.id, {});
      expect(runtime.getActivePauseTokens()).toHaveLength(1);

      runtime.resume(token2.id, {});
      expect(runtime.getActivePauseTokens()).toHaveLength(0);
      expect(runtime.isPaused()).toBe(false);
    });
  });

  describe('cancel', () => {
    it('should cancel pause token', async () => {
      runtime.setCurrentNode('test-node');
      const token = runtime.pause();

      runtime.cancel(token.id);

      await expect(runtime.waitForResume(token)).rejects.toThrow('Execution cancelled');
      expect(runtime.isPaused()).toBe(false);
    });

    it('should throw if token not found', () => {
      expect(() => runtime.cancel('non-existent')).toThrow('Token not found');
    });
  });

  describe('clearPauseTokens', () => {
    it('should cancel all active tokens', () => {
      runtime.setCurrentNode('node1');
      const token1 = runtime.pause();

      runtime.setCurrentNode('node2');
      const token2 = runtime.pause();

      runtime.clearPauseTokens();

      expect(runtime.isPaused()).toBe(false);
      expect(token1.isResolved).toBe(true);
      expect(token2.isResolved).toBe(true);
    });
  });
});