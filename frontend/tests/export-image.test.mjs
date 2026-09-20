import assert from 'node:assert/strict';
import test from 'node:test';
import { rasterImageGeometry } from '../src/export-image.js';

test('high-resolution raster embedding preserves the original displayed size', () => {
  const geometry = rasterImageGeometry({ width: 300, height: 150 }, 300, 150, 2);
  assert.deepEqual(geometry, {
    displayWidth: 300,
    displayHeight: 150,
    bitmapWidth: 600,
    bitmapHeight: 300
  });
});

test('raster embedding preserves deliberately non-proportional rendered dimensions', () => {
  const geometry = rasterImageGeometry({ width: 320, height: 100 }, 640, 480, 3);
  assert.equal(geometry.displayWidth, 320);
  assert.equal(geometry.displayHeight, 100);
  assert.equal(geometry.bitmapWidth, 960);
  assert.equal(geometry.bitmapHeight, 300);
});

test('oversized raster embedding scales both dimensions together', () => {
  const geometry = rasterImageGeometry({ width: 10000, height: 5000 }, 10000, 5000, 2);
  assert.equal(geometry.bitmapWidth, 8192);
  assert.equal(geometry.bitmapHeight, 4096);
});

test('raster embedding rejects missing dimensions instead of exporting incomplete content', () => {
  assert.throws(
    () => rasterImageGeometry({ width: 0, height: 0 }, 0, 0, 2),
    /EXPORT_IMAGE_RESOURCE_FAILED/
  );
});
