import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: [
    {
      command: 'JWT_SECRET=playwright-e2e-secret node ../backend/scripts/seedPlaywrightUsers.js && JWT_SECRET=playwright-e2e-secret npm --prefix ../backend start',
      url: 'http://127.0.0.1:3001',
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
});
