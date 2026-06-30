"""
OTIF — Skill Seeder
Seeds the Neon PostgreSQL database with the initial 6 community skills.
Converts skill-seeds/*.json files into full database records.

Usage:
    uv run python scripts/seed_skills.py
    uv run python scripts/seed_skills.py --dry-run
"""
import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import asyncpg
from dotenv import load_dotenv

load_dotenv("../.env")

NEON_OWNER_URL = os.environ.get("NEON_OWNER_URL", "")
SEEDS_DIR = Path(__file__).parent.parent.parent / "skill-seeds"

DRY_RUN = "--dry-run" in sys.argv


async def seed_all_skills():
    print(f"\n🌱 OTIF Skill Seeder {'(DRY RUN)' if DRY_RUN else ''}")
    print(f"   Loading seeds from: {SEEDS_DIR}\n")

    if not NEON_OWNER_URL:
        print("❌ NEON_OWNER_URL not set in .env")
        sys.exit(1)

    seed_files = sorted(SEEDS_DIR.glob("*.json"))
    if not seed_files:
        print(f"❌ No seed files found in {SEEDS_DIR}")
        sys.exit(1)

    print(f"📁 Found {len(seed_files)} seed files")

    conn = await asyncpg.connect(NEON_OWNER_URL)
    try:
        for seed_file in seed_files:
            print(f"\n📄 Processing: {seed_file.name}")
            with open(seed_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            await seed_skill(conn, data)

        print("\n🎉 All skills seeded successfully!")
        print("\nSkill summary:")
        rows = await conn.fetch("SELECT skill_id, name, category, version FROM skills ORDER BY category, name")
        for row in rows:
            print(f"   ✅ [{row['category']:15}] {row['skill_id']:30} v{row['version']}")

    finally:
        await conn.close()


async def seed_skill(conn: asyncpg.Connection, data: dict):
    """Seed a single skill and all its sub-records."""
    skill_id = data["skill_id"]

    # ── Upsert skill ──────────────────────────────────────────────
    if not DRY_RUN:
        skill_uuid = await conn.fetchval("""
            INSERT INTO skills (skill_id, name, category, version, description,
                                ethical_boundary, trigger_phrases, is_active, is_universal)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, TRUE, TRUE)
            ON CONFLICT (skill_id) DO UPDATE SET
                name = EXCLUDED.name,
                category = EXCLUDED.category,
                version = EXCLUDED.version,
                description = EXCLUDED.description,
                ethical_boundary = EXCLUDED.ethical_boundary,
                trigger_phrases = EXCLUDED.trigger_phrases,
                updated_at = NOW()
            RETURNING id
        """,
            data["skill_id"],
            data["name"],
            data["category"],
            data.get("version", "1.0.0"),
            data.get("description", ""),
            data.get("ethical_boundary", ""),
            json.dumps(data.get("trigger_phrases", [])),
        )
    else:
        skill_uuid = "dry-run-uuid"
        print(f"   [DRY] Would upsert skill: {data['name']}")

    # ── Seed rules ────────────────────────────────────────────────
    rules = data.get("rules", [])
    for rule in rules:
        if not DRY_RUN:
            await conn.execute("""
                INSERT INTO skill_rules
                (skill_id, rule_code, rule_name, rule_type, severity, description,
                 pattern, replacement, example_before, example_after, confidence)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (skill_id, rule_code) DO UPDATE SET
                    rule_name = EXCLUDED.rule_name,
                    description = EXCLUDED.description,
                    confidence = EXCLUDED.confidence,
                    updated_at = NOW()
            """,
                skill_uuid,
                rule["rule_code"], rule["rule_name"],
                rule.get("rule_type", "detection"),
                rule.get("severity", "medium"),
                rule.get("description", ""),
                rule.get("pattern"), rule.get("replacement"),
                rule.get("example_before"), rule.get("example_after"),
                float(rule.get("confidence", 0.8)),
            )
        else:
            print(f"   [DRY] Would seed rule: {rule['rule_code']} — {rule['rule_name']}")

    print(f"   ✅ Rules: {len(rules)}")

    # ── Seed word lists ───────────────────────────────────────────
    word_lists = data.get("word_lists", [])
    for word in word_lists:
        if not DRY_RUN:
            await conn.execute("""
                INSERT INTO skill_word_lists
                (skill_id, list_type, word_or_phrase, replacement, severity, confidence)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT DO NOTHING
            """,
                skill_uuid,
                word.get("list_type", "banned"),
                word["word_or_phrase"],
                word.get("replacement"),
                word.get("severity", "medium"),
                float(word.get("confidence", 0.8)),
            )
        else:
            print(f"   [DRY] Would seed word: {word['word_or_phrase']}")

    print(f"   ✅ Word lists: {len(word_lists)}")

    # ── Seed prompts ──────────────────────────────────────────────
    prompts = data.get("prompts", {})
    for prompt_type, prompt_data in prompts.items():
        if not DRY_RUN:
            await conn.execute("""
                INSERT INTO skill_prompts
                (skill_id, prompt_type, template, model_hint, max_tokens, temperature)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT DO NOTHING
            """,
                skill_uuid,
                prompt_type,
                prompt_data["template"],
                prompt_data.get("model_hint"),
                prompt_data.get("max_tokens", 2000),
                float(prompt_data.get("temperature", 0.7)),
            )

    print(f"   ✅ Prompts: {len(prompts)}")

    # ── Seed thresholds ───────────────────────────────────────────
    thresholds = data.get("thresholds", [])
    for thresh in thresholds:
        if not DRY_RUN:
            await conn.execute("""
                INSERT INTO skill_thresholds
                (skill_id, metric_name, excellent_min, good_min, fair_min,
                 poor_min, critical_below, target_value, unit)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT DO NOTHING
            """,
                skill_uuid,
                thresh["metric_name"],
                float(thresh.get("excellent_min", 90)),
                float(thresh.get("good_min", 75)),
                float(thresh.get("fair_min", 60)),
                float(thresh.get("poor_min", 40)),
                float(thresh.get("critical_below", 40)),
                float(thresh.get("target_value", 85)),
                thresh.get("unit", "percent"),
            )

    print(f"   ✅ Thresholds: {len(thresholds)}")
    print(f"   ✅ Skill '{data['name']}' seeded")


if __name__ == "__main__":
    asyncio.run(seed_all_skills())
