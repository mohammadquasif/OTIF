"""
OTIF — Neon PostgreSQL Schema Setup Script
Run once to create all tables and roles.

Usage:
    uv run python scripts/seed_neon_schema.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import asyncpg
from dotenv import load_dotenv

load_dotenv("../.env")

NEON_OWNER_URL = os.environ.get("NEON_OWNER_URL", "")


SCHEMA_SQL = """
-- ═══════════════════════════════════════════════════════════
-- OTIF SKILL ENGINE — Neon PostgreSQL Schema
-- Community Living Intelligence Database
-- ═══════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Skills Master Registry ─────────────────────────────────
CREATE TABLE IF NOT EXISTS skills (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id            VARCHAR(100) UNIQUE NOT NULL,
    name                VARCHAR(255) NOT NULL,
    category            VARCHAR(100) NOT NULL,
    version             VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    description         TEXT,
    ethical_boundary    TEXT,
    trigger_phrases     JSONB DEFAULT '[]',
    is_active           BOOLEAN DEFAULT TRUE,
    is_universal        BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Versioned Skill Content ────────────────────────────────
CREATE TABLE IF NOT EXISTS skill_versions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id            UUID REFERENCES skills(id) ON DELETE CASCADE,
    version             VARCHAR(20) NOT NULL,
    content             JSONB NOT NULL,
    changelog           TEXT,
    published_by        VARCHAR(255) DEFAULT 'system',
    published_at        TIMESTAMPTZ DEFAULT NOW(),
    is_current          BOOLEAN DEFAULT FALSE
);

-- ─── Rules (Individual Actionable Intelligence) ─────────────
CREATE TABLE IF NOT EXISTS skill_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id            UUID REFERENCES skills(id) ON DELETE CASCADE,
    rule_code           VARCHAR(100) NOT NULL,
    rule_name           VARCHAR(255) NOT NULL,
    rule_type           VARCHAR(50) NOT NULL DEFAULT 'detection',
    severity            VARCHAR(20) NOT NULL DEFAULT 'medium',
    description         TEXT,
    pattern             TEXT,
    replacement         TEXT,
    example_before      TEXT,
    example_after       TEXT,
    confidence          FLOAT DEFAULT 0.8,
    trigger_count       INTEGER DEFAULT 0,
    success_count       INTEGER DEFAULT 0,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(skill_id, rule_code)
);

