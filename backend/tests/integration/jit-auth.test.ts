import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { authService, AuthError } from '../../src/services/authService.js';
import { initDatabase, closeDb, getDb } from '../../src/db/database.js';
import * as supabaseClientModule from '../../src/services/supabaseClient.js';

describe('JIT Authentication & Concurrency Fencing Integration Tests', () => {
  const testEmail = 'jit-test-user@example.com';
  const testPassword = 'SecurePassword123!';
  let passwordHash: string;

  beforeEach(async () => {
    closeDb();
    initDatabase(':memory:');
    const db = getDb();

    passwordHash = await bcrypt.hash(testPassword, 10);
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('sqlite-user-123', testEmail, passwordHash, 'JIT User', Date.now(), Date.now());
  });

  afterAll(() => {
    closeDb();
  });

  it('should reject invalid legacy password without calling Supabase or acquiring lock', async () => {
    const mockSupabaseAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      }),
      auth: { admin: { updateUserById: vi.fn() } },
    };
    vi.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabaseAdmin as any);

    await expect(
      authService.loginWithSupabaseJIT({
        email: testEmail,
        password: 'WrongPassword999!',
      })
    ).rejects.toThrow(AuthError);

    // Assert no update was called
    expect(mockSupabaseAdmin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('should acquire lock and synchronize password on valid legacy credentials', async () => {
    const mockProfile = {
      id: 'supabase-user-uuid',
      email: testEmail,
      name: 'JIT User',
      sync_completed: false,
      sync_lock_until: null,
      sync_lock_owner: null,
    };

    const mockAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({ data: [{ id: mockProfile.id }] }),
              }),
            }),
          }),
        }),
      }),
      auth: {
        admin: {
          updateUserById: vi.fn().mockResolvedValue({ data: {}, error: null }),
        },
      },
    };

    const mockIsolatedClient = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: {
            user: { id: mockProfile.id, email: testEmail },
            session: { access_token: 'valid.jwt.token', expires_in: 3600 },
          },
          error: null,
        }),
      },
    };

    vi.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockAdmin as any);
    vi.spyOn(supabaseClientModule, 'createIsolatedAuthClient').mockReturnValue(mockIsolatedClient as any);

    const result = await authService.loginWithSupabaseJIT({
      email: testEmail,
      password: testPassword,
    });

    expect(result.user.email).toBe(testEmail);
    expect(result.session.id).toBe('valid.jwt.token');
    expect(mockAdmin.auth.admin.updateUserById).toHaveBeenCalledWith(
      mockProfile.id,
      expect.objectContaining({ password: testPassword })
    );
  });

  it('should reject concurrent requests with 429 when lock is already held', async () => {
    const mockProfile = {
      id: 'supabase-user-uuid',
      email: testEmail,
      name: 'JIT User',
      sync_completed: false,
      sync_lock_until: new Date(Date.now() + 25000).toISOString(),
      sync_lock_owner: 'other_worker_pid',
    };

    const mockAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                // Lock update returns 0 rows because lock is currently held by other_worker_pid
                select: vi.fn().mockResolvedValue({ data: [] }),
              }),
            }),
          }),
        }),
      }),
      auth: { admin: { updateUserById: vi.fn() } },
    };

    vi.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockAdmin as any);

    await expect(
      authService.loginWithSupabaseJIT({
        email: testEmail,
        password: testPassword,
      })
    ).rejects.toThrow('Synchronization in progress across backend workers');
  });

  it('should probe sign-in and recover if GoTrue update timed out locally but committed remotely', async () => {
    const mockProfile = {
      id: 'supabase-user-uuid',
      email: testEmail,
      name: 'JIT User',
      sync_completed: false,
      sync_lock_until: null,
      sync_lock_owner: null,
    };

    const mockAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({ data: [{ id: mockProfile.id }] }),
              }),
            }),
          }),
        }),
      }),
      auth: {
        admin: {
          // Simulate local network timeout during update
          updateUserById: vi.fn().mockRejectedValue(new Error('ETIMEDOUT')),
        },
      },
    };

    const mockIsolatedClient = {
      auth: {
        // Probing sign-in succeeds because remote GoTrue committed despite local timeout
        signInWithPassword: vi.fn().mockResolvedValue({
          data: {
            user: { id: mockProfile.id, email: testEmail },
            session: { access_token: 'probe.confirmed.jwt', expires_in: 3600 },
          },
          error: null,
        }),
      },
    };

    vi.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockAdmin as any);
    vi.spyOn(supabaseClientModule, 'createIsolatedAuthClient').mockReturnValue(mockIsolatedClient as any);

    const result = await authService.loginWithSupabaseJIT({
      email: testEmail,
      password: testPassword,
    });

    expect(result.session.id).toBe('probe.confirmed.jwt');
  });

  it('should dynamically provision GoTrue account and profiles when user registered in SQLite after migration', async () => {
    const unmigratedEmail = 'post-migration-user@example.com';
    const unmigratedPassword = 'PostMigrationPassword123!';
    const db = getDb();
    const hash = await bcrypt.hash(unmigratedPassword, 10);
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('sqlite-post-mig-uuid', unmigratedEmail, hash, 'Post Mig User', Date.now(), Date.now());

    const mockAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }), // No profile exists yet!
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }),
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
          createUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'supabase-new-user-uuid', email: unmigratedEmail } },
            error: null,
          }),
          updateUserById: vi.fn(),
        },
      },
    };

    const mockIsolatedClient = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: {
            user: { id: 'supabase-new-user-uuid', email: unmigratedEmail },
            session: { access_token: 'fresh.jit.jwt.access', refresh_token: 'fresh.jit.refresh', expires_in: 3600 },
          },
          error: null,
        }),
      },
    };

    vi.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockAdmin as any);
    vi.spyOn(supabaseClientModule, 'createIsolatedAuthClient').mockReturnValue(mockIsolatedClient as any);

    const result = await authService.loginWithSupabaseJIT({
      email: unmigratedEmail,
      password: unmigratedPassword,
    });

    expect(result.user.id).toBe('supabase-new-user-uuid');
    expect(result.session.id).toBe('fresh.jit.jwt.access');
    expect(result.session.refreshToken).toBe('fresh.jit.refresh');
    expect(mockAdmin.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: unmigratedEmail })
    );
  });
});
