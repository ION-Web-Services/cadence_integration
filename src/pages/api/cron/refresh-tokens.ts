import type { NextApiRequest, NextApiResponse } from 'next';
import { refreshExpiringTokens } from '@/lib/token-manager';
import { log, logError } from '@/utils/helpers';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET requests (Vercel cron jobs use GET)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify the cron secret for security
  const authHeader = req.headers.authorization;
  const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;
  
  if (authHeader !== expectedSecret) {
    logError('Unauthorized cron job access attempt', { 
      provided: authHeader ? 'present' : 'missing',
      expected: 'Bearer [REDACTED]'
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    log('Starting scheduled token refresh job');

    // Perform batch token refresh
    const result = await refreshExpiringTokens();

    // Log results
    log('Token refresh job completed', {
      success: result.success,
      failed: result.failed
    });

    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Token refresh job completed',
      results: {
        successful: result.success,
        failed: result.failed,
        totalProcessed: result.success + result.failed
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logError('Token refresh job failed', error);
    
    return res.status(500).json({
      success: false,
      error: 'Token refresh job failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}
