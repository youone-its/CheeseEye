import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import { Clock, ImageIcon, ChevronRight, CheckCircle2 } from 'lucide-react';
import type { Template, TemplateSlot } from './SelectionScreen';

// Helper component to render an assigned photo into a slot
const SlotImage = ({ slot, photoSrc, onRemove }: { slot: TemplateSlot, photoSrc: string, onRemove: () => void }) => {
    // ALWAYS use anonymous for cross-origin local HTTP sources to prevent Tainted Canvas exceptions
    const [img] = useImage(photoSrc, 'anonymous');

    if (!img) return null;

    // Crop the image from the center to fill the slot dimensions
    const scale = Math.max(slot.width / img.width, slot.height / img.height);
    const cropWidth = slot.width / scale;
    const cropHeight = slot.height / scale;
    const cropX = (img.width - cropWidth) / 2;
    const cropY = (img.height - cropHeight) / 2;

    return (
        <KonvaImage
            image={img}
            x={slot.x}
            y={slot.y}
            width={slot.width}
            height={slot.height}
            rotation={slot.rotation}
            crop={{ x: cropX, y: cropY, width: cropWidth, height: cropHeight }}
            onClick={onRemove}
            onTap={onRemove}
        />
    );
};

export default function EditorScreen() {
    const navigate = useNavigate();
    const stageRef = useRef<any>(null);

    const [templates, setTemplates] = useState<Template[]>([]);
    const [currentTemplateIndex, setCurrentTemplateIndex] = useState(0);
    const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);

    // slotAssignments[templateIndex][slotId] = photoSrc
    const [slotAssignments, setSlotAssignments] = useState<Record<string, Record<string, string>>>({});

    // Global Timer (10 minutes = 600s)
    const [globalTimeLeft, setGlobalTimeLeft] = useState(600);
    const [dslrCapturePath, setDslrCapturePath] = useState<string>('');

    const [templateSize, setTemplateSize] = useState({ width: 800, height: 600 });
    const [displayScale, setDisplayScale] = useState(1);

    useEffect(() => {
        try {
            const cartJson = sessionStorage.getItem('selectedTemplates');
            const photosJson = sessionStorage.getItem('capturedPhotos');

            if (cartJson && photosJson) {
                const cart = JSON.parse(cartJson);
                setTemplates(cart);
                setCapturedPhotos(JSON.parse(photosJson));

                // Initialize empty slot assignments
                const initialAssignments: any = {};
                cart.forEach((t: Template) => {
                    initialAssignments[t.id] = {};
                });
                setSlotAssignments(initialAssignments);
            } else {
                navigate('/selection');
            }
        } catch (e) {
            console.error(e);
            navigate('/selection');
        }

        // Fetch DSLR Path from config for saving final results
        const loadConfig = async () => {
            try {
                const username = localStorage.getItem('currentUsername');
                if (!username) return;
                // @ts-ignore
                const config = await window.electron.getConfig(username);
                if (config && config.dslrCapturePath) {
                    setDslrCapturePath(config.dslrCapturePath);
                }
            } catch (err) {
                console.error("Failed to load dslr path in editor screen", err);
            }
        };
        loadConfig();
    }, [navigate]);

    const [isExporting, setIsExporting] = useState(false);

    const handleFinishEditing = async () => {
        if (stageRef.current && !isExporting) {
            setIsExporting(true);
            try {
                const sessionId = sessionStorage.getItem('sessionId');
                if (!sessionId) throw new Error("No session ID found");

                // --- HD/4K QUALITY OPTIMIZATION ---
                const MAX_EXPORT_SIZE = 4096; // GPU safety limit
                const TARGET_RESOLUTION = 3840; // Aim for 4K width/height

                // We want the final output to be at least 4K, or the original template size (whichever is higher)
                let targetWidth = Math.max(templateSize.width, TARGET_RESOLUTION);
                let targetHeight = (targetWidth / templateSize.width) * templateSize.height;

                // Adjust if height is the dominant dimension for 4K
                if (targetHeight < TARGET_RESOLUTION && templateSize.height > templateSize.width) {
                    targetHeight = TARGET_RESOLUTION;
                    targetWidth = (targetHeight / templateSize.height) * templateSize.width;
                }

                // Cap to MAX_EXPORT_SIZE to prevent browser/GPU crashes
                if (targetWidth > MAX_EXPORT_SIZE || targetHeight > MAX_EXPORT_SIZE) {
                    const capScale = Math.min(MAX_EXPORT_SIZE / targetWidth, MAX_EXPORT_SIZE / targetHeight);
                    targetWidth *= capScale;
                    targetHeight *= capScale;
                }

                // pixelRatio is relative to the STAGE's current physical size (templateSize * displayScale)
                const currentStageWidth = templateSize.width * displayScale;
                const exportPixelRatio = targetWidth / currentStageWidth;

                console.log(`Exporting at ${Math.round(targetWidth)}x${Math.round(targetHeight)} (pixelRatio: ${exportPixelRatio})`);

                const dataURL = stageRef.current.toDataURL({ 
                    pixelRatio: exportPixelRatio,
                    imageSmoothingEnabled: true
                });
                
                // Instead of sessionStorage, we send it to main process to be saved as a real file
                // @ts-expect-error - electron api
                await window.electron.startQRServer({ sessionId, finalBase64: dataURL, capturePath: dslrCapturePath });
                
                // We only store the SESSION ID, let the Print Screen fetch the file via HTTP
                navigate('/print');
            } catch (err) {
                console.error("Failed to generate or save print image!", err);
                alert("Failed to process image. High-resolution export crashed. Please try again.");
            } finally {
                setIsExporting(false);
            }
        }
    };

    useEffect(() => {
        const interval = setInterval(() => {
            setGlobalTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    handleFinishEditing();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [displayScale, navigate]);

    useEffect(() => {
        if (templates[currentTemplateIndex]?.image) {
            const img = new Image();
            img.onload = () => {
                setTemplateSize({ width: img.width, height: img.height });
            };
            img.src = templates[currentTemplateIndex].image;
        }
    }, [currentTemplateIndex, templates]);

    useEffect(() => {
        const calculateScale = () => {
            const PADDING = 80;
            const containerWidth = window.innerWidth - 320 - PADDING;
            const containerHeight = window.innerHeight - 100 - PADDING;
            if (templateSize.width > 0 && templateSize.height > 0) {
                const scale = Math.min(
                    containerWidth / templateSize.width,
                    containerHeight / templateSize.height
                );
                setDisplayScale(scale > 0 ? Math.min(scale, 1) : 1);
            }
        };
        calculateScale();
        window.addEventListener('resize', calculateScale);
        return () => window.removeEventListener('resize', calculateScale);
    }, [templateSize]);

    const currentTemplate = templates[currentTemplateIndex];
    const currentAssignments = currentTemplate ? slotAssignments[currentTemplate.id] || {} : {};

    const handleAssignPhoto = (photoSrc: string) => {
        if (!currentTemplate || !currentTemplate.slots) return;

        // Find first empty slot
        const emptySlot = currentTemplate.slots.find(slot => !currentAssignments[slot.id]);
        
        if (emptySlot) {
            setSlotAssignments(prev => ({
                ...prev,
                [currentTemplate.id]: {
                    ...prev[currentTemplate.id],
                    [emptySlot.id]: photoSrc
                }
            }));
        }
    };

    const handleRemovePhoto = (slotId: string) => {
        if (!currentTemplate) return;
        setSlotAssignments(prev => {
            const next = { ...prev };
            const nextTpl = { ...next[currentTemplate.id] };
            delete nextTpl[slotId];
            next[currentTemplate.id] = nextTpl;
            return next;
        });
    };

    const isPhotoUsed = (photoSrc: string): boolean => {
        // Technically this checks the current template only. If a photo can only be used once globally, change the logic to scan all templates
        return Object.values(currentAssignments).includes(photoSrc);
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="h-screen bg-transparent text-white flex flex-col font-sans overflow-hidden">
            {/* Top Bar */}
            <header className="px-8 py-4 bg-neutral-950/80 backdrop-blur-xl border-b border-neutral-800 flex justify-between items-center shadow-md z-10">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Arrange Your Photos</h1>
                    <p className="text-sm text-neutral-400 mt-1">
                        Template {currentTemplateIndex + 1} of {templates.length}
                    </p>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 bg-neutral-800 px-4 py-2 rounded-xl text-neutral-200">
                        <Clock size={18} className={globalTimeLeft <= 60 ? 'text-red-400 animate-pulse' : 'text-blue-400'} />
                        <span className={`font-mono font-bold text-lg ${globalTimeLeft <= 60 ? 'text-red-400' : ''}`}>
                            {formatTime(globalTimeLeft)}
                        </span>
                    </div>

                    <button
                        onClick={handleFinishEditing}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-lg shadow-blue-600/20"
                    >
                        Finish & Print <ChevronRight size={18} />
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar / Tools */}
                <aside className="w-80 bg-neutral-950/80 backdrop-blur-xl border-r border-neutral-800 flex flex-col overflow-y-auto">
                    <div className="p-6 pb-2 border-b border-neutral-800 bg-blue-900/10">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-blue-400 mb-2 flex items-center gap-2">
                           INSTRUCTIONS
                        </h3>
                        <p className="text-sm text-neutral-300 leading-relaxed">
                            Click on your captured photos to add them to the template slots. <br/><br/>
                            Click on a photo in the template to remove it.
                        </p>
                    </div>

                    {/* Captured Photos */}
                    <div className="p-6 flex-1">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-500 mb-4 flex items-center gap-2">
                            <ImageIcon size={16} /> Captured Photos
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            {capturedPhotos.map((photoSrc, idx) => {
                                const used = isPhotoUsed(photoSrc);
                                return (
                                    <div
                                        key={idx}
                                        className={`relative group cursor-pointer aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                                            used ? 'border-blue-500 opacity-60' : 'border-transparent hover:border-neutral-500'
                                        }`}
                                        onClick={() => handleAssignPhoto(photoSrc)}
                                    >
                                        <img src={photoSrc} className="w-full h-full object-cover" alt={`capture ${idx}`} />
                                        
                                        {used && (
                                            <div className="absolute inset-0 bg-blue-900/40 flex items-center justify-center">
                                                <CheckCircle2 size={32} className="text-white drop-shadow-md" />
                                            </div>
                                        )}
                                        
                                        {!used && (
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <span className="bg-neutral-800 text-white text-xs px-2 py-1 rounded-md">Insert Photo</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </aside>

                {/* Canvas Area */}
                <main className="flex-1 bg-transparent flex flex-col items-center justify-center p-8 relative">
                    <div
                        className="bg-neutral-900 border border-neutral-800 shadow-2xl shadow-blue-900/10 rounded-xl overflow-hidden flex items-center justify-center cursor-default"
                        style={{ width: templateSize.width * displayScale, height: templateSize.height * displayScale }}
                    >
                        <Stage
                            width={templateSize.width * displayScale}
                            height={templateSize.height * displayScale}
                            scaleX={displayScale}
                            scaleY={displayScale}
                            ref={stageRef}
                            className="bg-zinc-200 relative"
                        >
                            <Layer>
                                {/* 1. Photos in Slots (Behind Template) */}
                                {currentTemplate?.slots?.map((slot) => {
                                    const photoSrc = currentAssignments[slot.id];
                                    if (photoSrc) {
                                        return <SlotImage key={slot.id} slot={slot} photoSrc={photoSrc} onRemove={() => handleRemovePhoto(slot.id)} />;
                                    }
                                    return null;
                                })}

                                {/* 2. Template Background Cover */}
                                {currentTemplate && (
                                    <TemplateOverlay src={currentTemplate.image} width={templateSize.width} height={templateSize.height} />
                                )}
                            </Layer>
                        </Stage>
                    </div>

                    {/* Template Paginator */}
                    {templates.length > 1 && (
                        <div className="absolute bottom-8 flex justify-center w-full">
                            <div className="bg-neutral-900 border border-neutral-800 px-4 py-3 rounded-full flex gap-2 shadow-xl">
                                {templates.map((_, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setCurrentTemplateIndex(idx)}
                                        className={`w-3 h-3 rounded-full transition-all ${idx === currentTemplateIndex ? 'bg-blue-500 w-6' : 'bg-neutral-600 hover:bg-neutral-500'}`}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

// Helper to show template overlaid with transparent windows for photos
const TemplateOverlay = ({ src, width, height }: { src: string, width: number, height: number }) => {
    // ALWAYS use anonymous for cross-origin local HTTP sources
    const [img] = useImage(src, 'anonymous');
    return <KonvaImage image={img} x={0} y={0} width={width} height={height} opacity={1} listening={false} name="bg" />;
}
