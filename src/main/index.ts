import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import axios from 'axios';
import * as chokidar from 'chokidar';
import archiver from 'archiver';
import express from 'express';
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
    autoHideMenuBar: true,
    fullscreen: true, // For photo booth experience
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

app.whenReady().then(() => {
  protocol.handle('photobox', (request) => {
    return net.fetch('file://' + request.url.slice('photobox://'.length));
  });

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

// IPC Examples
ipcMain.handle('ping', () => 'pong');

// --- digiCamControl Integration ---
let watcher: chokidar.FSWatcher | null = null;
const DIGICAM_DOWNLOAD_PATH = path.join(os.homedir(), 'Pictures', 'digiCamControl'); // Default path

ipcMain.handle('trigger-external-shutter', async () => {
  try {
    // digiCamControl Web Server defaults to port 8080
    await axios.get('http://localhost:8080/remotecontrol?command=Capture');
    return { success: true };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Failed to trigger digiCamControl shutter:', errorMessage);
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('start-folder-watcher', (_event, { sessionId }) => {
  if (watcher) {
    watcher.close();
  }

  const sessionPath = path.join(app.getPath('userData'), 'sessions', sessionId);
  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }

  // Ensure the digicams download path exists or use a fallback
  const watchPath = fs.existsSync(DIGICAM_DOWNLOAD_PATH) ? DIGICAM_DOWNLOAD_PATH : path.join(app.getPath('userData'), 'external_captures');
  if (!fs.existsSync(watchPath)) {
    fs.mkdirSync(watchPath, { recursive: true });
  }

  console.log(`Watching folder: ${watchPath}`);

  watcher = chokidar.watch(watchPath, {
    ignored: /(^|[/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true, // Don't trigger for existing files
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100
    }
  });

  watcher.on('add', (filePath) => {
    console.log(`New photo detected: ${filePath}`);
    const fileName = path.basename(filePath);
    const destinationPath = path.join(sessionPath, fileName);

    try {
      // Move file to session folder
      fs.renameSync(filePath, destinationPath);
      
      // Notify renderer
      if (mainWindow) {
        mainWindow.webContents.send('photo-captured', {
          filePath: destinationPath,
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
  const actualPath = filePath.replace('photobox://', '');
  const data = fs.readFileSync(actualPath, { encoding: 'base64' });
  return `data:image/png;base64,${data}`;
});

ipcMain.handle('save-photo', async (_event, { sessionId, base64Data, index }) => {
  const sessionPath = path.join(app.getPath('userData'), 'sessions', sessionId);
  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }

  const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
  const filePath = path.join(sessionPath, `photo_${index}.png`);
  fs.writeFileSync(filePath, buffer);

  return filePath;
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

  // Return the path so it can be saved into the config array
  return filePath;
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

let expressApp: ReturnType<typeof express> | null = null;

ipcMain.handle('start-qr-server', async (_event, { sessionId, finalBase64 }) => {
  const sessionPath = path.join(app.getPath('userData'), 'sessions', sessionId);

  // Save the final composite image
  if (finalBase64) {
    const finalBuffer = Buffer.from(finalBase64.split(',')[1], 'base64');
    fs.writeFileSync(path.join(sessionPath, 'final_print.png'), finalBuffer);
  }

  // Generate Zip
  const zipPath = path.join(app.getPath('userData'), 'sessions', `${sessionId}.zip`);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  await new Promise<void>((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(sessionPath, false);
    archive.finalize();
  });

  // Start Express if not running
  if (!expressApp) {
    expressApp = express();
    expressApp.use('/download', express.static(path.join(app.getPath('userData'), 'sessions')));
    expressApp.listen(3000, '0.0.0.0');
  }

  // Cleanup mechanism (1 hour)
  setTimeout(() => {
    if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
    if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  }, 3600 * 1000);

  // Get local IP
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

  return `http://${localIP}:3000/download/${sessionId}.zip`;
});

ipcMain.handle('print-image', async (_event, { base64Data }) => {
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
          <img src="${base64Data}" onload="window.printHtmlLoaded()" />
        </body>
      </html>
    `;

    // Wait for the window to finish loading the initial blank page before injecting HTML
    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

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
