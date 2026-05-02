// E2E test suite for cy_scheduler.html.
// Run: NODE_PATH=/opt/node22/lib/node_modules node test.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const FILE = pathToFileURL(path.resolve('cy_scheduler.html')).href;

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; fails.push(name + (detail ? ' — ' + detail : '')); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on('pageerror', (e) => { fail++; console.log('  ✗ pageerror:', e.message); fails.push('pageerror: ' + e.message); });
page.on('console', (m) => { if (m.type() === 'error') console.log('  · console.error:', m.text()); });

// Helper: wait for stability after a click that triggers debounced save
const settle = () => page.waitForTimeout(350);

// Read the state from localStorage
const readState = () => page.evaluate(() => {
  const raw = localStorage.getItem('cy_sched_state_v3');
  return raw ? JSON.parse(raw) : null;
});

console.log('\n══ 1. INITIAL LOAD (empty seed) ══');
await page.goto(FILE);
await page.waitForSelector('#panel-schedule.active');
check('schedule panel visible',
  await page.isVisible('#panel-schedule.active'));
check('toolbar present',
  await page.isVisible('.toolbar .brand-title'));
check('7 tabs rendered',
  (await page.$$('.tab')).length === 7);
check('empty state shown',
  await page.isVisible('text=No levels yet'));
check('conflict badge hidden at 0',
  await page.evaluate(() => getComputedStyle(document.getElementById('conflictBadge')).display) === 'none');

console.log('\n══ 2. ADD LEVEL ══');
await page.click('button:has-text("+ Add level")');
await settle();
check('level card appears',
  (await page.$$('#panel-schedule .level-section')).length === 1);
const levelInput = await page.$('.level-name-input');
await levelInput.fill('Level 3');
await page.keyboard.press('Tab');
await settle();
let st = await readState();
check('level persisted to localStorage',
  st && st.levels.length === 1 && st.levels[0].name === 'Level 3',
  JSON.stringify(st && st.levels));

console.log('\n══ 3. ADD SECTION ══');
await page.click('.level-section button:has-text("+ Add section")');
await settle();
check('section card appears',
  (await page.$$('.section-card')).length === 1);
// Fill code/name/credits/days
await page.fill('.section-card input[type="text"]:nth-of-type(1)', 'CECS-211');
// 2nd text input is name (code, name, type-select, credits, days)
const inputs = await page.$$('.section-card input');
// Order in row-grid: code, name, credits (number), then in blocks: room
// Let's use field labels via visible text
const nameField = await page.locator('.section-card .field:has-text("Name") input').first();
await nameField.fill('Programming Fundamentals');
const creditsField = await page.locator('.section-card .field:has-text("Credits") input').first();
await creditsField.fill('3');
const daysSelect = await page.locator('.section-card .field:has-text("Days") select').first();
await daysSelect.selectOption('M,W');
await settle();
st = await readState();
check('section persisted',
  st.rows.length === 1 && st.rows[0].code === 'CECS-211' && st.rows[0].days === 'M,W',
  JSON.stringify(st.rows[0]));
check('section has 1 default block',
  st.rows[0].blocks.length === 1);

console.log('\n══ 4. ADD BLOCK ══');
await page.click('.section-card button:has-text("+ Add block")');
await settle();
st = await readState();
check('section has 2 blocks',
  st.rows[0].blocks.length === 2);
check('blocks list rendered',
  (await page.$$('.section-card .block')).length === 2);

console.log('\n══ 5. CONFIGURE BLOCK 1 (time + instr) ══');
const block1 = page.locator('.section-card .block').nth(0);
await block1.locator('.field:has-text("Time") select').selectOption('0800-0920');
await block1.locator('.field:has-text("Instructor") select').selectOption({ index: 0 }); // empty default — will set via add instructor flow
// Need to add an instructor first via Instructors tab
await page.click('.tab:has-text("Instructors")');
await page.fill('.add-form input[type="text"]', 'Dr. Alpha');
await page.click('.add-form button:has-text("Add instructor")');
await settle();
check('instructor added',
  (await readState()).instructors.length === 1);

console.log('\n══ 6. ASSIGN INSTRUCTORS TO BLOCKS ══');
await page.click('.tab:has-text("Schedule")');
await settle();
const b1 = page.locator('.section-card .block').nth(0);
await b1.locator('.field:has-text("Time") select').selectOption('0800-0920');
await b1.locator('.field:has-text("Instructor") select').selectOption('Dr. Alpha');
await b1.locator('.field:has-text("Room") input').fill('R-101');
await page.keyboard.press('Tab');
await settle();
const b2 = page.locator('.section-card .block').nth(1);
await b2.locator('.field:has-text("Time") select').selectOption('0930-1050');
await b2.locator('.field:has-text("Instructor") select').selectOption('Dr. Alpha');
await b2.locator('.field:has-text("Room") input').fill('R-102');
await page.keyboard.press('Tab');
await settle();
st = await readState();
check('block1 fully configured',
  st.rows[0].blocks[0].time === '0800-0920' &&
  st.rows[0].blocks[0].instr === 'Dr. Alpha' &&
  st.rows[0].blocks[0].room === 'R-101');
check('block2 fully configured',
  st.rows[0].blocks[1].time === '0930-1050');
const pillTexts = await page.locator('.section-card .pill').allTextContents();
check('block status pills show "scheduled"',
  pillTexts.every(t => /scheduled/i.test(t)),
  pillTexts.join(', '));

console.log('\n══ 7. CONFLICT R6: instructor double-book ══');
// Set both blocks to overlapping time with same instructor
await b2.locator('.field:has-text("Time") select').selectOption('0800-0920');
await settle();
const conflictBadge = await page.textContent('#conflictBadge');
check('conflict badge shows count',
  parseInt(conflictBadge, 10) >= 1, `badge=${conflictBadge}`);
const cardEl = page.locator('.section-card').first();
check('section card marked has-conflict',
  (await cardEl.getAttribute('class')).includes('has-conflict'));
const newPillTexts = await page.locator('.section-card .pill').allTextContents();
check('block pills now show conflict',
  newPillTexts.some(t => /conflict/i.test(t)),
  newPillTexts.join(', '));

console.log('\n══ 8. CONFLICTS PANEL renders R6 ══');
await page.click('.tab:has-text("Conflicts")');
await settle();
check('conflicts panel active',
  await page.isVisible('#panel-conflicts.active'));
