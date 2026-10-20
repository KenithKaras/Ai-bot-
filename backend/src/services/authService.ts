import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDb } from '../db/database.js';
import { config } from '../config.js';
import { getSupabaseAdmin, createIsolatedAuthClient } from './supabaseClient.js';
import { encryptionService, getPrimaryEncryptionKey } from './encryptionService.js';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface SessionRow {
  id: string;
  user_id: string;
  expires_at: number;
  created_at: number;
  last_active_at: number;
  ip_address: string | null;
  user_agent: string | null;
}

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface SafeSession {
  id: string;
  userId: string;
  expiresAt: number;
  createdAt: number;
  refreshToken?: string;
}

export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export class AuthError extends Error {
  public statusCode: number;
  public code: string;

  constructor(message: string, statusCode = 400, code = 'AUTH_ERROR') {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class AuthService {
  private inflightRefreshes = new Map<string, Promise<{ user: SafeUser; session: SafeSession }>>();
  private recentRefreshes = new Map<string, { result: { user: SafeUser; session: SafeSession }; expiresAt: number }>();

  /**
   * Register a new user and create an initial session
   */
  public async register(params: {
    email: string;
    password: string;
    confirmPassword?: string;
    name: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ user: SafeUser; session: SafeSession }> {
    if (config.databaseDriver === 'supabase') {
      return this.registerWithSupabase(params);
    }

    const db = getDb();
    const email = params.email.trim().toLowerCase();
    const name = params.name.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AuthError('Please provide a valid email address.', 400, 'INVALID_EMAIL');
    }

    if (!params.password || params.password.length < 8) {
      throw new AuthError('Password must be at least 8 characters long.', 400, 'WEAK_PASSWORD');
    }

    if (params.confirmPassword !== undefined && params.password !== params.confirmPassword) {
      throw new AuthError('Passwords do not match. Please verify both password entries.', 400, 'PASSWORD_MISMATCH');
    }

    if (!name || name.length < 2) {
      throw new AuthError('Name must be at least 2 characters long.', 400, 'INVALID_NAME');
    }

    // Check duplicate
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      throw new AuthError('An account with this email already exists.', 409, 'EMAIL_EXISTS');
    }

    const now = Date.now();
    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(params.password, 10);

    // Insert user
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, email, passwordHash, name, now, now);

    // Create session
    const session = this.createSession(userId, params.ipAddress, params.userAgent);

    return {
      user: {
        id: userId,
        email,
        name,
        createdAt: now,
        updatedAt: now,
      },
      session,
    };
  }

  /**
   * Register directly in Supabase when databaseDriver is 'supabase'
   */
  public async registerWithSupabase(params: {
    email: string;
    password: string;
    confirmPassword?: string;
    name: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ user: SafeUser; session: SafeSession }> {
    const email = params.email.trim().toLowerCase();
    const name = params.name.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AuthError('Please provide a valid email address.', 400, 'INVALID_EMAIL');
    }
    if (!params.password || params.password.length < 8) {
      throw new AuthError('Password must be at least 8 characters long.', 400, 'WEAK_PASSWORD');
    }
    if (params.confirmPassword !== undefined && params.password !== params.confirmPassword) {
      throw new AuthError('Passwords do not match. Please verify both password entries.', 400, 'PASSWORD_MISMATCH');
    }
    if (!name || name.length < 2) {
      throw new AuthError('Name must be at least 2 characters long.', 400, 'INVALID_NAME');
    }

    const supabaseAdmin = getSupabaseAdmin();
    const isolatedClient = createIsolatedAuthClient();

    // Verify duplicate in Supabase profiles
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      throw new AuthError('An account with this email already exists.', 409, 'EMAIL_EXISTS');
    }

    const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: params.password,
      email_confirm: true,
      user_metadata: { name },
      app_metadata: { pwd_sync_completed: true },
    });

    if (authErr || !authUser.user) {
      if (authErr?.message?.includes('already been registered') || (authErr as any)?.status === 422) {
        throw new AuthError('An account with this email already exists.', 409, 'EMAIL_EXISTS');
      }
      throw new AuthError(authErr?.message || 'Failed to register account.', 400, 'REGISTRATION_FAILED');
    }

    const userId = authUser.user.id;
    const nowIso = new Date().toISOString();

    const { error: profErr } = await supabaseAdmin.from('profiles').insert({
      id: userId,
      email,
      name,
      sync_completed: true,
      sync_lock_until: null,
      sync_lock_owner: null,
      migration_run_id: 'live_supabase_registration',
      created_at: nowIso,
      updated_at: nowIso,
    });

    if (profErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new AuthError('Failed to initialize user profile.', 500, 'PROFILE_CREATION_FAILED');
    }

    // Sign in to produce session
    const { data: signInData, error: signInErr } = await isolatedClient.auth.signInWithPassword({
      email,
      password: params.password,
    });

    if (signInErr || !signInData.session) {
      throw new AuthError('Registration succeeded but session generation failed. Please log in.', 500, 'SESSION_FAILED');
    }

    return {
      user: {
        id: userId,
        email,
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      session: {
        id: signInData.session.access_token,
        userId,
        expiresAt: Date.now() + (signInData.session.expires_in || 3600) * 1000,
        createdAt: Date.now(),
        refreshToken: signInData.session.refresh_token,
      },
    };
  }

  /**
   * Log in user with email & password
   */
  public async login(params: {
    email: string;
    password: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ user: SafeUser; session: SafeSession }> {
    if (config.databaseDriver === 'supabase') {
      return this.loginWithSupabaseJIT(params);
    }

    const db = getDb();
    const email = params.email.trim().toLowerCase();

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
    if (!user) {
      // Use constant time dummy comparison to prevent user enumeration timing attacks
      await bcrypt.compare(params.password, '$2a$10$wT0lP2e9vUeUf1U6v0UeUeT0lP2e9vUeUf1U6v0UeUeT0lP2e9vUe');
      throw new AuthError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    const passwordMatch = await bcrypt.compare(params.password, user.password_hash);
    if (!passwordMatch) {
      throw new AuthError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    const session = this.createSession(user.id, params.ipAddress, params.userAgent);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
      session,
    };
  }

  /**
   * Distributed JIT login synchronization flow with fencing lock and timeout recovery
   */
  public async loginWithSupabaseJIT(params: {
    email: string;
    password: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ user: SafeUser; session: SafeSession }> {
    const email = params.email.trim().toLowerCase();
    const isolatedClient = createIsolatedAuthClient();
    const supabaseAdmin = getSupabaseAdmin();

    // 1. Check if user profile exists in Supabase PostgreSQL
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (profile && profile.sync_completed) {
      // Fast path: Account already synchronized in Supabase Auth
      const { data: authData, error: authError } = await isolatedClient.auth.signInWithPassword({
        email,
        password: params.password,
      });

      if (authError || !authData.user || !authData.session) {
        throw new AuthError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
      }

      return {
        user: {
          id: authData.user.id,
          email: authData.user.email || email,
          name: profile.name || (authData.user.user_metadata?.name as string) || email.split('@')[0],
          createdAt: Date.parse(authData.user.created_at),
          updatedAt: Date.parse(authData.user.updated_at || authData.user.created_at),
        },
        session: {
          id: authData.session.access_token,
          userId: authData.user.id,
          expiresAt: Date.now() + (authData.session.expires_in || 3600) * 1000,
          createdAt: Date.now(),
          refreshToken: authData.session.refresh_token,
        },
      };
    }

    // 2. Unsynchronized account: verify against legacy SQLite password_hash
    const db = getDb();
    const legacyUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
    if (!legacyUser) {
      await bcrypt.compare(params.password, '$2a$10$wT0lP2e9vUeUf1U6v0UeUeT0lP2e9vUeUf1U6v0UeUeT0lP2e9vUe');
      throw new AuthError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    const passwordMatch = await bcrypt.compare(params.password, legacyUser.password_hash);
    if (!passwordMatch) {
      throw new AuthError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    // If profile does not exist in Supabase (created in SQLite after migration or delta),
    // perform safe JIT account provisioning and delta migration.
    if (!profile) {
      let authUserId: string;
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 100 });
      const existingAuth = (listData?.users || []).find((u: any) => (u.email || '').toLowerCase() === email);

      if (existingAuth) {
        authUserId = existingAuth.id;
        await supabaseAdmin.auth.admin.updateUserById(authUserId, {
          password: params.password,
          app_metadata: { pwd_sync_completed: true, migrated_from: 'sqlite_jit_delta' },
        });
      } else {
        const { data: newAuth, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: params.password,
          email_confirm: true,
          user_metadata: { name: legacyUser.name },
          app_metadata: { pwd_sync_completed: true, migrated_from: 'sqlite_jit_delta' },
        });
        if (createErr || !newAuth.user) {
          throw new AuthError(`Failed to synchronize account: ${createErr?.message}`, 500, 'SYNC_FAILED');
        }
        authUserId = newAuth.user.id;
      }

      // Upsert profile in Supabase
      await supabaseAdmin.from('profiles').upsert({
        id: authUserId,
        email,
        name: legacyUser.name,
        sync_completed: true,
        sync_lock_until: null,
        sync_lock_owner: null,
        migration_run_id: 'jit_delta',
        created_at: new Date(legacyUser.created_at).toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Migrate legacy providers if any exist
      try {
        const legacyProviders = db.prepare('SELECT * FROM providers WHERE user_id = ?').all(legacyUser.id) as any[];
        for (const p of legacyProviders) {
          const { data: existingProv } = await supabaseAdmin.from('providers').select('id').eq('id', p.id).maybeSingle();
          if (!existingProv) {
            const reencrypted = encryptionService.reencrypt(
              p.encrypted_api_key,
              p.key_iv,
              p.key_tag,
              getPrimaryEncryptionKey()
            );
            await supabaseAdmin.from('providers').insert({
              id: p.id,
              user_id: authUserId,
              name: p.name,
              base_url: p.base_url,
              encrypted_api_key: reencrypted.encrypted,
              key_iv: reencrypted.iv,
              key_tag: reencrypted.tag,
              key_preview: reencrypted.preview,
              default_model: p.default_model,
              is_default: Boolean(p.is_default),
              migration_run_id: 'jit_delta',
              created_at: new Date(p.created_at).toISOString(),
              updated_at: new Date(p.updated_at).toISOString(),
            });
          }
        }
      } catch (provErr: any) {
        console.warn('Delta provider migration notice:', provErr.message);
      }

      const { data: signInResult, error: signInErr } = await isolatedClient.auth.signInWithPassword({
        email,
        password: params.password,
      });

      if (signInErr || !signInResult.user || !signInResult.session) {
        throw new AuthError('Authentication service failed to sign in synchronized user.', 500, 'SIGN_IN_FAILED');
      }

      return {
        user: {
          id: signInResult.user.id,
          email: signInResult.user.email || email,
          name: legacyUser.name,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        session: {
          id: signInResult.session.access_token,
          userId: signInResult.user.id,
          expiresAt: Date.now() + (signInResult.session.expires_in || 3600) * 1000,
          createdAt: Date.now(),
          refreshToken: signInResult.session.refresh_token,
        },
      };
    }

    // 3. Acquire distributed fencing lock in PostgreSQL
    const lockOwner = `${process.pid}_${crypto.randomUUID()}`;
    const targetUserId = profile.id;

    const { data: lockResult, error: lockErr } = await supabaseAdmin
      .from('profiles')
      .update({
        sync_lock_until: new Date(Date.now() + 30000).toISOString(),
        sync_lock_owner: lockOwner,
      })
      .eq('id', targetUserId)
      .eq('sync_completed', false)
      .or(`sync_lock_until.is.null,sync_lock_until.lt.${new Date().toISOString()}`)
      .select('id');

    if (lockErr || !lockResult || lockResult.length === 0) {
      throw new AuthError(
        'Synchronization in progress across backend workers. Please retry in a few seconds.',
        429,
        'SYNC_IN_PROGRESS'
      );
    }

    // 4. Update password in GoTrue
    try {
      await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        password: params.password,
        app_metadata: { pwd_sync_completed: true },
      });
    } catch {
      // Handled via probe below
    }

    // 5. Probing verification on timeout or post-update
    const { data: signInResult, error: signInErr } = await isolatedClient.auth.signInWithPassword({
      email,
      password: params.password,
    });

    if (signInErr || !signInResult.user || !signInResult.session) {
      // Verification failed - do not release lock prematurely if remote write is still completing
      throw new AuthError(
        'Authentication service timed out while synchronizing credentials. Please retry.',
        504,
        'SYNC_TIMEOUT'
      );
    }

    // 6. Finalize synchronization with fencing check
    await supabaseAdmin
      .from('profiles')
      .update({
        sync_completed: true,
        sync_lock_until: null,
        sync_lock_owner: null,
      })
      .eq('id', targetUserId)
      .eq('sync_lock_owner', lockOwner);

    return {
      user: {
        id: signInResult.user.id,
        email: signInResult.user.email || email,
        name: legacyUser.name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      session: {
        id: signInResult.session.access_token,
        userId: signInResult.user.id,
        expiresAt: Date.now() + (signInResult.session.expires_in || 3600) * 1000,
        createdAt: Date.now(),
        refreshToken: signInResult.session.refresh_token,
      },
    };
  }

  /**
   * Create a new secure session token
   */
  public createSession(userId: string, ipAddress?: string, userAgent?: string): SafeSession {
    const db = getDb();
    const sessionId = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;

    db.prepare(`
      INSERT INTO sessions (id, user_id, expires_at, created_at, last_active_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, userId, expiresAt, now, now, ipAddress || null, userAgent || null);

    return {
      id: sessionId,
      userId,
      expiresAt,
      createdAt: now,
    };
  }

  /**
   * Validate a session token and fetch the associated user
   */
  public validateSession(sessionId: string): { user: SafeUser; session: SafeSession } | null {
    if (!sessionId || typeof sessionId !== 'string') return null;

    const db = getDb();
    const now = Date.now();

    const session = db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(sessionId) as SessionRow | undefined;

    if (!session) return null;

    if (session.expires_at <= now) {
      // Session expired, delete it
      db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
      return null;
    }

    const user = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(session.user_id) as UserRow | undefined;

    if (!user) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
      return null;
    }

    // Update last_active_at if more than 5 minutes since last active
    if (now - session.last_active_at > 5 * 60 * 1000) {
      db.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?').run(now, sessionId);
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
      session: {
        id: session.id,
        userId: session.user_id,
        expiresAt: session.expires_at,
        createdAt: session.created_at,
      },
    };
  }

  /**
   * Log out / invalidate session
   */
  public invalidateSession(sessionId: string): void {
    if (!sessionId) return;
    const db = getDb();
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }

  /**
   * Revoke session and refresh token cleanly across SQLite and Supabase
   */
  public async revokeSession(sessionId: string, refreshToken?: string): Promise<void> {
    if (sessionId) {
      this.invalidateSession(sessionId);
      this.recentRefreshes.delete(sessionId);
      this.inflightRefreshes.delete(sessionId);
    }

    if (refreshToken) {
      this.recentRefreshes.delete(refreshToken);
      this.inflightRefreshes.delete(refreshToken);
    }

    // If Supabase mode or JWT token, revoke session in GoTrue
    if (config.databaseDriver === 'supabase' || (sessionId && sessionId.includes('.'))) {
      try {
        const supabaseAdmin = getSupabaseAdmin();
        await supabaseAdmin.auth.admin.signOut(sessionId);
      } catch {
        // Non-fatal: cookies and client credentials are fully destroyed regardless
      }
    }
  }

  /**
   * Safe concurrent session refresh with deduplication
   */
  public async refreshSession(
    refreshToken: string,
    currentSessionId?: string
  ): Promise<{ user: SafeUser; session: SafeSession }> {
    const trimmedToken = (refreshToken || '').trim();
    if (!trimmedToken) {
      throw new AuthError('Refresh token is required.', 400, 'MISSING_TOKEN');
    }

    // 1. Check recent refreshes cache to absorb rapid concurrent tab refreshes
    const cached = this.recentRefreshes.get(trimmedToken);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.result;
    }

    // 2. Reuse in-flight promise for concurrent identical token requests
    const existingPromise = this.inflightRefreshes.get(trimmedToken);
    if (existingPromise) {
      return existingPromise;
    }

    const refreshPromise = (async () => {
      try {
        if (config.databaseDriver === 'supabase' || trimmedToken.includes('.') || trimmedToken.length > 64) {
          const isolatedClient = createIsolatedAuthClient();
          const { data, error } = await isolatedClient.auth.refreshSession({
            refresh_token: trimmedToken,
          });

          if (error || !data.session || !data.user) {
            throw new AuthError(
              error?.message || 'Invalid or expired refresh token. Please log in again.',
              401,
              'REFRESH_FAILED'
            );
          }

          const res = {
            user: {
              id: data.user.id,
              email: data.user.email || '',
              name: (data.user.user_metadata?.name as string) || (data.user.email ? data.user.email.split('@')[0] : 'User'),
              createdAt: data.user.created_at ? Date.parse(data.user.created_at) : Date.now(),
              updatedAt: data.user.updated_at ? Date.parse(data.user.updated_at) : Date.now(),
            },
            session: {
              id: data.session.access_token,
              userId: data.user.id,
              expiresAt: Date.now() + (data.session.expires_in || 3600) * 1000,
              createdAt: Date.now(),
              refreshToken: data.session.refresh_token,
            },
          };

          // Cache result for 15 seconds to safely absorb concurrent tab requests
          this.recentRefreshes.set(trimmedToken, { result: res, expiresAt: Date.now() + 15000 });
          if (res.session.refreshToken) {
            this.recentRefreshes.set(res.session.refreshToken, { result: res, expiresAt: Date.now() + 15000 });
          }

          return res;
        } else {
          // SQLite session refresh / extension
          const tokenToValidate = currentSessionId || trimmedToken;
          const validation = this.validateSession(tokenToValidate);
          if (!validation) {
            throw new AuthError('Session expired. Please log in again.', 401, 'SESSION_EXPIRED');
          }

          const db = getDb();
          const newExpiresAt = Date.now() + SESSION_TTL_MS;
          db.prepare('UPDATE sessions SET expires_at = ?, last_active_at = ? WHERE id = ?').run(
            newExpiresAt,
            Date.now(),
            validation.session.id
          );

          const updatedSession: SafeSession = {
            ...validation.session,
            expiresAt: newExpiresAt,
            refreshToken: validation.session.id,
          };

          const res = { user: validation.user, session: updatedSession };
          this.recentRefreshes.set(trimmedToken, { result: res, expiresAt: Date.now() + 15000 });
          return res;
        }
      } finally {
        this.inflightRefreshes.delete(trimmedToken);
      }
    })();

    this.inflightRefreshes.set(trimmedToken, refreshPromise);
    return refreshPromise;
  }

  /**
   * Log out of all devices
   */
  public invalidateAllUserSessions(userId: string): void {
    if (!userId) return;
    const db = getDb();
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  /**
   * Remove expired sessions from database
   */
  public cleanupExpiredSessions(): void {
    const db = getDb();
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  }
}

export const authService = new AuthService();
