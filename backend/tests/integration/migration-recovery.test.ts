import { describe, it, expect } from 'vitest';
import { runMigration, findAuthUserByEmail } from '../../scripts/migrateToSupabase.js';

describe('Migration Engine, Guarding & Recovery Integration Tests', () => {
  it('should refuse to operate against production by default without confirmation flag', async () => {
    await expect(
      runMigration({ target: 'production', confirmProduction: false })
    ).rejects.toThrow('Execution against production is rejected by default');
  });

  it('should successfully execute dry-run migration without remote writes', async () => {
    const result = await runMigration({ target: 'dry-run' });
    expect(result.success).toBe(true);
    expect(result.manifest).toHaveProperty('createdAuthUserIds');
    expect(result.manifest).toHaveProperty('createdProviderIds');
  });

  it('should handle paginated case-insensitive email matching safely', async () => {
    const mockUsersPage1 = Array.from({ length: 100 }, (_, i) => ({
      id: `user-${i}`,
      email: `user${i}@example.com`,
    }));
    const mockUsersPage2 = [
      { id: 'target-uuid', email: 'TARGET.USER@EXAMPLE.COM' },
    ];

    const mockAdmin = {
      auth: {
        admin: {
          listUsers: async ({ page }: { page: number }) => {
            if (page === 1) return { data: { users: mockUsersPage1 }, error: null };
            if (page === 2) return { data: { users: mockUsersPage2 }, error: null };
            return { data: { users: [] }, error: null };
          },
        },
      },
    };

    const found = await findAuthUserByEmail(mockAdmin as any, 'target.user@example.com');
    expect(found).not.toBeNull();
    expect(found?.id).toBe('target-uuid');

    const notFound = await findAuthUserByEmail(mockAdmin as any, 'unknown@example.com');
    expect(notFound).toBeNull();
  });
});
