// Builds dist/x-cleaner-<version>.zip from the extension/ folder.
//
// Usage: npm run build   (or: node scripts/build.mjs)
//
// Uses only Node's built-in modules (Node 18+), so there is nothing to install.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'extension');
const DIST = path.join(ROOT, 'dist');
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

// 1. Check the extension before packaging it: the JSON files must parse and every
//    file the manifest points to must exist.
const manifest = readJson('manifest.json');
for (const ruleset of manifest.declarative_net_request?.rule_resources ?? []) readJson(ruleset.path);
for (const script of manifest.content_scripts ?? []) {
  for (const file of script.js ?? []) mustExist(file);
}

// 2. Collect the files. Skips dotfiles and _metadata/, which Chrome creates inside the
//    folder when you load the extension unpacked.
const files = listFiles(SRC);

// 3. Write the zip, with manifest.json at the top level (where Chrome expects it).
const zipPath = path.join(DIST, `x-cleaner-${manifest.version}.zip`);
fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(zipPath, createZip(files.map((name) => [name, fs.readFileSync(path.join(SRC, name))])));
console.log(`Built ${path.relative(ROOT, zipPath)} (${files.length} files: ${files.join(', ')})`);

function readJson(file) {
  mustExist(file);
  try {
    return JSON.parse(fs.readFileSync(path.join(SRC, file), 'utf8'));
  } catch (error) {
    fail(`extension/${file} is not valid JSON: ${error.message}`);
  }
}

function mustExist(file) {
  if (!fs.existsSync(path.join(SRC, file))) fail(`missing file extension/${file}`);
}

function fail(message) {
  console.error(`Build failed: ${message}`);
  process.exit(1);
}

function listFiles(dir, prefix = '') {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.') && entry.name !== '_metadata')
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((entry) => {
      const name = prefix + entry.name;
      return entry.isDirectory() ? listFiles(path.join(dir, entry.name), `${name}/`) : [name];
    });
}

// Minimal ZIP writer (deflate compression), enough for a handful of small files.
// Every entry gets the same fixed date (1980-01-01), so the same files always
// produce a byte-identical zip.
function createZip(entries) {
  const DOS_TIME = 0;
  const DOS_DATE = (1 << 5) | 1; // 1980-01-01
  const UTF8_NAMES = 0x0800;
  const DEFLATE = 8;
  const parts = [];
  const central = [];
  let offset = 0;

  for (const [name, data] of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed to extract (2.0)
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(DEFLATE, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    parts.push(local, nameBytes, compressed);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0); // central directory header signature
    header.writeUInt16LE(20, 4); // version made by (2.0, MS-DOS attributes)
    header.writeUInt16LE(20, 6); // version needed to extract
    header.writeUInt16LE(UTF8_NAMES, 8);
    header.writeUInt16LE(DEFLATE, 10);
    header.writeUInt16LE(DOS_TIME, 12);
    header.writeUInt16LE(DOS_DATE, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(compressed.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(nameBytes.length, 28);
    // Bytes 30-41 (extra/comment lengths, disk number, attributes) stay 0.
    header.writeUInt32LE(offset, 42); // where this file's local header starts
    central.push(header, nameBytes);

    offset += local.length + nameBytes.length + compressed.length;
  }

  const centralSize = central.reduce((size, part) => size + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(entries.length, 8); // entries on this disk
  end.writeUInt16LE(entries.length, 10); // entries in total
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16); // where the central directory starts
  return Buffer.concat([...parts, ...central, end]);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
