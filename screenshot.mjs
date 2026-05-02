import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import path from 'path';
import { pathToFileURL } from 'url';
const { chromium } = pw;

const FILE = pathToFileURL(path.resolve('cy_scheduler.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto(FILE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#panel-schedule.active');

// Add a couple of instructors
await page.click('.tab:has-text("Instructors")');
for (const n of ['Dr. Alpha', 'Dr. Beta', 'Dr. Gamma', 'Dr. Delta']) {
  await page.fill('.add-form input[type="text"]', n);
  await page.click('.add-form button:has-text("Add instructor")');
  await page.waitForTimeout(60);
}

// BULK ADD demo
await page.click('.tab:has-text("Schedule")');
await page.click('button:has-text("+ Add level")');
await page.fill('.level-name-input', 'Level 3');
await page.click('.level-section button:has-text("Bulk add")');
await page.waitForTimeout(150);

await page.fill('.modal textarea',
  [
    'CECS-211, Programming Fundamentals, lecture, 3, M,W',
    'CECS-217, Computer Organisation, lecture, 3, M,W',
    'SCMT-221, Discrete Math, lecture, 3, T,R',
    'SCST-210, General Statistics, lecture, 3, U,M',
    'CECY-211, Secure Programming, lab, 1, U',
  ].join('\n'));
await page.screenshot({ path: '/tmp/cy_v3_bulk_modal.png', fullPage: true });

await page.click('.modal-foot button.btn-primary');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/cy_v3_after_bulk.png', fullPage: true });

// AUTO-ALLOCATE demo
await page.click('button:has-text("Auto-allocate")');
await page.waitForTimeout(500);
// Now assign instructors to demonstrate (auto-allocate only fills time)
const sections = await page.$$('.section-card');
for (let i = 0; i < sections.length; i++) {
  const sel = page.locator('.section-card').nth(i)
    .locator('.block').first().locator('.field:has-text("Instructor") select');
  const instrs = ['Dr. Alpha', 'Dr. Beta', 'Dr. Gamma', 'Dr. Delta', 'Dr. Alpha'];
  await sel.selectOption(instrs[i % instrs.length]);
  await page.waitForTimeout(80);
}
await page.screenshot({ path: '/tmp/cy_v3_after_auto.png', fullPage: true });

// Take a snapshot so print is enabled
await page.click('.tab:has-text("Versions")'); await page.waitForTimeout(150);
await page.fill('.snapshot-form input', 'Demo');
await page.fill('.snapshot-form textarea', 'auto-allocated baseline');
await page.click('.snapshot-form button:has-text("Save snapshot")');
await page.waitForTimeout(200);

// Switch to Grid for the print preview
await page.click('.tab:has-text("Grid")');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/cy_v3_grid_filled.png', fullPage: true });

// Print emulation
await page.emulateMedia({ media: 'print' });
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/cy_v3_print_grid.png', fullPage: true });
await page.emulateMedia({ media: 'screen' });

// Schedule print preview
await page.click('.tab:has-text("Schedule")');
await page.waitForTimeout(200);
await page.emulateMedia({ media: 'print' });
await page.screenshot({ path: '/tmp/cy_v3_print_schedule.png', fullPage: true });

await browser.close();
console.log('saved /tmp/cy_v3_*.png');
