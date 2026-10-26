import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import * as nodeFs from 'node:fs';

const require = createRequire(import.meta.url);
let fs = nodeFs;
try {
  // Electron's fs wrapper treats a path inside app.asar as an archive member.
  // original-fs addresses the archive file itself, which is what we must patch.
  fs = require('original-fs');
} catch {
  // Plain Node (tests and non-Electron hosts) has no asar wrapper to bypass.
}
const { closeSync, fsyncSync, openSync, readSync, writeSync } = fs;

/** Marker that makes repeated plugin activations idempotent. */
export const TRAY_RESTART_MARKER = '/* dsh-tray-restart: adds Restart DeepSeek Harness to the Windows tray menu */';

const MARKER_PREFIX = Buffer.from('/* dsh-tray-restart:');
const REGION_START = Buffer.from('//#region lib/types/tray.js');
const REGION_END = Buffer.from('//#endregion');

/**
 * Replacement for the Electron shell's tray region. It keeps the original open
 * action and adds a localized restart action whose label names the application,
 * followed by the original quit action.
 */
const PATCHED_REGION = `//#region lib/types/tray.js
${TRAY_RESTART_MARKER}
var DesktopTray = class {
	options;
	tray;
	constructor(options) {
		this.options = options;
		const tray = new Tray(nativeImage.createFromPath(options.iconPath));
		this.tray = tray;
		tray.on("click", () => {
			options.open();
		});
		this.relabel();
	}
	relabel() {
		const tray = this.tray;
		if (tray === void 0) return;
		const { messages } = this.options.locale();
		tray.setToolTip(messages.aboutProduct);
		tray.setContextMenu(Menu.buildFromTemplate([
			{ label: messages.openApplication, click: () => { this.options.open(); } },
			{ label: messages.restartApplication + " DeepSeek Harness", click: () => { app.relaunch(); quitWithoutConfirmation(); } },
			{ type: "separator" },
			{ label: messages.quitApplication, click: () => { this.options.quit(); } }
		]));
	}
	dispose() {
		const tray = this.tray;
		this.tray = void 0;
		tray?.destroy();
	}
};
//#endregion`;

function readAt(fd, buffer, position) {
  let offset = 0;
  while (offset < buffer.length) {
    const read = readSync(fd, buffer, offset, buffer.length - offset, position + offset);
    if (read === 0) throw new Error('unexpected end of app.asar');
    offset += read;
  }
}

