import type { NextApiRequest, NextApiResponse } from 'next';
import { GHLWebhooks } from '@/lib/ghl-webhooks';
import { cadenceInstallations } from '@/lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, locationId } = req.body;

    if (!userId || !locationId) {
      return res.status(400).json({ error: 'userId and locationId are required' });
    }

    // Get the installation to get the access token
    const installation = await cadenceInstallations.getByUserAndLocation(userId, locationId);
    
    if (!installation) {
      return res.status(404).json({ error: 'Installation not found' });
    }

    if (!installation.is_active) {
      return res.status(400).json({ error: 'Installation is not active' });
    }

    // Register the webhook
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/ghl`;
    
    const result = await GHLWebhooks.registerWebhook(installation.access_token, {
      url: webhookUrl,
      events: ['OutboundMessage'], // The event we want to listen for
      locationId: locationId
    });

    if (!result.success) {
      console.error('Webhook registration failed:', result.error);
      return res.status(500).json({ 
        error: 'Failed to register webhook',
        details: result.error 
      });
    }

    console.log('Webhook registered successfully:', result.webhookId);

    return res.status(200).json({
      success: true,
      webhookId: result.webhookId,
      webhookUrl: webhookUrl,
      message: 'Webhook registered successfully'
    });

  } catch (error) {
    console.error('Webhook registration error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 