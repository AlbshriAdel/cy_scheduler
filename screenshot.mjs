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
    levels: [{ id: 'L1', name: 'Level 3' }, { id: 'L2', name: 'Level 4' }],
    rows: [
      // Three different punctuation variants of the same instructor name
      { id: 'r1', levelId: 'L1', code: 'CECY-211', name: 'البرمجة الأمنة',
        type: 'lecture', credits: 3, days: 'M,W',
        blocks: [{ id: 'b1', time: '0800-0920', instr: 'د.عادل البشري',  room: 'R-101', days: '', type: '' }] },
      { id: 'r2', levelId: 'L1', code: 'CECY-381', name: 'أساسيات الأمن',
        type: 'lecture', credits: 3, days: 'T,R',
        blocks: [{ id: 'b2', time: '1100-1220', instr: 'د. عادل البشري', room: 'R-103', days: '', type: '' }] },
      { id: 'r3', levelId: 'L2', code: 'CECN-382', name: 'مقدمة الشبكات',
        type: 'lab', credits: 1, days: 'U',
        blocks: [{ id: 'b3', time: '0900-1040', instr: 'د .عادل البشري ', room: 'L-2', days: '', type: '' }] },
    ],
    instructors: [{ name: 'د.عادل البشري', minLoad: 12 }],
    lang: 'ar', dismissedConflicts: [],
  }));
});
await page.reload();
await page.waitForSelector('#panel-schedule.active');
await page.click('.tab:has-text("الشبكة")');
await page.waitForTimeout(300);
await page.selectOption('#fInstr', 'د.عادل البشري');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/cy_v15_punct.png', fullPage: true });
await browser.close();
console.log('saved /tmp/cy_v15_punct.png');
