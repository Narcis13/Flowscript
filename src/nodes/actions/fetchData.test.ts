import { fetchData } from './fetchData';
import { ExecutionContext } from '../../core/types';
import { StateManager } from '../../core/state';
import { RuntimeContextImpl } from '../../core/runtime';
import { EventEmitter } from 'events';

describe('fetchData node', () => {
  let context: ExecutionContext;
  let stateManager: StateManager;
  let runtime: RuntimeContextImpl;

  beforeEach(() => {
    stateManager = new StateManager({
      testData: { name: 'test', value: 42 },
      users: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
      ]
    });
    runtime = new RuntimeContextImpl('test-workflow', 'test-execution', new EventEmitter());
    context = {
      state: stateManager,
      config: {},
      runtime
    };
  });

  it('should have correct metadata', () => {
    expect(fetchData.metadata.name).toBe('fetchData');
    expect(fetchData.metadata.description).toBe('Retrieve data from various sources');
    expect(fetchData.metadata.type).toBe('action');
  });

  describe('memory source', () => {
    it('should fetch data from state', async () => {
      context.config = {
        source: 'testData.name',
        sourceType: 'memory'
      };

      const result = await fetchData.execute(context);
      expect(result.success).toBeTruthy();
      expect(result.error).toBeUndefined();
      
      const data = await result.success?.();
      expect(data).toBe('test');
    });

    it('should fetch array data from state', async () => {
      context.config = {
        source: 'users',
        sourceType: 'memory'
      };

      const result = await fetchData.execute(context);
      expect(result.success).toBeTruthy();
      
      const data = await result.success?.();
      expect(data).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
      ]);
    });

    it('should return undefined for non-existent path', async () => {
      context.config = {
        source: 'nonExistent.path',
        sourceType: 'memory'
      };

      const result = await fetchData.execute(context);
      expect(result.success).toBeTruthy();
      
      const data = await result.success?.();
      expect(data).toBeUndefined();
    });
  });

  describe('api source', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should fetch data from API', async () => {
      const mockResponse = { data: 'test' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      context.config = {
        source: 'https://api.example.com/data',
        sourceType: 'api'
      };

      const result = await fetchData.execute(context);
      expect(result.success).toBeTruthy();
      
      const data = await result.success?.();
      expect(data).toEqual(mockResponse);
      
      expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/data', {
        method: 'GET',
        headers: undefined,
        body: undefined,
        signal: undefined
      });
    });

    it('should handle API errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      context.config = {
        source: 'https://api.example.com/notfound',
        sourceType: 'api'
      };

      const result = await fetchData.execute(context);
      expect(result.error).toBeTruthy();
      expect(result.success).toBeUndefined();
      
      const errorData = await result.error?.();
      expect(errorData.error).toBe('API fetch failed: 404 Not Found');
    });

    it('should support custom options', async () => {
      const mockResponse = { success: true };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      context.config = {
        source: 'https://api.example.com/data',
        sourceType: 'api',
        options: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { test: 'data' },
          timeout: 5000
        }
      };

      const result = await fetchData.execute(context);
      expect(result.success).toBeTruthy();
      
      expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 'data' }),
        signal: expect.any(AbortSignal)
      });
    });
  });

  describe('unsupported sources', () => {
    it('should return placeholder for database source', async () => {
      context.config = {
        source: 'users_table',
        sourceType: 'database',
        query: { where: { active: true } }
      };

      const result = await fetchData.execute(context);
      expect(result.success).toBeTruthy();
      
      const data = await result.success?.();
      expect(data).toEqual({
        message: 'Database fetch not implemented',
        query: { where: { active: true } }
      });
    });

    it('should return placeholder for file source', async () => {
      context.config = {
        source: '/path/to/file.json',
        sourceType: 'file'
      };

      const result = await fetchData.execute(context);
      expect(result.success).toBeTruthy();
      
      const data = await result.success?.();
      expect(data).toEqual({
        message: 'File fetch not implemented',
        path: '/path/to/file.json'
      });
    });
  });

  describe('error handling', () => {
    it('should handle unknown source type', async () => {
      context.config = {
        source: 'test',
        sourceType: 'invalid' as any
      };

      const result = await fetchData.execute(context);
      expect(result.error).toBeTruthy();
      expect(result.success).toBeUndefined();
      
      const errorData = await result.error?.();
      expect(errorData.error).toBe('Unknown source type: invalid');
    });
  });
});