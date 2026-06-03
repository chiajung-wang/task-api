-- Add an optional ISO-8601 due date to tasks. Nullable; existing rows
-- backfill to NULL (no column default needed).
ALTER TABLE tasks ADD COLUMN due_date TEXT;
