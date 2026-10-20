import Database, { type Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let dbInstance: DatabaseType | null = null;

export const getDbPath = (): string => {
  if (process.env.NODE_ENV === 'test') {
    return process.env.TEST_DB_PATH || ':memory:';
  }
  if (process.env.DB_PATH) {
    return process.env.DB_PATH;
  }
  // Default to data directory in project root or backend
  const baseDir = fs.existsSync(path.resolve(process.cwd(), 'backend'))
    ? path.resolve(process.cwd(), 'backend/data')
    : path.resolve(process.cwd(), 'data');

  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  return path.join(baseDir, 'app.db');
};

export const initDatabase = (customPath?: string): DatabaseType => {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = customPath || getDbPath();
  const db = new Database(dbPath);

  // Performance and safety pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  // Run schema migrations
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      encrypted_api_key TEXT NOT NULL,
      key_iv TEXT NOT NULL,
      key_tag TEXT NOT NULL,
      key_preview TEXT NOT NULL,
      default_model TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_providers_user_id ON providers(user_id);
    CREATE INDEX IF NOT EXISTS idx_providers_is_default ON providers(user_id, is_default);
  `);

  dbInstance = db;
  return db;
};

export const getDb = (): DatabaseType => {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
};

export const closeDb = (): void => {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // Ignore error if already closed
    }
    dbInstance = null;
  }
};
