from typing import List, Dict, Any, Optional, Tuple
from langchain_openai import ChatOpenAI
from config import OPENROUTER_API_KEY, OPENROUTER_URL, SUMMARY_MODEL


class TaskDeduper:
    """
    LLM-based deduplication for task scheduling. Given a new task description and
    a list of existing task descriptions, decide if the new task is semantically
    duplicate (equivalent or strict subset) of an existing one.
    """

    def __init__(self):
        self.llm = ChatOpenAI(
            model=SUMMARY_MODEL,
            base_url=OPENROUTER_URL,
            api_key=OPENROUTER_API_KEY,
            temperature=0,
        )

    def _build_prompt(self, new_task: str, candidates: List[Tuple[str, str]]) -> str:
        lines = ["New task:", new_task.strip(), "\nExisting tasks:"]
        for tid, desc in candidates:
            lines.append(f"- id={tid}: {desc}")
        lines.append(
            "\nTask: Decide whether the NEW task duplicates ANY existing task (same goal or a strict subset). "
            "Ignore superficial wording differences. Scan the existing tasks; "
            "if you find a duplicate, immediately return that task's id. If none are duplicate, use null. "
            "Output this strict JSON array (no prose): [matched_id_or_null, duplicate_boolean]."
        )
        return "\n".join(lines)

    def judge(self, new_task: str, candidates: List[Tuple[str, str]]) -> Dict[str, Any]:
        if not new_task or not candidates:
            return {"duplicate": False, "matched_id": None}

        prompt = self._build_prompt(new_task, candidates)
        print("[LLM Prompt][brain.deduper]", prompt)
        resp = self.llm.invoke([
            {"role": "system", "content": "You are a careful deduplication judge."},
            {"role": "user", "content": prompt},
        ])
        text = (resp.content or "").strip()
        import json
        try:
            if text.startswith("```"):
                text = text.replace("```json", "").replace("```", "").strip()
            data = json.loads(text)
            # Preferred contract: JSON array [matched_id_or_null, duplicate_boolean]
            if isinstance(data, list) and len(data) >= 2:
                matched_id = data[0]
                duplicate = bool(data[1])
                return {"duplicate": duplicate, "matched_id": matched_id}
            # Fallback: accept dict shape if model returns it
            if isinstance(data, dict):
                return {
                    "duplicate": bool(data.get("duplicate", False)),
                    "matched_id": data.get("matched_id")
                }
            # Unknown shape
            return {"duplicate": False, "matched_id": None}
        except Exception:
            return {"duplicate": False, "matched_id": None}


