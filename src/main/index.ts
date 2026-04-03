import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import * as chokidar from 'chokidar';
import archiver from 'archiver';
import express from 'express';

// Tweak Electron to handle memory better for high-res image generation
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096'); // Allow up to 4GB RAM for JS heap
// @ts-expect-error - midtrans-client doesn't have types
import midtransClient from 'midtrans-client';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: false,
    fullscreen: false, // Disabled full screen per user request
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    mainWindow.webContents.openDevTools({ mode: 'right' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

let expressApp: ReturnType<typeof express> | null = null;

app.whenReady().then(() => {
  // Start Express Local Asset Server immediately
  expressApp = express();
  
  // Set CORS for all routes (to allow standard `<img src>` elements from localhost React to access it easily)
  expressApp.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
  });

  const templateDir = path.join(app.getPath('userData'), 'templates');
  if (!fs.existsSync(templateDir)) fs.mkdirSync(templateDir, { recursive: true });
  expressApp.use('/templates', express.static(templateDir));

  // DYNAMIC SESSIONS FOLDER (Allows updating capture path without app restart)
  expressApp.use('/sessions', (req, res, next) => {
    // We use a custom resolver middleware instead of static(ONEDRIVE_BASE_PATH) 
    // because ONEDRIVE_BASE_PATH can change at runtime.
    express.static(ONEDRIVE_BASE_PATH)(req, res, next);
  });

  // Listen globally on port 3000
  expressApp.listen(3000, '0.0.0.0');

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // OTO-CLEANUP: Hapus folder setiap sesi QR dan ZIP file jika aplikasi dimatikan
  console.log("Cleaning up temporary session folders...");
  activeSessions.forEach((sid) => {
    try {
      const sp = path.join(ONEDRIVE_BASE_PATH, sid);
      const zp = path.join(ONEDRIVE_BASE_PATH, `${sid}.zip`);
      if (fs.existsSync(sp)) fs.rmSync(sp, { recursive: true, force: true });
      if (fs.existsSync(zp)) fs.rmSync(zp, { force: true });
    } catch (e) {
      console.error(`Failed to clean up session ${sid}`, e);
    }
  });
});

// IPC Examples
ipcMain.handle('ping', () => 'pong');

// --- DSLR / digiCamControl Integration ---
let watcher: chokidar.FSWatcher | null = null;
const DEFAULT_ID_PATH = path.join(os.homedir(), 'OneDrive', 'Gambar', 'digiCamControl', 'Session1');
const DEFAULT_EN_PATH = path.join(os.homedir(), 'OneDrive', 'Pictures', 'digiCamControl', 'Session1');

// Change to LET to allow dynamic updates from settings
let ONEDRIVE_BASE_PATH = fs.existsSync(DEFAULT_ID_PATH) ? DEFAULT_ID_PATH : DEFAULT_EN_PATH;
let activeSessions: string[] = []; // Track sessions for cleanup

ipcMain.handle('trigger-external-shutter', async () => {
  return new Promise((resolve) => {
    // Jalur default ke Command Line utility bawaan digiCamControl
    const cliPath = 'C:\\Program Files (x86)\\digiCamControl\\CameraControlCmd.exe';
    
    if (!fs.existsSync(cliPath)) {
      resolve({ success: false, error: 'digiCamControl CLI not found at default location.' });
      return;
    }

    // Eksekusi trigger kamera murni via USB CLI, tanpa lewat HTTP
    execFile(cliPath, ['/capture'], (error, stdout, stderr) => {
      if (error) {
        console.error('CLI Capture Error:', stderr || error.message);
        resolve({ success: false, error: stderr || error.message });
      } else {
        console.log('CLI Capture Success:', stdout);
        resolve({ success: true });
      }
    });
  });
});

