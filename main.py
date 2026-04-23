"""
GitHub Manager Web — main.py
ALL features from the Telegram bot, exposed as web API.
Users login with username+password. Each user sees ONLY their own data.
"""

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from pathlib import Path
import jwt, hashlib, os, sys, shutil, tempfile, httpx
from datetime import datetime, timedelta
from pymongo import MongoClient

# ── Config ────────────────────────────────────────────────────────────────────
from config import MONGO_URI, JWT_SECRET, APP_NAME, WORK_DIR

# Make sure workspace dir exists
os.makedirs(WORK_DIR, exist_ok=True)

# ── git_utils is bundled directly in this folder — no BOT_DIR needed ─────────
import git_utils as git
git.set_work_dir(WORK_DIR)
GIT_OK = True
print(f"✅ git_utils ready | workspace: {WORK_DIR}")

# ── MongoDB ────────────────────────────────────────────────────────────────────
mongo   = MongoClient(MONGO_URI)
db      = mongo["github_manager"]
users   = db["users"]
logs    = db["logs"]

app = FastAPI(title=APP_NAME)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

STATIC = Path(__file__).parent / "static"
STATIC.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC)), name="static")

security = HTTPBearer(auto_error=False)
GH_API   = "https://api.github.com"
GH_H     = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}

# ── Helpers ───────────────────────────────────────────────────────────────────
def hp(pw): return hashlib.sha256(pw.encode()).hexdigest()

def make_tok(uid, uname):
    return jwt.encode({"uid": uid, "username": uname,
                       "exp": datetime.utcnow() + timedelta(days=30)},
                      JWT_SECRET, algorithm="HS256")

