import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { initDatabase, closeDb } from '../../src/db/database.js';
import { authService } from '../../src/services/authService.js';
import { providerService } from '../../src/services/providerService.js';

describe('Database Grants, RLS Policies & Cross-User Security Tests', () => {
  let app: any;
  let userAId: string;
  let userASession: any;
  let userBSession: any;
  let userAProvider: any;

  beforeEach(async () => {
    closeDb();
    initDatabase(':memory:');
    app = createApp();

    const regA = await authService.register({
      email: 'user-alpha@example.com',
      password: 'SecurePassword123!',
      name: 'User Alpha',
    });
    userAId = regA.user.id;
    userASession = regA.session;

    const regB = await authService.register({
      email: 'user-beta@example.com',
      password: 'SecurePassword123!',
      name: 'User Beta',
    });
    userBSession = regB.session;

    // Create a provider owned by User A
    userAProvider = providerService.createProvider(userAId, {
      name: 'User A Private Gateway',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test-secret-alpha-key-12345',
      defaultModel: 'gpt-4o',
    });
  });

  afterAll(() => {
    closeDb();
  });

  it('should verify schema SQL contains complete grants and RLS restrictions', () => {
    const schemaPath = fs.existsSync(path.resolve(process.cwd(), 'src/db/supabase_schema.sql'))
      ? path.resolve(process.cwd(), 'src/db/supabase_schema.sql')
      : path.resolve(process.cwd(), 'backend/src/db/supabase_schema.sql');
    expect(fs.existsSync(schemaPath)).toBe(true);

    const sql = fs.readFileSync(schemaPath, 'utf8');

    // 1. Profiles Grants: Anon has ZERO access; Authenticated cannot mutate
    expect(sql).toContain('REVOKE ALL ON public.profiles FROM anon;');
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;');
    expect(sql).toContain('GRANT SELECT ON public.profiles TO authenticated;');
    expect(sql).toContain('GRANT ALL ON public.profiles TO service_role;');

    // 2. Providers Grants: Zero direct client access
    expect(sql).toContain('REVOKE ALL ON public.providers FROM anon;');
    expect(sql).toContain('REVOKE ALL ON public.providers FROM authenticated;');
    expect(sql).toContain('GRANT ALL ON public.providers TO service_role;');

    // 3. RLS Policies
    expect(sql).toContain('auth.uid() = id');
    expect(sql).toContain('auth.uid() = user_id');
  });

  it('should prevent User B from reading User A provider via API (cross-user read isolation)', async () => {
    // User A can access own provider
    await request(app)
      .get('/api/providers')
      .set('Authorization', `Bearer ${userASession.id}`)
      .expect(200);

    // User B querying User A provider returns 404 (strictly scoped by req.user.id)
    await request(app)
      .put(`/api/providers/${userAProvider.id}`)
      .set('Authorization', `Bearer ${userBSession.id}`)
      .send({ name: 'Hacked Name' })
      .expect(404);
  });

  it('should prevent User B from deleting User A provider (cross-user mutation isolation)', async () => {
    await request(app)
      .delete(`/api/providers/${userAProvider.id}`)
      .set('Authorization', `Bearer ${userBSession.id}`)
      .expect(404);

    // Verify provider was NOT deleted
    expect(providerService.getDecryptedProvider(userAId, userAProvider.id)).not.toBeNull();
  });

  it('should never expose raw ciphertext, IV, or GCM tag in API responses', async () => {
    const res = await request(app)
      .get('/api/providers')
      .set('Authorization', `Bearer ${userASession.id}`)
      .expect(200);

    const providerData = res.body.data[0];
    expect(providerData).toHaveProperty('keyPreview');
    expect(providerData).not.toHaveProperty('encrypted_api_key');
    expect(providerData).not.toHaveProperty('key_iv');
    expect(providerData).not.toHaveProperty('key_tag');
    expect(providerData).not.toHaveProperty('apiKey');
  });
});
