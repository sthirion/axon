import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const packageJson = path.join(srcDir, '..', 'package.json');

// The only module allowed to touch the file system: static file serving.
const FS_ALLOWED = new Set(['http/app.ts']);

const PERSISTENCE_MODULES =
  /^(node:)?(fs|fs\/promises|sqlite|better-sqlite3|sqlite3|pg|mysql2?|mongodb|mongoose|redis|ioredis|level|lowdb|typeorm|prisma|@prisma\/client|knex|sequelize|@aws-sdk\/.+|@azure\/storage-.+|@google-cloud\/.+)$/;

const PERSISTENCE_DEPENDENCIES =
  /^(better-sqlite3|sqlite3|pg|mysql2?|mongodb|mongoose|redis|ioredis|level|lowdb|typeorm|prisma|@prisma\/client|knex|sequelize|@aws-sdk\/.+|@azure\/storage-.+|@google-cloud\/.+)$/;

function productionSources(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'testing' ? [] : productionSources(full, base);
    }
    const isSource = entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts');
    return isSource ? [path.relative(base, full).split(path.sep).join('/')] : [];
  });
}

function importedModules(source: string): string[] {
  const pattern = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;
  return [...source.matchAll(pattern)].map((match) => match[1]!);
}

describe('persistence guard (AC-10)', () => {
  const sources = productionSources(srcDir);

  it('finds the production modules to scan', () => {
    expect(sources).toEqual(expect.arrayContaining(['http/app.ts', 'store/gameStore.ts']));
  });

  it('imports no persistence module outside static file serving', () => {
    const offenders = sources
      .filter((file) => !FS_ALLOWED.has(file))
      .filter((file) =>
        importedModules(readFileSync(path.join(srcDir, file), 'utf8')).some((name) =>
          PERSISTENCE_MODULES.test(name),
        ),
      );

    expect(offenders).toEqual([]);
  });

  it('only imports fs in the allow-listed module', () => {
    const importsFs = sources.filter((file) =>
      importedModules(readFileSync(path.join(srcDir, file), 'utf8')).some((name) =>
        /^(node:)?fs(\/promises)?$/.test(name),
      ),
    );

    expect(importsFs).toEqual([...FS_ALLOWED]);
  });

  it('declares no database or storage dependency', () => {
    const pkg = JSON.parse(readFileSync(packageJson, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];

    expect(names.filter((name) => PERSISTENCE_DEPENDENCIES.test(name))).toEqual([]);
  });

  it('detects a persistence import in a sample source', () => {
    const sample = "import { writeFile } from 'node:fs/promises';\nimport pg from 'pg';";

    expect(importedModules(sample).filter((name) => PERSISTENCE_MODULES.test(name))).toEqual([
      'node:fs/promises',
      'pg',
    ]);
  });
});
