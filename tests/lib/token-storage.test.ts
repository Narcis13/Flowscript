import { TokenStorage, createTokenStorage, type Credentials } from '../../src/lib/token-storage';
import fs from 'fs';
import path from 'path';

describe('TokenStorage', () => {
  const testDbPath = path.join(__dirname, 'test-tokens.sqlite');
  let tokenStorage: TokenStorage;

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    tokenStorage = createTokenStorage(testDbPath);
  });

  afterEach(() => {
    tokenStorage.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('initialization', () => {
    it('should create database and initialize schema', () => {
      expect(fs.existsSync(testDbPath)).toBe(true);
    });
  });

  describe('saveOrUpdateTokens', () => {
    const testEmail = 'test@example.com';
    const testTokens: Credentials = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      scope: 'test-scope',
      token_type: 'Bearer',
      expiry_date: Date.now() + 3600000, // 1 hour from now
    };

    it('should save new tokens', () => {
      tokenStorage.saveOrUpdateTokens(testEmail, testTokens);
      const saved = tokenStorage.getTokensForUser(testEmail);
      
      expect(saved).not.toBeNull();
      expect(saved?.user_email).toBe(testEmail);
      expect(saved?.access_token).toBe(testTokens.access_token);
      expect(saved?.refresh_token).toBe(testTokens.refresh_token);
      expect(saved?.scope).toBe(testTokens.scope);
      expect(saved?.token_type).toBe(testTokens.token_type);
      expect(saved?.expiry_date).toBe(testTokens.expiry_date);
    });

    it('should update existing tokens without refresh_token', () => {
      tokenStorage.saveOrUpdateTokens(testEmail, testTokens);
      
      const updatedTokens: Credentials = {
        access_token: 'updated-access-token',
        scope: 'updated-scope',
        token_type: 'Bearer',
        expiry_date: Date.now() + 7200000, // 2 hours from now
      };
      
      tokenStorage.saveOrUpdateTokens(testEmail, updatedTokens);
      const saved = tokenStorage.getTokensForUser(testEmail);
      
      expect(saved?.access_token).toBe(updatedTokens.access_token);
      expect(saved?.refresh_token).toBe(testTokens.refresh_token); // Should remain unchanged
      expect(saved?.scope).toBe(updatedTokens.scope);
      expect(saved?.expiry_date).toBe(updatedTokens.expiry_date);
    });

    it('should update all tokens including refresh_token', () => {
      tokenStorage.saveOrUpdateTokens(testEmail, testTokens);
      
      const completelyNewTokens: Credentials = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        scope: 'new-scope',
        token_type: 'Bearer',
        expiry_date: Date.now() + 7200000,
      };
      
      tokenStorage.saveOrUpdateTokens(testEmail, completelyNewTokens);
      const saved = tokenStorage.getTokensForUser(testEmail);
      
      expect(saved?.access_token).toBe(completelyNewTokens.access_token);
      expect(saved?.refresh_token).toBe(completelyNewTokens.refresh_token);
    });
  });

  describe('getTokensForUser', () => {
    it('should return null for non-existent user', () => {
      const result = tokenStorage.getTokensForUser('nonexistent@example.com');
      expect(result).toBeNull();
    });

    it('should return stored tokens for existing user', () => {
      const testEmail = 'test@example.com';
      const testTokens: Credentials = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        scope: 'test-scope',
        token_type: 'Bearer',
        expiry_date: Date.now() + 3600000,
      };
      
      tokenStorage.saveOrUpdateTokens(testEmail, testTokens);
      const result = tokenStorage.getTokensForUser(testEmail);
      
      expect(result).not.toBeNull();
      expect(result?.user_email).toBe(testEmail);
    });
  });

  describe('getValidAccessToken', () => {
    const testEmail = 'test@example.com';

    it('should return null for non-existent user', async () => {
      const result = await tokenStorage.getValidAccessToken('nonexistent@example.com');
      expect(result).toBeNull();
    });

    it('should return valid access token', async () => {
      const testTokens: Credentials = {
        access_token: 'valid-access-token',
        refresh_token: 'test-refresh-token',
        scope: 'test-scope',
        token_type: 'Bearer',
        expiry_date: Date.now() + 3600000, // 1 hour from now
      };
      
      tokenStorage.saveOrUpdateTokens(testEmail, testTokens);
      const result = await tokenStorage.getValidAccessToken(testEmail);
      
      expect(result).toBe('valid-access-token');
    });

    it('should refresh expired token', async () => {
      const expiredTokens: Credentials = {
        access_token: 'expired-access-token',
        refresh_token: 'test-refresh-token',
        scope: 'test-scope',
        token_type: 'Bearer',
        expiry_date: Date.now() - 3600000, // 1 hour ago
      };
      
      tokenStorage.saveOrUpdateTokens(testEmail, expiredTokens);
      
      const refreshCallback = jest.fn().mockResolvedValue({
        access_token: 'new-access-token',
        scope: 'test-scope',
        token_type: 'Bearer',
        expiry_date: Date.now() + 3600000,
      });
      
      const result = await tokenStorage.getValidAccessToken(testEmail, refreshCallback);
      
      expect(refreshCallback).toHaveBeenCalledWith('test-refresh-token');
      expect(result).toBe('new-access-token');
      
      const updatedTokens = tokenStorage.getTokensForUser(testEmail);
      expect(updatedTokens?.access_token).toBe('new-access-token');
      expect(updatedTokens?.refresh_token).toBe('test-refresh-token'); // Should be preserved
    });

    it('should return null if refresh fails', async () => {
      const expiredTokens: Credentials = {
        access_token: 'expired-access-token',
        refresh_token: 'test-refresh-token',
        scope: 'test-scope',
        token_type: 'Bearer',
        expiry_date: Date.now() - 3600000,
      };
      
      tokenStorage.saveOrUpdateTokens(testEmail, expiredTokens);
      
      const refreshCallback = jest.fn().mockRejectedValue(new Error('Refresh failed'));
      
      const result = await tokenStorage.getValidAccessToken(testEmail, refreshCallback);
      
      expect(result).toBeNull();
    });

    it('should return null if no refresh callback provided for expired token', async () => {
      const expiredTokens: Credentials = {
        access_token: 'expired-access-token',
        refresh_token: 'test-refresh-token',
        scope: 'test-scope',
        token_type: 'Bearer',
        expiry_date: Date.now() - 3600000,
      };
      
      tokenStorage.saveOrUpdateTokens(testEmail, expiredTokens);
      
      const result = await tokenStorage.getValidAccessToken(testEmail);
      
      expect(result).toBeNull();
    });
  });

  describe('deleteTokensForUser', () => {
    it('should delete tokens for existing user', () => {
      const testEmail = 'test@example.com';
      const testTokens: Credentials = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        scope: 'test-scope',
        token_type: 'Bearer',
        expiry_date: Date.now() + 3600000,
      };
      
      tokenStorage.saveOrUpdateTokens(testEmail, testTokens);
      tokenStorage.deleteTokensForUser(testEmail);
      
      const result = tokenStorage.getTokensForUser(testEmail);
      expect(result).toBeNull();
    });

    it('should handle deletion of non-existent user gracefully', () => {
      expect(() => {
        tokenStorage.deleteTokensForUser('nonexistent@example.com');
      }).not.toThrow();
    });
  });

  describe('getAllUsers', () => {
    it('should return empty array when no users', () => {
      const users = tokenStorage.getAllUsers();
      expect(users).toEqual([]);
    });

    it('should return all user emails', () => {
      const testTokens: Credentials = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        scope: 'test-scope',
        token_type: 'Bearer',
        expiry_date: Date.now() + 3600000,
      };
      
      tokenStorage.saveOrUpdateTokens('user1@example.com', testTokens);
      tokenStorage.saveOrUpdateTokens('user2@example.com', testTokens);
      tokenStorage.saveOrUpdateTokens('user3@example.com', testTokens);
      
      const users = tokenStorage.getAllUsers();
      expect(users).toHaveLength(3);
      expect(users).toContain('user1@example.com');
      expect(users).toContain('user2@example.com');
      expect(users).toContain('user3@example.com');
    });
  });
});