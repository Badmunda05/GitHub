/* ═══════════════════════════════════════════════════════════════
   GitHub Manager — app.js
   Full GitHub dashboard: repos, files, branches, commits,
   issues, gists, profile, stars, search, notifications
   ═══════════════════════════════════════════════════════════════ */

// ── State ────────────────────────────────────────────────────────
const S = {
  token:      null,
  user:       null,
  repos:      [],
  repoFilter: "all",
  currentRepo: null,    // { owner, name, branch }
  currentPath: "",
  repoTab:    "code",
  searchType: "repos",
  searchQ:    "",
};

// ── API ───────────────────────────────────────────────────────────
const T = () => localStorage.getItem("ghm_token");

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(T() ? { Authorization: "Bearer " + T() } : {}) },
    ...opts,
  });
  if (res.status === 401) { doLogout(); return null; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);
  return data;
}

// ── Toast ─────────────────────────────────────────────────────────
let toastT;
function toast(msg, type = "ok") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.add("hidden"), 3000);
}

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("ghm_token");
  if (saved) {
    S.token = saved;
    initApp();
  }

  // Search shortcut "/"
  document.addEventListener("keydown", e => {
    if (e.key === "/" && !["INPUT","TEXTAREA"].includes(document.activeElement.tagName)) {
      e.preventDefault();
      document.getElementById("searchInput").focus();
    }
    if (e.key === "Escape") closeAll();
  });

  // Login enter key
  document.getElementById("loginPass")?.addEventListener("keydown", e => e.key === "Enter" && doLogin());
  document.getElementById("loginUser")?.addEventListener("keydown", e => e.key === "Enter" && document.getElementById("loginPass").focus());
  document.getElementById("regToken")?.addEventListener("keydown", e => e.key === "Enter" && doRegister());
});

// ── Auth ──────────────────────────────────────────────────────────
function switchToRegister() {
  document.getElementById("loginCard").classList.add("hidden");
  document.getElementById("registerCard").classList.remove("hidden");
}
function switchToLogin() {
  document.getElementById("registerCard").classList.add("hidden");
  document.getElementById("loginCard").classList.remove("hidden");
}
function showForgot() { toast("Reset your password via the Settings page after login.", "ok"); }

async function doLogin() {
  const u = document.getElementById("loginUser").value.trim();
  const p = document.getElementById("loginPass").value;
  const errEl = document.getElementById("loginErr");
  errEl.classList.add("hidden");
  if (!u || !p) return;
  try {
    const data = await api("/api/login", { method: "POST", body: JSON.stringify({ username: u, password: p }) });
    if (!data) return;
    localStorage.setItem("ghm_token", data.access_token);
    localStorage.setItem("ghm_user", JSON.stringify(data));
    S.token = data.access_token;
    S.user  = data;
    initApp();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove("hidden");
  }
}

async function doRegister() {
  const u  = document.getElementById("regUser").value.trim();
  const p  = document.getElementById("regPass").value;
  const t  = document.getElementById("regToken").value.trim();
  const el = document.getElementById("regErr");
  el.classList.add("hidden");
  if (!u || !p || !t) { el.textContent = "All fields required"; el.classList.remove("hidden"); return; }
  try {
    const data = await api("/api/register", { method: "POST", body: JSON.stringify({ username: u, password: p, github_token: t }) });
    if (!data) return;
    localStorage.setItem("ghm_token", data.access_token);
    localStorage.setItem("ghm_user", JSON.stringify(data));
    S.token = data.access_token;
    S.user  = data;
    initApp();
  } catch (e) {
    el.textContent = e.message;
    el.classList.remove("hidden");
  }
}

function doLogout() {
  localStorage.removeItem("ghm_token");
  localStorage.removeItem("ghm_user");
  location.reload();
}

// ── App Init ──────────────────────────────────────────────────────
async function initApp() {
  document.getElementById("authWrap").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");

  const saved = localStorage.getItem("ghm_user");
  if (saved) S.user = JSON.parse(saved);

  // Load fresh user data
  try {
    const me = await api("/api/me");
    if (me) {
      S.user = { ...S.user, ...me };
      localStorage.setItem("ghm_user", JSON.stringify(S.user));
    }
  } catch {}

  updateTopbar();
  showTab("home");
  loadHomeData();
  loadNotifications();
}

function updateTopbar() {
  const u = S.user || {};
  const av = document.getElementById("topbarAvatar");
  const fav = document.getElementById("feedAvatar");
  if (u.gh_avatar) { av.src = u.gh_avatar; if (fav) fav.src = u.gh_avatar; }
  else { av.src = `https://github.com/${u.gh_login || "ghost"}.png`; }
  document.getElementById("ddUsername").textContent = u.username || "";
  document.getElementById("ddGhLogin").textContent = `@${u.gh_login || ""}`;
}

// ── Tab navigation ────────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  const el = document.getElementById(`tab-${name}`);
  if (el) el.classList.add("active");
  closeAll();
  if (name === "repos") loadRepos();
  if (name === "gists") loadGists();
  if (name === "starred") loadStarred();
  if (name === "notifications") loadNotifications();
  if (name === "profile") loadProfile();
}

function goHome() { showTab("home"); }
function showNew() {
  document.getElementById("newDropdown").classList.toggle("hidden");
  document.getElementById("overlay").classList.toggle("hidden");
}
function toggleUserMenu() {
  document.getElementById("userDropdown").classList.toggle("hidden");
  document.getElementById("overlay").classList.toggle("hidden");
}
function closeAll() {
  document.getElementById("newDropdown").classList.add("hidden");
  document.getElementById("userDropdown").classList.add("hidden");
  document.getElementById("overlay").classList.add("hidden");
}

