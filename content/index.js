// content/index.js
// Extension entry point: waits for Amap to be ready, initializes the side panel,
// and orchestrates the capture → stitch → download pipeline.
//
// Runs in MAIN world — has direct access to AMap, themap, and page globals.
// Uses window.postMessage to communicate with the ISOLATED-world bridge
// for chrome.* API calls (downloads, viewport capture).

// ---------------------------------------------------------------------------
// Bridge helpers — communicate with the ISOLATED-world bridge.js
// ---------------------------------------------------------------------------

var _bmapRequestId = 0;
var _bmapCallbacks = {};

// Listen for responses from the ISOLATED-world bridge.
window.addEventListener('message', function(event) {
  var data = event.data;
  if (!data || !data.__bmap) return;
  // Only process response messages, not outgoing requests
  if (data.action !== 'downloadResult' && data.action !== 'captureVisibleTabResult') return;
  if (data.id != null && _bmapCallbacks[data.id]) {
    _bmapCallbacks[data.id](data.response);
    delete _bmapCallbacks[data.id];
  }
});

/**
 * Send a message to the ISOLATED-world bridge (which proxies to chrome.* APIs).
 * @param {object} msg - must have .action field
 * @param {function} [callback] - called with the response
 */
function bmapSendMessage(msg, callback) {
  var id = ++_bmapRequestId;
  msg.__bmap = true;
  msg.id = id;
  if (callback) {
    _bmapCallbacks[id] = callback;
  }
  window.postMessage(msg, '*');
}

/**
 * Wait for the ISOLATED-world bridge to signal readiness.
 * The bridge sets document.documentElement.dataset.bmapBridge = 'ready'
 * (DOM is shared between worlds).
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
function bmapWaitForBridge(timeoutMs) {
  return new Promise(function(resolve) {
    if (document.documentElement.getAttribute('data-bmap-bridge') === 'ready') {
      resolve(true);
      return;
    }
    var start = Date.now();
    var timer = setInterval(function() {
      if (document.documentElement.getAttribute('data-bmap-bridge') === 'ready') {
        clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

(function main() {
  // Step 1: wait for the bridge (ISOLATED world must be ready for chrome APIs)
  bmapWaitForBridge(10000).then(function(bridgeReady) {
    if (!bridgeReady) {
      alert('高德地图截图拼接：扩展初始化失败，请刷新页面重试。');
      return;
    }

    // Step 2: wait for Amap JS API globals (now accessible in MAIN world)
    return waitForAmap(30000);
  }).then(function(amapReady) {
    if (!amapReady) {
      alert('高德地图截图拼接：未能检测到高德地图，请确认您在 amap.com 页面上。');
      return;
    }

    // Mount side panel
    sidePanel.mount();

    // Periodically check route status
    setInterval(function() {
      sidePanel.refreshRouteInfo();
    }, 2000);

    // Register callbacks
    sidePanel.onStart(function() {
      sidePanel.clearMessages();
      sidePanel.setState(PanelState.CAPTURING);

      runCapture().then(function() {
        // done handled inside runCapture
      }).catch(function(err) {
        console.error('Capture failed:', err);
        sidePanel.showError('截图失败: ' + err.message);
        sidePanel.setState(PanelState.ERROR);
      });
    });

    sidePanel.onCancel(function() {
      if (sidePanel._abortController) {
        sidePanel._abortController.abort();
      }
      sidePanel.setState(PanelState.READY);
      sidePanel.showWarning(
        '截图已取消。已截 ' + sidePanel.capturedImages.length + ' 张图片保留在内存中，可切换参数后重新采集或直接下载。'
      );
      if (sidePanel.capturedImages.length > 0) {
        sidePanel.elements['bmap-download-btn'].style.display = 'block';
      }
    });

    sidePanel.onDownload(function() {
      sidePanel.setState(PanelState.DOWNLOADING);
      sidePanel.clearMessages();
      runStitchAndDownload().then(function() {
        sidePanel.setState(PanelState.DONE);
      }).catch(function(err) {
        console.error('Download failed:', err);
        sidePanel.showError('下载失败: ' + err.message);
        sidePanel.setState(PanelState.ERROR);
      });
    });
  });
})();

/**
 * Wait for Amap JS API to be ready (AMap and themap globals available).
 * Since we run in MAIN world, typeof checks work directly on page variables.
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
function waitForAmap(timeoutMs) {
  return new Promise(function(resolve) {
    var start = Date.now();
    function check() {
      // In MAIN world, these are the actual page globals
      if (typeof AMap !== 'undefined' && typeof themap !== 'undefined') {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, 500);
    }
    check();
  });
}

/**
 * Execute the capture workflow.
 */
