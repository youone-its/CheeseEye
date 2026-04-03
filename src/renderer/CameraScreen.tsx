import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';

export default function CameraScreen() {
    const navigate = useNavigate();
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [sessionId] = useState(() => uuidv4());
    const [photosTaken, setPhotosTaken] = useState<string[]>([]);

    // Timers
    const [globalTimeLeft, setGlobalTimeLeft] = useState(180); // 3 minutes = 180s
    const [captureCountdown, setCaptureCountdown] = useState<number | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);

    // Camera Devices State
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
    const [isDSLRMode] = useState(false); // Default to false for general camera
    const [dslrLiveViewUrl, setDslrLiveViewUrl] = useState<string>('');

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

    const initDevices = useCallback(async (isManualRefresh = false) => {
        try {
            // Request initial permissions if needed to get full device labels
            let initialStream: MediaStream | null = null;
            
            // Note: We use a local variable instead of state 'devices' to avoid dependency loop
            try {
                initialStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            } catch (e) {
                console.warn("Initial permissions request failed:", e);
            }

            const allDevices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = allDevices.filter(device => device.kind === 'videoinput');

            setDevices(videoInputs);
            
            // Select device
            if (videoInputs.length > 0) {
                // Use a ref-like approach or just check the current selectedDeviceId
                if (!selectedDeviceId || isManualRefresh) {
                    // If it's a manual refresh, try to find a device that isn't a generic webcam if possible
                    const preferred = videoInputs.find(d => 
                        d.label.toLowerCase().includes('video') || 
                        d.label.toLowerCase().includes('hdmi') || 
                        d.label.toLowerCase().includes('capture')
                    );
                    setSelectedDeviceId(preferred ? preferred.deviceId : videoInputs[0].deviceId);
                }
            }

            // Cleanup dummy stream
            if (initialStream) {
                initialStream.getTracks().forEach(track => track.stop());
            }
            setCameraError(null);
        } catch (err: unknown) {
            setCameraError((err as Error).message || 'Failed to enumerate devices.');
        }
    }, [selectedDeviceId]); // Only depend on selectedDeviceId to avoid loops with devices state

    // Enumerate Devices and Initial Stream
    useEffect(() => {
        initDevices();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run once on mount

    // Start Camera with Selected Device
    useEffect(() => {
        if (isDSLRMode) return; // Don't start webcam if in DSLR mode

        const currentVideoRef = videoRef.current;

        async function startCamera() {
            try {
                const constraints: MediaStreamConstraints = {
                    video: selectedDeviceId 
                        ? { 
                            deviceId: { exact: selectedDeviceId }, 
                            width: { ideal: 1920 }, 
                            height: { ideal: 1080 } 
                          } 
                        : { 
                            width: { ideal: 1920 }, 
                            height: { ideal: 1080 }, 
                            facingMode: 'user' 
                          },
                    audio: false,
                };

                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                setCameraError(null);
            } catch (err: unknown) {
                setCameraError((err as Error).message || 'Failed to access camera.');
            }
        }
        
        // Start device if we have one selected, or if we haven't found devices yet (fallback)
        if (selectedDeviceId || devices.length === 0) {
            startCamera();
        }

        return () => {
            // Cleanup camera on unmount or device switch
            if (currentVideoRef && currentVideoRef.srcObject) {
                const tracks = (currentVideoRef.srcObject as MediaStream).getTracks();
                tracks.forEach(t => t.stop());
            }
        };
    }, [selectedDeviceId, devices.length, isDSLRMode]);

    // digiCamControl: Live View Refresher
    useEffect(() => {
        if (!isDSLRMode) return;

        // digiCamControl Live View updates via http://localhost:8080/liveview.jpg
        const interval = setInterval(() => {
            setDslrLiveViewUrl(`http://localhost:8080/liveview.jpg?t=${Date.now()}`);
        }, 100); // 10 FPS for preview

        return () => clearInterval(interval);
    }, [isDSLRMode]);

    // digiCamControl: Folder Watcher & Capture Listener
    useEffect(() => {
        if (!isDSLRMode) return;

        // @ts-expect-error - electron is injected via preload
        window.electron.startFolderWatcher({ sessionId });

        // @ts-expect-error - electron is injected via preload
        const unsubscribe = window.electron.onPhotoCaptured((data: { filePath: string; fileName: string }) => {
            console.log("Photo received from DSLR folder:", data.filePath);
            setPhotosTaken((prev) => [...prev, `photobox://${data.filePath}`]);
        });

        return () => {
            // @ts-expect-error - electron is injected via preload
            window.electron.stopFolderWatcher();
            unsubscribe();
        };
    }, [isDSLRMode, sessionId]);

    const startCaptureSequence = () => {
        if (captureCountdown !== null) return; // already capturing

        let count = 3;
        setCaptureCountdown(count);

        const interval = setInterval(() => {
            count -= 1;
            if (count <= 0) {
                clearInterval(interval);
                setCaptureCountdown(null);
                takePhoto();
            } else {
                setCaptureCountdown(count);
            }
        }, 1000);
    };

    const takePhoto = async () => {
        if (isDSLRMode) {
            try {
                // @ts-expect-error - electron is injected via preload
                const result = await window.electron.triggerExternalShutter();
                if (!result.success) {
                    setCameraError(`DSLR Error: ${result.error || 'Failed to trigger shutter'}`);
                }
            } catch (err) {
                console.error('Failed to trigger external shutter', err);
                setCameraError('Failed to communicate with digiCamControl');
            }
            return;
        }

        if (!videoRef.current || !canvasRef.current) return;
        
        const video = videoRef.current;
        const canvas = canvasRef.current;

        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Optional: flip context horizontally if the video is mirrored
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const base64Data = canvas.toDataURL('image/png');

        try {
            // Request Main process to save the photo locally via IPC
            // @ts-expect-error - electron is injected via preload
            const savedPath = await window.electron.savePhoto({
                sessionId,
                base64Data,
                index: photosTaken.length + 1
            });

            // Use our custom photobox:// protocol to bypass local file restrictions
            setPhotosTaken((prev) => [...prev, `photobox://${savedPath}`]);
        } catch (err) {
            console.error('Failed to save photo via IPC', err);
            // Fallback: just store base64 in session if IPC fails (for pure web dev testing)
            setPhotosTaken((prev) => [...prev, base64Data]);
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

                {/* Camera Selection Dropdown */}
                <div className="flex items-center gap-3 pointer-events-auto">
                    {devices.length > 0 && (
                        <div className="bg-neutral-900/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-neutral-700/50 shadow-2xl flex items-center gap-3 max-w-[300px]">
                            <Camera size={20} className="text-neutral-400 flex-shrink-0" />
                            <select 
                                className="bg-transparent text-white outline-none text-sm font-medium cursor-pointer appearance-none pr-4 w-full truncate"
                                value={selectedDeviceId}
                                onChange={(e) => setSelectedDeviceId(e.target.value)}
                            >
                                {devices.map((device, idx) => (
                                    <option key={device.deviceId} value={device.deviceId} className="bg-neutral-900 text-white">
                                        {device.label || `Camera ${idx + 1}`}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    <button 
                        onClick={() => initDevices(true)}
                        className="bg-neutral-900/80 backdrop-blur-md p-3 rounded-2xl border border-neutral-700/50 shadow-2xl text-neutral-400 hover:text-white transition-colors"
                        title="Refresh Cameras"
                    >
                        <Clock size={20} className="rotate-180" /> {/* Reusing Clock as Refresh for now, or use RotateCcw if available */}
                    </button>
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
                ) : isDSLRMode ? (
                    <img 
                        src={dslrLiveViewUrl} 
                        alt="DSLR Live View"
                        className="w-full h-full object-cover transform scale-x-[-1] bg-neutral-950"
                        onError={() => setDslrLiveViewUrl('')}
                    />
                ) : (
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover transform scale-x-[-1]"
                    />
                )}

                <canvas ref={canvasRef} className="hidden" />

                {/* Capture Flash Overlay */}
                <AnimatePresence>
                    {captureCountdown === null && photosTaken.length > 0 && (
                        <motion.div
                            initial={{ opacity: 1 }}
                            animate={{ opacity: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.8 }}
                            className="absolute inset-0 bg-white pointer-events-none z-20"
                        />
                    )}
                </AnimatePresence>

                {/* Big Countdown Overlay */}
                <AnimatePresence>
                    {captureCountdown !== null && (
                        <motion.div
                            key={captureCountdown}
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.5 }}
                            transition={{ duration: 0.5 }}
                            className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
                        >
                            <span className="text-[250px] font-extrabold text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.8)] tabular-nums">
                                {captureCountdown}
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Bottom Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-10 flex justify-center items-center gap-12 z-10 pointer-events-none">
                <button
                    onClick={startCaptureSequence}
                    disabled={captureCountdown !== null}
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
