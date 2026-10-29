// Builds the extension into dist/, a folder you can load in Chrome with "Load unpacked".
//
// Usage: npm run build   (or: node scripts/build.mjs)
//
// There's nothing to compile: this checks the files in extension/ and copies them to dist/.
// Uses only Node's built-in modules (Node 18+), so there is nothing to install.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'extension');
const DIST = path.join(ROOT, 'dist');

// 1. Check the extension first: the JSON files must parse and every file the manifest
//    points to must exist. If anything is wrong, stop before touching dist/.
const manifest = readJson('manifest.json');
for (const ruleset of manifest.declarative_net_request?.rule_resources ?? []) readJson(ruleset.path);
for (const script of manifest.content_scripts ?? []) {
  for (const file of script.js ?? []) mustExist(file);
}

// 2. Replace dist/ with a fresh copy of the extension. Skips dotfiles and _metadata/,
//    which Chrome creates inside a folder when you load it unpacked.
const files = listFiles(SRC);
fs.rmSync(DIST, { recursive: true, force: true, maxRetries: 3 });
for (const name of files) {
  const target = path.join(DIST, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(SRC, name), target);
}

console.log(`Built ${manifest.name} ${manifest.version} into dist (${files.join(', ')}).`);
console.log(`To load it: chrome://extensions > Load unpacked > select ${DIST}`);
console.log('Already loaded? Click the reload button on its card in chrome://extensions.');

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
