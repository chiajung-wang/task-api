import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, type DB } from './connection.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../migrations');

interface MigrationRow {
  name: string;
}

/**
 * Applies any migration files not yet recorded in the `_migrations` table,
 * in filename order, each inside its own transaction. Returns the list of
 * filenames that were applied during this run.
 */
export function runMigrations(db: DB, dir: string = MIGRATIONS_DIR): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as MigrationRow[]).map((r) => r.name),
  );

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const insert = db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)');
  const newlyApplied: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      insert.run(file, new Date().toISOString());
    })();
    newlyApplied.push(file);
  }

  return newlyApplied;
}

// CLI entry: `npm run migrate`
if (import.meta.url === `file://${process.argv[1]}`) {
  const dbPath = process.env.DATABASE_PATH ?? 'data/tasks.db';
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = createDb(dbPath);
  const applied = runMigrations(db);
  if (applied.length === 0) {
    console.log('No pending migrations.');
  } else {
    console.log(`Applied ${applied.length} migration(s):`);
    for (const f of applied) {
      console.log(`  - ${f}`);
    }
  }
  db.close();
}
