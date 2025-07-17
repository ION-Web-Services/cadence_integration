import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the webhook payload from GoHighLevel
    const webhookData = req.body;
    
    console.log('Received GHL webhook:', JSON.stringify(webhookData, null, 2));

    // Forward the webhook to your n8n endpoint
    const n8nResponse = await fetch('https://rail.ionws.com/webhook/ghl-message-sent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: 'gohighlevel',
        timestamp: new Date().toISOString(),
        data: webhookData
      })
    });

    if (!n8nResponse.ok) {
      console.error('Failed to forward to n8n:', n8nResponse.status, n8nResponse.statusText);
      return res.status(500).json({ error: 'Failed to forward webhook' });
    }

    console.log('Successfully forwarded webhook to n8n');
    
    // Return success to GoHighLevel
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 