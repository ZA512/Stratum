import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function log(message) {
  process.stdout.write(`${message}\n`);
}

function warn(message) {
  process.stderr.write(`${message}\n`);
}

function runNodeScript(filePath, args, { cwd }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [filePath, ...args], {
      cwd,
      env: process.env,
      stdio: ['inherit', 'inherit', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stderr += text;
      process.stderr.write(text);
    });

    child.on('exit', (code) => {
      resolve({ code: code ?? 1, stderr });
    });
  });
}

function runBinary(binary, args, { cwd }) {
  return new Promise((resolve) => {
    const child = spawn(binary, args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

function findMainJs(cwd) {
  const candidates = [
    path.resolve(cwd, 'dist', 'main.js'),
    path.resolve(cwd, 'dist', 'src', 'main.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

async function main() {
  const cwd = process.cwd();

  log(`[backend] Entrypoint started (AUTORUN_MIGRATIONS=${process.env.AUTORUN_MIGRATIONS ?? ''})`);

  const prismaCli = path.resolve(cwd, '..', '..', 'node_modules', 'prisma', 'build', 'index.js');
  const schemaPath = path.resolve(cwd, 'prisma', 'schema.prisma');

  if (!fs.existsSync(prismaCli)) {
    warn(`[backend] Prisma CLI not found at ${prismaCli}`);
  }
  if (!fs.existsSync(schemaPath)) {
    warn(`[backend] Prisma schema not found at ${schemaPath}`);
  }

  const autorun = (process.env.AUTORUN_MIGRATIONS ?? 'false') === 'true';
  if (autorun) {
    log('[backend] Running Prisma migrations...');

    const deploy = await runNodeScript(prismaCli, ['migrate', 'deploy', '--schema', schemaPath], { cwd });
    if (deploy.code === 0) {
      log('[backend] Migrations OK');
    } else {
      warn('[backend] MIGRATIONS FAILED');

      const isP3005 = deploy.stderr.includes('P3005');
      if (!isP3005) {
        process.exit(1);
      }

      const baselineOnP3005 = (process.env.PRISMA_BASELINE_ON_P3005 ?? 'false') === 'true';
      const resetOnP3005 = (process.env.PRISMA_RESET_ON_P3005 ?? 'false') === 'true';

      if (baselineOnP3005) {
        log('[backend] P3005 detected; baselining existing schema (marking migrations as applied)');
        const migrationsDir = path.resolve(cwd, 'prisma', 'migrations');
        const entries = fs.existsSync(migrationsDir)
          ? fs.readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory())
          : [];

        for (const entry of entries) {
          const name = entry.name;
          log(`[backend] Marking migration as applied: ${name}`);
          const resolveResult = await runNodeScript(
            prismaCli,
            ['migrate', 'resolve', '--applied', name, '--schema', schemaPath],
            { cwd },
          );
          if (resolveResult.code !== 0) {
            warn(`[backend] Failed to mark migration ${name} as applied`);
            process.exit(1);
          }
        }

        log('[backend] Retrying migrations after baseline');
        const retry = await runNodeScript(prismaCli, ['migrate', 'deploy', '--schema', schemaPath], { cwd });
        if (retry.code !== 0) process.exit(1);
        log('[backend] Migrations OK after baseline');
      } else if (resetOnP3005) {
        warn('[backend] P3005 detected; resetting database (destructive)');
        const reset = await runNodeScript(
          prismaCli,
          ['migrate', 'reset', '--force', '--skip-seed', '--schema', schemaPath],
          { cwd },
        );
        if (reset.code !== 0) process.exit(1);

        log('[backend] Retrying migrations after reset');
        const retry = await runNodeScript(prismaCli, ['migrate', 'deploy', '--schema', schemaPath], { cwd });
        if (retry.code !== 0) process.exit(1);
        log('[backend] Migrations OK after reset');
      } else {
        warn('[backend] Set PRISMA_BASELINE_ON_P3005=true to mark existing schema as migrated,');
        warn('[backend] or PRISMA_RESET_ON_P3005=true to wipe and re-run migrations (destructive).');
        process.exit(1);
      }
    }
  } else {
    log('[backend] Auto migrations disabled');
  }

  const seedOnStart = (process.env.SEED_ON_START ?? 'false') === 'true';
  if (seedOnStart) {
    log('[backend] Running DB seed...');
    const code = await runBinary('npm', ['--workspace', 'backend', 'run', 'db:seed'], { cwd: path.resolve(cwd, '..', '..') });
    if (code !== 0) warn('[backend] Seed failed (continuing)');
  }

  const mainJs = findMainJs(cwd);
  if (!mainJs) {
    warn('[backend] Could not find built main.js (expected dist/main.js or dist/src/main.js)');
    process.exit(1);
  }

  log('[backend] Starting application');
  const app = spawn(process.execPath, [mainJs], { cwd, env: process.env, stdio: 'inherit' });

  const forwardSignal = (signal) => {
    try {
      app.kill(signal);
    } catch {
      // ignore
    }
  };

  process.on('SIGTERM', () => forwardSignal('SIGTERM'));
  process.on('SIGINT', () => forwardSignal('SIGINT'));

  app.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  warn(`[backend] Entrypoint failed: ${err?.stack ?? String(err)}`);
  process.exit(1);
});
