-- Add an integer priority to tasks (0 = default/lowest). Existing rows
-- backfill to 0 via the column default.
ALTER TABLE tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