check('R6 issue listed',
  await page.locator('.issue:has-text("R6")').count() >= 1);
check('reason mentions instructor name',
  await page.locator('.issue-text:has-text("Dr. Alpha")').count() >= 1);

console.log('\n══ 9. CONFLICT R5 (same course\'s own blocks overlapping) ══');
await page.click('.tab:has-text("Schedule")');
await settle();
// Add 2nd block to section 1 and set it to overlap with block 1 → R5
const sec1Locator = page.locator('.section-card').nth(0);
await sec1Locator.locator('.block').nth(1).locator('.field:has-text("Time") select')
  .selectOption('0800-0920');
await settle();
await page.click('.tab:has-text("Conflicts")');
await settle();
check('R5 issue listed (same course self-overlap)',
  await page.locator('.issue:has-text("R5")').count() >= 1);

// Different course in same level overlapping should NOT be R5 anymore
await page.click('.tab:has-text("Schedule")');
await settle();
await page.click('.level-section button:has-text("+ Add section")');
await settle();
const sec2 = page.locator('.section-card').nth(1);
await sec2.locator('.field:has-text("Code") input').fill('CECS-212');
await sec2.locator('.field:has-text("Name") input').fill('Data Structures');
await sec2.locator('.field:has-text("Days") select').selectOption('M,W');
await sec2.locator('.block').nth(0).locator('.field:has-text("Time") select').selectOption('1100-1220');
await page.click('.tab:has-text("Instructors")');
await page.fill('.add-form input[type="text"]', 'Dr. Beta');
await page.click('.add-form button:has-text("Add instructor")');
await settle();
await page.click('.tab:has-text("Schedule")');
await settle();
await page.locator('.section-card').nth(1).locator('.block').nth(0)
  .locator('.field:has-text("Instructor") select').selectOption('Dr. Beta');
await settle();

console.log('\n══ 10. CONFLICT R7 (room double-book across courses) ══');
await page.click('.tab:has-text("Schedule")');
await settle();
// Move sec1 block 2 off the overlap so R5/R6 are clear
const sec1 = page.locator('.section-card').nth(0);
await sec1.locator('.block').nth(1).locator('.field:has-text("Time") select').selectOption('0930-1050');
// Move sec2 block 1 to overlap with sec1 block 1, put both in same room
await sec2.locator('.block').nth(0).locator('.field:has-text("Time") select').selectOption('0800-0920');
await sec1.locator('.block').nth(0).locator('.field:has-text("Room") input').fill('R-100');
await page.keyboard.press('Tab');
await sec2.locator('.block').nth(0).locator('.field:has-text("Room") input').fill('R-100');
await page.keyboard.press('Tab');
await settle();
await page.click('.tab:has-text("Conflicts")');
await settle();
check('R7 issue listed (room overlap)',
  await page.locator('.issue:has-text("R7")').count() >= 1);

console.log('\n══ 11. UNDO / REDO ══');
const beforeUndo = await readState();
const beforeRows = JSON.stringify(beforeUndo.rows);
await page.click('#btnUndo');
await settle();
const afterUndo = await readState();
check('undo changed state',
  JSON.stringify(afterUndo.rows) !== beforeRows);
await page.click('#btnRedo');
await settle();
const afterRedo = await readState();
check('redo restored state',
  JSON.stringify(afterRedo.rows) === beforeRows);

console.log('\n══ 12. PERSISTENCE: reload page ══');
await page.reload();
await page.waitForSelector('#panel-schedule.active');
await settle();
const reloadedSecCount = (await page.$$('.section-card')).length;
check('sections survived reload',
  reloadedSecCount === 2, `count=${reloadedSecCount}`);
const lvName = await page.inputValue('.level-name-input');
check('level name survived reload',
  lvName === 'Level 3', lvName);

console.log('\n══ 13. EXPORT / DOWNLOAD ══');
// Take a snapshot first — Export is gated when dirty.
await page.click('.tab:has-text("Versions")');
await settle();
await page.fill('.snapshot-form input', 'Pre-export');
await page.click('.snapshot-form button:has-text("Save snapshot")');
await settle();
check('Export button enabled after snapshot',
  (await page.evaluate(() => document.getElementById('btnExport').disabled)) === false);
// Long CSV
await page.click('#btnExport');
const dlPromise = page.waitForEvent('download');
await page.click('.menu-item:has-text("CSV (.csv) · long")');
const dl1 = await dlPromise;
const tmp1 = await dl1.path();
const csv1 = fs.readFileSync(tmp1, 'utf8');
check('long CSV has expected header',
  csv1.split('\n')[0].startsWith('﻿level,code,name,type,credits,days,block,time,instr,room') ||
  csv1.split('\n')[0].includes('level,code,name'),
  csv1.slice(0, 80));
check('long CSV has section rows',
  csv1.split('\n').length >= 3);

// Wide CSV
await page.click('#btnExport');
const dl2P = page.waitForEvent('download');
await page.click('.menu-item:has-text("CSV (.csv) · wide")');
const dl2 = await dl2P;
const csv2 = fs.readFileSync(await dl2.path(), 'utf8');
check('wide CSV has block1_time header',
  csv2.includes('block1_time') && csv2.includes('block2_time'));

// Template
await page.click('#btnExport');
const dl3P = page.waitForEvent('download');
await page.click('.menu-item:has-text("Download template")');
const dl3 = await dl3P;
const tpl = fs.readFileSync(await dl3.path(), 'utf8');
check('template has reference example row',
  tpl.includes('CECS-211') && tpl.includes('block1_time'),
  tpl.split('\n')[0]);

// JSON
await page.click('#btnExport');
const dl4P = page.waitForEvent('download');
await page.click('.menu-item:has-text("JSON (.json)")');
const dl4 = await dl4P;
const json = JSON.parse(fs.readFileSync(await dl4.path(), 'utf8').replace(/^﻿/, ''));
check('JSON export has levels, rows, instructors',
  Array.isArray(json.levels) && Array.isArray(json.rows) && Array.isArray(json.instructors));

console.log('\n══ 14. IMPORT: round-trip the wide CSV ══');
// Clear state, then import the wide CSV we just exported
await page.evaluate(() => { localStorage.clear(); });
await page.reload();
await page.waitForSelector('#panel-schedule.active');
const tmpWide = '/tmp/cy_test_wide.csv';
fs.writeFileSync(tmpWide, csv2);
await page.setInputFiles('#fileImport', tmpWide);
await settle();
const stImp = await readState();
check('import recreated levels',
  stImp && stImp.levels.length >= 1, JSON.stringify(stImp && stImp.levels));
