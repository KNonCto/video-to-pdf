import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// En entornos con Chromium preinstalado (p. ej. /opt/pw-browsers) usamos ese binario.
const preinstalled = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: existsSync(preinstalled) ? { executablePath: preinstalled } : {},
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
