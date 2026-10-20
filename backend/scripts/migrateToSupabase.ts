import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { encryptionService, getLegacyEncryptionKey, getPrimaryEncryptionKey } from '../src/services/encryptionService.js';

// Load environment configuration
const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env'),
];
for (const p of envPaths) {
  if (fs.existsSync(p)) dotenv.config({ path: p });
}

export interface CheckpointData {
  migrationRunId: string;
  targetEnv: string;
  startedAt: string;
  updatedAt: string;
  completedStep: 'INIT' | 'BACKUP_VERIFIED' | 'CONFLICT_SCAN' | 'AUTH_USERS' | 'PROFILES' | 'PROVIDERS' | 'VALIDATED';
  userIdMap: Record<string, string>; // sqliteUserId -> supabaseUserId
  manifest: {
    createdAuthUserIds: string[];
    createdProfileIds: string[];
    createdProviderIds: string[];
  };
}

const baseDataDir = fs.existsSync(path.resolve(process.cwd(), 'backend/data'))
  ? path.resolve(process.cwd(), 'backend/data')
  : path.resolve(process.cwd(), 'data');

const CHECKPOINT_PATH = path.join(baseDataDir, 'migration-checkpoint.json');
const SQLITE_DB_PATH = path.join(baseDataDir, 'app.db');

/**
 * Persists checkpoint with true filesystem durability (fsync + atomic rename)
 */
