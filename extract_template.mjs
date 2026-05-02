// Extract Course_Schedule_Template.xlsx into JS-embeddable form.
// Output: a single JSON-ish file we paste into cy_scheduler.html.
// What we keep:
//   - All non-sheet1 files: name, original CRC32, uncompressed size,
//     compressed size, raw DEFLATE bytes (base64). At runtime we
//     pass these through unchanged so Excel sees the exact same
//     styles, theme, sharedStrings, workbook, etc.
//   - sheet1 prefix: the XML up to and including the first 4 header
//     rows (we keep rows 1–4 byte-for-byte: title, super-headers,
//     bilingual column headers).
//   - sheet1 suffix template: a closing block we render dynamically
//     with new mergeCells reflecting the user's actual level groups.
import fs from 'fs';
import zlib from 'zlib';

const buf = fs.readFileSync('/home/user/cy_scheduler/Course_Schedule_Template.xlsx');

// Find End-Of-Central-Directory record (scan from the end)
function findEOCD(b) {
  for (let i = b.length - 22; i >= 0; i--) {
    if (b.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}
const eocd = findEOCD(buf);
const cdSize = buf.readUInt32LE(eocd + 12);
const cdOff = buf.readUInt32LE(eocd + 16);
const totalEntries = buf.readUInt16LE(eocd + 10);

const entries = [];
let p = cdOff;
for (let i = 0; i < totalEntries; i++) {
  if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad CD signature');
  const method = buf.readUInt16LE(p + 10);
  const crc = buf.readUInt32LE(p + 16);
  const compSize = buf.readUInt32LE(p + 20);
  const uncSize = buf.readUInt32LE(p + 24);
  const nameLen = buf.readUInt16LE(p + 28);
  const extraLen = buf.readUInt16LE(p + 30);
  const commentLen = buf.readUInt16LE(p + 32);
  const localOff = buf.readUInt32LE(p + 42);
  const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
  // Read the local file header to find data offset
  const lhNameLen = buf.readUInt16LE(localOff + 26);
  const lhExtraLen = buf.readUInt16LE(localOff + 28);
  const dataOff = localOff + 30 + lhNameLen + lhExtraLen;
  const compData = buf.slice(dataOff, dataOff + compSize);
  entries.push({ name, method, crc, compSize, uncSize, compData });
  p += 46 + nameLen + extraLen + commentLen;
}

// Decompress sheet1.xml so we can use its prefix + style references
const sheet1Entry = entries.find(e => e.name === 'xl/worksheets/sheet1.xml');
const sheet1Plain = (sheet1Entry.method === 8
  ? zlib.inflateRawSync(sheet1Entry.compData)
  : sheet1Entry.compData
).toString('utf8');

// Find the prefix: everything up to and including the closing tag of row 4
const prefixEnd = sheet1Plain.indexOf('</row>', sheet1Plain.indexOf('r="4"')) + '</row>'.length;
const prefix = sheet1Plain.slice(0, prefixEnd);

// Suffix: we'll regenerate dynamically. But the page settings + closing
// should be matched, so capture from </sheetData> onward. We'll replace
// the mergeCells and conditionalFormatting at runtime.
const suffixStart = sheet1Plain.indexOf('</sheetData>') + '</sheetData>'.length;
const suffix = sheet1Plain.slice(suffixStart);

const others = entries
  .filter(e => e.name !== 'xl/worksheets/sheet1.xml')
  .map(e => ({
    name: e.name,
    method: e.method,
    crc: e.crc,
    uncSize: e.uncSize,
    compSize: e.compSize,
    data: e.compData.toString('base64'),
  }));

const out = {
  prefix, suffix, others,
};
fs.writeFileSync('/home/user/cy_scheduler/.template_extract.json', JSON.stringify(out));
console.log('OK',
  'prefix bytes:', prefix.length,
  '· suffix bytes:', suffix.length,
  '· other files:', others.length,
  '· total b64 bytes:', others.reduce((s, o) => s + o.data.length, 0));
