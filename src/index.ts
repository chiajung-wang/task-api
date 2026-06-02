import { serve } from '@hono/node-server';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createDb } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { createApp } from './app.js';

const dbPath = process.env.DATABASE_PATH ?? 'data/tasks.db';
mkdirSync(dirname(dbPath), { recursive: true });

const db = createDb(dbPath);
runMigrations(db);

const app = createApp(db);
const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Task API listening on http://localhost:${info.port}`);
});
