import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

interface InstallationErrorProps {
  error: string;
  description: string;
}

const errorMessages: Record<string, { title: string; description: string; solution: string }> = {
  missing_code: {
    title: 'Missing Authorization Code',
    description: 'The authorization code is required to complete the installation.',
    solution: 'Please try installing the integration again from the Go High Level marketplace.'
  },
  token_exchange_failed: {
    title: 'Token Exchange Failed',
    description: 'Failed to exchange the authorization code for access tokens.',
    solution: 'This may be due to invalid credentials or network issues. Please try again or contact support.'
  },
  user_info_failed: {
    title: 'User Information Retrieval Failed',
    description: 'Unable to retrieve user information from Go High Level.',
    solution: 'Please ensure you have the necessary permissions and try the installation again.'
  },
  update_failed: {
    title: 'Installation Update Failed',
    description: 'Failed to update the existing installation with new tokens.',
    solution: 'Please try refreshing the page and attempting the installation again.'
  },
  creation_failed: {
    title: 'Installation Creation Failed',
    description: 'Failed to create a new installation record.',
    solution: 'Please check your internet connection and try again. If the problem persists, contact support.'
  },
  access_denied: {
    title: 'Access Denied',
    description: 'You denied the required permissions for this integration.',
    solution: 'Please grant the necessary permissions when prompted during installation.'
  },
  invalid_scope: {
    title: 'Invalid Scope',
    description: 'The requested permissions are not valid or available.',
    solution: 'Please contact support to verify the required permissions for this integration.'
  },
  server_error: {
    title: 'Server Error',
    description: 'An error occurred on the Go High Level servers.',
    solution: 'Please try again later when the service is available.'
  },
  unexpected_error: {
    title: 'Unexpected Error',
    description: 'An unexpected error occurred during the installation process.',
    solution: 'Please try the installation again. If the problem persists, contact support.'
  }
};

export default function InstallationError() {
  const router = useRouter();
  const [error, setError] = useState<InstallationErrorProps | null>(null);

  useEffect(() => {
    if (router.isReady) {
      const { error: errorCode, description } = router.query;
      
      if (errorCode) {
        setError({
          error: errorCode as string,
          description: description as string || ''
        });
      }
    }
  }, [router.isReady, router.query]);

  if (!error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading error details...</p>
        </div>
      </div>
    );
  }

  const errorInfo = errorMessages[error.error] || {
    title: 'Installation Error',
    description: error.description || 'An error occurred during installation.',
    solution: 'Please try the installation again or contact support if the problem persists.'
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Error Header */}
        <div className="text-center mb-8">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
            <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Installation Failed
          </h1>
          <p className="text-lg text-gray-600">
            We encountered an issue while setting up your Go High Level integration.
          </p>
        </div>

        {/* Error Details */}
        <div className="bg-white shadow rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Error Details</h2>
          
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                Error Type
              </h3>
              <p className="text-lg font-medium text-red-600">{errorInfo.title}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                Description
              </h3>
              <p className="text-gray-700">{errorInfo.description}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                Suggested Solution
              </h3>
              <p className="text-gray-700">{errorInfo.solution}</p>
            </div>

            {error.error && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Error Code
                </h3>
                <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono text-gray-800">
                  {error.error}
                </code>
              </div>
            )}
          </div>
        </div>

        {/* Troubleshooting Steps */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-yellow-900 mb-4">Troubleshooting Steps</h2>
          <div className="space-y-3">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-yellow-100 text-yellow-600 text-sm font-medium">
                  1
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-800">
                  Check your internet connection and ensure you can access Go High Level.
                </p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-yellow-100 text-yellow-600 text-sm font-medium">
                  2
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-800">
                  Verify that you have the necessary permissions in your Go High Level account.
                </p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-yellow-100 text-yellow-600 text-sm font-medium">
                  3
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-800">
                  Try clearing your browser cache and cookies, then attempt the installation again.
                </p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-yellow-100 text-yellow-600 text-sm font-medium">
                  4
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-800">
                  If the problem persists, contact our support team with the error details above.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Try Again
          </button>
          <button
            onClick={() => window.close()}
            className="inline-flex items-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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

        {/* Support Contact */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Need help? Contact our support team at{' '}
            <a href="mailto:support@example.com" className="text-blue-600 hover:text-blue-500">
              support@example.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

