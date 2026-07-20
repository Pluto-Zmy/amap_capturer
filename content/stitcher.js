// Stitching engine: combines multiple screenshots into one large map image
// using pixel offsets. Three modes: auto (pixel-budget groups), all (single image),
// group N (N images per group).

const SCALE = 2;                        // Pixel offset multiplier, matches Python tool
const MAX_PIXELS = 225_000_000;        // Pixel budget ceiling for auto mode

/**
 * Computes absolute positions of each image on the canvas from raw offsets.
 * Applies SCALE multiplier as in the Python tool.
 * @param {{x: number, y: number}[]} offsets - raw pixel offsets between adjacent images
 * @returns {{x: number, y: number}[]} length = offsets.length + 1, first item is (0, 0)
 */
function accumulatePositions(offsets) {
  const positions = [{ x: 0, y: 0 }];
  let x = 0;
  let y = 0;
  for (const offset of offsets) {
    x += offset.x * SCALE;
    y += offset.y * SCALE;
    positions.push({ x: Math.round(x), y: Math.round(y) });
  }
  return positions;
}

/**
 * Computes the bounding rectangle that contains all images.
 * @param {{x: number, y: number}[]} positions - absolute positions of each image
 * @param {number} imgWidth - width of a single screenshot
 * @param {number} imgHeight - height of a single screenshot
 * @returns {{ minX: number, minY: number, width: number, height: number }}
 */
function computeCanvasBounds(positions, imgWidth, imgHeight) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pos of positions) {
    if (pos.x < minX) minX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.x + imgWidth > maxX) maxX = pos.x + imgWidth;
    if (pos.y + imgHeight > maxY) maxY = pos.y + imgHeight;
  }
  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Core stitching function: combines a group of images into one canvas.
 * @param {ImageBitmap[]} images - screenshots in capture order
 * @param {{x: number, y: number}[]} offsets - raw pixel offsets between adjacent images
 * @param {number} imgWidth - width of a single screenshot
 * @param {number} imgHeight - height of a single screenshot
 * @returns {Promise<Blob>} PNG blob of the stitched result
 */
async function stitchGroup(images, offsets, imgWidth, imgHeight) {
  // Guard: image count must equal offset count + 1
  if (images.length !== offsets.length + 1) {
    throw new Error(
      `Image count (${images.length}) must equal offset count + 1 (${offsets.length + 1})`
    );
  }
  const positions = accumulatePositions(offsets);
  const bounds = computeCanvasBounds(positions, imgWidth, imgHeight);

  const canvas = new OffscreenCanvas(bounds.width, bounds.height);
  const ctx = canvas.getContext('2d');

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const px = positions[i].x - bounds.minX;
    const py = positions[i].y - bounds.minY;
    ctx.drawImage(img, px, py);
  }

  return canvas.convertToBlob({ type: 'image/png' });
}

/**
 * Mode 1: Stitch all images into a single canvas.
 * @param {ImageBitmap[]} images
 * @param {{x: number, y: number}[]} offsets
 * @param {number} imgWidth
 * @param {number} imgHeight
 * @returns {Promise<{ blobs: Blob[], warnings: string[] }>}
 */
async function stitchAll(images, offsets, imgWidth, imgHeight) {
  const totalPixels = (() => {
    const positions = accumulatePositions(offsets);
    const bounds = computeCanvasBounds(positions, imgWidth, imgHeight);
    return bounds.width * bounds.height;
  })();

  const warnings = [];
  if (totalPixels > 500_000_000) {
    warnings.push(
      `Stitched canvas is approximately ${Math.round(totalPixels / 1_000_000)}M pixels, may use significant memory. Consider using "auto" mode.`
    );
  }

  const blob = await stitchGroup(images, offsets, imgWidth, imgHeight);
  return { blobs: [blob], warnings };
}

/**
 * Mode 2: Group every N images into separate canvases.
 * @param {ImageBitmap[]} images
 * @param {{x: number, y: number}[]} offsets
 * @param {number} imgWidth
 * @param {number} imgHeight
 * @param {number} groupSize
 * @returns {Promise<{ blobs: Blob[], warnings: string[] }>}
 */
async function stitchByGroup(images, offsets, imgWidth, imgHeight, groupSize) {
  const totalImages = images.length;
  const numGroups = Math.ceil(totalImages / groupSize);
  const blobs = [];
  const warnings = [];

  for (let g = 0; g < numGroups; g++) {
    const start = g * groupSize;
    const end = Math.min(start + groupSize, totalImages);
    const groupImages = images.slice(start, end);
    const groupOffsets = offsets.slice(start, start + groupImages.length - 1);

    const blob = await stitchGroup(groupImages, groupOffsets, imgWidth, imgHeight);
    blobs.push(blob);
  }

  return { blobs, warnings };
}

/**
 * Mode 3 (default): Auto-group by 225,000,000 pixel budget.
 * Uses the same greedy algorithm as the Python tool's stitch_by_auto.
 * @param {ImageBitmap[]} images
 * @param {{x: number, y: number}[]} offsets
 * @param {number} imgWidth
 * @param {number} imgHeight
 * @returns {Promise<{ blobs: Blob[], warnings: string[] }>}
 */
async function stitchByAuto(images, offsets, imgWidth, imgHeight) {
  const totalImages = images.length;
  if (totalImages === 0) {
    return { blobs: [], warnings: ['No images to stitch'] };
  }

  // Pre-compute all positions
  const allPositions = accumulatePositions(offsets);
  const blobs = [];
  const warnings = [];

  let batchStart = 0;

  while (batchStart < totalImages) {
    let batchEnd = batchStart;

    // Greedy expansion: add images until pixel budget exceeded
    for (let i = batchStart; i < totalImages - 1; i++) {
      const hypothetical = allPositions.slice(batchStart, i + 2);
      const bounds = computeCanvasBounds(hypothetical, imgWidth, imgHeight);

      if (bounds.width * bounds.height > MAX_PIXELS) {
        break;
      }
      batchEnd = i + 1;
    }

    const groupImages = images.slice(batchStart, batchEnd + 1);
    const groupOffsets = offsets.slice(batchStart, batchEnd);

    const blob = await stitchGroup(groupImages, groupOffsets, imgWidth, imgHeight);
    blobs.push(blob);

    batchStart = batchEnd + 1;
  }

  return { blobs, warnings };
}

/**
 * Unified stitching entry point. Dispatches to the correct mode.
 * @param {'auto'|'all'|'group'} mode
 * @param {ImageBitmap[]} images
 * @param {{x: number, y: number}[]} offsets
 * @param {number} imgWidth
 * @param {number} imgHeight
 * @param {number} [groupSize] - required for 'group' mode only
 * @returns {Promise<{ blobs: Blob[], warnings: string[] }>}
 */
async function stitch(mode, images, offsets, imgWidth, imgHeight, groupSize) {
  switch (mode) {
    case 'all':
      return stitchAll(images, offsets, imgWidth, imgHeight);
    case 'group':
      if (!groupSize || groupSize < 1) {
        throw new Error('group mode requires groupSize >= 1');
      }
      return stitchByGroup(images, offsets, imgWidth, imgHeight, groupSize);
    case 'auto':
    default:
      return stitchByAuto(images, offsets, imgWidth, imgHeight);
  }
}
