import crypto from 'crypto';

export interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
  preview: string;
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for AES-GCM

/**
 * Derives the legacy 32-byte master key used in pre-migration SQLite storage.
 * Retained strictly for decrypting historical SQLite records during migration.
 */
export const getLegacyEncryptionKey = (): Buffer => {
  return crypto.scryptSync(
    'radox-ai-chat-master-key-salt',
    'vault-internal-salt-09a8f23',
    32
  );
};

/**
 * Derives the current primary 32-byte encryption key from environment variable.
 * Fallback to hardcoded salt is strictly disallowed for new operations.
 */
export const getPrimaryEncryptionKey = (): Buffer => {
  const envKey = process.env.APP_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  if (envKey && envKey.trim().length > 0) {
    // Hash to ensure uniform 32-byte length
    return crypto.createHash('sha256').update(envKey.trim()).digest();
  }

  // Allow deterministic test key only in test environment
  if (process.env.NODE_ENV === 'test') {
    return crypto.createHash('sha256').update('radox-ai-test-suite-encryption-key-v1').digest();
  }

  throw new Error(
    'Cryptographic security error: APP_ENCRYPTION_KEY environment variable is required before performing encryption. Fallback to hardcoded salt is disabled.'
  );
};

export class EncryptionService {
  /**
   * Generates a safe masked preview of an API key
   * e.g. "sk-proj-abc...1234" -> "sk-...1234"
   */
  public generatePreview(plainKey: string): string {
    const trimmed = (plainKey || '').trim();
    if (!trimmed) return '****';
    if (trimmed.length <= 8) return '****' + trimmed.slice(-2);

    const prefix = trimmed.slice(0, 3);
    const suffix = trimmed.slice(-4);
    return `${prefix}...${suffix}`;
  }

  /**
   * Encrypts plaintext using AES-256-GCM with a fresh random 12-byte IV
   */
  public encrypt(plainText: string, customKey?: Buffer): EncryptedData {
    const key = customKey || getPrimaryEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag().toString('hex');
    const preview = this.generatePreview(plainText);

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag,
      preview,
    };
  }

  /**
   * Decrypts ciphertext using AES-256-GCM and verifies authenticity tag
   */
  public decrypt(encryptedHex: string, ivHex: string, tagHex: string, customKey?: Buffer): string {
    const key = customKey || getPrimaryEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Decrypts ciphertext with primary key, falling back to legacy derivation if primary fails.
   * Preserves backward compatibility during migration and testing.
   */
  public decryptWithLegacyFallback(encryptedHex: string, ivHex: string, tagHex: string): string {
    try {
      return this.decrypt(encryptedHex, ivHex, tagHex, getPrimaryEncryptionKey());
    } catch (primaryErr) {
      // Attempt legacy key derivation fallback
      try {
        return this.decrypt(encryptedHex, ivHex, tagHex, getLegacyEncryptionKey());
      } catch {
        throw primaryErr;
      }
    }
  }

  /**
   * Re-encrypts legacy ciphertext with a newly generated target key and fresh IV.
   * Asserts in-memory decryption integrity before returning.
   */
  public reencrypt(
    encryptedHex: string,
    ivHex: string,
    tagHex: string,
    targetKey: Buffer
  ): EncryptedData {
    // 1. Decrypt using legacy derivation
    const plainText = this.decrypt(encryptedHex, ivHex, tagHex, getLegacyEncryptionKey());

    // 2. Encrypt with target key using fresh IV and auth tag
    const reencrypted = this.encrypt(plainText, targetKey);

    // 3. Verify immediate decryption with target key
    const verified = this.decrypt(reencrypted.encrypted, reencrypted.iv, reencrypted.tag, targetKey);
    if (verified !== plainText) {
      throw new Error('Cryptographic verification failed during re-encryption');
    }

    return reencrypted;
  }
}

export const encryptionService = new EncryptionService();
