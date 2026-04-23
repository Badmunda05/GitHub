# ══════════════════════════════════════════════════════
#  GitHub Manager Web — config.py
# ══════════════════════════════════════════════════════
import os
from pathlib import Path

# 1. MongoDB URI
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")

# 2. JWT Secret — CHANGE THIS!
JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-to-random-long-string-abc123xyz")

# 3. Workspace folder (where repos get cloned locally)
WORK_DIR = os.environ.get("WORK_DIR", str(Path(__file__).parent / "workspace"))

# App name
APP_NAME = "GitHub Manager"

# ── Auto-detect BOT_DIR (gitHub2-main location) ──────────────────────────────
# Priority: 1) BOT_DIR env var, 2) same parent folder, 3) sibling folders
def _find_bot_dir():
    # From env
    if os.environ.get("BOT_DIR"):
        return os.environ["BOT_DIR"]

    this_dir   = Path(__file__).parent
    parent_dir = this_dir.parent

    # Check common locations relative to this file
    candidates = [
        parent_dir / "gitHub2-main",          # ../gitHub2-main
        parent_dir / "gitHub2",               # ../gitHub2
        parent_dir / "github-bot",            # ../github-bot
        this_dir.parent.parent / "gitHub2-main",  # ../../gitHub2-main
        Path.home() / "GitHub" / "gitHub2-main",  # ~/GitHub/gitHub2-main
        Path.home() / "gitHub2-main",         # ~/gitHub2-main
        Path("/home/ubuntu/GitHub/gitHub2-main"),
        Path("/home/ubuntu/gitHub2-main"),
    ]

    for c in candidates:
        if (c / "git_utils.py").exists():
            print(f"✅ Auto-detected BOT_DIR: {c}")
            return str(c)

    # Search in parent directories
    for search_root in [parent_dir, Path.home()]:
        for p in search_root.rglob("git_utils.py"):
            found = str(p.parent)
            print(f"✅ Found git_utils at: {found}")
            return found

    return None

BOT_DIR = _find_bot_dir()