// ── HOME ──────────────────────────────────────────────────────────
async function loadHomeData() {
  try {
    const data = await api("/api/github/repos?sort=updated&per_page=6");
    if (!data) return;
    S.repos = data;
    renderHomeRepos(data.slice(0, 6));
  } catch {}
}

function renderHomeRepos(repos) {
  const el = document.getElementById("homeRecentRepos");
  if (!repos.length) { el.innerHTML = `<div class="empty-small">No repositories yet. <a style="color:var(--c-blue);cursor:pointer" onclick="openModal('newRepoModal')">Create one</a></div>`; return; }
  el.innerHTML = `<div class="hs-title">Recent repositories</div>` +
    repos.map(r => `
      <div style="padding:10px 0;border-top:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between">
        <div>
          <span class="repo-item-name" onclick="openRepo('${r.owner.login}','${r.name}')">${r.name}</span>
          <div style="font-size:.72rem;color:var(--c-faint);margin-top:2px">${timeAgo(r.updated_at)}</div>
        </div>
        <span class="vis-badge">${r.private ? "Private" : "Public"}</span>
      </div>
    `).join("");
}

// ── REPOS ─────────────────────────────────────────────────────────
async function loadRepos() {
  const el = document.getElementById("reposList");
  el.innerHTML = `<div class="loading-rows"><div class="lr"></div><div class="lr"></div><div class="lr"></div></div>`;
  try {
    const data = await api("/api/github/repos?sort=updated&per_page=100");
    if (!data) return;
    S.repos = data;
    document.getElementById("reposTitle").textContent = `Repositories (${data.length})`;
    renderReposList();
  } catch (e) { el.innerHTML = `<div style="padding:24px;color:var(--c-red)">${e.message}</div>`; }
}

function renderReposList() {
  const el     = document.getElementById("reposList");
  const filter = document.getElementById("repoFilter")?.value.toLowerCase() || "";
  let repos    = S.repos;
  if (S.repoFilter === "public")  repos = repos.filter(r => !r.private);
  if (S.repoFilter === "private") repos = repos.filter(r => r.private);
  if (S.repoFilter === "forked")  repos = repos.filter(r => r.fork);
  if (filter) repos = repos.filter(r => r.name.toLowerCase().includes(filter) || (r.description || "").toLowerCase().includes(filter));
  if (!repos.length) { el.innerHTML = `<div style="padding:32px;text-align:center;color:var(--c-faint)">No repositories found</div>`; return; }
  el.innerHTML = repos.map(r => `
    <div class="repo-item">
      <div>
        <span class="repo-item-name" onclick="openRepo('${r.owner.login}','${r.name}')">${r.full_name}</span>
        <span class="vis-badge" style="margin-left:8px">${r.private ? "Private" : "Public"}</span>
        ${r.fork ? `<span class="vis-badge" style="margin-left:4px">Fork</span>` : ""}
        <div class="repo-item-desc">${r.description || ""}</div>
        <div class="repo-item-meta">
          ${r.language ? `<span class="repo-meta-tag"><span class="lang-dot ${langClass(r.language)}"></span>${r.language}</span>` : ""}
          <span class="repo-meta-tag">⭐ ${fmt(r.stargazers_count)}</span>
          <span class="repo-meta-tag">🍴 ${fmt(r.forks_count)}</span>
          <span class="repo-meta-tag">Updated ${timeAgo(r.updated_at)}</span>
        </div>
      </div>
      <div class="repo-item-actions">
        <button class="btn-outline" onclick="openRepo('${r.owner.login}','${r.name}')">View</button>
      </div>
    </div>
  `).join("");
}

function filterRepos()   { renderReposList(); }
function setPill(el, f) {
  document.querySelectorAll("#tab-repos .pill").forEach(p => p.classList.remove("active"));
  el.classList.add("active");
  S.repoFilter = f;
  renderReposList();
}

// ── SINGLE REPO ───────────────────────────────────────────────────
async function openRepo(owner, name, path = "", branch = null) {
  S.currentRepo = { owner, name, branch: branch || "main" };
  S.currentPath = path;
  S.repoTab = "code";
  showTab("repoView");
  document.getElementById("repoViewContent").innerHTML = `<div class="loading-rows" style="padding:32px"><div class="lr"></div><div class="lr"></div></div>`;
  try {
    const [repoData, branches] = await Promise.all([
      api(`/api/github/repos/${owner}/${name}`),
      api(`/api/github/repos/${owner}/${name}/branches`).catch(() => []),
    ]);
    if (!repoData) return;
    S.currentRepo.branch = branch || repoData.default_branch || "main";
    renderRepoView(repoData, branches || []);
    loadFileTree(owner, name, path, S.currentRepo.branch);
  } catch (e) { document.getElementById("repoViewContent").innerHTML = `<div style="padding:32px;color:var(--c-red)">${e.message}</div>`; }
}

