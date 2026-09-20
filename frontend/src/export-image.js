export function rasterImageGeometry(bounds, naturalWidth, naturalHeight, scale = 1) {
  const width = Number(bounds?.width) > 0 ? Number(bounds.width) : Number(naturalWidth);
  const height = Number(bounds?.height) > 0 ? Number(bounds.height) : Number(naturalHeight);
  const pixelScale = Math.max(1, Number(scale) || 1);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error('EXPORT_IMAGE_RESOURCE_FAILED: invalid image dimensions');
  }
  const requestedWidth = Math.max(1, Math.ceil(width * pixelScale));
  const requestedHeight = Math.max(1, Math.ceil(height * pixelScale));
  const downscale = Math.min(
    1,
    8192 / requestedWidth,
    8192 / requestedHeight,
    Math.sqrt(64000000 / (requestedWidth * requestedHeight))
  );
  return {
    displayWidth: width,
    displayHeight: height,
    bitmapWidth: Math.max(1, Math.floor(requestedWidth * downscale)),
    bitmapHeight: Math.max(1, Math.floor(requestedHeight * downscale))
  };
}