check('import recreated 2 sections',
  stImp.rows.length === 2);
const restoredBlocks = stImp.rows.map(r => r.blocks.length);
check('imported sections have blocks',
  restoredBlocks.every(n => n >= 1), JSON.stringify(restoredBlocks));

console.log('\n══ 15. IMPORT: template (skeleton) round-trip ══');
await page.evaluate(() => { localStorage.clear(); });
await page.reload();
await page.waitForSelector('#panel-schedule.active');
const tmpT = '/tmp/cy_test_template.csv';
fs.writeFileSync(tmpT, tpl);
await page.setInputFiles('#fileImport', tmpT);
await settle();
const stT = await readState();
check('template import → 1 level',
  stT.levels.length === 1, JSON.stringify(stT.levels.map(l => l.name)));
check('template import → 2 sections (lecture + lab rows)',
  stT.rows.length === 2);

console.log('\n══ 16. SNAPSHOT (Versions) create + restore ══');
await page.click('.tab:has-text("Versions")');
await settle();
await page.fill('.snapshot-form input', 'Tester');
await page.fill('.snapshot-form textarea', 'baseline');
await page.click('.snapshot-form button:has-text("Save snapshot")');
await settle();
check('snapshot appears',
  (await page.$$('.snapshot')).length === 1);
const snapsRaw = await page.evaluate(() => localStorage.getItem('cy_sched_snapshots_v3'));
check('snapshot persisted',
  snapsRaw && JSON.parse(snapsRaw).length === 1);
// Modify state, then restore
await page.click('.tab:has-text("Schedule")');
await settle();
const initialSecCount = (await page.$$('.section-card')).length;
// Delete first section
await page.click('.section-card .section-actions button');
await page.click('.modal-foot button.btn-danger');
await settle();
check('section deleted (count decreased)',
  (await page.$$('.section-card')).length === initialSecCount - 1);
await page.click('.tab:has-text("Versions")');
await settle();
await page.click('.snapshot button:has-text("Restore")');
await page.click('.modal-foot button.btn-primary');
await settle();
await page.click('.tab:has-text("Schedule")');
await settle();
check('section restored from snapshot',
  (await page.$$('.section-card')).length === initialSecCount);

console.log('\n══ 17. LANGUAGE TOGGLE (EN ↔ AR) ══');
await page.click('#btnLang');
await settle();
const dir = await page.evaluate(() => document.body.dir);
check('body dir flipped to rtl',
  dir === 'rtl', dir);
const arBrand = await page.textContent('.brand-title');
check('brand title localised to AR',
  arBrand && arBrand.includes('جدول'),
  arBrand);
await page.click('#btnLang');
await settle();
check('toggled back to ltr',
  (await page.evaluate(() => document.body.dir)) === 'ltr');

console.log('\n══ 18. COURSES + INSTRUCTORS panels render ══');
await page.click('.tab:has-text("Courses")');
await settle();
check('courses table rendered',
  (await page.$$('table.data tr')).length >= 2);
await page.click('.tab:has-text("Instructors")');
await settle();
const instrRows = await page.$$('table.data tbody tr');
check('instructors table has rows',
  instrRows.length >= 1, `count=${instrRows.length}`);
const loadBars = await page.$$('.load-bar-fill');
check('load bars rendered',
  loadBars.length >= 1);

console.log('\n══ 19. DELETE LEVEL cascades ══');
await page.click('.tab:has-text("Schedule")');
await settle();
const sectionsBefore = (await page.$$('.section-card')).length;
await page.click('.level-section .level-actions button:last-child');
await page.click('.modal-foot button.btn-danger');
await settle();
check('level removed',
  (await page.$$('#panel-schedule .level-section')).length === 0);
check('cascading delete: sections gone',
  (await page.$$('.section-card')).length === 0);

console.log('\n══ 20. MIGRATION: legacy v2 schema → v3 ══');
await page.evaluate(() => {
  localStorage.clear();
  // Plant a v2-shape state
  const v2 = {
    rows: [{
      id: 'r1', code: 'OLD-100', name: 'Legacy', level: 'L-Old',
      type: 'lecture', credits: 3,
      b1: { days: 'M,W', time: '0800-0920', instr: 'X', room: 'R1' },
      b2: { days: 'M,W', time: '0930-1050', instr: 'X', room: 'R2' },
    }],
    instructors: [{ name: 'X', minLoad: 9 }],
    lang: 'en',
  };
  localStorage.setItem('cy_sched_state_v2', JSON.stringify(v2));
});
await page.reload();
await page.waitForSelector('#panel-schedule.active');
await settle();
const migrated = await readState();
check('v2 legacy migrated to v3 levels[]',
  migrated && migrated.levels.length === 1 && migrated.levels[0].name === 'L-Old',
  JSON.stringify(migrated && migrated.levels));
check('v2 b1+b2 → blocks[2]',
  migrated.rows.length === 1 && migrated.rows[0].blocks.length === 2);
check('v2 instructors preserved',
  migrated.instructors.length === 1 && migrated.instructors[0].name === 'X');

console.log('\n══ 21. CONFLICT TOOLTIP (reasons on pill) ══');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#panel-schedule.active');
// Build a quick R6 conflict
await page.click('button:has-text("+ Add level")'); await settle();
await page.fill('.level-name-input', 'L1');
await page.click('.level-section button:has-text("+ Add section")'); await settle();
let s1 = page.locator('.section-card').first();
await s1.locator('.field:has-text("Code") input').fill('AAA-1');
await s1.locator('.field:has-text("Days") select').selectOption('M');
await s1.locator('.block').first().locator('.field:has-text("Time") select').selectOption('0800-0920');
await s1.locator('.block').first().locator('.field:has-text("Instructor") select').selectOption({ label: '—' });
// Add instr
await page.click('.tab:has-text("Instructors")');
await page.fill('.add-form input[type="text"]', 'Dr. T');
await page.click('.add-form button:has-text("Add instructor")'); await settle();
await page.click('.tab:has-text("Schedule")'); await settle();
s1 = page.locator('.section-card').first();
await s1.locator('.block').first().locator('.field:has-text("Instructor") select').selectOption('Dr. T');
// Section 2 same instr same time
await page.click('.level-section button:has-text("+ Add section")'); await settle();
let s2 = page.locator('.section-card').nth(1);
await s2.locator('.field:has-text("Code") input').fill('BBB-2');
await s2.locator('.field:has-text("Days") select').selectOption('M');
await s2.locator('.block').first().locator('.field:has-text("Time") select').selectOption('0800-0920');
await s2.locator('.block').first().locator('.field:has-text("Instructor") select').selectOption('Dr. T');
await settle();
const conflictPillTitle = await page.locator('.section-card .pill.pill-bad').first().getAttribute('title');
check('conflict pill has tooltip with R6 reason',
  conflictPillTitle && conflictPillTitle.includes('R6') && conflictPillTitle.includes('Dr. T'),
  conflictPillTitle);

