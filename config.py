# ══════════════════════════════════════════════════════
#  GitHub Manager Web — config.py
#  Sirf yeh 3 cheezein edit karo:
# ══════════════════════════════════════════════════════
import os
from pathlib import Path

# 1. MongoDB URI — free cluster: cloud.mongodb.com
MONGO_URI = os.environ.get("MONGO_URI", "mongodb+srv://BADMUNDA:BADMYDAD@badhacker.i5nw9na.mongodb.net/")

# 2. JWT Secret — koi bhi random string rakh do
JWT_SECRET = os.environ.get("JWT_SECRET", "badmubdaxd")

# 3. Workspace — jahan repos clone honge
WORK_DIR = os.environ.get("WORK_DIR", str(Path(__file__).parent / "workspace"))

APP_NAME = "GitHub Manager"
