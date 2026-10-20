import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { CheckpointData } from './migrateToSupabase.js';

const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env'),
];
for (const p of envPaths) {
  if (fs.existsSync(p)) dotenv.config({ path: p });
}

const baseDataDir = fs.existsSync(path.resolve(process.cwd(), 'backend/data'))
  ? path.resolve(process.cwd(), 'backend/data')
  : path.resolve(process.cwd(), 'data');

const CHECKPOINT_PATH = path.join(baseDataDir, 'migration-checkpoint.json');

export async function runRollback(options: {
  confirmRollback?: boolean;
}): Promise<void> {
  console.log(`====================================================`);
  console.log(`⚠️  Radox AI — Targeted Manifest-Driven Rollback Engine`);
  console.log(`====================================================\n`);

  if (!fs.existsSync(CHECKPOINT_PATH)) {
    throw new Error(`Checkpoint file not found at ${CHECKPOINT_PATH}. No active migration manifest to roll back.`);
  }

  const raw = fs.readFileSync(CHECKPOINT_PATH, 'utf8');
  const checkpoint: CheckpointData = JSON.parse(raw);
  const manifest = checkpoint.manifest;

  if (!options.confirmRollback) {
    throw new Error('Rollback requires explicit confirmation flag --confirm-rollback=yes.');
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseSecret) {
    throw new Error('Supabase credentials missing.');
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseSecret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Rolling back migration run: ${checkpoint.migrationRunId}`);
  console.log(`Identified for targeted deletion:`);
  console.log(`- Providers: ${manifest.createdProviderIds.length}`);
  console.log(`- Profiles: ${manifest.createdProfileIds.length}`);
  console.log(`- Auth Users: ${manifest.createdAuthUserIds.length}\n`);

  // 1. Delete created providers
  if (manifest.createdProviderIds.length > 0) {
    const { error: provErr } = await supabaseAdmin
      .from('providers')
      .delete()
      .in('id', manifest.createdProviderIds);

    if (provErr) {
      console.error(`Warning: Provider deletion error: ${provErr.message}`);
    } else {
      console.log(`✅ Deleted ${manifest.createdProviderIds.length} migrated providers.`);
    }
  }

  // 2. Delete created profiles
  if (manifest.createdProfileIds.length > 0) {
    const { error: profErr } = await supabaseAdmin
      .from('profiles')
      .delete()
      .in('id', manifest.createdProfileIds);

    if (profErr) {
      console.error(`Warning: Profile deletion error: ${profErr.message}`);
    } else {
      console.log(`✅ Deleted ${manifest.createdProfileIds.length} migrated profiles.`);
    }
  }

  // 3. Delete created auth users
  for (const uid of manifest.createdAuthUserIds) {
    try {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      console.log(`✅ Deleted Auth user ${uid}`);
    } catch (e: any) {
      console.error(`Warning: Could not delete user ${uid}: ${e.message}`);
    }
  }

  // 4. Archive checkpoint file
  const archived = `${CHECKPOINT_PATH}.rolledback.${Date.now()}`;
  fs.renameSync(CHECKPOINT_PATH, archived);
  console.log(`\n✅ Rollback completed. Manifest archived to ${path.basename(archived)}.`);
}

// CLI execution wrapper
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const confirm = process.argv.includes('--confirm-rollback=yes');

  runRollback({ confirmRollback: confirm })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`\n❌ Rollback halted:`, err.message);
      process.exit(1);
    });
}
