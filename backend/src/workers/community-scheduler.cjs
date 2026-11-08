// Community weekly competition scheduler — automated, idempotent, fail-closed.
//
// Runs as a PM2 fork process with a 60s tick (same pattern as sweeper.cjs).
// Every tick it advances both competitions (testimonial + referral) through their
// lifecycle: ensure open -> snapshot leaderboard -> detect closing -> finalize
// provisional winners -> notify admins. Competition status transitions are
// atomic in the DB, so overlapping ticks and server restarts are safe: a
// competition can only be finalized once, and an award can only be paid once
// (weekly_bonus_transactions.award_id UNIQUE + ledger idempotency key).
//
// Usage: node src/workers/community-scheduler.cjs [--once]
// PM2:   cron_restart '*/15 * * * *'  (or rely on the fork process's setInterval)

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const community = require('../lib/community');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('connect', (c) => c.query('SET search_path TO gatedp2p, public').catch(() => {}));
const ONCE = process.argv.includes('--once');

// Advisory lock key for the community scheduler tick. Only one tick runs at a
// time across all scheduler instances.
const LOCK_KEY = pgp_int8('community_scheduler_tick');

function pgp_int8(s) {
  // pg_advisory_xact_lock takes a bigint; derive a stable 64-bit from a string.
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Fold into signed 64-bit range.
  return h > 0x7fffffff ? h - 0x100000000 : h;
}

async function tryAcquireLock(db) {
  const r = await db.query(`select pg_try_advisory_xact_lock($1) as ok`, [LOCK_KEY]);
  return r.rows[0].ok === true;
}

async function runTick() {
  const started = new Date();
  let tickLog = { started: started.toISOString() };
  const client = await pool.connect();
  try {
    // Begin + advisory lock so a tick is atomic and single-instance.
    await client.query('BEGIN');
    const locked = await tryAcquireLock(client);
    if (!locked) {
      await client.query('ROLLBACK');
      tickLog.skipped = 'another tick holds the lock';
      console.log('[community-scheduler] tick skipped', tickLog);
      return;
    }

    for (const kind of community.KINDS) {
      try {
        // 1. Ensure current competition is open (creates next week's if needed).
        const ensured = await community.ensureCompetition(kind, { now: started, q: client });
        if (!ensured) {
          console.error(`[community-scheduler] no active bonus config for ${kind}`);
          continue;
        }
        const { competition, config } = ensured;
        tickLog[kind] = { week_key: competition.week_key, status: competition.status };

        // 2. While open: refresh the live leaderboard snapshot.
        if (competition.status === 'open') {
          await community.snapshotCompetition(competition, config, { q: client, now: started });
          await community.auditCompetition(client, competition.id, null, 'competition.leaderboard_refreshed', {
            kind, week_key: competition.week_key,
          });
        }

        // 3. At closing: finalize provisional winners (idempotent).
        if (competition.status === 'closing') {
          const fin = await community.finalizeCompetition(competition.id, {
            actorId: null, q: client, now: started,
          });
          tickLog[kind].finalized = !!fin.awards.length;
          tickLog[kind].awards = fin.awards.map((a) => ({ position: a.position, amount: a.amount }));

          // Notify admins that results require review.
          if (fin.awards.length > 0 && !fin.replayed) {
            const admins = await client.query(
              `select distinct ur.user_id from user_roles ur
               join roles rl on rl.id = ur.role_id
               where rl.name in ('super_admin','finance')`
            );
            for (const row of admins.rows) {
              await community.pushNotification(client, row.user_id, {
                title: `Weekly ${kind} competition results ready`,
                body: `Provisional winners for ${kind} week ${competition.week_key} require review. Approve or disqualify each award in the admin dashboard.`,
                category: 'competition_closing',
                link: `/admin/community?tab=competition`,
                meta: { kind, week_key: competition.week_key, competition_id: competition.id, awards: fin.awards.length },
              });
            }
            await community.publishAnnouncement(client, {
              category: 'competition_closing',
              title: `${kind.charAt(0).toUpperCase() + kind.slice(1)} competition closing`,
              body: `The ${kind} competition for week ${competition.week_key} is closing. Provisional winners are pending admin review.`,
              audience: 'admins',
              competition_id: competition.id,
              meta: { kind, week_key: competition.week_key },
            });
          }
        }

        // 4. While verifying: nothing to do — admin must approve/disqualify/pay.
        // The scheduler never auto-approves or auto-pays.

      } catch (e) {
        console.error(`[community-scheduler] ${kind} tick failed:`, e.message);
        tickLog[kind] = { error: e.message };
      }
    }

    await client.query('COMMIT');
    tickLog.finished = new Date().toISOString();
    tickLog.duration_ms = tickLog.finished && new Date(tickLog.finished).getTime() - started.getTime();
    console.log('[community-scheduler] tick complete', JSON.stringify(tickLog));
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[community-scheduler] tick failed:', e.message);
  } finally {
    client.release();
  }
}

(async () => {
  if (ONCE) {
    await runTick();
    await pool.end();
    process.exit(0);
  }
  console.log('[community-scheduler] loop every 60s (Ctrl+C to stop)');
  setInterval(runTick, 60_000);
  // Also run immediately on start so the first week is seeded without waiting.
  runTick().catch(() => {});
})();
