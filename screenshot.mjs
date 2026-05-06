import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import path from 'path';
import { pathToFileURL } from 'url';
const { chromium } = pw;

const FILE = pathToFileURL(path.resolve('cy_scheduler.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
await page.goto(FILE);
await page.evaluate(() => {
  localStorage.setItem('cy_sched_state_v3', JSON.stringify({
    levels: [{ id: 'L1', name: 'Level 3' }],
    rows: [
      { id: 'r1', levelId: 'L1', code: 'CECY-211', name: 'Secure Programming',
        type: 'lecture', credits: 3, days: 'M,W',
        blocks: [{ id: 'b1', time: '0800-0920', instr: 'Dr. Alpha', room: 'R-101', days: '', type: '' }] },
      { id: 'r2', levelId: 'L1', code: 'CECY-381', name: 'Cybersec Foundations',
        type: 'lecture', credits: 3, days: 'T,R',
        blocks: [{ id: 'b2', time: '1100-1220', instr: 'Dr. Alpha', room: 'R-103', days: '', type: '' }] },
      { id: 'r3', levelId: 'L1', code: 'CECN-382', name: 'Computer Networks',
        type: 'lab', credits: 1, days: 'U',
        blocks: [{ id: 'b3', time: '0900-1040', instr: 'Dr. Beta', room: 'L-2', days: '', type: '' }] },
    ],
    instructors: [{ name: 'Dr. Alpha', minLoad: 12 }, { name: 'Dr. Beta', minLoad: 12 }],
    lang: 'en', dismissedConflicts: [],
  }));
});
await page.reload();
await page.waitForSelector('#panel-schedule.active');
await page.click('.tab:has-text("Versions")');
await page.fill('.snapshot-form input', 'demo');
await page.click('.snapshot-form button:has-text("Save snapshot")');
await page.waitForTimeout(200);
// Override window.print to prevent the dialog AND prevent cleanup of the
// container so we can screenshot it.
await page.evaluate(() => {
  window.print = () => {
    // Freeze: never let setTimeout that follows print remove our DOM
    window.setTimeout = () => {};
  };
});
await page.click('#btnPrint');
await page.waitForTimeout(150);
await page.click('.menu-item:has-text("Print all instructor schedules")');
await page.waitForTimeout(200);
await page.emulateMedia({ media: 'print' });
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/cy_v14_print_all.png', fullPage: true });
await browser.close();
console.log('saved /tmp/cy_v14_print_all.png');
