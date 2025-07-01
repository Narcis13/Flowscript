/**
 * Tests for StateManager
 */

import { StateManager } from './StateManager';

describe('StateManager', () => {
  let stateManager: StateManager;

  beforeEach(() => {
    stateManager = new StateManager({
      user: {
        name: 'John Doe',
        age: 30,
        preferences: {
          theme: 'dark',
          notifications: true
        }
      },
      items: ['apple', 'banana', 'orange'],
      count: 0
    });
  });

  describe('get', () => {
    it('should get root state with $ or empty path', () => {
      expect(stateManager.get('$')).toEqual(stateManager.getState());
      expect(stateManager.get('')).toEqual(stateManager.getState());
    });

    it('should get nested values with dot notation', () => {
      expect(stateManager.get('$.user.name')).toBe('John Doe');
      expect(stateManager.get('user.name')).toBe('John Doe');
      expect(stateManager.get('$.user.preferences.theme')).toBe('dark');
    });

    it('should get array elements', () => {
      expect(stateManager.get('$.items.0')).toBe('apple');
      expect(stateManager.get('items.1')).toBe('banana');
      expect(stateManager.get('$.items.2')).toBe('orange');
    });

    it('should return undefined for non-existent paths', () => {
      expect(stateManager.get('$.user.email')).toBeUndefined();
      expect(stateManager.get('$.nonexistent.path')).toBeUndefined();
    });

    it('should handle special characters in paths', () => {
      stateManager.set('special.key-with-dash', 'value');
      expect(stateManager.get('special.key-with-dash')).toBe('value');
    });
  });

  describe('set', () => {
    it('should set root state', () => {
      const newState = { completely: 'new' };
      stateManager.set('$', newState);
      expect(stateManager.getState()).toEqual(newState);
    });

    it('should set nested values', () => {
      stateManager.set('$.user.email', 'john@example.com');
      expect(stateManager.get('$.user.email')).toBe('john@example.com');
    });

    it('should create intermediate objects', () => {
      stateManager.set('$.new.deeply.nested.value', 'test');
      expect(stateManager.get('$.new.deeply.nested.value')).toBe('test');
    });

    it('should set array elements', () => {
      stateManager.set('$.items.0', 'grape');
      expect(stateManager.get('$.items.0')).toBe('grape');
      expect(stateManager.get('$.items')).toEqual(['grape', 'banana', 'orange']);
    });

    it('should create arrays when setting numeric indices', () => {
      stateManager.set('$.newArray.0', 'first');
      expect(stateManager.get('$.newArray')).toEqual(['first']);
    });
  });

  describe('update', () => {
    it('should merge updates with existing state', () => {
      stateManager.update({
        user: {
          email: 'john@example.com',
          preferences: {
            language: 'en'
          }
        },
        newField: 'newValue'
      });

      expect(stateManager.get('$.user.name')).toBe('John Doe');
      expect(stateManager.get('$.user.email')).toBe('john@example.com');
      expect(stateManager.get('$.user.preferences.theme')).toBe('dark');
      expect(stateManager.get('$.user.preferences.language')).toBe('en');
      expect(stateManager.get('$.newField')).toBe('newValue');
    });

    it('should replace arrays, not merge them', () => {
      stateManager.update({
        items: ['grape', 'melon']
      });
      expect(stateManager.get('$.items')).toEqual(['grape', 'melon']);
    });
  });

  describe('has', () => {
    it('should check if path exists', () => {
      expect(stateManager.has('$.user.name')).toBe(true);
      expect(stateManager.has('$.user.email')).toBe(false);
      expect(stateManager.has('$.items.0')).toBe(true);
      expect(stateManager.has('$.items.10')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete values at path', () => {
      stateManager.delete('$.user.age');
      expect(stateManager.has('$.user.age')).toBe(false);
      expect(stateManager.get('$.user.name')).toBe('John Doe');
    });

    it('should delete array elements', () => {
      stateManager.delete('$.items.1');
      expect(stateManager.get('$.items')).toEqual(['apple', 'orange']);
    });

    it('should clear state when deleting root', () => {
      stateManager.delete('$');
      expect(stateManager.getState()).toEqual({});
    });
  });

  describe('hooks', () => {
    it('should call hooks on state changes', () => {
      const beforeUpdate = jest.fn();
      const afterUpdate = jest.fn();
      
      const sm = new StateManager({ count: 0 }, { beforeUpdate, afterUpdate });
      
      sm.set('$.count', 5);
      
      expect(beforeUpdate).toHaveBeenCalledWith('$.count', 0, 5);
      expect(afterUpdate).toHaveBeenCalledWith('$.count', 5);
    });

    it('should call hooks on update', () => {
      const beforeUpdate = jest.fn();
      const afterUpdate = jest.fn();
      
      const sm = new StateManager({ count: 0 }, { beforeUpdate, afterUpdate });
      
      sm.update({ count: 10, newField: 'test' });
      
      expect(beforeUpdate).toHaveBeenCalled();
      expect(afterUpdate).toHaveBeenCalled();
    });
  });

  describe('immutability', () => {
    it('should not modify original state on get', () => {
      const user = stateManager.get('$.user');
      user.name = 'Modified';
      
      expect(stateManager.get('$.user.name')).toBe('John Doe');
    });

    it('should not modify state when setting cloned objects', () => {
      const newUser = { name: 'Jane Doe', age: 25 };
      stateManager.set('$.user', newUser);
      
      newUser.name = 'Modified';
      
      expect(stateManager.get('$.user.name')).toBe('Jane Doe');
    });
  });
});