-- ─── Word Lists (Banned/Preferred Phrases from Skills) ──────
CREATE TABLE IF NOT EXISTS skill_word_lists (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id            UUID REFERENCES skills(id) ON DELETE CASCADE,
    list_type           VARCHAR(50) NOT NULL DEFAULT 'banned',
    word_or_phrase      VARCHAR(500) NOT NULL,
    replacement         VARCHAR(500),
    severity            VARCHAR(20) DEFAULT 'medium',
    language            VARCHAR(50) DEFAULT 'en',
    academic_context    VARCHAR(100) DEFAULT 'general',
    confidence          FLOAT DEFAULT 0.8,
    trigger_count       INTEGER DEFAULT 0,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── AI Prompt Templates ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS skill_prompts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id            UUID REFERENCES skills(id) ON DELETE CASCADE,
    prompt_type         VARCHAR(100) NOT NULL,
    template            TEXT NOT NULL,
    model_hint          VARCHAR(100),
    max_tokens          INTEGER DEFAULT 2000,
    temperature         FLOAT DEFAULT 0.7,
    version             VARCHAR(20) DEFAULT '1.0.0',
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Scoring Thresholds ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS skill_thresholds (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id            UUID REFERENCES skills(id) ON DELETE CASCADE,
    metric_name         VARCHAR(100) NOT NULL,
    excellent_min       FLOAT DEFAULT 90,
    good_min            FLOAT DEFAULT 75,
    fair_min            FLOAT DEFAULT 60,
    poor_min            FLOAT DEFAULT 40,
    critical_below      FLOAT DEFAULT 40,
    target_value        FLOAT DEFAULT 85,
    unit                VARCHAR(20) DEFAULT 'percent'
);

-- ─── Skill Packs (Bundled for specific norms/use cases) ──────
CREATE TABLE IF NOT EXISTS skill_packs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pack_id             VARCHAR(100) UNIQUE NOT NULL,
    name                VARCHAR(255) NOT NULL,
    description         TEXT,
    norm_standard       VARCHAR(100),
    target_doc_type     VARCHAR(100),
    skills              JSONB DEFAULT '[]',
    version             VARCHAR(20) DEFAULT '1.0.0',
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Community Learning Events ───────────────────────────────
-- PRIVACY: Only statistical signals stored, NO text content
CREATE TABLE IF NOT EXISTS skill_learning_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          VARCHAR(100) NOT NULL,
    skill_id            UUID REFERENCES skills(id),
    rule_id             UUID REFERENCES skill_rules(id),
    event_type          VARCHAR(100) NOT NULL,
    doc_type            VARCHAR(100),
    section_type        VARCHAR(100),
    before_score        FLOAT,
    after_score         FLOAT,
    improvement_delta   FLOAT,
    user_accepted       BOOLEAN,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Aggregated Skill Performance ───────────────────────────
CREATE TABLE IF NOT EXISTS skill_performance (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id            UUID REFERENCES skills(id) UNIQUE,
    rule_id             UUID REFERENCES skill_rules(id),
    total_triggers      INTEGER DEFAULT 0,
    accepted_count      INTEGER DEFAULT 0,
    rejection_count     INTEGER DEFAULT 0,
    avg_improvement     FLOAT DEFAULT 0.0,
    confidence_score    FLOAT DEFAULT 0.8,
    last_updated        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Proposed New Rules (from community discoveries) ─────────
CREATE TABLE IF NOT EXISTS skill_proposed_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id            UUID REFERENCES skills(id),
    proposed_rule_code  VARCHAR(100),
    description         TEXT,
    pattern             TEXT,
    replacement         TEXT,
    confidence          FLOAT DEFAULT 0.5,
    submission_count    INTEGER DEFAULT 1,
    status              VARCHAR(50) DEFAULT 'pending',  -- pending|approved|rejected
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Formatting Templates ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS formatting_templates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id         VARCHAR(100) UNIQUE NOT NULL,
    name                VARCHAR(255) NOT NULL,
    norm                VARCHAR(100) NOT NULL,
    rules               JSONB NOT NULL,
    version             VARCHAR(20) DEFAULT '1.0.0',
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Research Source Registry ─────────────────────────────────
CREATE TABLE IF NOT EXISTS research_sources (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id           VARCHAR(100) UNIQUE NOT NULL,
    name                VARCHAR(255) NOT NULL,
    base_url            VARCHAR(500),
    source_type         VARCHAR(100),  -- api | oai_pmh | rss
    requires_key        BOOLEAN DEFAULT FALSE,
    is_active           BOOLEAN DEFAULT TRUE,
    priority            INTEGER DEFAULT 5,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Release History ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS release_history (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version             VARCHAR(20) UNIQUE NOT NULL,
    release_type        VARCHAR(50),
    notes               TEXT,
    skill_changes       JSONB DEFAULT '[]',
    released_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ INDEXES ════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_active ON skills(is_active);
CREATE INDEX IF NOT EXISTS idx_skill_rules_skill ON skill_rules(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_rules_confidence ON skill_rules(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_learning_events_session ON skill_learning_events(session_id);
CREATE INDEX IF NOT EXISTS idx_learning_events_skill ON skill_learning_events(skill_id);
CREATE INDEX IF NOT EXISTS idx_learning_events_type ON skill_learning_events(event_type);
CREATE INDEX IF NOT EXISTS idx_word_lists_word ON skill_word_lists(word_or_phrase);
CREATE INDEX IF NOT EXISTS idx_word_lists_skill ON skill_word_lists(skill_id);
CREATE INDEX IF NOT EXISTS idx_word_lists_type ON skill_word_lists(list_type);
CREATE INDEX IF NOT EXISTS idx_proposed_rules_status ON skill_proposed_rules(status);

-- ═══ TRIGGER: auto-update updated_at ════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS skills_updated_at ON skills;
CREATE TRIGGER skills_updated_at
    BEFORE UPDATE ON skills
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS skill_rules_updated_at ON skill_rules;
CREATE TRIGGER skill_rules_updated_at
    BEFORE UPDATE ON skill_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══ SEED: Research Sources ══════════════════════════════════
INSERT INTO research_sources (source_id, name, base_url, source_type, requires_key, priority)
VALUES
    ('openalex', 'OpenAlex', 'https://api.openalex.org', 'api', false, 10),
    ('arxiv', 'arXiv', 'http://export.arxiv.org/api', 'api', false, 9),
    ('crossref', 'Crossref', 'https://api.crossref.org', 'api', false, 9),
    ('core', 'CORE', 'https://api.core.ac.uk/v3', 'api', true, 8),
    ('europe_pmc', 'Europe PMC', 'https://www.ebi.ac.uk/europepmc/webservices/rest', 'api', false, 7),
    ('zenodo', 'Zenodo', 'https://zenodo.org/api', 'api', false, 7),
    ('semantic_scholar', 'Semantic Scholar', 'https://api.semanticscholar.org/graph/v1', 'api', false, 8),
    ('unpaywall', 'Unpaywall', 'https://api.unpaywall.org/v2', 'api', false, 6)
ON CONFLICT (source_id) DO NOTHING;
"""

ROLES_SQL = """
-- ═══ READ-ONLY ROLE for skill pulling ════════════════════════
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'otif_reader') THEN
        CREATE ROLE otif_reader WITH LOGIN PASSWORD 'otif_read_2026';
    END IF;
END $$;

GRANT CONNECT ON DATABASE neondb TO otif_reader;
GRANT USAGE ON SCHEMA public TO otif_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO otif_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO otif_reader;

-- ═══ WRITE ROLE for skill confidence updates ══════════════════
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'otif_writer') THEN
        CREATE ROLE otif_writer WITH LOGIN PASSWORD 'otif_write_2026';
    END IF;
END $$;

GRANT CONNECT ON DATABASE neondb TO otif_writer;
GRANT USAGE ON SCHEMA public TO otif_writer;
GRANT SELECT, INSERT, UPDATE ON
    skill_learning_events, skill_performance, skill_proposed_rules, skill_rules
TO otif_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE ON TABLES TO otif_writer;
"""


async def setup_schema():
    print("[OTIF] Setting up Neon PostgreSQL schema...")

    if not NEON_OWNER_URL:
        print("❌ NEON_OWNER_URL not set in .env")
        sys.exit(1)

    conn = await asyncpg.connect(NEON_OWNER_URL)
    try:
        print("✅ Connected to Neon DB")

        # Run schema
        await conn.execute(SCHEMA_SQL)
        print("✅ Schema created (all tables + indexes + triggers)")

        # Try to create roles (may fail if not superuser — that's OK)
        try:
            await conn.execute(ROLES_SQL)
            print("✅ DB roles created (otif_reader, otif_writer)")
        except Exception as e:
            print(f"⚠️  Role creation skipped (may need superuser): {e}")
            print("   Using owner credentials for all operations")

        print("\n🎉 Neon DB schema setup complete!")
        print("   Next: run python scripts/seed_skills.py")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(setup_schema())
