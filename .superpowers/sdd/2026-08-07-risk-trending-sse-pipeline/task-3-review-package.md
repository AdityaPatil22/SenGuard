58759e2 feat: add evaluation progress store and wire nodes to emit events
---STAT---
 backend/app/langgraph/nodes.py              | 30 ++++++++++++++
 backend/app/langgraph/state.py              |  1 +
 backend/app/services/evaluation_progress.py | 64 +++++++++++++++++++++++++++++
 3 files changed, 95 insertions(+)
---DIFF---
diff --git a/backend/app/langgraph/nodes.py b/backend/app/langgraph/nodes.py
index e2e780e..e883ba2 100644
--- a/backend/app/langgraph/nodes.py
+++ b/backend/app/langgraph/nodes.py
@@ -1,18 +1,19 @@
 import json
 import logging
 
 from google import genai
 
 from app.config.settings import get_settings
 from app.langgraph.state import EvaluationState
 from app.scanners import ScanResults, compute_base_risk_score, run_all_scanners
+from app.services.evaluation_progress import progress_store
 
 logger = logging.getLogger(__name__)
 
 _client = None
 
 
 def _get_client() -> genai.Client:
     global _client
     if _client is None:
         settings = get_settings()
@@ -35,26 +36,34 @@ async def _ask_gemini_json(prompt: str) -> dict:
     text = text.strip()
     if text.startswith("```"):
         text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
     return json.loads(text)
 
 
 # ── Phase 1: Deterministic Scan ──────────────────────────────────────────
 
 
 async def deterministic_scan(state: EvaluationState) -> EvaluationState:
+    eval_id = state.get("evaluation_id")
+    progress = progress_store.get(eval_id) if eval_id else None
+    if progress:
+        progress.start_node("deterministic_scan")
+
     repo_files = state.get("repo_files") or []
     dataset_samples = state.get("dataset_samples") or []
     repo_path = state.get("repo_path")
 
     results: ScanResults = await run_all_scanners(repo_files, dataset_samples, repo_path)
     state["scanner_results"] = results.to_dict()
+
+    if progress:
+        progress.complete_node("deterministic_scan")
     return state
 
 
 # ── Phase 2: LLM Analysis ───────────────────────────────────────────────
 
 
 def _format_repo_context(state: EvaluationState) -> str:
     repo_files = state.get("repo_files") or []
     if not repo_files:
         return ""
@@ -66,20 +75,25 @@ def _format_repo_context(state: EvaluationState) -> str:
 
 def _format_dataset_context(state: EvaluationState) -> str:
     samples = state.get("dataset_samples") or []
     if not samples:
         return ""
     preview = "\n".join(samples[:20])
     return f"\n\n--- DATASET SAMPLE ({len(samples)} rows) ---\n{preview}"
 
 
 async def llm_analysis(state: EvaluationState) -> EvaluationState:
+    eval_id = state.get("evaluation_id")
+    progress = progress_store.get(eval_id) if eval_id else None
+    if progress:
+        progress.start_node("llm_analysis")
+
     scanner_results = state.get("scanner_results", {})
     findings = scanner_results.get("findings", [])
     summary = scanner_results.get("summary", {})
     description = state.get("project_description") or "No description provided."
     model_name = state.get("model_name") or "unspecified LLM"
     has_repo = state.get("has_repo", False)
     repo_context = _format_repo_context(state)
     dataset_context = _format_dataset_context(state)
 
     if has_repo:
@@ -132,24 +146,31 @@ Return JSON with:
         state["llm_analysis_result"] = result
     except Exception as e:
         logger.exception("llm_analysis node failed")
         state["llm_analysis_result"] = {
             "interpreted_findings": [],
             "supplementary_findings": [],
             "summary": f"LLM analysis failed: {e}",
         }
         state.setdefault("errors", []).append(f"AI analysis failed: {e}")
 
+    if progress:
+        progress.complete_node("llm_analysis")
     return state
 
 
 async def risk_scoring(state: EvaluationState) -> EvaluationState:
