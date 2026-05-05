import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import path from 'path';
import { pathToFileURL } from 'url';
const { chromium } = pw;

const FILE = pathToFileURL(path.resolve('cy_scheduler.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(FILE);
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('cy_sched_state_v3', JSON.stringify({
    levels: [{ id: 'L1', name: 'Level 3' }],
    rows: [
      {
        id: 'r1', levelId: 'L1', code: 'CECS-211', name: 'Programming Fundamentals',
        type: 'lecture', credits: 3, days: 'M,W',
        blocks: [
          { id: 'b1', time: '0800-0920', instr: 'Dr. Alpha', room: 'R-101', days: '' },
          { id: 'b2', time: '0930-1050', instr: 'Dr. Beta',  room: 'R-102', days: 'T,R' },
        ],
      },
      {
        id: 'r2', levelId: 'L1', code: 'CECS-211', name: 'Programming Fundamentals',
        type: 'lab', credits: 1, days: 'U',
        blocks: [
          { id: 'b3', time: '0900-1040', instr: 'Dr. Alpha', room: 'L-1', days: '' },
        ],
      },
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
await page.waitForTimeout(300);

// First screenshot: all expanded
await page.screenshot({ path: '/tmp/cy_v8_expanded.png', fullPage: true });

// Click first block to collapse
await page.locator('.block .block-head.clickable').first().click();
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/cy_v8_collapsed.png', fullPage: true });

await browser.close();
console.log('saved /tmp/cy_v8_*.png');
