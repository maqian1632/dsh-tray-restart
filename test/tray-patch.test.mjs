import test from 'node:test';
import assert from 'node:assert/strict';
import { patchDesktopMain, TRAY_RESTART_MARKER } from '../tray-patch.js';

const STOCK_REGION_LENGTH = 1253;

function makeStockMain() {
  const body = `var DesktopTray = class {
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
			{ label: messages.quitApplication, click: () => { this.options.quit(); } }
		]));
	}
	dispose() {
		const tray = this.tray;
		this.tray = void 0;
		tray?.destroy();
	}
};`;
  const prefix = '//#region lib/types/tray.js\n';
  const suffix = '\n//#endregion';
  const fill = ' '.repeat(Math.max(0, STOCK_REGION_LENGTH - prefix.length - body.length - suffix.length));
  return Buffer.from(`const app = { relaunch() {} };
function quitWithoutConfirmation() {}
const compatibility = ['app.relaunch()', 'restartApplication'];
${prefix}${body}${fill}${suffix}
const after = true;
`);
}

function makeOldPatchedMain() {
  const main = makeStockMain();
  const text = main.toString('utf8');
  const start = text.indexOf('//#region lib/types/tray.js');
  const end = text.indexOf('//#endregion', start) + '//#endregion'.length;
  const regions = text.slice(start, end);
  const oldRegion = `//#region lib/types/tray.js
/* dsh-tray-restart: adds Restart to the Windows tray menu */
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
			{ label: messages.restartApplication, click: () => { app.relaunch(); quitWithoutConfirmation(); } },
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
  const padded = oldRegion + ' '.repeat(regions.length - oldRegion.length);
  return Buffer.from(text.slice(0, start) + padded + text.slice(end));
}

test('patches stock tray region with the named restart action', () => {
  const stock = makeStockMain();
  const { changed, source } = patchDesktopMain(stock);
  assert.equal(changed, true);
  assert.equal(source.length, stock.length);
  const text = source.toString('utf8');
  assert.ok(text.includes(TRAY_RESTART_MARKER));
  assert.ok(text.includes('messages.restartApplication + " DeepSeek Harness"'));
  assert.ok(text.includes('app.relaunch(); quitWithoutConfirmation();'));
  assert.ok(text.includes('messages.openApplication'));
  assert.ok(text.includes('messages.quitApplication'));
});

test('second patch is a no-op', () => {
  const once = patchDesktopMain(makeStockMain()).source;
  const twice = patchDesktopMain(once);
  assert.equal(twice.changed, false);
  assert.equal(twice.source.length, once.length);
});

test('upgrades the previous short restart label in place', () => {
  const old = makeOldPatchedMain();
  const { changed, source } = patchDesktopMain(old);
  assert.equal(changed, true);
  assert.equal(source.length, old.length);
  const text = source.toString('utf8');
  assert.ok(text.includes('messages.restartApplication + " DeepSeek Harness"'));
  assert.ok(!text.includes('{ label: messages.restartApplication, click:'));
  assert.ok(text.includes(TRAY_RESTART_MARKER));
});

test('rejects a shell that no longer exposes the restart primitives', () => {
  const unsupported = Buffer.from('var DesktopTray = class {};');
  assert.throws(() => patchDesktopMain(unsupported), /not supported/);
});