function renderRepoView(repo, branches) {
  const { owner, name, branch } = S.currentRepo;
  const branchOpts = branches.map(b => `<option value="${b.name}" ${b.name === branch ? "selected" : ""}>${b.name}</option>`).join("");
  document.getElementById("repoViewContent").innerHTML = `
    <div class="repo-header">
      <div class="repo-breadcrumb">
        <span class="bc-owner" onclick="showTab('repos')">${owner}</span>
        <span class="bc-sep">/</span>
        <span class="bc-repo" onclick="openRepo('${owner}','${name}')">${name}</span>
        ${S.currentPath ? `<span class="bc-sep">/</span><span class="bc-path">${S.currentPath}</span>` : ""}
      </div>
      <div class="repo-meta-bar">
        <span class="vis-badge">${repo.private ? "🔒 Private" : "🔓 Public"}</span>
        <span class="repo-stat">⭐ <b>${fmt(repo.stargazers_count)}</b> stars</span>
        <span class="repo-stat">🍴 <b>${fmt(repo.forks_count)}</b> forks</span>
        <span class="repo-stat">👁 <b>${fmt(repo.watchers_count)}</b> watching</span>
        ${repo.language ? `<span class="repo-stat"><span class="lang-dot ${langClass(repo.language)}" style="width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:4px"></span>${repo.language}</span>` : ""}
      </div>
    </div>
    <div class="repo-tabs">
      <div class="rtab active" onclick="setRepoTab(this,'code','${owner}','${name}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
        Code
      </div>
      <div class="rtab" onclick="setRepoTab(this,'issues','${owner}','${name}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Issues
      </div>
      <div class="rtab" onclick="setRepoTab(this,'commits','${owner}','${name}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><line x1="3" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="21" y2="12"/></svg>
        Commits
      </div>
      <div class="rtab" onclick="setRepoTab(this,'branches','${owner}','${name}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
        Branches
      </div>
      <div class="rtab" onclick="deleteRepoConfirm('${owner}','${name}')" style="margin-left:auto;color:var(--c-red)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        Delete
      </div>
    </div>
    <div class="repo-body" id="repoTabBody">
      <div class="file-explorer" id="fileExplorer">
        <div class="fe-toolbar">
          <select class="branch-select" onchange="switchBranch(this.value,'${owner}','${name}')">
            ${branchOpts || `<option>${branch}</option>`}
          </select>
          <div class="path-breadcrumb" id="pathBreadcrumb">
            <span class="path-seg" onclick="openRepo('${owner}','${name}')">📁 ${name}</span>
          </div>
          <button class="btn-green" style="font-size:.75rem;padding:5px 10px" onclick="uploadFilePrompt('${owner}','${name}')">+ File</button>
          <button class="btn-outline" style="font-size:.75rem;padding:5px 10px" onclick="createBranchPrompt('${owner}','${name}')">+ Branch</button>
        </div>
        <div id="fileTableWrap"><div class="loading-rows" style="padding:12px"><div class="lr"></div><div class="lr"></div></div></div>
      </div>
    </div>
  `;
}

async function loadFileTree(owner, name, path, branch) {
  const wrap = document.getElementById("fileTableWrap");
  if (!wrap) return;
  wrap.innerHTML = `<div class="loading-rows" style="padding:12px"><div class="lr"></div><div class="lr"></div></div>`;
  try {
    const data = await api(`/api/github/repos/${owner}/${name}/contents?path=${encodeURIComponent(path)}&ref=${branch}`);
    if (!data) return;
    const items = Array.isArray(data) ? data : [data];
    const dirs  = items.filter(i => i.type === "dir").sort((a,b) => a.name.localeCompare(b.name));
    const files = items.filter(i => i.type === "file").sort((a,b) => a.name.localeCompare(b.name));
    const sorted = [...dirs, ...files];

    let rows = "";
    if (path) rows += `<tr onclick="navigateTo('${owner}','${name}',path_up('${path}'),'${branch}')">
      <td class="file-icon">📁</td><td class="file-name">..</td><td></td><td></td></tr>`;

    rows += sorted.map(item => `
      <tr onclick="handleFileClick('${owner}','${name}','${item.path}','${item.type}','${branch}')">
        <td class="file-icon">${item.type === "dir" ? "📁" : fileIcon(item.name)}</td>
        <td class="file-name">${item.name}</td>
        <td class="file-commit"></td>
        <td class="file-time"></td>
      </tr>
    `).join("");

    wrap.innerHTML = `<table class="file-table"><tbody>${rows}</tbody></table>`;

    // Update breadcrumb
    const bc = document.getElementById("pathBreadcrumb");
    if (bc) {
      const segs = path ? path.split("/") : [];
      let bhtml = `<span class="path-seg" onclick="openRepo('${owner}','${name}')">📁 ${name}</span>`;
      segs.forEach((seg, i) => {
        const p = segs.slice(0,i+1).join("/");
        bhtml += ` <span style="color:var(--c-faint)">/</span> <span class="path-seg" onclick="navigateTo('${owner}','${name}','${p}','${branch}')">${seg}</span>`;
      });
      bc.innerHTML = bhtml;
    }

    // Try to show README
    const readme = items.find(i => /readme/i.test(i.name));
    if (readme && !path) loadReadme(owner, name, readme.path, branch);
  } catch (e) {
    wrap.innerHTML = `<div style="padding:24px;color:var(--c-red)">${e.message}</div>`;
  }
}

function handleFileClick(owner, name, path, type, branch) {
  if (type === "dir") navigateTo(owner, name, path, branch);
  else viewFile(owner, name, path, branch);
}
function navigateTo(owner, name, path, branch) {
  S.currentPath = path;
  loadFileTree(owner, name, path, branch);
}
function path_up(p) { const parts = p.split("/"); parts.pop(); return parts.join("/"); }

function switchBranch(branch, owner, name) {
  S.currentRepo.branch = branch;
  loadFileTree(owner, name, "", branch);
}

