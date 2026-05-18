import { expect, test } from '@playwright/test';

test('renders the Phaser game canvas', async ({ page }) => {
  await page.goto('/');

  const canvas = page.locator('#game canvas');

  await expect(canvas).toBeVisible();
  await expect(canvas).toBeInViewport();

  const canvasInfo = await canvas.evaluate((node) => {
    const canvasNode = node as HTMLCanvasElement;
    const rect = canvasNode.getBoundingClientRect();
    const gl = canvasNode.getContext('webgl2') ?? canvasNode.getContext('webgl');

    if (!gl) {
      return {
        clientHeight: rect.height,
        clientWidth: rect.width,
        drawingHeight: canvasNode.height,
        drawingWidth: canvasNode.width,
        nonBlankPixels: -1,
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
      nonBlankPixels,
    };
  });

  expect(canvasInfo.clientWidth).toBeGreaterThan(0);
  expect(canvasInfo.clientHeight).toBeGreaterThan(0);
  expect(canvasInfo.drawingWidth).toBe(1280);
  expect(canvasInfo.drawingHeight).toBe(720);
  expect(canvasInfo.nonBlankPixels).toBeGreaterThan(0);

  const emptyOverlayHitTarget = await page.evaluate(() => {
    const target = document.elementFromPoint(10, 10);

    return target ? { id: target.id, tagName: target.tagName } : null;
  });

  expect(emptyOverlayHitTarget).not.toEqual({ id: 'ui-root', tagName: 'DIV' });
});
