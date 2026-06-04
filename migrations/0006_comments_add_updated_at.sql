-- Add updated_at so comment edits are observable (mirrors the tasks convention).
-- Backfill existing rows to created_at: a never-edited comment's updated_at
-- equals its created_at.
ALTER TABLE comments ADD COLUMN updated_at TEXT;
UPDATE comments SET updated_at = created_at WHERE updated_at IS NULL;
