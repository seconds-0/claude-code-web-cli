#!/usr/bin/env node
/**
 * CLI script for checking Hetzner costs
 *
 * Usage:
 *   node scripts/check-costs.mjs          # Current costs
 *   node scripts/check-costs.mjs --daily  # Today's costs
 *   node scripts/check-costs.mjs --month  # This month's costs
 *   node scripts/check-costs.mjs --events # Recent cost events
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

// Parse .env manually
const envContent = readFileSync('.env', 'utf-8');
const dbUrl = envContent.split('\n').find(line => line.startsWith('DATABASE_URL='))?.split('=').slice(1).join('=');

if (!dbUrl) {
  console.error('DATABASE_URL not found in .env');
  process.exit(1);
}

const sql = neon(dbUrl);

// Hetzner hourly rates (EUR)
const SERVER_RATES = {
  cpx11: 0.0053,
  cpx21: 0.0097,
  cpx31: 0.0179,
  cpx41: 0.0329,
  cpx51: 0.0616,
};
const VOLUME_RATE_PER_GB = 0.000055;

const args = process.argv.slice(2);

async function getCurrentCosts() {
  console.log('\n=== Current Running Costs ===\n');

  // Get running servers
  const instances = await sql`
    SELECT wi.*, w.name as workspace_name
    FROM workspace_instances wi
    JOIN workspaces w ON w.id = wi.workspace_id
    WHERE wi.status = 'running'
  `;

  // Get all volumes
  const volumes = await sql`
    SELECT wv.*, w.name as workspace_name
    FROM workspace_volumes wv
    JOIN workspaces w ON w.id = wv.workspace_id
  `;

  // Calculate hourly burn
  let serverHourlyBurn = 0;
  let volumeHourlyBurn = 0;

  console.log('Running Servers:');
  if (instances.length === 0) {
    console.log('  (none)');
  } else {
    for (const instance of instances) {
      const rate = SERVER_RATES.cpx11; // Default to cpx11
      serverHourlyBurn += rate;
      const runningHours = instance.started_at
        ? (Date.now() - new Date(instance.started_at).getTime()) / (1000 * 60 * 60)
        : 0;
      console.log(`  - ${instance.workspace_name}: Server ${instance.hetzner_server_id}`);
      console.log(`    Running: ${runningHours.toFixed(2)} hours @ €${rate}/hr = €${(runningHours * rate).toFixed(4)}`);
    }
  }

  console.log('\nVolumes:');
  if (volumes.length === 0) {
    console.log('  (none)');
  } else {
    for (const volume of volumes) {
      const sizeGb = volume.size_gb || 50;
      const rate = sizeGb * VOLUME_RATE_PER_GB;
      volumeHourlyBurn += rate;
      console.log(`  - ${volume.workspace_name}: ${sizeGb}GB @ €${rate.toFixed(6)}/hr`);
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Server hourly burn: €${serverHourlyBurn.toFixed(4)}/hr`);
  console.log(`Volume hourly burn: €${volumeHourlyBurn.toFixed(6)}/hr`);
  console.log(`Total hourly burn:  €${(serverHourlyBurn + volumeHourlyBurn).toFixed(4)}/hr`);
  console.log(`Projected daily:    €${((serverHourlyBurn + volumeHourlyBurn) * 24).toFixed(2)}`);
  console.log(`Projected monthly:  €${((serverHourlyBurn + volumeHourlyBurn) * 24 * 30).toFixed(2)}`);
}

async function getDailyCosts() {
  console.log('\n=== Today\'s Costs ===\n');

  const today = new Date().toISOString().split('T')[0];

  const snapshots = await sql`
    SELECT * FROM cost_snapshots
    WHERE date = ${today}
    ORDER BY workspace_id
  `;

  if (snapshots.length === 0) {
    console.log('No cost snapshots for today yet.');
    console.log('(Snapshots are created by running the daily snapshot job)');
    return;
  }

  let totalServer = 0;
  let totalVolume = 0;

  for (const snap of snapshots) {
    const serverCost = parseFloat(snap.server_cost) || 0;
    const volumeCost = parseFloat(snap.volume_cost) || 0;
    totalServer += serverCost;
    totalVolume += volumeCost;

    console.log(`Workspace ${snap.workspace_id || 'global'}:`);
    console.log(`  Server: €${serverCost.toFixed(4)} (${parseFloat(snap.server_hours || 0).toFixed(2)} hours)`);
    console.log(`  Volume: €${volumeCost.toFixed(4)} (${parseFloat(snap.volume_gb_hours || 0).toFixed(2)} GB-hours)`);
    console.log(`  Total:  €${(serverCost + volumeCost).toFixed(4)}`);
    console.log('');
  }

  console.log('--- Total ---');
  console.log(`Server: €${totalServer.toFixed(4)}`);
  console.log(`Volume: €${totalVolume.toFixed(4)}`);
  console.log(`Total:  €${(totalServer + totalVolume).toFixed(4)}`);
}

async function getMonthCosts() {
  console.log('\n=== This Month\'s Costs ===\n');

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

  const snapshots = await sql`
    SELECT
      date,
      SUM(CAST(server_cost AS NUMERIC)) as server_cost,
      SUM(CAST(volume_cost AS NUMERIC)) as volume_cost,
      SUM(CAST(total_cost AS NUMERIC)) as total_cost
    FROM cost_snapshots
    WHERE date >= ${monthStart}
    GROUP BY date
    ORDER BY date
  `;

  if (snapshots.length === 0) {
    console.log('No cost snapshots for this month yet.');
    return;
  }

  let grandTotal = 0;

  for (const day of snapshots) {
    const total = parseFloat(day.total_cost) || 0;
    grandTotal += total;
    console.log(`${day.date}: €${total.toFixed(4)}`);
  }

  console.log('\n--- Total ---');
  console.log(`Month to date: €${grandTotal.toFixed(2)}`);

  // Project to end of month
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysSoFar = snapshots.length;
  const avgPerDay = grandTotal / daysSoFar;
  console.log(`Daily average:  €${avgPerDay.toFixed(2)}`);
  console.log(`Projected month: €${(avgPerDay * daysInMonth).toFixed(2)}`);
}

async function getRecentEvents() {
  console.log('\n=== Recent Cost Events ===\n');

  const events = await sql`
    SELECT * FROM cost_events
    ORDER BY timestamp DESC
    LIMIT 20
  `;

  if (events.length === 0) {
    console.log('No cost events recorded yet.');
    return;
  }

  for (const event of events) {
    const rate = parseFloat(event.hourly_rate);
    const icon = event.event_type === 'start' || event.event_type === 'create' ? '🟢' : '🔴';
    console.log(`${icon} ${event.timestamp.toISOString()}`);
    console.log(`   ${event.resource_type} ${event.resource_id}: ${event.event_type} @ €${rate.toFixed(6)}/hr`);
    if (event.server_type) console.log(`   Server type: ${event.server_type}`);
    if (event.size_gb) console.log(`   Size: ${event.size_gb}GB`);
    console.log('');
  }
}

// Main
if (args.includes('--daily') || args.includes('-d')) {
  await getDailyCosts();
} else if (args.includes('--month') || args.includes('-m')) {
  await getMonthCosts();
} else if (args.includes('--events') || args.includes('-e')) {
  await getRecentEvents();
} else if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Hetzner Cost Tracking CLI

Usage:
  node scripts/check-costs.mjs           Show current running costs
  node scripts/check-costs.mjs --daily   Show today's costs
  node scripts/check-costs.mjs --month   Show this month's costs
  node scripts/check-costs.mjs --events  Show recent cost events
  node scripts/check-costs.mjs --help    Show this help
`);
} else {
  await getCurrentCosts();
}
