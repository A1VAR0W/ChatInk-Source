import { expect, test, type Locator, type Page } from '@playwright/test';

const viewports = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 412, height: 915 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
}

async function expectMobileComposerLayout(page: Page) {
  const metrics = await page.evaluate(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('.text-row textarea');
    const composer = document.querySelector<HTMLElement>('.composer');
    const canvas = document.querySelector<HTMLCanvasElement>('.drawing-canvas');
    if (textarea === null || composer === null) throw new Error('Composer not available');
    const textareaRect = textarea.getBoundingClientRect();
    const composerRect = composer.getBoundingClientRect();
    const canvasRect = canvas?.getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      textareaHeight: textareaRect.height,
      textareaWidth: textareaRect.width,
      textareaVisible: textareaRect.height > 0,
      composerBottom: composerRect.bottom,
      canvasBottom: canvasRect !== undefined && canvasRect.height > 0 ? canvasRect.bottom : undefined,
    };
  });
  if (metrics.textareaVisible) {
    expect(metrics.textareaHeight).toBeGreaterThanOrEqual(48);
    expect(metrics.textareaWidth).toBeGreaterThanOrEqual(250);
  }
  expect(metrics.composerBottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  if (metrics.canvasBottom !== undefined) expect(metrics.viewportHeight - metrics.canvasBottom).toBeLessThanOrEqual(16);
}

async function expectMessageBubbleLayout(page: Page, text: string, own: boolean) {
  const metrics = await page.locator('.message').filter({ hasText: text }).last().evaluate((message) => {
    const bubble = message.querySelector<HTMLElement>('.message-bubble');
    const content = message.querySelector<HTMLElement>('.message-text__content');
    const time = message.querySelector<HTMLElement>('.message-time');
    const list = document.querySelector<HTMLElement>('.message-list');
    if (bubble === null || content === null || time === null || list === null) throw new Error('Message layout unavailable');
    const bubbleRect = bubble.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const timeRect = time.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const contentStyle = getComputedStyle(content);
    return {
      bubble: { width: bubbleRect.width, left: bubbleRect.left, right: bubbleRect.right },
      content: {
        text: content.textContent,
        bottom: contentRect.bottom,
        clientWidth: content.clientWidth,
        scrollWidth: content.scrollWidth,
        fontSize: Number.parseFloat(contentStyle.fontSize),
        wordBreak: contentStyle.wordBreak,
        overflowWrap: contentStyle.overflowWrap,
        whiteSpace: contentStyle.whiteSpace,
      },
      timeTop: timeRect.top,
      list: { width: listRect.width, left: listRect.left, right: listRect.right },
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect(metrics.content.text).toBe(text);
  expect(metrics.content.fontSize).toBeGreaterThanOrEqual(16);
  expect(metrics.content.wordBreak).toBe('normal');
  expect(metrics.content.overflowWrap).toBe('break-word');
  expect(metrics.content.whiteSpace).toBe('pre-wrap');
  expect(metrics.content.scrollWidth).toBeLessThanOrEqual(metrics.content.clientWidth + 1);
  expect(metrics.bubble.width).toBeLessThanOrEqual(Math.min(metrics.list.width * 0.82, 576) + 1);
  expect(metrics.timeTop).toBeGreaterThanOrEqual(metrics.content.bottom);
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(Math.abs((own ? metrics.bubble.right - metrics.list.right : metrics.bubble.left - metrics.list.left))).toBeLessThanOrEqual(1);
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

test('message bubbles keep complete words, metadata and alignment across responsive widths', async ({ browser }) => {
  const firstContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const secondContext = await browser.newContext({ viewport: { width: 320, height: 844 }, hasTouch: true, isMobile: true });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  const sample = 'I allow callmebot to send me messages';
  const multiline = 'Este mensaje conserva\nsu salto manual 😀✨';
  const unbreakable = `https://chatink.example/${'a'.repeat(320)}`;

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

  await first.getByRole('textbox', { name: 'Mensaje' }).fill(sample);
  await first.getByRole('button', { name: 'Enviar' }).click();
  await expect(second.getByText(sample)).toBeVisible();
  await second.getByRole('textbox', { name: 'Mensaje' }).fill('Hola');
  await second.getByRole('button', { name: 'Enviar' }).click();
  await expect(first.getByText('Hola')).toBeVisible();
  await second.getByRole('textbox', { name: 'Mensaje' }).fill(multiline);
  await second.getByRole('button', { name: 'Enviar' }).click();
  await expect(first.getByText(multiline)).toBeVisible();
  await first.getByRole('textbox', { name: 'Mensaje' }).fill(unbreakable);
  await first.getByRole('button', { name: 'Enviar' }).click();
  await expect(second.getByText(unbreakable)).toBeVisible();

  for (const viewport of [
    { width: 320, height: 844 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await second.setViewportSize(viewport);
    await expectMessageBubbleLayout(second, sample, false);
    await expectMessageBubbleLayout(second, 'Hola', true);
    await expectMessageBubbleLayout(second, unbreakable, false);
    await expectNoHorizontalOverflow(second);
  }

  await second.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await expectMessageBubbleLayout(second, sample, false);
  await second.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await expectMessageBubbleLayout(second, multiline, true);

  await firstContext.close();
  await secondContext.close();
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
  await expectMobileComposerLayout(second);

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
  await expectMobileComposerLayout(first);
  await expect(first.getByRole('button', { name: 'Vista previa' })).toBeEnabled();
  await expect(first.getByRole('button', { name: 'Enviar ahora' })).toBeEnabled();
  const drawingActions = await first.locator('.composer-footer').boundingBox();
  const drawingTools = await first.locator('.drawing-tools').boundingBox();
  if (drawingActions === null || drawingTools === null) throw new Error('Drawing controls not visible');
  expect(drawingActions.y).toBeLessThan(drawingTools.y);
  await first.getByRole('button', { name: 'Elegir color y grosor' }).click();
  await expect(first.getByLabel('Color #e84393')).toBeVisible();
  await expect(first.getByRole('slider', { name: /Grosor/ })).toBeVisible();
  const colorTrigger = await first.getByRole('button', { name: 'Elegir color y grosor' }).boundingBox();
  const colorPanel = await first.locator('.color-control__panel').boundingBox();
  if (colorTrigger === null || colorPanel === null) throw new Error('Color selector not visible');
  expect(Math.abs((colorPanel.x + colorPanel.width / 2) - (colorTrigger.x + colorTrigger.width / 2))).toBeLessThanOrEqual(1);
  expect(colorPanel.y).toBeGreaterThan(colorTrigger.y);
  await first.getByLabel('Color #e84393').dispatchEvent('click');
  await expect(first.getByLabel('Color #e84393')).toHaveCount(0);
  await first.getByRole('button', { name: 'Vista previa' }).click();
  await first.getByRole('button', { name: 'Enviar dibujo' }).click();
  await expect(second.locator('.message-bubble--drawing canvas')).toHaveCount(1);

  await first.getByRole('tab', { name: 'Texto' }).click();
  const mobileTextarea = first.getByRole('textbox', { name: 'Mensaje' });
  await mobileTextarea.fill('Una\nDos\nTres\nCuatro\nCinco');
  await expectMobileComposerLayout(first);
  await first.getByRole('button', { name: 'Enviar' }).click();
  await expectMobileComposerLayout(first);

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
