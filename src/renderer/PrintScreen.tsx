import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Printer, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function PrintScreen() {
    const navigate = useNavigate();
    const hasRun = useRef(false);
    const [status, setStatus] = useState<'printing' | 'ready'>('printing');
    const [timeLeft, setTimeLeft] = useState(60); // 1 minute to download

    useEffect(() => {
        if (hasRun.current) return;
        hasRun.current = true;

        async function processPrintAndLocalSave() {
            try {
                const sessionId = sessionStorage.getItem('sessionId');
                const finalBase64 = sessionStorage.getItem('finalPrintImage');

                if (!sessionId || !finalBase64) {
                    navigate('/selection');
                    return;
                }

                // 1. Send to printer in the background
                // @ts-expect-error electron api inject
                window.electron.printImage({ base64Data: finalBase64 }).catch(e => console.error("Printer err:", e));

                // Since we are in Local Storage Mode, we don't upload to cloud.
                // We just mark as ready immediately.
                setStatus('ready');

            } catch (err: any) {
                console.error('Failed to process print', err);
                setStatus('ready');
            }
        }

        processPrintAndLocalSave();
    }, [navigate]);

    const handleFinish = useCallback(() => {
        sessionStorage.clear();
        navigate('/');
    }, [navigate]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (status === 'ready') {
            interval = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        clearInterval(interval);
                        handleFinish();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [status, handleFinish]);

    return (
        <div className="min-h-screen bg-transparent text-neutral-50 flex flex-col items-center justify-center font-sans p-8">

            {status === 'printing' ? (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-6"
                >
                    <div className="relative">
                        <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping"></div>
                        <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-full relative shadow-2xl shadow-blue-900/20">
                            <Printer size={64} className="text-blue-400 animate-pulse" />
                        </div>
                    </div>
                    <h2 className="text-3xl font-bold tracking-tight">Printing your memories...</h2>
                    <div className="flex items-center gap-3 text-neutral-400 bg-neutral-900 px-6 py-3 rounded-full border border-neutral-800">
                        <Loader2 size={20} className="animate-spin text-blue-500" />
                        <span>Saving photos to local storage...</span>
                    </div>
                </motion.div>
            ) : (
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-2xl w-full bg-neutral-900 border border-neutral-800 rounded-3xl p-10 shadow-2xl flex flex-col items-center text-center"
                >
                    <div className="bg-green-500/20 p-4 rounded-full text-green-400 mb-6">
                        <CheckCircle size={48} />
                    </div>
                    <h2 className="text-4xl font-extrabold text-white mb-2">All Done!</h2>
                    <p className="text-neutral-400 text-lg mb-10">
                        Your photos are being printed. You can also download them to your device right now.
                    </p>

                    <div className="grid md:grid-cols-2 gap-8 w-full">
                        <div className="bg-neutral-950 border border-neutral-800 p-8 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden">
                            <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-t-2xl"></div>
                            <div className="mx-auto w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center mb-6">
                                <Printer size={48} className="text-blue-400" />
                            </div>
                            <h3 className="font-bold text-lg mb-2">Local Storage Mode</h3>
                            <p className="text-sm text-neutral-400 text-center px-4">
                                Your high-resolution photos have been saved to this machine. Cloud download is disabled.
                            </p>
                        </div>

                        {/* Status Section */}
                        <div className="flex flex-col justify-center gap-6">
                            <div className="bg-neutral-800/50 p-6 rounded-2xl border border-neutral-700 text-left">
                                <p className="text-sm font-semibold uppercase tracking-widest text-neutral-400 mb-2">Session ends in</p>
                                <p className="text-5xl font-mono font-bold text-white tabular-nums">
                                    0:{timeLeft.toString().padStart(2, '0')}
                                </p>
                                <div className="mt-4 h-2 bg-neutral-950 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full bg-blue-500"
                                        initial={{ width: '100%' }}
                                        animate={{ width: `${(timeLeft / 60) * 100}%` }}
                                        transition={{ duration: 1, ease: 'linear' }}
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleFinish}
                                className="w-full py-4 rounded-xl border-2 border-neutral-700 hover:border-neutral-500 text-white font-bold transition-all hover:bg-neutral-800"
                            >
                                Finish Early
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
