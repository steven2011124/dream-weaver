"""Long-term memory: a JSON file committed back into the target repo at
.agent/memory.json. Keeps the agent's decisions consistent across runs
without needing an external database.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class MemoryEntry:
    timestamp: str
    task: str
    summary: str
    files_changed: list[str]
    outcome: str  # "merged_pr_opened" | "failed" | "skipped"


@dataclass
class AgentMemory:
    completed_features: list[str] = field(default_factory=list)
    known_bugs: list[str] = field(default_factory=list)
    coding_conventions: list[str] = field(default_factory=list)
    preferred_frameworks: list[str] = field(default_factory=list)
    mistakes_to_avoid: list[str] = field(default_factory=list)
    architecture_notes: list[str] = field(default_factory=list)
    run_history: list[MemoryEntry] = field(default_factory=list)

    MAX_HISTORY = 50

    def add_run(
        self,
        task: str,
        summary: str,
        files_changed: list[str],
        outcome: str,
    ) -> None:
        entry = MemoryEntry(
            timestamp=datetime.now(timezone.utc).isoformat(),
            task=task,
            summary=summary,
            files_changed=files_changed,
            outcome=outcome,
        )
        self.run_history.append(entry)
        self.run_history = self.run_history[-self.MAX_HISTORY :]

    def record_mistake(self, lesson: str) -> None:
        if lesson not in self.mistakes_to_avoid:
            self.mistakes_to_avoid.append(lesson)

    def record_completed_feature(self, feature: str) -> None:
        if feature not in self.completed_features:
            self.completed_features.append(feature)

    def to_prompt_context(self, max_history: int = 10) -> str:
        """Renders memory into a compact block for inclusion in LLM prompts."""
        recent = self.run_history[-max_history:]
        lines = []
        if self.completed_features:
            lines.append("Completed features: " + "; ".join(self.completed_features[-20:]))
        if self.known_bugs:
            lines.append("Known bugs: " + "; ".join(self.known_bugs[-20:]))
        if self.coding_conventions:
            lines.append("Coding conventions: " + "; ".join(self.coding_conventions))
        if self.preferred_frameworks:
            lines.append("Preferred frameworks: " + "; ".join(self.preferred_frameworks))
        if self.mistakes_to_avoid:
            lines.append("Mistakes to avoid: " + "; ".join(self.mistakes_to_avoid[-20:]))
        if self.architecture_notes:
            lines.append("Architecture notes: " + "; ".join(self.architecture_notes))
        if recent:
            lines.append("Recent run history:")
            for entry in recent:
                lines.append(
                    f"  - [{entry.outcome}] {entry.task}: {entry.summary} "
                    f"(files: {', '.join(entry.files_changed) or 'none'})"
                )
        return "\n".join(lines) if lines else "No prior memory recorded yet."


def load_memory(path: str | Path) -> AgentMemory:
    path = Path(path)
    if not path.exists():
        return AgentMemory()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return AgentMemory()

    history = [MemoryEntry(**entry) for entry in raw.get("run_history", [])]
    return AgentMemory(
        completed_features=raw.get("completed_features", []),
        known_bugs=raw.get("known_bugs", []),
        coding_conventions=raw.get("coding_conventions", []),
        preferred_frameworks=raw.get("preferred_frameworks", []),
        mistakes_to_avoid=raw.get("mistakes_to_avoid", []),
        architecture_notes=raw.get("architecture_notes", []),
        run_history=history,
    )


def save_memory(memory: AgentMemory, path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = asdict(memory)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
