import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { formatDate } from '@/utils/helpers';

interface InstallationSuccessProps {
  user_id: string;
  location_id: string;
  company_id: string;
  scopes: string;
  expires_at: string;
  note?: string;
}

export default function InstallationSuccess() {
  const router = useRouter();
  const [installation, setInstallation] = useState<InstallationSuccessProps | null>(null);

  useEffect(() => {
    if (router.isReady) {
      const { user_id, location_id, company_id, scopes, expires_at, note } = router.query;
      
      if (user_id && location_id) {
        setInstallation({
          user_id: user_id as string,
          location_id: location_id as string,
          company_id: company_id as string,
          scopes: scopes as string,
          expires_at: expires_at as string,
          note: note as string
        });
      }
    }
  }, [router.isReady, router.query]);

  if (!installation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading installation details...</p>
        </div>
      </div>
    );
  }

  const scopesList = installation.scopes.split(',').filter(scope => scope.trim());

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
            <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Installation Successful!
          </h1>
          <p className="text-lg text-gray-600">
            Your Go High Level integration has been successfully installed and configured.
          </p>
        </div>

        {/* Installation Details */}
        <div className="bg-white shadow rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Installation Details</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                User Information
              </h3>
              <dl className="space-y-2">
                <div>
                  <dt className="text-sm font-medium text-gray-600">User ID</dt>
                  <dd className="text-sm text-gray-900 font-mono">{installation.user_id}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-600">Location ID</dt>
                  <dd className="text-sm text-gray-900 font-mono">{installation.location_id}</dd>
                </div>
                {installation.company_id && (
                  <div>
                    <dt className="text-sm font-medium text-gray-600">Company ID</dt>
                    <dd className="text-sm text-gray-900 font-mono">{installation.company_id}</dd>
                  </div>
                )}
              </dl>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                Token Information
              </h3>
              <dl className="space-y-2">
                <div>
                  <dt className="text-sm font-medium text-gray-600">Expires At</dt>
                  <dd className="text-sm text-gray-900">{formatDate(installation.expires_at)}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-600">Scopes Granted</dt>
                  <dd className="text-sm text-gray-900">{scopesList.length} permissions</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Scopes List */}
          {scopesList.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                Granted Permissions
              </h3>
              <ul className="space-y-1">
                {scopesList.map((scope, index) => (
                  <li key={index} className="flex items-center text-sm text-gray-700">
                    <svg className="h-4 w-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {scope.replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

                  {/* Note */}
          {installation.note && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-800">{installation.note}</p>
                </div>
              </div>
            </div>
          )}

          {/* Next Steps */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-blue-900 mb-4">What&apos;s Next?</h2>
          <div className="space-y-3">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-600 text-sm font-medium">
                  1
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-800">
                  Your integration is now active and ready to use. Tokens will be automatically refreshed in the background.
                </p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-600 text-sm font-medium">
                  2
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-800">
                  You can now make API calls to Go High Level through our proxy endpoint at <code className="bg-blue-100 px-1 rounded">/api/ghl/</code>
                </p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-600 text-sm font-medium">
                  3
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-800">
                  Monitor your integration status and manage installations through your dashboard.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => window.close()}
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Close Window
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="inline-flex items-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
