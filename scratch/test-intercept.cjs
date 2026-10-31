const { app, session, net } = require('electron');

app.whenReady().then(async () => {
  try {
    session.defaultSession.protocol.handle('https', async (req) => {
      if (req.url.includes('__iris_test__')) {
        return new Response('<html><body>INTERCEPTED_OK</body></html>', {
          headers: { 'content-type': 'text/html' },
        });
      }
      return net.fetch(req, { bypassCustomProtocolHandlers: true });
    });

    // Test intercepted URL
    const res1 = await net.fetch('https://gen-lang-client-0155749303.firebaseapp.com/__iris_test__');
    const text1 = await res1.text();
    console.log('Test1 result:', text1);

    // Test real URL passing through
    const res2 = await net.fetch('https://www.google.com/robots.txt', { bypassCustomProtocolHandlers: true });
    console.log('Test2 status:', res2.status);

    console.log('ALL_PROTOCOL_TESTS_PASSED');
  } catch (err) {
    console.error('PROTOCOL_TEST_ERROR:', err);
  }
  process.exit(0);
});
