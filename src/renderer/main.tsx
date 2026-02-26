import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { MemoryRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SelectionScreen from './SelectionScreen.tsx'
import PaymentScreen from './PaymentScreen.tsx'
import CameraScreen from './CameraScreen.tsx'
import EditorScreen from './EditorScreen.tsx'
import PrintScreen from './PrintScreen.tsx'
import AdminScreen from './AdminScreen.tsx'
import AuthScreen from './AuthScreen.tsx'
import { supabase } from './supabaseClient.ts'
import './index.css'

function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400">Loading Configuration...</div>;
  }

  // If Supabase is connected but no session, force them to Auth
  // If Supabase is NOT connected (no .env), let them use the app completely locally.
  if (supabase && !session) {
    return <AuthScreen onAuthSuccess={() => setSession(true)} />
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<SelectionScreen />} />
        <Route path="/payment" element={<PaymentScreen />} />
        <Route path="/camera" element={<CameraScreen />} />
        <Route path="/editor" element={<EditorScreen />} />
        <Route path="/print" element={<PrintScreen />} />
        <Route path="/admin" element={<AdminScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