async function viewFile(owner, name, path, branch) {
  const wrap = document.getElementById("fileTableWrap");
  if (!wrap) return;
  wrap.innerHTML = `<div class="loading-rows" style="padding:12px"><div class="lr"></div></div>`;
  try {
    const data = await api(`/api/github/repos/${owner}/${name}/contents?path=${encodeURIComponent(path)}&ref=${branch}`);
    if (!data) return;
    const content = data.content ? atob(data.content.replace(/\n/g, "")) : "(binary file)";
    wrap.innerHTML = `
      <div style="padding:12px;border-bottom:1px solid var(--c-border);display:flex;align-items:center;gap:8px;background:var(--c-surface2)">
        <span style="font-size:.85rem;color:var(--c-text);font-weight:500">${path.split("/").pop()}</span>
        <span style="font-size:.75rem;color:var(--c-faint);flex:1">${data.size} bytes</span>
        <button class="btn-outline" style="font-size:.75rem;padding:4px 10px" onclick="editFilePrompt('${owner}','${name}','${path}','${branch}','${data.sha}')">✏️ Edit</button>
        <button class="btn-red" style="font-size:.75rem;padding:4px 10px" onclick="deleteFileConfirm('${owner}','${name}','${path}','${branch}','${data.sha}')">🗑 Delete</button>
        <button class="btn-outline" style="font-size:.75rem;padding:4px 10px" onclick="navigateTo('${owner}','${name}',path_up('${path}'),'${branch}')">← Back</button>
      </div>
      <pre style="padding:16px;font-family:var(--font-mono);font-size:.78rem;line-height:1.7;overflow:auto;max-height:600px;color:var(--c-text);background:var(--c-canvas)">${escHtml(content)}</pre>
    `;
  } catch (e) { wrap.innerHTML = `<div style="padding:24px;color:var(--c-red)">${e.message}</div>`; }
}

async function loadReadme(owner, name, path, branch) {
  try {
    const data = await api(`/api/github/repos/${owner}/${name}/contents?path=${encodeURIComponent(path)}&ref=${branch}`);
    if (!data || !data.content) return;
    const content = atob(data.content.replace(/\n/g, ""));
    const existing = document.querySelector(".readme-section");
    if (!existing) {
      const fe = document.querySelector(".file-explorer");
      if (fe) fe.insertAdjacentHTML("afterend", `
        <div class="readme-section">
          <div class="readme-header">📖 README.md</div>
          <div class="readme-body">${escHtml(content)}</div>
        </div>`);
    }
  } catch {}
}

function setRepoTab(el, tab, owner, name) {
  document.querySelectorAll(".rtab").forEach(t => t.classList.remove("active"));
  el.classList.add("active");
  S.repoTab = tab;
  const body = document.getElementById("repoTabBody");
  if (!body) return;
  if (tab === "code") {
    body.innerHTML = `<div class="file-explorer" id="fileExplorer"><div class="fe-toolbar">
      <select class="branch-select" onchange="switchBranch(this.value,'${owner}','${name}')"><option>${S.currentRepo.branch}</option></select>
      <div class="path-breadcrumb" id="pathBreadcrumb"><span class="path-seg" onclick="openRepo('${owner}','${name}')">📁 ${name}</span></div>
      <button class="btn-green" style="font-size:.75rem;padding:5px 10px" onclick="uploadFilePrompt('${owner}','${name}')">+ File</button>
      <button class="btn-outline" style="font-size:.75rem;padding:5px 10px" onclick="createBranchPrompt('${owner}','${name}')">+ Branch</button>
      </div><div id="fileTableWrap"></div></div>`;
    loadFileTree(owner, name, S.currentPath, S.currentRepo.branch);
  } else if (tab === "commits") {
    body.innerHTML = `<div id="commitsBody"><div class="loading-rows"><div class="lr"></div><div class="lr"></div></div></div>`;
    loadCommits(owner, name);
  } else if (tab === "issues") {
    body.innerHTML = `<div id="issuesBody"><div class="loading-rows"><div class="lr"></div><div class="lr"></div></div></div>`;
    loadIssues(owner, name);
  } else if (tab === "branches") {
    body.innerHTML = `<div id="branchesBody"><div class="loading-rows"><div class="lr"></div></div></div>`;
    loadBranchesView(owner, name);
  }
}

async function loadCommits(owner, name) {
  try {
    const data = await api(`/api/github/repos/${owner}/${name}/commits?per_page=20`);
    if (!data) return;
    document.getElementById("commitsBody").innerHTML = `
      <div class="commit-list">
        ${data.map(c => `
          <div class="commit-item">
            <div>
              <div class="commit-msg">${escHtml(c.commit.message.split("\n")[0])}</div>
              <div class="commit-meta">
                <span>👤 ${c.commit.author.name}</span>
                <span>${timeAgo(c.commit.author.date)}</span>
              </div>
            </div>
            <div class="commit-sha">${c.sha.slice(0,7)}</div>
          </div>
        `).join("")}
      </div>`;
  } catch (e) { document.getElementById("commitsBody").innerHTML = `<div style="color:var(--c-red)">${e.message}</div>`; }
}

