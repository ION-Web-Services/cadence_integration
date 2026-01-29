import type { NextApiRequest, NextApiResponse } from 'next';
import { dncCache } from '@/lib/supabase';

/**
 * Cron job to clean up old DNC cache entries
 * Runs weekly (Sunday 3am) via Vercel cron
 * Deletes entries where both blacklist and national checks are older than 30 days
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
    
    console.log(`DNC cache cleanup complete. Deleted ${deletedCount} old entries.`);
    
    // Also get current stats for monitoring
    const stats = await dncCache.getStats();
    
    return res.status(200).json({
      success: true,
      deleted: deletedCount,
      remaining: stats
    });
  } catch (error) {
    console.error('DNC cache cleanup error:', error);
    return res.status(500).json({ error: 'Cleanup failed' });
  }
}