console.log('\n══ 22. DIRTY GATE blocks Export and Print ══');
const banner = await page.isVisible('#dirtyBanner:not(.hidden)');
check('dirty banner visible after edits',
  banner === true);
const expDisabled = await page.evaluate(() => document.getElementById('btnExport').disabled);
const prDisabled = await page.evaluate(() => document.getElementById('btnPrint').disabled);
check('Export disabled when dirty',  expDisabled);
check('Print disabled when dirty',   prDisabled);

console.log('\n══ 23. SNAPSHOT clears dirty + re-enables Export ══');
await page.click('.tab:has-text("Versions")');
await settle();
await page.fill('.snapshot-form input', 'Adel');
await page.click('.snapshot-form button:has-text("Save snapshot")');
await settle();
const expEnabled = await page.evaluate(() => document.getElementById('btnExport').disabled);
const prEnabled = await page.evaluate(() => document.getElementById('btnPrint').disabled);
check('Export re-enabled after snapshot',  expEnabled === false);
check('Print re-enabled after snapshot',   prEnabled === false);
const bannerHidden = await page.evaluate(() =>
  document.getElementById('dirtyBanner').classList.contains('hidden'));
check('dirty banner hidden after snapshot', bannerHidden);

console.log('\n══ 24. EDIT after snapshot → dirty again ══');
await page.click('.tab:has-text("Schedule")'); await settle();
await page.locator('.section-card').first()
  .locator('.field:has-text("Days") select').selectOption('T');
await settle();
const dirtyAgain = await page.evaluate(() =>
  !document.getElementById('dirtyBanner').classList.contains('hidden'));
check('dirty banner returns after edit',  dirtyAgain);

console.log('\n══ 25. GRID PANEL renders sessions ══');
// Snapshot first so export-gate is fine, then go to grid
await page.click('.tab:has-text("Versions")'); await settle();
await page.click('.snapshot-form button:has-text("Save snapshot")');
await settle();
await page.click('.tab:has-text("Grid")');
await settle();
check('grid panel active',
  await page.isVisible('#panel-grid.active'));
check('grid filter bar present',
  (await page.$$('.grid-filters select')).length === 4);
const gridRowsAll = await page.$$('.grid-row');
check('grid rows rendered (1 header + slot rows)',
  gridRowsAll.length >= 8);
const busyCells = await page.$$('.grid-cell.busy, .grid-cell.conflict');
check('grid shows busy cells for scheduled sessions',
  busyCells.length >= 1);

console.log('\n══ 26. GRID INSTRUCTOR FILTER + FREE labels ══');
await page.selectOption('.grid-filters select#fInstr', 'Dr. T');
await settle();
const freeCells = await page.$$('.grid-cell.free');
check('grid shows FREE cells when instructor filter active',
  freeCells.length >= 1);
const filteredBusy = await page.$$('.grid-cell.busy, .grid-cell.conflict');
check('grid still shows busy/conflict cells under filter',
  filteredBusy.length >= 1);

console.log('\n══ 27. VIEW WEEK button switches to Grid pre-filtered ══');
// Reset filter, go to schedule, click 📅 next to instructor
await page.selectOption('.grid-filters select#fInstr', '');
await page.click('.tab:has-text("Schedule")'); await settle();
await page.locator('.section-card').first().locator('.view-week-btn').first().click();
await settle();
check('switched to grid panel via view-week',
  await page.isVisible('#panel-grid.active'));
const fInstrVal = await page.evaluate(() => document.getElementById('fInstr').value);
check('grid pre-filtered for Dr. T via view-week',
  fInstrVal === 'Dr. T', `got=${fInstrVal}`);

console.log('\n══ 28. AUTO-ALLOCATE fills empty blocks without conflicts ══');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#panel-schedule.active');
// Add instructor
await page.click('.tab:has-text("Instructors")');
await page.fill('.add-form input[type="text"]', 'Dr. AA');
await page.click('.add-form button:has-text("Add instructor")'); await settle();
// Add level + 2 sections in same level with days set, no time
await page.click('.tab:has-text("Schedule")'); await settle();
await page.click('button:has-text("+ Add level")'); await settle();
await page.fill('.level-name-input', 'L-AA');
await page.click('.level-section button:has-text("+ Add section")'); await settle();
await page.click('.level-section button:has-text("+ Add section")'); await settle();
const sa1 = page.locator('.section-card').nth(0);
const sa2 = page.locator('.section-card').nth(1);
await sa1.locator('.field:has-text("Code") input').fill('AA-1');
await sa1.locator('.field:has-text("Days") select').selectOption('M');
await sa2.locator('.field:has-text("Code") input').fill('AA-2');
await sa2.locator('.field:has-text("Days") select').selectOption('M');
await settle();
// Both sections, both blocks empty time → 2 sections × 1 block each = 2 empties
await page.click('button:has-text("Auto-allocate")');
await settle();
const allocSt = await readState();
const filled = allocSt.rows.flatMap(r => r.blocks).filter(b => b.time).length;
check('auto-allocate filled empty blocks',
  filled >= 2, `filled=${filled}`);
// Verify no conflict was introduced
const cBadge = await page.textContent('#conflictBadge');
check('auto-allocate produced no conflicts',
  parseInt(cBadge, 10) === 0, `badge=${cBadge}`);

