import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

export interface Credentials {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string | null;
  token_type?: string | null;
  expiry_date?: number | null;
}

export interface StoredTokenInfo extends Credentials {
  user_email: string;
  refresh_token: string;
  updated_at: string;
}

export class TokenStorage {
  private db: DatabaseType;

  constructor(databasePath: string = 'tokens.sqlite') {
    this.db = new Database(databasePath);
    console.log(`Database '${databasePath}' initialized.`);
    this.initializeSchema();
  }

  private initializeSchema(): void {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS access_tokens (
          user_email TEXT PRIMARY KEY,
          access_token TEXT NOT NULL,
          refresh_token TEXT NOT NULL,
          scope TEXT,
          token_type TEXT,
          expiry_date INTEGER NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log("Table 'access_tokens' is ready.");
    } catch (error) {
      console.error('Failed to initialize token storage:', error);
      throw error;
    }
  }

  saveOrUpdateTokens(email: string, tokens: Credentials): void {
    if (!tokens.refresh_token) {
      const stmt = this.db.prepare(`
        UPDATE access_tokens
        SET access_token = ?, scope = ?, token_type = ?, expiry_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_email = ?
      `);
      stmt.run(tokens.access_token, tokens.scope, tokens.token_type, tokens.expiry_date, email);
      console.log(`Tokens updated for ${email} (without changing refresh_token).`);
    } else {
      const stmt = this.db.prepare(`
        INSERT INTO access_tokens (user_email, access_token, refresh_token, scope, token_type, expiry_date)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_email) DO UPDATE SET
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          scope = excluded.scope,
          token_type = excluded.token_type,
          expiry_date = excluded.expiry_date,
          updated_at = CURRENT_TIMESTAMP;
      `);
      stmt.run(email, tokens.access_token, tokens.refresh_token, tokens.scope, tokens.token_type, tokens.expiry_date);
      console.log(`Tokens saved/updated for ${email} (with new refresh_token).`);
    }
  }

  getTokensForUser(email: string): StoredTokenInfo | null {
    const stmt = this.db.prepare('SELECT * FROM access_tokens WHERE user_email = ?');
    const result = stmt.get(email) as StoredTokenInfo | undefined;
    return result || null;
  }

  async getValidAccessToken(email: string, refreshTokenCallback?: (refreshToken: string) => Promise<Credentials>): Promise<string | null> {
    const storedTokens = this.getTokensForUser(email);

    if (!storedTokens || !storedTokens.refresh_token) {
      console.warn(`No stored refresh token for ${email}. Cannot get access token.`);
      return null;
    }

    const isExpired = storedTokens.expiry_date ? Date.now() >= (storedTokens.expiry_date - 60000) : true;

    if (isExpired) {
      console.log(`Access token for ${email} has expired. Refreshing...`);
      
      if (!refreshTokenCallback) {
        console.error('No refresh token callback provided. Cannot refresh token.');
        return null;
      }

      try {
        const newCredentials = await refreshTokenCallback(storedTokens.refresh_token);

        const updatedTokens: Credentials = {
          ...newCredentials,
          refresh_token: storedTokens.refresh_token,
        };

        this.saveOrUpdateTokens(email, updatedTokens);

        return updatedTokens.access_token!;
      } catch (error) {
        console.error(`Failed to refresh access token for ${email}:`, error);
        return null;
      }
    } else {
      console.log(`Existing access token for ${email} is still valid.`);
      return storedTokens.access_token || null;
    }
  }

  deleteTokensForUser(email: string): void {
    const stmt = this.db.prepare('DELETE FROM access_tokens WHERE user_email = ?');
    const result = stmt.run(email);
    if (result.changes > 0) {
      console.log(`Tokens deleted for ${email}.`);
    } else {
      console.log(`No tokens found for ${email}.`);
    }
  }

  getAllUsers(): string[] {
    const stmt = this.db.prepare('SELECT user_email FROM access_tokens');
    const results = stmt.all() as { user_email: string }[];
    return results.map(row => row.user_email);
  }

  close(): void {
    this.db.close();
    console.log('Database connection closed.');
  }
}

export function createTokenStorage(databasePath?: string): TokenStorage {
  return new TokenStorage(databasePath);
}