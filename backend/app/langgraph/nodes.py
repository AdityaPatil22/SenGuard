import json
import logging
from functools import lru_cache

from google import genai

from app.config.settings import get_settings
from app.langgraph.state import EvaluationState
from app.scanners import ScanResults, compute_base_risk_score, run_all_scanners
from app.services.evaluation_progress import progress_store

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_client() -> genai.Client:
    settings = get_settings()
    return genai.Client(api_key=settings.gemini_api_key)


async def _ask_gemini(prompt: str) -> str:
    client = _get_client()
    settings = get_settings()
    response = await client.aio.models.generate_content(
        model=settings.gemini_model,
        contents=prompt,
    )
    return response.text


async def _ask_gemini_json(prompt: str) -> dict:
    text = await _ask_gemini(prompt + "\n\nRespond with valid JSON only, no markdown fences.")
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(text)


# ── Phase 1: Deterministic Scan ──────────────────────────────────────────


async def deterministic_scan(state: EvaluationState) -> EvaluationState:
    eval_id = state.get("evaluation_id")
    progress = progress_store.get(eval_id) if eval_id else None
    if progress:
        progress.start_node("deterministic_scan")

    repo_files = state.get("repo_files") or []
    dataset_samples = state.get("dataset_samples") or []
    repo_path = state.get("repo_path")

    results: ScanResults = await run_all_scanners(repo_files, dataset_samples, repo_path)
    state["scanner_results"] = results.to_dict()

    if progress:
        progress.complete_node("deterministic_scan")
    return state


# ── Phase 2: LLM Analysis ───────────────────────────────────────────────


def _format_repo_context(state: EvaluationState) -> str:
    repo_files = state.get("repo_files") or []
    if not repo_files:
        return ""
    parts = ["\n\n--- SOURCE CODE FROM REPOSITORY ---"]
    for f in repo_files:
        parts.append(f"\n### {f['path']}\n```\n{f['content']}\n```")
    return "\n".join(parts)


def _format_dataset_context(state: EvaluationState) -> str:
    samples = state.get("dataset_samples") or []
    if not samples:
        return ""
    preview = "\n".join(samples[:20])
    return f"\n\n--- DATASET SAMPLE ({len(samples)} rows) ---\n{preview}"


async def llm_analysis(state: EvaluationState) -> EvaluationState:
    eval_id = state.get("evaluation_id")
    progress = progress_store.get(eval_id) if eval_id else None
    if progress:
        progress.start_node("llm_analysis")

    scanner_results = state.get("scanner_results", {})
    findings = scanner_results.get("findings", [])
    summary = scanner_results.get("summary", {})
    description = state.get("project_description") or "No description provided."
    model_name = state.get("model_name") or "unspecified LLM"
    has_repo = state.get("has_repo", False)
    repo_context = _format_repo_context(state)
    dataset_context = _format_dataset_context(state)

    if has_repo:
        eval_type = "an LLM application codebase"
        supplementary_guidance = """Identify risks that automated scanners CANNOT catch:
- Architectural prompt injection risks (e.g., user controls system prompt via API parameter)
- Business logic risks (is this model appropriate for this use case?)
- Missing safeguards (no content filtering, no human-in-the-loop for high-stakes decisions)
- Privacy/compliance concerns beyond PII regex (e.g., data retention, cross-border transfer)"""
    else:
        eval_type = "a dataset intended for use with an LLM application"
        supplementary_guidance = """Identify data-specific risks that automated scanners CANNOT catch:
- Data quality issues (bias, imbalance, insufficient coverage)
- Sensitive content that could cause harmful LLM outputs if used for training or prompting
- Schema or formatting issues that could lead to misinterpretation
- Representativeness concerns (does this dataset cover the intended use case adequately?)

Do NOT flag missing repository files, .gitignore, or code-level issues — this is a dataset evaluation, not a code review."""

    prompt = f"""You are an AI governance analyst reviewing {eval_type}.

Project: {state.get("project_name", "Unknown")}
Description: {description}
Model: {model_name}

## Automated Scanner Results
Total findings: {summary.get("total", 0)} (critical: {summary.get("critical", 0)}, high: {summary.get("high", 0)}, medium: {summary.get("medium", 0)}, low: {summary.get("low", 0)})

Detailed findings:
{json.dumps(findings, indent=2, default=str)}
{repo_context}{dataset_context}

Your job has TWO parts:

**Part 1 — Interpret scanner findings:**
For each scanner finding, provide a plain-English explanation of why it matters and any contextual notes. If there are no findings, return an empty list.

**Part 2 — Supplementary analysis:**
{supplementary_guidance}

Mark each supplementary finding clearly as AI-assessed with confidence "potential-risk".

Return JSON with:
- "interpreted_findings": list of {{"original_finding": object, "explanation": str, "contextual_severity": "low"|"medium"|"high"|"critical"}}
- "supplementary_findings": list of {{"source": "ai-analysis", "confidence": "potential-risk", "severity": "low"|"medium"|"high"|"critical", "category": str, "description": str, "recommendation": str, "reasoning": str}}
- "summary": one paragraph overall assessment"""

    try:
        result = await _ask_gemini_json(prompt)
        state["llm_analysis_result"] = result
    except Exception as e:
        logger.exception("llm_analysis node failed")
        state["llm_analysis_result"] = {
            "interpreted_findings": [],
            "supplementary_findings": [],
            "summary": f"LLM analysis failed: {e}",
        }
        state.setdefault("errors", []).append(f"AI analysis failed: {e}")

    if progress:
        progress.complete_node("llm_analysis")
    return state


