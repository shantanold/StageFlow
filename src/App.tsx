import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { supabase } from './lib/supabase';
import { AuthForm } from './components/AuthForm';
import Inventory from './pages/Inventory';
import Contracts from './pages/Contracts';
import Analytics from './pages/Analytics';

function App() {
  const [session, setSession] = useState(supabase.auth.getSession());
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!session) {
    return <AuthForm />;
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Toaster position="top-right" />
        
        {/* Navigation */}
        <nav className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex">
                <div className="flex-shrink-0 flex items-center">
                  <h1 className="text-xl font-bold text-gray-900">Staging Manager</h1>
                </div>
              </div>
              
              {/* Mobile menu button */}
              <div className="flex items-center sm:hidden">
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                >
                  <Menu className="h-6 w-6" />
                </button>
              </div>

              {/* Desktop navigation */}
              <div className="hidden sm:flex sm:items-center sm:space-x-4">
                <Link to="/" className="px-3 py-2 rounded-md text-sm font-medium text-gray-900 hover:bg-gray-100">
                  Inventory
                </Link>
                <Link to="/contracts" className="px-3 py-2 rounded-md text-sm font-medium text-gray-900 hover:bg-gray-100">
                  Contracts
                </Link>
                <Link to="/analytics" className="px-3 py-2 rounded-md text-sm font-medium text-gray-900 hover:bg-gray-100">
                  Analytics
                </Link>
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="ml-4 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>

          {/* Mobile menu */}
          {isMenuOpen && (
            <div className="sm:hidden">
              <div className="pt-2 pb-3 space-y-1">
                <Link
                  to="/"
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 hover:bg-gray-100"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Inventory
                </Link>
                <Link
                  to="/contracts"
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 hover:bg-gray-100"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Contracts
                </Link>
                <Link
                  to="/analytics"
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 hover:bg-gray-100"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Analytics
                </Link>
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-900 hover:bg-gray-100"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </nav>

        {/* Main content */}
        <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<Inventory />} />
            <Route path="/contracts" element={<Contracts />} />
            <Route path="/analytics" element={<Analytics />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;