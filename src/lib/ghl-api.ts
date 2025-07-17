import type { GHLTokenResponse, GHLUserInfo, GHLRequestOptions } from '@/types';
import { log, logError, validateTokenResponse } from '@/utils/helpers';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

export class GHLAPI {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  // Exchange authorization code for tokens
  static async exchangeCodeForTokens(code: string): Promise<GHLTokenResponse | null> {
    try {
      const response = await fetch('https://services.leadconnectorhq.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: process.env.GHL_CLIENT_ID!,
          client_secret: process.env.GHL_CLIENT_SECRET!,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/callback`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        logError('Token exchange failed', { status: response.status, data });
        return null;
      }

      if (!validateTokenResponse(data)) {
        logError('Invalid token response format', data);
        return null;
      }

      log('Token exchange successful');
      return data;
    } catch (error) {
      logError('Token exchange error', error);
      return null;
    }
  }

  // Refresh access token
  static async refreshToken(refreshToken: string): Promise<GHLTokenResponse | null> {
    try {
      const response = await fetch('https://services.leadconnectorhq.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: process.env.GHL_CLIENT_ID!,
          client_secret: process.env.GHL_CLIENT_SECRET!,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        logError('Token refresh failed', { status: response.status, data });
        return null;
      }

      if (!validateTokenResponse(data)) {
        logError('Invalid refresh token response format', data);
        return null;
      }

      log('Token refresh successful');
      return data;
    } catch (error) {
      logError('Token refresh error', error);
      return null;
    }
  }

  // Get user information
  async getUserInfo(): Promise<GHLUserInfo | null> {
    try {
      const response = await this.makeRequest({
        method: 'GET',
        endpoint: '/users/me',
      });

      if (!response.ok) {
        const errorData = await response.text();
        logError('Failed to get user info', { status: response.status, error: errorData });
        return null;
      }

      const data = await response.json();
      log('User info retrieved successfully', data);
      return data;
    } catch (error) {
      logError('Get user info error', error);
      return null;
    }
  }

  // Get user information (alternative endpoint)
  async getUserInfoAlternative(): Promise<GHLUserInfo | null> {
    try {
      const response = await this.makeRequest({
        method: 'GET',
        endpoint: '/users',
      });

      if (!response.ok) {
        const errorData = await response.text();
        logError('Failed to get user info (alternative)', { status: response.status, error: errorData });
        return null;
      }

      const data = await response.json();
      log('User info retrieved successfully (alternative)', data);
      return data;
    } catch (error) {
      logError('Get user info error (alternative)', error);
      return null;
    }
  }

  // Get user information with locationId parameter
  async getUserInfoWithLocation(locationId: string): Promise<GHLUserInfo | null> {
    try {
      const response = await this.makeRequest({
        method: 'GET',
        endpoint: `/users?locationId=${locationId}`,
      });

      if (!response.ok) {
        const errorData = await response.text();
        logError('Failed to get user info with location', { status: response.status, error: errorData });
        return null;
      }

      const data = await response.json();
      log('User info retrieved successfully with location', data);
      return data;
    } catch (error) {
      logError('Get user info error with location', error);
      return null;
    }
  }

  // Get location information
  async getLocationInfo(locationId: string): Promise<Record<string, unknown> | null> {
    try {
      const response = await this.makeRequest({
        method: 'GET',
        endpoint: `/locations/${locationId}`,
      });

      if (!response.ok) {
        logError('Failed to get location info', { status: response.status, locationId });
        return null;
      }

      const data = await response.json();
      log('Location info retrieved successfully');
      return data;
    } catch (error) {
      logError('Get location info error', error);
      return null;
    }
  }

  // Get user's locations
  async getUserLocations(): Promise<Record<string, unknown>[] | null> {
    try {
      const response = await this.makeRequest({
        method: 'GET',
        endpoint: '/locations',
      });

      if (!response.ok) {
        const errorData = await response.text();
        logError('Failed to get user locations', { status: response.status, error: errorData });
        return null;
      }

      const data = await response.json();
      log('User locations retrieved successfully', data);
      return data.locations || data || [];
    } catch (error) {
      logError('Get user locations error', error);
      return null;
    }
  }

  // Get contacts
  async getContacts(locationId: string, params?: Record<string, string>): Promise<Record<string, unknown> | null> {
    try {
      const queryParams = new URLSearchParams(params);
      const response = await this.makeRequest({
        method: 'GET',
        endpoint: `/contacts/?locationId=${locationId}${queryParams.toString() ? `&${queryParams.toString()}` : ''}`,
      });

      if (!response.ok) {
        logError('Failed to get contacts', { status: response.status, locationId });
        return null;
      }

      const data = await response.json();
      log('Contacts retrieved successfully');
      return data;
    } catch (error) {
      logError('Get contacts error', error);
      return null;
    }
  }

  // Get conversations
  async getConversations(locationId: string, params?: Record<string, string>): Promise<Record<string, unknown> | null> {
    try {
      const queryParams = new URLSearchParams(params);
      const response = await this.makeRequest({
        method: 'GET',
        endpoint: `/conversations/?locationId=${locationId}${queryParams.toString() ? `&${queryParams.toString()}` : ''}`,
      });

      if (!response.ok) {
        logError('Failed to get conversations', { status: response.status, locationId });
        return null;
      }

      const data = await response.json();
      log('Conversations retrieved successfully');
      return data;
    } catch (error) {
      logError('Get conversations error', error);
      return null;
    }
  }

  // Generic request method
  async makeRequest(options: GHLRequestOptions): Promise<Response> {
    const url = `${GHL_API_BASE}${options.endpoint}`;
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const requestOptions: RequestInit = {
      method: options.method,
      headers,
    };

    if (options.data && ['POST', 'PUT', 'PATCH'].includes(options.method)) {
      requestOptions.body = JSON.stringify(options.data);
    }

    log(`Making ${options.method} request to ${url}`);
    return fetch(url, requestOptions);
  }

  // Update access token (for token refresh scenarios)
  updateAccessToken(newToken: string): void {
    this.accessToken = newToken;
  }
}
