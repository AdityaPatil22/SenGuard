import asyncio
import logging
import shutil
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

SKIP_DIRS = {
    ".git",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "env",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "target",
    "vendor",
    ".tox",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    "coverage",
}

SKIP_EXTENSIONS = {
    ".lock",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".ico",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".mp3",
    ".mp4",
    ".zip",
    ".tar",
    ".gz",
    ".bz2",
    ".bin",
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".pyc",
    ".pyo",
    ".class",
    ".o",
    ".obj",
    ".map",
    ".min.js",
    ".min.css",
}

PRIORITY_PATTERNS = [
    "README*",
    "readme*",
    "pyproject.toml",
    "setup.py",
    "setup.cfg",
    "package.json",
    "tsconfig.json",
    "requirements*.txt",
    "Pipfile",
    "Dockerfile",
    "docker-compose*",
    "compose*",
    ".env.example",
    ".env.sample",
    "Cargo.toml",
    "go.mod",
    "pom.xml",
    "build.gradle",
]

SOURCE_EXTENSIONS = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".go",
    ".rs",
    ".java",
    ".rb",
    ".php",
    ".cs",
    ".cpp",
    ".c",
    ".h",
    ".swift",
    ".kt",
    ".scala",
    ".ex",
    ".exs",
    ".clj",
    ".hs",
    ".ml",
    ".yaml",
    ".yml",
    ".toml",
    ".json",
    ".xml",
    ".sql",
    ".md",
    ".txt",
    ".cfg",
    ".ini",
    ".env",
    ".html",
    ".css",
    ".scss",
}


async def clone_repo(repo_url: str, dest: str | None = None) -> str:
    if dest is None:
        dest = tempfile.mkdtemp(prefix="sentinel_repo_")

    proc = await asyncio.create_subprocess_exec(
        "git",
        "clone",
        "--depth",
        "1",
        "--single-branch",
        repo_url,
        dest,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)

    if proc.returncode != 0:
        raise RuntimeError(f"git clone failed: {stderr.decode().strip()}")

    return dest


def extract_key_files(repo_path: str, max_chars: int = 100_000) -> list[dict]:
    root = Path(repo_path)
    priority_files: list[dict] = []
    source_files: list[dict] = []
    total = 0

    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue

        rel = path.relative_to(root)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        if path.suffix.lower() in SKIP_EXTENSIONS:
            continue

        is_priority = any(path.match(p) for p in PRIORITY_PATTERNS)
        is_source = path.suffix.lower() in SOURCE_EXTENSIONS

        if not is_priority and not is_source:
            continue

        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue

        # ponytail: cap individual files at 10k chars, skip huge generated files
        if len(content) > 10_000:
            content = content[:10_000] + "\n... (truncated)"

        entry = {"path": str(rel), "content": content}

        if is_priority:
            priority_files.append(entry)
        else:
            source_files.append(entry)

    result = []
    for f in priority_files + source_files:
        if total + len(f["content"]) > max_chars:
            break
        result.append(f)
        total += len(f["content"])

    return result


def cleanup_repo(repo_path: str) -> None:
    shutil.rmtree(repo_path, ignore_errors=True)
