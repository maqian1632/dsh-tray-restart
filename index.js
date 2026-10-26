import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Loader identity for the tray restart bundle. */
export const name = 'dsh-tray-restart';

/** The patch module's URL, imported with a cache-busting revision below. */
const PATCH_MODULE = new URL('./tray-patch.js', import.meta.url);

/**
 * Add the Restart DeepSeek Harness action to the desktop shell's Windows tray
 * menu.
 *
 * The desktop shell owns its tray in the Electron main process and exposes no
 * plugin API for menu items. This Host plugin therefore patches the packaged
 * shell bundle for the next launch, keeping the edit length-neutral so the
 * running application's asar offsets stay valid.
 *
 * @param ctx - Host plugin context.
 */
export async function apply(ctx) {
  const logger = ctx.logger('dsh-tray-restart');
  if (process.platform !== 'win32') {
    logger.info('the system tray restart action is only available on Windows');
    return;
  }

  const asarPath = process.env.DSH_DESKTOP_APP_ASAR
    ?? join(dirname(process.execPath), 'resources', 'app.asar');
  if (!existsSync(asarPath)) {
    logger.info('desktop app.asar was not found; tray restart was not installed');
    return;
  }

  let patchUrl = PATCH_MODULE.href;
  try {
    const revision = statSync(PATCH_MODULE).mtimeMs;
    const url = new URL(PATCH_MODULE);
    url.searchParams.set('rev', String(revision));
    patchUrl = url.href;
  } catch {
    // The static URL still resolves when the development checkout has no mtime.
  }

  try {
    const { applyTrayRestart } = await import(patchUrl);
    const result = applyTrayRestart(asarPath);
    if (result.changed) {
      logger.info(`added Restart DeepSeek Harness to the desktop tray menu (${String(result.mainBytes)} bytes${result.integrityUpdated ? ', integrity updated' : ''}); restart the desktop app to use it`);
    } else {
      logger.info('the desktop tray menu already has the Restart DeepSeek Harness action');
    }
  } catch (error) {
    logger.warn(`could not add Restart DeepSeek Harness to the desktop tray menu: ${error instanceof Error ? error.message : String(error)}`);
  }
}
