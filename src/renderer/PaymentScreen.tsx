import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, CreditCard, Loader2, Banknote, X, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
// Removed Supabase

const formatIDR = (price: number) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(price);
};

export default function PaymentScreen() {
    const navigate = useNavigate();
    const [totalPrice] = useState<number>(() => {
        const priceStr = sessionStorage.getItem('totalPrice');
        return priceStr ? Number(priceStr) : 0;
    });
    const [isPaid, setIsPaid] = useState(false);
    const [qrContent, setQrContent] = useState('generating...');
    const [paymentError, setPaymentError] = useState('');
    const [orderId] = useState<string>(() => `PBX-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
    const [serverKey, setServerKey] = useState('');

    // Cash Payment State
    const [isCashModalOpen, setIsCashModalOpen] = useState(false);
    const [cashPinInput, setCashPinInput] = useState('');
    const [pinError, setPinError] = useState('');
    const [locationId, setLocationId] = useState('Unknown Location');

    useEffect(() => {
        if (!totalPrice) {
            navigate('/');
            return;
        }

        // Fetch Server Key from IPC Config
        async function initPayment() {
            try {
                const username = localStorage.getItem('currentUsername');
                if (!username) return;

                // @ts-ignore
                const config = await window.electron.getConfig(username);
                
                if (config && config.locationId) {
                    setLocationId(config.locationId);
                }

                if (!config || !config.midtransServerKey) {
                    setPaymentError('Midtrans Server Key is missing. Please configure it in the Admin panel.');
                    return;
                }

                setServerKey(config.midtransServerKey);

                // Request QR String from backend
                // @ts-ignore
                const response = await window.electron.createMidtransTransaction({
                    orderId,
                    amount: totalPrice,
                    serverKey: config.midtransServerKey
                });

                if (response.success && response.qrString) {
                    setQrContent(response.qrString);
                } else {
                    console.error("Midtrans API Error:", response.error);
                    setPaymentError(`API Error: ${response.error || 'Failed to generate QR Code'}`);
                }
            } catch (err: any) {
                console.error("Init payment err", err);
                setPaymentError(`IPC Error: ${err.message || 'Could not initialize payment'}`);
            }
        }

        initPayment();
    }, [navigate]);

    const logPaymentLocally = async (method: 'QRIS' | 'CASH', customLocationId?: string) => {
        try {
            // @ts-expect-error - electron is injected via preload
            await window.electron.savePaymentLog({
                locationId: customLocationId || locationId,
                amount: totalPrice,
                paymentType: method,
                status: 'SUCCESS'
            });
        } catch (err) {
            console.error("Error logging payment locally:", err);
        }
    };

    // Polling effect
    useEffect(() => {
        if (!orderId || !serverKey || isPaid || qrContent === 'generating...' || paymentError) return;

        const checkStatus = async () => {
            try {
                // @ts-ignore
                const response = await window.electron.checkMidtransStatus({ orderId, serverKey });

                if (response.success) {
                    const status = response.status;
                    if (status === 'settlement' || status === 'capture') {
                        setIsPaid(true);
                        await logPaymentLocally('QRIS');
                        setTimeout(() => navigate('/camera'), 2000);
                    } else if (status === 'expire' || status === 'cancel' || status === 'deny') {
                        setPaymentError(`Payment was ${status}. Please try again.`);
                    }
                }
            } catch (err) {
                console.error("Polling error", err);
            }
        };

        const intervalId = setInterval(checkStatus, 3000);
        return () => clearInterval(intervalId);
    }, [orderId, serverKey, isPaid, qrContent, paymentError, navigate]);

    const handleMockSuccess = async () => {
        setIsPaid(true);
        // Ensure we have the latest locationId from config before logging
        let latestLocation = locationId;
        try {
            const username = localStorage.getItem('currentUsername');
            if (!username) return;

            // @ts-ignore
            const config = await window.electron.getConfig(username);
            if (config && config.locationId) {
                latestLocation = config.locationId;
                setLocationId(config.locationId);
            }
        } catch (e) {
            console.error("Failed to load config for locationId in cash payment", e);
        }
        await logPaymentLocally('CASH', latestLocation);
        setTimeout(() => {
            navigate('/camera');
        }, 2000);
    };

    const handlePinSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setPinError('');
        try {
            // @ts-ignore
            const res = await window.electron.verifyCashPin({ pin: cashPinInput });
            if (res.success) {
                setIsCashModalOpen(false);
                handleMockSuccess(); // Proceed just like digital payment
            } else {
                setPinError(res.error || 'Invalid PIN');
            }
        } catch (err) {
            console.error("PIN check failed", err);
            setPinError('System error verifying PIN');
        }
    };

    return (
        <div className="min-h-screen bg-transparent text-neutral-50 flex flex-col font-sans p-8">
            <header className="flex justify-between items-center mb-12">
                <button
                    onClick={() => navigate('/selection')}
                    className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors bg-neutral-900 border border-neutral-800 px-4 py-2 rounded-xl"
                >
                    <ArrowLeft size={20} /> Back to Selection
                </button>
                <div className="text-right">
                    <p className="text-sm font-medium text-neutral-400 uppercase tracking-wider">Total Due (IDR)</p>
                    <p className="text-3xl font-extrabold text-blue-400">{formatIDR(totalPrice)}</p>
                </div>
            </header>

            <main className="flex-1 flex flex-col items-center justify-start pt-4 pb-12 overflow-y-auto hide-scrollbar">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-neutral-900 border items-center border-neutral-800 p-10 rounded-3xl shadow-2xl shadow-blue-900/10 flex flex-col max-w-md w-full"
                >
                    <div className="bg-blue-600/20 p-4 rounded-full text-blue-400 mb-6">
                        <CreditCard size={32} />
                    </div>
                    <h2 className="text-3xl font-bold mb-2">Complete Payment</h2>
                    <p className="text-neutral-400 text-center mb-8">
                        Scan the QRIS code below using your favorite e-wallet or banking app (GoPay, OVO, Dana, LinkAja, BCA, etc.)
                    </p>

                    <div className="bg-white p-6 rounded-2xl shadow-inner relative flex justify-center w-64 h-64 items-center">
                        {isPaid ? (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="text-green-500 flex flex-col items-center"
                            >
                                <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mb-4">
                                    <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                </div>
                                <p className="text-neutral-900 font-bold text-lg text-center">Payment Successful!</p>
                            </motion.div>
                        ) : paymentError ? (
                            <div className="flex flex-col items-center gap-4 text-red-500 text-center">
                                <p className="text-sm font-medium">{paymentError}</p>
                                <button
                                    onClick={() => navigate('/selection')}
                                    className="px-4 py-2 bg-neutral-100 rounded-lg text-neutral-900 font-bold"
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : qrContent === 'generating...' ? (
                            <div className="flex flex-col items-center gap-4 text-neutral-500">
                                <Loader2 size={32} className="animate-spin text-blue-500" />
                                <p className="text-sm font-medium">Generating QR...</p>
                            </div>
                        ) : (
                            <QRCodeSVG value={qrContent} size={200} level="H" includeMargin={false} />
                        )}
                    </div>

                    {!isPaid && (
                        <div className="mt-8 w-full">
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-neutral-800"></div>
                                </div>
                                <div className="relative flex justify-center text-sm">
                                    <span 
                                        onClick={() => setIsCashModalOpen(true)}
                                        className="px-4 py-1 bg-neutral-900 text-neutral-500 font-bold tracking-widest cursor-pointer hover:text-white hover:bg-neutral-800 rounded-full transition-all border border-transparent hover:border-neutral-700"
                                    >
                                        OR PAY CASH
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsCashModalOpen(true)}
                                className="mt-6 w-full py-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold transition-all border border-neutral-700 hover:border-neutral-500 flex items-center justify-center gap-2 group"
                            >
                                <Banknote size={20} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                                Cash Payment
                            </button>
                        </div>
                    )}
                </motion.div>
            </main>

            {/* Cash PIN Modal */}
            {isCashModalOpen && (
                <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl w-full max-w-sm shadow-2xl relative"
                    >
                        <button 
                            onClick={() => {
                                setIsCashModalOpen(false);
                                setCashPinInput('');
                                setPinError('');
                            }}
                            className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors"
                        >
                            <X size={24} />
                        </button>
                        
                        <div className="text-center mb-6">
                            <div className="mx-auto w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mb-4 border border-blue-500/30">
                                <ShieldCheck size={32} className="text-blue-400" />
                            </div>
                            <h3 className="text-2xl font-bold">Admin PIN</h3>
                            <p className="text-sm text-neutral-400 mt-2">Enter the active 6-digit Cash PIN<br/>provided by the cashier.</p>
                        </div>

                        <form onSubmit={handlePinSubmit}>
                            <input
                                autoFocus
                                type="text"
                                maxLength={6}
                                value={cashPinInput}
                                onChange={(e) => setCashPinInput(e.target.value.replace(/\D/g, ''))}
                                className="w-full bg-neutral-950 border border-neutral-700 focus:border-blue-500 transition-colors uppercase text-center text-4xl tracking-[0.25em] py-4 rounded-xl text-white font-mono mb-2"
                                placeholder="------"
                            />
                            
                            {pinError && (
                                <p className="text-red-500 text-sm font-medium text-center mb-4 animate-pulse">{pinError}</p>
                            )}
                            
                            <button
                                type="submit"
                                disabled={cashPinInput.length !== 6 || isPaid}
                                className="w-full mt-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-blue-900/20"
                            >
                                Verify & Proceed
                            </button>
                        </form>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