+    eval_id = state.get("evaluation_id")
+    progress = progress_store.get(eval_id) if eval_id else None
+    if progress:
+        progress.start_node("risk_scoring")
+
     scanner_results = state.get("scanner_results", {})
     llm_analysis = state.get("llm_analysis_result", {})
     findings = scanner_results.get("findings", [])
 
     from app.scanners import Finding as FindingClass
 
     finding_objects = [
         FindingClass(
             source=f.get("source", ""),
             severity=f.get("severity", "low"),
@@ -210,24 +231,31 @@ Return JSON with:
             "risk_level": "low"
             if base_score <= 25
             else "medium"
             if base_score <= 50
             else "high"
             if base_score <= 75
             else "critical",
         }
         state.setdefault("errors", []).append(f"Risk scoring AI failed: {e}")
 
+    if progress:
+        progress.complete_node("risk_scoring")
     return state
 
 
 async def report_generation(state: EvaluationState) -> EvaluationState:
+    eval_id = state.get("evaluation_id")
+    progress = progress_store.get(eval_id) if eval_id else None
+    if progress:
+        progress.start_node("report_generation")
+
     scanner_results = state.get("scanner_results", {})
     llm_analysis_result = state.get("llm_analysis_result", {})
     risk_breakdown = state.get("risk_breakdown", {})
     risk_score = state.get("risk_score", 0)
     project_name = state.get("project_name", "Unknown")
     has_repo = state.get("has_repo", False)
     scanners_used = scanner_results.get("scanners_used", [])
     findings = scanner_results.get("findings", [])
     interpreted = llm_analysis_result.get("interpreted_findings", [])
     supplementary = llm_analysis_result.get("supplementary_findings", [])
@@ -265,11 +293,13 @@ Keep it concise and actionable. Under 800 words."""
 
     try:
         state["report"] = await _ask_gemini(prompt)
     except Exception as e:
         logger.exception("report_generation node failed")
         state["report"] = (
             f"# Evaluation Report — {project_name}\n\nRisk Score: {risk_score}/100\n\nReport generation failed: {e}"
         )
         state.setdefault("errors", []).append(f"Report generation failed: {e}")
 
+    if progress:
+        progress.complete_node("report_generation")
     return state
diff --git a/backend/app/langgraph/state.py b/backend/app/langgraph/state.py
index 41db95f..d84c10d 100644
--- a/backend/app/langgraph/state.py
+++ b/backend/app/langgraph/state.py
@@ -4,20 +4,21 @@ from typing import Any, TypedDict
 class EvaluationState(TypedDict, total=False):
     # Inputs
     project_id: str
     project_name: str
     project_description: str
     model_name: str | None
     dataset_samples: list[str]
     repo_files: list[dict[str, str]]
     repo_path: str | None
     has_repo: bool
+    evaluation_id: str | None
 
     # Phase 1: deterministic scan results
     scanner_results: dict[str, Any]
 
     # Phase 2: LLM analysis
     llm_analysis_result: dict[str, Any]
     risk_score: float | None
     risk_breakdown: dict[str, Any] | None
     report: str | None
     error: str | None
diff --git a/backend/app/services/evaluation_progress.py b/backend/app/services/evaluation_progress.py
new file mode 100644
index 0000000..6bba79e
--- /dev/null
+++ b/backend/app/services/evaluation_progress.py
@@ -0,0 +1,64 @@
+import asyncio
+from datetime import datetime, timezone
+from typing import AsyncGenerator
+
+PIPELINE_NODES = ["deterministic_scan", "llm_analysis", "risk_scoring", "report_generation"]
+
+
+class EvaluationProgress:
+    def __init__(self):
+        self._events: list[dict] = []
+        self._done = asyncio.Event()
+        self._waiters: list[asyncio.Event] = []
+
+    def _emit(self, event: dict):
+        event["timestamp"] = datetime.now(timezone.utc).isoformat()
+        self._events.append(event)
+        for waiter in self._waiters:
+            waiter.set()
+
+    def start_node(self, name: str):
+        self._emit({"type": "node_start", "node": name})
+
+    def complete_node(self, name: str):
+        self._emit({"type": "node_complete", "node": name})
+
+    def fail_node(self, name: str, error: str):
+        self._emit({"type": "node_fail", "node": name, "error": error})
+
+    def complete(self):
+        self._emit({"type": "complete"})
+        self._done.set()
+
+    def fail(self, error: str):
+        self._emit({"type": "fail", "error": error})
+        self._done.set()
+
+    async def stream(self) -> AsyncGenerator[dict, None]:
+        index = 0
+        keepalive_interval = 30
+        last_keepalive = asyncio.get_event_loop().time()
+
+        while True:
+            while index < len(self._events):
+                yield self._events[index]
+                index += 1
+
+            if self._done.is_set():
+                break
+
+            waiter = asyncio.Event()
+            self._waiters.append(waiter)
+
+            try:
+                await asyncio.wait_for(waiter.wait(), timeout=keepalive_interval)
+            except asyncio.TimeoutError:
+                now = asyncio.get_event_loop().time()
+                if now - last_keepalive >= keepalive_interval:
+                    yield {"type": "keepalive", "timestamp": datetime.now(timezone.utc).isoformat()}
+                    last_keepalive = now
+            finally:
+                self._waiters.remove(waiter)
+
+
+progress_store: dict[str, EvaluationProgress] = {}