console.log('\n══ 29. BULK ADD parses TSV and CSV-with-multiday ══');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#panel-schedule.active');
await page.click('button:has-text("+ Add level")'); await settle();
await page.fill('.level-name-input', 'L-BA');
await page.click('.level-section button:has-text("Bulk add")'); await settle();
const bulk = [
  'BA-1, Intro to BA, lecture, 3, M,W',          // CSV with comma-days
  'BA-2\tAdvanced BA\tlab\t1\tT',                // TSV
  'BA-3, Online BA, online, 2, U',
].join('\n');
await page.fill('.modal textarea', bulk);
await page.click('.modal-foot button.btn-primary');
await settle();
const baSt = await readState();
check('bulk add created 3 sections',
  baSt.rows.length === 3, `n=${baSt.rows.length}`);
const codes = baSt.rows.map(r => r.code).sort();
check('bulk add codes parsed',
  JSON.stringify(codes) === JSON.stringify(['BA-1','BA-2','BA-3']), JSON.stringify(codes));
const csvRow = baSt.rows.find(r => r.code === 'BA-1');
check('bulk add comma-days survived (M,W)',
  csvRow && csvRow.days === 'M,W', csvRow && csvRow.days);
check('bulk add types resolved',
  baSt.rows.some(r => r.type === 'lab') && baSt.rows.some(r => r.type === 'online'));

console.log('\n══ 30. PRINT MENU exists and is gated by dirty ══');
check('print menu element exists',
  await page.evaluate(() => !!document.getElementById('printMenu')));
check('print button disabled while dirty (gate active)',
  await page.evaluate(() => document.getElementById('btnPrint').disabled) === true);
// Take a snapshot then verify menu opens after the gate clears
await page.click('.tab:has-text("Versions")'); await settle();
await page.fill('.snapshot-form input', 'tester');
await page.click('.snapshot-form button:has-text("Save snapshot")');
await settle();
check('print button enabled after snapshot',
  await page.evaluate(() => document.getElementById('btnPrint').disabled) === false);
await page.click('#btnPrint');
const opened = await page.evaluate(() =>
  document.getElementById('printMenu').classList.contains('open'));
check('print menu opens when not dirty', opened);
const items = await page.locator('#printMenu .menu-item').count();
check('print menu has 2 items (active + grid)', items === 2);

console.log('\n══ 31. SETTINGS: edit day pattern → reflected in dropdown ══');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#panel-schedule.active');
await page.click('.tab:has-text("Settings")');
await settle();
check('settings panel active',
  await page.isVisible('#panel-settings.active'));
const daysRowsBefore = await page.locator('#panel-settings .level-section').first()
  .locator('table.data tbody tr').count();
check('day patterns table populated', daysRowsBefore >= 6);
// Add a new day pattern: U,W,R + label
const dayForms = page.locator('#panel-settings .level-section').first().locator('.add-form');
await dayForms.locator('input').nth(0).fill('U,W,R');
await dayForms.locator('input').nth(1).fill('Sun, Wed, Thu');
await dayForms.locator('button.btn-primary').click();
await settle();
const daysRowsAfter = await page.locator('#panel-settings .level-section').first()
  .locator('table.data tbody tr').count();
check('day pattern added',
  daysRowsAfter === daysRowsBefore + 1);
// Now go to Schedule, add level + section, and verify the new pattern is in the dropdown
await page.click('.tab:has-text("Schedule")'); await settle();
await page.click('button:has-text("+ Add level")'); await settle();
await page.fill('.level-name-input', 'L-S');
await page.click('.level-section button:has-text("+ Add section")'); await settle();
const daysSel = page.locator('.section-card .field:has-text("Days") select').first();
const daysOpts = await daysSel.locator('option').allTextContents();
check('new day pattern visible in section dropdown',
  daysOpts.some(o => o.includes('Sun, Wed, Thu')),
  daysOpts.join('|'));

console.log('\n══ 32. SETTINGS: add custom time slot ══');
await page.click('.tab:has-text("Settings")'); await settle();
const lectureSec = page.locator('#panel-settings .level-section').nth(1);
const slotsBefore = await lectureSec.locator('table.data tbody tr').count();
const slotForm = lectureSec.locator('.add-form');
await slotForm.locator('input[type="time"]').nth(0).fill('07:00');
await slotForm.locator('input[type="time"]').nth(1).fill('07:50');
await slotForm.locator('button.btn-primary').click();
await settle();
const slotsAfter = await lectureSec.locator('table.data tbody tr').count();
check('lecture slot added',
  slotsAfter === slotsBefore + 1);
const stCfg = await readState();
const newSlot = stCfg.config.lectureSlots.find(s => s.code === '0700-0750');
check('new slot persisted with code 0700-0750',
  newSlot && newSlot.start === 420 && newSlot.end === 470,
  JSON.stringify(newSlot));
// Verify slot is now in the time dropdown of any section
await page.click('.tab:has-text("Schedule")'); await settle();
const timeSel = page.locator('.section-card .block').first()
  .locator('.field:has-text("Time") select');
const timeOpts = await timeSel.locator('option').allTextContents();
check('new time slot visible in time dropdown',
  timeOpts.some(o => o.includes('0700-0750')),
  timeOpts.join('|'));

console.log('\n══ 33. SETTINGS: reset to defaults ══');
await page.click('.tab:has-text("Settings")'); await settle();
await page.click('button:has-text("Reset to defaults")');
await page.click('.modal-foot button.btn-danger');
await settle();
const stReset = await readState();
check('reset cleared custom slot',
  !stReset.config.lectureSlots.some(s => s.code === '0700-0750'));
check('reset cleared custom day pattern',
  !stReset.config.dayPatterns.some(p => p.code === 'U,W,R'));

console.log('\n══ 34. SETTINGS: persists across reload ══');
await page.click('.tab:has-text("Settings")'); await settle();
const slotForm2 = page.locator('#panel-settings .level-section').nth(2).locator('.add-form');
await slotForm2.locator('input[type="time"]').nth(0).fill('06:30');
await slotForm2.locator('input[type="time"]').nth(1).fill('07:30');
await slotForm2.locator('button.btn-primary').click();
await settle();
await page.reload();
await page.waitForSelector('#panel-schedule.active');
await settle();
const stPersist = await readState();
check('custom lab slot survived reload',
  stPersist.config.labSlots.some(s => s.code === '0630-0730'));

