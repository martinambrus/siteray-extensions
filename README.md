<p align="center">
  <img src="siteray-logo.png" alt="SiteRay" width="200">
</p>

<h1 align="center">SiteRay Browser Extension</h1>

<p align="center">Website trust scores at a glance — know before you click.</p>

<p align="center">
  <a href="https://siteray.eu">siteray.eu</a>
</p>

## Features

- **Trust score badges** — see a site's trust score directly on the browser toolbar icon, displayed as numbers (0–100) or symbols (tick, warning, stop sign)
- **Trust bar overlay** — a thin colored bar (green/yellow/red) at the top or bottom of every page, indicating site trustworthiness
- **Scan triggering** — scan sites that haven't been analyzed yet, right from the extension popup
- **Rescan** — request a fresh scan for sites with outdated data
- **Real-time progress** — live scan progress updates via Server-Sent Events
- **Onboarding page** — guided setup on first install with live trust bar preview and configuration
- **Cross-browser support** — works on Chrome and Firefox

## Supported Browsers

| Browser | Manifest Version |
|---------|-----------------|
| Chrome  | Manifest V3     |
| Firefox | Manifest V2     |

## Installation

A [SiteRay](https://siteray.eu) account is required to use the extension. Sign up at [siteray.eu](https://siteray.eu), then install the extension from your browser's extension store.

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)

### Build

```bash
npm install

# Build both Chrome and Firefox
npm run build

# Build a single target
npm run build:chrome
npm run build:firefox
```

Built extensions are output to `dist/chrome/` and `dist/firefox/`.

## Development

Start watch mode for automatic rebuilds on file changes:

```bash
npm run watch
```

In development, the extension connects to `http://localhost:3001` (API backend) and `http://localhost:3000` (web frontend). Toggle the `IS_DEV` flag in `src/common/config.ts` to switch between dev and production endpoints.

### Loading the Unpacked Extension

**Chrome:**
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `dist/chrome/` directory

**Firefox:**
1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file inside the `dist/firefox/` directory

## Project Structure

```
src/
  common/        Shared modules (types, API client, auth, badge rendering, config, settings)
  background/    Service worker — tab detection, caching, badge updates, trust bar push
  popup/         Preact popup UI — login, score display, scan controls, settings
  content/       Content script — trust bar injection via closed Shadow DOM
  onboarding/    Onboarding page — welcome screen with live trust bar preview
manifests/       Browser-specific manifest files (chrome.json, firefox.json)
build/           esbuild build script and icon generator
dist/            Built extension output (chrome/, firefox/)
```

## Tech Stack

- [Preact](https://preactjs.com/) — lightweight UI rendering
- [TypeScript](https://www.typescriptlang.org/) — type safety (strict mode, ES2020 target)
- [esbuild](https://esbuild.github.io/) — fast bundling and minification
- [webextension-polyfill](https://github.com/nicolo-ribaudo/webextension-polyfill) — cross-browser extension API compatibility

## License

MIT &copy; Martin Ambrus
