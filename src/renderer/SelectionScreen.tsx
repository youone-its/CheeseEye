import { useState, useEffect } from 'react';
import { ShoppingCart, Check, Settings, X, ChevronRight, ImageIcon } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useNavigate } from 'react-router-dom';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export type TemplateSlot = {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
};

export type Template = {
    id: string;
    name: string;
    photosCount: number;
    price: number;
    image: string;
    description: string;
    slots?: TemplateSlot[];
};

const formatIDR = (price: number) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(price);
};

export default function SelectionScreen() {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [selectedTemplates, setSelectedTemplates] = useState<Template[]>([]);
    const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        // Auth Guard
        const isAppAuthenticated = localStorage.getItem('isAppAuthenticated');
        const currentUsername = localStorage.getItem('currentUsername');
        
        if (!isAppAuthenticated || !currentUsername) {
            navigate('/');
            return;
        }

        async function loadTemplates() {
            try {
                // Load Local Config for specific user
                // @ts-expect-error - electron is injected via preload
                const localConfig = await window.electron.getConfig(currentUsername);
                
                if (localConfig && localConfig.templates && localConfig.templates.length > 0) {
                    setTemplates(localConfig.templates);
                    setPreviewTemplate(localConfig.templates[0]);
                } else {
                    setTemplates([]);
                    setPreviewTemplate(null);
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
        <div className="h-screen bg-transparent text-neutral-50 flex flex-col font-sans overflow-hidden py-safe">
            <header className="px-8 py-4 flex justify-between items-center border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-xl shrink-0">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-white mb-1">Select Your Templates</h1>
                    <div className="flex items-center gap-3 text-neutral-400">
                        <p className="text-sm">Choose the photo grids you want to capture today.</p>
                        <button
                            onClick={() => navigate('/admin')}
                            className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-full transition-colors text-white"
                            title="Admin Settings"
                        >
                            <Settings size={14} />
                        </button>
                    </div>
                </div>
                <div className="bg-neutral-900 px-5 py-3 rounded-2xl flex items-center gap-4 border border-neutral-800 shadow-xl">
                    <div className="bg-blue-600/20 p-2.5 rounded-full text-blue-400">
                        <ShoppingCart size={20} />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Total Due</p>
                        <p className="text-xl font-bold text-white leading-none mt-1">{formatIDR(totalPrice)}</p>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-hidden flex flex-col md:flex-row pb-24">
                
                {/* Left Pane: Preview Area */}
                <div className="w-full md:w-1/2 lg:w-2/5 p-8 flex flex-col justify-between border-r border-neutral-800/50 relative">
                    {previewTemplate ? (
                        <>
                            <div className="flex-1 relative mb-6 flex items-center justify-center min-h-[300px]">
                                <img 
                                    src={previewTemplate.image} 
                                    alt={previewTemplate.name} 
                                    className="max-w-full max-h-[50vh] object-contain drop-shadow-2xl rounded-lg"
                                />
                            </div>
                            <div className="shrink-0 bg-neutral-900/50 backdrop-blur-md p-6 rounded-2xl border border-neutral-800">
                                <div className="flex justify-between items-start mb-5">
                                    <div>
                                        <h2 className="text-2xl font-bold text-white tracking-tight mb-2">{previewTemplate.name}</h2>
                                        <div className="flex gap-2">
                                            <span className="bg-blue-600 border border-blue-500 text-white px-2.5 py-1 rounded-full text-xs font-bold inline-block">
                                                {previewTemplate.photosCount} Photos
                                            </span>
                                            <span className="bg-neutral-800 text-neutral-300 px-2.5 py-1 rounded-full text-xs font-semibold inline-block border border-neutral-700">
                                                IDR {previewTemplate.price.toLocaleString('id-ID')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleSelect(previewTemplate)}
                                    className="w-full py-3.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-base shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-all flex justify-center items-center gap-2"
                                >
                                    <Check size={18} /> Add to session
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 opacity-50">
                            <ImageIcon size={64} className="mb-4" />
                            <p>Select a template to preview</p>
                        </div>
                    )}
                </div>

                {/* Right Pane: Grid Area */}
                <div className="flex-1 p-8 overflow-y-auto hide-scrollbar">
                    {templates.length > 0 ? (
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
                            {templates.map((template) => {
                                const isSelected = previewTemplate?.id === template.id;
                                return (
                                    <div
                                        key={template.id}
                                        className={`group relative overflow-hidden rounded-3xl bg-neutral-900 border-2 transition-all duration-300 shadow-lg cursor-pointer flex flex-col aspect-[3/4] ${
                                            isSelected ? 'border-blue-500 shadow-blue-500/20' : 'border-neutral-800 hover:border-neutral-600'
                                        }`}
                                        onClick={() => setPreviewTemplate(template)}
                                    >
                                        <div className="flex-1 shrink-0 overflow-hidden relative">
                                            <img
                                                src={template.image}
                                                alt={template.name}
                                                className={`w-full h-full object-cover transition-transform duration-700 ${isSelected ? 'scale-105' : 'group-hover:scale-105'}`}
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-transparent opacity-90" />
                                            <div className="absolute top-4 right-4">
                                                {template.slots && template.slots.length > 0 && (
                                                    <span className="bg-black/50 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold border border-white/10">
                                                        {template.slots.length} Slots
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="p-4 flex flex-col bg-neutral-900 border-t border-neutral-800 relative z-10 shrink-0">
                                            <h3 className="text-sm font-bold text-white mb-2 overflow-hidden text-ellipsis whitespace-nowrap">{template.name}</h3>
                                            <p className="text-neutral-400 text-xs overflow-hidden text-ellipsis line-clamp-1 mb-3">
                                                {template.description}
                                            </p>
                                            <div className="mt-auto flex justify-between items-center">
                                                <span className="text-sm font-bold text-blue-400">
                                                    {formatIDR(template.price)}
                                                </span>
                                                {isSelected && (
                                                    <span className="text-blue-500 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider">
                                                        <Check size={12} /> Previewing
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-neutral-500 pb-32">
                            <ShoppingCart size={48} className="mb-4 opacity-50" />
                            <h2 className="text-xl font-bold mb-2 text-neutral-400">No Templates Available</h2>
                            <p>Click the gear icon in the header to add templates in the Admin panel.</p>
                        </div>
                    )}
                </div>
            </main>

            {/* Slide-up footer when items are in cart */}
            <footer className={cn(
                "fixed bottom-0 left-0 right-0 bg-neutral-950/90 backdrop-blur-2xl border-t border-neutral-800 px-8 py-4 flex justify-between items-center transition-transform duration-500 transform shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-50",
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
                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold text-base flex items-center gap-2 transition-colors shadow-lg shadow-blue-600/20 whitespace-nowrap"
                    onClick={handleProceed}
                >
                    Proceed to Payment <ChevronRight size={20} />
                </button>
            </footer>
        </div>
    );
}