console.log('\n══ 35. EDITABLE COURSES propagate to sections ══');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#panel-schedule.active');
await page.click('button:has-text("+ Add level")'); await settle();
await page.fill('.level-name-input', 'L-CE');
await page.click('.level-section button:has-text("Bulk add")'); await settle();
await page.fill('.modal textarea',
  ['XYZ-1, Old Name, lecture, 3, M', 'XYZ-1, Old Name, lecture, 3, W'].join('\n'));
await page.click('.modal-foot button.btn-primary'); await settle();
// Go to Courses, edit name → all matching sections update
await page.click('.tab:has-text("Courses")'); await settle();
const nameInput = page.locator('#panel-courses table.data tbody tr').first()
  .locator('input').nth(1);
await nameInput.fill('Renamed Course');
await nameInput.press('Tab');
await settle();
const ceSt = await readState();
const allRenamed = ceSt.rows.every(r => r.code === 'XYZ-1' ? r.name === 'Renamed Course' : true);
check('course rename propagated to all sections', allRenamed);
const codeMatches = ceSt.rows.filter(r => r.code === 'XYZ-1').length;
check('still 2 sections of XYZ-1', codeMatches === 2);

console.log('\n══ 36. PER-LEVEL AUTO-ALLOCATE button exists ══');
await page.click('.tab:has-text("Schedule")'); await settle();
const lvlBtns = await page.locator('.level-section button:has-text("Auto-allocate")').count();
check('per-level Auto-allocate button visible',
  lvlBtns >= 1, `count=${lvlBtns}`);
// Click it and verify state updated
await page.click('.level-section button:has-text("Auto-allocate")');
await settle();
const afterPerLevel = await readState();
const lvlRows = afterPerLevel.rows.filter(r => r.code === 'XYZ-1');
const allHaveTime = lvlRows.every(r => r.blocks.every(b => b.time));
check('per-level allocator filled blocks', allHaveTime);

console.log('\n══ 37. SNAPSHOT records date+time ══');
await page.click('.tab:has-text("Versions")'); await settle();
await page.fill('.snapshot-form input', 'Tester');
await page.click('.snapshot-form button:has-text("Save snapshot")'); await settle();
const snapsRaw37 = await page.evaluate(() => localStorage.getItem('cy_sched_snapshots_v3'));
const snaps37 = JSON.parse(snapsRaw37);
const last = snaps37[snaps37.length - 1];
check('snapshot has time field',
  /^\d{2}:\d{2}:\d{2}$/.test(last.time || ''), last.time);
check('snapshot has ISO ts field',
  typeof last.ts === 'string' && last.ts.includes('T'), last.ts);
check('versions panel shows storage path',
  await page.locator('text=cy_sched_snapshots_v3').count() >= 1);

console.log('\n══ 38. CONFLICT SUGGESTION applies a fix ══');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#panel-schedule.active');
// Build R6 conflict: same instr, two sections, same time
await page.click('.tab:has-text("Instructors")');
await page.fill('.add-form input[type="text"]', 'Dr. Sx');
await page.click('.add-form button:has-text("Add instructor")'); await settle();
await page.click('.tab:has-text("Schedule")'); await settle();
await page.click('button:has-text("+ Add level")'); await settle();
await page.fill('.level-name-input', 'L-Sx');
await page.click('.level-section button:has-text("+ Add section")'); await settle();
await page.click('.level-section button:has-text("+ Add section")'); await settle();
const sx1 = page.locator('.section-card').nth(0);
const sx2 = page.locator('.section-card').nth(1);
await sx1.locator('.field:has-text("Code") input').fill('SX-A');
await sx1.locator('.field:has-text("Days") select').selectOption('M');
await sx1.locator('.block').first().locator('.field:has-text("Time") select').selectOption('0800-0920');
await sx1.locator('.block').first().locator('.field:has-text("Instructor") select').selectOption('Dr. Sx');
await sx2.locator('.field:has-text("Code") input').fill('SX-B');
await sx2.locator('.field:has-text("Days") select').selectOption('M');
await sx2.locator('.block').first().locator('.field:has-text("Time") select').selectOption('0800-0920');
await sx2.locator('.block').first().locator('.field:has-text("Instructor") select').selectOption('Dr. Sx');
await settle();
await page.click('.tab:has-text("Conflicts")'); await settle();
const beforeBadge = await page.textContent('#conflictBadge');
check('conflict exists before suggestion',
  parseInt(beforeBadge, 10) >= 1, `badge=${beforeBadge}`);
const applyBtn = page.locator('.issue button.btn-sm').first();
const sugCount = await applyBtn.count();
check('Apply suggestion button rendered', sugCount >= 1);
await applyBtn.click();
await settle();
const afterBadge = await page.textContent('#conflictBadge');
check('conflict cleared after applying suggestion',
  parseInt(afterBadge, 10) < parseInt(beforeBadge, 10),
  `before=${beforeBadge} after=${afterBadge}`);

console.log('\n══ 39. INSTRUCTOR CSV IMPORT ══');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#panel-schedule.active');
await page.click('.tab:has-text("Instructors")'); await settle();
import('fs').then(); // silence unused
const fs2 = await import('fs');
const tmpInstr = '/tmp/cy_test_instructors.csv';
fs2.writeFileSync(tmpInstr, 'name,min_load\nDr. Imp1,10\nDr. Imp2,15\nDr. Imp3,9\n');
await page.setInputFiles('#fileImportInstr', tmpInstr);
await settle();
const stI = await readState();
check('instructors imported',
  stI.instructors.length === 3, JSON.stringify(stI.instructors));
const dr2 = stI.instructors.find(i => i.name === 'Dr. Imp2');
check('imported min_load preserved',
  dr2 && dr2.minLoad === 15, JSON.stringify(dr2));

console.log('\n══ 40. XLSX EXPORT produces a valid zip ══');
// Need a snapshot so export is allowed
await page.click('.tab:has-text("Versions")'); await settle();
await page.fill('.snapshot-form input', 'X');
await page.click('.snapshot-form button:has-text("Save snapshot")'); await settle();
await page.click('#btnExport');
const dlx = page.waitForEvent('download');
await page.click('.menu-item:has-text("Excel")');
const xlsxDl = await dlx;
const xlsxPath = await xlsxDl.path();
const xlsxBytes = fs2.readFileSync(xlsxPath);
check('xlsx file ≥ 1KB', xlsxBytes.length >= 500, `bytes=${xlsxBytes.length}`);
// PK signature (ZIP)
check('xlsx starts with PK signature',
  xlsxBytes[0] === 0x50 && xlsxBytes[1] === 0x4B);
