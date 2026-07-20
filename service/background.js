// service/background.js
// Service Worker for Manifest V3 Chrome Extension.
// Proxies download and viewport-capture requests from content scripts.

console.log('[bmap bg] Service worker starting...');

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  console.log('[bmap bg] onMessage:', message.type);

  if (message.type === 'download') {
    handleDownload(message)
      .then(function(downloadId) { sendResponse({ success: true, downloadId: downloadId }); })
      .catch(function(err) { sendResponse({ success: false, error: err.message }); });
    return true;
  }

  if (message.type === 'captureVisibleTab') {
    var windowId = (sender.tab && sender.tab.windowId) || null;
    console.log('[bmap bg] captureVisibleTab, windowId:', windowId);
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
      .then(function(dataUrl) {
        console.log('[bmap bg] captureVisibleTab done, length:', dataUrl ? dataUrl.length : 0);
        sendResponse({ dataUrl: dataUrl });
      })
      .catch(function(err) {
        console.error('[bmap bg] captureVisibleTab error:', err.message);
        sendResponse({ error: err.message });
      });
    return true;
  }
});

async function handleDownload(message) {
  var downloadId = await chrome.downloads.download({
    url: message.url,
    filename: message.filename,
    saveAs: false,
    conflictAction: 'uniquify'
  });
  console.log('[bmap bg] Download started:', message.filename, 'id:', downloadId);
  return downloadId;
}

console.log('[bmap bg] Service worker ready');
