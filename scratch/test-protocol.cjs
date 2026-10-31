const { app, session, net } = require('electron');

app.whenReady().then(async () => {
  try {
    session.defaultSession.protocol.handle('https', (req) => {
      console.log('Intercepted:', req.url);
      return net.fetch(req);
    });
    console.log('PROTOCOL_HANDLE_HTTPS_SUCCESS');
  } catch (err) {
    console.log('PROTOCOL_HANDLE_HTTPS_ERROR:', err.message);
  }
  process.exit(0);
});
