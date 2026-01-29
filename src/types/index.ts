// Go High Level Installation Types
export interface GHLInstallation {
  id: string;
  user_id: string;
  location_id: string;
  company_id?: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scopes: string[];
  is_active: boolean;
  installed_at: string;
  updated_at: string;
}

// OAuth Token Response from GHL
export interface GHLTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  // Additional fields from GHL OAuth documentation
  locationId?: string; // Present only for Sub-Account Access Token
  userId?: string; // USER ID - Represent user id of person who performed installation  
  companyId?: string; // Company ID
  userType?: string; // Example: "Location"
  approvedLocations?: string[]; // Approved locations to generate location access token
  planId?: string; // Plan Id of the subscribed plan in paid apps
  isBulkInstallation?: boolean;
}

// GHL User Information
export interface GHLUserInfo {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName?: string;
  locationId: string;
  companyId?: string;
}

// OAuth Callback Query Parameters
export interface OAuthCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

// API Response Types
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Token Refresh Result
export interface TokenRefreshResult {
  success: boolean;
  installation?: GHLInstallation;
  error?: string;
}

// GHL API Request Options
export interface GHLRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  endpoint: string;
  data?: unknown;
  headers?: Record<string, string>;
}

// Installation Status
export interface InstallationStatus {
  is_installed: boolean;
  is_active: boolean;
  expires_at?: string;
  scopes?: string[];
}

// DNC Cache Types
export interface DncCacheEntry {
  id?: string;
  phone: string;
  is_company_blacklist: boolean;
  blacklist_checked_at: string | null;
  is_national_dnc: boolean;
  national_dnc_reason: string | null;
  national_dnc_expiry: string | null;
  national_checked_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DncCheckResult {
  isBlacklist: boolean;
  isNationalDnc: boolean;
  nationalDncReason?: string;
  nationalDncExpiry?: string;
  blacklistFromCache: boolean;
  nationalFromCache: boolean;
}

export interface DncCheckLog {
  event: 'dnc_check';
  phone: string; // Last 4 digits only
  cache_status: 'hit' | 'partial' | 'miss' | 'skipped_tagged';
  blacklist_cached: boolean;
  national_cached: boolean;
  result: {
    is_blacklist: boolean;
    is_national_dnc: boolean;
  };
  duration_ms: number;
}
