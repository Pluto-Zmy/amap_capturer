// content/map-controller.js
// Map control module: computes capture positions by sampling the polyline,
// moves the map, and waits for tile loading.

/**
 * Selects capture positions by sampling the polyline every Nth point.
 * Always includes the first and last point of the route.
 *
 * @param {[number, number][]} polyline - route coordinates [[lng, lat], ...]
 * @param {number} sampleRate - capture every Nth polyline point (e.g. 1 = every point)
 * @returns {[number, number][]} capture position sequence
 */
function computeStepSequence(polyline, sampleRate) {
  if (!polyline || polyline.length === 0) return [];
  if (polyline.length === 1) return [polyline[0]];

  var rate = Math.max(1, sampleRate || 1);
  var steps = [];

  for (var i = 0; i < polyline.length; i += rate) {
    steps.push(polyline[i]);
  }

  // Always include the endpoint
  var lastPoint = polyline[polyline.length - 1];
  var lastStep = steps[steps.length - 1];
  if (lastStep[0] !== lastPoint[0] || lastStep[1] !== lastPoint[1]) {
    steps.push(lastPoint);
  }

  console.log('[bmap] Steps: ' + steps.length + ' captures (sampled every ' + rate +
              ' from ' + polyline.length + ' points)');

  return steps;
}

/**
 * Moves the map center to the specified coordinates and waits for rendering.
 */
function moveMapTo(amapInstance, lng, lat, waitMs) {
  return new Promise(function(resolve) {
    amapInstance.setCenter(new AMap.LngLat(lng, lat));
    AMap.event.trigger(amapInstance, 'moveend');
    setTimeout(resolve, waitMs);
  });
}

/**
 * Sets the map zoom level (clamped to 3-18).
 */
function setMapZoom(amapInstance, zoom) {
  var clampedZoom = Math.max(3, Math.min(18, Math.round(zoom)));
  amapInstance.setZoom(clampedZoom);
}

/**
 * Gets the current map canvas pixel dimensions.
 */
function getMapCanvasSize(amapInstance) {
  try {
    var size = amapInstance.getSize();
    return { width: size.width, height: size.height };
  } catch (e) {
    var canvas = document.querySelector('.amap-layer canvas');
    if (canvas) {
      return { width: canvas.width, height: canvas.height };
    }
    return null;
  }
}
