import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import path from 'path';

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

ipcMain.handle('save-photo', async (_event, { sessionId, base64Data, index }) => {
  const fs = require('fs');
  const sessionPath = path.join(app.getPath('userData'), 'sessions', sessionId);
  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }

  const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
  const filePath = path.join(sessionPath, `photo_${index}.png`);
  fs.writeFileSync(filePath, buffer);

  return filePath;
});

// Settings & Config IPC
ipcMain.handle('get-config', () => {
  const fs = require('fs');
  const configPath = path.join(app.getPath('userData'), 'config.json');
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  // Return default empty config if not exists
  return { midtransClientKey: '', midtransServerKey: '', templates: [] };
});

ipcMain.handle('save-config', async (_event, configData) => {
  const fs = require('fs');
  const configPath = path.join(app.getPath('userData'), 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');
  return true;
});

ipcMain.handle('upload-template', async (_event, { base64Data, filename }) => {
  const fs = require('fs');
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
  const fs = require('fs');
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
    const midtransClient = require('midtrans-client');
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
    const qrAction = chargeResponse.actions?.find((a: any) => a.name === 'generate-qr-code');
    const qrString = qrAction ? qrAction.url : null;

    return { success: true, qrString };
  } catch (err: any) {
    console.error("Midtrans Transaction Error:", err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('check-midtrans-status', async (_event, { orderId, serverKey }) => {
  try {
    const midtransClient = require('midtrans-client');
    const coreApi = new midtransClient.CoreApi({
      isProduction: false,
      serverKey: serverKey,
      clientKey: ''
    });

    const transactionStatusObject = await coreApi.transaction.status(orderId);
    console.log(`Midtrans Check [${orderId}]:`, transactionStatusObject.transaction_status);
    return { success: true, status: transactionStatusObject.transaction_status };
  } catch (err: any) {
    // 404 means the QR hasn't been scanned/created fully on Midtrans side yet, ignore this as pending.
    if (!err.message?.includes('404')) {
      console.error("Midtrans Status Check Error:", err.message);
    }
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-app-path', () => {
  // In dev, app.getAppPath() is the project root (where package.json is).
  return app.getAppPath();
});

let expressApp: any = null;

ipcMain.handle('start-qr-server', async (_event, { sessionId, finalBase64 }) => {
  const fs = require('fs');
  const archiver = require('archiver');
  const express = require('express');
  const os = require('os');

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