ipcMain.handle('start-folder-watcher', (_event, { sessionId, capturePath }) => {
  if (watcher) watcher.close();

  // Track session for auto-cleanup on quit
  if (!activeSessions.includes(sessionId)) activeSessions.push(sessionId);

  // CRITICAL: Synchronize global path with the one from renderer settings
  if (capturePath) ONEDRIVE_BASE_PATH = capturePath;
  
  const sessionPath = path.join(ONEDRIVE_BASE_PATH, sessionId);
  
  if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

  const watchPath = ONEDRIVE_BASE_PATH;
  if (!fs.existsSync(watchPath)) fs.mkdirSync(watchPath, { recursive: true });

  console.log(`Watching folder: ${watchPath}`);

  watcher = chokidar.watch(watchPath, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    depth: 1, // Only watch ONE level deep (the session folders)
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100
    }
  });

  watcher.on('add', (filePath: string) => {
    console.log(`New photo detected: ${filePath}`);
    const fileName = path.basename(filePath);
    const destinationPath = path.join(sessionPath, fileName);

    // Ignore files that are already inside a child directory (like sesi-n/file.jpg)
    if (path.dirname(filePath) !== watchPath) return;

    try {
      // Move file to session folder
      fs.renameSync(filePath, destinationPath);
      
      // Notify renderer with HTTP URL
      if (mainWindow) {
        mainWindow.webContents.send('photo-captured', {
          filePath: `http://127.0.0.1:3000/sessions/${sessionId}/${fileName}`,
          fileName: fileName
        });
      }
    } catch (err) {
      console.error('Failed to move photo:', err);
    }
  });

  return watchPath;
});

ipcMain.handle('stop-folder-watcher', () => {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  return true;
});
// ----------------------------------

ipcMain.handle('read-file-base64', async (_event, filePath: string) => {
  let actualPath = filePath;
  if (filePath.startsWith('photobox://')) {
    try {
      const urlObj = new URL(filePath);
      actualPath = urlObj.searchParams.get('path') || filePath.replace('photobox://', '');
    } catch {
      actualPath = filePath.replace('photobox://', '');
    }
  }
  const data = fs.readFileSync(actualPath, { encoding: 'base64' });
  return `data:image/png;base64,${data}`;
});

ipcMain.handle('save-photo', async (_event, { sessionId, base64Data, index }) => {
  const sessionPath = path.join(ONEDRIVE_BASE_PATH, sessionId);
  if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

  const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
  const filePath = path.join(sessionPath, `photo_${index}.png`);
  fs.writeFileSync(filePath, buffer);

  // Return HTTP URL
  return `http://127.0.0.1:3000/sessions/${sessionId}/photo_${index}.png`;
});

// Settings & Config IPC (Multi-user)
ipcMain.handle('auth-login', async (_event, { username, password }) => {
  const usersPath = path.join(app.getPath('userData'), 'users.json');
  let users = [];
  if (fs.existsSync(usersPath)) {
    users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  }

  const user = users.find((u: any) => u.username === username && u.password === password);
  if (user) {
    return { success: true, username };
  }
  return { success: false, error: 'Invalid username or password' };
});

ipcMain.handle('auth-register', async (_event, { username, password }) => {
  const usersPath = path.join(app.getPath('userData'), 'users.json');
  let users = [];
  if (fs.existsSync(usersPath)) {
    users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  }

  if (users.find((u: any) => u.username === username)) {
    return { success: false, error: 'Username already exists' };
  }

  users.push({ username, password });
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf8');

  // Create user-specific config directory
  const userDir = path.join(app.getPath('userData'), 'users', username);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  return { success: true };
});

ipcMain.handle('get-user-config', (_event, { username }) => {
  const configPath = path.join(app.getPath('userData'), 'users', username, 'config.json');
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  return { midtransClientKey: '', midtransServerKey: '', templates: [] };
});