async function loadIssues(owner, name) {
  try {
    const data = await api(`/api/github/repos/${owner}/${name}/issues?state=open`);
    if (!data) return;
    const body = document.getElementById("issuesBody");
    body.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button class="btn-green" onclick="newIssuePrompt('${owner}','${name}')">+ New issue</button>
      </div>
      <div class="issue-list">
        ${data.length ? data.map(i => `
          <div class="issue-item">
            <div class="issue-open-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/></svg>
            </div>
            <div class="issue-body">
              <div class="issue-title">${escHtml(i.title)}</div>
              <div class="issue-meta">#${i.number} opened ${timeAgo(i.created_at)} by ${i.user.login}</div>
            </div>
            <div class="issue-actions">
              <button class="btn-red" style="font-size:.72rem;padding:4px 8px" onclick="closeIssue('${owner}','${name}',${i.number})">Close</button>
            </div>
          </div>
        `).join("") : `<div style="padding:32px;text-align:center;color:var(--c-faint)">No open issues 🎉</div>`}
      </div>`;
  } catch (e) { document.getElementById("issuesBody").innerHTML = `<div style="color:var(--c-red)">${e.message}</div>`; }
}

async function loadBranchesView(owner, name) {
  try {
    const data = await api(`/api/github/repos/${owner}/${name}/branches`);
    if (!data) return;
    document.getElementById("branchesBody").innerHTML = `
      <div style="margin-bottom:16px">
        <button class="btn-green" onclick="createBranchPrompt('${owner}','${name}')">+ New branch</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:0">
        ${data.map(b => `
          <div style="padding:12px 0;border-top:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:8px">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-green-t)" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
              <span style="font-size:.88rem;font-weight:500">${b.name}</span>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn-outline" style="font-size:.72rem;padding:4px 10px" onclick="switchBranch('${b.name}','${owner}','${name}');setRepoTab(document.querySelector('.rtab'),'code','${owner}','${name}')">View code</button>
              <button class="btn-red" style="font-size:.72rem;padding:4px 10px" onclick="deleteBranchConfirm('${owner}','${name}','${b.name}')">Delete</button>
            </div>
          </div>
        `).join("")}
      </div>`;
  } catch (e) { document.getElementById("branchesBody").innerHTML = `<div style="color:var(--c-red)">${e.message}</div>`; }
}

// ── File Actions ──────────────────────────────────────────────────
function uploadFilePrompt(owner, name) {
  const path    = prompt("File path (e.g. src/hello.py):");
  if (!path) return;
  const content = prompt("File content:");
  if (content === null) return;
  const message = prompt("Commit message:", "Add " + path.split("/").pop()) || "Add file";
  createFile(owner, name, path, content, message);
}

async function createFile(owner, name, path, content, message) {
  try {
    await api(`/api/github/repos/${owner}/${name}/contents/${encodeURIComponent(path)}`, {
      method: "PUT",
      body: JSON.stringify({ path, content, message, branch: S.currentRepo.branch }),
    });
    toast("✅ File created!");
    loadFileTree(owner, name, S.currentPath, S.currentRepo.branch);
  } catch (e) { toast(e.message, "err"); }
}

function editFilePrompt(owner, name, path, branch, sha) {
  viewFileForEdit(owner, name, path, branch, sha);
}

async function viewFileForEdit(owner, name, path, branch, sha) {
  const data = await api(`/api/github/repos/${owner}/${name}/contents?path=${encodeURIComponent(path)}&ref=${branch}`);
  if (!data) return;
  const content = data.content ? atob(data.content.replace(/\n/g, "")) : "";
  const newContent = prompt(`Edit file: ${path}\n(Select all, paste new content)`, content);
  if (newContent === null) return;
  const message = prompt("Commit message:", "Update " + path.split("/").pop()) || "Update file";
  try {
    await api(`/api/github/repos/${owner}/${name}/contents/${encodeURIComponent(path)}`, {
      method: "PUT",
      body: JSON.stringify({ path, content: newContent, message, sha: data.sha, branch }),
    });
    toast("✅ File updated!");
    viewFile(owner, name, path, branch);
  } catch (e) { toast(e.message, "err"); }
}

function deleteFileConfirm(owner, name, path, branch, sha) {
  if (!confirm(`Delete ${path}?\nThis cannot be undone.`)) return;
  const message = prompt("Commit message:", "Delete " + path.split("/").pop()) || "Delete file";
  deleteFile(owner, name, path, branch, sha, message);
}
async function deleteFile(owner, name, path, branch, sha, message) {
  try {
    await api(`/api/github/repos/${owner}/${name}/contents/${encodeURIComponent(path)}?sha=${sha}&message=${encodeURIComponent(message)}`, { method: "DELETE" });
    toast("✅ File deleted");
    navigateTo(owner, name, path_up(path), branch);
    loadFileTree(owner, name, path_up(path), branch);
  } catch (e) { toast(e.message, "err"); }
}

// ── Branch Actions ────────────────────────────────────────────────
function createBranchPrompt(owner, name) {
  const bname = prompt("New branch name:");
  if (!bname) return;
  const from  = prompt("From branch:", S.currentRepo.branch) || S.currentRepo.branch;
  createBranch(owner, name, bname, from);
}
async function createBranch(owner, name, bname, from) {
  try {
    await api(`/api/github/repos/${owner}/${name}/branches`, {
      method: "POST", body: JSON.stringify({ name: bname, from_branch: from }),
    });
    toast("✅ Branch created!");
    openRepo(owner, name, "", bname);
  } catch (e) { toast(e.message, "err"); }
}

function deleteBranchConfirm(owner, name, branch) {
  if (!confirm(`Delete branch '${branch}'?`)) return;
  api(`/api/github/repos/${owner}/${name}/branches/${branch}`, { method: "DELETE" })
    .then(() => { toast("Branch deleted"); loadBranchesView(owner, name); })
    .catch(e => toast(e.message, "err"));
}

// ── Issue Actions ─────────────────────────────────────────────────
function newIssuePrompt(owner, name) {
  const title = prompt("Issue title:");
  if (!title) return;
  const body = prompt("Description (optional):") || "";
  api(`/api/github/repos/${owner}/${name}/issues`, {
    method: "POST", body: JSON.stringify({ title, body }),
  }).then(() => { toast("✅ Issue created!"); loadIssues(owner, name); })
    .catch(e => toast(e.message, "err"));
}
function closeIssue(owner, name, number) {
  api(`/api/github/repos/${owner}/${name}/issues/${number}`, { method: "PATCH" })
    .then(() => { toast("Issue closed"); loadIssues(owner, name); })
    .catch(e => toast(e.message, "err"));
}

// ── Repo delete ───────────────────────────────────────────────────
function deleteRepoConfirm(owner, name) {
  if (!confirm(`⚠️ Permanently delete ${owner}/${name} from GitHub?\n\nThis CANNOT be undone!`)) return;
  const typed = prompt(`Type the repo name to confirm: ${name}`);
  if (typed !== name) return toast("Name didn't match — cancelled");
  api(`/api/github/repos/${owner}/${name}`, { method: "DELETE" })
    .then(() => { toast("✅ Repo deleted"); showTab("repos"); loadRepos(); })
    .catch(e => toast(e.message, "err"));
}

// ── Create Repo ───────────────────────────────────────────────────
async function createRepo() {
  const name = document.getElementById("newRepoName").value.trim().replace(/\s+/g, "-");
  const desc = document.getElementById("newRepoDesc").value.trim();
  const priv = document.querySelector('input[name="vis"]:checked').value === "private";
  const init = document.getElementById("newRepoInit").checked;
  if (!name) { toast("Enter a repo name", "err"); return; }
  try {
    const data = await api("/api/github/repos", {
      method: "POST",
      body: JSON.stringify({ name, description: desc, private: priv, auto_init: init }),
    });
    closeModal("newRepoModal");
    toast(`✅ Repo created: ${data.full_name}`);
    openRepo(data.owner.login, data.name);
  } catch (e) { toast(e.message, "err"); }
}

// ── GISTS ─────────────────────────────────────────────────────────
async function loadGists() {
  const el = document.getElementById("gistsList");
  el.innerHTML = `<div class="loading-rows"><div class="lr"></div><div class="lr"></div></div>`;
  try {
    const data = await api("/api/github/gists");
    if (!data) return;
    if (!data.length) { el.innerHTML = `<div style="padding:32px;text-align:center;color:var(--c-faint)">No gists yet. <button class="btn-green" style="margin-left:8px" onclick="openModal('newGistModal')">Create one</button></div>`; return; }
    el.innerHTML = data.map(g => {
      const files = Object.keys(g.files);
      return `
        <div class="gist-item">
          <div class="gist-item-name" onclick="viewGist('${g.id}')">${files[0] || g.id.slice(0,12)}</div>
          ${g.description ? `<div class="gist-item-desc">${escHtml(g.description)}</div>` : ""}
          <div class="gist-item-meta">
            <span>${g.public ? "🔓 Public" : "🔒 Secret"}</span>
            <span>${files.length} file${files.length !== 1 ? "s" : ""}</span>
            <span>${timeAgo(g.updated_at)}</span>
            <a href="${g.html_url}" target="_blank" style="color:var(--c-blue)">Open on GitHub ↗</a>
          </div>
          <div class="gist-item-actions">
            <button class="btn-red" style="font-size:.75rem;padding:4px 10px" onclick="deleteGistConfirm('${g.id}')">🗑 Delete</button>
          </div>
        </div>`;
    }).join("");
  } catch (e) { el.innerHTML = `<div style="color:var(--c-red);padding:24px">${e.message}</div>`; }
}

async function viewGist(id) {
  try {
    const g = await api(`/api/github/gists/${id}`);
    if (!g) return;
    const file = Object.values(g.files)[0];
    alert(`📎 ${file.filename}\n\n${file.content}`);
  } catch (e) { toast(e.message, "err"); }
}

async function createGist() {
  const filename = document.getElementById("gistFilename").value.trim();
  const content  = document.getElementById("gistContent").value;
  const desc     = document.getElementById("gistDesc").value.trim();
  const pub      = document.getElementById("gistPublic").checked;
  if (!filename) { toast("Enter a filename", "err"); return; }
  if (!content)  { toast("Enter content", "err"); return; }
  try {
    const data = await api("/api/github/gists", {
      method: "POST",
      body: JSON.stringify({ filename, content, description: desc, public: pub }),
    });
    closeModal("newGistModal");
    toast("✅ Gist created!");
    loadGists();
  } catch (e) { toast(e.message, "err"); }
}

function deleteGistConfirm(id) {
  if (!confirm("Delete this gist from GitHub?")) return;
  api(`/api/github/gists/${id}`, { method: "DELETE" })
    .then(() => { toast("Gist deleted"); loadGists(); })
    .catch(e => toast(e.message, "err"));
}

// ── STARRED ────────────────────────────────────────────────────────
async function loadStarred() {
  const el = document.getElementById("starredList");
  el.innerHTML = `<div class="loading-rows"><div class="lr"></div><div class="lr"></div></div>`;
  try {
    const data = await api("/api/github/starred");
    if (!data) return;
    el.innerHTML = data.map(r => `
      <div class="repo-item">
        <div>
          <span class="repo-item-name" onclick="window.open('${r.html_url}','_blank')">${r.full_name}</span>
          <span class="vis-badge" style="margin-left:8px">${r.private ? "Private" : "Public"}</span>
          <div class="repo-item-desc">${r.description || ""}</div>
          <div class="repo-item-meta">
            ${r.language ? `<span class="repo-meta-tag"><span class="lang-dot ${langClass(r.language)}"></span>${r.language}</span>` : ""}
            <span class="repo-meta-tag">⭐ ${fmt(r.stargazers_count)}</span>
          </div>
        </div>
        <div class="repo-item-actions">
          <button class="star-btn starred" onclick="unstar('${r.owner.login}','${r.name}',this)">⭐ Starred</button>
        </div>
      </div>
    `).join("") || `<div style="padding:32px;text-align:center;color:var(--c-faint)">No starred repos yet</div>`;
  } catch (e) { el.innerHTML = `<div style="color:var(--c-red);padding:24px">${e.message}</div>`; }
}

async function unstar(owner, name, btn) {
  try {
    await api(`/api/github/starred/${owner}/${name}`, { method: "DELETE" });
    btn.textContent = "⭐ Star";
    btn.classList.remove("starred");
    toast("Unstarred");
  } catch (e) { toast(e.message, "err"); }
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────
async function loadNotifications() {
  try {
    const data = await api("/api/github/notifications");
    if (!data) return;
    const badge = document.getElementById("notifBadge");
    const count = data.length;
    if (count > 0) { badge.textContent = count > 9 ? "9+" : count; badge.classList.remove("hidden"); }
    else badge.classList.add("hidden");

    const el = document.getElementById("notifList");
    if (!el) return;
    if (!data.length) { el.innerHTML = `<div style="padding:32px;text-align:center;color:var(--c-faint)">🎉 You're all caught up!</div>`; return; }
    el.innerHTML = data.map(n => `
      <div class="notif-item">
        <div class="notif-dot ${n.unread ? "" : "read"}"></div>
        <div class="notif-body">
          <div class="notif-repo">${n.repository.full_name}</div>
          <div class="notif-title">${escHtml(n.subject.title)}</div>
          <div class="notif-time">${n.subject.type} • ${timeAgo(n.updated_at)}</div>
        </div>
      </div>
    `).join("");
  } catch {}
}

