import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import path from 'path';
import { pathToFileURL } from 'url';
const { chromium } = pw;

const FILE = pathToFileURL(path.resolve('cy_scheduler.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
await page.goto(FILE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#panel-schedule.active');
await page.click('.tab:has-text("Settings")');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/cy_v4_settings.png', fullPage: true });
await browser.close();
console.log('saved /tmp/cy_v4_settings.png');
