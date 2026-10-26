import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, readSync, closeSync, openSync } from 'node:fs';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
let fs = { existsSync, openSync, readSync, closeSync };
try {
  const original = require('original-fs');
  fs = { ...fs, openSync: original.openSync, readSync: original.readSync, closeSync: original.closeSync, existsSync: original.existsSync };
} catch {
  // Plain Node can open the archive file directly.
}

const asarPath = process.argv[2]
  ?? process.env.DSH_DESKTOP_APP_ASAR
  ?? join(dirname(process.execPath), 'resources', 'app.asar');

if (!fs.existsSync(asarPath)) {
  console.error(`app.asar not found: ${asarPath}`);
  process.exit(2);
}

const fd = fs.openSync(asarPath, 'r');
try {
  const prefix = Buffer.alloc(16);
  fs.readSync(fd, prefix, 0, 16, 0);
  const headerSize = prefix.readUInt32LE(12);
  const header = Buffer.alloc(headerSize);
  fs.readSync(fd, header, 0, headerSize, 16);
  const archive = JSON.parse(header.toString('utf8'));
  const entry = archive.files?.lib?.files?.['main.js'];
  if (entry === undefined) throw new Error('lib/main.js not found in app.asar');
  const main = Buffer.alloc(entry.size);
  fs.readSync(fd, main, 0, main.length, 16 + headerSize + Number(entry.offset));
  const source = main.toString('utf8');
  const hash = createHash('sha256').update(main).digest('hex');
  const report = {
    asarPath,
    mainBytes: main.length,
    patched: source.includes('/* dsh-tray-restart:'),
    namedRestartLabel: source.includes('messages.restartApplication + " DeepSeek Harness"'),
    oldShortRestartLabel: source.includes('{ label: messages.restartApplication, click:'),
    integrityMatches: entry.integrity?.hash === hash,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.patched || !report.namedRestartLabel || !report.integrityMatches) process.exitCode = 1;
} finally {
  fs.closeSync(fd);
}
