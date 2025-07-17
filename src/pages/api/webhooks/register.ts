import type { NextApiRequest, NextApiResponse } from 'next';
// import { GHLWebhooks } from '@/lib/ghl-webhooks';
// import { cadenceInstallations } from '@/lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return res.status(200).json({ message: 'Webhook registration endpoint - coming soon' });
} 