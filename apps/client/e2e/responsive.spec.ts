import { expect, test } from '@playwright/test';

test('entry is responsive on mobile and desktop', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Entra, dibuja/ })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  }
});

test('two isolated clients exchange text, drawing and a temporary file', async ({ browser }) => {
  const firstContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
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

  await first.getByRole('textbox', { name: 'Mensaje' }).fill('Hola desde el primer navegador');
  await first.getByRole('button', { name: 'Enviar' }).click();
  await expect(second.getByText('Hola desde el primer navegador')).toBeVisible();

  const uploadResponse = first.waitForResponse((response) => response.url().endsWith('/files') && response.request().method() === 'POST');
  await first.locator('input[type="file"]').setInputFiles({ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('temporal') });
  expect((await uploadResponse).status()).toBe(201);
  await expect(first.locator('.upload-item')).toContainText('Listo');
  await expect(second.getByText('nota.txt')).toBeVisible();

  await first.getByRole('tab', { name: /Dibujo/ }).click();
  const canvas = first.getByLabel(/Lienzo de dibujo/);
  const previewButton = first.getByRole('button', { name: 'Vista previa' });
  await expect(previewButton).toBeVisible();
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('Drawing canvas not visible');
  await first.mouse.move(box.x + 40, box.y + 40);
  await first.mouse.down();
  await first.mouse.move(box.x + 180, box.y + 100, { steps: 8 });
  await first.mouse.up();
  await expect(previewButton).toBeEnabled();
  await previewButton.click();
  await first.getByRole('button', { name: 'Enviar dibujo' }).click();
  await expect(second.locator('.message-bubble--drawing canvas')).toHaveCount(1);

  await firstContext.close();
  await secondContext.close();
});
