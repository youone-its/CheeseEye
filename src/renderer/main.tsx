import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { MemoryRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SelectionScreen from './SelectionScreen.tsx'
import PaymentScreen from './PaymentScreen.tsx'
import CameraScreen from './CameraScreen.tsx'
import EditorScreen from './EditorScreen.tsx'
import PrintScreen from './PrintScreen.tsx'
import AdminScreen from './AdminScreen.tsx'
import LocalAuthScreen from './LocalAuthScreen.tsx'
import './index.css'

function App() {
  const [loading, setLoading] = useState(true);
  const [globalBackground, setGlobalBackground] = useState<string>('');

  useEffect(() => {
    const loadAppConfig = async () => {
      try {
        const username = localStorage.getItem('currentUsername');
        if (!username) return;

        // @ts-expect-error - electron is injected via preload
        const config = await window.electron.getConfig(username);
        if (config?.localBackground) {
           setGlobalBackground(config.localBackground);
        }
      } catch (err) {
        console.error("Failed to load generic config early", err);
      } finally {
        setLoading(false);
      }
    };

    loadAppConfig();
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400">Loading Configuration...</div>;
  }


  return (
    <div 
      className="min-h-screen w-full bg-neutral-950 relative"
      style={
        globalBackground
          ? {
              backgroundImage: `url(${globalBackground})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : {}
      }
    >
      {/* Heavy blur overlay to keep the UI readable over the custom branding background */}
      {globalBackground && <div className="absolute inset-0 bg-neutral-950/70 backdrop-blur-xl pointer-events-none z-0" />}
      
      <div className="relative z-10 h-full">
        <Router>
          <Routes>
            <Route path="/" element={<LocalAuthScreen />} />
            <Route path="/selection" element={<SelectionScreen />} />
            <Route path="/payment" element={<PaymentScreen />} />
            <Route path="/camera" element={<CameraScreen />} />
            <Route path="/editor" element={<EditorScreen />} />
            <Route path="/print" element={<PrintScreen />} />
            <Route path="/admin" element={<AdminScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
