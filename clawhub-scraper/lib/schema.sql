CREATE TABLE IF NOT EXISTS skills (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT NOT NULL UNIQUE,
    display_name    TEXT,
    summary         TEXT,
    tags_json       TEXT,
    stats_json      TEXT,
    metadata_json   TEXT,
    license         TEXT,
    homepage        TEXT,
    created_at      INTEGER,
    updated_at      INTEGER,
    latest_version  TEXT,

    -- Scraping
    scrape_status   TEXT NOT NULL DEFAULT 'pending',
    skill_md_raw    TEXT,
    skill_files_json TEXT,
    scrape_error    TEXT,
    scraped_at      TEXT,

    -- Filtering
    china_friendly  INTEGER,
    filter_reason   TEXT,
    filter_tags_json TEXT,
    filtered_at     TEXT,

    -- Translation
    translate_status TEXT DEFAULT 'pending',
    skill_md_cn     TEXT,
    translate_batch TEXT,
    translate_error TEXT,
    translated_at   TEXT,

    row_created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    row_updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_skills_scrape_status ON skills(scrape_status);
CREATE INDEX IF NOT EXISTS idx_skills_china_friendly ON skills(china_friendly);
CREATE INDEX IF NOT EXISTS idx_skills_translate_status ON skills(translate_status);
CREATE INDEX IF NOT EXISTS idx_skills_slug ON skills(slug);

CREATE TABLE IF NOT EXISTS scrape_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    last_cursor TEXT,
    total_listed INTEGER DEFAULT 0,
    total_downloaded INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    status      TEXT DEFAULT 'running'
);

CREATE TABLE IF NOT EXISTS translate_batches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_file  TEXT NOT NULL,
    skill_count INTEGER,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    status      TEXT DEFAULT 'pending'
);
