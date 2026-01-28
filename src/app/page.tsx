import Link from 'next/link';
import Image from 'next/image';
import { generateInstallationUrl } from '@/utils/helpers';

export default function Home() {
  const installationUrl = generateInstallationUrl();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header style={{ backgroundColor: '#364050' }}>
        <div className="max-w-5xl mx-auto px-6 py-5 flex justify-between items-center">
          <Image src="/cadence-logo.jpg" alt="CadenceCRM" width={180} height={45} className="rounded" />
          <Link
            href={installationUrl}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-medium rounded-lg transition-colors text-sm"
          >
            Install App
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-5xl mx-auto px-6">
        <div className="py-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm mb-6">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
            GoHighLevel Marketplace App
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold mb-4 leading-tight">
            CadenceCRM<br />
            <span className="text-emerald-400">DNC Check</span>
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10">
            Automatically checks every outbound contact against the Federal Do Not Call list 
            and USHEALTH company blacklist — then flags and blocks non-compliant contacts in real time.
          </p>
          <Link
            href={installationUrl}
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold rounded-lg transition-colors text-base"
          >
            Install to Your GHL Location
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>

        {/* How It Works */}
        <div className="pb-20">
          <h3 className="text-center text-sm font-semibold text-slate-500 uppercase tracking-wider mb-10">How It Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center mb-4">
                <span className="text-blue-400 font-bold">1</span>
              </div>
              <h4 className="text-lg font-semibold mb-2">Outbound Message Sent</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                When an agent sends an SMS or makes a call through GHL, a webhook fires automatically to CadenceCRM DNC Check.
              </p>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center mb-4">
                <span className="text-amber-400 font-bold">2</span>
              </div>
              <h4 className="text-lg font-semibold mb-2">DNC Lists Checked</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                The contact&apos;s phone number is checked against both the <strong className="text-slate-300">Federal DNC Registry</strong> and the <strong className="text-slate-300">USHEALTH Company Blacklist</strong> simultaneously.
              </p>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center mb-4">
                <span className="text-red-400 font-bold">3</span>
              </div>
              <h4 className="text-lg font-semibold mb-2">Contact Flagged</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                If the number is on any list, the contact is tagged (<strong className="text-slate-300">DNC-NATIONAL</strong> or <strong className="text-slate-300">DNC-USHEALTH</strong>) and DND is enabled to prevent further contact.
              </p>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="pb-20">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex items-start gap-3 bg-slate-800/30 rounded-lg p-5">
              <svg className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <h5 className="font-medium mb-1">Real-Time Checking</h5>
                <p className="text-sm text-slate-400">Every outbound message triggers an instant DNC lookup — no manual checks needed.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-slate-800/30 rounded-lg p-5">
              <svg className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <h5 className="font-medium mb-1">Dual List Coverage</h5>
                <p className="text-sm text-slate-400">Checks both the Federal Do Not Call list and USHEALTH internal company blacklist.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-slate-800/30 rounded-lg p-5">
              <svg className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <h5 className="font-medium mb-1">Auto-Tag & Block</h5>
                <p className="text-sm text-slate-400">Flagged contacts are automatically tagged and set to Do Not Disturb in GHL.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-slate-800/30 rounded-lg p-5">
              <svg className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <h5 className="font-medium mb-1">Preserves Existing Data</h5>
                <p className="text-sm text-slate-400">Existing tags on contacts are preserved — DNC tags are added without overwriting anything.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-slate-800/30 rounded-lg p-5">
              <svg className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <h5 className="font-medium mb-1">Token Auto-Refresh</h5>
                <p className="text-sm text-slate-400">OAuth tokens are refreshed automatically every hour — zero maintenance required.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-slate-800/30 rounded-lg p-5">
              <svg className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <h5 className="font-medium mb-1">Multi-Location Support</h5>
                <p className="text-sm text-slate-400">Install once per location. Each location gets isolated token management and DNC checking.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-slate-700/50 py-8 text-center text-sm text-slate-500">
          <p>CadenceCRM DNC Check &bull; USHEALTH Group &bull; Powered by GoHighLevel</p>
        </footer>
      </main>
    </div>
  );
}
