from __future__ import annotations

import re

from app.scanners import Finding

LLM_CALL_PATTERNS = re.compile(
    r"(?:openai|anthropic|genai|client)\s*\.\s*(?:chat|completions?|generate|messages?|create|aio)"
    r"|ChatOpenAI|ChatAnthropic|ChatGoogleGenerativeAI"
    r"|\.generate_content\(|\.create\(",
    re.IGNORECASE,
)

PROMPT_CONCAT_PATTERNS = re.compile(
    r"""f['"].*\{(?:user|input|request|query|message|prompt)[^}]*\}"""
    r"""|['"].*['"]\s*\+\s*(?:user|input|request|query|message)"""
    r"""|\.format\(.*(?:user|input|request|query|message)""",
)

SYSTEM_PROMPT_IN_CLIENT = re.compile(
    r"""(?:system[_\s]*prompt|SYSTEM_PROMPT|system[_\s]*message|system[_\s]*instruction)\s*[=:]\s*['"`]""",
)

TIMEOUT_PATTERN = re.compile(r"timeout\s*[=:]", re.IGNORECASE)

CLIENT_EXTENSIONS = {".js", ".jsx", ".ts", ".tsx"}
ALL_CODE_EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx"}


async def scan_llm_patterns(repo_files: list[dict[str, str]]) -> list[Finding]:
    findings = []

    files_with_llm_calls: list[tuple[str, str, list[int]]] = []

    for f in repo_files:
        path = f["path"]
        ext = "." + path.rsplit(".", 1)[-1] if "." in path else ""
        if ext not in ALL_CODE_EXTENSIONS:
            continue

        content = f["content"]
        llm_call_lines = []
        for line_num, line in enumerate(content.splitlines(), 1):
            if LLM_CALL_PATTERNS.search(line):
                llm_call_lines.append(line_num)

        if llm_call_lines:
            files_with_llm_calls.append((path, content, llm_call_lines))

    for path, content, llm_lines in files_with_llm_calls:
        ext = "." + path.rsplit(".", 1)[-1] if "." in path else ""

        # Check for raw user input concatenated into prompts
        for line_num, line in enumerate(content.splitlines(), 1):
            if PROMPT_CONCAT_PATTERNS.search(line):
                findings.append(Finding(
                    source="llm-pattern-scanner",
                    severity="high",
                    category="unsanitized-prompt-input",
                    description="User input appears to be concatenated directly into an LLM prompt.",
                    recommendation="Sanitize and validate user input before including in prompts. Use template variables with explicit allowlists.",
                    confidence="observed",
                    file=path,
                    line=line_num,
                    evidence=line.strip()[:200],
                ))

        # Check for missing timeout on LLM calls
        has_timeout = bool(TIMEOUT_PATTERN.search(content))
        if not has_timeout:
            findings.append(Finding(
                source="llm-pattern-scanner",
                severity="medium",
                category="no-llm-timeout",
                description="No timeout configured for LLM API calls. Requests could hang indefinitely.",
                recommendation="Add timeout parameter to LLM client configuration.",
                confidence="observed",
                file=path,
                line=llm_lines[0],
                evidence=f"LLM call at line {llm_lines[0]} with no timeout configured.",
            ))

        # System prompts exposed in client-side code
        if ext in CLIENT_EXTENSIONS:
            for line_num, line in enumerate(content.splitlines(), 1):
                if SYSTEM_PROMPT_IN_CLIENT.search(line):
                    findings.append(Finding(
                        source="llm-pattern-scanner",
                        severity="high",
                        category="system-prompt-exposed",
                        description="System prompt appears to be defined in client-side code, exposing it to users.",
                        recommendation="Move system prompts to the backend. Never expose them in client-side bundles.",
                        confidence="observed",
                        file=path,
                        line=line_num,
                        evidence=line.strip()[:200],
                    ))

    # Check for no output validation after LLM calls
    for path, content, llm_lines in files_with_llm_calls:
        lines = content.splitlines()
        for call_line in llm_lines:
            # Look at the next 5 lines after the LLM call for any validation
            window = lines[call_line:call_line + 5]
            has_validation = any(
                re.search(r"(?:validate|sanitize|check|parse|verify|schema|assert|try|except|catch|if\s)", l)
                for l in window
            )
            if not has_validation:
                findings.append(Finding(
                    source="llm-pattern-scanner",
                    severity="medium",
                    category="no-output-validation",
                    description="LLM output is used without apparent validation or sanitization.",
                    recommendation="Validate and sanitize LLM outputs before using them in application logic.",
                    confidence="observed",
                    file=path,
                    line=call_line,
                    evidence=f"LLM call at line {call_line} with no visible output validation.",
                ))

    return findings
