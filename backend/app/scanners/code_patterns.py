from __future__ import annotations

import ast
import re

from app.scanners import Finding

PYTHON_UNSAFE_CALLS = {
    "eval": ("critical", "Arbitrary code execution via eval().", "Use ast.literal_eval() or a safe parser."),
    "exec": ("critical", "Arbitrary code execution via exec().", "Remove exec() or sandbox the input."),
    "compile": ("medium", "Dynamic code compilation.", "Ensure input is trusted or use a safe alternative."),
    "__import__": ("high", "Dynamic import can load arbitrary modules.", "Use explicit imports."),
}

PYTHON_UNSAFE_ATTRS = {
    ("pickle", "loads"): (
        "high",
        "Unsafe deserialization via pickle.loads().",
        "Use JSON or a safe serialization format.",
    ),
    ("pickle", "load"): (
        "high",
        "Unsafe deserialization via pickle.load().",
        "Use JSON or a safe serialization format.",
    ),
    ("marshal", "loads"): ("high", "Unsafe deserialization via marshal.loads().", "Use JSON instead."),
    ("yaml", "load"): ("medium", "yaml.load() without SafeLoader is unsafe.", "Use yaml.safe_load() instead."),
    ("os", "system"): ("high", "Shell command execution via os.system().", "Use subprocess.run() with a list of args."),
}

JS_PATTERNS: list[tuple[str, re.Pattern, str, str, str]] = [
    (
        "unsafe-eval",
        re.compile(r"\beval\s*\("),
        "high",
        "eval() can execute arbitrary code.",
        "Remove eval() or use a safe alternative.",
    ),
    (
        "unsafe-innerhtml",
        re.compile(r"\.innerHTML\s*="),
        "high",
        "Direct innerHTML assignment enables XSS.",
        "Use textContent or a sanitization library.",
    ),
    (
        "unsafe-react-html",
        re.compile(r"dangerouslySetInnerHTML"),
        "high",
        "dangerouslySetInnerHTML bypasses React XSS protection.",
        "Sanitize HTML with DOMPurify before rendering.",
    ),
    (
        "unsafe-child-process",
        re.compile(r"child_process.*exec\b"),
        "high",
        "Unsanitized shell command execution.",
        "Use execFile() with explicit args instead.",
    ),
    (
        "sql-concat",
        re.compile(r"""(?:query|execute)\s*\(\s*[f'"`].*\$\{|(?:query|execute)\s*\(\s*['"].*['"]\s*\+"""),
        "high",
        "SQL string concatenation risks injection.",
        "Use parameterized queries.",
    ),
]

PYTHON_EXTENSIONS = {".py"}
JS_EXTENSIONS = {".js", ".jsx", ".ts", ".tsx"}


class _UnsafeCallVisitor(ast.NodeVisitor):
    def __init__(self, path: str):
        self.path = path
        self.findings: list[Finding] = []

    def visit_Call(self, node: ast.Call):  # noqa: N802
        if isinstance(node.func, ast.Name) and node.func.id in PYTHON_UNSAFE_CALLS:
            sev, desc, rec = PYTHON_UNSAFE_CALLS[node.func.id]
            self.findings.append(
                Finding(
                    source="ast-scanner",
                    severity=sev,
                    category=f"unsafe-{node.func.id}",
                    description=desc,
                    recommendation=rec,
                    confidence="verified",
                    file=self.path,
                    line=node.lineno,
                    evidence=f"{node.func.id}(...)",
                )
            )

        if isinstance(node.func, ast.Attribute):
            attr = node.func.attr
            if isinstance(node.func.value, ast.Name):
                key = (node.func.value.id, attr)
                if key in PYTHON_UNSAFE_ATTRS:
                    sev, desc, rec = PYTHON_UNSAFE_ATTRS[key]
                    self.findings.append(
                        Finding(
                            source="ast-scanner",
                            severity=sev,
                            category=f"unsafe-{key[0]}-{key[1]}",
                            description=desc,
                            recommendation=rec,
                            confidence="verified",
                            file=self.path,
                            line=node.lineno,
                            evidence=f"{key[0]}.{key[1]}(...)",
                        )
                    )

            if attr == "system" and isinstance(node.func.value, ast.Name) and node.func.value.id == "os":
                pass  # already handled above

        # subprocess.run/call/Popen with shell=True
        if isinstance(node.func, ast.Attribute) and node.func.attr in (
            "run",
            "call",
            "Popen",
            "check_output",
            "check_call",
        ):
            for kw in node.keywords:
                if kw.arg == "shell" and isinstance(kw.value, ast.Constant) and kw.value.value is True:
                    self.findings.append(
                        Finding(
                            source="ast-scanner",
                            severity="high",
                            category="unsafe-shell-true",
                            description="subprocess with shell=True allows shell injection.",
                            recommendation="Pass command as a list without shell=True.",
                            confidence="verified",
                            file=self.path,
                            line=node.lineno,
                            evidence=f"subprocess.{node.func.attr}(..., shell=True)",
                        )
                    )

        self.generic_visit(node)


def _scan_python(path: str, content: str) -> list[Finding]:
    try:
        tree = ast.parse(content, filename=path)
    except SyntaxError:
        return []
    visitor = _UnsafeCallVisitor(path)
    visitor.visit(tree)
    return visitor.findings


def _scan_js(path: str, content: str) -> list[Finding]:
    findings = []
    for line_num, line in enumerate(content.splitlines(), 1):
        for category, pattern, severity, desc, rec in JS_PATTERNS:
            if pattern.search(line):
                findings.append(
                    Finding(
                        source="regex-code-scanner",
                        severity=severity,
                        category=category,
                        description=desc,
                        recommendation=rec,
                        confidence="observed",
                        file=path,
                        line=line_num,
                        evidence=line.strip()[:200],
                    )
                )
    return findings


async def scan_code_patterns(repo_files: list[dict[str, str]]) -> list[Finding]:
    findings = []
    for f in repo_files:
        path = f["path"]
        ext = "." + path.rsplit(".", 1)[-1] if "." in path else ""

        if ext in PYTHON_EXTENSIONS:
            findings.extend(_scan_python(path, f["content"]))
        elif ext in JS_EXTENSIONS:
            findings.extend(_scan_js(path, f["content"]))

    return findings
