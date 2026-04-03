const { app } = require('electron'); console.log('App successfully imported:', app ? 'Yes' : 'No'); app.whenReady().then(() => { console.log('Ready!'); app.quit(); });
