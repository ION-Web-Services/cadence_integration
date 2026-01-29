import { createClient } from '@supabase/supabase-js';
import type { GHLInstallation, DncCacheEntry } from '@/types';

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
export const CADENCE_DNC_CACHE_TABLE = 'cadence_dnc_cache';

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

// Helper functions for DNC Cache
export const dncCache = {
  // Get cached DNC result by phone number
  async get(phone: string): Promise<DncCacheEntry | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from(CADENCE_DNC_CACHE_TABLE)
        .select('*')
        .eq('phone', phone)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found - not an error, just cache miss
          return null;
        }
        console.error('Error fetching DNC cache:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching DNC cache:', error);
      return null;
    }
  },

  // Upsert DNC cache entry (insert or update)
  async upsert(entry: Omit<DncCacheEntry, 'id' | 'created_at' | 'updated_at'>): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin
        .from(CADENCE_DNC_CACHE_TABLE)
        .upsert(
          {
            ...entry,
            updated_at: new Date().toISOString()
          },
          {
            onConflict: 'phone'
          }
        );

      if (error) {
        console.error('Error upserting DNC cache:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error upserting DNC cache:', error);
      return false;
    }
  },

  // Update only blacklist fields
  async updateBlacklist(phone: string, isOnBlacklist: boolean): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin
        .from(CADENCE_DNC_CACHE_TABLE)
        .upsert(
          {
            phone,
            is_company_blacklist: isOnBlacklist,
            blacklist_checked_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            onConflict: 'phone'
          }
        );

      if (error) {
        console.error('Error updating blacklist cache:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating blacklist cache:', error);
      return false;
    }
  },

  // Update only national DNC fields
  async updateNational(
    phone: string,
    isOnNational: boolean,
    reason?: string,
    expiry?: string
  ): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin
        .from(CADENCE_DNC_CACHE_TABLE)
        .upsert(
          {
            phone,
            is_national_dnc: isOnNational,
            national_dnc_reason: reason || null,
            national_dnc_expiry: expiry || null,
            national_checked_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            onConflict: 'phone'
          }
        );

      if (error) {
        console.error('Error updating national DNC cache:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating national DNC cache:', error);
      return false;
    }
  },

  // Delete old cache entries (for cleanup cron)
  async deleteOldEntries(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      const cutoffISO = cutoffDate.toISOString();

      const { data, error } = await supabaseAdmin
        .from(CADENCE_DNC_CACHE_TABLE)
        .delete()
        .lt('blacklist_checked_at', cutoffISO)
        .lt('national_checked_at', cutoffISO)
        .select('id');

      if (error) {
        console.error('Error deleting old DNC cache entries:', error);
        return 0;
      }

      return data?.length || 0;
    } catch (error) {
      console.error('Error deleting old DNC cache entries:', error);
      return 0;
    }
  },

  // Get cache statistics
  async getStats(): Promise<{
    total: number;
    blacklisted: number;
    nationalDnc: number;
  }> {
    try {
      const { data, error } = await supabaseAdmin
        .from(CADENCE_DNC_CACHE_TABLE)
        .select('is_company_blacklist, is_national_dnc');

      if (error) {
        console.error('Error fetching DNC cache stats:', error);
        return { total: 0, blacklisted: 0, nationalDnc: 0 };
      }

      const stats = {
        total: data?.length || 0,
        blacklisted: 0,
        nationalDnc: 0
      };

      data?.forEach(item => {
        if (item.is_company_blacklist) stats.blacklisted++;
        if (item.is_national_dnc) stats.nationalDnc++;
      });

      return stats;
    } catch (error) {
      console.error('Error fetching DNC cache stats:', error);
      return { total: 0, blacklisted: 0, nationalDnc: 0 };
    }
  }
};
