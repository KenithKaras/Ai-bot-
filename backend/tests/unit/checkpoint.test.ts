import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  persistCheckpointDurable,
  type CheckpointData,
} from '../../scripts/migrateToSupabase.js';

describe('Checkpoint Durability & Recovery Unit Tests', () => {
  let tempDir: string;
  let checkpointPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radox-checkpoint-test-'));
    checkpointPath = path.join(tempDir, 'migration-checkpoint.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('should persist checkpoint atomically with fsync and rename', () => {
    const data: CheckpointData = {
      migrationRunId: 'mig_run_test_12345',
      targetEnv: 'test',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedStep: 'INIT',
      userIdMap: { 'user-1': 'sb-user-1' },
      manifest: {
        createdAuthUserIds: ['sb-user-1'],
        createdProfileIds: ['sb-user-1'],
        createdProviderIds: ['prov-1'],
      },
    };

    persistCheckpointDurable(checkpointPath, data);

    expect(fs.existsSync(checkpointPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
    expect(parsed.migrationRunId).toBe('mig_run_test_12345');
    expect(parsed.manifest.createdProviderIds).toContain('prov-1');

    // Verify no temporary files left behind
    const remainingFiles = fs.readdirSync(tempDir);
    expect(remainingFiles).toEqual(['migration-checkpoint.json']);
  });

  it('should preserve and update existing checkpoint data safely', () => {
    const initial: CheckpointData = {
      migrationRunId: 'mig_run_stable',
      targetEnv: 'test',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedStep: 'INIT',
      userIdMap: {},
      manifest: {
        createdAuthUserIds: [],
        createdProfileIds: [],
        createdProviderIds: [],
      },
    };

    persistCheckpointDurable(checkpointPath, initial);

    // Update
    initial.manifest.createdAuthUserIds.push('auth-uuid-1');
    initial.completedStep = 'AUTH_USERS';
    persistCheckpointDurable(checkpointPath, initial);

    const reloaded = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
    expect(reloaded.migrationRunId).toBe('mig_run_stable');
    expect(reloaded.completedStep).toBe('AUTH_USERS');
    expect(reloaded.manifest.createdAuthUserIds).toContain('auth-uuid-1');
  });
});
