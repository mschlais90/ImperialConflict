import { expect, test, type Locator } from '@playwright/test';

test('renders the Phaser game canvas', async ({ page }) => {
  await page.goto('/');

  const canvas = page.locator('#game canvas');

  await expect(canvas).toBeVisible();
  await expect(canvas).toBeInViewport();

  const canvasInfo = await readCanvasInfo(canvas);

  expect(canvasInfo.clientWidth).toBeGreaterThan(0);
  expect(canvasInfo.clientHeight).toBeGreaterThan(0);
  expect(canvasInfo.drawingWidth).toBeGreaterThan(0);
  expect(canvasInfo.drawingHeight).toBeGreaterThan(0);
  expect(canvasInfo.clientWidth).toBeGreaterThanOrEqual(canvasInfo.viewportWidth * 0.9);
  expect(canvasInfo.clientHeight).toBeGreaterThanOrEqual(canvasInfo.viewportHeight * 0.9);
  expect(canvasInfo.drawingWidth).toBeGreaterThanOrEqual(canvasInfo.clientWidth * 0.75);
  expect(canvasInfo.drawingHeight).toBeGreaterThanOrEqual(canvasInfo.clientHeight * 0.75);
  expect(canvasInfo.drawingWidth).toBeLessThanOrEqual(canvasInfo.clientWidth * canvasInfo.devicePixelRatio + 2);
  expect(canvasInfo.drawingHeight).toBeLessThanOrEqual(canvasInfo.clientHeight * canvasInfo.devicePixelRatio + 2);
  expect(canvasInfo.nonBlankPixels).toBeGreaterThan(0);

  const emptyOverlayHitTarget = await page.evaluate(() => {
    const target = document.elementFromPoint(10, 10);

    return target ? { id: target.id, tagName: target.tagName } : null;
  });

  expect(emptyOverlayHitTarget).not.toEqual({ id: 'ui-root', tagName: 'DIV' });
});

test('keeps the Phaser canvas visible after resize', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.goto('/');

  const canvas = page.locator('#game canvas');

  await expect(canvas).toBeVisible();
  await expect(canvas).toBeInViewport();

  const canvasInfo = await readCanvasInfo(canvas);

  expect(canvasInfo.clientWidth).toBeGreaterThanOrEqual(360);
  expect(canvasInfo.clientHeight).toBeGreaterThanOrEqual(600);
  expect(canvasInfo.drawingWidth).toBeGreaterThan(0);
  expect(canvasInfo.drawingHeight).toBeGreaterThan(0);
  expect(canvasInfo.nonBlankPixels).toBeGreaterThan(0);
});

async function readCanvasInfo(canvas: Locator) {
  return canvas.evaluate((node) => {
    const canvasNode = node as HTMLCanvasElement;
    const rect = canvasNode.getBoundingClientRect();
    const gl = canvasNode.getContext('webgl2') ?? canvasNode.getContext('webgl');

    if (!gl) {
      return {
        clientHeight: rect.height,
        clientWidth: rect.width,
        drawingHeight: canvasNode.height,
        drawingWidth: canvasNode.width,
        devicePixelRatio: window.devicePixelRatio,
        nonBlankPixels: -1,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    }

    const sampleWidth = Math.min(canvasNode.width, 128);
    const sampleHeight = Math.min(canvasNode.height, 72);
    const pixels = new Uint8Array(sampleWidth * sampleHeight * 4);
    gl.readPixels(0, 0, sampleWidth, sampleHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let nonBlankPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] !== 0 || pixels[i + 1] !== 0 || pixels[i + 2] !== 0 || pixels[i + 3] !== 0) {
        nonBlankPixels += 1;
      }
    }

    return {
      clientHeight: rect.height,
      clientWidth: rect.width,
      drawingHeight: canvasNode.height,
      drawingWidth: canvasNode.width,
      devicePixelRatio: window.devicePixelRatio,
      nonBlankPixels,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });
}
