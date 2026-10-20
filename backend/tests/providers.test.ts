import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase, closeDb, getDb } from '../src/db/database.js';
import { encryptionService } from '../src/services/encryptionService.js';
import { validateBaseUrl, SSRFError } from '../src/utils/ssrfValidator.js';
import { authService } from '../src/services/authService.js';

describe('Custom AI Provider Gateways & Security Tests', () => {
  let app: any;
  let userA: any;
  let userASession: any;
  let userB: any;
  let userBSession: any;

  beforeEach(async () => {
    closeDb();
    initDatabase(':memory:');
    app = createApp();

    // Register User A
    const resA = await authService.register({
      email: 'user-a@example.com',
      password: 'Password123!',
      name: 'User Alpha',
    });
    userA = resA.user;
    userASession = resA.session;

    // Register User B
    const resB = await authService.register({
      email: 'user-b@example.com',
      password: 'Password123!',
      name: 'User Beta',
    });
    userB = resB.user;
    userBSession = resB.session;
  });

  afterAll(() => {
    closeDb();
  });

  describe('Encryption Service (AES-256-GCM)', () => {
    it('should encrypt and decrypt API keys without data loss', () => {
      const secret = 'sk-proj-super-secret-key-1234567890abcdef';
      const enc = encryptionService.encrypt(secret);

      expect(enc.encrypted).toBeDefined();
      expect(enc.iv).toHaveLength(24); // 12 bytes hex
      expect(enc.tag).toHaveLength(32); // 16 bytes hex
      expect(enc.preview).toBe('sk-...cdef');

      const decrypted = encryptionService.decrypt(enc.encrypted, enc.iv, enc.tag);
      expect(decrypted).toBe(secret);
    });

    it('should fail decryption if ciphertext or tag is tampered with', () => {
      const secret = 'cc_tamper_test_secret';
      const enc = encryptionService.encrypt(secret);

      const tamperedTag = '00' + enc.tag.slice(2);
      expect(() => {
        encryptionService.decrypt(enc.encrypted, enc.iv, tamperedTag);
      }).toThrow();
    });
  });

  describe('SSRF Protection & URL Validation', () => {
    it('should normalize and accept valid public HTTPS provider endpoints', () => {
      const valid = 'https://api.openai.com/v1/';
      const normalized = validateBaseUrl(valid);
      expect(normalized).toBe('https://api.openai.com/v1');
    });

    it('should reject non-HTTP/HTTPS protocols', () => {
      expect(() => validateBaseUrl('file:///etc/passwd')).toThrow(SSRFError);
      expect(() => validateBaseUrl('ftp://example.com/v1')).toThrow(SSRFError);
      expect(() => validateBaseUrl('javascript:alert(1)')).toThrow(SSRFError);
    });

    it('should block AWS/GCP cloud metadata endpoints', () => {
      expect(() => validateBaseUrl('http://169.254.169.254/latest/meta-data')).toThrow(SSRFError);
      expect(() => validateBaseUrl('http://metadata.google.internal/computeMetadata/v1')).toThrow(SSRFError);
    });
  });

  describe('Provider CRUD Operations (POST/GET/PUT/DELETE /api/providers)', () => {
    it('should require authentication for provider management', async () => {
      await request(app)
        .get('/api/providers')
        .expect(401);

      await request(app)
        .post('/api/providers')
        .send({ name: 'Test', baseUrl: 'https://radoxai.com/v1', apiKey: 'cc_123' })
        .expect(401);
    });

    it('should create a provider and return only masked preview (never raw key)', async () => {
      const res = await request(app)
        .post('/api/providers')
        .set('Authorization', `Bearer ${userASession.id}`)
        .send({
          name: 'My Radox Gateway',
          baseUrl: 'https://radoxai.com/v1',
          apiKey: 'cc_testkey9999abcdef',
          defaultModel: 'claude-sonnet-5',
          isDefault: true,
        })
        .expect(201);

      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toBe('My Radox Gateway');
      expect(res.body.data.baseUrl).toBe('https://radoxai.com/v1');
      expect(res.body.data.keyPreview).toBe('cc_...cdef');
      expect(res.body.data.defaultModel).toBe('claude-sonnet-5');
      expect(res.body.data.isDefault).toBe(true);

      // Verify no sensitive keys leaked in response
      expect(res.body.data).not.toHaveProperty('apiKey');
      expect(res.body.data).not.toHaveProperty('encrypted_api_key');
      expect(res.body.data).not.toHaveProperty('key_iv');
    });

    it('should strictly isolate providers between users', async () => {
      // User A creates a provider
      const resA = await request(app)
        .post('/api/providers')
        .set('Authorization', `Bearer ${userASession.id}`)
        .send({
          name: 'User A Gateway',
          baseUrl: 'https://gateway-a.example.com/v1',
          apiKey: 'key_for_user_a_only',
        })
        .expect(201);

      const providerAId = resA.body.data.id;

      // User B lists providers -> should NOT see User A's provider
      const resBList = await request(app)
        .get('/api/providers')
        .set('Authorization', `Bearer ${userBSession.id}`)
        .expect(200);

      expect(resBList.body.data).toHaveLength(0);

      // User B tries to update User A's provider -> should return 404/Forbidden
      await request(app)
        .put(`/api/providers/${providerAId}`)
        .set('Authorization', `Bearer ${userBSession.id}`)
        .send({ name: 'Hacked Gateway' })
        .expect(404);

      // User B tries to delete User A's provider -> should return 404
      await request(app)
        .delete(`/api/providers/${providerAId}`)
        .set('Authorization', `Bearer ${userBSession.id}`)
        .expect(404);
    });

    it('should update an existing provider and allow setting default', async () => {
      const created = await request(app)
        .post('/api/providers')
        .set('Authorization', `Bearer ${userASession.id}`)
        .send({
          name: 'Initial Name',
          baseUrl: 'https://api.initial.com/v1',
          apiKey: 'initial_key_12345',
        })
        .expect(201);

      const providerId = created.body.data.id;

      // Update name and model
      const updated = await request(app)
        .put(`/api/providers/${providerId}`)
        .set('Authorization', `Bearer ${userASession.id}`)
        .send({
          name: 'Updated Name',
          defaultModel: 'claude-opus-5',
        })
        .expect(200);

      expect(updated.body.data.name).toBe('Updated Name');
      expect(updated.body.data.defaultModel).toBe('claude-opus-5');

      // Set default
      const defaultRes = await request(app)
        .post(`/api/providers/${providerId}/default`)
        .set('Authorization', `Bearer ${userASession.id}`)
        .expect(200);

      expect(defaultRes.body.data.isDefault).toBe(true);
    });

    it('should delete a provider successfully', async () => {
      const created = await request(app)
        .post('/api/providers')
        .set('Authorization', `Bearer ${userASession.id}`)
        .send({
          name: 'To Delete',
          baseUrl: 'https://delete.example.com/v1',
          apiKey: 'key_to_delete',
        })
        .expect(201);

      const providerId = created.body.data.id;

      await request(app)
        .delete(`/api/providers/${providerId}`)
        .set('Authorization', `Bearer ${userASession.id}`)
        .expect(200);

      // Verify it's gone
      const list = await request(app)
        .get('/api/providers')
        .set('Authorization', `Bearer ${userASession.id}`)
        .expect(200);

      expect(list.body.data).toHaveLength(0);
    });
  });
});
