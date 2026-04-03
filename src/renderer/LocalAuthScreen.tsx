import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, ShieldCheck, AlertCircle, UserPlus, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function LocalAuthScreen() {
    const navigate = useNavigate();
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isChecking, setIsChecking] = useState(false);

    useEffect(() => {
        // Auto-login if already authenticated in this persistent session
        const isAppAuthenticated = localStorage.getItem('isAppAuthenticated');
        const currentUsername = localStorage.getItem('currentUsername');
        if (isAppAuthenticated === 'true' && currentUsername) {
            navigate('/selection');
        }
    }, [navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsChecking(true);

        try {
            if (isRegister) {
                // @ts-expect-error electron api
                const result = await window.electron.authRegister({ username, password });
                if (result.success) {
                    setIsRegister(false);
                    setError('Registration successful! Please login.');
                } else {
                    setError(result.error || 'Registration failed');
                }
            } else {
                // @ts-expect-error electron api
                const result = await window.electron.authLogin({ username, password });
                if (result.success) {
                    localStorage.setItem('isAppAuthenticated', 'true');
                    localStorage.setItem('currentUsername', username);
                    navigate('/selection');
                } else {
                    setError(result.error || 'Invalid credentials');
                }
            }
        } catch (err) {
            console.error(err);
            setError('System error occurred');
        } finally {
            setIsChecking(false);
        }
    };

    return (
        <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center font-sans p-6 overflow-hidden">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="max-w-md w-full bg-neutral-900/50 border border-neutral-800 p-10 rounded-[2.5rem] shadow-2xl backdrop-blur-xl relative"
            >
                {/* Decorative Elements */}
                <div className="absolute -top-20 -left-20 w-40 h-40 bg-blue-500/10 rounded-full blur-[80px]" />
                <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-purple-500/10 rounded-full blur-[80px]" />

                <div className="text-center relative z-10">
                    <motion.div 
                        initial={{ y: -10 }}
                        animate={{ y: 0 }}
                        className="mx-auto w-20 h-20 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mb-8 shadow-lg shadow-blue-500/20"
                    >
                        {isRegister ? <UserPlus size={40} className="text-white" /> : <Lock size={40} className="text-white" />}
                    </motion.div>
                    
                    <h1 className="text-4xl font-extrabold text-white mb-3 tracking-tight">
                        {isRegister ? 'Create Account' : 'Studio Login'}
                    </h1>
                    <p className="text-neutral-400 mb-10 leading-relaxed">
                        {isRegister 
                            ? 'Create a local account to manage your own templates and settings.' 
                            : 'Login to access your isolated templates and start capturing.'}
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="relative group">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 group-focus-within:text-blue-500 transition-colors">
                                <User size={20} />
                            </div>
                            <input
                                autoFocus
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Username"
                                className="w-full bg-neutral-950/80 border-2 border-neutral-800 focus:border-blue-500 transition-all outline-none pl-12 pr-4 py-4 rounded-2xl text-white font-medium group-hover:border-neutral-700"
                            />
                        </div>

                        <div className="relative group">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 group-focus-within:text-blue-500 transition-colors">
                                <Key size={20} />
                            </div>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Password"
                                className="w-full bg-neutral-950/80 border-2 border-neutral-800 focus:border-blue-500 transition-all outline-none pl-12 pr-4 py-4 rounded-2xl text-white font-medium group-hover:border-neutral-700"
                            />
                        </div>
                        
                        <AnimatePresence>
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className={`mt-4 flex items-center justify-center gap-2 text-sm font-medium ${error.includes('successful') ? 'text-green-400' : 'text-red-400'}`}
                                >
                                    <AlertCircle size={16} />
                                    {error}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <button
                            type="submit"
                            disabled={!username || !password || isChecking}
                            className={`w-full mt-4 py-5 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-3 shadow-xl ${
                                !username || !password || isChecking
                                    ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                                    : isRegister 
                                        ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/20"
                                        : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20"
                            }`}
                        >
                            {isChecking ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <ShieldCheck size={22} />
                                    {isRegister ? 'Register Now' : 'Unlock Session'}
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 text-neutral-400">
                        {isRegister ? 'Already have an account?' : "Don't have an account?"}
                        <button 
                            type="button"
                            onClick={() => { setIsRegister(!isRegister); setError(''); }}
                            className="ml-2 text-blue-400 font-bold hover:text-blue-300 transition-colors underline underline-offset-4"
                        >
                            {isRegister ? 'Login' : 'Register Locally'}
                        </button>
                    </div>
                </div>
            </motion.div>
            
            <p className="mt-8 text-neutral-600 text-sm font-medium">
                Photobox Local Mode v1.1 • Multi-Account System
            </p>
        </div>
    );
}
