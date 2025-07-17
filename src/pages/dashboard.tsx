import { useState, useEffect } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';

interface Installation {
  id: string;
  user_id: string;
  location_id: string;
  company_id?: string;
  expires_at: string;
  scopes: string[];
  is_active: boolean;
  installed_at: string;
  updated_at: string;
}

interface DashboardProps {
  installations: Installation[];
  error?: string;
}

export default function Dashboard({ installations, error }: DashboardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');


  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'USHA!') {
      setIsAuthenticated(true);
      setLoginError('');
    } else {
      setLoginError('Invalid password');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getTokenStatus = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const hoursUntilExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    if (hoursUntilExpiry < 0) {
      return { status: 'Expired', color: 'text-red-600 bg-red-100' };
    } else if (hoursUntilExpiry < 2) {
      return { status: 'Expiring Soon', color: 'text-yellow-600 bg-yellow-100' };
    } else {
      return { status: 'Valid', color: 'text-green-600 bg-green-100' };
    }
  };



  if (!isAuthenticated) {
    return (
      <>
        <Head>
          <title>Dashboard - GHL Integration</title>
        </Head>
        
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          <div className="sm:mx-auto sm:w-full sm:max-w-md">
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Access Dashboard
            </h2>
          </div>

          <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
            <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
              <form className="space-y-6" onSubmit={handleLogin}>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <div className="mt-1">
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="Enter password"
                    />
                  </div>
                </div>

                {loginError && (
                  <div className="text-red-600 text-sm">{loginError}</div>
                )}

                <div>
                  <button
                    type="submit"
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Access Dashboard
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Installations Dashboard - GHL Integration</title>
      </Head>
      
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="border-4 border-dashed border-gray-200 rounded-lg p-6">
              <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900">GHL Installations Dashboard</h1>
                <p className="mt-2 text-sm text-gray-600">
                  Manage and monitor all GHL OAuth installations
                </p>
                <div className="mt-4">
                  <span className="text-sm text-gray-500">
                    Total Installations: {installations.length}
                  </span>
                </div>
              </div>

              {error && (
                <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                  Error: {error}
                </div>
              )}

              <div className="bg-white shadow overflow-hidden sm:rounded-md">
                <ul className="divide-y divide-gray-200">
                  {installations.length === 0 ? (
                    <li className="px-6 py-4">
                      <div className="text-center text-gray-500">
                        No installations found
                      </div>
                    </li>
                  ) : (
                    installations.map((installation) => {
                      const tokenStatus = getTokenStatus(installation.expires_at);
                      return (
                        <li key={installation.id} className="px-6 py-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center">
                                <div className="flex-shrink-0">
                                  <div className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${tokenStatus.color}`}>
                                    {tokenStatus.status}
                                  </div>
                                </div>
                                <div className="ml-4 flex-1">
                                  <div className="text-sm font-medium text-gray-900">
                                    User: {installation.user_id}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    Location: {installation.location_id}
                                  </div>
                                  {installation.company_id && (
                                    <div className="text-sm text-gray-500">
                                      Company: {installation.company_id}
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                <div>
                                  <span className="text-xs text-gray-500">Installed:</span>
                                  <div className="text-sm text-gray-900">
                                    {formatDate(installation.installed_at)}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-xs text-gray-500">Token Expires:</span>
                                  <div className="text-sm text-gray-900">
                                    {formatDate(installation.expires_at)}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-xs text-gray-500">Last Updated:</span>
                                  <div className="text-sm text-gray-900">
                                    {formatDate(installation.updated_at)}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-xs text-gray-500">Status:</span>
                                  <div className="text-sm text-gray-900">
                                    {installation.is_active ? 'Active' : 'Inactive'}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="mt-2">
                                <span className="text-xs text-gray-500">Scopes:</span>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {installation.scopes.map((scope, index) => (
                                    <span
                                      key={index}
                                      className="inline-flex px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded"
                                    >
                                      {scope}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              

                            </div>
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  try {
    // Import the database functions
    const { cadenceInstallations } = await import('@/lib/supabase');
    
    // Get all installations
    const installations = await cadenceInstallations.getAll();
    
    return {
      props: {
        installations: installations || []
      }
    };
  } catch (error) {
    console.error('Error fetching installations:', error);
    return {
      props: {
        installations: [],
        error: 'Failed to fetch installations'
      }
    };
  }
}; 