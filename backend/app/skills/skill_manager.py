"""
OTIF Skill Engine — The Living Community Intelligence System

Architecture:
  - PULL skills from Neon on startup (like antivirus pulling definitions)
  - APPLY skills during every analysis and research session
  - DISCOVER new patterns from research results
  - APPROVE via user before any contribution
  - UPDATE community skill DB with approved findings

This creates a self-improving academic integrity intelligence network.
"""
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum

from app.config import settings
from app.core import neon_db

logger = logging.getLogger(__name__)


def _version_tuple(version: str) -> tuple[int, ...]:
    parts = []
    for part in version.split("."):
        try:
            parts.append(int(part))
        except ValueError:
            parts.append(0)
    return tuple(parts)


# ─────────────────────────────────────────────────────────────────
# Data Models
# ─────────────────────────────────────────────────────────────────

class SkillCategory(str, Enum):
    PLAGIARISM = "plagiarism"
    AI_DETECTION = "ai_detection"
    HUMANIZATION = "humanization"
    WRITING = "writing"
    FORMATTING = "formatting"
    QUALITY = "quality"
    CITATION = "citation"
    RESEARCH = "research"


class RuleType(str, Enum):
    DETECTION = "detection"      # Detect a problem
    REWRITE = "rewrite"          # Suggest how to rewrite
    FORMAT = "format"            # Formatting rule
    SCORE = "score"              # Scoring threshold
    PATTERN = "pattern"          # Pattern matching


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class SkillRule:
    id: str
    rule_code: str
    rule_name: str
    rule_type: RuleType
    severity: Severity
    description: str
    pattern: str | None = None
    replacement: str | None = None
    example_before: str | None = None
    example_after: str | None = None
    confidence: float = 0.8
    trigger_count: int = 0
    success_count: int = 0

    @property
    def success_rate(self) -> float:
        if self.trigger_count == 0:
            return 0.0
        return self.success_count / self.trigger_count


@dataclass
class SkillWordEntry:
    word_or_phrase: str
    replacement: str | None
    severity: Severity
    list_type: str  # banned | preferred | jargon | neutral
    confidence: float = 0.8


@dataclass
class SkillPrompt:
    prompt_type: str
    template: str
    model_hint: str | None = None
    max_tokens: int = 2000
    temperature: float = 0.7


@dataclass
class ScoringThreshold:
    metric_name: str
    excellent_min: float
    good_min: float
    fair_min: float
    poor_min: float
    critical_below: float
    target_value: float


@dataclass
class Skill:
    id: str
    skill_id: str
    name: str
    category: SkillCategory
    version: str
    description: str
    ethical_boundary: str
    trigger_phrases: list[str]
    rules: list[SkillRule] = field(default_factory=list)
    word_lists: list[SkillWordEntry] = field(default_factory=list)
    prompts: dict[str, SkillPrompt] = field(default_factory=dict)
    thresholds: list[ScoringThreshold] = field(default_factory=list)
    loaded_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def banned_words(self) -> list[SkillWordEntry]:
        return [w for w in self.word_lists if w.list_type == "banned"]

    @property
    def preferred_words(self) -> list[SkillWordEntry]:
        return [w for w in self.word_lists if w.list_type == "preferred"]


@dataclass
class LearningEvent:
    """Records what happened during a session — for skill improvement."""
    session_id: str
    skill_id: str
    rule_id: str | None
    event_type: str          # triggered | applied | improved | rejected | failed
    doc_type: str            # thesis | journal | report
    section_type: str        # abstract | literature | methodology | results | conclusion
    before_score: float | None = None
    after_score: float | None = None
    user_accepted: bool | None = None
    # NO text content — only statistical signals (privacy)

    @property
    def improvement_delta(self) -> float | None:
        if self.before_score is not None and self.after_score is not None:
            return self.after_score - self.before_score
        return None


@dataclass
class NewPatternDiscovery:
    """A new pattern discovered during research that could improve a skill."""
    skill_id: str
    pattern_type: str
    description: str
    suggested_rule_code: str
    suggested_replacement: str | None
    confidence: float
    discovered_from: str  # e.g. "arxiv_comparison" | "similarity_analysis"


# ─────────────────────────────────────────────────────────────────
# Skill Cache (local, in-memory + SQLite fallback)
# ─────────────────────────────────────────────────────────────────

