import { expect, test, type Page } from '@playwright/test';

const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/A1VAR0W/ChatInk-Releases/main/latest.json';

function updateManifest(options: { mandatory?: boolean; minimumSupportedVersion?: string | null; release?: null } = {}) {
  return {
    schemaVersion: 1,
    channel: 'stable',
    release: options.release === null ? null : {
      tag: 'v0.2.0',
      version: '0.2.0',
      versionCode: 2_001,
      publishedAt: '2026-08-21T12:00:00.000Z',
      minimumSupportedVersion: options.minimumSupportedVersion ?? null,
      mandatory: options.mandatory ?? false,
      notes: ['Mejoras de estabilidad y accesibilidad.'],
      releaseUrl: 'https://github.com/A1VAR0W/ChatInk-Releases/releases/tag/v0.2.0',
      platforms: {
        android: {
          downloadUrl: 'https://github.com/A1VAR0W/ChatInk-Releases/releases/download/v0.2.0/ChatInk-0.2.0.apk',
          sha256: 'a'.repeat(64),
          size: 1_024,
        },
        ios: {
          downloadUrl: 'https://github.com/A1VAR0W/ChatInk-Releases/releases/download/v0.2.0/ChatInk-0.2.0.ipa',
          sha256: 'b'.repeat(64),
          size: 2_048,
          sourceUrl: 'https://raw.githubusercontent.com/A1VAR0W/ChatInk-Releases/main/sidestore-source.json',
        },
      },
    },
  };
}

const viewports = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
}

