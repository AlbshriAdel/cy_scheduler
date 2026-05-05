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
    levels: [{ id: 'L1', name: 'Level 3' }],
    rows: [{
      id: 'r1', levelId: 'L1', code: 'CECS-211', name: 'Programming',
      type: 'lecture', credits: 3, days: 'M,W',
      blocks: [
        { id: 'b1', time: '0800-0920', instr: 'Dr. Alpha', room: 'R-101', days: '', type: '' },
        { id: 'b2', time: '1100-1240', instr: 'Dr. Beta',  room: 'L-1',   days: 'U', type: 'lab' },
      ],
    }],
    instructors: [{ name: 'Dr. Alpha', minLoad: 12 }, { name: 'Dr. Beta', minLoad: 12 }],
    lang: 'en', dismissedConflicts: [],
  }));
});
await page.reload();
await page.waitForSelector('#panel-schedule.active');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/cy_v11_perblock.png', fullPage: true });
await browser.close();
console.log('saved /tmp/cy_v11_perblock.png');