class SkillCache:
    """In-memory skill cache loaded at startup."""

    def __init__(self):
        self._skills: dict[str, Skill] = {}
        self._loaded_at: datetime | None = None
        self._version: str = "none"

    def load(self, skills: list[Skill]) -> None:
        self._skills = {s.skill_id: s for s in skills}
        self._loaded_at = datetime.now(timezone.utc)
        logger.info(f"✅ Skill cache loaded: {len(skills)} skills")

    def get(self, skill_id: str) -> Skill | None:
        return self._skills.get(skill_id)

    def get_by_category(self, category: SkillCategory) -> list[Skill]:
        return [s for s in self._skills.values() if s.category == category]

    def all(self) -> list[Skill]:
        return list(self._skills.values())

    def is_loaded(self) -> bool:
        return len(self._skills) > 0

    @property
    def status(self) -> dict:
        return {
            "loaded": self.is_loaded(),
            "skill_count": len(self._skills),
            "loaded_at": self._loaded_at.isoformat() if self._loaded_at else None,
            "skills": [
                {
                    "skill_id": s.skill_id,
                    "name": s.name,
                    "category": s.category,
                    "version": s.version,
                    "rules": len(s.rules),
                    "word_entries": len(s.word_lists),
                }
                for s in self._skills.values()
            ],
        }


# ─────────────────────────────────────────────────────────────────
# Skill Manager — The Antivirus Engine
# ─────────────────────────────────────────────────────────────────

