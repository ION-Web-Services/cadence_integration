import type { NextApiRequest, NextApiResponse } from 'next';
import { dncCache } from '@/lib/supabase';
import { consentEvents, dncAudit } from '@/lib/consent';

// Retention: routine inbound consent events are pruned (YES confirmations are
// kept forever as consent evidence); audit entries are kept for a year.
const CONSENT_EVENT_RETENTION_DAYS = parseInt(process.env.CONSENT_EVENT_RETENTION_DAYS || '90', 10);
const AUDIT_RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS || '365', 10);

/**
 * Cron job to clean up old DNC cache entries
 * Runs weekly (Sunday 3am) via Vercel cron
 * Deletes entries where both blacklist and national checks are older than 30 days,
 * plus prunes aged consent events and audit entries.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verify cron secret for security
  const cronSecret = req.headers['authorization']?.replace('Bearer ', '');
  
  if (cronSecret !== process.env.CRON_SECRET) {
    console.error('Unauthorized cron request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Starting DNC cache cleanup...');
    
    const deletedCount = await dncCache.deleteOldEntries(30);
    const prunedEvents = await consentEvents.pruneOld(CONSENT_EVENT_RETENTION_DAYS);
    const prunedAudit = await dncAudit.pruneOld(AUDIT_RETENTION_DAYS);

    console.log(`DNC cleanup complete. Cache: ${deletedCount}, consent events: ${prunedEvents}, audit: ${prunedAudit}`);

    // Also get current stats for monitoring
    const stats = await dncCache.getStats();

    return res.status(200).json({
      success: true,
      deleted: deletedCount,
      prunedConsentEvents: prunedEvents,
      prunedAuditEntries: prunedAudit,
      remaining: stats
    });
  } catch (error) {
    console.error('DNC cache cleanup error:', error);
    return res.status(500).json({ error: 'Cleanup failed' });
  }
}
