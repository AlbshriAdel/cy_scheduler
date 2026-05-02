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
check('6 tabs rendered',
  (await page.$$('.tab')).length === 6);
check('empty state shown',
  await page.isVisible('text=No levels yet'));
check('conflict badge hidden at 0',
  await page.evaluate(() => getComputedStyle(document.getElementById('conflictBadge')).display) === 'none');

console.log('\n══ 2. ADD LEVEL ══');
await page.click('button:has-text("+ Add level")');
await settle();
check('level card appears',
  (await page.$$('.level-section')).length === 1);
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

console.log('\n══ 9. CONFLICT R5 (level overlap, different instructor) ══');
await page.click('.tab:has-text("Schedule")');
await settle();
// Add a 2nd section in same level with overlapping time, different instructor
await page.click('.level-section button:has-text("+ Add section")');
await settle();
const sec2 = page.locator('.section-card').nth(1);
await sec2.locator('.field:has-text("Code") input').fill('CECS-212');
await sec2.locator('.field:has-text("Name") input').fill('Data Structures');
await sec2.locator('.field:has-text("Days") select').selectOption('M,W');
const sec2b1 = sec2.locator('.block').nth(0);
await sec2b1.locator('.field:has-text("Time") select').selectOption('0800-0920');
// Add another instructor to test R5 only (no R6)
await page.click('.tab:has-text("Instructors")');
await page.fill('.add-form input[type="text"]', 'Dr. Beta');
await page.click('.add-form button:has-text("Add instructor")');
await settle();
await page.click('.tab:has-text("Schedule")');
await settle();
await page.locator('.section-card').nth(1).locator('.block').nth(0)
  .locator('.field:has-text("Instructor") select').selectOption('Dr. Beta');
await settle();
await page.click('.tab:has-text("Conflicts")');
await settle();
check('R5 issue listed (level overlap)',
  await page.locator('.issue:has-text("R5")').count() >= 1);

console.log('\n══ 10. CONFLICT R7 (room double-book) ══');
await page.click('.tab:has-text("Schedule")');
await settle();
// First fix R6 by making block 2 of section 1 use a non-overlapping time
const sec1 = page.locator('.section-card').nth(0);
await sec1.locator('.block').nth(1).locator('.field:has-text("Time") select').selectOption('0930-1050');
// Set both block1 of sec1 and block1 of sec2 to use same room
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
  (await page.$$('.level-section')).length === 0);
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

console.log('\n════════════════════════════════════');
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('════════════════════════════════════');
if (fails.length) {
  console.log('Failures:');
  fails.forEach(f => console.log('  - ' + f));
}

await browser.close();
process.exit(fail === 0 ? 0 : 1);
