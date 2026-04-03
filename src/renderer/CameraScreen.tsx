import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';

export default function CameraScreen() {
    const navigate = useNavigate();

    const [sessionId] = useState(() => uuidv4());
    const [photosTaken, setPhotosTaken] = useState<string[]>([]);

    // Timers
    const [globalTimeLeft, setGlobalTimeLeft] = useState(180); // 3 minutes = 180s
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [dslrLiveViewUrl, setDslrLiveViewUrl] = useState<string>('');
    const [isDSLRMode] = useState(true); // Always use external shutter for capture
    const [isProcessingHostCapture, setIsProcessingHostCapture] = useState(false);

    useEffect(() => {
        // Initialize session and photo requirements
        try {
            const cartJson = sessionStorage.getItem('selectedTemplates');
            if (cartJson) {
                sessionStorage.setItem('sessionId', sessionId);
            } else {
                navigate('/selection');
            }
        } catch (e) {
            console.error(e);
            navigate('/selection');
        }
    }, [navigate, sessionId]);

    const handleSessionEnd = useCallback(() => {
        // Navigate to editor regardless of whether all required photos were taken
        // The user will work with whatever they have
        sessionStorage.setItem('capturedPhotos', JSON.stringify(photosTaken));
        navigate('/editor');
    }, [navigate, photosTaken]);

    // Global Timer (3 minutes)
    useEffect(() => {
        const interval = setInterval(() => {
            setGlobalTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    handleSessionEnd();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [handleSessionEnd]);

    // digiCamControl: Start/Stop Live View & Interval Refresher
    useEffect(() => {
        let active = true;

        // 1. Perintahkan kamera (melalui digiCamControl) untuk MENYALAKAN Live View / Mirror open.
        fetch('http://127.0.0.1:5513/?CMD=LiveViewWnd_Show', { mode: 'no-cors' }).catch(() => {});

        // 2. Tarik snapshot setiap 100ms agar layarnya tidak freeze
        const interval = setInterval(() => {
            if (active) {
                setDslrLiveViewUrl(`http://127.0.0.1:5513/liveview.jpg?t=${Date.now()}`);
            }
        }, 100);

        return () => {
            active = false;
            clearInterval(interval);
            // Matikan Live View saat pindah halaman agar kamera tidak panas
            fetch('http://127.0.0.1:5513/?CMD=LiveViewWnd_Hide', { mode: 'no-cors' }).catch(() => {});
        };
    }, []);



    // digiCamControl: Folder Watcher & Capture Listener
    useEffect(() => {
        if (!isDSLRMode) return;

        // @ts-expect-error - electron is injected via preload
        window.electron.startFolderWatcher({ sessionId });

        // @ts-expect-error - electron is injected via preload
        const unsubscribe = window.electron.onPhotoCaptured((data: { filePath: string; fileName: string }) => {
            console.log("Photo received from DSLR folder:", data.filePath);
            setPhotosTaken((prev) => [...prev, data.filePath]);
            setIsProcessingHostCapture(false); // Selesai memproses
        });

        return () => {
            // @ts-expect-error - electron is injected via preload
            window.electron.stopFolderWatcher();
            unsubscribe();
        };
    }, [isDSLRMode, sessionId]);

    const startCaptureSequence = () => {
        if (isProcessingHostCapture) return; // already capturing
        takePhoto();
    };

    const takePhoto = async () => {
        try {
            setIsProcessingHostCapture(true); // Tampilkan loading screen sementara nunggu folder watcher
            // @ts-expect-error - electron is injected via preload
            const result = await window.electron.triggerExternalShutter();
            
            if (!result.success) {
                setCameraError(`DSLR Error: ${result.error || 'Failed to trigger shutter'}`);
                setIsProcessingHostCapture(false);
            }
            // We rely exclusively on the folder watcher `onPhotoCaptured` to add the image now.
        } catch (err) {
            console.error('Failed to trigger external shutter', err);
            setCameraError('Failed to communicate with digiCamControl Command Line');
            setIsProcessingHostCapture(false);
        }
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="h-screen bg-transparent text-white flex flex-col relative overflow-hidden font-sans">
            {/* Top HUD */}
            <div className="absolute top-0 left-0 right-0 p-8 flex justify-between items-start z-10 pointer-events-none">
                <div className="bg-neutral-900/80 backdrop-blur-md px-6 py-4 rounded-2xl border border-neutral-700/50 shadow-2xl flex items-center gap-4 pointer-events-auto">
                    <div className={`p-3 rounded-full ${globalTimeLeft <= 30 ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-blue-500/20 text-blue-400'}`}>
                        <Clock size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-1">Time Remaining</p>
                        <p className={`text-3xl font-bold font-mono ${globalTimeLeft <= 30 ? 'text-red-400' : 'text-white'}`}>
                            {formatTime(globalTimeLeft)}
                        </p>
                    </div>
                </div>

                {/* Camera Config is Removed because User Doesn't Want Webcams */}
                <div className="pointer-events-auto">
                    <span className="bg-neutral-900/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-neutral-700/50 shadow-2xl text-emerald-400 font-bold flex items-center gap-2">
                        <CheckCircle size={18} /> DSLR Ready
                    </span>
                </div>

                <div className="bg-neutral-900/80 backdrop-blur-md px-6 py-4 rounded-2xl border border-neutral-700/50 shadow-2xl text-right pointer-events-auto flex items-center gap-6">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-1">Photos Taken</p>
                        <p className="text-3xl font-bold">
                            <span className="text-blue-400">{photosTaken.length}</span> <span className="text-neutral-500 text-xl font-medium">/ ♾️</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Viewfinder */}
            <div className="flex-1 bg-black relative flex items-center justify-center">
                {cameraError ? (
                    <div className="flex flex-col items-center text-red-400 gap-4">
                        <AlertCircle size={48} />
                        <p className="text-xl font-medium">{cameraError}</p>
                        <p className="text-sm text-neutral-500 max-w-md text-center">
                            Check your HDMI connection or Capture Card. Ensure the camera is turned on and outputting a clean HDMI signal.
                        </p>
                    </div>
                ) : (
                    <img 
                        src={dslrLiveViewUrl} 
                        alt="DSLR Live View"
                        className="w-full h-full object-cover transform scale-x-[-1] bg-neutral-950"
                    />
                )}

                {/* Capture Flash Overlay */}
                <AnimatePresence>
                    {photosTaken.length > 0 && (
                        <motion.div
                            initial={{ opacity: 1 }}
                            animate={{ opacity: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.8 }}
                            className="absolute inset-0 bg-white pointer-events-none z-20"
                        />
                    )}
                </AnimatePresence>

                {/* Loading / Processing Overlay */}
                <AnimatePresence>
                    {isProcessingHostCapture && (
                        <motion.div
                            key="processing"
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.5 }}
                            transition={{ duration: 0.5 }}
                            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-30 bg-black/40 backdrop-blur-sm"
                        >
                            <div className="flex flex-col items-center gap-6">
                                <div className="w-24 h-24 border-8 border-neutral-600 border-t-white rounded-full animate-spin shadow-2xl" />
                                <p className="text-3xl font-bold text-white drop-shadow-xl tracking-widest uppercase">Processing Photo...</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Bottom Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-10 flex justify-center items-center gap-12 z-10 pointer-events-none">
                <button
                    onClick={startCaptureSequence}
                    disabled={isProcessingHostCapture}
                    className="pointer-events-auto bg-white hover:bg-neutral-200 text-black rounded-full w-24 h-24 flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.4)] transition-all duration-300 disabled:opacity-50 disabled:scale-95 hover:scale-105 active:scale-90 relative"
                >
                    <div className="w-20 h-20 rounded-full border-4 border-black flex items-center justify-center">
                        <Camera size={32} />
                    </div>
                </button>

                {photosTaken.length > 0 && (
                    <button
                        onClick={handleSessionEnd}
                        className="pointer-events-auto absolute right-16 bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-full font-bold text-lg flex items-center gap-3 shadow-xl transition-all hover:scale-105 active:scale-95"
                    >
                        Finish Editing <CheckCircle size={24} />
                    </button>
                )}
            </div>
        </div>
    );
}
