// content/route-reader.js
// Route reading module: intercepts the amap.com direction API response
// and extracts polyline coordinates from it.
//
// Target endpoint: https://www.amap.com/service/autoNavigat*
// Response format:
//   data.path_list[].path[].segments[].coor
//   where coor is a JSON string: "[lng,lat,lng,lat,...]" (flat alternating array)

// ---------------------------------------------------------------------------
// Captured route data store
// ---------------------------------------------------------------------------

var _lastRouteData = null;  // { polyline: [[lng,lat],...], origin: string, destination: string }

// ---------------------------------------------------------------------------
// XMLHttpRequest interceptor
// ---------------------------------------------------------------------------

var _XHR_open = XMLHttpRequest.prototype.open;
var _XHR_send = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function(method, url) {
  this._bmap_url = url;
  return _XHR_open.apply(this, arguments);
};

XMLHttpRequest.prototype.send = function() {
  var self = this;
  self.addEventListener('load', function() {
    if (!self._bmap_url) return;
    // Only intercept autoNavigat requests
    if (self._bmap_url.indexOf('autoNavigat') === -1) return;
    try {
      var data = JSON.parse(self.responseText);
      var extracted = extractAutoNavigatResponse(data);
      if (extracted && extracted.polyline && extracted.polyline.length > 0) {
        _lastRouteData = extracted;
        console.log('[bmap] Route captured via XHR:', extracted.polyline.length, 'points');
      }
    } catch (e) {
      console.warn('[bmap] Failed to parse XHR response:', e.message);
    }
  });
  return _XHR_send.apply(this, arguments);
};

// ---------------------------------------------------------------------------
// fetch interceptor
// ---------------------------------------------------------------------------

var _fetch = window.fetch;
window.fetch = function(input, init) {
  return _fetch.apply(this, arguments).then(function(response) {
    var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    // Only intercept autoNavigat requests
    if (url.indexOf('autoNavigat') === -1) return response;

    var cloned = response.clone();
    cloned.json().then(function(data) {
      var extracted = extractAutoNavigatResponse(data);
      if (extracted && extracted.polyline && extracted.polyline.length > 0) {
        _lastRouteData = extracted;
        console.log('[bmap] Route captured via fetch:', extracted.polyline.length, 'points');
      }
    }).catch(function(e) {
      console.warn('[bmap] Failed to parse fetch response:', e.message);
    });
    return response;
  });
};

// ---------------------------------------------------------------------------
// Response extraction — specific to amap.com autoNavigat endpoint
// ---------------------------------------------------------------------------

/**
 * Extract route data from the autoNavigat API response.
 *
 * Response structure:
 * {
 *   data: {
 *     path_list: [
 *       {
 *         path: [
 *           {
 *             segments: [
 *               {
 *                 coor: "[lng,lat,lng,lat,...]"  ← flat alternating coordinate array as JSON string
 *               },
 *               ...
 *             ]
 *           },
 *           ...
 *         ]
 *       },
 *       ...  (alternative routes)
 *     ]
 *   }
 * }
 *
 * @param {object} data - parsed JSON response
 * @returns {{ polyline: [number,number][], origin: string, destination: string } | null}
 */
function extractAutoNavigatResponse(data) {
  if (!data || typeof data !== 'object') return null;

  var pathList = (data.data && data.data.path_list) || data.path_list;
  if (!pathList || !Array.isArray(pathList) || pathList.length === 0) return null;

  // Use the first route (primary/recommended)
  var firstRoute = pathList[0];
  var paths = firstRoute.path;
  if (!paths || !Array.isArray(paths)) return null;

  var allCoords = [];

  for (var p = 0; p < paths.length; p++) {
    var pathItem = paths[p];
    var segments = pathItem.segments;
    if (!segments || !Array.isArray(segments)) continue;

    for (var s = 0; s < segments.length; s++) {
      var segment = segments[s];
      var coor = segment.coor;
      if (!coor || typeof coor !== 'string') continue;

      // coor is a JSON string like "[lng,lat,lng,lat,...]"
      var flatArray;
      try {
        flatArray = JSON.parse(coor);
      } catch (e) {
        console.warn('[bmap] Failed to parse coor JSON:', coor.substring(0, 100));
        continue;
      }

      if (!Array.isArray(flatArray) || flatArray.length < 2) continue;

      // Convert flat alternating array [lng,lat,lng,lat,...] to [[lng,lat],...]
      for (var i = 0; i < flatArray.length - 1; i += 2) {
        allCoords.push([flatArray[i], flatArray[i + 1]]);
      }
    }
  }

  if (allCoords.length === 0) return null;

  // Pass the FULL polyline — computeStepSequence handles spacing with interpolation
  console.log('[bmap] Polyline extracted: ' + allCoords.length + ' points');

  var firstCoord = allCoords[0];
  var lastCoord = allCoords[allCoords.length - 1];
  var origin = firstCoord ? (firstCoord[0] + ',' + firstCoord[1]) : '';
  var destination = lastCoord ? (lastCoord[0] + ',' + lastCoord[1]) : '';

  return { polyline: allCoords, origin: origin, destination: destination, waypoints: [] };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the last captured route data from intercepted network requests.
 * @returns {{ polyline: [number,number][], origin: string, destination: string, waypoints: string[] } | null}
 */
function readRouteFromPage() {
  return _lastRouteData;
}

/**
 * Checks whether we have valid route data with polyline coordinates.
 * @returns {boolean}
 */
function hasValidRoute() {
  return _lastRouteData !== null &&
         _lastRouteData.polyline !== null &&
         _lastRouteData.polyline.length > 0;
}
