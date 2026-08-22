import { expect, test, type Locator, type Page } from '@playwright/test';

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

async function swipeToReply(target: Locator) {
  await target.evaluate((element) => {
    const pointer = (type: string, clientX: number, clientY: number) => element.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 11, isPrimary: true, clientX, clientY,
    }));
    pointer('pointerdown', 280, 120);
    pointer('pointermove', 185, 122);
    pointer('pointerup', 185, 122);
  });
}

test('entry is responsive across the supported viewport matrix', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Entra, dibuja/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
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
  await expect(second.locator('.typing-indicator')).toContainText('Ada está escribiendo');
  await expect(second.locator('.typing-dots')).toBeVisible();
  await first.getByRole('button', { name: 'Enviar' }).click();
  await expect(second.getByText(firstMessage)).toBeVisible();
  await expect(second.locator('.typing-indicator')).toHaveCount(0);

  const incomingText = second.locator('.message').filter({ hasText: firstMessage }).locator('.message-swipe-target');
  await swipeToReply(incomingText);
  await expect(second.locator('.reply-context')).toContainText('Ada');
  await expect(second.getByRole('textbox', { name: 'Mensaje' })).toBeFocused();
  await second.getByRole('textbox', { name: 'Mensaje' }).fill('Respuesta al texto');
  await second.getByRole('button', { name: 'Enviar' }).click();
  await expect(first.locator('.message-reply-quote').last()).toContainText(firstMessage);

  const ownReply = first.locator('.message--own').filter({ hasText: firstMessage }).getByRole('button', { name: 'Responder a tu mensaje' });
  await ownReply.hover();
  await ownReply.click();
  await first.getByRole('textbox', { name: 'Mensaje' }).fill('Respuesta a mi propio mensaje');
  await first.getByRole('button', { name: 'Enviar' }).click();
  await expect(second.locator('.message-reply-quote').last()).toContainText(firstMessage);

  const uploadResponse = first.waitForResponse((response) => response.url().endsWith('/files') && response.request().method() === 'POST');
  await first.locator('input[type="file"]').setInputFiles({ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('temporal') });
  expect((await uploadResponse).status()).toBe(201);
  await expect(second.getByText('nota.txt')).toBeVisible();
  await swipeToReply(second.locator('.message').filter({ hasText: 'nota.txt' }).locator('.message-swipe-target'));
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
  await first.getByRole('button', { name: 'Cubo de pintura' }).click();
  await canvas.click({ position: { x: 20, y: 20 } });
  expect(await first.evaluate(() => window.scrollY)).toBe(0);
  await first.setViewportSize({ width: 844, height: 390 });
  await expect(canvas).toBeVisible();
  await first.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toBeVisible();
  await expect(first.getByRole('button', { name: 'Vista previa' })).toBeEnabled();
  await expect(first.getByRole('button', { name: 'Enviar ahora' })).toBeEnabled();
  await first.getByRole('button', { name: 'Elegir color y grosor' }).click();
  await expect(first.getByLabel('Color #e84393')).toBeVisible();
  await expect(first.getByRole('slider', { name: /Grosor/ })).toBeVisible();
  await first.getByLabel('Color #e84393').click();
  await expect(first.getByLabel('Color #e84393')).toHaveCount(0);
  await first.getByRole('button', { name: 'Vista previa' }).click();
  await first.getByRole('button', { name: 'Enviar dibujo' }).click();
  await expect(second.locator('.message-bubble--drawing canvas')).toHaveCount(1);

  await swipeToReply(second.locator('.message-bubble--drawing').last().locator('..'));
  await second.getByRole('textbox', { name: 'Mensaje' }).fill('Respuesta al dibujo');
  await second.getByRole('button', { name: 'Enviar' }).click();
  const lastQuote = first.locator('.message-reply-quote').last();
  await expect(lastQuote).toContainText('Dibujo');
  await lastQuote.click();
  await expect(first.locator('.message--highlighted')).toHaveCount(1);

  const longMessage = 'Texto largo para comprobar que el chat no corta el contenido. '.repeat(18);
  await first.getByRole('tab', { name: 'Texto' }).click();
  await first.getByRole('textbox', { name: 'Mensaje' }).fill(longMessage);
  await first.getByRole('button', { name: 'Enviar' }).click();
  const longBubble = second.locator('.message').filter({ hasText: longMessage }).last();
  await expect(longBubble.getByRole('button', { name: 'Leer más' })).toBeVisible();
  await longBubble.getByRole('button', { name: 'Leer más' }).click();
  await expect(longBubble.getByRole('button', { name: 'Ver menos' })).toBeVisible();

  for (const viewport of viewports) {
    await second.setViewportSize(viewport);
    await expect(second.getByRole('textbox', { name: 'Mensaje' })).toBeVisible();
    await expectNoHorizontalOverflow(second);
  }
  await expect(second.getByRole('button', { name: 'Cerrar sala' })).toHaveCount(0);
  await first.setViewportSize({ width: 390, height: 844 });
  await expect(first.getByRole('button', { name: 'Cerrar sala' })).toBeVisible();

  await first.goBack();
  await expect(first.getByRole('heading', { name: /Dónde quieres/ })).toBeVisible();
  await expect(second.getByLabel('Ver 1 personas en la sala')).toBeVisible();

  await firstContext.close();
  await secondContext.close();
});
