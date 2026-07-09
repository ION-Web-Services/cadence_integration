import type { NextApiRequest, NextApiResponse } from 'next';
import { GHLAPI } from '@/lib/ghl-api';
import { cadenceInstallations } from '@/lib/supabase';
import { calculateTokenExpiration, decodeTokenPayload, parseScopes, log, logError } from '@/utils/helpers';
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

    // The location ID must be real — webhooks are matched against it, so a
    // wrong value makes the installation permanently deaf. Sources, in order:
    // the token response's locationId, then the token JWT's authClassId.
    const tokenPayload = decodeTokenPayload(tokenResponse.access_token);

    let userId = tokenResponse.userId;
    let locationId = tokenResponse.locationId;
    const companyId = tokenResponse.companyId;
    let installationMethod = locationId ? 'oauth_response' : 'unknown';

    if (!locationId && tokenPayload.authClass === 'Location' && tokenPayload.authClassId) {
      locationId = tokenPayload.authClassId;
      installationMethod = 'token_jwt';
    }

    // An agency (Company) token can't call location APIs and has no location
    // to bind webhooks to — reject rather than store a broken installation
    if (!locationId || tokenPayload.authClass === 'Company') {
      logError('Install did not produce a location token', {
        authClass: tokenPayload.authClass,
        authClassId: tokenPayload.authClassId,
        hasLocationId: !!locationId,
      });
      return res.redirect(
        '/installation-error?error=agency_install&description=' +
        encodeURIComponent('The app must be installed into a specific sub-account. Please reinstall and choose a location.')
      );
    }

    if (!userId) {
      // user_id is only a row key; the location is the real identity
      userId = 'location-install';
    }

    console.log('Installation context determined:', {
      userId,
      locationId,
      companyId,
      installationMethod,
      state,
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

    // Webhook is configured at the GHL Marketplace app level (not per-location).
    // OutboundMessage events are sent automatically to /api/webhooks/ghl for all installations.

    // Redirect to success page
    return res.redirect(`/installation-success?userId=${encodeURIComponent(userId)}&locationId=${encodeURIComponent(locationId)}`);

  } catch (error) {
    logError('OAuth callback error', error);
    return res.redirect('/installation-error?error=internal_error&description=An unexpected error occurred during installation');
  }
}
