import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import path from 'path';
import { pathToFileURL } from 'url';
const { chromium } = pw;

const FILE = pathToFileURL(path.resolve('cy_scheduler.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
await page.goto(FILE);
await page.evaluate(() => {
  localStorage.setItem('cy_sched_state_v3', JSON.stringify({
    levels: [
      { id: 'L1', name: 'Level 3' },
      { id: 'L2', name: 'Level 4' },
    ],
    rows: [
      {
        id: 'r1', levelId: 'L1', code: 'ELPR-220',
        name: 'English Academic Writing',
        type: 'lecture', credits: 2, days: 'U',
        blocks: [
          { id: 'b1', time: '1900-2040', instr: 'Dr. Alpha', room: 'R-101', days: '' },
          { id: 'b2', time: '1900-2040', instr: '', room: '', days: '' },
        ],
      },
      {
        id: 'r2', levelId: 'L1', code: 'CECS-211',
        name: 'Programming Fundamentals',
        type: 'lecture', credits: 3, days: 'M,W',
        blocks: [
          { id: 'b3', time: '0800-0920', instr: 'Dr. Alpha', room: 'R-102', days: '' },
        ],
      },
      {
        id: 'r3', levelId: 'L2', code: 'CECS-282',
        name: 'Data Structures',
        type: 'lecture', credits: 3, days: 'M,W',
        blocks: [
          { id: 'b4', time: '0930-1050', instr: 'Dr. Beta', room: 'R-103', days: '' },
        ],
      },
    ],
    instructors: [
      { name: 'Dr. Alpha', minLoad: 12 },
      { name: 'Dr. Beta',  minLoad: 12 },
    ],
    lang: 'en', dismissedConflicts: [],
  }));
});
await page.reload();
await page.waitForSelector('#panel-schedule.active');
await page.waitForTimeout(300);

// Collapse the second section (Programming Fundamentals) for the screenshot
await page.locator('.section-head.clickable').nth(1).click();
await page.waitForTimeout(150);
// Collapse Level 4 entirely
await page.locator('.level-head.clickable').nth(1).click();
await page.waitForTimeout(150);

await page.screenshot({ path: '/tmp/cy_v9_collapse.png', fullPage: true });
await browser.close();
console.log('saved /tmp/cy_v9_collapse.png');
