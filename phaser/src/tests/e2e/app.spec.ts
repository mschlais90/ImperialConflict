import { expect, test, type Locator, type Page } from '@playwright/test';
import type Phaser from 'phaser';

test('starts a game and renders the management overlay with canvas', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Imperial Conflict' })).toBeVisible();
  await page.getByLabel('Empire name').fill('Smoke Empire');
  await page.getByRole('button', { name: 'Start' }).click();

  await expect(page.getByText('GC').first()).toBeVisible();
  await expect(page.getByText('Net worth')).toBeVisible();
  await expect(page.getByRole('button', { name: '1x' })).toHaveAttribute('aria-pressed', 'true');
  const initialTick = await readHudTick(page);
  await page.getByRole('button', { name: '4x' }).click();
  await expect.poll(() => readHudTick(page), { timeout: 1_500 }).toBeGreaterThan(initialTick);
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

test('keeps active form edits while ticks refresh the HUD', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();

  const initialTick = await readHudTick(page);
  await page.getByRole('button', { name: '4x' }).click();
  const military = page.getByLabel('military');
  await military.fill('33');

  await expect.poll(() => readHudTick(page), { timeout: 1_500 }).toBeGreaterThan(initialTick);
  await expect(military).toHaveValue('33');
  await expect(military).toBeFocused();
});

test('enters a system, selects a home planet, and queues a building', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();

  await clickPlayerHomeSystem(page);
  await expect.poll(() => getActiveSceneKeys(page)).toContain('SystemScene');

  const homePlanetName = await clickPlayerHomePlanet(page);
  await expect(page.getByRole('heading', { name: homePlanetName })).toBeVisible();

  await page.getByRole('button', { name: 'Queue', exact: true }).click();
  await expect(page.getByText('Queued 1 mine')).toBeVisible();
  await expect(page.getByText('mine', { exact: true })).toBeVisible();
});

async function readHudTick(page: Page): Promise<number> {
  const text = await page.locator('.hud-stat').filter({ hasText: 'Tick' }).innerText();
  const tick = Number.parseInt(text.replace(/\D/g, ''), 10);

  return Number.isNaN(tick) ? -1 : tick;
}

async function getActiveSceneKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => window.imperialConflictDebug?.game.scene.getScenes(true).map((scene) => scene.scene.key) ?? []);
}

async function clickPlayerHomeSystem(page: Page): Promise<void> {
  const point = await page.evaluate(() => {
    const debug = window.imperialConflictDebug;
    const state = debug?.controller.state;
    const game = debug?.game;
    const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
    if (!state || !game || !canvas) {
      throw new Error('Missing game debug state.');
    }

    const player = state.empires.find((empire) => empire.controllerType === 'human');
    const system = state.systems.find((candidate) => candidate.id === player?.homeSystemId);
    const scene = game.scene.getScene('GalaxyScene') as Phaser.Scene;
    const camera = scene.cameras.main;
    if (!player || !system || !camera) {
      throw new Error('Unable to locate player home system.');
    }

    const rect = canvas.getBoundingClientRect();
    const worldX = system.position.x * 20;
    const worldY = system.position.y * 20;
    camera.centerOn(worldX, worldY);
    return {
      x: rect.left + (worldX - camera.scrollX) * camera.zoom,
      y: rect.top + (worldY - camera.scrollY) * camera.zoom,
    };
  });

  await page.mouse.click(point.x, point.y);
}

async function clickPlayerHomePlanet(page: Page): Promise<string> {
  const result = await page.evaluate(() => {
    const debug = window.imperialConflictDebug;
    const state = debug?.controller.state;
    const game = debug?.game;
    const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
    if (!state || !game || !canvas) {
      throw new Error('Missing game debug state.');
    }

    const player = state.empires.find((empire) => empire.controllerType === 'human');
    const system = state.systems.find((candidate) => candidate.id === player?.homeSystemId);
    const homePlanet = state.planets.find((planet) => planet.id === player?.homePlanetId);
    const scene = game.scene.getScene('SystemScene') as Phaser.Scene & {
      calculateGridLayout?: (planetCount: number, width: number, height: number) => {
        cellHeight: number;
        cellWidth: number;
        columns: number;
        startX: number;
        startY: number;
      };
    };
    if (!player || !system || !homePlanet || !scene.calculateGridLayout) {
      throw new Error('Unable to locate player home planet.');
    }

    const planetIndex = system.planetIds.indexOf(homePlanet.id);
    if (planetIndex < 0) {
      throw new Error('Home planet not in selected home system.');
    }

    const layout = scene.calculateGridLayout(system.planetIds.length, scene.scale.width, scene.scale.height);
    const column = planetIndex % layout.columns;
    const row = Math.floor(planetIndex / layout.columns);
    const rect = canvas.getBoundingClientRect();
    return {
      name: homePlanet.planetName,
      x: rect.left + layout.startX + column * layout.cellWidth,
      y: rect.top + layout.startY + row * layout.cellHeight,
    };
  });

  await page.mouse.click(result.x, result.y);
  return result.name;
}

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
