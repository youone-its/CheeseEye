import { contextBridge, ipcRenderer } from 'electron';

if (!process.contextIsolated) {
    throw new Error('contextIsolation must be enabled in the BrowserWindow')
}

try {
    contextBridge.exposeInMainWorld('electron', {
        ping: () => ipcRenderer.invoke('ping'),
        savePhoto: (data: { sessionId: string; base64Data: string; index: number }) =>
            ipcRenderer.invoke('save-photo', data),
        startQRServer: (data: { sessionId: string; finalBase64: string }) =>
            ipcRenderer.invoke('start-qr-server', data),
        printImage: (data: { base64Data: string }) =>
            ipcRenderer.invoke('print-image', data),
        getAppPath: () => ipcRenderer.invoke('get-app-path'),
        getConfig: (username: string) => ipcRenderer.invoke('get-user-config', { username }),
        saveConfig: (data: { username: string; configData: any }) => ipcRenderer.invoke('save-user-config', data),
        authLogin: (data: any) => ipcRenderer.invoke('auth-login', data),
        authRegister: (data: any) => ipcRenderer.invoke('auth-register', data),
        uploadTemplate: (data: { base64Data: string; filename: string }) =>
            ipcRenderer.invoke('upload-template', data),
        downloadTemplate: (data: { url: string; id: string }) =>
            ipcRenderer.invoke('download-template', data),
        createMidtransTransaction: (data: { orderId: string; amount: number; serverKey: string }) => ipcRenderer.invoke('create-midtrans-transaction', data),
        checkMidtransStatus: (data: { orderId: string; serverKey: string }) => ipcRenderer.invoke('check-midtrans-status', data),
        readFileBase64: (filePath: string) => ipcRenderer.invoke('read-file-base64', filePath),
        getCashPin: () => ipcRenderer.invoke('get-cash-pin'),
        verifyCashPin: (data: { pin: string }) => ipcRenderer.invoke('verify-cash-pin', data),
        // digiCamControl Integration
        triggerExternalShutter: () => ipcRenderer.invoke('trigger-external-shutter'),
        startFolderWatcher: (data: { sessionId: string }) => ipcRenderer.invoke('start-folder-watcher', data),
        stopFolderWatcher: () => ipcRenderer.invoke('stop-folder-watcher'),
        onPhotoCaptured: (callback: (data: { filePath: string; fileName: string }) => void) => {
            const subscription = (_event: unknown, data: { filePath: string; fileName: string }) => callback(data);
            ipcRenderer.on('photo-captured', subscription);
            return () => ipcRenderer.removeListener('photo-captured', subscription);
        },
        savePaymentLog: (data: { orderId: string; amount: number; paymentType: string; status: string; locationId: string }) => ipcRenderer.invoke('save-payment-log', data),
        getPaymentLogs: () => ipcRenderer.invoke('get-payment-logs')
    })
} catch (error) {
    console.error(error)
}
