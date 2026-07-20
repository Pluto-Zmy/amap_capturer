// content/canvas-capturer.js
// Captures the amap.com viewport via chrome.tabs.captureVisibleTab,
// crops to a fixed region centered on the viewport.

var CAPTURE_WIDTH  = 2000; // fixed output width
var CAPTURE_HEIGHT = 1600; // fixed output height

async function captureMap() {
  console.log('[bmap] Capturing viewport screenshot...');
  return captureViaViewport();
}

async function captureViaViewport() {
  return new Promise(function(resolve, reject) {
    bmapSendMessage({ action: 'captureVisibleTab' }, function(response) {
      if (!response || !response.dataUrl) {
        reject(new Error('Viewport capture failed: ' + JSON.stringify(response || {})));
        return;
      }
      var img = new Image();
      img.onload = function() {
        var vw = img.width;
        var vh = img.height;

        var sx = Math.max(0, Math.round((vw - CAPTURE_WIDTH)  / 2));
        var sy = Math.max(0, Math.round((vh - CAPTURE_HEIGHT) / 2));
        var sw = Math.min(CAPTURE_WIDTH,  vw - sx);
        var sh = Math.min(CAPTURE_HEIGHT, vh - sy);

        console.log('[bmap] Viewport:', vw, 'x', vh, '→ crop', sw, 'x', sh, 'at offset', sx, sy);

        var canvas = new OffscreenCanvas(sw, sh);
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        var imageData = ctx.getImageData(0, 0, sw, sh);

        console.log('[bmap] ImageData extracted:', sw, 'x', sh);
        resolve({ imageData: imageData, width: sw, height: sh, method: 'viewport' });
      };
      img.onerror = function() { reject(new Error('Failed to load screenshot')); };
      img.src = response.dataUrl;
    });
  });
}

async function imageDataToBitmap(imageData) {
  var canvas = new OffscreenCanvas(imageData.width, imageData.height);
  var ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  return canvas.transferToImageBitmap();
}