test('entry is responsive across the supported viewport matrix', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Entra, dibuja/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test('the update experience covers optional, mandatory, offline and empty manifests', async ({ page }) => {
  await page.route(UPDATE_MANIFEST_URL, async (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(updateManifest()) }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Buscar actualizaciones' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva versión disponible' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('0.1.0');
  await expect(dialog.getByRole('button', { name: 'Más tarde' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.unroute(UPDATE_MANIFEST_URL);
  await page.route(UPDATE_MANIFEST_URL, async (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(updateManifest({ mandatory: true })) }));
  await page.getByRole('button', { name: 'Buscar actualizaciones' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Más tarde' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.unroute(UPDATE_MANIFEST_URL);
  await page.route(UPDATE_MANIFEST_URL, async (route) => route.abort('failed'));
  await page.reload();
  await page.getByRole('button', { name: 'Buscar actualizaciones' }).click();
  await expect(page.getByText('No pudimos comprobarlo ahora. Revisa tu conexión e inténtalo de nuevo.')).toBeVisible();

  await page.unroute(UPDATE_MANIFEST_URL);
  await page.route(UPDATE_MANIFEST_URL, async (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(updateManifest({ release: null })) }));
  await page.getByRole('button', { name: 'Buscar actualizaciones' }).click();
  await expect(page.getByText('Todavía no hay una versión pública disponible.')).toBeVisible();
});

test('two isolated clients exchange replies, typing and touch-friendly drawings', async ({ browser }) => {
  const firstContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  await first.goto('/');
  await first.getByLabel('¿Cómo te llamamos?').fill('Ada');
  await first.getByRole('button', { name: 'Continuar' }).click();
  await first.getByRole('button', { name: 'Crear sala', exact: true }).click();
  await expect(first.locator('.connection--connected')).toBeVisible();
  const code = await first.locator('.room-identity code').innerText();

  await second.goto(`/?room=${code}`);
  await second.getByLabel('¿Cómo te llamamos?').fill('Lin');
  await second.getByRole('button', { name: 'Continuar' }).click();
  await second.getByLabel('Código de sala').fill(code);
  await second.getByRole('button', { name: 'Entrar en la sala' }).click();
  await expect(second.locator('.connection--connected')).toBeVisible();

  const firstMessage = 'Hola desde el primer navegador';
  await first.getByRole('textbox', { name: 'Mensaje' }).fill(firstMessage);
  await expect(second.locator('.typing-indicator')).toHaveText('Ada está escribiendo…');
  await first.getByRole('button', { name: 'Enviar' }).click();
  await expect(second.getByText(firstMessage)).toBeVisible();
  await expect(second.locator('.typing-indicator')).toHaveText('');

  await second.locator('.message').filter({ hasText: firstMessage }).getByRole('button', { name: 'Responder' }).click();
  await expect(second.locator('.reply-context')).toContainText('Ada');
  await second.getByRole('textbox', { name: 'Mensaje' }).fill('Respuesta al texto');
  await second.getByRole('button', { name: 'Enviar' }).click();
  await expect(first.locator('.message-reply-quote').last()).toContainText(firstMessage);

  await first.locator('.message--own').filter({ hasText: firstMessage }).getByRole('button', { name: 'Responder' }).click();
  await first.getByRole('textbox', { name: 'Mensaje' }).fill('Respuesta a mi propio mensaje');
  await first.getByRole('button', { name: 'Enviar' }).click();
  await expect(second.locator('.message-reply-quote').last()).toContainText(firstMessage);

  const uploadResponse = first.waitForResponse((response) => response.url().endsWith('/files') && response.request().method() === 'POST');
  await first.locator('input[type="file"]').setInputFiles({ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('temporal') });
  expect((await uploadResponse).status()).toBe(201);
  await expect(second.getByText('nota.txt')).toBeVisible();
  await second.locator('.message').filter({ hasText: 'nota.txt' }).getByRole('button', { name: 'Responder' }).click();
  await second.getByRole('textbox', { name: 'Mensaje' }).fill('Respuesta al archivo');
  await second.getByRole('button', { name: 'Enviar' }).click();
  await expect(first.locator('.message-reply-quote').last()).toContainText('nota.txt');

  await first.getByRole('tab', { name: /Dibujo/ }).click();
  const canvas = first.getByLabel(/Lienzo de dibujo/);
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('Drawing canvas not visible');
  await first.mouse.move(box.x + 40, box.y + 40);
  await first.mouse.down();
  await first.mouse.move(box.x + 180, box.y + 100, { steps: 8 });
  await first.mouse.up();
  await first.getByRole('button', { name: 'Deshacer' }).click();
  await first.getByRole('button', { name: 'Rehacer' }).click();
  await canvas.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 31, isPrimary: true, clientX: box.x + 90, clientY: box.y + 90, pressure: 0.5 });
  await canvas.dispatchEvent('pointermove', { pointerType: 'touch', pointerId: 31, isPrimary: true, clientX: box.x + 220, clientY: box.y + 130, pressure: 0.7 });
  await canvas.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 31, isPrimary: true, clientX: box.x + 220, clientY: box.y + 130, pressure: 0.7 });
  expect(await first.evaluate(() => window.scrollY)).toBe(0);
  await first.setViewportSize({ width: 844, height: 390 });
  await expect(canvas).toBeVisible();
  await first.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toBeVisible();
  await expect(first.getByRole('button', { name: 'Vista previa' })).toBeEnabled();
  await first.getByRole('button', { name: 'Vista previa' }).click();
  await first.getByRole('button', { name: 'Enviar dibujo' }).click();
  await expect(second.locator('.message-bubble--drawing canvas')).toHaveCount(1);

  await second.locator('.message-bubble--drawing').last().locator('..').getByRole('button', { name: 'Responder' }).click();
  await second.getByRole('textbox', { name: 'Mensaje' }).fill('Respuesta al dibujo');
  await second.getByRole('button', { name: 'Enviar' }).click();
  const lastQuote = first.locator('.message-reply-quote').last();
  await expect(lastQuote).toContainText('Dibujo');
  await lastQuote.click();
  await expect(first.locator('.message--highlighted')).toHaveCount(1);

  for (const viewport of viewports) {
    await second.setViewportSize(viewport);
    await expect(second.getByRole('textbox', { name: 'Mensaje' })).toBeVisible();
    await expectNoHorizontalOverflow(second);
  }

  await firstContext.close();
  await secondContext.close();
});
