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
      { id: 'r1', levelId: 'L1', code: 'CECY-211', name: 'البرمجة الأمنة',
        type: 'lecture', credits: 3, days: 'M,W',
        blocks: [
          // intentional whitespace to demonstrate the tolerance fix
          { id: 'b1', time: '0800-0920', instr: 'د.محمد الاحمدي ', room: 'R-101', days: '', type: '' },
        ],
      },
      { id: 'r2', levelId: 'L1', code: 'CECY-381', name: 'أساسيات الأمن السيبراني',
        type: 'lecture', credits: 3, days: 'T,R',
        blocks: [
          { id: 'b2', time: '1100-1220', instr: ' د.محمد الاحمدي', room: 'R-103', days: '', type: '' },
        ],
      },
      { id: 'r3', levelId: 'L2', code: 'CECN-382', name: 'مقدمة شبكات الحاسب',
        type: 'lab', credits: 1, days: 'U',
        blocks: [
          { id: 'b3', time: '0900-1040', instr: 'د.محمد الاحمدي', room: 'L-2', days: '', type: '' },
        ],
      },
      { id: 'r4', levelId: 'L1', code: 'CECS-211', name: 'Programming',
        type: 'lecture', credits: 3, days: 'M,W',
        blocks: [
          { id: 'b4', time: '1300-1450', instr: 'Dr. Other', room: 'R-101', days: '', type: '' },
        ],
      },
    ],
    instructors: [{ name: 'د.محمد الاحمدي', minLoad: 12 }, { name: 'Dr. Other', minLoad: 12 }],
    lang: 'ar', dismissedConflicts: [],
  }));
});
await page.reload();
await page.waitForSelector('#panel-schedule.active');
await page.click('.tab:has-text("الشبكة")');
await page.waitForTimeout(300);
// Pick the instructor in the dropdown
await page.selectOption('#fInstr', 'د.محمد الاحمدي');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/cy_v13_instructor.png', fullPage: true });
await browser.close();
console.log('saved /tmp/cy_v13_instructor.png');
