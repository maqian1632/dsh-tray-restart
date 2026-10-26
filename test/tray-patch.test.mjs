import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
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

test('the patched tray builds the named restart menu item', () => {
  const patched = patchDesktopMain(makeStockMain()).source.toString('utf8');
  const start = patched.indexOf('//#region lib/types/tray.js');
  const end = patched.indexOf('//#endregion', start) + '//#endregion'.length;
  const region = patched.slice(start, end);

  const calls = { relaunch: 0, quit: 0, open: 0, menu: undefined };
  class Tray {
    on() {}
    setToolTip() {}
    setContextMenu(menu) { calls.menu = menu; }
    destroy() {}
  }
  const context = {
    Tray,
    nativeImage: { createFromPath: (path) => ({ path }) },
    Menu: { buildFromTemplate: (template) => template },
    app: { relaunch: () => { calls.relaunch += 1; } },
    quitWithoutConfirmation: () => { calls.quit += 1; },
    console,
  };
  vm.createContext(context);
  vm.runInContext(region, context);
  const tray = new context.DesktopTray({
    iconPath: 'tray.ico',
    locale: () => ({ messages: {
      aboutProduct: 'DeepSeek Harness',
      openApplication: '打开 DeepSeek Harness',
      restartApplication: '重启',
      quitApplication: '退出 DeepSeek Harness',
    } }),
    open: () => { calls.open += 1; },
    quit: () => { calls.quit += 1; },
  });
  const labels = calls.menu.map((item) => item.label ?? item.type);
  assert.equal(labels.join('|'), '打开 DeepSeek Harness|重启 DeepSeek Harness|separator|退出 DeepSeek Harness');
  const restart = calls.menu.find((item) => item.label === '重启 DeepSeek Harness');
  restart.click();
  assert.equal(calls.relaunch, 1);
  assert.equal(calls.quit, 1);
  assert.equal(typeof tray.relabel, 'function');
});
