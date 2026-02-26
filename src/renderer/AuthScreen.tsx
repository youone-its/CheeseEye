import { useState } from 'react';
import { supabase } from './supabaseClient';
import { Lock, Mail, Key, UserPlus, LogIn, AlertCircle, Eye, EyeOff } from 'lucide-react';

export default function AuthScreen({ onAuthSuccess }: { onAuthSuccess: () => void }) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [devCode, setDevCode] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showDevCode, setShowDevCode] = useState(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const expectedDevCode = import.meta.env.VITE_DEVELOPER_CODE;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        if (!supabase) {
            setError('Supabase is not configured in .env');
            setLoading(false);
            return;
        }

        try {
            if (isLogin) {
                // Handle Login
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (signInError) throw signInError;
                onAuthSuccess();

            } else {
                // Handle Registration
                if (!email.endsWith('@gmail.com')) {
                    throw new Error("Only @gmail.com accounts are allowed to register.");
                }

                if (devCode !== expectedDevCode) {
                    throw new Error("Invalid Developer Registration Code.");
                }

                const { error: signUpError } = await supabase.auth.signUp({
                    email,
                    password,
                });

                if (signUpError) throw signUpError;

                // Supabase typically requires email confirmation. If disabled in dashboard, they log in immediately.
                // We'll just assume success and switch to log in, or pass them through.
                onAuthSuccess();
            }
        } catch (err: any) {
            setError(err.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center font-sans text-white p-4">
            <div className="mb-8 text-center">
                <h1 className="text-4xl font-extrabold tracking-tight mb-2">Photobooth OS</h1>
                <p className="text-neutral-400">Cloud Synchronization System</p>
            </div>

            <div className="bg-neutral-900 p-8 rounded-3xl border border-neutral-800 shadow-2xl w-full max-w-md">
                <div className="flex justify-center mb-6">
                    <div className="bg-blue-600/20 p-4 rounded-full text-blue-500">
                        {isLogin ? <LogIn size={32} /> : <UserPlus size={32} />}
                    </div>
                </div>

                <h2 className="text-2xl font-bold text-center mb-6">
                    {isLogin ? 'Studio Login' : 'Register New Studio'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-neutral-400 mb-1">Email (@gmail.com)</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                                placeholder="studio@gmail.com"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-neutral-400 mb-1">Password</label>
                        <div className="relative">
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-10 pr-12 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                                placeholder="••••••••"
                                required
                                minLength={6}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors p-1"
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    {!isLogin && (
                        <div>
                            <label className="block text-sm font-medium text-neutral-400 mb-1">Developer Code</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                                <input
                                    type={showDevCode ? "text" : "password"}
                                    value={devCode}
                                    onChange={(e) => setDevCode(e.target.value)}
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-10 pr-12 py-3 focus:outline-none focus:border-blue-500 transition-colors tracking-widest"
                                    placeholder="Secret Code"
                                    required={!isLogin}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowDevCode(!showDevCode)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors p-1"
                                >
                                    {showDevCode ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm flex items-start gap-2">
                            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                            <p>{error}</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-4 font-bold text-lg transition-colors mt-2 disabled:opacity-50"
                    >
                        {loading ? 'Authenticating...' : (isLogin ? 'Sign In' : 'Register Studio')}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button
                        onClick={() => {
                            setIsLogin(!isLogin);
                            setError('');
                        }}
                        className="text-neutral-400 hover:text-white text-sm transition-colors"
                    >
                        {isLogin ? "Don't have a studio account? Register" : "Already registered? Sign In"}
                    </button>
                </div>
            </div>
        </div>
    );
}
