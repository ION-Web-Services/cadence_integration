// Simple webhook registration for GoHighLevel
export interface GHLWebhookRegistration {
  url: string;
  events: string[];
  locationId: string;
}

export class GHLWebhooks {
  // Register a webhook with GoHighLevel
  static async registerWebhook(
    accessToken: string, 
    registration: GHLWebhookRegistration
  ): Promise<{ success: boolean; webhookId?: string; error?: string }> {
    try {
      const response = await fetch('https://services.leadconnectorhq.com/webhooks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28'
        },
        body: JSON.stringify({
          url: registration.url,
          events: registration.events,
          locationId: registration.locationId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Webhook registration failed', { status: response.status, data });
        return { 
          success: false, 
          error: `Registration failed: ${response.status} - ${JSON.stringify(data)}` 
        };
      }

      console.log('Webhook registered successfully', data);
      return { 
        success: true, 
        webhookId: data.id || data.webhookId 
      };

    } catch (error) {
      console.error('Webhook registration error', error);
      return { 
        success: false, 
        error: `Registration error: ${error}` 
      };
    }
  }
} 