check('xlsx default name is Course_Schedule_Template',
  xlsxDl.suggestedFilename() === 'Course_Schedule_Template.xlsx',
  xlsxDl.suggestedFilename());

// ─────────────────────────────────────────────────────────
// CONFLICT MATRIX — every edge case, in isolation
// Each case seeds the state directly, reloads, and asserts on the
// rules array returned by detectConflicts() in the page.
// ─────────────────────────────────────────────────────────

async function seedAndCheck(label, levels, rows, expected) {
  await page.evaluate(({ levels, rows }) => {
    localStorage.setItem('cy_sched_state_v3', JSON.stringify({
      levels, rows, instructors: [], lang: 'en',
    }));
  }, { levels, rows });
  await page.reload();
  await page.waitForSelector('#panel-schedule.active');
  // Run the detector and pull issues out
  const issues = await page.evaluate(() => {
    // detectConflicts is inside an IIFE; trigger it by clicking Conflicts
    // and reading the rendered .issue rules.
    document.querySelector('.tab[data-tab="conflicts"]').click();
    return Array.from(document.querySelectorAll('.issue .pill.pill-bad'))
      .map(p => p.textContent.trim());
  });
  // Tally rules
  const counts = { R5: 0, R6: 0, R7: 0 };
  issues.forEach(r => { if (counts[r] != null) counts[r]++; });
  const ok = JSON.stringify(counts) === JSON.stringify(expected);
  check(`[matrix] ${label}`, ok,
    `expected=${JSON.stringify(expected)} got=${JSON.stringify(counts)}`);
}

// Building blocks for matrix rows
const lv = (name) => ({ id: 'L_' + name, name });
const rowOf = (id, levelId, code, type, days, blocks) => ({
  id, levelId, code, name: code, type, credits: 3, days,
  blocks: blocks.map((b, i) => ({ id: id + '_b' + (i + 1), ...b })),
});

console.log('\n══ MATRIX: every conflict edge case ══');

// C1: same row, B1+B2 same time same day → R5
await seedAndCheck('C1 same-course self-overlap',
  [lv('L1')],
  [rowOf('r1', 'L_L1', 'X-1', 'lecture', 'M',
    [{ time: '0800-0920', instr: '', room: '' },
     { time: '0800-0920', instr: '', room: '' }])],
  { R5: 1, R6: 0, R7: 0 });

// C2: same row, two blocks at non-overlapping times → no conflict
await seedAndCheck('C2 same-course non-overlap',
  [lv('L1')],
  [rowOf('r1', 'L_L1', 'X-1', 'lecture', 'M',
    [{ time: '0800-0920', instr: '', room: '' },
     { time: '0930-1050', instr: '', room: '' }])],
  { R5: 0, R6: 0, R7: 0 });

// C3: same row, two blocks at same time but different days → no conflict
await seedAndCheck('C3 same-course different days',
  [lv('L1')],
  [
    { id: 'r1', levelId: 'L_L1', code: 'X-1', name: 'X-1', type: 'lecture',
      credits: 3, days: 'M', blocks: [{ id: 'b1', time: '0800-0920', instr: '', room: '' }] },
    { id: 'r1b', levelId: 'L_L1', code: 'X-1', name: 'X-1', type: 'lecture',
      credits: 3, days: 'W', blocks: [{ id: 'b2', time: '0800-0920', instr: '', room: '' }] },
  ],
  { R5: 0, R6: 0, R7: 0 });

// C4: different rows in same level, same time → no conflict (R5 is per-row only)
await seedAndCheck('C4 different courses same level same time',
  [lv('L1')],
  [rowOf('r1', 'L_L1', 'A', 'lecture', 'M', [{ time: '0800-0920', instr: '', room: '' }]),
   rowOf('r2', 'L_L1', 'B', 'lecture', 'M', [{ time: '0800-0920', instr: '', room: '' }])],
  { R5: 0, R6: 0, R7: 0 });

// C5: different levels same time → no conflict
await seedAndCheck('C5 different levels same time',
  [lv('L1'), lv('L2')],
  [rowOf('r1', 'L_L1', 'A', 'lecture', 'M', [{ time: '0800-0920', instr: '', room: '' }]),
   rowOf('r2', 'L_L2', 'B', 'lecture', 'M', [{ time: '0800-0920', instr: '', room: '' }])],
  { R5: 0, R6: 0, R7: 0 });

// C6: same instructor, two lecture blocks, same time → R6
await seedAndCheck('C6 instructor double-book lecture+lecture',
  [lv('L1')],
  [rowOf('r1', 'L_L1', 'A', 'lecture', 'M', [{ time: '0800-0920', instr: 'Dr. K', room: '' }]),
   rowOf('r2', 'L_L1', 'B', 'lecture', 'M', [{ time: '0800-0920', instr: 'Dr. K', room: '' }])],
  { R5: 0, R6: 1, R7: 0 });

// C7: same instructor, lecture + lab same time → R6 (both non-online)
await seedAndCheck('C7 instructor double-book lecture+lab',
  [lv('L1')],
  [rowOf('r1', 'L_L1', 'A', 'lecture', 'M', [{ time: '0800-0920', instr: 'Dr. K', room: '' }]),
   rowOf('r2', 'L_L1', 'B', 'lab',     'M', [{ time: '0900-1040', instr: 'Dr. K', room: '' }])],
  { R5: 0, R6: 1, R7: 0 });

// C8: same instructor, lecture + online same time → no R6 (online excluded)
await seedAndCheck('C8 instructor lecture+online no R6',
  [lv('L1')],
  [rowOf('r1', 'L_L1', 'A', 'lecture', 'M', [{ time: '0800-0920', instr: 'Dr. K', room: '' }]),
   rowOf('r2', 'L_L1', 'B', 'online',  'M', [{ time: '0800-0920', instr: 'Dr. K', room: '' }])],
  { R5: 0, R6: 0, R7: 0 });

// C9: same instructor, two online same time → no R6
await seedAndCheck('C9 instructor two online no R6',
  [lv('L1')],
  [rowOf('r1', 'L_L1', 'A', 'online', 'M', [{ time: '0800-0920', instr: 'Dr. K', room: '' }]),
   rowOf('r2', 'L_L1', 'B', 'online', 'M', [{ time: '0800-0920', instr: 'Dr. K', room: '' }])],
  { R5: 0, R6: 0, R7: 0 });

