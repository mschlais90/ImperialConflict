import { expect, test } from '@playwright/test';

test('shows the temporary boot message', async ({ page }) => {
  await page.goto('/');

  const bootMessage = page.getByText('Imperial Conflict Phaser MVP');

  await expect(bootMessage).toBeVisible();
  await expect(bootMessage).toBeInViewport();

  const emptyOverlayHitTarget = await page.evaluate(() => {
    const target = document.elementFromPoint(10, 10);

    return target ? target.className : null;
  });

  expect(emptyOverlayHitTarget).not.toContain('boot');
});