class SkillManager:
    """
    The OTIF Living Skill Engine.

    Like an antivirus system:
    1. Pulls skill definitions from Neon DB on every startup
    2. Applies skills during document analysis and research
    3. Captures learning events (what triggered, what improved)
    4. After user approval: pushes improved confidence scores back to Neon
    5. New patterns discovered during research can become new rules
    """

    def __init__(self):
        self.cache = SkillCache()
        self._pending_events: list[LearningEvent] = []
        self._pending_discoveries: list[NewPatternDiscovery] = []
        self._session_id: str | None = None

    # ─── 1. PULL ────────────────────────────────────────────────

    async def startup_pull(self) -> dict:
        """
        Pull all active skills from Neon DB on app startup.
        Falls back to bundled seed data if offline.
        Returns status dict.
        """
        logger.info("🔄 Pulling skills from Neon DB...")

        if not await neon_db.is_connected():
            logger.warning("⚠️  Neon DB offline — loading bundled seed skills")
            return await self._load_seed_skills()

        try:
            skills = await self._fetch_all_skills_from_neon()
            skills = self._overlay_newer_seed_skills(skills)
            self.cache.load(skills)
            logger.info(f"✅ {len(skills)} skills pulled from Neon DB")
            return self.cache.status

        except Exception as e:
            logger.error(f"❌ Skill pull failed: {e} — loading seed skills")
            return await self._load_seed_skills()

    async def sync_for_project(self, project_id: str) -> dict:
        """Pull latest skills specifically triggered for a project workspace."""
        status = await self.startup_pull()
        status["project_id"] = project_id
        return status

    async def _fetch_all_skills_from_neon(self) -> list[Skill]:
        """Fetch all active skills with their rules, word lists, prompts, thresholds."""
        # Fetch base skills
        skill_rows = await neon_db.execute_read("""
            SELECT id, skill_id, name, category, version, description,
                   ethical_boundary, trigger_phrases
            FROM skills
            WHERE is_active = TRUE
            ORDER BY category, name
        """)

        skills = []
        for row in skill_rows:
            skill_uuid = row["id"]

            # Fetch rules
            rule_rows = await neon_db.execute_read("""
                SELECT id, rule_code, rule_name, rule_type, severity,
                       description, pattern, replacement,
                       example_before, example_after, confidence,
                       trigger_count, success_count
                FROM skill_rules
                WHERE skill_id = $1 AND is_active = TRUE
                ORDER BY severity DESC, rule_code
            """, skill_uuid)

            rules = [
                SkillRule(
                    id=str(r["id"]),
                    rule_code=r["rule_code"],
                    rule_name=r["rule_name"],
                    rule_type=RuleType(r["rule_type"]),
                    severity=Severity(r["severity"]),
                    description=r["description"],
                    pattern=r["pattern"],
                    replacement=r["replacement"],
                    example_before=r["example_before"],
                    example_after=r["example_after"],
                    confidence=float(r["confidence"]),
                    trigger_count=r["trigger_count"],
                    success_count=r["success_count"],
                )
                for r in rule_rows
            ]

            # Fetch word lists
            word_rows = await neon_db.execute_read("""
                SELECT word_or_phrase, replacement, severity, list_type, confidence
                FROM skill_word_lists
                WHERE skill_id = $1 AND is_active = TRUE
                ORDER BY severity DESC, word_or_phrase
            """, skill_uuid)

            word_lists = [
                SkillWordEntry(
                    word_or_phrase=w["word_or_phrase"],
                    replacement=w["replacement"],
                    severity=Severity(w["severity"]),
                    list_type=w["list_type"],
                    confidence=float(w["confidence"]),
                )
                for w in word_rows
            ]

            # Fetch prompts
            prompt_rows = await neon_db.execute_read("""
                SELECT prompt_type, template, model_hint, max_tokens, temperature
                FROM skill_prompts
                WHERE skill_id = $1 AND is_active = TRUE
            """, skill_uuid)

            prompts = {
                p["prompt_type"]: SkillPrompt(
                    prompt_type=p["prompt_type"],
                    template=p["template"],
                    model_hint=p["model_hint"],
                    max_tokens=p["max_tokens"],
                    temperature=float(p["temperature"]),
                )
                for p in prompt_rows
            }

            # Fetch thresholds
            threshold_rows = await neon_db.execute_read("""
                SELECT metric_name, excellent_min, good_min, fair_min,
                       poor_min, critical_below, target_value
                FROM skill_thresholds
                WHERE skill_id = $1
            """, skill_uuid)

            thresholds = [
                ScoringThreshold(
                    metric_name=t["metric_name"],
                    excellent_min=float(t["excellent_min"] or 90),
                    good_min=float(t["good_min"] or 75),
                    fair_min=float(t["fair_min"] or 60),
                    poor_min=float(t["poor_min"] or 40),
                    critical_below=float(t["critical_below"] or 40),
                    target_value=float(t["target_value"] or 85),
                )
                for t in threshold_rows
            ]

            trigger_phrases = row["trigger_phrases"]
            if isinstance(trigger_phrases, str):
                trigger_phrases = json.loads(trigger_phrases)

            skills.append(Skill(
                id=str(skill_uuid),
                skill_id=row["skill_id"],
                name=row["name"],
                category=SkillCategory(row["category"]),
                version=row["version"],
                description=row["description"],
                ethical_boundary=row["ethical_boundary"] or "",
                trigger_phrases=trigger_phrases or [],
                rules=rules,
                word_lists=word_lists,
                prompts=prompts,
                thresholds=thresholds,
            ))

        return skills

    def _read_seed_skill_files(self) -> list[Skill]:
        """Read bundled seed skills from JSON files."""
        import os
        import sys

        if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
            seed_dir = os.path.join(sys._MEIPASS, "skill-seeds")
        else:
            seed_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "skill-seeds")
        seed_dir = os.path.abspath(seed_dir)

        skills = []
        if os.path.exists(seed_dir):
            for fname in sorted(os.listdir(seed_dir)):
                if fname.endswith(".json"):
                    fpath = os.path.join(seed_dir, fname)
                    try:
                        with open(fpath, "r", encoding="utf-8") as f:
                            data = json.load(f)
                        skill = self._dict_to_skill(data)
                        skills.append(skill)
                    except Exception as e:
                        logger.error(f"Failed to load seed skill {fname}: {e}")
        return skills

    def _overlay_newer_seed_skills(self, neon_skills: list[Skill]) -> list[Skill]:
        """
        Keep Neon as the source of truth, but locally prefer newer bundled universal skills.
        This prevents a stale remote DB from downgrading the desktop intelligence engine.
        """
        merged = {skill.skill_id: skill for skill in neon_skills}
        for seed_skill in self._read_seed_skill_files():
            current = merged.get(seed_skill.skill_id)
            if current is None or _version_tuple(seed_skill.version) > _version_tuple(current.version):
                merged[seed_skill.skill_id] = seed_skill
        return list(merged.values())

    async def _load_seed_skills(self) -> dict:
        """Load bundled seed skills from JSON files (offline fallback)."""
        skills = self._read_seed_skill_files()

        if skills:
            self.cache.load(skills)
            logger.info(f"✅ {len(skills)} seed skills loaded (offline mode)")
        else:
            logger.warning("⚠️  No seed skills found — system running with empty skills")

        return self.cache.status

    def _dict_to_skill(self, data: dict) -> Skill:
        """Convert a seed JSON dict to a Skill object."""
        rules = [
            SkillRule(
                id=r.get("id", f"seed-{i}"),
                rule_code=r["rule_code"],
                rule_name=r["rule_name"],
                rule_type=RuleType(r.get("rule_type", "detection")),
                severity=Severity(r.get("severity", "medium")),
                description=r.get("description", ""),
                pattern=r.get("pattern"),
                replacement=r.get("replacement"),
                example_before=r.get("example_before"),
                example_after=r.get("example_after"),
                confidence=r.get("confidence", 0.8),
            )
            for i, r in enumerate(data.get("rules", []))
        ]

        word_lists = [
            SkillWordEntry(
                word_or_phrase=w["word_or_phrase"],
                replacement=w.get("replacement"),
                severity=Severity(w.get("severity", "medium")),
                list_type=w.get("list_type", "banned"),
                confidence=w.get("confidence", 0.8),
            )
            for w in data.get("word_lists", [])
        ]

        prompts = {
            pt: SkillPrompt(
                prompt_type=pt,
                template=pdata["template"],
                model_hint=pdata.get("model_hint"),
                max_tokens=pdata.get("max_tokens", 2000),
                temperature=pdata.get("temperature", 0.7),
            )
            for pt, pdata in data.get("prompts", {}).items()
        }

        return Skill(
            id=data.get("id", f"seed-{data['skill_id']}"),
            skill_id=data["skill_id"],
            name=data["name"],
            category=SkillCategory(data["category"]),
            version=data.get("version", "1.0.0"),
            description=data.get("description", ""),
            ethical_boundary=data.get("ethical_boundary", ""),
            trigger_phrases=data.get("trigger_phrases", []),
            rules=rules,
            word_lists=word_lists,
            prompts=prompts,
        )

    # ─── 2. APPLY ───────────────────────────────────────────────

    def get_skills_for_analysis(self) -> list[Skill]:
        """Get all skills relevant for document analysis."""
        return (
            self.cache.get_by_category(SkillCategory.PLAGIARISM)
            + self.cache.get_by_category(SkillCategory.AI_DETECTION)
            + self.cache.get_by_category(SkillCategory.HUMANIZATION)
            + self.cache.get_by_category(SkillCategory.WRITING)
            + self.cache.get_by_category(SkillCategory.QUALITY)
            + self.cache.get_by_category(SkillCategory.CITATION)
            + self.cache.get_by_category(SkillCategory.FORMATTING)
        )

    def get_banned_words(self) -> list[SkillWordEntry]:
        """Get all banned words from all active skills (for humanization engine)."""
        words = []
        for skill in self.cache.all():
            words.extend(skill.banned_words)
        # Deduplicate by word, keeping highest confidence
        seen: dict[str, SkillWordEntry] = {}
        for w in words:
            key = w.word_or_phrase.lower()
            if key not in seen or w.confidence > seen[key].confidence:
                seen[key] = w
        return list(seen.values())

    def get_skill(self, skill_id: str) -> Skill | None:
        return self.cache.get(skill_id)

    def get_rewrite_prompt(self, skill_id: str, prompt_type: str) -> SkillPrompt | None:
        skill = self.cache.get(skill_id)
        if skill:
            return skill.prompts.get(prompt_type)
        return None

    # ─── 3. RECORD LEARNING EVENTS ──────────────────────────────

    def start_session(self, session_id: str) -> None:
        """Mark the start of a research session."""
        self._session_id = session_id
        self._pending_events = []
        self._pending_discoveries = []
        logger.info(f"📝 Skill learning session started: {session_id}")

    def record_event(self, event: LearningEvent) -> None:
        """Record a learning event during the session (in memory, not yet pushed)."""
        self._pending_events.append(event)

    def record_discovery(self, discovery: NewPatternDiscovery) -> None:
        """Record a newly discovered pattern from research (e.g. new AI phrase found)."""
        self._pending_discoveries.append(discovery)
        logger.info(f"🔍 New pattern discovered: {discovery.description}")

    def get_pending_discoveries(self) -> list[NewPatternDiscovery]:
        """Return discoveries waiting for user approval."""
        return self._pending_discoveries.copy()

    # ─── 4. UPDATE (after user approval) ────────────────────────

    async def push_session_updates(
        self,
        session_id: str,
        approved_discoveries: list[str] | None = None,
    ) -> dict:
        """
        Called after user approves session completion.
        Pushes learning signals back to Neon DB.
        Only score deltas and statistical signals — NO text content.
        """
        if not await neon_db.is_connected():
            logger.warning("Neon DB offline — session updates not pushed")
            return {"pushed": False, "reason": "offline"}

        if not settings.SKILL_CONTRIBUTE_ANONYMOUS:
            logger.info("Skill contribution disabled — skipping push")
            return {"pushed": False, "reason": "disabled_by_user"}

        results = {
            "events_pushed": 0,
            "rules_updated": 0,
            "discoveries_submitted": 0,
        }

        # Push learning events
        if self._pending_events:
            event_data = [
                (
                    e.session_id, e.skill_id, e.rule_id,
                    e.event_type, e.doc_type, e.section_type,
                    e.before_score, e.after_score, e.improvement_delta,
                    e.user_accepted,
                )
                for e in self._pending_events
            ]
            await neon_db.execute_write_many("""
                INSERT INTO skill_learning_events
                (session_id, skill_id, rule_id, event_type, doc_type, section_type,
                 before_score, after_score, improvement_delta, user_accepted)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            """, event_data)
            results["events_pushed"] = len(event_data)

        # Update rule confidence scores based on session performance
        rules_updated = await self._update_rule_confidence()
        results["rules_updated"] = rules_updated

        # Submit approved new discoveries as proposed new rules
        if approved_discoveries:
            submitted = await self._submit_discoveries(approved_discoveries)
            results["discoveries_submitted"] = submitted

        logger.info(f"✅ Session updates pushed to Neon: {results}")
        self._pending_events = []
        return results

    async def _update_rule_confidence(self) -> int:
        """
        Recompute confidence for rules that had events this session.
        Uses exponential moving average: new_confidence = 0.8*old + 0.2*session_rate
        """
        # Group events by rule_id
        rule_events: dict[str, list[LearningEvent]] = {}
        for event in self._pending_events:
            if event.rule_id:
                rule_events.setdefault(event.rule_id, []).append(event)

        updated = 0
        for rule_id, events in rule_events.items():
            accepted = sum(1 for e in events if e.user_accepted is True)
            total = sum(1 for e in events if e.user_accepted is not None)
            if total == 0:
                continue

            session_rate = accepted / total
            threshold = settings.SKILL_UPDATE_THRESHOLD

            if abs(session_rate - 0.5) > threshold:  # Only update if meaningful signal
                await neon_db.execute_write("""
                    UPDATE skill_rules
                    SET
                        confidence = LEAST(0.99, GREATEST(0.1,
                            confidence * 0.8 + $1 * 0.2
                        )),
                        trigger_count = trigger_count + $2,
                        success_count = success_count + $3,
                        updated_at = NOW()
                    WHERE id = $4
                """, session_rate, total, accepted, rule_id)
                updated += 1

        return updated

    async def _submit_discoveries(self, approved_discovery_descriptions: list[str]) -> int:
        """Submit approved discovered patterns as proposed new rules (pending review)."""
        submitted = 0
        for disc in self._pending_discoveries:
            if disc.description in approved_discovery_descriptions:
                await neon_db.execute_write("""
                    INSERT INTO skill_learning_events
                    (session_id, skill_id, event_type, doc_type, section_type)
                    VALUES ($1, $2, 'discovery_submitted', 'community', 'all')
                """, self._session_id, disc.skill_id)
                submitted += 1
        return submitted

    # ─── 5. CHECK FOR UPDATES ──────────────────────────────────

    async def check_for_updates(self) -> list[dict]:
        """Check if newer skill versions exist in Neon."""
        if not await neon_db.is_connected():
            return []

        updates = []
        for skill in self.cache.all():
            row = await neon_db.execute_read_one("""
                SELECT version, updated_at
                FROM skills
                WHERE skill_id = $1 AND is_active = TRUE
            """, skill.skill_id)

            if row and row["version"] != skill.version:
                updates.append({
                    "skill_id": skill.skill_id,
                    "name": skill.name,
                    "current_version": skill.version,
                    "new_version": row["version"],
                    "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
                })

        return updates

    @property
    def status(self) -> dict:
        return {
            "cache": self.cache.status,
            "pending_events": len(self._pending_events),
            "pending_discoveries": len(self._pending_discoveries),
            "session_id": self._session_id,
            "contribute_anonymous": settings.SKILL_CONTRIBUTE_ANONYMOUS,
        }


# ─── Singleton ───────────────────────────────────────────────────
skill_manager = SkillManager()
