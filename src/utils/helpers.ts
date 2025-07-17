import type { GHLTokenResponse } from '@/types';

// Calculate token expiration time (GHL tokens expire in 86399 seconds = ~24 hours)
export function calculateTokenExpiration(expiresIn: number = 86399): string {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresIn * 1000);
  return expiresAt.toISOString();
}

// Check if token is expired or will expire soon (within 5 minutes)
export function isTokenExpiringSoon(expiresAt: string, bufferMinutes: number = 5): boolean {
  const now = new Date();
  const expirationTime = new Date(expiresAt);
  const bufferTime = new Date(expirationTime.getTime() - bufferMinutes * 60 * 1000);
  
  return now >= bufferTime;
}

// Check if token is expired
export function isTokenExpired(expiresAt: string): boolean {
  const now = new Date();
  const expirationTime = new Date(expiresAt);
  return now >= expirationTime;
}

// Format date for display
export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Generate random state for OAuth
export function generateOAuthState(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Validate GHL token response
export function validateTokenResponse(response: unknown): response is GHLTokenResponse {
  return (
    response !== null &&
    typeof response === 'object' &&
    response !== undefined &&
    'access_token' in response &&
    'refresh_token' in response &&
    'expires_in' in response &&
    'token_type' in response &&
    typeof (response as Record<string, unknown>).access_token === 'string' &&
    typeof (response as Record<string, unknown>).refresh_token === 'string' &&
    typeof (response as Record<string, unknown>).expires_in === 'number' &&
    typeof (response as Record<string, unknown>).token_type === 'string'
  );
}

// Parse scopes string to array
export function parseScopes(scopesString: string): string[] {
  return scopesString.split(' ').filter(scope => scope.trim() !== '');
}

// Convert scopes array to string
export function stringifyScopes(scopes: string[]): string {
  return scopes.join(' ');
}

// Sanitize user input for database
export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

// Generate installation URL for GHL marketplace
export function generateInstallationUrl(state?: string): string {
  const clientId = process.env.GHL_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  // Ensure no double slashes by removing trailing slash from appUrl
  const cleanAppUrl = appUrl?.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
  const redirectUri = `${cleanAppUrl}/api/oauth/callback`;
  const oauthState = state || generateOAuthState();
  
  const params = new URLSearchParams({
    client_id: clientId!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'contacts.readonly conversations.readonly locations.readonly users.readonly',
    state: oauthState
  });

  return `https://marketplace.gohighlevel.com/oauth/chooselocation?${params.toString()}`;
}

// Log utility for debugging
export function log(message: string, data?: unknown): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[GHL Integration] ${message}`, data || '');
  }
}

// Error logging utility
export function logError(message: string, error?: unknown): void {
  console.error(`[GHL Integration Error] ${message}`, error || '');
}
