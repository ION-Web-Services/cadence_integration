import Link from 'next/link';
import { generateInstallationUrl } from '@/utils/helpers';

export default function Home() {
  const installationUrl = generateInstallationUrl();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Go High Level Integration
              </h1>
              <p className="text-gray-600 mt-1">
                Multi-tenant marketplace integration with automatic token management
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href={installationUrl}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Install Integration
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* OAuth 2.0 Flow */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      OAuth 2.0 Authentication
                    </dt>
                    <dd className="text-sm text-gray-900">
                      Secure marketplace installation flow with automatic token exchange
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Multi-tenant Support */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Multi-tenant Architecture
                    </dt>
                    <dd className="text-sm text-gray-900">
                      Support for 1000+ installations with isolated token management
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Automatic Token Refresh */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-purple-100 rounded-md flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Automatic Token Refresh
                    </dt>
                    <dd className="text-sm text-gray-900">
                      Background refresh with 5-minute buffer before expiration
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* API Proxy */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-yellow-100 rounded-md flex items-center justify-center">
                    <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      API Proxy
                    </dt>
                    <dd className="text-sm text-gray-900">
                      Dynamic endpoint routing with automatic token injection
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Error Handling */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-red-100 rounded-md flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Graceful Error Handling
                    </dt>
                    <dd className="text-sm text-gray-900">
                      Comprehensive error handling with retry mechanisms
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Monitoring */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-indigo-100 rounded-md flex items-center justify-center">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Monitoring & Logging
                    </dt>
                    <dd className="text-sm text-gray-900">
                      Comprehensive logging and health monitoring
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* API Documentation */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">API Usage</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Making API Calls</h3>
              <p className="text-gray-600 mb-3">
                Use our proxy endpoint to make authenticated requests to Go High Level API:
              </p>
              <div className="bg-gray-100 rounded-lg p-4">
                <code className="text-sm text-gray-800">
                  POST /api/ghl/contacts<br/>
                  Headers: X-User-ID: your_user_id, X-Location-ID: your_location_id<br/>
                  Body: {"{...}"}
            </code>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Supported Endpoints</h3>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                <li><code className="bg-gray-100 px-1 rounded">/api/ghl/contacts</code> - Contact management</li>
                <li><code className="bg-gray-100 px-1 rounded">/api/ghl/conversations</code> - Conversation history</li>
                <li><code className="bg-gray-100 px-1 rounded">/api/ghl/locations</code> - Location information</li>
                <li><code className="bg-gray-100 px-1 rounded">/api/ghl/users</code> - User management</li>
                <li><code className="bg-gray-100 px-1 rounded">/api/ghl/oauth</code> - OAuth operations</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Authentication</h3>
              <p className="text-gray-600">
                Tokens are automatically managed and refreshed. Simply provide your <code className="bg-gray-100 px-1 rounded">user_id</code> and <code className="bg-gray-100 px-1 rounded">location_id</code> in the request headers.
              </p>
            </div>
          </div>
        </div>

        {/* Installation CTA */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <h2 className="text-2xl font-bold text-blue-900 mb-2">
            Ready to Get Started?
          </h2>
          <p className="text-blue-800 mb-6">
            Install the integration to start using Go High Level API with automatic token management.
          </p>
          <Link
            href={installationUrl}
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Install Integration
          </Link>
        </div>
      </main>
    </div>
  );
}
