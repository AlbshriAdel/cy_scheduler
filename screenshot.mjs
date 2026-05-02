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

// Add a couple instructors
await page.click('.tab:has-text("Instructors")');
for (const n of ['Dr. Alpha', 'Dr. Beta']) {
  await page.fill('.add-form input[type="text"]', n);
  await page.click('.add-form button:has-text("Add instructor")');
  await page.waitForTimeout(60);
}
// Schedule
await page.click('.tab:has-text("Schedule")');
await page.click('button:has-text("+ Add level")');
await page.fill('.level-name-input', 'Level 3');
await page.click('.level-section button:has-text("Bulk add")');
await page.waitForTimeout(150);
await page.fill('.modal textarea',
  ['CECS-217, تنظيم وبنيان الحاسب, lecture, 3, M,W',
   'SCMT-221, جبر خطي, lecture, 3, M,W'].join('\n'));
await page.click('.modal-foot button.btn-primary');
await page.waitForTimeout(300);

// Configure CECS-217 with two blocks
const s1 = page.locator('.section-card').nth(0);
await s1.locator('.block').first().locator('.field:has-text("Time") select').selectOption('0930-1050');
await page.click('.section-card button:has-text("+ Add block")');
await page.waitForTimeout(200);
await page.locator('.section-card').nth(0).locator('.block').nth(1)
  .locator('.field:has-text("Time") select').selectOption('1100-1220');
// SCMT-221 single block at 1100-1220 — same level, same time → still no conflict
const s2 = page.locator('.section-card').nth(1);
await s2.locator('.block').first().locator('.field:has-text("Time") select').selectOption('1100-1220');

await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/cy_v6_schedule.png', fullPage: true });

await browser.close();
console.log('saved /tmp/cy_v6_schedule.png');
