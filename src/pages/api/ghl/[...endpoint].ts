import type { NextApiRequest, NextApiResponse } from 'next';
import { getValidAccessToken } from '@/lib/token-manager';
import { GHLAPI } from '@/lib/ghl-api';
import { log, logError } from '@/utils/helpers';

// This file handles GHL API proxying

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
      .end();
  }

  try {
    const { endpoint } = req.query;
    
    // Extract endpoint path
    const endpointPath = Array.isArray(endpoint) ? endpoint.join('/') : endpoint || '';
    
    if (!endpointPath) {
      return res.status(400).json({ error: 'Endpoint path is required' });
    }

    // Extract user and location from headers or query params
    const userId = (req.headers['x-user-id'] as string) || (req.query.userId as string);
    const locationId = (req.headers['x-location-id'] as string) || (req.query.locationId as string);

    if (!userId || !locationId) {
      return res.status(400).json({ 
        error: 'User ID and Location ID are required',
        details: 'Provide via headers (x-user-id, x-location-id) or query parameters (userId, locationId)'
      });
    }

    // Validate HTTP method
    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    if (!req.method || !allowedMethods.includes(req.method)) {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    log(`GHL API request: ${req.method} /${endpointPath}`, { userId, locationId });

    // Get valid access token
    const accessToken = await getValidAccessToken(userId, locationId);
    
    if (!accessToken) {
      logError('No valid access token found', { userId, locationId });
      return res.status(401).json({ error: 'No valid access token found. Please reinstall the integration.' });
    }

    // Create GHL API instance
    const ghlApi = new GHLAPI(accessToken);
    
    // Prepare request options
    const requestOptions = {
      method: req.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
      endpoint: `/${endpointPath}`,
      data: req.body,
      headers: {}
    };

    // Add content-type header for non-GET requests
    if (req.method !== 'GET' && req.body) {
      requestOptions.headers = {
        'Content-Type': 'application/json'
      };
    }

    // Make the API request
    const response = await ghlApi.makeRequest(requestOptions);
    
    if (!response.ok) {
      const errorText = await response.text();
      logError('GHL API request failed', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        endpoint: endpointPath,
        method: req.method
      });

      // Handle 401 errors specially - might need token refresh
      if (response.status === 401) {
        return res.status(401).json({
          error: 'Authentication failed',
          message: 'Access token may be expired. Please reinstall the integration.',
          details: errorText
        });
      }

      return res.status(response.status).json({
        error: 'GHL API request failed',
        message: response.statusText,
        details: errorText
      });
    }

    // Parse and return successful response
    const data = await response.json();
    
    log('GHL API request successful', {
      endpoint: endpointPath,
      method: req.method,
      status: response.status
    });

    // Set CORS headers and return data
    return res.status(response.status)
      .setHeader('Access-Control-Allow-Origin', '*')
      .json(data);

  } catch (error) {
    logError('API proxy error', error);
    
    return res.status(500)
      .setHeader('Access-Control-Allow-Origin', '*')
      .json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
  }
}
