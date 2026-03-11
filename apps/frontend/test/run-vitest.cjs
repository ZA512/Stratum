#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require('node:child_process');

function runVitest() {
  let vitestBin;
  try {
    const resolutionPaths = [__dirname, process.cwd()];
    try {
      vitestBin = require.resolve('vitest/vitest.mjs', { paths: resolutionPaths });
    } catch {
      vitestBin = require.resolve('vitest/bin/vitest.mjs', { paths: resolutionPaths });
    }
  } catch {
    console.warn(
      '[frontend:test] Vitest n\'est pas installé. Exécutez `npm install` dans le workspace frontend pour lancer les tests.',
    );
    return 0;
  }

  const extraArgs = process.argv.slice(2);
  const args = extraArgs.length > 0 ? [vitestBin, ...extraArgs] : [vitestBin, 'run'];

  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env: process.env,
  });

  return result.status ?? 1;
}

process.exit(runVitest());
