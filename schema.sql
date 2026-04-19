-- Core schema only.
-- Keep this file safe to run in production and safe to re-run.

CREATE TABLE IF NOT EXISTS diary_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_uuid TEXT UNIQUE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    content_type TEXT DEFAULT 'markdown',
    mood TEXT DEFAULT 'neutral',
    weather TEXT DEFAULT 'unknown',
    images TEXT DEFAULT '[]',
    location TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME DEFAULT NULL,
    tags TEXT DEFAULT '[]',
    hidden INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_diary_entries_created_at ON diary_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_diary_entries_updated_at ON diary_entries(updated_at);
CREATE INDEX IF NOT EXISTS idx_diary_entries_deleted_at ON diary_entries(deleted_at);
CREATE INDEX IF NOT EXISTS idx_diary_entries_sync_cursor ON diary_entries(unixepoch(COALESCE(deleted_at, updated_at)));
CREATE INDEX IF NOT EXISTS idx_diary_entries_mood ON diary_entries(mood);
CREATE UNIQUE INDEX IF NOT EXISTS idx_diary_entries_entry_uuid ON diary_entries(entry_uuid);
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(setting_key);