function writeAt(fd, buffer, position) {
  let offset = 0;
  while (offset < buffer.length) {
    const written = writeSync(fd, buffer, offset, buffer.length - offset, position + offset);
    if (written === 0) throw new Error('could not write app.asar');
    offset += written;
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Replace the tray region without changing the file length. Keeping every byte
 * offset stable is what makes an in-place patch safe for the still-running
 * Electron process.
 */
export function patchDesktopMain(main) {
  for (const token of ['quitWithoutConfirmation', 'app.relaunch()', 'restartApplication']) {
    if (!main.includes(token)) {
      throw new Error(`this desktop shell version is not supported (missing ${token})`);
    }
  }

  const start = main.indexOf(REGION_START);
  if (start < 0) throw new Error('the desktop tray region was not found');
  const end = main.indexOf(REGION_END, start + REGION_START.length);
  if (end < 0) throw new Error('the end of the desktop tray region was not found');
  let endOfRegion = end + REGION_END.length;
  // A previous revision padded its replacement with spaces after //#endregion.
  // Consume that padding so upgrading the label keeps the same region boundary.
  if (main.subarray(start, endOfRegion).includes(MARKER_PREFIX)) {
    while (endOfRegion < main.length && main[endOfRegion] === 0x20) endOfRegion++;
  }
  const oldRegion = main.subarray(start, endOfRegion);
  const replacement = Buffer.from(PATCHED_REGION, 'utf8');
  if (replacement.length > oldRegion.length) {
    throw new Error(`the desktop tray region is too small to patch (${oldRegion.length} < ${replacement.length} bytes)`);
  }

  const region = Buffer.concat([replacement, Buffer.alloc(oldRegion.length - replacement.length, 0x20)]);
  if (region.equals(oldRegion)) return { changed: false, source: main };

  const source = Buffer.concat([main.subarray(0, start), region, main.subarray(endOfRegion)]);
  if (source.length !== main.length) throw new Error('the desktop main bundle length changed');
  return { changed: true, source };
}

/** Update the asar integrity record so archive tooling still validates the patched file. */
function updateIntegrity(fd, header, entry, source) {
  const integrity = entry.integrity;
  if (integrity === undefined || typeof integrity.hash !== 'string') return false;

  const replacements = [];
  const hash = sha256(source);
  if (hash !== integrity.hash) replacements.push([integrity.hash, hash]);

  if (Array.isArray(integrity.blocks)) {
    const blockSize = Number.isSafeInteger(integrity.blockSize) && integrity.blockSize > 0 ? integrity.blockSize : 4 * 1024 * 1024;
    for (let index = 0; index < integrity.blocks.length; index++) {
      const oldHash = integrity.blocks[index];
      if (typeof oldHash !== 'string') continue;
      const block = source.subarray(index * blockSize, (index + 1) * blockSize);
      if (block.length === 0) continue;
      const newHash = sha256(block);
      if (newHash !== oldHash) replacements.push([oldHash, newHash]);
    }
  }

  let changed = false;
  for (const [oldHash, newHash] of replacements) {
    const needle = Buffer.from(oldHash, 'utf8');
    const value = Buffer.from(newHash, 'utf8');
    if (needle.length !== 64 || value.length !== 64) continue;
    let cursor = 0;
    while ((cursor = header.indexOf(needle, cursor)) !== -1) {
      value.copy(header, cursor);
      cursor += value.length;
      changed = true;
    }
  }
  return changed;
}

/**
 * Patch a packaged Desktop installation in place.
 * @param {string} asarPath - Absolute path to `resources/app.asar`.
 * @returns {{ changed: boolean, asarPath: string, mainBytes: number, integrityUpdated: boolean }}
 */
export function applyTrayRestart(asarPath) {
  const fd = openSync(asarPath, 'r+');
  try {
    const prefix = Buffer.alloc(16);
    readAt(fd, prefix, 0);
    const headerSize = prefix.readUInt32LE(12);
    if (headerSize < 2 || headerSize > 64 * 1024 * 1024) throw new Error('the desktop app.asar header is invalid');
    const dataOffset = 16 + headerSize;
    const header = Buffer.alloc(headerSize);
    readAt(fd, header, 16);
    const archive = JSON.parse(header.toString('utf8'));
    const entry = archive.files?.lib?.files?.['main.js'];
    if (entry === undefined || !Number.isSafeInteger(entry.size) || entry.size <= 0) {
      throw new Error('the desktop main bundle was not found in app.asar');
    }
    if (entry.unpacked === true) throw new Error('the desktop main bundle is unpacked; this layout is not supported');

    const absoluteOffset = dataOffset + Number(entry.offset);
    if (!Number.isSafeInteger(absoluteOffset) || absoluteOffset < dataOffset) throw new Error('the desktop main bundle offset is invalid');
    const main = Buffer.alloc(entry.size);
    readAt(fd, main, absoluteOffset);

    const { changed, source } = patchDesktopMain(main);
    if (!changed) {
      return { changed: false, asarPath, mainBytes: main.length, integrityUpdated: false };
    }

    writeAt(fd, source, absoluteOffset);
    const integrityUpdated = updateIntegrity(fd, header, entry, source);
    if (integrityUpdated) writeAt(fd, header, 16);
    fsyncSync(fd);
    return { changed: true, asarPath, mainBytes: source.length, integrityUpdated };
  } finally {
    closeSync(fd);
  }
}