async function runCapture() {
  var config = sidePanel.getConfig();
  var route = readRouteFromPage();

  if (!route || !route.polyline || route.polyline.length === 0) {
    throw new Error('未检测到路线数据，请先在页面上搜索路线。');
  }

  // Create AbortController for cancellation
  sidePanel._abortController = new AbortController();
  var signal = sidePanel._abortController.signal;

  // Set zoom level
  setMapZoom(themap, config.zoomLevel);

  // Apply user-configured capture size and sampling rate
  CAPTURE_WIDTH  = config.captureWidth;
  CAPTURE_HEIGHT = config.captureHeight;
  console.log('[bmap] Config: ' + CAPTURE_WIDTH + 'x' + CAPTURE_HEIGHT + ', sampleRate=' + config.sampleRate);

  // Build capture sequence by sampling the raw polyline
  var steps = computeStepSequence(route.polyline, config.sampleRate);
  console.log('[bmap] Step sequence: ' + steps.length + ' captures');
  sidePanel.setTotalSteps(steps.length);
  sidePanel.setCapturedCount(0);

  // Clear previous data
  sidePanel.capturedImages = [];
  sidePanel.capturedOffsets = [];
  // capturedWidth/Height will be set from the first actual capture

  // Listen for tab visibility changes
  var wasHidden = false;
  function visibilityHandler() {
    if (document.hidden) {
      wasHidden = true;
      console.log('Capture paused: tab hidden');
    } else if (wasHidden) {
      wasHidden = false;
      console.log('Capture resumed: tab visible');
      sidePanel.showWarning('截图已恢复（标签页重新激活）');
    }
  }
  document.addEventListener('visibilitychange', visibilityHandler);

  // Capture point by point
  var captureWidth = null;
  var captureHeight = null;

  for (var i = 0; i < steps.length; i++) {
    if (signal.aborted) break;

    var lng = steps[i][0];
    var lat = steps[i][1];

    // --- Compute pixel offset BEFORE moving the map ---
    // Same logic as the Python tool: old_pixel = current center's container position,
    // new_pixel = target coordinate's container position (before moving).
    var oldPixel = themap.lngLatToContainer(themap.getCenter());
    var newPixel = themap.lngLatToContainer(new AMap.LngLat(lng, lat));

    var offset = null;
    if (oldPixel && newPixel && i > 0) {
      offset = { x: newPixel.x - oldPixel.x, y: newPixel.y - oldPixel.y };
    }

    // Move map to current point
    await moveMapTo(themap, lng, lat, 1000);

    // Capture the map
    var capture = await captureMap();
    if (!capture) {
      console.warn('Skipping capture at step ' + i + ': capture returned null');
      continue;
    }

    // Use actual capture dimensions (first capture sets the reference)
    if (captureWidth === null) {
      captureWidth = capture.width;
      captureHeight = capture.height;
      sidePanel.capturedWidth = captureWidth;
      sidePanel.capturedHeight = captureHeight;
      console.log('[bmap] Capture dimensions: ' + captureWidth + 'x' + captureHeight);
    }

    var bitmap = await imageDataToBitmap(capture.imageData);
    sidePanel.capturedImages.push(bitmap);

    // Record offset (skip first frame, same as Python tool)
    if (offset) {
      sidePanel.capturedOffsets.push(offset);
      console.log('[bmap] Offset ' + (sidePanel.capturedOffsets.length) + ': x=' + offset.x + ', y=' + offset.y);
    }

    sidePanel.setCapturedCount(i + 1);
  }

  document.removeEventListener('visibilitychange', visibilityHandler);

  if (!signal.aborted) {
    sidePanel.setState(PanelState.DONE);
  }
}

/**
 * Execute stitching and trigger download.
 */
async function runStitchAndDownload() {
  var config = sidePanel.getConfig();
  var images = sidePanel.capturedImages;
  var offsets = sidePanel.capturedOffsets;
  var imgWidth = sidePanel.capturedWidth;
  var imgHeight = sidePanel.capturedHeight;

  if (images.length === 0) {
    throw new Error('没有可拼接的截图');
  }

  sidePanel.showWarning('正在拼接 ' + images.length + ' 张截图...');

  var result = await stitch(
    config.stitchMode, images, offsets, imgWidth, imgHeight, config.groupSize
  );
  var blobs = result.blobs;
  var warnings = result.warnings;

  if (warnings.length > 0) {
    sidePanel.showWarning(warnings.join('; '));
  }

  sidePanel.setTotalSteps(blobs.length);
  sidePanel.setCapturedCount(0);

  // Convert each blob to data URL and trigger download via the bridge.
  for (var i = 0; i < blobs.length; i++) {
    var blob = blobs[i];
    var filename = blobs.length === 1
      ? 'bmap_stitched.png'
      : 'bmap_stitched_' + (i + 1) + '_of_' + blobs.length + '.png';

    // Convert blob to base64 data URL (accessible across contexts)
    var dataUrl = await new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.onerror = function() { reject(new Error('Failed to read blob')); };
      reader.readAsDataURL(blob);
    });

    console.log('[bmap] Sending download: ' + filename + ' (' + dataUrl.length + ' chars)');

    await new Promise(function(resolve, reject) {
      bmapSendMessage(
        { action: 'download', url: dataUrl, filename: filename },
        function(response) {
          if (response && response.success) {
            resolve();
          } else {
            reject(new Error(response && response.error ? response.error : '下载失败'));
          }
        }
      );
    });

    sidePanel.setCapturedCount(i + 1);

    // Brief delay to avoid browser rate limiting
    await new Promise(function(r) { setTimeout(r, 300); });
  }

  sidePanel.showWarning('下载完成！共 ' + blobs.length + ' 个文件');
}