async def risk_scoring(state: EvaluationState) -> EvaluationState:
    eval_id = state.get("evaluation_id")
    progress = progress_store.get(eval_id) if eval_id else None
    if progress:
        progress.start_node("risk_scoring")

    scanner_results = state.get("scanner_results", {})
    llm_analysis = state.get("llm_analysis_result", {})
    findings = scanner_results.get("findings", [])

    from app.scanners import Finding as FindingClass

    finding_objects = [
        FindingClass(
            source=f.get("source", ""),
            severity=f.get("severity", "low"),
            category=f.get("category", ""),
            description=f.get("description", ""),
            recommendation=f.get("recommendation", ""),
            file=f.get("file"),
            line=f.get("line"),
            evidence=f.get("evidence"),
        )
        for f in findings
    ]
    base_score = compute_base_risk_score(finding_objects)

    prompt = f"""You are a risk scoring engine for AI governance.

The automated scanners produced a base risk score of {base_score}/100 from these findings:
{json.dumps(scanner_results.get("summary", {}), indent=2)}

Your supplementary analysis found:
{json.dumps(llm_analysis.get("supplementary_findings", []), indent=2, default=str)}

Scanner findings detail:
{json.dumps(findings[:20], indent=2, default=str)}

You may adjust the base score by at most ±10 points based on context:
- Lower if findings are in test/example code and not production
- Higher if supplementary analysis found serious architectural risks
- The adjustment must be justified

Return JSON with:
- "base_score": {base_score}
- "adjustment": integer between -10 and 10
- "adjusted_score": final score (base + adjustment, clamped 0-100)
- "adjustment_reason": one sentence explaining the adjustment
- "risk_level": "low" (0-25) | "medium" (26-50) | "high" (51-75) | "critical" (76-100)"""

    try:
        result = await _ask_gemini_json(prompt)
        adj = max(-10, min(10, int(result.get("adjustment", 0))))
        final = max(0, min(100, base_score + adj))
        state["risk_score"] = float(final)
        state["risk_breakdown"] = {
            "base_score": base_score,
            "adjustment": adj,
            "adjusted_score": final,
            "adjustment_reason": result.get("adjustment_reason", ""),
            "risk_level": result.get("risk_level", "medium"),
        }
    except Exception as e:
        logger.exception("risk_scoring node failed")
        state["risk_score"] = base_score
        state["risk_breakdown"] = {
            "base_score": base_score,
            "adjustment": 0,
            "adjusted_score": base_score,
            "adjustment_reason": f"LLM scoring failed, using base score: {e}",
            "risk_level": "low"
            if base_score <= 25
            else "medium"
            if base_score <= 50
            else "high"
            if base_score <= 75
            else "critical",
        }
        state.setdefault("errors", []).append(f"Risk scoring AI failed: {e}")

    if progress:
        progress.complete_node("risk_scoring")
    return state


async def report_generation(state: EvaluationState) -> EvaluationState:
    eval_id = state.get("evaluation_id")
    progress = progress_store.get(eval_id) if eval_id else None
    if progress:
        progress.start_node("report_generation")

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

    eval_type = "codebase" if has_repo else "dataset"

    prompt = f"""You are a governance report writer. Generate a clear, professional AI governance evaluation report for a {eval_type} evaluation.

Project: {project_name}
Evaluation type: {eval_type}
Overall Risk Score: {risk_score}/100 ({risk_breakdown.get("risk_level", "unknown")})
Score breakdown: base {risk_breakdown.get("base_score", "N/A")}, adjustment {risk_breakdown.get("adjustment", 0):+d} — {risk_breakdown.get("adjustment_reason", "")}
Scanners used: {", ".join(scanners_used) if scanners_used else "None"}

## Scanner Findings ({scanner_results.get("summary", {}).get("total", 0)} total)
{json.dumps(findings, indent=2, default=str)}

## LLM Interpretation of Findings
{json.dumps(interpreted, indent=2, default=str)}

## Supplementary AI Analysis
{json.dumps(supplementary, indent=2, default=str)}

Write a structured governance report in markdown with these sections:
1. **Executive Summary** — 2-3 sentence overview with risk score and recommendation (approve/conditional/reject)
2. **Scanner Findings** — group by category. For each finding include source, severity, evidence, explanation, and recommendation. If no findings, state that clearly.
3. **AI-Assessed Risks** — supplementary findings clearly labeled as AI-assessed, with reasoning
4. **Risk Score Breakdown** — base score, adjustment, and rationale
5. **Recommendations** — prioritized action items, critical first

IMPORTANT: Every finding must cite its source. Scanner-detected findings say "Detected by: [scanner name]". AI-assessed findings say "Assessed by: AI analysis".
{"" if has_repo else "This is a DATASET evaluation — do not mention missing repository files, .gitignore, or code-level concerns. Focus on data quality, PII, bias, and fitness for purpose."}

Keep it concise and actionable. Under 800 words."""

    try:
        state["report"] = await _ask_gemini(prompt)
    except Exception as e:
        logger.exception("report_generation node failed")
        state["report"] = (
            f"# Evaluation Report — {project_name}\n\nRisk Score: {risk_score}/100\n\nReport generation failed: {e}"
        )
        state.setdefault("errors", []).append(f"Report generation failed: {e}")

    if progress:
        progress.complete_node("report_generation")
    return state
