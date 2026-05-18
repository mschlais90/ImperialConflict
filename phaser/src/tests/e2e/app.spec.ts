import { expect, test, type Locator } from '@playwright/test';

test('starts a game and renders the management overlay with canvas', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Imperial Conflict' })).toBeVisible();
  await page.getByLabel('Empire name').fill('Smoke Empire');
  await page.getByRole('button', { name: 'Start' }).click();

  await expect(page.getByText('GC').first()).toBeVisible();
  await expect(page.getByText('Net worth')).toBeVisible();
  await expect(page.getByRole('button', { name: '1x' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Planet' })).toBeVisible();
  await expect(page.getByText('Select a planet in a system.')).toBeVisible();

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

  const overlayHitTarget = await page.evaluate(() => {
    const target = document.elementFromPoint(10, 10);

    return target ? { id: target.id, tagName: target.tagName } : null;
  });

  expect(overlayHitTarget).not.toEqual({ id: 'ui-root', tagName: 'DIV' });
});

test('keeps the Phaser canvas visible after resize', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();

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

test('shows validation notice instead of coercing invalid train counts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();

  const trainCount = page.getByLabel('Count').first();
  await trainCount.fill('2.5');
  await page.getByRole('button', { name: 'Train' }).click();

  await expect(page.getByText('Train count must be a whole number.')).toBeVisible();
});

test('rejects fractional research allocation before total validation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();

  await page.getByLabel('military').fill('20.5');
  await page.getByLabel('welfare').fill('20.5');
  await page.getByRole('button', { name: 'Apply research' }).click();

  await expect(page.getByText('Military allocation must be a whole number.')).toBeVisible();
  await expect(page.getByText('Research allocation updated')).not.toBeVisible();
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
