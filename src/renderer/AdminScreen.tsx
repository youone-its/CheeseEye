import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Lock, Save, Trash2, Plus, Image as ImageIcon, ChevronLeft, AlertCircle, LogOut, Edit, X, FileSpreadsheet, Check } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer } from 'react-konva';
import useImage from 'use-image';
import type { TemplateSlot } from './SelectionScreen';

export default function AdminScreen() {
    const navigate = useNavigate();

    // Auth State
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [pin, setPin] = useState('');
    const [authError, setAuthError] = useState('');

    // Config State
    const [midtransClientKey, setMidtransClientKey] = useState('');
    const [midtransServerKey, setMidtransServerKey] = useState('');
    const [localBackground, setLocalBackground] = useState('');
    const [locationId, setLocationId] = useState('Branch 01');
    const [templates, setTemplates] = useState<any[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [editingSlotsIndex, setEditingSlotsIndex] = useState<number | null>(null);
    const [isPaymentLogsModalOpen, setIsPaymentLogsModalOpen] = useState(false);

    // Cash PIN State
    const [cashPin, setCashPin] = useState('');
    const [pinExpiresInMs, setPinExpiresInMs] = useState(0);

    useEffect(() => {
        if (isAuthenticated) {
            loadConfig();
            
            // Poll Cash PIN every second
            const fetchPin = async () => {
                try {
                    // @ts-ignore
                    const { pin, expiresInMs } = await window.electron.getCashPin();
                    setCashPin(pin);
                    setPinExpiresInMs(expiresInMs);
                } catch (err) {
                    console.error("Failed to fetch Cash PIN", err);
                }
            };
            
            fetchPin();
            const interval = setInterval(fetchPin, 1000);
            return () => clearInterval(interval);
        }
    }, [isAuthenticated]);

    // Format MS to MM:SS
    const formatTimeLeft = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const loadConfig = async () => {
        const username = localStorage.getItem('currentUsername');
        if (!username) return;

        try {
            // @ts-expect-error - electron is injected via preload
            let config = await window.electron.getConfig(username);
            if (!config) config = { templates: [] };

            setMidtransClientKey(config.midtransClientKey || '');
            setMidtransServerKey(config.midtransServerKey || '');
            setLocalBackground(config.localBackground || '');
            setLocationId(config.locationId || 'Branch 01');
            setTemplates(config.templates || []);
        } catch (err) {
            console.error("Failed to load config", err);
        }
    };

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError('');

        const expectedCode = import.meta.env.VITE_DEVELOPER_CODE || '1234';
        
        if (pin === expectedCode) {
            setIsAuthenticated(true);
            setAuthError('');
        } else {
            setAuthError('Invalid PIN code');
            setPin('');
        }
    };

    const handleSave = async () => {
        const username = localStorage.getItem('currentUsername');
        if (!username) return;

        setIsSaving(true);
        try {
            const configData = {
                midtransClientKey,
                midtransServerKey,
                localBackground,
                locationId,
                templates
            };

            // @ts-expect-error - electron is injected via preload
            await window.electron.saveConfig({ username, configData });
            setSaveMessage('Settings saved successfully!');
            setTimeout(() => setSaveMessage(''), 3000);
        } catch (err) {
            console.error("Failed to save config", err);
            setSaveMessage('Error saving settings.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64Data = event.target?.result as string;

            try {
                // @ts-expect-error - electron is injected via preload
                const savedPath = await window.electron.uploadTemplate({
                    base64Data,
                    filename: 'background_' + file.name
                });
                setLocalBackground(`photobox://${savedPath}`);

            } catch (err) {
                console.error("Local background save error", err);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleImageUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64Data = event.target?.result as string;

            try {
                // @ts-expect-error - electron is injected via preload
                const savedPath = await window.electron.uploadTemplate({
                    base64Data,
                    filename: file.name
                });
                const newTemplates = [...templates];
                newTemplates[index].image = `photobox://${savedPath}`;
                setTemplates(newTemplates);
            } catch (err) {
                console.error("Failed to upload image", err);
                alert("Failed to process image.");
            }
        };
        reader.readAsDataURL(file);
    };

    const addNewTemplate = () => {
        setTemplates([...templates, {
            id: uuidv4(),
            name: 'New Template',
            photosCount: 3,
            price: 50000,
            image: '',
            image_url: '',
            description: 'Description here'
        }]);
    };

    const removeTemplate = (index: number) => {
        const newTemplates = [...templates];
        newTemplates.splice(index, 1);
        setTemplates(newTemplates);
    };

    const updateTemplate = (index: number, field: string, value: any) => {
        const newTemplates = [...templates];
        newTemplates[index][field] = value;
        setTemplates(newTemplates);
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-neutral-950 flex items-center justify-center font-sans text-white">
                <div className="bg-neutral-900 p-8 rounded-2xl border border-neutral-800 shadow-2xl w-full max-w-sm">
                    <div className="flex justify-center mb-6">
                        <div className="bg-blue-600/20 p-4 rounded-full text-blue-500">
                            <Lock size={32} />
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold text-center mb-2">Admin Panel</h2>
                    <p className="text-neutral-400 text-center mb-6 text-sm">
                        Enter PIN Code to access Admin Panel
                    </p>

                    <form onSubmit={handleLogin}>
                        <input
                            type="password"
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            placeholder="PIN Code"
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors text-center text-xl font-mono"
                            autoFocus
                        />
                        {authError && (
                            <p className="text-red-400 text-sm text-center mt-3 flex items-center justify-center gap-1">
                                <AlertCircle size={14} /> {authError}
                            </p>
                        )}
                        <div className="flex gap-3 mt-6">
                            <button
                                type="button"
                                onClick={() => navigate('/selection')}
                                className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl py-3 font-semibold transition-colors"
                            >
                                Back to Gallery
                            </button>
                            <button
                                type="submit"
                                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-3 font-semibold transition-colors"
                            >
                                Enter
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-neutral-950 text-white font-sans flex flex-col">
            {/* Header */}
            <header className="px-8 py-6 border-b border-neutral-800 bg-neutral-900 flex justify-between items-center sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/selection')}
                        className="p-2 hover:bg-neutral-800 rounded-full transition-colors text-neutral-400 hover:text-white"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Settings size={22} className="text-blue-500" /> Admin Settings
                        </h1>
                        <p className="text-sm text-neutral-400">Configure app templates and payment keys.</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={() => {
                            localStorage.removeItem('isAppAuthenticated');
                            localStorage.removeItem('currentUsername');
                            navigate('/');
                        }}
                        className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-xl transition-colors border border-red-500/20"
                    >
                        <LogOut size={18} /> Logout
                    </button>
                    <button
                        onClick={() => setIsPaymentLogsModalOpen(true)}
                        className="bg-emerald-600/20 text-emerald-500 hover:bg-emerald-600 hover:text-white px-5 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors border border-emerald-600/30"
                    >
                        <FileSpreadsheet size={18} /> View Payment Logs
                    </button>
                    <button
                        onClick={() => setIsAuthenticated(false)}
                        className="p-2 hover:bg-neutral-800 rounded-full transition-colors text-neutral-400 hover:text-red-400"
                        title="Log Out"
                    >
                        <LogOut size={20} />
                    </button>
                    {saveMessage && (
                        <span className="text-sm font-medium text-green-400 bg-green-400/10 px-3 py-1 rounded-full">
                            {saveMessage}
                        </span>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                        <Save size={18} /> {isSaving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-auto p-8 max-w-6xl w-full mx-auto space-y-8 pb-32">
                {/* Cash PIN Section */}
                <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none" />
                    
                    <div className="flex flex-col md:flex-row justify-between items-center md:items-start gap-6 relative z-10">
                        <div>
                            <h2 className="text-2xl font-bold flex items-center gap-2 mb-2">
                                <Lock size={24} className="text-emerald-500" /> Active Cash PIN
                            </h2>
                            <p className="text-neutral-400">Share this 6-digit PIN with customers paying by cash.</p>
                            <div className="mt-4 flex items-center gap-3">
                                <span className="text-sm font-semibold text-neutral-500 bg-neutral-950 px-3 py-1 rounded-full border border-neutral-800">
                                    Refreshes automatically for security
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 text-center md:text-right">
                            <div className="bg-neutral-950 border border-neutral-800 px-8 py-4 rounded-xl shadow-inner">
                                <span className="text-5xl font-mono text-emerald-400 tracking-[0.2em] font-bold">
                                    {cashPin || '------'}
                                </span>
                            </div>
                            <p className={`text-sm font-medium flex items-center gap-1 ${pinExpiresInMs < 60000 ? 'text-red-400 animate-pulse' : 'text-emerald-500'}`}>
                                <span>Expires in {formatTimeLeft(pinExpiresInMs)}</span>
                            </p>
                        </div>
                    </div>
                </section>

                {/* Global Background Config */}
                <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        🎨 Global App Background
                    </h2>
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="w-full md:w-64 flex-shrink-0">
                            <label className="block text-sm font-medium text-neutral-400 mb-2">Background Image</label>
                            <div className="aspect-video bg-neutral-950 border-2 border-dashed border-neutral-800 rounded-xl flex flex-col items-center justify-center relative overflow-hidden group/img cursor-pointer hover:border-blue-500 transition-colors">
                                {localBackground ? (
                                    <img src={localBackground} alt="App Background" className="w-full h-full object-cover" />
                                ) : (
                                    <ImageIcon size={32} className="text-neutral-600 mb-2" />
                                )}

                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                                    <span className="text-xs font-bold text-white uppercase tracking-wider">Upload Image</span>
                                </div>
                                <input
                                    type="file"
                                    accept="image/png, image/jpeg, image/webp"
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    onChange={handleBackgroundUpload}
                                />
                            </div>
                            <p className="mt-2 text-xs text-neutral-500 text-center">Replaces default dark background.</p>
                        </div>
                        <div className="flex-1 flex flex-col justify-center space-y-6">
                            <div>
                                <h3 className="font-medium text-white mb-2">Location Identifier</h3>
                                <p className="text-sm text-neutral-400 mb-3">
                                    Used to tag payment logs (e.g. "Mall A", "Cafe B").
                                </p>
                                <input
                                    type="text"
                                    value={locationId}
                                    onChange={(e) => setLocationId(e.target.value)}
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                                    placeholder="e.g. Branch 01"
                                />
                            </div>
                            
                            <div className="border-t border-neutral-800 pt-6">
                                <h3 className="font-medium text-white mb-2">Custom Studio Branding</h3>
                                <p className="text-sm text-neutral-400">
                                    This image will be heavily blurred and sit behind the interfaces on all screens, offering a seamless and deeply branded experience for your customers. Leave empty for the default dark mode.
                                </p>
                                {localBackground && (
                                    <button
                                        onClick={() => {
                                            setLocalBackground('');
                                        }}
                                        className="mt-4 self-start bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                                    >
                                        Remove Background
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </section>


                {/* Midtrans Config */}
                <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        💳 Midtrans Configuration
                    </h2>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-neutral-400 mb-2">Client Key (Public)</label>
                            <input
                                type="text"
                                value={midtransClientKey}
                                onChange={(e) => setMidtransClientKey(e.target.value)}
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                                placeholder="SB-Mid-client-..."
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-neutral-400 mb-2">Server Key (Secret)</label>
                            <input
                                type="password"
                                value={midtransServerKey}
                                onChange={(e) => setMidtransServerKey(e.target.value)}
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                                placeholder="SB-Mid-server-..."
                            />
                        </div>
                    </div>
                </section>

                {/* Templates Config */}
                <section>
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            🖼️ Templates Management
                        </h2>
                        <button
                            onClick={addNewTemplate}
                            className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors border border-neutral-700"
                        >
                            <Plus size={18} /> Add Template
                        </button>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-6">
                        {templates.map((template, idx) => (
                            <div key={template.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 relative group">
                                <button
                                    onClick={() => removeTemplate(idx)}
                                    className="absolute top-4 right-4 bg-red-500/10 text-red-500 p-2 rounded-lg hover:bg-red-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                                    title="Delete Template"
                                >
                                    <Trash2 size={16} />
                                </button>

                                <div className="flex gap-6">
                                    {/* Image Uploader */}
                                    <div className="w-40 flex-shrink-0">
                                        <label className="block text-sm font-medium text-neutral-400 mb-2">Graphic File</label>
                                        <div className="aspect-[3/4] bg-neutral-950 border-2 border-dashed border-neutral-800 rounded-xl flex flex-col items-center justify-center relative overflow-hidden group/img cursor-pointer hover:border-blue-500 transition-colors">
                                            {template.image ? (
                                                <img src={template.image} alt="Template" className="w-full h-full object-cover" />
                                            ) : (
                                                <ImageIcon size={32} className="text-neutral-600 mb-2" />
                                            )}

                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                                                <span className="text-xs font-bold text-white uppercase tracking-wider">Upload PNG</span>
                                            </div>
                                            <input
                                                type="file"
                                                accept="image/png, image/jpeg"
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                onChange={(e) => handleImageUpload(idx, e)}
                                            />
                                        </div>
                                    </div>

                                    {/* Template Details */}
                                    <div className="flex-1 space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-400 mb-1">Name</label>
                                            <input
                                                type="text"
                                                value={template.name}
                                                onChange={(e) => updateTemplate(idx, 'name', e.target.value)}
                                                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-neutral-400 mb-1">Photos Count</label>
                                                <input
                                                    type="number"
                                                    value={template.photosCount}
                                                    onChange={(e) => updateTemplate(idx, 'photosCount', parseInt(e.target.value))}
                                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-neutral-400 mb-1">Price (IDR)</label>
                                                <input
                                                    type="number"
                                                    value={template.price}
                                                    onChange={(e) => updateTemplate(idx, 'price', parseInt(e.target.value))}
                                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-400 mb-1">Description</label>
                                            <textarea
                                                value={template.description || ''}
                                                onChange={(e) => updateTemplate(idx, 'description', e.target.value)}
                                                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none h-20 resize-none"
                                            />
                                        </div>
                                        
                                        {/* Edit Slots Button */}
                                        <div className="pt-2">
                                            <button
                                                onClick={() => setEditingSlotsIndex(idx)}
                                                className="w-full bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg font-medium flex justify-center items-center gap-2 transition-colors border border-neutral-700 disabled:opacity-50"
                                                disabled={!template.image}
                                            >
                                                <Edit size={16} /> Edit Photo Slots ({template.slots?.length || 0})
                                            </button>
                                        </div>

                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {templates.length === 0 && (
                        <div className="text-center py-12 bg-neutral-900 border border-neutral-800 rounded-2xl border-dashed">
                            <ImageIcon size={48} className="mx-auto text-neutral-700 mb-4" />
                            <p className="text-neutral-400">No templates configured yet. Add one to get started.</p>
                        </div>
                    )}
                </section>
            </main>

            {/* Slot Editor Modal */}
            {editingSlotsIndex !== null && (
                <SlotEditorModal
                    template={templates[editingSlotsIndex]}
                    onClose={() => setEditingSlotsIndex(null)}
                    onSave={(newSlots) => {
                        updateTemplate(editingSlotsIndex, 'slots', newSlots);
                        setEditingSlotsIndex(null);
                    }}
                />
            )}

            {isPaymentLogsModalOpen && (
                <PaymentLogsModal onClose={() => setIsPaymentLogsModalOpen(false)} locationId={locationId} />
            )}
        </div>
    );
}

// -------------------------------------------------------------
// PAYMENT LOGS MODAL COMPONENT
// -------------------------------------------------------------

const PaymentLogsModal = ({ onClose, locationId }: { onClose: () => void, locationId: string }) => {
    const [logs, setLogs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchLogs = async () => {
            setIsLoading(true);
            try {
                // @ts-expect-error - electron is injected via preload
                const data = await window.electron.getPaymentLogs();
                setLogs(data || []);
            } catch (err: any) {
                console.error("Failed to fetch logs", err);
                setError(err.message || 'Error fetching logs');
            } finally {
                setIsLoading(false);
            }
        };

        fetchLogs();
    }, []);

    const formatIDR = (price: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            maximumFractionDigits: 0,
        }).format(price);
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-8">
            <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-2xl font-bold flex items-center gap-2">
                            <FileSpreadsheet className="text-emerald-500" /> Payment Logs
                        </h2>
                        <p className="text-neutral-400 mt-1">Transaction history from all photobooth machines.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full transition-colors text-neutral-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-auto border border-neutral-800 rounded-xl relative">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full text-neutral-500 py-20">Loading...</div>
                    ) : error ? (
                        <div className="flex items-center justify-center h-full text-red-500 py-20">{error}</div>
                    ) : logs.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-neutral-500 py-20">No payment logs found.</div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-neutral-950 sticky top-0 z-10">
                                <tr>
                                    <th className="p-4 border-b border-neutral-800 text-neutral-400 font-medium whitespace-nowrap">Time</th>
                                    <th className="p-4 border-b border-neutral-800 text-neutral-400 font-medium whitespace-nowrap">Location ID</th>
                                    <th className="p-4 border-b border-neutral-800 text-neutral-400 font-medium whitespace-nowrap">Method</th>
                                    <th className="p-4 border-b border-neutral-800 text-neutral-400 font-medium whitespace-nowrap">Amount</th>
                                    <th className="p-4 border-b border-neutral-800 text-neutral-400 font-medium whitespace-nowrap">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((log) => (
                                    <tr key={log.id} className="hover:bg-neutral-800/50 transition-colors border-b border-neutral-800/50">
                                        <td className="p-4 text-sm whitespace-nowrap">
                                            {new Date(log.createdAt).toLocaleString()}
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${log.locationId === locationId ? 'bg-blue-500/20 text-blue-400' : 'bg-neutral-800 text-neutral-300'}`}>
                                                {log.locationId}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${log.paymentType === 'QRIS' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                                                {log.paymentType}
                                            </span>
                                        </td>
                                        <td className="p-4 font-bold text-blue-400 whitespace-nowrap">
                                            {formatIDR(log.amount)}
                                        </td>
                                        <td className="p-4">
                                            <span className="text-emerald-500 font-medium text-sm flex items-center gap-1">
                                                <Check size={14} /> {log.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

// -------------------------------------------------------------
// SLOT EDITOR MODAL COMPONENT
// -------------------------------------------------------------

type SlotEditorModalProps = {
    template: any;
    onClose: () => void;
    onSave: (slots: TemplateSlot[]) => void;
};

const DraggableSlot = ({ shapeProps, isSelected, onSelect, onChange }: any) => {
    const shapeRef = useRef<any>(null);
    const trRef = useRef<any>(null);

    useEffect(() => {
        if (isSelected && trRef.current && shapeRef.current) {
            trRef.current.nodes([shapeRef.current]);
            trRef.current.getLayer().batchDraw();
        }
    }, [isSelected]);

    return (
        <>
            <Rect
                onClick={onSelect}
                onTap={onSelect}
                ref={shapeRef}
                {...shapeProps}
                fill="rgba(59, 130, 246, 0.4)"
                stroke="#3b82f6"
                strokeWidth={2}
                draggable
                onDragEnd={(e: any) => {
                    onChange({
                        ...shapeProps,
                        x: e.target.x(),
                        y: e.target.y(),
                    });
                }}
                onTransformEnd={() => {
                    const node = shapeRef.current;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();

                    // reset scale, so only width/height change
                    node.scaleX(1);
                    node.scaleY(1);
                    onChange({
                        ...shapeProps,
                        x: node.x(),
                        y: node.y(),
                        width: Math.max(5, node.width() * scaleX),
                        height: Math.max(5, node.height() * scaleY),
                        rotation: node.rotation(),
                    });
                }}
            />
            {isSelected && (
                <Transformer
                    ref={trRef}
                    boundBoxFunc={(oldBox, newBox) => {
                        if (newBox.width < 10 || newBox.height < 10) {
                            return oldBox;
                        }
                        return newBox;
                    }}
                />
            )}
        </>
    );
};

const SlotEditorModal = ({ template, onClose, onSave }: SlotEditorModalProps) => {
    const [slots, setSlots] = useState<TemplateSlot[]>(template.slots || []);
    const [selectedId, selectShape] = useState<string | null>(null);
    const [img] = useImage(template.image);
    
    // Scale canvas to fit modal well
    const PADDING = 100;
    const containerWidth = window.innerWidth - PADDING * 2;
    const containerHeight = window.innerHeight - PADDING * 2;
    
    let displayScale = 1;
    let stageWidth = containerWidth;
    let stageHeight = containerHeight;

    if (img) {
        displayScale = Math.min(
            containerWidth / img.width,
            containerHeight / img.height
        );
        stageWidth = img.width * displayScale;
        stageHeight = img.height * displayScale;
    }

    const checkDeselect = (e: any) => {
        const clickedOnEmpty = e.target === e.target.getStage() || e.target.hasName('bg');
        if (clickedOnEmpty) {
            selectShape(null);
        }
    };

    const handleAddSlot = () => {
        setSlots([...slots, {
            id: uuidv4(),
            x: 50,
            y: 50,
            width: 300,
            height: 200,
            rotation: 0
        }]);
    };

    const handleDeleteSlot = () => {
        if (selectedId) {
            setSlots(slots.filter(s => s.id !== selectedId));
            selectShape(null);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-[90vw] flex justify-between items-center mb-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">Edit Photo Slots</h2>
                    <p className="text-neutral-400">Position the blue boxes where users' photos should appear.</p>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={handleAddSlot} className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-xl flex items-center gap-2">
                        <Plus size={18} /> Add Slot
                    </button>
                    <button onClick={handleDeleteSlot} disabled={!selectedId} className="bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white px-4 py-2 rounded-xl flex items-center gap-2 disabled:opacity-50">
                        <Trash2 size={18} /> Delete Selected
                    </button>
                    <div className="w-px h-8 bg-neutral-800 mx-2" />
                    <button onClick={onClose} className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-4 py-2 rounded-xl flex items-center gap-2">
                        Cancel
                    </button>
                    <button onClick={() => onSave(slots)} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-600/20">
                        <Save size={18} /> Save Slots
                    </button>
                </div>
            </div>

            <div 
                className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden relative shadow-2xl shadow-blue-900/10"
                style={{ width: stageWidth, height: stageHeight }}
            >
                {img ? (
                    <Stage
                        width={stageWidth}
                        height={stageHeight}
                        scaleX={displayScale}
                        scaleY={displayScale}
                        onMouseDown={checkDeselect}
                        onTouchStart={checkDeselect}
                        className="cursor-crosshair"
                    >
                        <Layer>
                            <KonvaImage 
                                image={img} 
                                name="bg" 
                                width={img.width} 
                                height={img.height} 
                                opacity={0.6} // dimmed template to make slots stand out
                            />
                            {slots.map((slot, i) => (
                                <DraggableSlot
                                    key={slot.id}
                                    shapeProps={slot}
                                    isSelected={slot.id === selectedId}
                                    onSelect={() => selectShape(slot.id)}
                                    onChange={(newAttrs: any) => {
                                        const newSlots = [...slots];
                                        newSlots[i] = newAttrs;
                                        setSlots(newSlots);
                                    }}
                                />
                            ))}
                        </Layer>
                    </Stage>
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-500">
                        Loading Template Image...
                    </div>
                )}
            </div>
            
            <div className="mt-6 flex gap-4 text-sm text-neutral-400">
                <p>💡 Tip: You can drag, resize, and rotate the blue slots to perfectly fit the transparent windows of your template.</p>
                <p>📸 Ensure you create exactly <strong className="text-white">{template.photosCount}</strong> slots.</p>
            </div>
        </div>
    );
};
