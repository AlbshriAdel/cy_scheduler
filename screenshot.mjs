import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import path from 'path';
import { pathToFileURL } from 'url';
const { chromium } = pw;

const FILE = pathToFileURL(path.resolve('cy_scheduler.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
await page.goto(FILE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#panel-schedule.active');
// Trigger a save so the indicator is visible
await page.click('button:has-text("+ Add level")');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/cy_v10_autosave.png', fullPage: true, clip: { x: 0, y: 0, width: 1500, height: 200 } });

// Now go to Instructors and capture the new template button
await page.click('.tab:has-text("Instructors")');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/cy_v10_instructors.png', fullPage: true, clip: { x: 0, y: 0, width: 1500, height: 400 } });

await browser.close();
console.log('saved /tmp/cy_v10_*.png');