// ── PROFILE ────────────────────────────────────────────────────────
async function loadProfile() {
  const el = document.getElementById("profileContent");
  el.innerHTML = `<div class="loading-rows" style="padding:32px"><div class="lr"></div></div>`;
  try {
    const [profile, repos] = await Promise.all([
      api("/api/github/profile"),
      api("/api/github/repos?sort=updated&per_page=6"),
    ]);
    if (!profile) return;
    el.innerHTML = `
      <div class="profile-wrap">
        <div class="profile-sidebar">
          <img class="profile-avatar-lg" src="${profile.avatar_url}" alt="${profile.login}">
          <div class="profile-name">${profile.name || profile.login}</div>
          <div class="profile-login">${profile.login}</div>
          ${profile.bio ? `<div class="profile-bio">${escHtml(profile.bio)}</div>` : ""}
          <button class="edit-profile-btn" onclick="openEditProfile()">Edit profile</button>
          <div class="profile-stats">
            <div class="profile-stat"><b>${fmt(profile.followers)}</b> followers</div>
            <div class="profile-stat"><b>${fmt(profile.following)}</b> following</div>
          </div>
          <div class="profile-meta">
            ${profile.company ? `<div class="profile-meta-item">🏢 ${escHtml(profile.company)}</div>` : ""}
            ${profile.location ? `<div class="profile-meta-item">📍 ${escHtml(profile.location)}</div>` : ""}
            ${profile.blog ? `<div class="profile-meta-item">🔗 <a href="${profile.blog}" target="_blank" style="color:var(--c-blue)">${profile.blog}</a></div>` : ""}
            ${profile.twitter_username ? `<div class="profile-meta-item">🐦 @${profile.twitter_username}</div>` : ""}
            <div class="profile-meta-item">📅 Joined ${new Date(profile.created_at).toLocaleDateString("en", {month:"long",year:"numeric"})}</div>
          </div>
        </div>
        <div class="profile-main">
          <div class="contrib-title">Popular repositories</div>
          <div class="repos-list">
            ${(repos || []).slice(0,6).map(r => `
              <div class="repo-item">
                <div>
                  <span class="repo-item-name" onclick="openRepo('${r.owner.login}','${r.name}')">${r.name}</span>
                  <span class="vis-badge" style="margin-left:8px">${r.private ? "Private" : "Public"}</span>
                  ${r.description ? `<div class="repo-item-desc">${escHtml(r.description)}</div>` : ""}
                  <div class="repo-item-meta">
                    ${r.language ? `<span class="repo-meta-tag"><span class="lang-dot ${langClass(r.language)}"></span>${r.language}</span>` : ""}
                    <span class="repo-meta-tag">⭐ ${fmt(r.stargazers_count)}</span>
                  </div>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `;
  } catch (e) { el.innerHTML = `<div style="padding:32px;color:var(--c-red)">${e.message}</div>`; }
}

function openEditProfile() {
  api("/api/github/profile").then(p => {
    if (!p) return;
    const name = prompt("Display name:", p.name || "");
    if (name === null) return;
    const bio  = prompt("Bio:", p.bio || "");
    if (bio === null) return;
    const loc  = prompt("Location:", p.location || "");
    const blog = prompt("Website:", p.blog || "");
    const tw   = prompt("Twitter username:", p.twitter_username || "");
    api("/api/github/profile", {
      method: "PATCH",
      body: JSON.stringify({ name: name || null, bio: bio || null, location: loc || null, blog: blog || null, twitter_username: tw || null }),
    }).then(() => { toast("✅ Profile updated!"); loadProfile(); })
      .catch(e => toast(e.message, "err"));
  });
}

// ── SEARCH ────────────────────────────────────────────────────────
function handleSearch(e) {
  if (e.key !== "Enter") return;
  const q = document.getElementById("searchInput").value.trim();
  if (!q) return;
  S.searchQ = q;
  showTab("search");
  document.getElementById("searchTitle").textContent = `Results for "${q}"`;
  runSearch(S.searchType);
}

function setSearchType(el, type) {
  document.querySelectorAll("#tab-search .pill").forEach(p => p.classList.remove("active"));
  el.classList.add("active");
  S.searchType = type;
  runSearch(type);
}

async function runSearch(type) {
  const el = document.getElementById("searchResults");
  if (!S.searchQ) return;
  el.innerHTML = `<div class="loading-rows"><div class="lr"></div><div class="lr"></div></div>`;
  try {
    if (type === "repos") {
      const data = await api(`/api/github/search/repos?q=${encodeURIComponent(S.searchQ)}&per_page=20`);
      if (!data) return;
      el.innerHTML = (data.items || []).map(r => `
        <div class="repo-item">
          <div>
            <span class="repo-item-name" onclick="openRepo('${r.owner.login}','${r.name}')">${r.full_name}</span>
            <span class="vis-badge" style="margin-left:8px">${r.private ? "Private" : "Public"}</span>
            <div class="repo-item-desc">${r.description || ""}</div>
            <div class="repo-item-meta">
              ${r.language ? `<span class="repo-meta-tag"><span class="lang-dot ${langClass(r.language)}"></span>${r.language}</span>` : ""}
              <span class="repo-meta-tag">⭐ ${fmt(r.stargazers_count)}</span>
            </div>
          </div>
        </div>
      `).join("") || `<div style="padding:32px;text-align:center;color:var(--c-faint)">No results for "${S.searchQ}"</div>`;
    } else {
      const data = await api(`/api/github/search/users?q=${encodeURIComponent(S.searchQ)}`);
      if (!data) return;
      el.innerHTML = (data.items || []).map(u => `
        <div style="padding:14px 0;border-top:1px solid var(--c-border);display:flex;align-items:center;gap:12px">
          <img src="${u.avatar_url}" style="width:40px;height:40px;border-radius:50%;border:1px solid var(--c-border)">
          <div>
            <div style="font-size:.9rem;font-weight:500;color:var(--c-blue)">${u.login}</div>
            <a href="${u.html_url}" target="_blank" style="font-size:.75rem;color:var(--c-faint)">${u.html_url}</a>
          </div>
        </div>
      `).join("") || `<div style="padding:32px;text-align:center;color:var(--c-faint)">No users found</div>`;
    }
  } catch (e) { el.innerHTML = `<div style="color:var(--c-red);padding:24px">${e.message}</div>`; }
}

async function exploreSearch() {
  const q = document.getElementById("exploreInput").value.trim();
  if (!q) return;
  const el = document.getElementById("exploreResults");
  el.innerHTML = `<div style="color:var(--c-faint);font-size:.78rem">Searching...</div>`;
  try {
    const data = await api(`/api/github/search/repos?q=${encodeURIComponent(q)}&sort=stars&per_page=5`);
    el.innerHTML = (data?.items || []).map(r => `
      <div class="er-item">
        <div class="er-name" onclick="openRepo('${r.owner.login}','${r.name}')">${r.full_name}</div>
        ${r.description ? `<div class="er-desc">${r.description.slice(0,80)}</div>` : ""}
        <div class="er-meta"><span>⭐ ${fmt(r.stargazers_count)}</span>${r.language ? `<span>${r.language}</span>` : ""}</div>
      </div>`).join("") || `<div style="color:var(--c-faint);font-size:.78rem">No results</div>`;
  } catch { el.innerHTML = `<div style="color:var(--c-red);font-size:.78rem">Search failed</div>`; }
}

// ── SETTINGS ──────────────────────────────────────────────────────
function setSettingsSection(el, section) {
  document.querySelectorAll(".s-pill").forEach(p => p.classList.remove("active"));
  el.classList.add("active");
  document.getElementById("settingsAccount").classList.toggle("hidden", section !== "account");
  document.getElementById("settingsSecurity").classList.toggle("hidden", section !== "security");
}

async function updateToken() {
  const t = document.getElementById("newGhToken").value.trim();
  if (!t) { toast("Enter a token", "err"); return; }
  try {
    await api("/api/me/token", { method: "PUT", body: JSON.stringify({ github_token: t }) });
    toast("✅ Token updated!");
    document.getElementById("newGhToken").value = "";
    initApp();
  } catch (e) { toast(e.message, "err"); }
}

async function changePassword() {
  const oldPw = document.getElementById("oldPw").value;
  const newPw = document.getElementById("newPw").value;
  if (!oldPw || !newPw) { toast("Fill both fields", "err"); return; }
  try {
    await api("/api/me/password", { method: "PUT", body: JSON.stringify({ old_password: oldPw, new_password: newPw }) });
    toast("✅ Password changed!");
    document.getElementById("oldPw").value = "";
    document.getElementById("newPw").value = "";
  } catch (e) { toast(e.message, "err"); }
}

// ── MODALS ────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.remove("hidden"); }
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }
document.addEventListener("click", e => {
  if (e.target.classList.contains("modal-wrap")) closeModal(e.target.id);
});

// ── HELPERS ───────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso);
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30)  return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}yr ago`;
}

function fmt(n) {
  if (n === undefined || n === null) return "0";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function escHtml(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function fileIcon(name) {
  const ext = name.split(".").pop().toLowerCase();
  const icons = { js:"📜", ts:"📜", py:"🐍", html:"🌐", css:"🎨", json:"📋", md:"📝", txt:"📄", sh:"⚡", go:"🔵", rs:"🦀", java:"☕", rb:"💎", php:"🐘", c:"⚙️", cpp:"⚙️", zip:"📦", png:"🖼", jpg:"🖼", gif:"🖼", svg:"🖼", pdf:"📕", yml:"⚙️", yaml:"⚙️", env:"🔐", lock:"🔒" };
  return icons[ext] || "📄";
}

function langClass(lang) {
  if (!lang) return "lang-default";
  const m = { "JavaScript":"lang-js","TypeScript":"lang-ts","Python":"lang-py","HTML":"lang-html","CSS":"lang-css","Java":"lang-java","C":"lang-c","C++":"lang-cpp","Go":"lang-go","Rust":"lang-rust","Ruby":"lang-rb","PHP":"lang-php","Shell":"lang-shell" };
  return m[lang] || "lang-default";
}
