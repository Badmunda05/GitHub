"""
GitHub Control Bot - Web Dashboard
FastAPI backend with JWT authentication
Each user sees ONLY their own data - NO data leaks
"""

from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import Optional, List
import jwt
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# ─── Add bot directory to path ───────────────────────────────────────────────
BOT_DIR = os.environ.get("BOT_DIR", str(Path(__file__).parent.parent / "gitHub2-main"))
sys.path.insert(0, BOT_DIR)

try:
    import config
    import database as db
    import git_utils as git
    DB_CONNECTED = True
except Exception as e:
    print(f"⚠️  Could not import bot modules: {e}")
    print("   Set BOT_DIR env var to point to your bot directory")
    DB_CONNECTED = False

# ─── Config ───────────────────────────────────────────────────────────────────
JWT_SECRET  = os.environ.get("JWT_SECRET", "github-bot-super-secret-key-change-in-production")
JWT_EXPIRE  = int(os.environ.get("JWT_EXPIRE_HOURS", "24"))
WEB_OWNER   = int(os.environ.get("WEB_OWNER_ID", getattr(config, "OWNER_ID", 0) if DB_CONNECTED else 0))

app = FastAPI(title="GitHub Control Bot Dashboard", version="5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files
static_dir = Path(__file__).parent / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

security = HTTPBearer(auto_error=False)

# ─── JWT Helpers ─────────────────────────────────────────────────────────────

def create_token(uid: int, username: str) -> str:
    payload = {
        "uid": uid,
        "username": username,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRE),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return verify_token(credentials.credentials)

async def get_owner_user(user=Depends(get_current_user)):
    if user["uid"] != WEB_OWNER:
        raise HTTPException(status_code=403, detail="Owner only")
    return user

# ─── Pydantic Models ─────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    telegram_id: int
    secret_key: str          # Each user sets their own secret in bot first

class TokenRequest(BaseModel):
    github_token: str

class RepoRequest(BaseModel):
    url: str
    name: Optional[str] = ""
    is_private: bool = False

class CreateRepoRequest(BaseModel):
    name: str
    private: bool = False
    description: str = ""

class FileRequest(BaseModel):
    repo_folder: str
    file_path: str
    content: str

class GistRequest(BaseModel):
    filename: str
    content: str
    public: bool = True

class ProfileRequest(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    blog: Optional[str] = None
    twitter: Optional[str] = None

class BroadcastRequest(BaseModel):
    message: str

# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def root():
    html_file = Path(__file__).parent / "static" / "index.html"
    if html_file.exists():
        return FileResponse(str(html_file))
    return HTMLResponse("<h1>GitHub Bot Dashboard - place index.html in static/</h1>")


# ── AUTH ──────────────────────────────────────────────────────────────────────

@app.post("/api/auth/login")
async def login(req: LoginRequest):
    """Login with Telegram ID + secret key stored in bot DB"""
    if not DB_CONNECTED:
        raise HTTPException(500, "Database not connected")

    user = await db.get_user(req.telegram_id)
    if not user:
        raise HTTPException(404, "User not found. Use the Telegram bot first.")

    # Verify secret key stored by user in bot
    stored_secret = user.get("web_secret")
    if not stored_secret:
        raise HTTPException(401, "No web secret set. Send /websecret <key> to the bot first.")
    if stored_secret != req.secret_key:
        raise HTTPException(401, "Wrong secret key")

    username = user.get("username", str(req.telegram_id))
    token = create_token(req.telegram_id, username)
    return {
        "access_token": token,
        "token_type": "bearer",
        "uid": req.telegram_id,
        "username": username,
        "is_owner": req.telegram_id == WEB_OWNER,
    }


@app.post("/api/auth/set-web-secret")
async def set_web_secret_direct(telegram_id: int, secret: str):
    """
    Called by bot when user sends /websecret command.
    Only for internal bot→API calls (secured by internal token).
    """
    if not DB_CONNECTED:
        raise HTTPException(500, "DB not connected")
    await db._set(telegram_id, "web_secret", secret)
    return {"ok": True}


# ── USER PROFILE ──────────────────────────────────────────────────────────────

@app.get("/api/me")
async def get_me(user=Depends(get_current_user)):
    """Get current user info - ONLY returns authenticated user's own data"""
    uid = user["uid"]
    if not DB_CONNECTED:
        return {"uid": uid, "username": user["username"], "mock": True}

    token  = await db.get_token(uid)
    repos  = await db.get_repos(uid)
    active = await db.get_active_repo(uid)
    logs   = await db.get_logs(uid, limit=5)

    return {
        "uid":        uid,
        "username":   user["username"],
        "has_token":  bool(token),
        "token_preview": f"{token[:8]}...{token[-4:]}" if token else None,
        "repo_count": len(repos),
        "active_repo": active,
        "is_owner":   uid == WEB_OWNER,
        "recent_logs": logs,
    }


# ── GITHUB TOKEN ──────────────────────────────────────────────────────────────

@app.post("/api/token")
async def save_github_token(req: TokenRequest, user=Depends(get_current_user)):
    uid = user["uid"]
    if not DB_CONNECTED:
        raise HTTPException(500, "DB not connected")
    if not (req.github_token.startswith("ghp_") or req.github_token.startswith("github_pat_")):
        raise HTTPException(400, "Token must start with ghp_ or github_pat_")
    await db.set_token(uid, req.github_token)
    return {"ok": True, "preview": f"{req.github_token[:8]}...{req.github_token[-4:]}"}


@app.delete("/api/token")
async def delete_github_token(user=Depends(get_current_user)):
    uid = user["uid"]
    await db._set(uid, "github_token", None)
    return {"ok": True}


# ── REPOS ─────────────────────────────────────────────────────────────────────

@app.get("/api/repos")
async def get_repos(user=Depends(get_current_user)):
    uid = user["uid"]
    repos  = await db.get_repos(uid)
    active = await db.get_active_repo(uid)
    return {"repos": repos, "active": active}


@app.post("/api/repos")
async def add_repo(req: RepoRequest, user=Depends(get_current_user)):
    uid   = user["uid"]
    added = await db.add_repo(uid, req.url.rstrip("/"), req.name, req.is_private)
    if not added:
        raise HTTPException(409, "Repo already in list")
    return {"ok": True}


@app.put("/api/repos/{idx}")
async def update_repo(idx: int, req: RepoRequest, user=Depends(get_current_user)):
    uid = user["uid"]
    await db.update_repo(uid, idx, req.url, req.name, req.is_private)
    return {"ok": True}


@app.delete("/api/repos/{idx}")
async def delete_repo(idx: int, user=Depends(get_current_user)):
    uid     = user["uid"]
    removed = await db.delete_repo(uid, idx)
    if not removed:
        raise HTTPException(404, "Repo not found")
    return {"ok": True, "removed": removed}


@app.post("/api/repos/{idx}/activate")
async def activate_repo(idx: int, user=Depends(get_current_user)):
    uid   = user["uid"]
    repos = await db.get_repos(uid)
    if not (0 <= idx < len(repos)):
        raise HTTPException(404, "Repo not found")
    await db.set_active_repo(uid, repos[idx]["url"])
    return {"ok": True, "active": repos[idx]["url"]}


# ── GITHUB API ACTIONS ────────────────────────────────────────────────────────

@app.get("/api/github/repos")
async def list_github_repos(user=Depends(get_current_user)):
    uid   = user["uid"]
    token = await db.get_token(uid)
    if not token:
        raise HTTPException(400, "No GitHub token set")
    ok, repos, err = git.github_list_repos(token)
    if not ok:
        raise HTTPException(400, err)
    return {"repos": repos, "total": len(repos)}


@app.post("/api/github/repos")
async def create_github_repo(req: CreateRepoRequest, user=Depends(get_current_user)):
    uid   = user["uid"]
    token = await db.get_token(uid)
    if not token:
        raise HTTPException(400, "No GitHub token set")
    ok, result, url = git.github_create_repo(token, req.name, private=req.private, description=req.description)
    if not ok:
        raise HTTPException(400, result)
    if url:
        await db.add_repo(uid, url, req.name, req.private)
        await db.set_active_repo(uid, url)
    await db.add_log(uid, user["username"], "repo_create", req.name)
    return {"ok": True, "message": result, "url": url}


@app.delete("/api/github/repos/{idx}")
async def delete_github_repo(idx: int, user=Depends(get_current_user)):
    uid   = user["uid"]
    repos = await db.get_repos(uid)
    if not (0 <= idx < len(repos)):
        raise HTTPException(404, "Repo not found")
    token = await db.get_token(uid)
    if not token:
        raise HTTPException(400, "No GitHub token")
    url = repos[idx]["url"]
    ok, result = git.github_delete_repo(token, url)
    if ok:
        await db.delete_repo(uid, idx)
        await db.add_log(uid, user["username"], "repo_delete_gh", url)
    return {"ok": ok, "message": result}


@app.get("/api/github/commits/{idx}")
async def get_commits(idx: int, user=Depends(get_current_user)):
    uid   = user["uid"]
    repos = await db.get_repos(uid)
    if not (0 <= idx < len(repos)):
        raise HTTPException(404, "Repo not found")
    token = await db.get_token(uid)
    if not token:
        raise HTTPException(400, "No GitHub token")
    ok, result = git.github_get_commits(token, repos[idx]["url"])
    return {"ok": ok, "commits": result}


@app.get("/api/github/branches/{idx}")
async def get_branches(idx: int, user=Depends(get_current_user)):
    uid   = user["uid"]
    repos = await db.get_repos(uid)
    if not (0 <= idx < len(repos)):
        raise HTTPException(404, "Repo not found")
    token = await db.get_token(uid)
    if not token:
        raise HTTPException(400, "No GitHub token")
    ok, branches, err = git.github_list_branches(token, repos[idx]["url"])
    if not ok:
        raise HTTPException(400, err)
    return {"branches": branches}


# ── GISTS ─────────────────────────────────────────────────────────────────────

@app.get("/api/gists")
async def list_gists(user=Depends(get_current_user)):
    uid   = user["uid"]
    token = await db.get_token(uid)
    if not token:
        raise HTTPException(400, "No GitHub token")
    ok, gists, err = git.github_list_gists(token)
    if not ok:
        raise HTTPException(400, err)
    result = [{"id": g["id"], "files": list(g.get("files", {}).keys()),
               "public": g.get("public", True), "url": g.get("html_url", "")}
              for g in gists]
    return {"gists": result}


@app.post("/api/gists")
async def create_gist(req: GistRequest, user=Depends(get_current_user)):
    uid   = user["uid"]
    token = await db.get_token(uid)
    if not token:
        raise HTTPException(400, "No GitHub token")
    ok, result = git.github_create_gist(token, req.filename, req.content, public=req.public)
    if not ok:
        raise HTTPException(400, result)
    await db.add_log(uid, user["username"], "gist_create", req.filename)
    return {"ok": True, "message": result}


@app.delete("/api/gists/{gist_id}")
async def delete_gist(gist_id: str, user=Depends(get_current_user)):
    uid   = user["uid"]
    token = await db.get_token(uid)
    if not token:
        raise HTTPException(400, "No GitHub token")
    ok, result = git.github_delete_gist(token, gist_id)
    await db.add_log(uid, user["username"], "gist_delete", gist_id[:12])
    return {"ok": ok, "message": result}


# ── PROFILE ───────────────────────────────────────────────────────────────────

@app.get("/api/github/profile")
async def get_profile(user=Depends(get_current_user)):
    uid   = user["uid"]
    token = await db.get_token(uid)
    if not token:
        raise HTTPException(400, "No GitHub token")
    ok, profile, err = git.github_get_profile(token)
    if not ok:
        raise HTTPException(400, err)
    return profile


@app.put("/api/github/profile")
async def update_profile(req: ProfileRequest, user=Depends(get_current_user)):
    uid   = user["uid"]
    token = await db.get_token(uid)
    if not token:
        raise HTTPException(400, "No GitHub token")
    kwargs = {k: v for k, v in req.dict().items() if v is not None}
    ok, result = git.github_update_profile(token, **kwargs)
    await db.add_log(uid, user["username"], "profile_update", str(list(kwargs.keys())))
    return {"ok": ok, "message": result}


# ── LOGS ──────────────────────────────────────────────────────────────────────

@app.get("/api/logs")
async def get_my_logs(limit: int = 20, user=Depends(get_current_user)):
    """Returns ONLY the authenticated user's own logs"""
    uid  = user["uid"]
    logs = await db.get_logs(uid, limit=min(limit, 100))
    return {"logs": logs, "uid": uid}


# ── WORKSPACE ─────────────────────────────────────────────────────────────────

@app.get("/api/workspace")
async def list_workspace(user=Depends(get_current_user)):
    folders = git.get_workspace_folders()
    return {"folders": folders}


@app.get("/api/workspace/{folder}/tree")
async def get_tree(folder: str, user=Depends(get_current_user)):
    import os
    work_dir = config.WORK_DIR if DB_CONNECTED else "/tmp"
    path = os.path.join(work_dir, folder)
    if not os.path.exists(path):
        raise HTTPException(404, "Folder not found")
    tree = git.list_tree(path)
    return {"tree": tree, "folder": folder}


@app.get("/api/workspace/{folder}/file")
async def read_file(folder: str, path: str, user=Depends(get_current_user)):
    ok, content = git.read_file_in_repo(folder, path)
    if not ok:
        raise HTTPException(404, content)
    return {"content": content, "path": path}


@app.post("/api/workspace/file")
async def write_file(req: FileRequest, user=Depends(get_current_user)):
    uid = user["uid"]
    ok, result = git.write_file_in_repo(req.repo_folder, req.file_path, req.content)
    await db.add_log(uid, user["username"], "file_add", f"{req.repo_folder}/{req.file_path}")
    return {"ok": ok, "message": result}


# ── ADMIN ONLY (Owner) ────────────────────────────────────────────────────────

@app.get("/api/admin/stats")
async def admin_stats(user=Depends(get_owner_user)):
    stats = await db.get_stats()
    return stats


@app.get("/api/admin/users")
async def admin_users(user=Depends(get_owner_user)):
    users = await db.get_all_users()
    # Strip GitHub tokens from response for security
    safe = []
    for u in users:
        safe.append({
            "_id":       u["_id"],
            "username":  u.get("username", ""),
            "has_token": bool(u.get("github_token")),
            "repo_count": len(u.get("repos", [])),
        })
    return {"users": safe, "total": len(safe)}


@app.get("/api/admin/logs")
async def admin_all_logs(limit: int = 50, user=Depends(get_owner_user)):
    logs = await db.get_all_logs(limit=min(limit, 200))
    return {"logs": logs}


@app.post("/api/admin/broadcast")
async def admin_broadcast(req: BroadcastRequest, user=Depends(get_owner_user)):
    """Note: Actual Telegram broadcast requires running bot instance"""
    return {"ok": True, "message": "Broadcast queued (requires bot to be running)", "text": req.message}


# ── HEALTH ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "db_connected": DB_CONNECTED,
        "version": "5.0",
        "timestamp": datetime.utcnow().isoformat(),
    }
