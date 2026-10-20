import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  encryptionService,
  getLegacyEncryptionKey,
  getPrimaryEncryptionKey,
} from '../../src/services/encryptionService.js';

describe('EncryptionService Unit Tests', () => {
  const secretKey = 'sk-proj-super-secret-production-ai-key-12345';

  it('should encrypt with fresh random 12-byte IV on every call', () => {
    const enc1 = encryptionService.encrypt(secretKey);
    const enc2 = encryptionService.encrypt(secretKey);

    // IVs must be fresh and unique
    expect(enc1.iv).not.toBe(enc2.iv);
    expect(Buffer.from(enc1.iv, 'hex')).toHaveLength(12);
    expect(Buffer.from(enc2.iv, 'hex')).toHaveLength(12);

    // Ciphertexts must differ due to unique IVs
    expect(enc1.encrypted).not.toBe(enc2.encrypted);
    // Authentication tags must be 16 bytes (32 hex characters)
    expect(Buffer.from(enc1.tag, 'hex')).toHaveLength(16);
    expect(Buffer.from(enc2.tag, 'hex')).toHaveLength(16);
  });

  it('should decrypt correctly with matching key', () => {
    const enc = encryptionService.encrypt(secretKey);
    const decrypted = encryptionService.decrypt(enc.encrypted, enc.iv, enc.tag);
    expect(decrypted).toBe(secretKey);
  });

  it('should reject decryption if authentication tag is tampered with', () => {
    const enc = encryptionService.encrypt(secretKey);
    const tamperedTag = Buffer.from(enc.tag, 'hex');
    tamperedTag[0] ^= 0xff; // Flip bits

    expect(() => {
      encryptionService.decrypt(enc.encrypted, enc.iv, tamperedTag.toString('hex'));
    }).toThrow();
  });

  it('should reject decryption if ciphertext is tampered with', () => {
    const enc = encryptionService.encrypt(secretKey);
    const tamperedCipher = Buffer.from(enc.encrypted, 'hex');
    tamperedCipher[0] ^= 0xff;

    expect(() => {
      encryptionService.decrypt(tamperedCipher.toString('hex'), enc.iv, enc.tag);
    }).toThrow();
  });

  it('should generate safe masked previews without leaking secret characters', () => {
    const preview1 = encryptionService.generatePreview('sk-proj-1234567890abcdef');
    expect(preview1).toBe('sk-...cdef');
    expect(preview1).not.toContain('1234567890');

    const previewShort = encryptionService.generatePreview('1234');
    expect(previewShort).toBe('****34');
  });

  it('should support reencryption from legacy key to target key with verified integrity', () => {
    const legacyKey = getLegacyEncryptionKey();
    const newTargetKey = crypto.randomBytes(32);

    // Encrypt initially with legacy key
    const legacyEnc = encryptionService.encrypt(secretKey, legacyKey);

    // Re-encrypt with new target key
    const reencrypted = encryptionService.reencrypt(
      legacyEnc.encrypted,
      legacyEnc.iv,
      legacyEnc.tag,
      newTargetKey
    );

    // Re-encrypted data must have fresh IV and decrypt with new key
    expect(reencrypted.iv).not.toBe(legacyEnc.iv);
    const decryptedWithNew = encryptionService.decrypt(
      reencrypted.encrypted,
      reencrypted.iv,
      reencrypted.tag,
      newTargetKey
    );
    expect(decryptedWithNew).toBe(secretKey);

    // Legacy key must fail to decrypt new ciphertext
    expect(() => {
      encryptionService.decrypt(reencrypted.encrypted, reencrypted.iv, reencrypted.tag, legacyKey);
    }).toThrow();
  });

  it('should require APP_ENCRYPTION_KEY in production/runtime and reject fallback to hardcoded salt', () => {
    const origEnv = process.env.NODE_ENV;
    const origKey = process.env.APP_ENCRYPTION_KEY;
    const origLegacy = process.env.ENCRYPTION_KEY;

    try {
      // Simulate production environment with missing key
      process.env.NODE_ENV = 'production';
      delete process.env.APP_ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;

      expect(() => {
        getPrimaryEncryptionKey();
      }).toThrow('Cryptographic security error: APP_ENCRYPTION_KEY environment variable is required');

      // Verify that providing high-entropy key satisfies requirement
      process.env.APP_ENCRYPTION_KEY = 'high-entropy-production-grade-secret-key-12345';
      const key = getPrimaryEncryptionKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key).toHaveLength(32);
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origKey !== undefined) process.env.APP_ENCRYPTION_KEY = origKey;
      else delete process.env.APP_ENCRYPTION_KEY;
      if (origLegacy !== undefined) process.env.ENCRYPTION_KEY = origLegacy;
      else delete process.env.ENCRYPTION_KEY;
    }
  });
});
