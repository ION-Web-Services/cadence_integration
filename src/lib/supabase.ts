import { createClient } from '@supabase/supabase-js';
import type { GHLInstallation } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Client for public operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for server operations
export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: { autoRefreshToken: false, persistSession: false }
  }
);

// Database table names
export const CADENCE_INSTALLATIONS_TABLE = 'cadence_installations';
export const MESSAGE_QUEUE_TABLE = 'message_queue';

// Helper functions for Cadence installations
export const cadenceInstallations = {
  // Create a new installation
  async create(installation: Omit<GHLInstallation, 'id' | 'installed_at' | 'updated_at'>): Promise<GHLInstallation | null> {
    const { data, error } = await supabaseAdmin
      .from(CADENCE_INSTALLATIONS_TABLE)
      .insert(installation)
      .select()
      .single();

    if (error) {
      console.error('Error creating GHL installation:', error);
      return null;
    }

    return data;
  },

  // Get installation by user and location
  async getByUserAndLocation(userId: string, locationId: string): Promise<GHLInstallation | null> {
    try {
      const { data, error } = await supabase
        .from(CADENCE_INSTALLATIONS_TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('location_id', locationId)
        .eq('is_active', true)
        .single();

      if (error) {
        console.error('Error fetching GHL installation:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching GHL installation:', error);
      return null;
    }
  },

  // Update tokens for an installation
  async updateTokens(userId: string, locationId: string, tokens: {
    access_token: string;
    refresh_token: string;
    expires_at: string;
  }): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin
        .from(CADENCE_INSTALLATIONS_TABLE)
        .update({
          ...tokens,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('location_id', locationId);

      if (error) {
        console.error('Error updating GHL installation tokens:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating GHL installation tokens:', error);
      return false;
    }
  },

  // Get installations that need token refresh (expiring soon)
  async getExpiringInstallations(): Promise<GHLInstallation[]> {
    const fiveMinutesFromNow = new Date();
    fiveMinutesFromNow.setMinutes(fiveMinutesFromNow.getMinutes() + 5);

    const { data, error } = await supabase
      .from(CADENCE_INSTALLATIONS_TABLE)
      .select('*')
      .eq('is_active', true)
      .lt('expires_at', fiveMinutesFromNow.toISOString());

    if (error) {
      console.error('Error fetching expiring installations:', error);
      return [];
    }

    return data || [];
  },

  // Get all installations
  async getAll(): Promise<GHLInstallation[]> {
    try {
      const { data, error } = await supabase
        .from(CADENCE_INSTALLATIONS_TABLE)
        .select('*')
        .order('installed_at', { ascending: false });

      if (error) {
        console.error('Error fetching all installations:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching all installations:', error);
      return [];
    }
  },

  // Deactivate an installation
  async deactivate(userId: string, locationId: string): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin
        .from(CADENCE_INSTALLATIONS_TABLE)
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('location_id', locationId);

      if (error) {
        console.error('Error deactivating GHL installation:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error deactivating GHL installation:', error);
      return false;
    }
  }
};

// Helper functions for Message Queue
export const messageQueue = {
  // Add message to queue
  async add(message: {
    installation_id: string;
    location_id: string;
    user_id: string;
    message_data: Record<string, unknown>;
    priority?: number;
  }): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin
        .from(MESSAGE_QUEUE_TABLE)
        .insert({
          installation_id: message.installation_id,
          location_id: message.location_id,
          user_id: message.user_id,
          message_data: message.message_data,
          priority: message.priority || 1,
          status: 'pending',
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error adding message to queue:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error adding message to queue:', error);
      return false;
    }
  },

  // Get pending messages for processing (with rate limiting)
  async getPendingMessages(limit: number = 50): Promise<Array<{
    id: number;
    installation_id: string;
    location_id: string;
    user_id: string;
    message_data: Record<string, unknown>;
    priority: number;
    created_at: string;
  }>> {
    try {
      const { data, error } = await supabaseAdmin
        .from(MESSAGE_QUEUE_TABLE)
        .select('*')
        .eq('status', 'pending')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) {
        console.error('Error fetching pending messages:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching pending messages:', error);
      return [];
    }
  },

  // Mark message as processed
  async markProcessed(id: number, result?: Record<string, unknown>): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin
        .from(MESSAGE_QUEUE_TABLE)
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
          result: result || null
        })
        .eq('id', id);

      if (error) {
        console.error('Error marking message as processed:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error marking message as processed:', error);
      return false;
    }
  },

  // Mark message as failed
  async markFailed(id: number, error_message?: string): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin
        .from(MESSAGE_QUEUE_TABLE)
        .update({
          status: 'failed',
          processed_at: new Date().toISOString(),
          error_message: error_message || null
        })
        .eq('id', id);

      if (error) {
        console.error('Error marking message as failed:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error marking message as failed:', error);
      return false;
    }
  },

  // Get queue statistics
  async getStats(): Promise<{
    pending: number;
    processed: number;
    failed: number;
    total: number;
  }> {
    try {
      const { data, error } = await supabaseAdmin
        .from(MESSAGE_QUEUE_TABLE)
        .select('status');

      if (error) {
        console.error('Error fetching queue stats:', error);
        return { pending: 0, processed: 0, failed: 0, total: 0 };
      }

      const stats = {
        pending: 0,
        processed: 0,
        failed: 0,
        total: data?.length || 0
      };

      data?.forEach(item => {
        if (item.status === 'pending') stats.pending++;
        else if (item.status === 'processed') stats.processed++;
        else if (item.status === 'failed') stats.failed++;
      });

      return stats;
    } catch (error) {
      console.error('Error fetching queue stats:', error);
      return { pending: 0, processed: 0, failed: 0, total: 0 };
    }
  }
};
