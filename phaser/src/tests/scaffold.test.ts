import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

describe('scaffold', () => {
  test('loads the browser entry from the expected DOM roots', async () => {
    const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');

    expect(html).toContain('<div id="game"></div>');
    expect(html).toContain('<div id="ui-root"></div>');
    expect(html).toContain('<script type="module" src="/src/main.ts"></script>');
  });
});