def verify_tok(cred: HTTPAuthorizationCredentials = Depends(security)):
    if not cred: raise HTTPException(401, "Not authenticated")
    try: return jwt.decode(cred.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError: raise HTTPException(401, "Session expired")
    except: raise HTTPException(401, "Invalid session")

def get_doc(uid):
    d = users.find_one({"_id": uid})
    if not d: raise HTTPException(404, "User not found")
    return d

def gh_h(token): return {**GH_H, "Authorization": f"Bearer {token}"}

async def gh(method, path, token, **kw):
    async with httpx.AsyncClient(timeout=30) as c:
        r = await getattr(c, method)(f"{GH_API}{path}", headers=gh_h(token), **kw)
    if r.status_code == 401: raise HTTPException(401, "GitHub token invalid")
    if r.status_code == 403: raise HTTPException(403, "GitHub permission denied")
    if r.status_code == 404: raise HTTPException(404, "Not found on GitHub")
    return r

def add_log(uid, uname, action, detail=""):
    logs.insert_one({"uid": uid, "username": uname, "action": action,
                     "detail": str(detail)[:200], "time": datetime.utcnow().isoformat()})

def workspace_path(folder=""):
    p = os.path.join(WORK_DIR, folder) if folder else WORK_DIR
    return p

def require_git():
    if not GIT_OK:
        raise HTTPException(503, "git_utils not available")

# ── Models ────────────────────────────────────────────────────────────────────
class RegReq(BaseModel):
    username: str; password: str; github_token: str

class LoginReq(BaseModel):
    username: str; password: str

class TokenReq(BaseModel):
    github_token: str

class PwReq(BaseModel):
    old_password: str; new_password: str

class RepoCreateReq(BaseModel):
    name: str; description: str = ""; private: bool = False; auto_init: bool = True

class RepoAddReq(BaseModel):
    url: str; name: str = ""; is_private: bool = False

class RepoVisReq(BaseModel):
    url: str; private: bool

class CloneReq(BaseModel):
    url: str; use_token: bool = False

class PushReq(BaseModel):
    folder: str; repo_url: str; branch: str = "main"

class PullReq(BaseModel):
    folder: str; repo_url: str = ""

class MakeZipReq(BaseModel):
    folder: str

class GrepReq(BaseModel):
    folder: str; search: str; only_py: bool = False

class ReplaceReq(BaseModel):
    folder: str; old_text: str; new_text: str; only_py: bool = True

class FileWriteReq(BaseModel):
    folder: str; path: str; content: str

class FileDeleteReq(BaseModel):
    folder: str; paths: list

class FileEditLineReq(BaseModel):
    folder: str; path: str; line_num: int; new_line: str

class MultiFileReq(BaseModel):
    folder: str; files: dict  # {path: content}

class BulkRenameReq(BaseModel):
    folder: str; pattern: str; prefix: str = ""; suffix: str = ""; replace_from: str = ""; replace_to: str = ""

class RenameDirReq(BaseModel):
    old_name: str; new_name: str

class RenamePathReq(BaseModel):
    folder: str; old_path: str; new_path: str

class BranchCreateReq(BaseModel):
    repo_url: str; name: str; from_branch: str = "main"

class BranchDeleteReq(BaseModel):
    repo_url: str; branch: str

class BranchMergeReq(BaseModel):
    repo_url: str; head: str; base: str; message: str = "Merge via GitHub Manager"

class CollabReq(BaseModel):
    repo_url: str; username: str; permission: str = "push"

class CollabRemoveReq(BaseModel):
    repo_url: str; username: str

class GistCreateReq(BaseModel):
    filename: str; content: str; description: str = ""; public: bool = True

class ProfileReq(BaseModel):
    name: Optional[str] = None; bio: Optional[str] = None
    location: Optional[str] = None; blog: Optional[str] = None
    twitter_username: Optional[str] = None

class IssueReq(BaseModel):
    title: str; body: str = ""

# ── ROOT ──────────────────────────────────────────────────────────────────────
@app.get("/")
async def root(): return FileResponse(str(STATIC / "index.html"))

@app.get("/api/health")
async def health(): return {"status": "ok", "git_utils": GIT_OK, "work_dir": WORK_DIR}

# ══ AUTH ══════════════════════════════════════════════════════════════════════
@app.post("/api/register")
async def register(req: RegReq):
    req.username = req.username.strip().lower()
    if len(req.username) < 3: raise HTTPException(400, "Username min 3 chars")
    if len(req.password) < 6: raise HTTPException(400, "Password min 6 chars")
    if not (req.github_token.startswith("ghp_") or req.github_token.startswith("github_pat_")):
        raise HTTPException(400, "Token must start with ghp_ or github_pat_")
    if users.find_one({"_id": req.username}):
        raise HTTPException(409, "Username taken")
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{GH_API}/user", headers=gh_h(req.github_token))
    if r.status_code != 200: raise HTTPException(400, "GitHub token invalid")
    ghd = r.json()
    users.insert_one({"_id": req.username, "password": hp(req.password),
                      "github_token": req.github_token, "gh_login": ghd.get("login",""),
                      "gh_name": ghd.get("name",""), "gh_avatar": ghd.get("avatar_url",""),
                      "repos": [], "created_at": datetime.utcnow().isoformat()})
    return {"access_token": make_tok(req.username, req.username),
            "username": req.username, "gh_login": ghd.get("login"), "gh_avatar": ghd.get("avatar_url")}

@app.post("/api/login")
async def login(req: LoginReq):
    req.username = req.username.strip().lower()
    d = users.find_one({"_id": req.username})
    if not d or d["password"] != hp(req.password): raise HTTPException(401, "Wrong username or password")
    return {"access_token": make_tok(req.username, req.username),
            "username": req.username, "gh_login": d.get("gh_login",""),
            "gh_avatar": d.get("gh_avatar",""), "gh_name": d.get("gh_name","")}

# ══ ME ════════════════════════════════════════════════════════════════════════
@app.get("/api/me")
async def get_me(u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    return {"username": d["_id"], "gh_login": d.get("gh_login",""),
            "gh_name": d.get("gh_name",""), "gh_avatar": d.get("gh_avatar","")}

@app.put("/api/me/token")
async def update_token(req: TokenReq, u=Depends(verify_tok)):
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{GH_API}/user", headers=gh_h(req.github_token))
    if r.status_code != 200: raise HTTPException(400, "Token invalid")
    ghd = r.json()
    users.update_one({"_id": u["uid"]}, {"$set": {"github_token": req.github_token,
        "gh_login": ghd.get("login",""), "gh_name": ghd.get("name",""), "gh_avatar": ghd.get("avatar_url","")}})
    return {"ok": True}

@app.put("/api/me/password")
async def change_pw(req: PwReq, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    if d["password"] != hp(req.old_password): raise HTTPException(401, "Wrong old password")
    if len(req.new_password) < 6: raise HTTPException(400, "Too short")
    users.update_one({"_id": u["uid"]}, {"$set": {"password": hp(req.new_password)}})
    return {"ok": True}

# ══ MY REPO LIST (bot-style saved repos) ══════════════════════════════════════
@app.get("/api/my-repos")
async def my_repos(u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    repos = d.get("repos", [])
    active = d.get("active_repo", "")
    return {"repos": repos, "active": active}

@app.post("/api/my-repos")
async def add_my_repo(req: RepoAddReq, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    repos = d.get("repos", [])
    url = req.url.rstrip("/")
    if any(r["url"] == url for r in repos): raise HTTPException(409, "Already in list")
    repos.append({"url": url, "name": req.name or url.split("/")[-1], "is_private": req.is_private})
    users.update_one({"_id": u["uid"]}, {"$set": {"repos": repos}})
    return {"ok": True}

@app.post("/api/my-repos/{idx}/activate")
async def activate_repo(idx: int, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    repos = d.get("repos", [])
    if not (0 <= idx < len(repos)): raise HTTPException(404, "Not found")
    users.update_one({"_id": u["uid"]}, {"$set": {"active_repo": repos[idx]["url"]}})
    return {"ok": True, "active": repos[idx]["url"]}

@app.delete("/api/my-repos/{idx}")
async def del_my_repo(idx: int, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    repos = d.get("repos", [])
    if not (0 <= idx < len(repos)): raise HTTPException(404, "Not found")
    removed = repos.pop(idx)
    users.update_one({"_id": u["uid"]}, {"$set": {"repos": repos}})
    return {"ok": True, "removed": removed}

@app.put("/api/my-repos/{idx}/visibility")
async def toggle_vis(idx: int, req: RepoVisReq, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    token = d["github_token"]
    require_git()
    ok, msg = git.github_set_visibility(token, req.url, req.private)
    repos = d.get("repos", [])
    if 0 <= idx < len(repos):
        repos[idx]["is_private"] = req.private
        users.update_one({"_id": u["uid"]}, {"$set": {"repos": repos}})
    add_log(u["uid"], u["username"], "set_visibility", f"{req.url} → {'private' if req.private else 'public'}")
    return {"ok": ok, "message": msg}

# ══ GIT WORKSPACE OPERATIONS (clone, push, pull, zip) ═════════════════════════
@app.get("/api/workspace")
async def list_workspace(u=Depends(verify_tok)):
    require_git()
    folders = git.get_workspace_folders()
    result = []
    for f in folders:
        p = workspace_path(f)
        size = sum(os.path.getsize(os.path.join(dp,fn))
                   for dp,dn,fns in os.walk(p) for fn in fns if not fn.startswith('.')) if os.path.exists(p) else 0
        result.append({"name": f, "size_kb": round(size/1024, 1),
                       "is_git": os.path.exists(os.path.join(p,".git"))})
    return {"folders": result}

@app.get("/api/workspace/{folder}/tree")
async def get_tree(folder: str, u=Depends(verify_tok)):
    require_git()
    p = workspace_path(folder)
    if not os.path.exists(p): raise HTTPException(404, "Folder not found")
    tree = git.list_tree(p)
    return {"tree": tree, "folder": folder}

@app.get("/api/workspace/{folder}/files")
async def list_files(folder: str, path: str = "", u=Depends(verify_tok)):
    require_git()
    base = workspace_path(folder)
    target = os.path.join(base, path) if path else base
    if not os.path.exists(target): raise HTTPException(404, "Path not found")
    items = []
    for entry in sorted(os.scandir(target), key=lambda e: (not e.is_dir(), e.name.lower())):
        if entry.name.startswith("."): continue
        items.append({"name": entry.name, "type": "dir" if entry.is_dir() else "file",
                      "size": entry.stat().st_size if entry.is_file() else 0})
    return {"items": items, "folder": folder, "path": path}

@app.get("/api/workspace/{folder}/read")
async def read_file(folder: str, path: str, u=Depends(verify_tok)):
    require_git()
    ok, content = git.read_file_in_repo(folder, path)
    if not ok: raise HTTPException(404, content)
    return {"content": content, "path": path}

@app.post("/api/workspace/clone")
async def clone(req: CloneReq, u=Depends(verify_tok)):
    require_git()
    d = get_doc(u["uid"])
    token = d["github_token"] if req.use_token else None
    name = req.url.rstrip("/").split("/")[-1].replace(".git","")
    dest = workspace_path(name)
    ok, msg = git.clone_repo(req.url, dest, token=token)
    if ok:
        # Auto-add to repo list
        repos = d.get("repos", [])
        if not any(r["url"] == req.url for r in repos):
            repos.append({"url": req.url, "name": name, "is_private": req.use_token})
            users.update_one({"_id": u["uid"]}, {"$set": {"repos": repos, "active_repo": req.url}})
        add_log(u["uid"], u["username"], "git_clone", req.url)
    return {"ok": ok, "message": msg}

@app.post("/api/workspace/push")
async def push(req: PushReq, u=Depends(verify_tok)):
    require_git()
    d = get_doc(u["uid"])
    token = d["github_token"]
    dir_path = workspace_path(req.folder)
    if not os.path.exists(dir_path): raise HTTPException(404, "Folder not found")
    result = git.git_push(dir_path, token, req.repo_url, req.branch)
    add_log(u["uid"], u["username"], "git_push", f"{req.folder} → {req.repo_url}")
    return {"ok": "✅" in result, "message": result}

@app.post("/api/workspace/pull")
async def pull(req: PullReq, u=Depends(verify_tok)):
    require_git()
    d = get_doc(u["uid"])
    token = d["github_token"]
    dir_path = workspace_path(req.folder)
    if not os.path.exists(dir_path): raise HTTPException(404, "Folder not found")
    result = git.git_pull(dir_path, token=token, repo_url=req.repo_url or None)
    add_log(u["uid"], u["username"], "git_pull", req.folder)
    return {"ok": "✅" in result, "message": result}

@app.post("/api/workspace/make-zip")
async def make_zip(req: MakeZipReq, u=Depends(verify_tok)):
    require_git()
    dir_path = workspace_path(req.folder)
    if not os.path.exists(dir_path): raise HTTPException(404, "Folder not found")
    zip_path = workspace_path(f"{req.folder}.zip")
    git.make_zip(dir_path, zip_path)
    add_log(u["uid"], u["username"], "make_zip", req.folder)
    return FileResponse(zip_path, filename=f"{req.folder}.zip",
                        media_type="application/zip")

@app.post("/api/workspace/upload-zip")
async def upload_zip(
    file: UploadFile = File(...),
    repo_url: str = Form(...),
    branch: str = Form("main"),
    u=Depends(verify_tok)
):
    require_git()
    d = get_doc(u["uid"])
    token = d["github_token"]
    tmp = tempfile.mktemp(suffix=".zip")
    with open(tmp, "wb") as f:
        f.write(await file.read())
    ok, result = git.unzip_and_push(tmp, token, repo_url, branch)
    try: os.remove(tmp)
    except: pass
    add_log(u["uid"], u["username"], "upload_zip", f"→ {repo_url}")
    return {"ok": ok, "message": result}

@app.delete("/api/workspace/{folder}")
async def delete_workspace_folder(folder: str, u=Depends(verify_tok)):
    p = workspace_path(folder)
    if not os.path.exists(p): raise HTTPException(404, "Folder not found")
    shutil.rmtree(p, ignore_errors=True)
    add_log(u["uid"], u["username"], "clean_folder", folder)
    return {"ok": True}

# ══ FILE MANAGER ════════════════════════════════════════════════════════════
@app.post("/api/fm/grep")
async def grep(req: GrepReq, u=Depends(verify_tok)):
    require_git()
    p = workspace_path(req.folder)
    result = git.grep_text(p, req.search, req.only_py)
    return {"result": result}

@app.post("/api/fm/replace")
async def replace(req: ReplaceReq, u=Depends(verify_tok)):
    require_git()
    p = workspace_path(req.folder)
    ok, result = git.replace_text(p, req.old_text, req.new_text, req.only_py)
    add_log(u["uid"], u["username"], "replace_text", f"{req.folder}: '{req.old_text}'→'{req.new_text}'")
    return {"ok": ok, "result": result}

@app.post("/api/fm/write-file")
async def write_file(req: FileWriteReq, u=Depends(verify_tok)):
    require_git()
    ok, msg = git.write_file_in_repo(req.folder, req.path, req.content)
    add_log(u["uid"], u["username"], "file_write", f"{req.folder}/{req.path}")
    return {"ok": ok, "message": msg}

@app.post("/api/fm/delete-paths")
async def delete_paths(req: FileDeleteReq, u=Depends(verify_tok)):
    require_git()
    results = []
    for p in req.paths:
        ok, msg = git.delete_path_in_repo(req.folder, p)
        results.append({"path": p, "ok": ok, "message": msg})
    add_log(u["uid"], u["username"], "file_delete", f"{req.folder}: {req.paths}")
    return {"results": results}

@app.post("/api/fm/edit-line")
async def edit_line(req: FileEditLineReq, u=Depends(verify_tok)):
    require_git()
    ok, msg = git.edit_file_lines(req.folder, req.path, req.line_num, req.new_line)
    add_log(u["uid"], u["username"], "edit_line", f"{req.folder}/{req.path}:{req.line_num}")
    return {"ok": ok, "message": msg}

@app.post("/api/fm/multi-write")
async def multi_write(req: MultiFileReq, u=Depends(verify_tok)):
    require_git()
    results = []
    for path, content in req.files.items():
        ok, msg = git.write_file_in_repo(req.folder, path, content)
        results.append({"path": path, "ok": ok, "message": msg})
    add_log(u["uid"], u["username"], "multi_file_write", f"{req.folder}: {len(req.files)} files")
    return {"results": results}

@app.post("/api/fm/bulk-rename")
async def bulk_rename(req: BulkRenameReq, u=Depends(verify_tok)):
    require_git()
    p = workspace_path(req.folder)
    ok, result = git.bulk_rename(p, req.pattern, req.prefix, req.suffix, req.replace_from, req.replace_to)
    add_log(u["uid"], u["username"], "bulk_rename", f"{req.folder}: {req.pattern}")
    return {"ok": ok, "result": result}

@app.post("/api/fm/rename-dir")
async def rename_dir(req: RenameDirReq, u=Depends(verify_tok)):
    require_git()
    ok, msg = git.rename_folder(req.old_name, req.new_name)
    add_log(u["uid"], u["username"], "rename_dir", f"{req.old_name} → {req.new_name}")
    return {"ok": ok, "message": msg}

@app.post("/api/fm/rename-path")
async def rename_path(req: RenamePathReq, u=Depends(verify_tok)):
    require_git()
    ok, msg = git.rename_path_in_repo(req.folder, req.old_path, req.new_path)
    add_log(u["uid"], u["username"], "rename_path", f"{req.folder}: {req.old_path}→{req.new_path}")
    return {"ok": ok, "message": msg}

# ══ GITHUB REPOS API ══════════════════════════════════════════════════════════
@app.get("/api/github/repos")
async def gh_repos(sort: str = "updated", per_page: int = 30, page: int = 1, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    r = await gh("get", "/user/repos", d["github_token"], params={"sort": sort, "per_page": per_page, "page": page})
    return r.json()

@app.post("/api/github/repos")
async def gh_create_repo(req: RepoCreateReq, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    require_git()
    ok, msg, url = git.github_create_repo(d["github_token"], req.name, req.private, req.description)
    if ok and url:
        repos = d.get("repos", [])
        repos.append({"url": url, "name": req.name, "is_private": req.private})
        users.update_one({"_id": u["uid"]}, {"$set": {"repos": repos, "active_repo": url}})
        add_log(u["uid"], u["username"], "repo_create", req.name)
    return {"ok": ok, "message": msg, "url": url}

@app.delete("/api/github/repos")
async def gh_delete_repo(url: str, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    require_git()
    ok, msg = git.github_delete_repo(d["github_token"], url)
    if ok:
        repos = [r for r in d.get("repos",[]) if r["url"] != url]
        users.update_one({"_id": u["uid"]}, {"$set": {"repos": repos}})
        add_log(u["uid"], u["username"], "repo_delete_gh", url)
    return {"ok": ok, "message": msg}

@app.get("/api/github/repos/{owner}/{repo}/commits")
async def gh_commits(owner: str, repo: str, per_page: int = 20, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    require_git()
    ok, result = git.github_get_commits(d["github_token"], f"https://github.com/{owner}/{repo}", per_page)
    return {"ok": ok, "commits": result}

# ══ BRANCHES ══════════════════════════════════════════════════════════════════
@app.get("/api/github/branches")
async def gh_branches(repo_url: str, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    require_git()
    ok, branches, err = git.github_list_branches(d["github_token"], repo_url)
    if not ok: raise HTTPException(400, err)
    return {"branches": branches}

@app.post("/api/github/branches")
async def gh_create_branch(req: BranchCreateReq, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    require_git()
    ok, msg = git.github_create_branch(d["github_token"], req.repo_url, req.name, req.from_branch)
    add_log(u["uid"], u["username"], "branch_create", f"{req.repo_url}: {req.name}")
    return {"ok": ok, "message": msg}

@app.delete("/api/github/branches")
async def gh_delete_branch(repo_url: str, branch: str, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    require_git()
    ok, msg = git.github_delete_branch(d["github_token"], repo_url, branch)
    add_log(u["uid"], u["username"], "branch_delete", f"{repo_url}: {branch}")
    return {"ok": ok, "message": msg}

@app.post("/api/github/branches/merge")
async def gh_merge(req: BranchMergeReq, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    require_git()
    ok, msg = git.github_merge_branch(d["github_token"], req.repo_url, req.base, req.head, req.message)
    add_log(u["uid"], u["username"], "branch_merge", f"{req.repo_url}: {req.head}→{req.base}")
    return {"ok": ok, "message": msg}

# ══ COLLABORATORS ═════════════════════════════════════════════════════════════
@app.get("/api/github/collaborators")
async def gh_collabs(repo_url: str, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    require_git()
    ok, collabs, err = git.github_list_collaborators(d["github_token"], repo_url)
    if not ok: raise HTTPException(400, err)
    return {"collaborators": collabs}

@app.post("/api/github/collaborators")
async def gh_add_collab(req: CollabReq, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    require_git()
    ok, msg = git.github_add_collaborator(d["github_token"], req.repo_url, req.username, req.permission)
    add_log(u["uid"], u["username"], "collab_add", f"{req.repo_url}: {req.username}")
    return {"ok": ok, "message": msg}

@app.delete("/api/github/collaborators")
async def gh_remove_collab(repo_url: str, username: str, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    require_git()
    ok, msg = git.github_remove_collaborator(d["github_token"], repo_url, username)
    add_log(u["uid"], u["username"], "collab_remove", f"{repo_url}: {username}")
    return {"ok": ok, "message": msg}

# ══ GISTS ════════════════════════════════════════════════════════════════════
@app.get("/api/github/gists")
async def gh_gists(u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    require_git()
    ok, gists, err = git.github_list_gists(d["github_token"])
    if not ok: raise HTTPException(400, err)
    return {"gists": gists}

@app.post("/api/github/gists")
async def gh_create_gist(req: GistCreateReq, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    require_git()
    ok, result = git.github_create_gist(d["github_token"], req.filename, req.content, req.description, req.public)
    add_log(u["uid"], u["username"], "gist_create", req.filename)
    return {"ok": ok, "message": result}

@app.delete("/api/github/gists/{gist_id}")
async def gh_delete_gist(gist_id: str, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    require_git()
    ok, msg = git.github_delete_gist(d["github_token"], gist_id)
    add_log(u["uid"], u["username"], "gist_delete", gist_id[:12])
    return {"ok": ok, "message": msg}

# ══ PROFILE ═══════════════════════════════════════════════════════════════════
@app.get("/api/github/profile")
async def gh_profile(u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    require_git()
    ok, profile, err = git.github_get_profile(d["github_token"])
    if not ok: raise HTTPException(400, err)
    return profile

@app.patch("/api/github/profile")
async def gh_update_profile(req: ProfileReq, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    require_git()
    kwargs = {k: v for k, v in req.dict().items() if v is not None}
    ok, msg = git.github_update_profile(d["github_token"], **kwargs)
    if ok:
        upd = {}
        if req.name: upd["gh_name"] = req.name
        if upd: users.update_one({"_id": u["uid"]}, {"$set": upd})
    add_log(u["uid"], u["username"], "profile_update", str(list(kwargs.keys())))
    return {"ok": ok, "message": msg}

# ══ SEARCH ════════════════════════════════════════════════════════════════════
@app.get("/api/github/search/repos")
async def gh_search_repos(q: str, sort: str = "stars", per_page: int = 20, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    r = await gh("get", "/search/repositories", d["github_token"], params={"q": q, "sort": sort, "per_page": per_page})
    return r.json()

@app.get("/api/github/search/users")
async def gh_search_users(q: str, per_page: int = 20, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    r = await gh("get", "/search/users", d["github_token"], params={"q": q, "per_page": per_page})
    return r.json()

# ══ STARS ═════════════════════════════════════════════════════════════════════
@app.get("/api/github/starred")
async def gh_starred(u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    r = await gh("get", "/user/starred", d["github_token"], params={"per_page": 30})
    return r.json()

@app.put("/api/github/starred/{owner}/{repo}")
async def gh_star(owner: str, repo: str, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    r = await gh("put", f"/user/starred/{owner}/{repo}", d["github_token"])
    return {"ok": r.status_code in (204, 200)}

@app.delete("/api/github/starred/{owner}/{repo}")
async def gh_unstar(owner: str, repo: str, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    r = await gh("delete", f"/user/starred/{owner}/{repo}", d["github_token"])
    return {"ok": r.status_code in (204, 200)}

# ══ NOTIFICATIONS ═════════════════════════════════════════════════════════════
@app.get("/api/github/notifications")
async def gh_notifs(u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    r = await gh("get", "/notifications", d["github_token"], params={"per_page": 20})
    return r.json()

# ══ ISSUES ═══════════════════════════════════════════════════════════════════
@app.get("/api/github/issues")
async def gh_issues(repo_url: str, state: str = "open", u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    import re
    m = re.search(r"github\.com[:/](.+?)(?:\.git)?$", repo_url)
    if not m: raise HTTPException(400, "Invalid repo URL")
    r = await gh("get", f"/repos/{m.group(1)}/issues", d["github_token"], params={"state": state, "per_page": 30})
    return r.json()

@app.post("/api/github/issues")
async def gh_create_issue(repo_url: str, req: IssueReq, u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    import re
    m = re.search(r"github\.com[:/](.+?)(?:\.git)?$", repo_url)
    if not m: raise HTTPException(400, "Invalid repo URL")
    r = await gh("post", f"/repos/{m.group(1)}/issues", d["github_token"], json=req.dict())
    return r.json()

# ══ LOGS ══════════════════════════════════════════════════════════════════════
@app.get("/api/logs")
async def my_logs(limit: int = 30, u=Depends(verify_tok)):
    result = list(logs.find({"uid": u["uid"]}, {"_id": 0}).sort("time", -1).limit(limit))
    return {"logs": result}

@app.delete("/api/logs")
async def clear_logs(u=Depends(verify_tok)):
    logs.delete_many({"uid": u["uid"]})
    return {"ok": True}

# ══ STATS ════════════════════════════════════════════════════════════════════
@app.get("/api/stats")
async def my_stats(u=Depends(verify_tok)):
    d = get_doc(u["uid"])
    total_actions = logs.count_documents({"uid": u["uid"]})
    folders = git.get_workspace_folders() if GIT_OK else []
    return {
        "repos": len(d.get("repos", [])),
        "active": d.get("active_repo", ""),
        "workspace_folders": len(folders),
        "total_actions": total_actions,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)

# ══ GITHUB FILE OPS (used by repo viewer) ════════════════════════════════════
class GhFileReq(BaseModel):
    owner: str; name: str; path: str; content: str
    message: str = "Update via GitHub Manager"; branch: str = "main"; sha: Optional[str] = None

@app.post("/api/workspace/file-gh")
async def gh_file_create(req: GhFileReq, u=Depends(verify_tok)):
    import base64
    d = get_user_doc(u["uid"])
    token = d["github_token"]
    encoded = base64.b64encode(req.content.encode()).decode()
    body = {"message": req.message, "content": encoded, "branch": req.branch}
    if req.sha: body["sha"] = req.sha
    r = await gh("put", f"/repos/{req.owner}/{req.name}/contents/{req.path}", token, json=body)
    return {"ok": r.status_code in (200, 201), "message": "✅ File saved!" if r.status_code in (200,201) else r.text}

@app.put("/api/workspace/file-gh")
async def gh_file_update(req: GhFileReq, u=Depends(verify_tok)):
    import base64
    d = get_user_doc(u["uid"])
    token = d["github_token"]
    encoded = base64.b64encode(req.content.encode()).decode()
    body = {"message": req.message, "content": encoded, "branch": req.branch}
    if req.sha: body["sha"] = req.sha
    r = await gh("put", f"/repos/{req.owner}/{req.name}/contents/{req.path}", token, json=body)
    return {"ok": r.status_code in (200, 201), "message": "✅ File updated!" if r.status_code in (200,201) else r.text}

@app.delete("/api/workspace/file-gh")
async def gh_file_delete(owner: str, name: str, path: str, sha: str, message: str = "Delete file", branch: str = "main", u=Depends(verify_tok)):
    d = get_user_doc(u["uid"])
    token = d["github_token"]
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.delete(f"{GH_API}/repos/{owner}/{name}/contents/{path}", headers=gh_h(token), json={"message": message, "sha": sha, "branch": branch})
    return {"ok": r.status_code in (200, 204)}

# ══ GITHUB REPO (single) ═════════════════════════════════════════════════════
@app.get("/api/github/repos/{owner}/{repo}")
async def gh_repo_single(owner: str, repo: str, u=Depends(verify_tok)):
    d = get_user_doc(u["uid"])
    r = await gh("get", f"/repos/{owner}/{repo}", d["github_token"])
    return r.json()

# ══ GITHUB ISSUES (patch to close) ═══════════════════════════════════════════
@app.patch("/api/github/issues")
async def gh_close_issue(repo_url: str, number: int, u=Depends(verify_tok)):
    import re
    d = get_user_doc(u["uid"])
    m = re.search(r"github\.com[:/](.+?)(?:\.git)?$", repo_url)
    if not m: raise HTTPException(400, "Invalid repo URL")
    r = await gh("patch", f"/repos/{m.group(1)}/issues/{number}", d["github_token"], json={"state": "closed"})
    return r.json()

# ══ GITHUB CONTENTS PROXY (for repo file browser) ════════════════════════════
@app.get("/api/github/contents/{owner}/{repo}")
async def gh_contents(owner: str, repo: str, path: str = "", ref: str = "main", u=Depends(verify_tok)):
    d = get_user_doc(u["uid"])
    token = d["github_token"]
    endpoint = f"/repos/{owner}/{repo}/contents/{path}" if path else f"/repos/{owner}/{repo}/contents"
    r = await gh("get", endpoint, token, params={"ref": ref})
    return r.json()

@app.get("/api/github/gists/{gist_id}")
async def gh_gist_single(gist_id: str, u=Depends(verify_tok)):
    d = get_user_doc(u["uid"])
    r = await gh("get", f"/gists/{gist_id}", d["github_token"])
    return r.json()

@app.get("/api/github/repos/{owner}/{repo}/branches")
async def gh_repo_branches(owner: str, repo: str, u=Depends(verify_tok)):
    d = get_user_doc(u["uid"])
    r = await gh("get", f"/repos/{owner}/{repo}/branches", d["github_token"])
    return r.json()

@app.get("/api/github/repos/{owner}/{repo}/commits")
async def gh_repo_commits_direct(owner: str, repo: str, per_page: int = 20, u=Depends(verify_tok)):
    d = get_user_doc(u["uid"])
    r = await gh("get", f"/repos/{owner}/{repo}/commits", d["github_token"], params={"per_page": per_page})
    return r.json()

@app.get("/api/github/repos/{owner}/{repo}/issues")
async def gh_repo_issues(owner: str, repo: str, state: str = "open", u=Depends(verify_tok)):
    d = get_user_doc(u["uid"])
    r = await gh("get", f"/repos/{owner}/{repo}/issues", d["github_token"], params={"state": state, "per_page": 30})
    return r.json()

@app.post("/api/github/repos/{owner}/{repo}/issues")
async def gh_repo_create_issue(owner: str, repo: str, req: IssueReq, u=Depends(verify_tok)):
    d = get_user_doc(u["uid"])
    r = await gh("post", f"/repos/{owner}/{repo}/issues", d["github_token"], json=req.dict())
    return r.json()

@app.patch("/api/github/repos/{owner}/{repo}/issues/{number}")
async def gh_repo_close_issue(owner: str, repo: str, number: int, u=Depends(verify_tok)):
    d = get_user_doc(u["uid"])
    r = await gh("patch", f"/repos/{owner}/{repo}/issues/{number}", d["github_token"], json={"state": "closed"})
    return r.json()