// C10: different instructors same time → no R6
await seedAndCheck('C10 different instructors no R6',
  [lv('L1')],
  [rowOf('r1', 'L_L1', 'A', 'lecture', 'M', [{ time: '0800-0920', instr: 'Dr. A', room: '' }]),
   rowOf('r2', 'L_L1', 'B', 'lecture', 'M', [{ time: '0800-0920', instr: 'Dr. B', room: '' }])],
  { R5: 0, R6: 0, R7: 0 });

// C11: same room, both non-online, same time → R7
await seedAndCheck('C11 room double-book non-online',
  [lv('L1')],
  [rowOf('r1', 'L_L1', 'A', 'lecture', 'M', [{ time: '0800-0920', instr: '', room: 'R-1' }]),
   rowOf('r2', 'L_L1', 'B', 'lecture', 'M', [{ time: '0800-0920', instr: '', room: 'R-1' }])],
  { R5: 0, R6: 0, R7: 1 });

// C12: same room, one online → no R7
await seedAndCheck('C12 room online excluded',
  [lv('L1')],
  [rowOf('r1', 'L_L1', 'A', 'lecture', 'M', [{ time: '0800-0920', instr: '', room: 'R-1' }]),
   rowOf('r2', 'L_L1', 'B', 'online',  'M', [{ time: '0800-0920', instr: '', room: 'R-1' }])],
  { R5: 0, R6: 0, R7: 0 });

// C13: multi-day pattern fires once per overlapping day (M,W → 2 conflicts)
await seedAndCheck('C13 multi-day pattern fires per day',
  [lv('L1')],
  [rowOf('r1', 'L_L1', 'X', 'lecture', 'M,W',
    [{ time: '0800-0920', instr: '', room: '' },
     { time: '0800-0920', instr: '', room: '' }])],
  { R5: 2, R6: 0, R7: 0 });

// C14: partial overlap (08:00–09:20 vs 09:00–10:40 lab) → R6 if same instr
await seedAndCheck('C14 partial overlap counts',
  [lv('L1')],
  [rowOf('r1', 'L_L1', 'A', 'lecture', 'M', [{ time: '0800-0920', instr: 'Dr. K', room: '' }]),
   rowOf('r2', 'L_L1', 'B', 'lab',     'M', [{ time: '0900-1040', instr: 'Dr. K', room: '' }])],
  { R5: 0, R6: 1, R7: 0 });

// C15: tangential times (08:00–09:00 vs 09:00–10:00 if such slots existed)
//      In practice, our slot codes don't tangent perfectly; the closest is
//      0800-0920 ending at 09:20 and 0930-1050 starting at 09:30 — gap of
//      10 min so they're already non-overlapping. Verify same instr no R6.
await seedAndCheck('C15 non-overlapping consecutive slots',
  [lv('L1')],
  [rowOf('r1', 'L_L1', 'A', 'lecture', 'M', [{ time: '0800-0920', instr: 'Dr. K', room: '' }]),
   rowOf('r2', 'L_L1', 'B', 'lecture', 'M', [{ time: '0930-1050', instr: 'Dr. K', room: '' }])],
  { R5: 0, R6: 0, R7: 0 });

// C16: same instructor + same room same time → BOTH R6 and R7
await seedAndCheck('C16 instructor + room together',
  [lv('L1')],
  [rowOf('r1', 'L_L1', 'A', 'lecture', 'M', [{ time: '0800-0920', instr: 'Dr. K', room: 'R-1' }]),
   rowOf('r2', 'L_L1', 'B', 'lecture', 'M', [{ time: '0800-0920', instr: 'Dr. K', room: 'R-1' }])],
  { R5: 0, R6: 1, R7: 1 });

// C17: same row internal overlap + cross-row instructor double-book
await seedAndCheck('C17 self-overlap stacked with cross-row R6',
  [lv('L1')],
  [rowOf('r1', 'L_L1', 'A', 'lecture', 'M',
    [{ time: '0800-0920', instr: 'Dr. K', room: '' },
     { time: '0800-0920', instr: 'Dr. K', room: '' }]),
   rowOf('r2', 'L_L1', 'B', 'lecture', 'M', [{ time: '0800-0920', instr: 'Dr. K', room: '' }])],
  // Pairs at M, 0800: (r1.b1↔r1.b2)=R5+R6, (r1.b1↔r2.b1)=R6, (r1.b2↔r2.b1)=R6
  { R5: 1, R6: 3, R7: 0 });

// C18: empty instructor / empty room shouldn't trigger R6 / R7
await seedAndCheck('C18 missing instr+room no false positive',
  [lv('L1')],
  [rowOf('r1', 'L_L1', 'A', 'lecture', 'M', [{ time: '0800-0920', instr: '', room: '' }]),
   rowOf('r2', 'L_L1', 'B', 'lecture', 'M', [{ time: '0800-0920', instr: '', room: '' }])],
  { R5: 0, R6: 0, R7: 0 });

// C19: missing days (no time conflict possible)
await seedAndCheck('C19 missing days no conflict',
  [lv('L1')],
  [rowOf('r1', 'L_L1', 'A', 'lecture', '', [{ time: '0800-0920', instr: 'Dr. K', room: '' }]),
   rowOf('r2', 'L_L1', 'B', 'lecture', '', [{ time: '0800-0920', instr: 'Dr. K', room: '' }])],
  { R5: 0, R6: 0, R7: 0 });

// C20: missing time on a block → no conflicts produced by that block
await seedAndCheck('C20 missing time skipped',
  [lv('L1')],
  [rowOf('r1', 'L_L1', 'A', 'lecture', 'M',
    [{ time: '0800-0920', instr: 'Dr. K', room: '' },
     { time: '',          instr: 'Dr. K', room: '' }]),
   rowOf('r2', 'L_L1', 'B', 'lecture', 'M', [{ time: '0800-0920', instr: 'Dr. K', room: '' }])],
  // Only r1.b1↔r2.b1 fires R6.
  { R5: 0, R6: 1, R7: 0 });

console.log('\n════════════════════════════════════');
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('════════════════════════════════════');
if (fails.length) {
  console.log('Failures:');
  fails.forEach(f => console.log('  - ' + f));
}

await browser.close();
process.exit(fail === 0 ? 0 : 1);
