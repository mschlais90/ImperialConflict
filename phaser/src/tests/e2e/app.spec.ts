import { expect, test } from '@playwright/test';

test('shows the temporary boot message', async ({ page }) => {
  await page.goto('/');

  const bootMessage = page.getByText('Imperial Conflict Phaser MVP');

  await expect(bootMessage).toBeVisible();
  await expect(bootMessage).toBeInViewport();
});
