-- Back the keyset pagination scan (ORDER BY created_at DESC, id DESC).
-- SQLite can walk an ASC index in reverse, so ascending indexes serve the
-- DESC ordering. These supersede idx_tasks_status for the queries in list().

-- Status-filtered pagination: status equality + (created_at, id) keyset range.
CREATE INDEX idx_tasks_status_created_id ON tasks (status, created_at, id);

-- Unfiltered pagination: (created_at, id) keyset range across all rows.
CREATE INDEX idx_tasks_created_id ON tasks (created_at, id);
