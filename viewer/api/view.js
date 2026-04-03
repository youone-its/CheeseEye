import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials in Vercel environment.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).send("<h1>Error: Missing session ID</h1>");
  }

  try {
    // We expect the Desktop app to upload files to 'sessions' bucket under `/${id}/` prefix 
    // Wait, currently the PrintScreen uploads to:
    // collage: `session_${id}.png`
    // photos: `session_${id}_photo_${idx}.png`
    
    // Instead of searching root, list the contents of the session folder
    const folderPath = `session_${id}`;
    const { data: files, error } = await supabase.storage.from('sessions').list(folderPath, {
      limit: 100
    });

    if (error) throw error;
    if (!files || files.length === 0) {
      return res.status(404).send("<h1>Session not found or expired.</h1>");
    }

    // Sort files to separate collage from photos
    const collageFile = files.find(f => f.name === 'collage.png');
    const photoFiles = files.filter(f => f.name.includes('photo_'))
                            .sort((a,b) => a.name.localeCompare(b.name));

    // Generate signed URLs (1 hour) for the found files using their full paths
    const filePaths = [];
    if (collageFile) filePaths.push(`${folderPath}/${collageFile.name}`);
    photoFiles.forEach(f => filePaths.push(`${folderPath}/${f.name}`));

    const { data: signedUrls, error: signError } = await supabase.storage.from('sessions').createSignedUrls(filePaths, 3600);
    if (signError) throw signError;

    // Map by name
    const urlMap = {};
    signedUrls.forEach(su => {
      urlMap[su.path] = su.signedUrl;
    });

    const collageUrl = collageFile ? urlMap[`${folderPath}/${collageFile.name}`] : null;
    const photoUrls = photoFiles.map(f => urlMap[`${folderPath}/${f.name}`]);

    let htmlGrid = '';
    photoUrls.forEach((url, idx) => {
        htmlGrid += `
            <div class="flex flex-col gap-2">
                <img src="${url}" class="w-full h-auto rounded-xl shadow-md border border-neutral-200" />
                <a href="${url}" download="photo_${idx + 1}.png" class="bg-neutral-800 text-white text-center py-2 px-4 rounded-xl font-semibold hover:bg-neutral-700 transition">
                    Download Photo ${idx + 1}
                </a>
            </div>
        `;
    });

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Your Photobooth Session</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"></script>
            <style>
                body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
            </style>
        </head>
        <body class="bg-neutral-100 text-neutral-900 min-h-screen">
            <header class="bg-white border-b border-neutral-200 px-6 py-4 shadow-sm text-center">
                <h1 class="text-xl font-bold tracking-tight">Your Photos Are Ready!</h1>
                <p class="text-xs text-neutral-500 mt-1 mb-4">Files expire in 1 hour. Download them now.</p>
                <button id="downloadAllBtn" class="bg-neutral-900 hover:bg-neutral-800 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition flex items-center justify-center gap-2 mx-auto disabled:opacity-50">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                    <span>Download All (ZIP)</span>
                </button>
            </header>
            
            <main class="p-6 max-w-lg mx-auto pb-20">
                ${collageUrl ? `
                <!-- COLLAGE -->
                <h2 class="text-lg font-bold mb-3 flex items-center gap-2">
                    <span>✨</span> Final Collage
                </h2>
                <div class="bg-white p-2 rounded-2xl shadow-md mb-4 border border-neutral-200">
                    <img src="${collageUrl}" class="w-full h-auto rounded-xl" />
                </div>
                <a href="${collageUrl}" download="photobox_collage.png" class="w-full block bg-blue-600 shadow-lg shadow-blue-600/20 text-white text-center py-4 rounded-2xl font-bold text-lg hover:bg-blue-500 transition mb-10">
                    Download Collage
                </a>
                ` : ''}

                <!-- INDIVIDUAL PHOTOS -->
                ${photoUrls.length > 0 ? `
                    <h2 class="text-lg font-bold mb-3 flex items-center gap-2 border-t border-neutral-200 pt-8">
                        <span>📸</span> Individual Shots
                    </h2>
                    <div class="grid grid-cols-2 gap-4">
                        ${htmlGrid}
                    </div>
                ` : ''}
            </main>

            <script>
                const collageUrlStr = "${collageUrl || ''}";
                const photoUrlsArr = ${JSON.stringify(photoUrls)};
                
                const allPhotosToDownload = [];
                if (collageUrlStr) {
                  allPhotosToDownload.push({ name: 'photobox_collage.png', url: collageUrlStr });
                }
                photoUrlsArr.forEach((url, i) => {
                  allPhotosToDownload.push({ name: 'photo_' + (i + 1) + '.png', url: url });
                });

                document.getElementById('downloadAllBtn').addEventListener('click', async (e) => {
                    const btn = e.currentTarget;
                    const originalText = btn.innerHTML;
                    btn.disabled = true;
                    btn.innerHTML = '<span class="animate-pulse">Zipping files...</span>';

                    try {
                        const zip = new JSZip();
                        
                        // Fetch all images and add to zip
                        await Promise.all(allPhotosToDownload.map(async (photo) => {
                            const response = await fetch(photo.url);
                            const blob = await response.blob();
                            zip.file(photo.name, blob);
                        }));

                        // Generate and download zip
                        const content = await zip.generateAsync({ type: "blob" });
                        saveAs(content, "photobox_session.zip");
                    } catch (err) {
                        console.error("Failed to zip files", err);
                        alert("Failed to download ZIP. You can still download the images individually.");
                    } finally {
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                    }
                });
            </script>
        </body>
        </html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate'); // cache at edge for 1 minute
    res.status(200).send(htmlContent);

  } catch (err) {
    console.error("Viewer API Error:", err);
    res.status(500).send("<h1>Server Error. Could not load photos.</h1>");
  }
}
