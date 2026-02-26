import { useState, useEffect } from 'react';
import { ShoppingCart, Check, ChevronRight, X, Settings } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export type Template = {
    id: string;
    name: string;
    photosCount: number;
    price: number;
    image: string;
    description: string;
};

const formatIDR = (price: number) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(price);
};

export default function SelectionScreen() {
    const [selectedTemplates, setSelectedTemplates] = useState<Template[]>([]);
    const [templates, setTemplates] = useState<Template[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        async function loadTemplates() {
            try {
                // 1. Load Local Config First (for fast display / offline support)
                // @ts-ignore
                let localConfig = await window.electron.getConfig();
                if (!localConfig) localConfig = { templates: [] };

                // 2. Try to sync with Supabase Cloud
                if (supabase) {
                    try {
                        console.log("Syncing with Supabase Cloud...");
                        const [settingsRes, templatesRes] = await Promise.all([
                            supabase.from('global_settings').select('*').single(),
                            supabase.from('templates').select('*')
                        ]);

                        if (settingsRes.data && templatesRes.data) {
                            localConfig.midtransClientKey = settingsRes.data.midtrans_client_key;
                            localConfig.midtransServerKey = settingsRes.data.midtrans_server_key;

                            const cloudTemplates = templatesRes.data;
                            const newLocalTemplates = [];

                            for (const cloudTpl of cloudTemplates) {
                                // Find if we have this template cached locally
                                const existingLocal = localConfig.templates?.find((t: any) => t.id === cloudTpl.id);

                                let localImagePath = existingLocal?.image;

                                // If new template, or the cloud image URL changed, download it
                                if (!existingLocal || existingLocal.image_url !== cloudTpl.image_url) {
                                    console.log(`Downloading template image for ${cloudTpl.name}...`);
                                    // @ts-ignore
                                    const cachedPath = await window.electron.downloadTemplate({
                                        url: cloudTpl.image_url,
                                        id: cloudTpl.id
                                    });
                                    if (cachedPath) {
                                        localImagePath = `photobox://${cachedPath}`;
                                    }
                                }

                                newLocalTemplates.push({
                                    id: cloudTpl.id,
                                    name: cloudTpl.name,
                                    price: cloudTpl.price,
                                    photosCount: cloudTpl.photos_count,
                                    description: cloudTpl.description,
                                    image_url: cloudTpl.image_url,
                                    image: localImagePath || cloudTpl.image_url // Fallback to raw URL if download failed
                                });
                            }

                            // Save the newly synced config safely to local disk
                            localConfig.templates = newLocalTemplates;
                            // @ts-ignore
                            await window.electron.saveConfig(localConfig);
                        }
                    } catch (syncErr) {
                        console.error("Cloud sync failed (offline?), falling back to local cache", syncErr);
                    }
                }

                // 3. Render templates from the local config (synced or fallback)
                if (localConfig && localConfig.templates && localConfig.templates.length > 0) {
                    setTemplates(localConfig.templates);
                } else {
                    setTemplates([]);
                }
            } catch (err) {
                console.error("Failed to load templates", err);
            }
        }
        loadTemplates();
    }, []);

    const handleSelect = (template: Template) => {
        setSelectedTemplates([...selectedTemplates, template]);
    };

    const handleRemove = (indexToRemove: number) => {
        setSelectedTemplates(selectedTemplates.filter((_, idx) => idx !== indexToRemove));
    };

    const totalPrice = selectedTemplates.reduce((sum, tpl) => sum + tpl.price, 0);

    const handleProceed = () => {
        if (selectedTemplates.length > 0) {
            sessionStorage.setItem('selectedTemplates', JSON.stringify(selectedTemplates));
            sessionStorage.setItem('totalPrice', totalPrice.toString());
            navigate('/payment');
        }
    };

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-50 flex flex-col font-sans">
            <header className="p-8 pb-4 flex justify-between items-end border-b border-neutral-800">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">Select Your Templates</h1>
                    <div className="flex items-center gap-3 text-neutral-400">
                        <p className="text-lg">Choose the photo grids you want to capture today.</p>
                        <button
                            onClick={() => navigate('/admin')}
                            className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-full transition-colors text-white"
                            title="Admin Settings"
                        >
                            <Settings size={16} />
                        </button>
                    </div>
                </div>
                <div className="bg-neutral-900 px-6 py-4 rounded-2xl flex items-center gap-4 border border-neutral-800 shadow-xl">
                    <div className="bg-blue-600/20 p-3 rounded-full text-blue-400">
                        <ShoppingCart size={24} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-neutral-400 uppercase tracking-wider">Total Due</p>
                        <p className="text-2xl font-bold text-white leading-none mt-1">{formatIDR(totalPrice)}</p>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-auto p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-32">
                {templates.map((template) => (
                    <div
                        key={template.id}
                        className="group block relative overflow-hidden rounded-3xl bg-neutral-900 border border-neutral-800 hover:border-blue-500/50 transition-all duration-300 shadow-lg hover:shadow-blue-500/10 cursor-pointer flex flex-col"
                        onClick={() => handleSelect(template)}
                    >
                        <div className="h-64 overflow-hidden relative">
                            <img
                                src={template.image}
                                alt={template.name}
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 to-transparent opacity-80" />
                            <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                                <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-md">
                                    {template.photosCount} Photos
                                </span>
                                <span className="text-xl font-bold text-white drop-shadow-md">
                                    {formatIDR(template.price)}
                                </span>
                            </div>
                        </div>
                        <div className="p-6 flex-1 flex flex-col justify-between">
                            <div>
                                <h3 className="text-2xl font-bold text-white mb-2">{template.name}</h3>
                                <p className="text-neutral-400 leading-relaxed text-sm flex-1">{template.description}</p>
                            </div>
                            <button
                                className="mt-6 w-full py-3 px-4 rounded-xl bg-neutral-800 text-white font-medium group-hover:bg-blue-600 transition-colors flex justify-center items-center gap-2"
                            >
                                Add to session <Check size={18} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                        </div>
                    </div>
                ))}

                {templates.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center py-20 text-neutral-500">
                        <ShoppingCart size={48} className="mb-4 opacity-50" />
                        <h2 className="text-xl font-bold mb-2 text-neutral-400">No Templates Available</h2>
                        <p>Click the gear icon above to add templates in the Admin panel.</p>
                    </div>
                )}
            </main>

            {/* Slide-up footer when items are in cart */}
            <footer className={cn(
                "fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-800 p-6 flex justify-between items-center transition-transform duration-500 transform shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-50",
                selectedTemplates.length > 0 ? "translate-y-0" : "translate-y-full"
            )}>
                <div className="flex items-center gap-4 overflow-x-auto flex-1 mr-8 hide-scrollbar">
                    <span className="text-neutral-400 font-medium whitespace-nowrap">Your order:</span>
                    {selectedTemplates.map((tpl, idx) => (
                        <div key={`${tpl.id}-${idx}`} className="bg-neutral-800 px-4 py-2 rounded-lg flex items-center gap-3 border border-neutral-700 whitespace-nowrap">
                            <span className="font-semibold text-white">{tpl.name}</span>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleRemove(idx); }}
                                className="text-neutral-500 hover:text-red-400 transition-colors p-1"
                                aria-label="Remove"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    ))}
                </div>
                <button
                    className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-bold text-lg flex items-center gap-2 transition-colors shadow-lg shadow-blue-600/20 whitespace-nowrap"
                    onClick={handleProceed}
                >
                    Proceed to Payment <ChevronRight size={24} />
                </button>
            </footer>
        </div>
    );
}
