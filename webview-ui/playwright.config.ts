import { defineConfig, devices, chromium } from '@playwright/test';

// Polyfill getByPlaceholderText on Playwright Page & Locator to ensure compatibility with tests
function patchPage(page: unknown): void {
  const p = page as {
    locator: (selector: string) => unknown;
    getByPlaceholder: (text: unknown, options?: unknown) => unknown;
    getByPlaceholderText?: (text: unknown, options?: unknown) => unknown;
  };
  const pProto = Object.getPrototypeOf(p) as {
    getByPlaceholder: (text: unknown, options?: unknown) => unknown;
    getByPlaceholderText?: (text: unknown, options?: unknown) => unknown;
  };
  if (pProto && !pProto.getByPlaceholderText) {
    pProto.getByPlaceholderText = function (text: unknown, options?: unknown) {
      return this.getByPlaceholder(text, options);
    };
  }
  const locator = p.locator(':root');
  const lProto = Object.getPrototypeOf(locator) as {
    getByPlaceholder: (text: unknown, options?: unknown) => unknown;
    getByPlaceholderText?: (text: unknown, options?: unknown) => unknown;
  };
  if (lProto && !lProto.getByPlaceholderText) {
    lProto.getByPlaceholderText = function (text: unknown, options?: unknown) {
      return this.getByPlaceholder(text, options);
    };
  }
}

const browserTypeProto = Object.getPrototypeOf(chromium) as {
  launch: (...args: unknown[]) => Promise<{
    newContext: (...args: unknown[]) => Promise<{
      newPage: (...args: unknown[]) => Promise<unknown>;
      on: (event: string, listener: (page: unknown) => void) => void;
      pages?: () => unknown[];
    }>;
    newPage: (...args: unknown[]) => Promise<unknown>;
  }>;
  launchPersistentContext?: (...args: unknown[]) => Promise<{
    newPage: (...args: unknown[]) => Promise<unknown>;
    on: (event: string, listener: (page: unknown) => void) => void;
    pages?: () => unknown[];
  }>;
};

const origLaunch = browserTypeProto.launch;
browserTypeProto.launch = async function (...args: unknown[]) {
  const browser = await origLaunch.apply(this, args);
  const origNewContext = browser.newContext;
  browser.newContext = async function (...cArgs: unknown[]) {
    const ctx = await origNewContext.apply(this, cArgs);
    const origNewPage = ctx.newPage;
    ctx.newPage = async function (...pArgs: unknown[]) {
      const page = await origNewPage.apply(this, pArgs);
      patchPage(page);
      return page;
    };
    ctx.on('page', (page: unknown) => patchPage(page));
    return ctx;
  };
  const origNewPage = browser.newPage;
  browser.newPage = async function (...pArgs: unknown[]) {
    const page = await origNewPage.apply(this, pArgs);
    patchPage(page);
    return page;
  };
  return browser;
};

if (browserTypeProto.launchPersistentContext) {
  const origLaunchPersistent = browserTypeProto.launchPersistentContext;
  browserTypeProto.launchPersistentContext = async function (...args: unknown[]) {
    const ctx = await origLaunchPersistent.apply(this, args);
    const origNewPage = ctx.newPage;
    ctx.newPage = async function (...pArgs: unknown[]) {
      const page = await origNewPage.apply(this, pArgs);
      patchPage(page);
      return page;
    };
    ctx.on('page', (page: unknown) => patchPage(page));
    return ctx;
  };
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // HEADED=true の場合は操作が見えるように slowMo を適用
    launchOptions: {
      slowMo: process.env.HEADED === 'true' ? 300 : 0,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5174',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
