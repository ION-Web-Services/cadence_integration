import { GHLAPI } from './ghl-api';
import { cadenceInstallations } from './supabase';
import { calculateTokenExpiration, isTokenExpiringSoon, isTokenExpired, log, logError } from '@/utils/helpers';
import type { TokenRefreshResult } from '@/types';

// Get a valid access token for a user/location, refreshing if necessary
export async function getValidAccessToken(userId: string, locationId: string): Promise<string | null> {
  try {
    // Get the installation from database
    const installation = await cadenceInstallations.getByUserAndLocation(userId, locationId);
    
    if (!installation) {
      logError('No installation found for user/location', { userId, locationId });
      return null;
    }

    // Check if token is expired or expiring soon
    if (isTokenExpired(installation.expires_at)) {
      log('Token is expired, attempting refresh', { userId, locationId });
      
      const refreshResult = await refreshAccessToken(userId, locationId);
      if (!refreshResult.success || !refreshResult.installation) {
        logError('Failed to refresh expired token', { userId, locationId });
        return null;
      }
      
      return refreshResult.installation.access_token;
    }

    if (isTokenExpiringSoon(installation.expires_at)) {
      log('Token is expiring soon, attempting refresh', { userId, locationId });
      
      const refreshResult = await refreshAccessToken(userId, locationId);
      if (refreshResult.success && refreshResult.installation) {
        return refreshResult.installation.access_token;
      } else {
        // If refresh fails but token is still valid for a bit, use current token
        log('Refresh failed but token still valid, using current token', { userId, locationId });
        return installation.access_token;
      }
    }

    // Token is valid, return it
    return installation.access_token;
  } catch (error) {
    logError('Error getting valid access token', error);
    return null;
  }
}

// Refresh an access token
export async function refreshAccessToken(userId: string, locationId: string): Promise<TokenRefreshResult> {
  try {
    log('Starting token refresh', { userId, locationId });
    
    // Get current installation
    const installation = await cadenceInstallations.getByUserAndLocation(userId, locationId);
    
    if (!installation) {
      return {
        success: false,
        error: 'Installation not found'
      };
    }

    // Call GHL API to refresh token
    const tokenResponse = await GHLAPI.refreshToken(installation.refresh_token);
    
    if (!tokenResponse) {
      return {
        success: false,
        error: 'Failed to refresh token with GHL API'
      };
    }

    // Calculate new expiration
    const expiresAt = calculateTokenExpiration(tokenResponse.expires_in);
    
    // Update in database
    const updateSuccess = await cadenceInstallations.updateTokens(userId, locationId, {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      expires_at: expiresAt
    });

    if (!updateSuccess) {
      return {
        success: false,
        error: 'Failed to update tokens in database'
      };
    }

    // Get updated installation
    const updatedInstallation = await cadenceInstallations.getByUserAndLocation(userId, locationId);
    
    log('Token refresh successful', { 
      userId, 
      locationId, 
      expiresAt,
      newAccessToken: tokenResponse.access_token ? 'present' : 'missing'
    });

    return {
      success: true,
      installation: updatedInstallation || undefined
    };
  } catch (error) {
    logError('Error refreshing access token', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Refresh all expiring tokens (used by cron job)
export async function refreshExpiringTokens(): Promise<{ success: number; failed: number }> {
  let successCount = 0;
  let failedCount = 0;

  try {
    const expiringInstallations = await cadenceInstallations.getExpiringInstallations();
    log('Found expiring installations', { count: expiringInstallations.length });

    for (const installation of expiringInstallations) {
      const result = await refreshAccessToken(installation.user_id, installation.location_id);
      
      if (result.success) {
        successCount++;
        log('Successfully refreshed token', { 
          userId: installation.user_id, 
          locationId: installation.location_id 
        });
      } else {
        failedCount++;
        logError('Failed to refresh token', { 
          userId: installation.user_id, 
          locationId: installation.location_id,
          error: result.error
        });
      }
    }

    log('Token refresh batch complete', { 
      total: expiringInstallations.length,
      success: successCount,
      failed: failedCount
    });

  } catch (error) {
    logError('Error in batch token refresh', error);
    failedCount++;
  }

  return { success: successCount, failed: failedCount };
}

// Validate that an access token is still working
export async function validateAccessToken(userId: string, locationId: string): Promise<boolean> {
  try {
    const installation = await cadenceInstallations.getByUserAndLocation(userId, locationId);
    
    if (!installation) {
      return false;
    }

    // Try to make a simple API call to validate the token
    const ghlApi = new GHLAPI(installation.access_token);
    
    // Make a simple API call - you might want to adjust this endpoint
    // based on what's available in your GHL API
    const testResponse = await ghlApi.makeRequest({
      method: 'GET',
      endpoint: '/users/me'
    });

    return testResponse.ok;
  } catch (error) {
    logError('Error validating access token', error);
    return false;
  }
}

// Revoke/deactivate an installation
export async function revokeInstallation(userId: string, locationId: string): Promise<boolean> {
  try {
    log('Revoking installation', { userId, locationId });
    
    const success = await cadenceInstallations.deactivate(userId, locationId);
    
    if (success) {
      log('Installation revoked successfully', { userId, locationId });
    } else {
      logError('Failed to revoke installation', { userId, locationId });
    }
    
    return success;
  } catch (error) {
    logError('Error revoking installation', error);
    return false;
  }
}
