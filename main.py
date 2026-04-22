"""
GitHub Manager — FastAPI Backend
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pure web app — no Telegram bot needed.
Users register with username+password.
Their GitHub token is stored encrypted.
Every user sees ONLY their own data.
"""

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from pathlib import Path
import jwt, hashlib, os, httpx, json
from datetime import datetime, timedelta
from pymongo import MongoClient

# ── Config ───────────────────────────────────────────────────────────────────
from config import MONGO_URI, JWT_SECRET, APP_NAME

client   = MongoClient(MONGO_URI)
db       = client["github_manager"]
users    = db["users"]

app = FastAPI(title=APP_NAME)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

BASE = Path(__file__).parent / "static"
BASE.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(BASE)), name="static")

security  = HTTPBearer(auto_error=False)
GH_API    = "https://api.github.com"
HEADERS   = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}

# ── Helpers ───────────────────────────────────────────────────────────────────
def hash_pw(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

def make_token(uid: str, username: str) -> str:
    return jwt.encode(
        {"uid": uid, "username": username, "exp": datetime.utcnow() + timedelta(days=30)},
        JWT_SECRET, algorithm="HS256"
    )

def verify_token(cred: HTTPAuthorizationCredentials = Depends(security)):
    if not cred:
        raise HTTPException(401, "Not authenticated")
    try:
        return jwt.decode(cred.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired — please login again")
    except:
        raise HTTPException(401, "Invalid session")

def get_user_doc(uid: str) -> dict:
    doc = users.find_one({"_id": uid})
    if not doc:
        raise HTTPException(404, "User not found")
    return doc

def gh_headers(token: str) -> dict:
    return {**HEADERS, "Authorization": f"Bearer {token}"}

async def gh_get(path: str, token: str, params: dict = None):
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{GH_API}{path}", headers=gh_headers(token), params=params)
    if r.status_code == 401:
        raise HTTPException(401, "GitHub token invalid or expired")
    if r.status_code == 403:
        raise HTTPException(403, "GitHub API rate limit or permission denied")
    if r.status_code == 404:
        raise HTTPException(404, "Not found on GitHub")
    return r.json()

async def gh_post(path: str, token: str, body: dict):
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{GH_API}{path}", headers=gh_headers(token), json=body)
    return r.status_code, r.json()

async def gh_patch(path: str, token: str, body: dict):
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.patch(f"{GH_API}{path}", headers=gh_headers(token), json=body)
    return r.status_code, r.json()

async def gh_delete(path: str, token: str):
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.delete(f"{GH_API}{path}", headers=gh_headers(token))
    return r.status_code

async def gh_put(path: str, token: str, body: dict = None):
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.put(f"{GH_API}{path}", headers=gh_headers(token), json=body or {})
    return r.status_code, r.json()

# ── Models ────────────────────────────────────────────────────────────────────
class RegisterReq(BaseModel):
    username:     str
    password:     str
    github_token: str

class LoginReq(BaseModel):
    username: str
    password: str

class RepoCreateReq(BaseModel):
    name: str
    description: str = ""
    private: bool = False
    auto_init: bool = True

class IssueReq(BaseModel):
    title: str
    body: str = ""

class FileReq(BaseModel):
    path: str
    content: str
    message: str = "Update via GitHub Manager"
    sha: Optional[str] = None
    branch: str = "main"

class BranchReq(BaseModel):
    name: str
    from_branch: str = "main"

class GistReq(BaseModel):
    filename: str
    content: str
    description: str = ""
    public: bool = True

class ProfileReq(BaseModel):
    name: Optional[str]        = None
    bio: Optional[str]         = None
    location: Optional[str]    = None
    blog: Optional[str]        = None
    twitter_username: Optional[str] = None
    company: Optional[str]     = None

class TokenUpdateReq(BaseModel):
    github_token: str

class PasswordReq(BaseModel):
    old_password: str
    new_password: str

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return FileResponse(str(BASE / "index.html"))

@app.get("/api/health")
async def health():
    return {"status": "ok", "app": APP_NAME}

# ══ AUTH ══════════════════════════════════════════════════════════════════════

@app.post("/api/register")
async def register(req: RegisterReq):
    req.username = req.username.strip().lower()
    if not req.username or len(req.username) < 3:
        raise HTTPException(400, "Username must be at least 3 characters")
    if not req.password or len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if not (req.github_token.startswith("ghp_") or req.github_token.startswith("github_pat_")):
        raise HTTPException(400, "GitHub token must start with ghp_ or github_pat_")

    if users.find_one({"_id": req.username}):
        raise HTTPException(409, "Username already taken")

    # Verify token works
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{GH_API}/user", headers=gh_headers(req.github_token))
        if r.status_code != 200:
            raise HTTPException(400, "GitHub token is invalid or doesn't have required permissions")
        gh_user = r.json()
    except httpx.RequestError:
        raise HTTPException(503, "Cannot reach GitHub API")

    users.insert_one({
        "_id":          req.username,
        "password":     hash_pw(req.password),
        "github_token": req.github_token,
        "gh_login":     gh_user.get("login", ""),
        "gh_name":      gh_user.get("name", ""),
        "gh_avatar":    gh_user.get("avatar_url", ""),
        "created_at":   datetime.utcnow().isoformat(),
    })

    token = make_token(req.username, req.username)
    return {"access_token": token, "username": req.username, "gh_login": gh_user.get("login")}


@app.post("/api/login")
async def login(req: LoginReq):
    req.username = req.username.strip().lower()
    doc = users.find_one({"_id": req.username})
    if not doc or doc["password"] != hash_pw(req.password):
        raise HTTPException(401, "Wrong username or password")

    token = make_token(req.username, req.username)
    return {
        "access_token": token,
        "username":     req.username,
        "gh_login":     doc.get("gh_login", ""),
        "gh_avatar":    doc.get("gh_avatar", ""),
        "gh_name":      doc.get("gh_name", ""),
    }

# ══ USER SETTINGS ═════════════════════════════════════════════════════════════

@app.get("/api/me")
async def get_me(u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    return {
        "username":  doc["_id"],
        "gh_login":  doc.get("gh_login", ""),
        "gh_name":   doc.get("gh_name", ""),
        "gh_avatar": doc.get("gh_avatar", ""),
    }

@app.put("/api/me/token")
async def update_gh_token(req: TokenUpdateReq, u=Depends(verify_token)):
    if not (req.github_token.startswith("ghp_") or req.github_token.startswith("github_pat_")):
        raise HTTPException(400, "Invalid token format")
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{GH_API}/user", headers=gh_headers(req.github_token))
        if r.status_code != 200:
            raise HTTPException(400, "Token invalid")
        gh_user = r.json()
    except httpx.RequestError:
        raise HTTPException(503, "Cannot reach GitHub")

    users.update_one({"_id": u["uid"]}, {"$set": {
        "github_token": req.github_token,
        "gh_login":     gh_user.get("login", ""),
        "gh_name":      gh_user.get("name", ""),
        "gh_avatar":    gh_user.get("avatar_url", ""),
    }})
    return {"ok": True}

@app.put("/api/me/password")
async def change_password(req: PasswordReq, u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    if doc["password"] != hash_pw(req.old_password):
        raise HTTPException(401, "Old password is wrong")
    if len(req.new_password) < 6:
        raise HTTPException(400, "New password too short")
    users.update_one({"_id": u["uid"]}, {"$set": {"password": hash_pw(req.new_password)}})
    return {"ok": True}

# ══ GITHUB PROFILE ════════════════════════════════════════════════════════════

@app.get("/api/github/profile")
async def gh_profile(u=Depends(verify_token)):
    doc   = get_user_doc(u["uid"])
    token = doc["github_token"]
    return await gh_get("/user", token)

@app.patch("/api/github/profile")
async def update_gh_profile(req: ProfileReq, u=Depends(verify_token)):
    doc   = get_user_doc(u["uid"])
    token = doc["github_token"]
    body  = {k: v for k, v in req.dict().items() if v is not None}
    status, data = await gh_patch("/user", token, body)
    if status not in (200, 201):
        raise HTTPException(status, data.get("message", "GitHub error"))
    # Update cached name/avatar
    users.update_one({"_id": u["uid"]}, {"$set": {
        "gh_name":   data.get("name", ""),
        "gh_avatar": data.get("avatar_url", ""),
    }})
    return data

# ══ REPOS ═════════════════════════════════════════════════════════════════════

@app.get("/api/github/repos")
async def list_repos(sort: str = "updated", per_page: int = 30, page: int = 1, u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    return await gh_get("/user/repos", doc["github_token"], {"sort": sort, "per_page": per_page, "page": page})

@app.get("/api/github/repos/{owner}/{repo}")
async def get_repo(owner: str, repo: str, u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    return await gh_get(f"/repos/{owner}/{repo}", doc["github_token"])

@app.post("/api/github/repos")
async def create_repo(req: RepoCreateReq, u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    status, data = await gh_post("/user/repos", doc["github_token"], req.dict())
    if status not in (200, 201):
        raise HTTPException(status, data.get("message", "Could not create repo"))
    return data

@app.delete("/api/github/repos/{owner}/{repo}")
async def delete_repo(owner: str, repo: str, u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    status = await gh_delete(f"/repos/{owner}/{repo}", doc["github_token"])
    if status not in (200, 204):
        raise HTTPException(status, "Could not delete repo")
    return {"ok": True}

@app.patch("/api/github/repos/{owner}/{repo}")
async def update_repo(owner: str, repo: str, req: dict, u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    status, data = await gh_patch(f"/repos/{owner}/{repo}", doc["github_token"], req)
    return data

# ══ REPO CONTENTS ════════════════════════════════════════════════════════════

@app.get("/api/github/repos/{owner}/{repo}/contents")
async def repo_contents(owner: str, repo: str, path: str = "", ref: str = "main", u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    p   = f"/repos/{owner}/{repo}/contents/{path}" if path else f"/repos/{owner}/{repo}/contents"
    return await gh_get(p, doc["github_token"], {"ref": ref})

@app.put("/api/github/repos/{owner}/{repo}/contents/{path:path}")
async def create_or_update_file(owner: str, repo: str, path: str, req: FileReq, u=Depends(verify_token)):
    import base64
    doc   = get_user_doc(u["uid"])
    token = doc["github_token"]
    encoded = base64.b64encode(req.content.encode()).decode()
    body = {"message": req.message, "content": encoded, "branch": req.branch}
    if req.sha:
        body["sha"] = req.sha
    status, data = await gh_put(f"/repos/{owner}/{repo}/contents/{path}", token, body)
    if status not in (200, 201):
        raise HTTPException(status, data.get("message", "File error"))
    return data

@app.delete("/api/github/repos/{owner}/{repo}/contents/{path:path}")
async def delete_file(owner: str, repo: str, path: str, sha: str, message: str = "Delete file", u=Depends(verify_token)):
    doc   = get_user_doc(u["uid"])
    token = doc["github_token"]
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.delete(
            f"{GH_API}/repos/{owner}/{repo}/contents/{path}",
            headers=gh_headers(token),
            json={"message": message, "sha": sha}
        )
    return {"ok": r.status_code in (200, 204)}

# ══ BRANCHES ════════════════════════════════════════════════════════════════

@app.get("/api/github/repos/{owner}/{repo}/branches")
async def list_branches(owner: str, repo: str, u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    return await gh_get(f"/repos/{owner}/{repo}/branches", doc["github_token"])

@app.post("/api/github/repos/{owner}/{repo}/branches")
async def create_branch(owner: str, repo: str, req: BranchReq, u=Depends(verify_token)):
    doc   = get_user_doc(u["uid"])
    token = doc["github_token"]
    # Get SHA of source branch
    src = await gh_get(f"/repos/{owner}/{repo}/git/refs/heads/{req.from_branch}", token)
    sha = src.get("object", {}).get("sha")
    if not sha:
        raise HTTPException(404, f"Branch '{req.from_branch}' not found")
    status, data = await gh_post(f"/repos/{owner}/{repo}/git/refs", token, {
        "ref": f"refs/heads/{req.name}", "sha": sha
    })
    if status not in (200, 201):
        raise HTTPException(status, data.get("message", "Cannot create branch"))
    return data

@app.delete("/api/github/repos/{owner}/{repo}/branches/{branch}")
async def delete_branch(owner: str, repo: str, branch: str, u=Depends(verify_token)):
    doc    = get_user_doc(u["uid"])
    status = await gh_delete(f"/repos/{owner}/{repo}/git/refs/heads/{branch}", doc["github_token"])
    return {"ok": status in (200, 204)}

# ══ COMMITS ════════════════════════════════════════════════════════════════

@app.get("/api/github/repos/{owner}/{repo}/commits")
async def list_commits(owner: str, repo: str, per_page: int = 20, sha: str = None, u=Depends(verify_token)):
    doc    = get_user_doc(u["uid"])
    params = {"per_page": per_page}
    if sha: params["sha"] = sha
    return await gh_get(f"/repos/{owner}/{repo}/commits", doc["github_token"], params)

# ══ ISSUES ════════════════════════════════════════════════════════════════════

@app.get("/api/github/repos/{owner}/{repo}/issues")
async def list_issues(owner: str, repo: str, state: str = "open", u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    return await gh_get(f"/repos/{owner}/{repo}/issues", doc["github_token"], {"state": state, "per_page": 30})

@app.post("/api/github/repos/{owner}/{repo}/issues")
async def create_issue(owner: str, repo: str, req: IssueReq, u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    status, data = await gh_post(f"/repos/{owner}/{repo}/issues", doc["github_token"], req.dict())
    if status not in (200, 201):
        raise HTTPException(status, data.get("message", "Cannot create issue"))
    return data

@app.patch("/api/github/repos/{owner}/{repo}/issues/{number}")
async def close_issue(owner: str, repo: str, number: int, u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    status, data = await gh_patch(f"/repos/{owner}/{repo}/issues/{number}", doc["github_token"], {"state": "closed"})
    return data

# ══ STARS ═════════════════════════════════════════════════════════════════════

@app.get("/api/github/starred")
async def list_starred(u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    return await gh_get("/user/starred", doc["github_token"], {"per_page": 30})

@app.put("/api/github/starred/{owner}/{repo}")
async def star_repo(owner: str, repo: str, u=Depends(verify_token)):
    doc    = get_user_doc(u["uid"])
    status, _ = await gh_put(f"/user/starred/{owner}/{repo}", doc["github_token"])
    return {"ok": status in (204, 200)}

@app.delete("/api/github/starred/{owner}/{repo}")
async def unstar_repo(owner: str, repo: str, u=Depends(verify_token)):
    doc    = get_user_doc(u["uid"])
    status = await gh_delete(f"/user/starred/{owner}/{repo}", doc["github_token"])
    return {"ok": status in (204, 200)}

# ══ GISTS ════════════════════════════════════════════════════════════════════

@app.get("/api/github/gists")
async def list_gists(u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    return await gh_get("/gists", doc["github_token"], {"per_page": 30})

@app.get("/api/github/gists/{gist_id}")
async def get_gist(gist_id: str, u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    return await gh_get(f"/gists/{gist_id}", doc["github_token"])

@app.post("/api/github/gists")
async def create_gist(req: GistReq, u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    body = {
        "description": req.description,
        "public": req.public,
        "files": {req.filename: {"content": req.content}}
    }
    status, data = await gh_post("/gists", doc["github_token"], body)
    if status not in (200, 201):
        raise HTTPException(status, data.get("message", "Cannot create gist"))
    return data

@app.delete("/api/github/gists/{gist_id}")
async def delete_gist(gist_id: str, u=Depends(verify_token)):
    doc    = get_user_doc(u["uid"])
    status = await gh_delete(f"/gists/{gist_id}", doc["github_token"])
    return {"ok": status in (200, 204)}

# ══ NOTIFICATIONS ════════════════════════════════════════════════════════════

@app.get("/api/github/notifications")
async def get_notifications(u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    return await gh_get("/notifications", doc["github_token"], {"per_page": 20})

# ══ SEARCH ════════════════════════════════════════════════════════════════════

@app.get("/api/github/search/repos")
async def search_repos(q: str, sort: str = "stars", per_page: int = 20, u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    return await gh_get("/search/repositories", doc["github_token"], {"q": q, "sort": sort, "per_page": per_page})

@app.get("/api/github/search/users")
async def search_users(q: str, per_page: int = 20, u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    return await gh_get("/search/users", doc["github_token"], {"q": q, "per_page": per_page})

# ══ FOLLOWING ════════════════════════════════════════════════════════════════

@app.get("/api/github/following")
async def list_following(u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    return await gh_get("/user/following", doc["github_token"], {"per_page": 30})

@app.get("/api/github/followers")
async def list_followers(u=Depends(verify_token)):
    doc = get_user_doc(u["uid"])
    return await gh_get("/user/followers", doc["github_token"], {"per_page": 30})

# ══ RUN ══════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
