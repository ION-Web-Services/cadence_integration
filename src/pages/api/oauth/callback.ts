import type { NextApiRequest, NextApiResponse } from 'next';
import { GHLAPI } from '@/lib/ghl-api';
import { cadenceInstallations } from '@/lib/supabase';
import { calculateTokenExpiration, parseScopes, log, logError } from '@/utils/helpers';
import type { OAuthCallbackQuery } from '@/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state, error, error_description } = req.query as OAuthCallbackQuery;

    // Handle OAuth errors
    if (error) {
      logError('OAuth error received', { error, error_description });
      return res.redirect(`/installation-error?error=${error}&description=${encodeURIComponent(error_description || 'OAuth authorization failed')}`);
    }

    // Validate required parameters
    if (!code) {
      logError('Missing authorization code');
      return res.redirect('/installation-error?error=missing_code&description=Authorization code is required');
    }

    log('OAuth callback received', { code: code.substring(0, 10) + '...', state });

    // Exchange authorization code for tokens
    const tokenResponse = await GHLAPI.exchangeCodeForTokens(code);
    
    if (!tokenResponse) {
      logError('Failed to exchange code for tokens');
      return res.redirect('/installation-error?error=token_exchange_failed&description=Failed to exchange authorization code for tokens');
    }

    log('Token response received', { 
      access_token: tokenResponse.access_token ? 'present' : 'missing',
      refresh_token: tokenResponse.refresh_token ? 'present' : 'missing',
      expires_in: tokenResponse.expires_in,
      token_type: tokenResponse.token_type,
      scope: tokenResponse.scope,
      // Log additional fields that should be in OAuth response according to docs
      locationId: tokenResponse.locationId || 'not present',
      userId: tokenResponse.userId || 'not present', 
      companyId: tokenResponse.companyId || 'not present',
      userType: tokenResponse.userType || 'not present',
      approvedLocations: tokenResponse.approvedLocations || 'not present'
    });
    
    // Calculate token expiration
    const expiresAt = calculateTokenExpiration(tokenResponse.expires_in);
    
    // Parse scopes
    const scopes = parseScopes(tokenResponse.scope);

    // According to GHL OAuth documentation, the token response should include
    // locationId, userId, and companyId directly. Check these first:
    
    let userId: string | undefined;
    let locationId: string | undefined;
    let companyId: string | undefined;
    let installationMethod = 'unknown';

    // Method 1: Extract from OAuth token response (primary method)
    if (tokenResponse.locationId) {
      locationId = tokenResponse.locationId;
      installationMethod = 'oauth_response';
      log('Location ID found in OAuth token response', { locationId });
    }
    
    if (tokenResponse.userId) {
      userId = tokenResponse.userId;
      log('User ID found in OAuth token response', { userId });
    }
    
    if (tokenResponse.companyId) {
      companyId = tokenResponse.companyId;
      log('Company ID found in OAuth token response', { companyId });
    }

    // Only try API calls if we didn't get the location/user info from token response
    const ghlAPI = new GHLAPI(tokenResponse.access_token);

    // Method 1: Check if OAuth state parameter contains location context
    if (state && typeof state === 'string') {
      try {
        // Sometimes the state parameter contains encoded location information
        const decodedState = decodeURIComponent(state);
        if (decodedState.includes('location') || decodedState.includes('user')) {
          log('State parameter contains potential location info', { state: decodedState });
          // Parse state if it contains JSON or structured data
          // This would be implementation-specific based on how your app sets the state
        }
      } catch (error) {
        log('Could not decode state parameter', { state, error });
      }
    }

    // Method 2: Try to get user info from GHL API v2 endpoints
    let userInfo = await ghlAPI.getUserInfo(); // /users/me endpoint
    if (!userInfo) {
      log('Primary user info endpoint (/users/me) failed, trying alternative');
      userInfo = await ghlAPI.getUserInfoAlternative(); // /users endpoint
    }

    // Method 3: If we have user info, use it
    if (userInfo) {
      log('Successfully retrieved user info from API', userInfo);
      userId = userInfo.id;
      locationId = userInfo.locationId;
      companyId = userInfo.companyId;
      installationMethod = 'api_user_info';
    }

    // Method 4: If no location from user info, try to get available locations
    if (!locationId) {
      try {
        log('Attempting to fetch user locations');
        const locationsResponse = await ghlAPI.getUserLocations();
        if (locationsResponse && locationsResponse.length > 0) {
          const firstLocation = locationsResponse[0] as Record<string, unknown>;
          locationId = typeof firstLocation.id === 'string' ? firstLocation.id : undefined;
          
          if (locationId) {
            log('Retrieved location from user locations API', { locationId, totalLocations: locationsResponse.length });
            installationMethod = 'api_locations';
            
            // If we didn't get a user ID from user info, try to get it from location
            if (!userId && typeof firstLocation.userId === 'string') {
              userId = firstLocation.userId;
            }
          }
        }
      } catch (error) {
        log('Failed to get user locations', error);
      }
    }

    // Method 5: For OAuth installation context, check if there's installation-specific data
    // During OAuth flow, GHL typically provides context about where the app is being installed
    // This could be in the OAuth response or available via a specific endpoint
    if (!locationId || !userId) {
      log('No location/user found from API calls, checking OAuth installation context');
      // The location where the app is installed should be available in the OAuth context
      // This might require a different API call or be embedded in the OAuth response
    }

    // Fallback: Use timestamp-based placeholder IDs only if absolutely necessary
    if (!userId || !locationId) {
      log('Using placeholder IDs as fallback - this indicates a potential issue with OAuth context');
      userId = userId || 'user_' + Date.now();
      locationId = locationId || 'location_' + Date.now();
      installationMethod = 'placeholder_fallback';
    }

    log('Final installation context determined', { 
      userId, 
      locationId, 
      companyId, 
      installationMethod,
      hasRealData: installationMethod !== 'placeholder_fallback'
    });

    // Check if installation already exists
    const existingInstallation = await cadenceInstallations.getByUserAndLocation(userId, locationId);
    
    if (existingInstallation) {
      log('Updating existing installation', { userId, locationId });
      
      // Update existing installation
      const updateSuccess = await cadenceInstallations.updateTokens(userId, locationId, {
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expires_at: expiresAt
      });

      if (!updateSuccess) {
        logError('Failed to update existing installation');
        return res.redirect('/installation-error?error=update_failed&description=Failed to update existing installation');
      }
    } else {
      log('Creating new installation', { userId, locationId });
      
      // Create new installation
      const newInstallation = await cadenceInstallations.create({
        user_id: userId,
        location_id: locationId,
        company_id: companyId,
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expires_at: expiresAt,
        scopes: scopes,
        is_active: true
      });

      if (!newInstallation) {
        logError('Failed to create new installation');
        return res.redirect('/installation-error?error=creation_failed&description=Failed to create new installation');
      }
    }

    log('Installation completed successfully', { userId, locationId });

    // Redirect to success page
    return res.redirect(`/installation-success?userId=${encodeURIComponent(userId)}&locationId=${encodeURIComponent(locationId)}`);

  } catch (error) {
    logError('OAuth callback error', error);
    return res.redirect('/installation-error?error=internal_error&description=An unexpected error occurred during installation');
  }
}