export function persistCheckpointDurable(checkpointPath: string, data: CheckpointData): void {
  data.updatedAt = new Date().toISOString();
  const dir = path.dirname(checkpointPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tmpPath = path.join(dir, `migration-checkpoint.json.tmp.${process.pid}.${Date.now()}`);
  const fd = fs.openSync(tmpPath, 'wx');
  try {
    fs.writeSync(fd, JSON.stringify(data, null, 2), 0, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  fs.renameSync(tmpPath, checkpointPath);
  try {
    const dirFd = fs.openSync(dir, 'r');
    fs.fsyncSync(dirFd);
    fs.closeSync(dirFd);
  } catch {
    // Non-fatal on platforms where directory descriptors cannot be synced
  }
}

/**
 * Documented paginated case-insensitive email lookup
 */
export async function findAuthUserByEmail(
  supabaseAdmin: SupabaseClient,
  targetEmail: string
): Promise<User | null> {
  const normalizedTarget = targetEmail.trim().toLowerCase();
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Supabase Auth lookup error: ${error.message}`);

    const match = data.users.find(
      (u) => (u.email || '').trim().toLowerCase() === normalizedTarget
    );
    if (match) return match;

    if (data.users.length < perPage) break;
    page++;
  }

  return null;
}

/**
 * Main migration execution controller
 */
export async function runMigration(options: {
  target: 'dry-run' | 'test' | 'staging' | 'production';
  confirmProduction?: boolean;
  delta?: boolean;
}): Promise<{ success: boolean; manifest: CheckpointData['manifest'] }> {
  console.log(`====================================================`);
  console.log(`🚀 Radox AI — Supabase Staging Migration Engine`);
  console.log(`🎯 Target Environment: ${options.target.toUpperCase()}`);
  if (options.delta) {
    console.log(`🔄 Mode: Safe Delta / Resumption Migration`);
  }
  console.log(`====================================================\n`);

  // Guard: Refuse production by default
  if (options.target === 'production' && !options.confirmProduction) {
    throw new Error(
      'Execution against production is rejected by default. Provide explicit confirmation flag --confirm-production=yes.'
    );
  }

  // Verify SQLite database exists
  if (!fs.existsSync(SQLITE_DB_PATH)) {
    throw new Error(`SQLite database not found at: ${SQLITE_DB_PATH}`);
  }

  // 1. Create verified pre-migration SQLite backup
  const timestamp = Date.now();
  const backupPath = `${SQLITE_DB_PATH}.bak.${timestamp}`;
  fs.copyFileSync(SQLITE_DB_PATH, backupPath);
  const verifyDb = new Database(backupPath, { readonly: true });
  const sqliteUserCount = (verifyDb.prepare('SELECT count(*) as count FROM users').get() as any).count;
  const sqliteProvCount = (verifyDb.prepare('SELECT count(*) as count FROM providers').get() as any).count;
  verifyDb.close();
  console.log(`✅ Pre-migration SQLite backup verified: ${path.basename(backupPath)}`);
  console.log(`📊 Source records found: ${sqliteUserCount} users, ${sqliteProvCount} providers.\n`);

  // 2. Load or Initialize Checkpoint with Stable migrationRunId
  let checkpoint: CheckpointData;
  if (fs.existsSync(CHECKPOINT_PATH)) {
    try {
      const raw = fs.readFileSync(CHECKPOINT_PATH, 'utf8');
      checkpoint = JSON.parse(raw);
      console.log(`🔄 Resuming existing migration run: ${checkpoint.migrationRunId}`);
    } catch {
      const corruptedBackup = `${CHECKPOINT_PATH}.corrupted.${Date.now()}`;
      fs.renameSync(CHECKPOINT_PATH, corruptedBackup);
      throw new Error(`Checkpoint corrupted. Archived to ${corruptedBackup}. Manual review required.`);
    }
  } else {
    checkpoint = {
      migrationRunId: `mig_run_${crypto.randomUUID()}`,
      targetEnv: options.target,
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
    persistCheckpointDurable(CHECKPOINT_PATH, checkpoint);
    console.log(`🆕 Initialized new migration run ID: ${checkpoint.migrationRunId}`);
  }

  if (options.target === 'dry-run') {
    console.log(`\n🔍 [DRY-RUN COMPLETE] Pre-migration checks passed. No remote writes performed.`);
    return { success: true, manifest: checkpoint.manifest };
  }

  // 3. Connect to Supabase Admin Client
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseSecret) {
    throw new Error('Supabase credentials missing: SUPABASE_URL and SUPABASE_SECRET_KEY required.');
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseSecret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const db = new Database(SQLITE_DB_PATH, { readonly: true });
  const users = db.prepare('SELECT id, email, name, created_at, updated_at FROM users').all() as any[];
  const providers = db.prepare('SELECT * FROM providers').all() as any[];

  // 4. Pre-Migration Conflict Scan
  console.log(`🔎 Scanning Supabase for pre-existing account conflicts...`);
  for (const u of users) {
    const existing = await findAuthUserByEmail(supabaseAdmin, u.email);
    if (existing) {
      const runTag = existing.app_metadata?.migration_run_id;
      if (runTag === checkpoint.migrationRunId) {
        // Safely reconcile previously created user from this exact run
        checkpoint.userIdMap[u.id] = existing.id;
        if (!checkpoint.manifest.createdAuthUserIds.includes(existing.id)) {
          checkpoint.manifest.createdAuthUserIds.push(existing.id);
        }
      } else {
        throw new Error(
          `CONFLICT HALT: Email '${u.email}' already exists in target Supabase project without matching migrationRunId. Never adopting or modifying pre-existing accounts.`
        );
      }
    }
  }
  checkpoint.completedStep = 'CONFLICT_SCAN';
  persistCheckpointDurable(CHECKPOINT_PATH, checkpoint);

  // 5. Migrate Auth Users & Profiles
  console.log(`👤 Migrating Auth users and profiles...`);
  for (const u of users) {
    let authUserId = checkpoint.userIdMap[u.id];

    if (!authUserId) {
      // Create user in GoTrue with random barrier password (JIT flow synchronizes on first login)
      const randomBarrierPassword = crypto.randomBytes(32).toString('hex');
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: u.email.toLowerCase(),
        password: randomBarrierPassword,
        email_confirm: true,
        user_metadata: { name: u.name },
        app_metadata: {
          migration_run_id: checkpoint.migrationRunId,
          migrated_from: 'sqlite',
          pwd_sync_completed: false,
        },
      });

      if (authErr || !authUser.user) {
        throw new Error(`Failed to create Auth user '${u.email}': ${authErr?.message}`);
      }

      authUserId = authUser.user.id;
      checkpoint.userIdMap[u.id] = authUserId;
      checkpoint.manifest.createdAuthUserIds.push(authUserId);
      persistCheckpointDurable(CHECKPOINT_PATH, checkpoint);
    }

    // Upsert public.profiles row
    if (!checkpoint.manifest.createdProfileIds.includes(authUserId)) {
      const { error: profErr } = await supabaseAdmin.from('profiles').upsert({
        id: authUserId,
        email: u.email.toLowerCase(),
        name: u.name,
        sync_completed: false,
        sync_lock_until: null,
        sync_lock_owner: null,
        migration_run_id: checkpoint.migrationRunId,
        created_at: new Date(u.created_at).toISOString(),
        updated_at: new Date(u.updated_at).toISOString(),
      });

      if (profErr) {
        throw new Error(`Failed to create profile for user '${u.email}': ${profErr.message}`);
      }

      checkpoint.manifest.createdProfileIds.push(authUserId);
      persistCheckpointDurable(CHECKPOINT_PATH, checkpoint);
    }
  }

  // 6. Migrate Providers with Re-encryption
  console.log(`🔐 Re-encrypting and migrating provider credentials...`);
  const targetKey = getPrimaryEncryptionKey();

  for (const p of providers) {
    if (checkpoint.manifest.createdProviderIds.includes(p.id)) {
      continue; // Skip already migrated
    }

    const mappedUserId = checkpoint.userIdMap[p.user_id];
    if (!mappedUserId) {
      throw new Error(`Integrity violation: Provider ${p.name} (${p.id}) has unmapped owner ${p.user_id}`);
    }

    // Re-encrypt from legacy key to target key with fresh IV and tag
    const reencrypted = encryptionService.reencrypt(
      p.encrypted_api_key,
      p.key_iv,
      p.key_tag,
      targetKey
    );

    const { error: provErr } = await supabaseAdmin.from('providers').insert({
      id: p.id,
      user_id: mappedUserId,
      name: p.name,
      base_url: p.base_url,
      encrypted_api_key: reencrypted.encrypted,
      key_iv: reencrypted.iv,
      key_tag: reencrypted.tag,
      key_preview: reencrypted.preview,
      default_model: p.default_model,
      is_default: Boolean(p.is_default),
      migration_run_id: checkpoint.migrationRunId,
      created_at: new Date(p.created_at).toISOString(),
      updated_at: new Date(p.updated_at).toISOString(),
    });

    if (provErr) {
      throw new Error(`Failed to insert provider ${p.name}: ${provErr.message}`);
    }

    checkpoint.manifest.createdProviderIds.push(p.id);
    persistCheckpointDurable(CHECKPOINT_PATH, checkpoint);
  }

  // 7. Scoped Post-Migration Validation
  console.log(`✅ Running scoped post-migration validation...`);
  const { count: authCount } = await supabaseAdmin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .in('id', checkpoint.manifest.createdProfileIds);

  const { count: provCount } = await supabaseAdmin
    .from('providers')
    .select('id', { count: 'exact', head: true })
    .in('id', checkpoint.manifest.createdProviderIds);

  if (authCount !== sqliteUserCount) {
    throw new Error(`Validation failed: Profile count (${authCount}) does not match source users (${sqliteUserCount})`);
  }

  if (provCount !== sqliteProvCount) {
    throw new Error(`Validation failed: Provider count (${provCount}) does not match source providers (${sqliteProvCount})`);
  }

  checkpoint.completedStep = 'VALIDATED';
  persistCheckpointDurable(CHECKPOINT_PATH, checkpoint);
  db.close();

  console.log(`\n🎉 Staging migration completed successfully!`);
  console.log(`Manifest: ${JSON.stringify(checkpoint.manifest, null, 2)}`);

  return { success: true, manifest: checkpoint.manifest };
}

// CLI execution wrapper
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const targetArg = (process.argv.find((a) => a.startsWith('--target='))?.split('=')[1] || 'dry-run') as any;
  const confirmProd = process.argv.includes('--confirm-production=yes');
  const isDelta = process.argv.includes('--delta');

  runMigration({ target: targetArg, confirmProduction: confirmProd, delta: isDelta })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`\n❌ Migration halted:`, err.message);
      process.exit(1);
    });
}
