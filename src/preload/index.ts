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
        getConfig: () => ipcRenderer.invoke('get-config'),
        saveConfig: (data: any) => ipcRenderer.invoke('save-config', data),
        uploadTemplate: (data: { base64Data: string; filename: string }) =>
            ipcRenderer.invoke('upload-template', data),
        downloadTemplate: (data: { url: string; id: string }) =>
            ipcRenderer.invoke('download-template', data),
        createMidtransTransaction: (data: any) => ipcRenderer.invoke('create-midtrans-transaction', data),
        checkMidtransStatus: (data: any) => ipcRenderer.invoke('check-midtrans-status', data)
    })
} catch (error) {
    console.error(error)
}
