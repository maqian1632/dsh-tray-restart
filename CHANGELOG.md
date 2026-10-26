# Changelog

## 1.0.0 — 2026-10-26

- Initial public release.
- Adds **重启 DeepSeek Harness** to the Windows system tray menu.
- Restarts the desktop app through `app.relaunch()` and the existing shutdown path.
- Length-neutral, idempotent `app.asar` patch with SHA-256 integrity update.
- Supports upgrading the earlier short “重启” label in place.
- Adds unit tests for patch, idempotence, upgrade, and unsupported shells.
