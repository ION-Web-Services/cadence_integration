import { GHLAPI } from './ghl-api';
import { log, logError } from '@/utils/helpers';

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
        logError('Webhook registration failed', { status: response.status, data });
        return { 
          success: false, 
          error: `Registration failed: ${response.status} - ${JSON.stringify(data)}` 
        };
      }

      log('Webhook registered successfully', data);
      return { 
        success: true, 
        webhookId: data.id || data.webhookId 
      };

    } catch (error) {
      logError('Webhook registration error', error);
      return { 
        success: false, 
        error: `Registration error: ${error}` 
      };
    }
  }

  // List existing webhooks for a location
  static async listWebhooks(
    accessToken: string, 
    locationId: string
  ): Promise<{ success: boolean; webhooks?: any[]; error?: string }> {
    try {
      const response = await fetch(`https://services.leadconnectorhq.com/webhooks?locationId=${locationId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Version': '2021-07-28'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        logError('Failed to list webhooks', { status: response.status, data });
        return { 
          success: false, 
          error: `List failed: ${response.status} - ${JSON.stringify(data)}` 
        };
      }

      log('Webhooks listed successfully', data);
      return { 
        success: true, 
        webhooks: data.webhooks || data 
      };

    } catch (error) {
      logError('List webhooks error', error);
      return { 
        success: false, 
        error: `List error: ${error}` 
      };
    }
  }

  // Delete a webhook
  static async deleteWebhook(
    accessToken: string, 
    webhookId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`https://services.leadconnectorhq.com/webhooks/${webhookId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Version': '2021-07-28'
        }
      });

      if (!response.ok) {
        const data = await response.json();
        logError('Failed to delete webhook', { status: response.status, data });
        return { 
          success: false, 
          error: `Delete failed: ${response.status} - ${JSON.stringify(data)}` 
        };
      }

      log('Webhook deleted successfully');
      return { success: true };

    } catch (error) {
      logError('Delete webhook error', error);
      return { 
        success: false, 
        error: `Delete error: ${error}` 
      };
    }
  }
} 