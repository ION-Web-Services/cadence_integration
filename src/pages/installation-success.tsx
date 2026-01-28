import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

interface InstallationInfo {
  userId: string;
  locationId: string;
}

export default function InstallationSuccess() {
  const router = useRouter();
  const [installation, setInstallation] = useState<InstallationInfo | null>(null);

  useEffect(() => {
    if (router.isReady) {
      // OAuth callback redirects with ?userId=...&locationId=...
      const { userId, locationId } = router.query;
      
      if (userId && locationId) {
        setInstallation({
          userId: userId as string,
          locationId: locationId as string,
        });
      }
    }
  }, [router.isReady, router.query]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-center px-4">
      <div className="max-w-lg w-full">
        {/* Success Icon */}
        <div className="text-center mb-8">
          <div className="mx-auto w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-2">Installation Complete</h1>
          <p className="text-slate-400 text-lg">
            CadenceCRM DNC Check is now active on your GHL location.
          </p>
        </div>

        {/* What's Happening Now */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">What&apos;s Active Now</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-medium">Outbound Message Monitoring</p>
                <p className="text-sm text-slate-400">Every outbound SMS and call from this location will be automatically checked against DNC lists.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-medium">Federal DNC + Company Blacklist</p>
                <p className="text-sm text-slate-400">Both the national Do Not Call registry and USHEALTH internal blacklist are checked in parallel.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-medium">Auto-Tag & DND</p>
                <p className="text-sm text-slate-400">
                  Flagged contacts are tagged <span className="bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded text-xs font-mono">DNC-NATIONAL</span> or <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded text-xs font-mono">DNC-USHEALTH</span> and set to Do Not Disturb.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-medium">Token Auto-Refresh</p>
                <p className="text-sm text-slate-400">Your OAuth tokens refresh automatically every hour. No maintenance needed.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Installation Details (if available) */}
        {installation && (
          <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-5 mb-6">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Installation Details</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-400">User ID</dt>
                <dd className="font-mono text-slate-300">{installation.userId}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Location ID</dt>
                <dd className="font-mono text-slate-300">{installation.locationId}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Status</dt>
                <dd className="text-emerald-400 font-medium">Active</dd>
              </div>
            </dl>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => window.close()}
            className="flex-1 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-medium rounded-lg transition-colors text-center"
          >
            Done — Close Window
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors text-center"
          >
            Back to Home
          </button>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          You can safely close this window. The integration runs in the background.
        </p>
      </div>
    </div>
  );
}
