// content/bridge.js
// ISOLATED-world bridge — the only content script with chrome.* API access.
// Relays messages between MAIN-world scripts and the service worker
// via window.postMessage (DOM shared across worlds).

(function() {
  console.log('[bmap bridge] Starting...');

  window.addEventListener('message', function(event) {
    var data = event.data;
    if (!data || !data.__bmap) return;
    // Ignore result messages (sent by ourselves back to MAIN world)
    if (data.action === 'downloadResult' || data.action === 'captureVisibleTabResult') return;

    console.log('[bmap bridge] Received from MAIN:', data.action, 'id:', data.id);

    if (data.action === 'download') {
      chrome.runtime.sendMessage(
        { type: 'download', url: data.url, filename: data.filename },
        function(response) {
          console.log('[bmap bridge] Download response:', JSON.stringify(response));
          window.postMessage({
            __bmap: true,
            id: data.id,
            action: 'downloadResult',
            response: response
          }, '*');
        }
      );
    } else if (data.action === 'captureVisibleTab') {
      chrome.runtime.sendMessage(
        { type: 'captureVisibleTab' },
        function(response) {
          console.log('[bmap bridge] captureVisibleTab response:', JSON.stringify(response));
          window.postMessage({
            __bmap: true,
            id: data.id,
            action: 'captureVisibleTabResult',
            response: response
          }, '*');
        }
      );
    }
  });

  document.documentElement.setAttribute('data-bmap-bridge', 'ready');
  console.log('[bmap bridge] Ready — data-bmap-bridge set');
})();
