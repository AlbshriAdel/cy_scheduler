import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import path from 'path';
import { pathToFileURL } from 'url';
const { chromium } = pw;

const FILE = pathToFileURL(path.resolve('cy_scheduler.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
await page.goto(FILE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#panel-schedule.active');
await page.click('button:has-text("+ Add level")');
await page.waitForTimeout(500);
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: '/tmp/cy_v12_toolbar.png', clip: { x: 0, y: 0, width: 1600, height: 110 } });

// Also capture the reset modal
await page.click('#btnReset');
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/cy_v12_reset_modal.png', fullPage: false });
await browser.close();
console.log('saved /tmp/cy_v12_*.png');
