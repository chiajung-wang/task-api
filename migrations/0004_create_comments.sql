CREATE TABLE comments (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  author     TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_comments_task_id ON comments (task_id);
