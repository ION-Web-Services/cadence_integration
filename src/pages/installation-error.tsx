import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { generateInstallationUrl } from '@/utils/helpers';

interface ErrorInfo {
  code: string;
  description: string;
}

const errorMessages: Record<string, { title: string; solution: string }> = {
  missing_code: {
    title: 'Missing Authorization Code',
    solution: 'Try installing the integration again from the GoHighLevel marketplace.'
  },
  token_exchange_failed: {
    title: 'Token Exchange Failed',
    solution: 'This may be due to expired credentials or a network issue. Try again.'
  },
  update_failed: {
    title: 'Installation Update Failed',
    solution: 'Could not update existing installation tokens. Try reinstalling.'
  },
  creation_failed: {
    title: 'Installation Creation Failed',
    solution: 'Could not save installation to database. Check your connection and try again.'
  },
  access_denied: {
    title: 'Access Denied',
    solution: 'You need to grant all required permissions during installation.'
  },
  internal_error: {
    title: 'Internal Error',
    solution: 'Something went wrong on our end. Try again in a few minutes.'
  }
};

export default function InstallationError() {
  const router = useRouter();
  const [error, setError] = useState<ErrorInfo | null>(null);
  const installUrl = generateInstallationUrl();

  useEffect(() => {
    if (router.isReady) {
      const { error: errorCode, description } = router.query;
      if (errorCode) {
        setError({
          code: errorCode as string,
          description: description as string || ''
        });
      }
    }
  }, [router.isReady, router.query]);

  const errorInfo = error ? (errorMessages[error.code] || {
    title: 'Installation Error',
    solution: 'Try again. If the problem persists, contact support.'
  }) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-center px-4">
      <div className="max-w-lg w-full">
        {/* Error Icon */}
        <div className="text-center mb-8">
          <div className="mx-auto w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-2">Installation Failed</h1>
          <p className="text-slate-400 text-lg">
            Something went wrong during the CadenceCRM DNC Check setup.
          </p>
        </div>

        {/* Error Details */}
        {errorInfo && (
          <div className="bg-slate-800/50 border border-red-500/20 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-red-400 mb-2">{errorInfo.title}</h2>
            {error?.description && (
              <p className="text-slate-400 text-sm mb-4">{error.description}</p>
            )}
            <div className="flex items-start gap-2 bg-slate-900/50 rounded-lg p-3">
              <svg className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-slate-300">{errorInfo.solution}</p>
            </div>
            {error?.code && (
              <p className="text-xs text-slate-600 mt-3 font-mono">Error code: {error.code}</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={installUrl}
            className="flex-1 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-medium rounded-lg transition-colors text-center"
          >
            Try Again
          </a>
          <button
            onClick={() => window.close()}
            className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors text-center"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}
