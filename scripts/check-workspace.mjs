import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

// Parse .env manually
const envContent = readFileSync('.env', 'utf-8');
const dbUrl = envContent.split('\n').find(line => line.startsWith('DATABASE_URL=')).split('=').slice(1).join('=');

const sql = neon(dbUrl);

const workspaceId = process.argv[2] || 'b787b925-42dc-4bab-9d3d-11e8d082c222';

const result = await sql`SELECT id, name, status, user_id FROM workspaces WHERE id = ${workspaceId}`;
console.log('Workspace:', JSON.stringify(result, null, 2));

const instance = await sql`SELECT * FROM workspace_instances WHERE workspace_id = ${workspaceId}`;
console.log('Instance:', JSON.stringify(instance, null, 2));

// If status is provisioning, offer to reset
if (result[0]?.status === 'provisioning') {
  console.log('\n⚠️  Workspace is stuck in "provisioning" status!');
  if (process.argv[3] === '--fix') {
    await sql`UPDATE workspaces SET status = 'ready' WHERE id = ${workspaceId}`;
    console.log('✅ Reset status to "ready"');
  } else {
    console.log('Run with --fix to reset status to "ready"');
  }
}
