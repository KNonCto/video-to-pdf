import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fixture = path.join(__dirname, 'fixtures', 'clase.webm');

test.beforeAll(() => {
  if (!existsSync(fixture)) execFileSync('python3', [path.join(__dirname, 'make_video.py'), fixture], { stdio: 'inherit' });
});

test('extrae 4 diapositivas recortadas y sin el menú que las tapa', async ({ page }, info) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(fixture);

  await expect(page.getByRole('heading', { name: 'Revisa el recorte' })).toBeVisible({ timeout: 60_000 });
  // Tramo: deja fuera los primeros 2 s y el final negro.
  await page.getByLabel('Desde').fill('0:02');
  await page.getByLabel('Desde').press('Enter');
  await page.getByLabel('Hasta').fill('0:56');
  await page.getByLabel('Hasta').press('Enter');
  await expect(page.getByLabel('Inicio del tramo')).toHaveValue('2');
  await expect(page.getByLabel('Fin del tramo')).toHaveValue('56');
  await page.getByRole('button', { name: 'Extraer diapositivas' }).click();
  await expect(page.getByText('de 0:56')).toBeVisible();

  await expect(page.getByTestId('result-title')).toHaveText('4 diapositivas', { timeout: 120_000 });

  // Selección: desmarcar una diapo no la borra; se puede volver a marcar.
  await page.getByLabel('Incluir diapositiva 4 en el PDF').uncheck();
  await expect(page.getByTestId('selected-count')).toHaveText('3 de 4 seleccionadas para el PDF');
  await page.getByRole('button', { name: 'Ver diapositiva 4' }).click();
  await page.getByTestId('slide-viewer').getByLabel('Incluir en el PDF').check();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('selected-count')).toHaveText('4 de 4 seleccionadas para el PDF');

  // Visor: abrir la diapo 2 (la que tuvo el menú encima) y elegir otra versión ahí.
  await page.getByRole('button', { name: 'Ver diapositiva 2' }).click();
  const viewer = page.getByTestId('slide-viewer');
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('button', { name: /^Versión \d$/ })).toHaveCount(2);
  await viewer.getByRole('button', { name: 'Versión 1' }).click();
  await expect(viewer.getByRole('button', { name: 'Versión 1' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await expect(page.getByRole('button', { name: 'Versión 1/2' })).toBeVisible();
  // volver a la versión limpia para el chequeo del PDF
  await page.getByRole('button', { name: 'Ver diapositiva 2' }).click();
  await page.keyboard.press('2');
  await page.keyboard.press('Escape');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Descargar PDF/ }).click();
  const pdfPath = info.outputPath('clase.pdf');
  await (await download).saveAs(pdfPath);

  const result = JSON.parse(execFileSync('python3', [path.join(__dirname, 'check_pdf.py'), pdfPath]).toString());
  expect(result.pages).toHaveLength(4);
  // cada página debe ser una diapositiva distinta
  expect(new Set(result.pages.map((p: { hash: string }) => p.hash)).size).toBe(4);
  for (const p of result.pages) {
    // La diapo del video es 960×540 (16:9); la cámara y las franjas negras quedan fuera.
    expect(p.ratio).toBeGreaterThan(1.7);
    expect(p.ratio).toBeLessThan(1.85);
    expect(p.imgW).toBeGreaterThan(900);
    expect(p.imgW).toBeLessThan(990);
    expect(p.darkBorder).toBeLessThan(0.05);
    expect(p.magenta).toBeLessThan(0.001);
  }
});
