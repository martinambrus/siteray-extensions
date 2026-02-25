const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const watchMode = args.includes('--watch');
const targetArg = args.find(a => a.startsWith('--target='));
const targets = targetArg ? [targetArg.split('=')[1]] : ['chrome', 'firefox'];

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

async function build(target) {
  const outdir = path.join(DIST, target);

  // Clean output directory
  fs.rmSync(outdir, { recursive: true, force: true });
  fs.mkdirSync(outdir, { recursive: true });

  // Copy manifest
  const manifestSrc = path.join(ROOT, 'manifests', `${target}.json`);
  copyFile(manifestSrc, path.join(outdir, 'manifest.json'));

  // Copy popup HTML and CSS
  copyFile(path.join(SRC, 'popup', 'popup.html'), path.join(outdir, 'popup.html'));
  copyFile(path.join(SRC, 'popup', 'popup.css'), path.join(outdir, 'popup.css'));

  // Copy onboarding HTML and CSS
  copyFile(path.join(SRC, 'onboarding', 'onboarding.html'), path.join(outdir, 'onboarding.html'));
  copyFile(path.join(SRC, 'onboarding', 'onboarding.css'), path.join(outdir, 'onboarding.css'));

  // Copy icons
  copyDir(path.join(ROOT, 'src', 'icons'), path.join(outdir, 'icons'));

  const isFirefox = target === 'firefox';

  // Common esbuild options
  const commonOptions = {
    bundle: true,
    minify: !watchMode,
    sourcemap: watchMode,
    target: ['chrome110', 'firefox109'],
    jsx: 'automatic',
    jsxImportSource: 'preact',
    alias: {
      'react': 'preact/compat',
      'react-dom': 'preact/compat',
    },
    define: {
      'process.env.NODE_ENV': watchMode ? '"development"' : '"production"',
    },
  };

  // Build background script
  const bgOptions = {
    ...commonOptions,
    entryPoints: [path.join(SRC, 'background', 'index.ts')],
    outfile: path.join(outdir, 'background.js'),
    format: isFirefox ? 'iife' : 'esm',
  };

  // Build popup script
  const popupOptions = {
    ...commonOptions,
    entryPoints: [path.join(SRC, 'popup', 'index.tsx')],
    outfile: path.join(outdir, 'popup.js'),
    format: 'iife',
  };

  // Build content script
  const contentOptions = {
    ...commonOptions,
    entryPoints: [path.join(SRC, 'content', 'index.ts')],
    outfile: path.join(outdir, 'content.js'),
    format: 'iife',
  };

  // Build onboarding script
  const onboardingOptions = {
    ...commonOptions,
    entryPoints: [path.join(SRC, 'onboarding', 'index.tsx')],
    outfile: path.join(outdir, 'onboarding.js'),
    format: 'iife',
  };

  if (watchMode) {
    const bgCtx = await esbuild.context(bgOptions);
    const popupCtx = await esbuild.context(popupOptions);
    const contentCtx = await esbuild.context(contentOptions);
    const onboardingCtx = await esbuild.context(onboardingOptions);
    await bgCtx.watch();
    await popupCtx.watch();
    await contentCtx.watch();
    await onboardingCtx.watch();
    console.log(`Watching for changes (${target})...`);
  } else {
    await esbuild.build(bgOptions);
    await esbuild.build(popupOptions);
    await esbuild.build(contentOptions);
    await esbuild.build(onboardingOptions);
    console.log(`Built ${target} extension in ${outdir}`);
  }
}

async function main() {
  for (const target of targets) {
    await build(target);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
