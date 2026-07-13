// 使用系统 Chrome 无头截图，用于生成前端展示图片。
// 仅本地开发使用，不参与构建；运行 npm run snapshot 前需先启动待截图页面。
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../docs/snapshots');
const BASE_URL = process.env.SNAP_URL || 'http://localhost:5173/';
const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const THEMES = ['light', 'paper', 'dark'];

const VIEWPORTS = {
  desktop: { width: 1440, height: 960, deviceScaleFactor: 2, isMobile: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seedState(page, { theme }) {
  await page.evaluateOnNewDocument((themeMode) => {
    try {
      localStorage.setItem('diary-theme', themeMode);
      localStorage.setItem('diary_view_mode', 'timeline');
      // 跳过欢迎页转场，让主应用直接可见（若受设置控制则由应用决定）
    } catch (e) {
      void e;
    }
  }, theme);
}

async function capture(browser, { name, theme, viewport, actions }) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORTS[viewport]);
  await seedState(page, { theme });
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(700);
  if (actions) {
    await actions(page);
  }
  await sleep(500);
  const file = resolve(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('saved', file);
  await page.close();
}

async function scrollToContent(page) {
  await enterApp(page);
  // 滚动到正文阅读区，展示时间轴条目卡片
  await page.evaluate(() => {
    window.scrollTo({ top: Math.round(window.innerHeight * 0.85), behavior: 'instant' });
  });
  await new Promise((r) => setTimeout(r, 600));
}

async function enterApp(page) {
  // 若存在欢迎页进入按钮，点击进入主应用
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const enter = buttons.find((b) =>
      /进入日记|前往验证|进入/.test(b.textContent || '')
    );
    if (enter) {
      enter.click();
      return true;
    }
    return false;
  });
  if (clicked) {
    await new Promise((r) => setTimeout(r, 1200));
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-color-profile=srgb'],
  });

  try {
    // 欢迎页 - 三个主题，桌面
    for (const theme of THEMES) {
      await capture(browser, {
        name: `welcome-${theme}-desktop`,
        theme,
        viewport: 'desktop',
      });
    }

    // 主应用（时间轴）- 三个主题，桌面
    for (const theme of THEMES) {
      await capture(browser, {
        name: `app-${theme}-desktop`,
        theme,
        viewport: 'desktop',
        actions: enterApp,
      });
    }

    // 移动端 - 欢迎页与主应用（三个主题）
    for (const theme of THEMES) {
      await capture(browser, {
        name: `welcome-${theme}-mobile`,
        theme,
        viewport: 'mobile',
      });
      await capture(browser, {
        name: `app-${theme}-mobile`,
        theme,
        viewport: 'mobile',
        actions: enterApp,
      });
    }

    // 阅读区（时间轴卡片）- 展示正文区卡片质感
    for (const theme of THEMES) {
      await capture(browser, {
        name: `reading-${theme}-desktop`,
        theme,
        viewport: 'desktop',
        actions: scrollToContent,
      });
    }
    for (const theme of THEMES) {
      await capture(browser, {
        name: `reading-${theme}-mobile`,
        theme,
        viewport: 'mobile',
        actions: scrollToContent,
      });
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
