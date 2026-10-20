import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase, closeDb, getDb } from '../src/db/database.js';

describe('Authentication System Tests', () => {
  let app: any;

  beforeEach(() => {
    // Re-initialize fresh in-memory database for isolation
    closeDb();
    initDatabase(':memory:');
    app = createApp();
  });

  afterAll(() => {
    closeDb();
  });

  const testUser = {
    email: 'testuser@example.com',
    password: 'SecurePassword123!',
    name: 'Alice Developer',
  };

  describe('User Registration (POST /api/auth/register)', () => {
    it('should register a new user successfully and return session', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user.email).toBe(testUser.email.toLowerCase());
      expect(res.body.user.name).toBe(testUser.name);
      // Ensure password_hash is NEVER leaked in user DTO
      expect(res.body.user).not.toHaveProperty('password_hash');
      expect(res.body.user).not.toHaveProperty('password');

      expect(res.body).toHaveProperty('session');
      expect(res.body.session).toHaveProperty('id');
      expect(res.body.session).toHaveProperty('expiresAt');

      // Check HTTP-only cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('radox_session=');
      expect(cookies[0]).toContain('HttpOnly');
    });

    it('should reject registration with duplicate email (409 Conflict)', async () => {
      // First registration
      await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      // Duplicate registration attempt
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(409);

      expect(res.body.error.code).toBe('EMAIL_EXISTS');
      expect(res.body.error.message).toContain('already exists');
    });

    it('should reject registration with invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          ...testUser,
          email: 'not-an-email',
        })
        .expect(400);

      expect(res.body.error.code).toBe('INVALID_EMAIL');
    });

    it('should reject registration with password shorter than 8 characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          ...testUser,
          password: 'short',
        })
        .expect(400);

      expect(res.body.error.code).toBe('WEAK_PASSWORD');
    });

    it('should reject registration with missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
        })
        .expect(400);

      expect(res.body.error.code).toBe('MISSING_FIELDS');
    });

    it('should reject registration when confirmPassword does not match password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          ...testUser,
          confirmPassword: 'DifferentPassword123!',
        })
        .expect(400);

      expect(res.body.error.code).toBe('PASSWORD_MISMATCH');
      expect(res.body.error.message).toContain('Passwords do not match');
    });

    it('should register successfully when confirmPassword matches password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'matching@example.com',
          password: 'SecurePassword123!',
          confirmPassword: 'SecurePassword123!',
          name: 'Matching User',
        })
        .expect(201);

      expect(res.body.user.email).toBe('matching@example.com');
    });
  });

  describe('User Login (POST /api/auth/login)', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/register').send(testUser);
    });

    it('should log in successfully with valid credentials and return session', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(res.body.user.email).toBe(testUser.email.toLowerCase());
      expect(res.body.session).toHaveProperty('id');
      expect(res.headers['set-cookie'][0]).toContain('radox_session=');
    });

    it('should reject login with incorrect password (401)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword999!',
        })
        .expect(401);

      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login for non-existent email (401)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nobody@example.com',
          password: testUser.password,
        })
        .expect(401);

      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('Session Persistence and Validation (GET /api/auth/me)', () => {
    it('should return user info when authenticated via HTTP-only cookie', async () => {
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      const cookie = registerRes.headers['set-cookie'];

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookie)
        .expect(200);

      expect(meRes.body.user.email).toBe(testUser.email.toLowerCase());
      expect(meRes.body.user.name).toBe(testUser.name);
    });

    it('should return user info when authenticated via Authorization Bearer header', async () => {
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      const token = registerRes.body.session.id;

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(meRes.body.user.email).toBe(testUser.email.toLowerCase());
    });

    it('should return 401 when no session is provided', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when an invalid session token is provided', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', ['radox_session=invalid-token-12345; Path=/'])
        .expect(401);

      expect(res.body.error.code).toBe('SESSION_EXPIRED');
    });

    it('should reject an expired session and delete it from database', async () => {
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      const sessionId = registerRes.body.session.id;

      // Force session expiration in the database
      const db = getDb();
      db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, sessionId);

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`radox_session=${sessionId}; Path=/`])
        .expect(401);

      expect(meRes.body.error.code).toBe('SESSION_EXPIRED');

      // Verify session was removed from DB
      const row = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
      expect(row).toBeUndefined();
    });
  });

  describe('User Logout (POST /api/auth/logout)', () => {
    it('should invalidate session in DB and clear session cookie', async () => {
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      const cookie = registerRes.headers['set-cookie'];
      const sessionId = registerRes.body.session.id;

      // Log out
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .expect(200);

      expect(logoutRes.body.success).toBe(true);

      // Verify session cookie was cleared
      const setCookie = logoutRes.headers['set-cookie'];
      expect(setCookie[0]).toContain('radox_session=;');

      // Verify session was deleted in database
      const db = getDb();
      const sessionInDb = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
      expect(sessionInDb).toBeUndefined();

      // Subsequent /api/auth/me should return 401
      await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookie)
        .expect(401);
    });
  });

  describe('Server-Side Protected Routes (GET /api/auth/protected)', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .get('/api/auth/protected')
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should allow authenticated request and provide access to user ID', async () => {
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      const cookie = registerRes.headers['set-cookie'];

      const res = await request(app)
        .get('/api/auth/protected')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.message).toContain('Access granted');
      expect(res.body.userId).toBe(registerRes.body.user.id);
    });
  });
});
