-- Run this once for existing D1 databases created before incremental sync support.
-- New deployments that execute schema.sql from scratch do not need this file separately.

ALTER TABLE diary_entries ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_diary_entries_updated_at
ON diary_entries(updated_at);

CREATE INDEX IF NOT EXISTS idx_diary_entries_deleted_at
ON diary_entries(deleted_at);

CREATE INDEX IF NOT EXISTS idx_diary_entries_sync_cursor
ON diary_entries(unixepoch(COALESCE(deleted_at, updated_at)));
