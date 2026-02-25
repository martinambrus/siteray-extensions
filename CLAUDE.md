# SiteRay Browser Extension - Agent Context

## Project Overview
Browser extensions for Chrome (Manifest V3) and Firefox (Manifest V2) that display SiteRay website trust scores. Built with Preact for UI, TypeScript for type safety, and esbuild for bundling. Licensed MIT.

## Directory Structure

```
siteray-extensions/
  src/
    common/          - Shared modules used by background, popup, content, onboarding
      types.ts       - All TypeScript interfaces and type definitions
      config.ts      - API base URL, web base URL, cache TTL (IS_DEV toggle)
      auth.ts        - browser.storage.local get/store/update/clear for tokens and user
      api-client.ts  - HTTP client: login, lookup, triggerScan, checkRescanEligibility, getStreamToken, getWebLoginUrl; includes authedFetch with 401 retry via token refresh
      badge.ts       - Programmatic icon generation (score numbers, symbols, gray, spinner); per-tab animations; cross-browser action API compat
      settings.ts    - Extension settings storage (icon display mode, trust bar config)
    background/
      index.ts       - Service worker / background script; message handler for all popup/content messages; tab URL change listener; in-memory lookup cache (Map with TTL); background scan polling; trust bar push to all tabs; onboarding page on install
    popup/
      popup.html     - Entry HTML for popup
      popup.css      - Full dark-theme CSS for popup UI (360px width)
      index.tsx       - Preact render entry point
      components/
        App.tsx       - Main popup component; state machine (loading/login/score/not-scanned/progress); manages auth, lookup, scan, rescan, settings; footer with user email, settings toggle, account link, logout
        LoginView.tsx - Email/password form; sign-up link to web app
        ScoreView.tsx - Trust score display with circle, favicon, risk label, verdict, rescan button, view report link
        NotScannedView.tsx - "Not yet scanned" state with scan button
        ProgressView.tsx - Scanning progress spinner with status text
        Header.tsx    - Logo header
        SettingsView.tsx - Icon display mode (numbers/symbols) and trust bar settings (enabled, position, size)
    content/
      index.ts       - Content script; injects trust bar via closed Shadow DOM; listens for UPDATE_BAR messages; requests bar data on load
    onboarding/
      onboarding.html - Entry HTML
      onboarding.css  - Standalone dark-theme CSS for onboarding page
      index.tsx       - Preact render entry point
      OnboardingApp.tsx - Welcome page with live trust bar preview; settings for bar enable/position/size
    icons/            - Pre-generated PNG icons (gray/green/yellow/red at 16/48/128px) + siteray-logo.png
  manifests/
    chrome.json       - Chrome MV3 manifest (service_worker, action, host_permissions)
    firefox.json      - Firefox MV2 manifest (background scripts, browser_action, gecko settings)
  build/
    build.js          - esbuild build script; bundles background (ESM for Chrome, IIFE for Firefox), popup, content, onboarding; copies manifests, HTML, CSS, icons to dist/
    generate-icons.js - Raw PNG generation from pixel data (no external image deps)
  dist/
    chrome/           - Built Chrome extension output
    firefox/          - Built Firefox extension output
  agent_workspace/    - Agent analysis artifacts
  package.json        - Project config and scripts
  tsconfig.json       - TypeScript config (ES2020, Preact JSX, strict)
  .gitignore          - node_modules/, dist/, *.tsbuildinfo
  LICENSE             - MIT
```

## Key Architecture Patterns

### Message Passing
All popup-to-background communication uses browser.runtime.sendMessage with typed BackgroundMessage discriminated union. The background script handles: LOGIN, LOGOUT, GET_AUTH, GET_LOOKUP, TRIGGER_SCAN, TRIGGER_RESCAN, CHECK_RESCAN, GET_STREAM_TOKEN, INVALIDATE_CACHE, GET_WEB_LOGIN_URL, GET_SETTINGS, SET_SETTINGS, GET_BAR_DATA, BAR_SETTINGS_CHANGED.

Content script receives UPDATE_BAR messages from background.

### Auth Flow
1. Login via /api/ext/login -> store tokens in browser.storage.local
2. Authenticated requests use Bearer token
3. On 401, auto-refresh via /api/ext/refresh and retry once
4. On refresh failure, clear auth and show login

### Lookup and Caching
- In-memory Map cache in background with 5-minute TTL
- On tab navigation (onUpdated, onActivated), extract domain and update badge
- Cache invalidated before polling for scan progress

### Badge System
- Dynamically generates ImageData icons (no pre-made colored badge images at runtime)
- Score mode: bitmap font renders 0-100 numbers
- Symbol mode: green tick, yellow warning triangle, red stop sign
- Loading: animated spinner with 12 frames at 120ms intervals
- Gray crosshair icon for no-data/not-authenticated state
- Cross-browser: uses `browser.action || browser.browserAction`

### Trust Bar
- Content script injects fixed-position bar via closed Shadow DOM
- Configurable: enable/disable, top/bottom position, 1-4px size
- Colors: green (#22c55e), yellow (#eab308), red (#ef4444)
- Background pushes updates to all matching tabs on scan complete or settings change

### Local/Private Domain Filtering
Both background and popup skip scanning for: localhost, 127.0.0.1, 0.0.0.0, 10.0.2.2, [::1], 192.168.x.x, 10.x.x.x, 172.16-31.x.x.

## Build System
- esbuild-based (build/build.js)
- Four entry points per target: background, popup, content, onboarding
- Chrome: background as ESM, all others IIFE
- Firefox: all IIFE
- Watch mode: incremental rebuilds with source maps
- Production: minified, no source maps
- Static files copied: manifests, HTML, CSS, icons

## Dependencies
- Runtime: preact ^10.25.0, webextension-polyfill ^0.12.0
- Dev: esbuild ^0.24.0, typescript ^5.7.0, @types/webextension-polyfill ^0.12.0

## API Endpoints Used
- POST /api/ext/login - Login with email/password
- POST /api/ext/refresh - Refresh access token
- GET /api/ext/lookup?domain= - Get scan data for domain
- POST /api/scans - Trigger new scan
- GET /api/scans/{id}/rescan-eligibility - Check if rescan is available
- GET /api/scans/{id}/stream-token - Get SSE stream token
- GET /api/ext/web-login-token - Get one-time login URL for web app

## Build Commands
- `npm run build` - Build both Chrome and Firefox
- `npm run build:chrome` - Build Chrome only
- `npm run build:firefox` - Build Firefox only
- `npm run watch` - Watch mode (both targets)
- `npm run clean` - Remove dist/
- `node build/generate-icons.js` - Regenerate PNG icons

## Configuration
- src/common/config.ts: IS_DEV toggle switches between dev (http://localhost:3001) and prod (https://siteray.eu)
- Dev API port: 3001 (backend), Dev Web port: 3000 (Next.js frontend)

## Conventions
- TypeScript strict mode, ES2020 target
- Preact with automatic JSX transform (jsxImportSource: preact)
- Dark theme UI with CSS custom properties
- Console logging prefixed with [SiteRay]
- Error handling: try/catch with fallback returns (never throws to caller unhandled)
- No test framework currently configured
- No linter/formatter currently configured
- No CI/CD pipeline currently configured
