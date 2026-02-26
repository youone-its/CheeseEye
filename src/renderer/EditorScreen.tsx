import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stage, Layer, Image as KonvaImage, Text, Transformer } from 'react-konva';
import useImage from 'use-image';
import { v4 as uuidv4 } from 'uuid';
import { Clock, Type, ImageIcon, ChevronRight } from 'lucide-react';
import type { Template } from './SelectionScreen';

// Base types for canvas objects
type CanvasItemType = 'text' | 'image' | 'emoji';
interface CanvasItem {
    id: string;
    type: CanvasItemType;
    x: number;
    y: number;
    width?: number;
    height?: number;
    text?: string;
    src?: string;
    scaleX?: number;
    rotation?: number;
    imageOffsetX?: number;
    imageOffsetY?: number;
    imageScale?: number;
}

// Draggable Image Component with Cropping / Masking
const DraggableImage = ({ item, isSelected, onSelect, onChange }: any) => {
    const [img] = useImage(item.src);
    const shapeRef = useRef<any>(null);
    const trRef = useRef<any>(null);
    const [isPanning, setIsPanning] = useState(false);

    // Initial setup
    useEffect(() => {
        if (img && !item.crop) {
            const initialWidth = 250;
            const scale = initialWidth / img.width;
            const initialHeight = img.height * scale;

            onChange({
                ...item,
                width: initialWidth,
                height: initialHeight,
                scaleX: 1,
                scaleY: 1,
                crop: { x: 0, y: 0, width: img.width, height: img.height }
            });
        }
    }, [img, item, onChange]);

    useEffect(() => {
        if (isSelected && !isPanning && trRef.current && shapeRef.current) {
            trRef.current.nodes([shapeRef.current]);
            trRef.current.getLayer().batchDraw();
        } else if (trRef.current) {
            trRef.current.nodes([]);
            trRef.current.getLayer().batchDraw();
        }
        if (!isSelected) {
            setIsPanning(false);
        }
    }, [isSelected, isPanning]);

    if (!img || !item.crop) return null;

    return (
        <>
            <KonvaImage
                ref={shapeRef}
                image={img}
                x={item.x}
                y={item.y}
                width={item.width}
                height={item.height}
                rotation={item.rotation || 0}
                crop={item.crop}
                draggable
                opacity={isPanning ? 0.8 : 1}
                onClick={onSelect}
                onTap={onSelect}
                onDblClick={(e) => { e.cancelBubble = true; setIsPanning(!isPanning); }}
                onDblTap={(e) => { e.cancelBubble = true; setIsPanning(!isPanning); }}
                onDragMove={(e) => {
                    if (isPanning) {
                        const node = e.target as any;
                        const dx = node.x() - item.x;
                        const dy = node.y() - item.y;

                        node.x(item.x);
                        node.y(item.y);

                        const scaleX = node.cropWidth() / node.width();
                        const scaleY = node.cropHeight() / node.height();

                        let newCropX = node.cropX() - dx * scaleX;
                        let newCropY = node.cropY() - dy * scaleY;

                        // Bound it slightly to prevent losing image
                        newCropX = Math.max(0, Math.min(newCropX, img.width - node.cropWidth()));
                        newCropY = Math.max(0, Math.min(newCropY, img.height - node.cropHeight()));

                        node.cropX(newCropX);
                        node.cropY(newCropY);
                    }
                }}
                onDragEnd={(e) => {
                    if (isPanning) {
                        const node = e.target as any;
                        onChange({
                            ...item,
                            crop: {
                                x: node.cropX(),
                                y: node.cropY(),
                                width: node.cropWidth(),
                                height: node.cropHeight()
                            }
                        });
                    } else {
                        onChange({
                            ...item,
                            x: e.target.x(),
                            y: e.target.y()
                        });
                    }
                }}
                onTransform={(_e) => {
                    const node = shapeRef.current as any;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();

                    node.scaleX(1);
                    node.scaleY(1);

                    const newWidth = Math.max(10, node.width() * scaleX);
                    const newHeight = Math.max(10, node.height() * scaleY);

                    // Compute current zoom before changing width/height
                    const currentZoomX = item.width / item.crop.width;
                    const currentZoomY = item.height / item.crop.height;

                    const activeAnchor = trRef.current?.getActiveAnchor();
                    const isSide = activeAnchor === 'top-center' || activeAnchor === 'bottom-center' ||
                        activeAnchor === 'middle-left' || activeAnchor === 'middle-right';

                    if (!isSide) {
                        // Corner: pure scale
                        node.width(newWidth);
                        node.height(newHeight);
                    } else {
                        // Side: crop
                        node.width(newWidth);
                        node.height(newHeight);

                        const newCropWidth = newWidth / currentZoomX;
                        const newCropHeight = newHeight / currentZoomY;

                        let newCropX = item.crop.x;
                        let newCropY = item.crop.y;

                        if (activeAnchor === 'middle-left') {
                            newCropX = item.crop.x + (item.crop.width - newCropWidth);
                        } else if (activeAnchor === 'top-center') {
                            newCropY = item.crop.y + (item.crop.height - newCropHeight);
                        }

                        node.crop({
                            x: newCropX,
                            y: newCropY,
                            width: newCropWidth,
                            height: newCropHeight
                        });
                    }
                }}
                onTransformEnd={() => {
                    const node = shapeRef.current as any;
                    onChange({
                        ...item,
                        x: node.x(),
                        y: node.y(),
                        width: node.width(),
                        height: node.height(),
                        rotation: node.rotation(),
                        crop: {
                            x: node.cropX(),
                            y: node.cropY(),
                            width: node.cropWidth(),
                            height: node.cropHeight()
                        }
                    });
                }}
            />

            {isSelected && !isPanning && (
                <Transformer
                    ref={trRef}
                    boundBoxFunc={(oldBox, newBox) => {
                        if (newBox.width < 10 || newBox.height < 10) return oldBox;
                        return newBox;
                    }}
                />
            )}
        </>
    );
};

