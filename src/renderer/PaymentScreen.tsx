import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, CreditCard, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

const formatIDR = (price: number) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(price);
};

export default function PaymentScreen() {
    const navigate = useNavigate();
    const [totalPrice, setTotalPrice] = useState(0);
    const [isPaid, setIsPaid] = useState(false);
    const [qrContent, setQrContent] = useState('generating...');
    const [paymentError, setPaymentError] = useState('');
    const [orderId, setOrderId] = useState('');
    const [serverKey, setServerKey] = useState('');

    useEffect(() => {
        const priceStr = sessionStorage.getItem('totalPrice');
        if (!priceStr) {
            navigate('/');
            return;
        }

        const amount = Number(priceStr);
        setTotalPrice(amount);

        // Generate a random, unique Order ID for this transaction session
        const newOrderId = `PBX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        setOrderId(newOrderId);

        // Fetch Server Key from IPC Config
        async function initPayment() {
            try {
                // @ts-ignore
                const config = await window.electron.getConfig();

                if (!config || !config.midtransServerKey) {
                    setPaymentError('Midtrans Server Key is missing. Please configure it in the Admin panel.');
                    return;
                }

                setServerKey(config.midtransServerKey);

                // Request QR String from backend
                // @ts-ignore
                const response = await window.electron.createMidtransTransaction({
                    orderId: newOrderId,
                    amount: amount,
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

    const handleMockSuccess = () => {
        setIsPaid(true);
        setTimeout(() => {
            navigate('/camera');
        }, 2000);
    };

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-50 flex flex-col font-sans p-8">
            <header className="flex justify-between items-center mb-12">
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors bg-neutral-900 border border-neutral-800 px-4 py-2 rounded-xl"
                >
                    <ArrowLeft size={20} /> Back to Selection
                </button>
                <div className="text-right">
                    <p className="text-sm font-medium text-neutral-400 uppercase tracking-wider">Total Due (IDR)</p>
                    <p className="text-3xl font-extrabold text-blue-400">{formatIDR(totalPrice)}</p>
                </div>
            </header>

            <main className="flex-1 flex items-center justify-center">
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
                                    onClick={() => navigate('/')}
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
                                    <span className="px-2 bg-neutral-900 text-neutral-500 font-medium">TESTING ONLY</span>
                                </div>
                            </div>
                            <button
                                onClick={handleMockSuccess}
                                className="mt-6 w-full py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-medium transition-colors border border-neutral-700"
                            >
                                Simulate Successful Payment
                            </button>
                        </div>
                    )}
                </motion.div>
            </main>
        </div>
    );
}
