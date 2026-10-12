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

test('extrae 4 diapositivas recortadas del video sintético', async ({ page }, info) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(fixture);

  await expect(page.getByRole('heading', { name: 'Revisa el recorte' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Extraer diapositivas' }).click();

  await expect(page.getByTestId('result-title')).toHaveText('4 diapositivas', { timeout: 120_000 });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar PDF' }).click();
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
  }
});
