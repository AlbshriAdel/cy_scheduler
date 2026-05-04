import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import path from 'path';
import { pathToFileURL } from 'url';
const { chromium } = pw;

const FILE = pathToFileURL(path.resolve('cy_scheduler.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto(FILE);
await page.evaluate(() => {
  localStorage.clear();
  // Seed state with 3 conflicts
  const sec = (id, code, instr, room, time = '0800-0920') => ({
    id, levelId: 'L1', code, name: code, type: 'lecture',
    credits: 3, days: 'M',
    blocks: [{ id: id + '_b1', time, instr, room }],
  });
  localStorage.setItem('cy_sched_state_v3', JSON.stringify({
    levels: [{ id: 'L1', name: 'Level 3' }],
    rows: [
      sec('r1', 'CECS-211', 'Dr. Alpha', 'R-101'),
      sec('r2', 'CECS-217', 'Dr. Alpha', 'R-101'),  // R6 + R7
      sec('r3', 'CECS-211', 'Dr. Beta',  'R-103'),  // R5 with r1 (same code)
    ],
    instructors: [
      { name: 'Dr. Alpha', minLoad: 12 },
      { name: 'Dr. Beta',  minLoad: 12 },
    ],
    lang: 'en',
    dismissedConflicts: [],
  }));
});
await page.reload();
await page.waitForSelector('#panel-schedule.active');
await page.click('.tab:has-text("Conflicts")');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/cy_v7_conflicts_active.png', fullPage: true });

// Dismiss the R7 conflict
const r7issue = page.locator('.issue:has-text("R7")').first();
await r7issue.locator('button:has-text("Dismiss")').click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/cy_v7_conflicts_after_dismiss.png', fullPage: true });

await browser.close();
console.log('saved /tmp/cy_v7_*.png');