// Draggable Text Component
const DraggableText = ({ item, isSelected, onSelect, onChange }: any) => {
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
            <Text
                ref={shapeRef}
                {...item}
                text={item.text}
                fontSize={item.width ? undefined : 40}
                fontFamily="sans-serif"
                fill="white"
                draggable
                onClick={onSelect}
                onTap={onSelect}
                onDragEnd={(e) => {
                    onChange({ ...item, x: e.target.x(), y: e.target.y() });
                }}
                onTransformEnd={(_e) => {
                    const node = shapeRef.current;
                    onChange({
                        ...item,
                        x: node.x(),
                        y: node.y(),
                        rotation: node.rotation(),
                        scaleX: node.scaleX(),
                        scaleY: node.scaleY()
                    });
                }}
            />
            {isSelected && (
                <Transformer
                    ref={trRef}
                    enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                    boundBoxFunc={(oldBox, newBox) => {
                        if (newBox.width < 10) return oldBox;
                        return newBox;
                    }}
                />
            )}
        </>
    );
};

export default function EditorScreen() {
    const navigate = useNavigate();
    const stageRef = useRef<any>(null);

    const [templates, setTemplates] = useState<Template[]>([]);
    const [currentTemplateIndex, setCurrentTemplateIndex] = useState(0);
    const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);

    // Array of items per template. We index by template ID or maintain an array parallel to templates
    const [itemsByTemplate, setItemsByTemplate] = useState<CanvasItem[][]>([]);
    const [selectedId, selectShape] = useState<string | null>(null);

    // Global Timer (10 minutes = 600s)
    const [globalTimeLeft, setGlobalTimeLeft] = useState(600);

    // Wait until next frame to check dimensions etc if needed, but for simplicity
    const canvasWidth = 800;
    const canvasHeight = 600;

    useEffect(() => {
        try {
            const cartJson = sessionStorage.getItem('selectedTemplates');
            const photosJson = sessionStorage.getItem('capturedPhotos');

            if (cartJson && photosJson) {
                const cart = JSON.parse(cartJson);
                setTemplates(cart);
                setCapturedPhotos(JSON.parse(photosJson));
                setItemsByTemplate(cart.map(() => [])); // Initialize empty canvas for each
            } else {
                navigate('/');
            }
        } catch (e) {
            console.error(e);
            navigate('/');
        }
    }, [navigate]);

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
    }, []);

    const handleFinishEditing = async () => {
        // Generate data URLs for all finalized templates
        // This is simplified since we only capture the *current* stage here.
        // In a full implementation, you'd render each template silently, but here we just pass the stage as is 
        // or just pass whatever is currently on screen if there's only 1. To handle multiple, we just pass what we have.

        // For now we'll save the layout of the current template for proof of concept
        if (stageRef.current) {
            const dataURL = stageRef.current.toDataURL({ pixelRatio: 2 });
            // Save it to IPC for printing later, or just pass base64
            sessionStorage.setItem('finalPrintImage', dataURL);
            navigate('/print');
        }
    };

    const addItem = (item: Omit<CanvasItem, 'id'>) => {
        const newItem = { ...item, id: uuidv4() };
        const newItemsLists = [...itemsByTemplate];
        newItemsLists[currentTemplateIndex] = [...newItemsLists[currentTemplateIndex], newItem];
        setItemsByTemplate(newItemsLists);
    };

    const addText = () => addItem({ type: 'text', x: 50, y: 50, text: 'Your Text Here' });
    const addEmoji = (emoji: string) => addItem({ type: 'text', x: 50, y: 50, text: emoji, width: 60 });
    const addCapturedPhoto = (src: string) => addItem({ type: 'image', x: 50, y: 50, src });

    const currentItems = itemsByTemplate[currentTemplateIndex] || [];

    const handleItemChange = (i: number, newProps: CanvasItem) => {
        const newItemsLists = [...itemsByTemplate];
        const items = [...newItemsLists[currentTemplateIndex]];
        items[i] = newProps;
        newItemsLists[currentTemplateIndex] = items;
        setItemsByTemplate(newItemsLists);
    };

    const checkDeselect = (e: any) => {
        const clickedOnEmpty = e.target === e.target.getStage() || e.target.hasName('bg');
        if (clickedOnEmpty) {
            selectShape(null);
        }
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="h-screen bg-neutral-950 text-white flex flex-col font-sans overflow-hidden">
            {/* Top Bar */}
            <header className="px-8 py-4 bg-neutral-900 border-b border-neutral-800 flex justify-between items-center shadow-md z-10">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Customize Your Photos</h1>
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
                <aside className="w-80 bg-neutral-900 border-r border-neutral-800 flex flex-col overflow-y-auto">
                    {/* Tools */}
                    <div className="p-6 border-b border-neutral-800">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-500 mb-4">Decorations</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={addText} className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 p-3 rounded-xl transition-colors border border-neutral-700">
                                <Type size={18} /> Text
                            </button>
                            <div className="flex gap-2">
                                {['✨', '❤️', '🔥', '🎉'].map(e => (
                                    <button key={e} onClick={() => addEmoji(e)} className="flex-1 bg-neutral-800 hover:bg-neutral-700 p-3 rounded-xl flex justify-center items-center text-xl transition-colors border border-neutral-700">
                                        {e}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Captured Photos */}
                    <div className="p-6 flex-1">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-500 mb-4 flex items-center gap-2">
                            <ImageIcon size={16} /> Captured Photos
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            {capturedPhotos.map((photoSrc, idx) => (
                                <div
                                    key={idx}
                                    className="relative group cursor-pointer aspect-square rounded-xl overflow-hidden border-2 border-transparent hover:border-blue-500 transition-colors"
                                    onClick={() => addCapturedPhoto(photoSrc)}
                                >
                                    <img src={photoSrc} className="w-full h-full object-cover" alt={`capture ${idx}`} />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-md">Add to Canvas</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* Canvas Area */}
                <main className="flex-1 bg-neutral-950 flex flex-col items-center justify-center p-8 relative">
                    <div className="bg-neutral-900 p-4 border border-neutral-800 shadow-2xl shadow-blue-900/10 rounded-xl">
                        <Stage
                            width={canvasWidth}
                            height={canvasHeight}
                            onMouseDown={checkDeselect}
                            onTouchStart={checkDeselect}
                            ref={stageRef}
                            className="bg-neutral-800 rounded-lg overflow-hidden relative cursor-crosshair border border-neutral-700"
                        >
                            <Layer>
                                {/* 1. Captured Photos (Behind Template) */}
                                {currentItems.map((item, i) => {
                                    if (item.type === 'image') {
                                        return (
                                            <DraggableImage
                                                key={item.id}
                                                item={item}
                                                isSelected={item.id === selectedId}
                                                onSelect={() => selectShape(item.id)}
                                                onChange={(newProps: any) => handleItemChange(i, newProps)}
                                            />
                                        )
                                    }
                                    return null;
                                })}

                                {/* 2. Template Overlay (With transparent holes) */}
                                {templates[currentTemplateIndex] && (
                                    <TemplateOverlay src={templates[currentTemplateIndex].image} width={canvasWidth} height={canvasHeight} />
                                )}

                                {/* 3. Text and Emojis (In front of Template) */}
                                {currentItems.map((item, i) => {
                                    if (item.type === 'text' || item.type === 'emoji') {
                                        return (
                                            <DraggableText
                                                key={item.id}
                                                item={item}
                                                isSelected={item.id === selectedId}
                                                onSelect={() => selectShape(item.id)}
                                                onChange={(newProps: any) => handleItemChange(i, newProps)}
                                            />
                                        );
                                    }
                                    return null;
                                })}
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
                                        onClick={() => {
                                            selectShape(null);
                                            setCurrentTemplateIndex(idx);
                                        }}
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
    const [img] = useImage(src);
    return <KonvaImage image={img} x={0} y={0} width={width} height={height} opacity={1} listening={false} name="bg" />;
}
