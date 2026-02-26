import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Lock, Save, Trash2, Plus, Image as ImageIcon, ChevronLeft, AlertCircle, LogOut } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabaseClient';

export default function AdminScreen() {
    const navigate = useNavigate();

    // Auth State
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [pin, setPin] = useState('');
    const [authError, setAuthError] = useState('');

    // Config State
    const [midtransClientKey, setMidtransClientKey] = useState('');
    const [midtransServerKey, setMidtransServerKey] = useState('');
    const [templates, setTemplates] = useState<any[]>([]);

    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    useEffect(() => {
        if (isAuthenticated) {
            loadConfig();
        }
    }, [isAuthenticated]);

    const loadConfig = async () => {
        try {
            // @ts-ignore
            const config = await window.electron.getConfig();
            if (config) {
                setMidtransClientKey(config.midtransClientKey || '');
                setMidtransServerKey(config.midtransServerKey || '');
                setTemplates(config.templates || []);
            }
        } catch (err) {
            console.error("Failed to load config", err);
        }
    };

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (pin === '1234') {
            setIsAuthenticated(true);
            setAuthError('');
        } else {
            setAuthError('Invalid PIN code');
            setPin('');
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const configData = {
                midtransClientKey,
                midtransServerKey,
                templates
            };

            if (supabase) {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) throw new Error("Not authenticated with Cloud");

                const userId = session.user.id;

                // Push Settings to cloud database
                const { error: settingsError } = await supabase.from('global_settings').upsert({
                    user_id: userId,
                    midtrans_client_key: midtransClientKey,
                    midtrans_server_key: midtransServerKey
                }, { onConflict: 'user_id' }); // Since it's unique

                if (settingsError) {
                    console.error("Supabase Settings Push Error:", settingsError);
                    alert(`Failed to save cloud config: ${settingsError.message}`);
                    throw settingsError;
                }

                // Push Templates to cloud database
                for (const tpl of templates) {
                    // Check if it's a new template by seeing if the ID is just a local timestamp or string (uuidv4 generates valid uuids but maybe Supabase needs insert vs update)
                    // The safest way is to let Supabase handle the ID if it's new, or just upsert with the ID.
                    // The RLS error "new row violates row-level security policy" on INSERT means the user_id in the row doesn't match auth.uid(), OR the policy is missing.
                    // Wait, our policy is: CREATE POLICY "Users can insert own templates" ON templates FOR INSERT WITH CHECK (auth.uid() = user_id);
                    // This means `userId` must exactly equal `auth.uid()`. It should!

                    const templatePayload: any = {
                        user_id: userId,
                        name: tpl.name,
                        price: tpl.price,
                        photos_count: tpl.photosCount,
                        description: tpl.description,
                        image_url: tpl.image_url || ''
                    };

                    let tplError = null;

                    if (tpl.id && tpl.id.length === 36) {
                        // Check if this template actually exists in the database already
                        const { data: existing, error: checkError } = await supabase.from('templates').select('id').eq('id', tpl.id).maybeSingle();

                        console.log(`Checking Template ID: ${tpl.id} | Found existing:`, existing, " | Error:", checkError);

                        if (existing) {
                            // Update existing template
                            console.log(`Updating existing template: ${tpl.id}`);
                            const { error } = await supabase.from('templates').update(templatePayload).eq('id', tpl.id);
                            tplError = error;
                        } else {
                            // Insert net-new template with our generated UUID
                            console.log(`Inserting new template: ${tpl.id}`);
                            templatePayload.id = tpl.id;
                            const { error } = await supabase.from('templates').insert([templatePayload]);
                            tplError = error;
                        }
                    } else {
                        // Insert without ID, let Supabase gen_random_uuid() handle it
                        const { error } = await supabase.from('templates').insert([templatePayload]);
                        tplError = error;
                    }

                    if (tplError) {
                        console.error("Supabase Template Push Error:", tplError);
                        alert(`Failed to save cloud template ${tpl.name}: ${tplError.message}`);
                        throw tplError;
                    }
                }
            }

            // Always save to standard local fallback as well
            // @ts-ignore
            await window.electron.saveConfig(configData);
            setSaveMessage('Settings saved successfully!');
            setTimeout(() => setSaveMessage(''), 3000);
        } catch (err) {
            console.error("Failed to save config", err);
            setSaveMessage('Error saving settings.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleImageUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64Data = event.target?.result as string;

            try {
                // Save locally first
                // @ts-ignore
                const savedPath = await window.electron.uploadTemplate({
                    base64Data,
                    filename: file.name
                });

                let publicUrl = '';
                // If cloud sync active, push raw file to Supabase Storage Bucket
                if (supabase) {
                    const uniqueFilename = `${Date.now()}_${file.name}`;
                    const { data, error } = await supabase.storage.from('templates').upload(uniqueFilename, file, { upsert: true });

                    if (error) {
                        console.error("Supabase Storage Upload Error", error);
                    } else if (data) {
                        publicUrl = supabase.storage.from('templates').getPublicUrl(data.path).data.publicUrl;
                    }
                }

                const newTemplates = [...templates];
                newTemplates[index].image = `photobox://${savedPath}`;
                if (publicUrl) {
                    newTemplates[index].image_url = publicUrl;
                }
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
                    <p className="text-neutral-400 text-center mb-6 text-sm">Enter PIN to configure settings</p>

                    <form onSubmit={handleLogin}>
                        <input
                            type="password"
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            placeholder="PIN Code"
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors text-center text-xl tracking-[0.5em] font-mono"
                            maxLength={4}
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
                                onClick={() => navigate('/')}
                                className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl py-3 font-semibold transition-colors"
                            >
                                Back
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
        <div className="min-h-screen bg-neutral-950 text-white font-sans flex flex-col">
            {/* Header */}
            <header className="px-8 py-6 border-b border-neutral-800 bg-neutral-900 flex justify-between items-center sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/')}
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
                    {supabase && (
                        <button
                            onClick={async () => {
                                await supabase?.auth.signOut();
                                window.location.reload();
                            }}
                            className="p-2 hover:bg-neutral-800 rounded-full transition-colors text-neutral-400 hover:text-red-400"
                            title="Log Out Studio"
                        >
                            <LogOut size={20} />
                        </button>
                    )}
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
                                            <label className="block text-xs font-medium text-neutral-400 mb-1">Name</label>
                                            <input
                                                type="text"
                                                value={template.name}
                                                onChange={(e) => updateTemplate(idx, 'name', e.target.value)}
                                                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-medium text-neutral-400 mb-1">Price (IDR)</label>
                                                <input
                                                    type="number"
                                                    value={template.price}
                                                    onChange={(e) => updateTemplate(idx, 'price', parseInt(e.target.value))}
                                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-neutral-400 mb-1"># of Photo Slots</label>
                                                <input
                                                    type="number"
                                                    value={template.photosCount}
                                                    onChange={(e) => updateTemplate(idx, 'photosCount', parseInt(e.target.value))}
                                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-neutral-400 mb-1">Description</label>
                                            <input
                                                type="text"
                                                value={template.description}
                                                onChange={(e) => updateTemplate(idx, 'description', e.target.value)}
                                                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                                            />
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
        </div>
    );
}
