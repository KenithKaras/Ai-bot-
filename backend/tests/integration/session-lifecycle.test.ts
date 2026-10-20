import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { initDatabase, closeDb, getDb } from '../../src/db/database.js';
import { authService } from '../../src/services/authService.js';
import * as supabaseClientModule from '../../src/services/supabaseClient.js';
import { config } from '../../src/config.js';

describe('Supabase & SQLite Session Lifecycle Integration Tests', () => {
  let app: any;
  const testEmail = 'lifecycle-user@example.com';
  const testPassword = 'LifecyclePassword123!';

  beforeEach(() => {
    closeDb();
    initDatabase(':memory:');
    app = createApp();
  });

  afterAll(() => {
    closeDb();
  });

  describe('SQLite Session Lifecycle', () => {
    it('should register, login, refresh, and revoke sessions cleanly', async () => {
      // 1. Register
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
          name: 'Lifecycle User',
        });

      expect(regRes.status).toBe(201);
      expect(regRes.body.session.id).toBeDefined();
      const initialToken = regRes.body.session.id;

      // 2. Access protected endpoint
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${initialToken}`);
      expect(meRes.status).toBe(200);
      expect(meRes.body.user.email).toBe(testEmail);

      // 3. Refresh session
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: initialToken });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.session.id).toBe(initialToken);
      expect(refreshRes.body.session.expiresAt).toBeGreaterThan(Date.now());

      // 4. Logout / revoke
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${initialToken}`);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // 5. Subsequent request must be rejected
      const rejectedRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${initialToken}`);

      expect(rejectedRes.status).toBe(401);
    });
  });

  describe('Supabase Session Lifecycle & Safe Concurrent Refresh', () => {
    it('should safely deduplicate concurrent refresh requests without duplicate remote calls', async () => {
      const mockIsolatedClient = {
        auth: {
          refreshSession: vi.fn().mockImplementation(async ({ refresh_token }) => {
            // Simulate network latency
            await new Promise((r) => setTimeout(r, 50));
            return {
              data: {
                user: { id: 'sb-user-id', email: 'sb@example.com' },
                session: {
                  access_token: 'new.access.token.jwt',
                  refresh_token: 'new.refresh.token.jwt',
                  expires_in: 3600,
                },
              },
              error: null,
            };
          }),
        },
      };

      vi.spyOn(supabaseClientModule, 'createIsolatedAuthClient').mockReturnValue(mockIsolatedClient as any);

      // Trigger 5 simultaneous refresh requests with the same refresh token
      const token = 'initial.long.supabase.refresh.token.value.which.exceeds.64.characters.length.for.testing';
      const results = await Promise.all([
        authService.refreshSession(token),
        authService.refreshSession(token),
        authService.refreshSession(token),
        authService.refreshSession(token),
        authService.refreshSession(token),
      ]);

      // All 5 requests must resolve to the identical refreshed session
      for (const res of results) {
        expect(res.session.id).toBe('new.access.token.jwt');
        expect(res.session.refreshToken).toBe('new.refresh.token.jwt');
      }

      // Crucial: remote refreshSession was invoked only ONCE due to in-flight deduplication
      expect(mockIsolatedClient.auth.refreshSession).toHaveBeenCalledTimes(1);
    });

    it('should revoke Supabase session in GoTrue on logout', async () => {
      const mockAdmin = {
        auth: {
          admin: {
            signOut: vi.fn().mockResolvedValue({ error: null }),
          },
        },
      };

      vi.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockAdmin as any);

      const jwtToken = 'header.payload.signature';
      await authService.revokeSession(jwtToken, 'refresh.token.to.clear');

      expect(mockAdmin.auth.admin.signOut).toHaveBeenCalledWith(jwtToken);
    });
  });
});