ipcMain.handle('save-user-config', async (_event, { username, configData }) => {
  const userDir = path.join(app.getPath('userData'), 'users', username);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  const configPath = path.join(userDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');
  return true;
});

ipcMain.handle('upload-template', async (_event, { base64Data, filename }) => {
  const templateDir = path.join(app.getPath('userData'), 'templates');
  if (!fs.existsSync(templateDir)) {
    fs.mkdirSync(templateDir, { recursive: true });
  }

  const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
  // Use a unique name to prevent collision
  const uid = Date.now();
  const safeFilename = `${uid}_${filename}`;
  const filePath = path.join(templateDir, safeFilename);
  fs.writeFileSync(filePath, buffer);

  // Return HTTP URL so frontend can load it securely via local express server
  return `http://127.0.0.1:3000/templates/${safeFilename}`;
});

ipcMain.handle('download-template', async (_event, { url, id }) => {
  const templateDir = path.join(app.getPath('userData'), 'templates');
  if (!fs.existsSync(templateDir)) {
    fs.mkdirSync(templateDir, { recursive: true });
  }

  try {
    const ext = url.split('.').pop() || 'png';
    const filePath = path.join(templateDir, `${id}.${ext}`);

    // Only download if it doesn't already exist locally
    if (!fs.existsSync(filePath)) {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(filePath, buffer);
    }
    return filePath;
  } catch (err) {
    console.error("Failed to download template from cloud", err);
    return null; // Handle smoothly so app doesn't crash on bad sync
  }
});

// Midtrans API
ipcMain.handle('create-midtrans-transaction', async (_event, { orderId, amount, serverKey }) => {
  try {
    const coreApi = new midtransClient.CoreApi({
      isProduction: false,
      serverKey: serverKey,
      clientKey: ''
    });

    const parameter = {
      "payment_type": "qris",
      "transaction_details": {
        "gross_amount": amount,
        "order_id": orderId,
      }
    };

    const chargeResponse = await coreApi.charge(parameter);
    // GoPay returns QR strings in Actions.
    const qrAction = chargeResponse.actions?.find((a: { name: string; url: string }) => a.name === 'generate-qr-code');
    const qrString = qrAction ? qrAction.url : null;

    return { success: true, qrString };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Midtrans Transaction Error:", errorMessage);
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('check-midtrans-status', async (_event, { orderId, serverKey }) => {
  try {
    const coreApi = new midtransClient.CoreApi({
      isProduction: false,
      serverKey: serverKey,
      clientKey: ''
    });

    const transactionStatusObject = await coreApi.transaction.status(orderId);
    console.log(`Midtrans Check [${orderId}]:`, transactionStatusObject.transaction_status);
    return { success: true, status: transactionStatusObject.transaction_status };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // 404 means the QR hasn't been scanned/created fully on Midtrans side yet, ignore this as pending.
    if (!errorMessage.includes('404')) {
      console.error("Midtrans Status Check Error:", errorMessage);
    }
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('save-payment-log', async (_event, logData: { orderId: string; amount: number; paymentType: string; status: string; locationId: string }) => {
  const logPath = path.join(app.getPath('userData'), 'payment_logs.json');
  interface PaymentLog {
    id: string;
    orderId: string;
    amount: number;
    paymentType: string;
    status: string;
    locationId: string;
    createdAt: string;
  }
  let logs: PaymentLog[] = [];
  
  try {
    if (fs.existsSync(logPath)) {
      const data = fs.readFileSync(logPath, 'utf-8');
      logs = JSON.parse(data) as PaymentLog[];
    }
  } catch (err) {
    console.error("Failed to read payment logs", err);
  }

  const newLog = {
    ...logData,
    id: Date.now().toString(),
    createdAt: new Date().toISOString()
  };

  logs.push(newLog);
  fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
  return { success: true };
});

ipcMain.handle('get-payment-logs', async () => {
  const logPath = path.join(app.getPath('userData'), 'payment_logs.json');
  try {
    if (fs.existsSync(logPath)) {
      const data = fs.readFileSync(logPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Failed to fetch payment logs", err);
  }
  return [];
});

ipcMain.handle('get-app-path', () => {
  // In dev, app.getAppPath() is the project root (where package.json is).
  return app.getAppPath();
});



ipcMain.handle('start-qr-server', async (_event, { sessionId, finalBase64, capturePath }) => {
  // Sync path if provided
  if (capturePath) ONEDRIVE_BASE_PATH = capturePath;

  const sessionPath = path.join(ONEDRIVE_BASE_PATH, sessionId);

  // Track session for auto-cleanup on quit
  if (!activeSessions.includes(sessionId)) activeSessions.push(sessionId);

  // Save the final composite image
  if (finalBase64) {
    const finalBuffer = Buffer.from(finalBase64.split(',')[1], 'base64');
    fs.writeFileSync(path.join(sessionPath, 'final_print.png'), finalBuffer);
  }

  // Generate Zip
  const zipPath = path.join(ONEDRIVE_BASE_PATH, `${sessionId}.zip`);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  await new Promise<void>((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(sessionPath, false);
    archive.finalize();
  });

  // Cleanup mechanism (1 hour)
  setTimeout(() => {
    if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
    if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  }, 3600 * 1000);

  // Get local IP, prioritizing physical Wi-Fi or Ethernet adapters
  const interfaces = os.networkInterfaces();
  let localIP = '127.0.0.1';

  const preferredInterfaces = ['wlan', 'eth', 'en'];
  let foundIP = false;

  for (const name of Object.keys(interfaces)) {
    if (!interfaces[name]) continue;

    for (const iface of interfaces[name]!) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // If it's a preferred interface, use it immediately
        if (preferredInterfaces.some(pref => name.toLowerCase().startsWith(pref))) {
          localIP = iface.address;
          foundIP = true;
          break;
        }
        // Otherwise, save it as a fallback if we haven't found any yet
        if (!foundIP) {
          localIP = iface.address;
        }
      }
    }
    if (foundIP) break;
  }

  return `http://${localIP}:3000/sessions/${sessionId}.zip`;
});

ipcMain.handle('print-image', async (_event, { base64Data, imageUrl }) => {
  return new Promise((resolve) => {
    // Create a browser window specifically for printing
    const printWindow = new BrowserWindow({
      show: true, // Show the window so we can see the print dialog
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    // We generate a simple HTML page that displays our image full bleed
    const htmlContent = `
      <html>
        <head>
          <style>
            @page { margin: 0; }
            body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: white; }
            img { max-width: 100%; max-height: 100vh; object-fit: contain; }
          </style>
        </head>
        <body>
          <img src="${imageUrl || base64Data}" onload="window.printHtmlLoaded()" />
        </body>
      </html>
    `;

    // Wait for the window to finish loading the temporary HTMl file
    const tempHtmlPath = path.join(app.getPath('temp'), 'print.html');
    fs.writeFileSync(tempHtmlPath, htmlContent);
    printWindow.loadFile(tempHtmlPath);

    printWindow.webContents.on('did-finish-load', async () => {
      try {
        const printers = await printWindow.webContents.getPrintersAsync();
        console.log("Available Printers:", printers.map(p => p.name).join(', '));
      } catch (err) {
        console.log("Could not fetch printers:", err);
      }

      // The image is loaded, trigger the print dialog visibly for testing
      printWindow.webContents.print({
        silent: false, // Show UI dialogue for testing
        printBackground: true,
        margins: { marginType: 'none' }
      }, (success, failureReason) => {
        // Cleanup the window after print dialog is closed
        printWindow.destroy();

        if (success) {
          resolve({ success: true, message: "Printed successfully" });
        } else {
          console.error("Print Failed:", failureReason);
          resolve({ success: false, message: `Print failed: ${failureReason}` });
        }
      });
    });
  });
});

// --- Refreshable Cash PIN System ---
let currentCashPin = '';
let pinExpiresAt = 0;
const PIN_LIFESPAN_MS = 10 * 60 * 1000; // 10 minutes

function generateNewPin() {
  currentCashPin = Math.floor(100000 + Math.random() * 900000).toString();
  pinExpiresAt = Date.now() + PIN_LIFESPAN_MS;
  console.log(`[Admin] New Cash PIN generated: ${currentCashPin} (Expires in 10m)`);
}

// Generate the first PIN on startup
generateNewPin();

// Auto-refresh the PIN every 10 minutes
setInterval(() => {
  generateNewPin();
}, PIN_LIFESPAN_MS);

ipcMain.handle('get-cash-pin', () => {
  // If somehow expired (maybe setInterval drift), generate a new one instantly
  if (Date.now() >= pinExpiresAt) generateNewPin();
  
  return { 
    pin: currentCashPin, 
    expiresInMs: Math.max(0, pinExpiresAt - Date.now()) 
  };
});

ipcMain.handle('verify-cash-pin', (_event, { pin }) => {
  if (Date.now() >= pinExpiresAt) generateNewPin(); // Expired before verification? Refresh it now so they fail and retry.

  if (pin === currentCashPin && pin !== '') {
    // Optional: Refresh the PIN immediately after a successful use to prevent reuse? 
    // Usually, cashiers prefer it stays the same, but for security we can leave it or clear it.
    // For now, we leave it until the 10-minute timer naturally regenerates it.
    return { success: true };
  }
  return { success: false, error: 'Invalid or expired Cash PIN' };
});
// ----------------------------------
