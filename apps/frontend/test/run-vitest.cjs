#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require('node:child_process');

function runVitest() {
  let vitestBin;
  try {
    vitestBin = require.resolve('vitest/bin/vitest.mjs', { paths: [__dirname] });
  } catch {
    console.warn(
      '[frontend:test] Vitest n\'est pas installé. Exécutez `npm install` dans le workspace frontend pour lancer les tests.',
    );
    return 0;
  }

  const result = spawnSync(process.execPath, [vitestBin], {
    stdio: 'inherit',
    env: process.env,
  });

  return result.status ?? 1;
}

process.exit(runVitest());
