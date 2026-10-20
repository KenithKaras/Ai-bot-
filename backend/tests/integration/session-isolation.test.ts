import { describe, it, expect, beforeEach } from 'vitest';
import { createIsolatedAuthClient } from '../../src/services/supabaseClient.js';
import { config } from '../../src/config.js';

describe('Server-Side Supabase Auth Session Isolation Tests', () => {
  beforeEach(() => {
    config.supabaseUrl = 'https://mock-test-project.supabase.co';
    config.supabaseSecretKey = 'mock-service-role-key-test-12345';
    config.supabasePublishableKey = 'sb_publishable_mock_test_12345';
  });

  it('should instantiate distinct client instances for each request with zero session persistence', () => {
    const clientA = createIsolatedAuthClient();
    const clientB = createIsolatedAuthClient();

    // Must be completely separate object instances in memory
    expect(clientA).not.toBe(clientB);

    // Verify auth configuration enforces server isolation
    expect((clientA.auth as any).persistSession).toBe(false);
    expect((clientA.auth as any).autoRefreshToken).toBe(false);
    expect((clientA.auth as any).detectSessionInUrl).toBe(false);

    expect((clientB.auth as any).persistSession).toBe(false);
    expect((clientB.auth as any).autoRefreshToken).toBe(false);
  });
});
