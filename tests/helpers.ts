import { createDb } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { createApp } from '../src/app.js';

/** Builds an app backed by a fresh in-memory SQLite database. */
export function createTestApp() {
  const db = createDb(':memory:');
  runMigrations(db);
  const app = createApp(db);
  return { app, db };
}
