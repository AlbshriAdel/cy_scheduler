import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import path from 'path';
import { pathToFileURL } from 'url';
const { chromium } = pw;

const FILE = pathToFileURL(path.resolve('cy_scheduler.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(FILE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#panel-schedule.active');

// Build a small representative schedule
await page.click('button:has-text("+ Add level")');
await page.waitForTimeout(100);
await page.fill('.level-name-input', 'Level 3');
await page.click('.level-section button:has-text("+ Add section")');
await page.waitForTimeout(100);
const sec = page.locator('.section-card').first();
await sec.locator('.field:has-text("Code") input').fill('CECS-211');
await sec.locator('.field:has-text("Name") input').fill('Programming Fundamentals');
await sec.locator('.field:has-text("Credits") input').fill('3');
await sec.locator('.field:has-text("Days") select').selectOption('M,W');
await sec.locator('.block').first().locator('.field:has-text("Time") select').selectOption('0800-0920');
await sec.locator('.block').first().locator('.field:has-text("Room") input').fill('R-101');
await page.click('.section-card button:has-text("+ Add block")');
await page.waitForTimeout(100);
const blocks = page.locator('.section-card .block');
await blocks.nth(1).locator('.field:has-text("Time") select').selectOption('0930-1050');
await blocks.nth(1).locator('.field:has-text("Room") input').fill('R-102');
await page.click('.level-section button:has-text("+ Add section")');
await page.waitForTimeout(100);
const sec2 = page.locator('.section-card').nth(1);
await sec2.locator('.field:has-text("Code") input').fill('CECS-217');
await sec2.locator('.field:has-text("Name") input').fill('Computer Organisation');
await sec2.locator('.field:has-text("Credits") input').fill('3');
await sec2.locator('.field:has-text("Days") select').selectOption('M,W');
await sec2.locator('.block').first().locator('.field:has-text("Time") select').selectOption('0800-0920');
await sec2.locator('.block').first().locator('.field:has-text("Room") input').fill('R-101'); // collide for R7

await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/cy_screenshot_schedule.png', fullPage: true });

await page.click('.tab:has-text("Conflicts")');
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/cy_screenshot_conflicts.png', fullPage: true });

await browser.close();
console.log('saved /tmp/cy_screenshot_schedule.png and /tmp/cy_screenshot_conflicts.png');
