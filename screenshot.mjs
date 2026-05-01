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

// Build representative schedule with conflicts
async function fillSection(sec, code, name, days, time, instr, room) {
  await sec.locator('.field:has-text("Code") input').fill(code);
  await sec.locator('.field:has-text("Name") input').fill(name);
  await sec.locator('.field:has-text("Credits") input').fill('3');
  await sec.locator('.field:has-text("Days") select').selectOption(days);
  const b = sec.locator('.block').first();
  await b.locator('.field:has-text("Time") select').selectOption(time);
  await b.locator('.field:has-text("Instructor") select').selectOption(instr);
  await b.locator('.field:has-text("Room") input').fill(room);
}

// Add instructors
await page.click('.tab:has-text("Instructors")');
for (const n of ['Dr. Alpha', 'Dr. Beta', 'Dr. Gamma']) {
  await page.fill('.add-form input[type="text"]', n);
  await page.click('.add-form button:has-text("Add instructor")');
  await page.waitForTimeout(80);
}

await page.click('.tab:has-text("Schedule")');
await page.click('button:has-text("+ Add level")');
await page.fill('.level-name-input', 'Level 3');

// Section 1
await page.click('.level-section button:has-text("+ Add section")');
const s1 = page.locator('.section-card').first();
await fillSection(s1, 'CECS-211', 'Programming Fundamentals', 'M,W', '0800-0920', 'Dr. Alpha', 'R-101');
await page.click('.section-card button:has-text("+ Add block")');
const s1b2 = page.locator('.section-card .block').nth(1);
await s1b2.locator('.field:has-text("Time") select').selectOption('0930-1050');
await s1b2.locator('.field:has-text("Instructor") select').selectOption('Dr. Beta');
await s1b2.locator('.field:has-text("Room") input').fill('R-102');

// Section 2 — same time, same instructor → R6 conflict, same level → R5
await page.click('.level-section button:has-text("+ Add section")');
const s2 = page.locator('.section-card').nth(1);
await fillSection(s2, 'CECS-217', 'Computer Organisation', 'M,W', '0800-0920', 'Dr. Alpha', 'R-103');

// Section 3 — same room as section 1 block 1 → R7
await page.click('.level-section button:has-text("+ Add section")');
const s3 = page.locator('.section-card').nth(2);
await fillSection(s3, 'SCMT-221', 'Discrete Math', 'T,R', '1100-1220', 'Dr. Gamma', 'R-201');

await page.waitForTimeout(500);

// Hover the conflict pill to reveal tooltip in screenshot via title attribute
await page.screenshot({ path: '/tmp/cy_v2_schedule.png', fullPage: true });

await page.click('.tab:has-text("Grid")');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/cy_v2_grid_all.png', fullPage: true });

// Filter by instructor
await page.selectOption('.grid-filters #fInstr', 'Dr. Alpha');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/cy_v2_grid_instr.png', fullPage: true });

// Conflicts panel
await page.click('.tab:has-text("Conflicts")');
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/cy_v2_conflicts.png', fullPage: true });

await browser.close();
console.log('saved /tmp/cy_v2_*.png');
