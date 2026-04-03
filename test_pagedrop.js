const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Photobooth Session</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    </style>
</head>
<body class="bg-neutral-100 text-neutral-900 min-h-screen">
    <header class="bg-white border-b border-neutral-200 px-6 py-4 shadow-sm sticky top-0 z-10 text-center">
        <h1 class="text-xl font-bold tracking-tight">Your Photos Are Ready!</h1>
        <p class="text-xs text-neutral-500 mt-1">Files expire in 1 hour. Download them now.</p>
    </header>
    
    <main class="p-6 max-w-lg mx-auto pb-20">
        <!-- COLLAGE -->
        <h2 class="text-lg font-bold mb-3 flex items-center gap-2">
            <span>✨</span> Final Collage
        </h2>
        <div class="bg-white p-2 rounded-2xl shadow-md mb-4 border border-neutral-200">
            <img src="https://example.com/collage.png" class="w-full h-auto rounded-xl" />
        </div>
        <a href="https://example.com/collage.png" download="photobox_collage.png" class="w-full block bg-blue-600 shadow-lg shadow-blue-600/20 text-white text-center py-4 rounded-2xl font-bold text-lg hover:bg-blue-500 transition mb-10">
            Download Collage
        </a>

        <!-- INDIVIDUAL PHOTOS -->
    </main>
</body>
</html>
`;

fetch("https://pagedrop.io/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        html: htmlContent,
        ttl: "1h"
    })
}).then(res => res.text()).then(console.log).catch(console.error);
