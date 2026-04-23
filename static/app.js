/* ════════════════════════════════════════════════════════════════════
   GitHub Manager — app.js  (Full clean version)
   ALL bot features: Clone, Push, Pull, ZIP, FileManager, Grep,
   Replace, Rename, Branches, Merge, Collaborators, Gists,
   Profile, Stars, Search, Notifications, Logs
   ════════════════════════════════════════════════════════════════════ */

const S = {
  user: null, repos: [], myRepos: [], repoFilter: "all",
  searchType: "repos", searchQ: "", wsData: [],
  branchRepoUrl: "", collabRepoUrl: "",
  currentRepo: null, fmBrowsePath: ""
};

// ── Core API ─────────────────────────────────────────────────────────────────
const T = () => localStorage.getItem("ghm_t");

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(T() ? { Authorization: "Bearer " + T() } : {}) },
    ...opts,
  });
  if (res.status === 401) { doLogout(); return null; }
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);
  return data;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let _tT;
function toast(msg, type = "ok") {
  const el = document.getElementById("toast");
  el.textContent = msg; el.className = `toast ${type}`;
  clearTimeout(_tT); _tT = setTimeout(() => el.classList.add("hid"), 3200);
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const hid  = id => $( id)?.classList.add("hid");
const show = id => $(id)?.classList.remove("hid");
const html = (id, h) => { const e = $(id); if (e) e.innerHTML = h; };
const esc  = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ta   = iso => { if (!iso) return ""; const d = Date.now() - new Date(iso); const m = Math.floor(d / 60000); if (m < 1) return "just now"; if (m < 60) return m + "m ago"; const h = Math.floor(m / 60); if (h < 24) return h + "h ago"; const dy = Math.floor(h / 24); if (dy < 30) return dy + "d ago"; return Math.floor(dy / 30) + "mo ago"; };
const fmt  = n => { if (!n) return "0"; return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n); };
const lc   = l => ({ JavaScript: "js", TypeScript: "ts", Python: "py", HTML: "html", CSS: "css", Go: "go", Rust: "rs", Ruby: "rb" }[l] || "");
const fIcon = name => { const e = name.split(".").pop().toLowerCase(); return ({ js: "📜", ts: "📜", py: "🐍", html: "🌐", css: "🎨", json: "📋", md: "📝", txt: "📄", sh: "⚡", go: "🔵", rs: "🦀", java: "☕", rb: "💎", php: "🐘", c: "⚙️", cpp: "⚙️", zip: "📦", png: "🖼", jpg: "🖼", gif: "🖼", svg: "🖼", pdf: "📕", yml: "⚙️", yaml: "⚙️", env: "🔐" }[e] || "📄"); };
const pathUp = p => { const pts = p.split("/"); pts.pop(); return pts.join("/"); };

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  if (T()) initApp();
  document.addEventListener("keydown", e => {
    if (e.key === "/" && !["INPUT","TEXTAREA"].includes(document.activeElement.tagName)) { e.preventDefault(); $("sInput").focus(); }
    if (e.key === "Escape") closeAll();
  });
  $("lp")?.addEventListener("keydown", e => e.key === "Enter" && doLogin());
  $("lu")?.addEventListener("keydown", e => e.key === "Enter" && $("lp").focus());
  $("rt")?.addEventListener("keydown", e => e.key === "Enter" && doRegister());
});

// ── AUTH ──────────────────────────────────────────────────────────────────────
function sw(to) { $("loginCard").classList.toggle("hid", to === "reg"); $("regCard").classList.toggle("hid", to !== "reg"); }

async function doLogin() {
  const u = $("lu").value.trim(), p = $("lp").value;
  const el = $("lErr"); el.classList.add("hid");
  if (!u || !p) return;
  try {
    const d = await api("/api/login", { method: "POST", body: JSON.stringify({ username: u, password: p }) });
    if (!d) return;
    localStorage.setItem("ghm_t", d.access_token);
    localStorage.setItem("ghm_u", JSON.stringify(d));
    S.user = d; initApp();
  } catch (e) { el.textContent = e.message; show("lErr"); }
}

async function doRegister() {
  const u = $("ru").value.trim(), p = $("rp").value, t = $("rt").value.trim();
  const el = $("rErr"); el.classList.add("hid");
  if (!u || !p || !t) { el.textContent = "All fields required"; show("rErr"); return; }
  try {
    const d = await api("/api/register", { method: "POST", body: JSON.stringify({ username: u, password: p, github_token: t }) });
    if (!d) return;
    localStorage.setItem("ghm_t", d.access_token);
    localStorage.setItem("ghm_u", JSON.stringify(d));
    S.user = d; initApp();
  } catch (e) { el.textContent = e.message; show("rErr"); }
}

function doLogout() { localStorage.removeItem("ghm_t"); localStorage.removeItem("ghm_u"); location.reload(); }

// ── App Init ──────────────────────────────────────────────────────────────────
async function initApp() {
  hid("authWrap"); show("app");
  const sv = localStorage.getItem("ghm_u");
  if (sv) S.user = JSON.parse(sv);
  try { const me = await api("/api/me"); if (me) { S.user = { ...S.user, ...me }; localStorage.setItem("ghm_u", JSON.stringify(S.user)); } } catch {}
  updateTopbar();
  showTab("home");
  loadHomeData();
  loadNotifs();
  loadWorkspaceSilent();
}

function updateTopbar() {
  const u = S.user || {};
  const src = u.gh_avatar || `https://github.com/${u.gh_login || "ghost"}.png`;
  const av = $("tAvatar"); const fav = $("fAvatar");
  if (av) av.src = src; if (fav) fav.src = src;
  const ddu = $("ddUser"); const ddg = $("ddGh");
  if (ddu) ddu.textContent = u.username || "";
  if (ddg) ddg.textContent = `@${u.gh_login || ""}`;
}

// ── Navigation ────────────────────────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  const el = $(`tab-${name}`); if (el) el.classList.add("active");
  closeAll();
  const loaders = {
    repos: loadRepos, gists: loadGists, starred: loadStarred,
    notifications: loadNotifs, profile: loadProfile, logs: loadLogs,
    "my-repos": loadMyRepos, workspace: loadWorkspace,
    filemanager: () => { loadWorkspace(); setTimeout(loadFmBrowse, 300); },
    branches: loadBranchRepoSelect, collaborators: loadCollabRepoSelect,
  };
  if (loaders[name]) loaders[name]();
}

function goHome() { showTab("home"); }
function toggleNewMenu() { $("newMenu").classList.toggle("hid"); $("overlay").classList.toggle("hid"); }
function toggleUserMenu() { $("uDrop").classList.toggle("hid"); $("overlay").classList.toggle("hid"); }
function closeAll() { hid("newMenu"); hid("uDrop"); hid("overlay"); }
function openM(id) { $(id)?.classList.remove("hid"); }
function closeM(id) { $(id)?.classList.add("hid"); }
document.addEventListener("click", e => { if (e.target.classList.contains("mwrap")) closeM(e.target.id); });

// ── HOME ──────────────────────────────────────────────────────────────────────
async function loadHomeData() {
  try {
    const [repos, stats] = await Promise.all([
      api("/api/github/repos?sort=updated&per_page=6"),
      api("/api/stats"),
    ]);
    if (repos) { S.repos = repos; renderHomeRepos(repos.slice(0, 6)); }
    if (stats) {
      html("homeStats", `
        <div class="stat-c"><div class="stat-v">${stats.repos}</div><div class="stat-l">Repos</div></div>
        <div class="stat-c"><div class="stat-v">${stats.workspace_folders}</div><div class="stat-l">Workspace</div></div>
        <div class="stat-c"><div class="stat-v">${stats.total_actions}</div><div class="stat-l">Actions</div></div>
        <div class="stat-c"><div class="stat-v">${(stats.active || "—").split("/").slice(-1)[0] || "None"}</div><div class="stat-l">Active</div></div>
      `);
    }
  } catch {}
}

function renderHomeRepos(repos) {
  if (!repos.length) { html("homeRepos", `<div style="color:var(--fa);font-size:.82rem">No repos yet. <a style="color:var(--bl);cursor:pointer" onclick="openM('newRepoM')">Create one →</a></div>`); return; }
  html("homeRepos", repos.map(r => `
    <div style="padding:10px 0;border-top:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between">
      <div>
        <span class="ri-name" onclick="openRepo('${esc(r.owner.login)}','${esc(r.name)}')">${esc(r.name)}</span>
        <div style="font-size:.72rem;color:var(--fa);margin-top:2px">${ta(r.updated_at)}</div>
      </div>
      <span class="vbadge">${r.private ? "🔒" : "🔓"}</span>
    </div>`).join(""));
}

async function exploreSearch() {
  const q = $("expI").value.trim(); if (!q) return;
  html("expRes", `<div style="color:var(--fa);font-size:.78rem">Searching...</div>`);
  try {
    const d = await api(`/api/github/search/repos?q=${encodeURIComponent(q)}&sort=stars&per_page=5`);
    html("expRes", (d?.items || []).map(r => `
      <div class="exp-item">
        <div class="exp-name" onclick="openRepo('${esc(r.owner.login)}','${esc(r.name)}')">${esc(r.full_name)}</div>
        ${r.description ? `<div style="font-size:.75rem;color:var(--mu)">${esc(r.description.slice(0, 70))}</div>` : ""}
        <div class="exp-meta"><span>⭐ ${fmt(r.stargazers_count)}</span>${r.language ? `<span>${r.language}</span>` : ""}</div>
      </div>`).join("") || `<div style="color:var(--fa);font-size:.78rem">No results</div>`);
  } catch { html("expRes", `<div style="color:var(--red);font-size:.78rem">Search failed</div>`); }
}

// ── MY REPOS (saved bot-style list) ──────────────────────────────────────────
async function loadMyRepos() {
  html("myReposList", "<div class='sk'></div>");
  try {
    const d = await api("/api/my-repos"); if (!d) return;
    S.myRepos = d.repos; renderMyRepos(d);
  } catch (e) { html("myReposList", `<div style="color:var(--red);padding:20px">${e.message}</div>`); }
}

function renderMyRepos(d) {
  const { repos, active } = d;
  if (!repos.length) {
    html("myReposList", `<div style="padding:32px;text-align:center;color:var(--fa)">No repos saved. <button class="btn-gr" onclick="openM('addRepoM')">+ Add one</button></div>`);
    return;
  }
  html("myReposList", repos.map((r, i) => `
    <div class="mr-item">
      <div class="mr-info">
        <div class="mr-name" onclick="openRepo('${esc(r.url.replace("https://github.com/","").split("/")[0])}','${esc(r.url.split("/").pop())}')">${esc(r.name || r.url.split("/").pop())}</div>
        <div class="mr-url">${esc(r.url)}</div>
        <div style="margin-top:4px;display:flex;gap:6px">
          ${r.url === active ? `<span class="vbadge" style="border-color:rgba(88,166,255,.4);color:var(--bl)">⭐ Active</span>` : ""}
          <span class="vbadge">${r.is_private ? "🔒 Private" : "🔓 Public"}</span>
        </div>
      </div>
      <div class="mr-acts">
        ${r.url !== active ? `<button class="ibtn" onclick="activateMyRepo(${i})">Set Active</button>` : ""}
        <button class="ibtn" onclick="toggleVis(${i},'${esc(r.url)}',${r.is_private})">${r.is_private ? "Make Public" : "Make Private"}</button>
        <button class="btn-rd sm" onclick="delMyRepo(${i})">Remove</button>
      </div>
    </div>`).join(""));
}

async function addMyRepo() {
  const url = $("arUrl").value.trim(), name = $("arName").value.trim(), priv = $("arPriv").checked;
  if (!url) { toast("Enter a URL", "err"); return; }
  try {
    await api("/api/my-repos", { method: "POST", body: JSON.stringify({ url, name, is_private: priv }) });
    closeM("addRepoM"); toast("✅ Added!"); loadMyRepos(); loadWorkspaceSilent();
  } catch (e) { toast(e.message, "err"); }
}

async function activateMyRepo(idx) {
  try { await api(`/api/my-repos/${idx}/activate`, { method: "POST" }); toast("✅ Active repo set!"); loadMyRepos(); } catch (e) { toast(e.message, "err"); }
}

async function delMyRepo(idx) {
  if (!confirm("Remove from list?")) return;
  try { await api(`/api/my-repos/${idx}`, { method: "DELETE" }); toast("Removed"); loadMyRepos(); } catch (e) { toast(e.message, "err"); }
}

async function toggleVis(idx, url, currentPriv) {
  if (!confirm(`Make this repo ${currentPriv ? "public" : "private"}?`)) return;
  try {
    const d = await api(`/api/my-repos/${idx}/visibility`, { method: "PUT", body: JSON.stringify({ url, private: !currentPriv }) });
    toast(d.ok ? "✅ Visibility changed!" : "❌ " + d.message, d.ok ? "ok" : "err"); loadMyRepos();
  } catch (e) { toast(e.message, "err"); }
}

// ── GITHUB REPOS ──────────────────────────────────────────────────────────────
async function loadRepos() {
  html("reposList", "<div class='sk'></div><div class='sk'></div>");
  try {
    const d = await api("/api/github/repos?sort=updated&per_page=100"); if (!d) return;
    S.repos = d; $("reposTitle").textContent = `Repositories (${d.length})`; renderRepos();
  } catch (e) { html("reposList", `<div style="padding:24px;color:var(--red)">${e.message}</div>`); }
}

function renderRepos() {
  const f = $("rFilter")?.value.toLowerCase() || "";
  let repos = S.repos;
  if (S.repoFilter === "public")  repos = repos.filter(r => !r.private);
  if (S.repoFilter === "private") repos = repos.filter(r => r.private);
  if (S.repoFilter === "fork")    repos = repos.filter(r => r.fork);
  if (f) repos = repos.filter(r => r.name.toLowerCase().includes(f) || (r.description || "").toLowerCase().includes(f));
  if (!repos.length) { html("reposList", `<div style="padding:32px;text-align:center;color:var(--fa)">No repositories found</div>`); return; }
  html("reposList", repos.map(r => `
    <div class="ri">
      <div>
        <span class="ri-name" onclick="openRepo('${esc(r.owner.login)}','${esc(r.name)}')">${esc(r.full_name)}</span>
        <span class="vbadge" style="margin-left:8px">${r.private ? "Private" : "Public"}</span>
        ${r.fork ? `<span class="vbadge" style="margin-left:4px">Fork</span>` : ""}
        <div class="ri-desc">${esc(r.description || "")}</div>
        <div class="ri-meta">
          ${r.language ? `<span class="ri-m"><span class="ldot ${lc(r.language)}"></span>${r.language}</span>` : ""}
          <span class="ri-m">⭐ ${fmt(r.stargazers_count)}</span>
          <span class="ri-m">🍴 ${fmt(r.forks_count)}</span>
          <span class="ri-m">${ta(r.updated_at)}</span>
        </div>
      </div>
      <div class="ri-acts"><button class="ibtn" onclick="openRepo('${esc(r.owner.login)}','${esc(r.name)}')">View</button></div>
    </div>`).join(""));
}

function setPill(el, f) { document.querySelectorAll("#tab-repos .pill").forEach(p => p.classList.remove("active")); el.classList.add("active"); S.repoFilter = f; renderRepos(); }

// ── REPO VIEW ─────────────────────────────────────────────────────────────────
async function openRepo(owner, name) {
  S.currentRepo = { owner, name, branch: "main" };
  showTab("repoView");
  html("rvContent", `<div style="padding:32px"><div class="sk"></div><div class="sk"></div></div>`);
  try {
    const [repoData, branches] = await Promise.all([
      api(`/api/github/repos/${owner}/${name}`),
      api(`/api/github/repos/${owner}/${name}/branches`).catch(() => []),
    ]);
    if (!repoData) return;
    S.currentRepo.branch = repoData.default_branch || "main";
    renderRepoShell(owner, name, repoData, Array.isArray(branches) ? branches : []);
    loadContents(owner, name, "", S.currentRepo.branch);
  } catch (e) { html("rvContent", `<div style="padding:32px;color:var(--red)">${e.message}</div>`); }
}

function renderRepoShell(owner, name, repo, branches) {
  const branch = S.currentRepo.branch;
  const bOpts  = branches.map(b => `<option value="${esc(b.name)}" ${b.name === branch ? "selected" : ""}>${esc(b.name)}</option>`).join("") || `<option>${branch}</option>`;
  html("rvContent", `
    <div style="background:var(--bg);border-bottom:1px solid var(--bd);padding:14px 20px">
      <div style="display:flex;align-items:center;gap:6px;font-size:.95rem;margin-bottom:10px;flex-wrap:wrap">
        <span style="color:var(--bl);cursor:pointer" onclick="showTab('repos')">${esc(owner)}</span>
        <span style="color:var(--fa)">/</span>
        <b style="cursor:pointer" onclick="openRepo('${esc(owner)}','${esc(name)}')">${esc(name)}</b>
      </div>
      <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
        <span class="vbadge">${repo.private ? "🔒 Private" : "🔓 Public"}</span>
        <span style="font-size:.82rem;color:var(--mu)">⭐ ${fmt(repo.stargazers_count)} · 🍴 ${fmt(repo.forks_count)}</span>
        ${repo.language ? `<span style="font-size:.82rem;color:var(--mu)"><span class="ldot ${lc(repo.language)}" style="width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:4px"></span>${repo.language}</span>` : ""}
      </div>
    </div>
    <div style="display:flex;gap:0;border-bottom:1px solid var(--bd);padding:0 20px;background:var(--bg);overflow-x:auto" id="rvTabBar">
      <div class="rtab active" data-tab="code"     onclick="switchRvTab(this,'code','${esc(owner)}','${esc(name)}')">📁 Code</div>
      <div class="rtab"         data-tab="commits"  onclick="switchRvTab(this,'commits','${esc(owner)}','${esc(name)}')">🔀 Commits</div>
      <div class="rtab"         data-tab="issues"   onclick="switchRvTab(this,'issues','${esc(owner)}','${esc(name)}')">🐛 Issues</div>
      <div class="rtab"         data-tab="branches" onclick="switchRvTab(this,'branches','${esc(owner)}','${esc(name)}')">🌿 Branches</div>
      <div class="rtab"         data-tab="collabs"  onclick="switchRvTab(this,'collabs','${esc(owner)}','${esc(name)}')">👥 Collabs</div>
      <div class="rtab" style="color:var(--red);margin-left:auto" onclick="confirmDeleteRepo('${esc(owner)}','${esc(name)}')">🗑 Delete</div>
    </div>
    <div id="rvBody" style="max-width:1200px;margin:0 auto;padding:20px">
      <div id="codeSection">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
          <select class="sel" style="width:auto" id="rvBranchSel" onchange="onBranchChange('${esc(owner)}','${esc(name)}')">${bOpts}</select>
          <div id="rvPathBar" style="font-size:.82rem;color:var(--mu);flex:1"></div>
          <button class="btn-gr sm" onclick="promptNewFile('${esc(owner)}','${esc(name)}')">+ File</button>
        </div>
        <div id="rvFileBox" style="background:var(--s);border:1px solid var(--bd);border-radius:var(--r2);overflow:hidden"></div>
        <div id="rvReadme"></div>
      </div>
    </div>
  `);
}

function onBranchChange(owner, name) {
  const branch = $("rvBranchSel").value;
  S.currentRepo.branch = branch;
  loadContents(owner, name, "", branch);
}

async function loadContents(owner, name, path, branch) {
  S.currentRepo = { ...S.currentRepo, owner, name, branch };
  const box = $("rvFileBox"); if (!box) return;
  box.innerHTML = `<div class="sk" style="margin:12px"></div>`;
  try {
    const items = await api(`/api/github/contents/${owner}/${name}?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(branch)}`);
    if (!items) return;
    const list   = Array.isArray(items) ? items : [items];
    const dirs   = list.filter(i => i.type === "dir").sort((a, b) => a.name.localeCompare(b.name));
    const files  = list.filter(i => i.type === "file").sort((a, b) => a.name.localeCompare(b.name));
    const sorted = [...dirs, ...files];

    let rows = path ? `<div class="file-row" onclick="loadContents('${esc(owner)}','${esc(name)}','${esc(pathUp(path))}','${esc(branch)}')"><span>📁</span><span>..</span><span class="ftype">up</span></div>` : "";
    rows += sorted.map(it => `
      <div class="file-row" onclick="${it.type === "dir"
        ? `loadContents('${esc(owner)}','${esc(name)}','${esc(it.path)}','${esc(branch)}')`
        : `viewFile('${esc(owner)}','${esc(name)}','${esc(it.path)}','${esc(branch)}','${esc(it.sha)}')`}">
        <span>${it.type === "dir" ? "📁" : fIcon(it.name)}</span>
        <span style="color:${it.type === "dir" ? "var(--bl)" : "var(--t)"}">${esc(it.name)}</span>
        <span class="ftype">${it.type === "dir" ? "dir" : (it.size > 1024 ? (it.size / 1024).toFixed(1) + " KB" : it.size + " B")}</span>
      </div>`).join("");

    box.innerHTML = rows || `<div style="padding:20px;color:var(--fa);font-size:.82rem">Empty directory</div>`;

    // Path breadcrumb
    const pb = $("rvPathBar");
    if (pb) {
      let bh = `<span style="color:var(--bl);cursor:pointer" onclick="loadContents('${esc(owner)}','${esc(name)}','','${esc(branch)}')">${esc(name)}</span>`;
      path.split("/").filter(Boolean).forEach((seg, i, arr) => {
        const p2 = arr.slice(0, i + 1).join("/");
        bh += ` <span style="color:var(--fa)">/</span> <span style="color:var(--bl);cursor:pointer" onclick="loadContents('${esc(owner)}','${esc(name)}','${esc(p2)}','${esc(branch)}')">${esc(seg)}</span>`;
      });
      pb.innerHTML = bh;
    }

    // Auto-load README
    const readme = !path && list.find(i => /readme/i.test(i.name));
    if (readme) loadReadme(owner, name, readme.path, branch);
  } catch (e) { box.innerHTML = `<div style="padding:20px;color:var(--red)">${e.message}</div>`; }
}

async function viewFile(owner, name, path, branch, sha) {
  const box = $("rvFileBox"); if (!box) return;
  box.innerHTML = `<div class="sk" style="margin:12px"></div>`;
  try {
    const data = await api(`/api/github/contents/${owner}/${name}?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(branch)}`);
    if (!data) return;
    const content = data.content ? atob(data.content.replace(/\n/g, "")) : "(binary file)";
    box.innerHTML = `
      <div style="padding:10px 14px;border-bottom:1px solid var(--bd);background:var(--s2);display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span style="font-weight:500">${esc(path.split("/").pop())}</span>
        <span style="flex:1;color:var(--fa);font-size:.75rem">${(data.size / 1024).toFixed(1)} KB</span>
        <button class="btn-ol sm" onclick="editFile('${esc(owner)}','${esc(name)}','${esc(path)}','${esc(branch)}','${esc(data.sha)}')">✏️ Edit</button>
        <button class="btn-rd sm"  onclick="deleteFile('${esc(owner)}','${esc(name)}','${esc(path)}','${esc(branch)}','${esc(data.sha)}')">🗑 Delete</button>
        <button class="btn-ol sm" onclick="loadContents('${esc(owner)}','${esc(name)}','${esc(pathUp(path))}','${esc(branch)}')">← Back</button>
      </div>
      <pre style="padding:16px;font-family:var(--fm);font-size:.78rem;line-height:1.7;overflow:auto;max-height:500px;color:var(--t);background:var(--bg)">${esc(content)}</pre>`;
  } catch (e) { box.innerHTML = `<div style="padding:20px;color:var(--red)">${e.message}</div>`; }
}

async function loadReadme(owner, name, path, branch) {
  try {
    const data = await api(`/api/github/contents/${owner}/${name}?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(branch)}`);
    if (!data || !data.content) return;
    const content = atob(data.content.replace(/\n/g, ""));
    const el = $("rvReadme"); if (!el) return;
    el.innerHTML = `<div style="margin-top:16px;background:var(--s);border:1px solid var(--bd);border-radius:var(--r2);overflow:hidden"><div style="padding:10px 16px;background:var(--s2);border-bottom:1px solid var(--bd);font-weight:600;font-size:.85rem">📖 ${esc(path.split("/").pop())}</div><pre style="padding:16px;font-family:var(--fm);font-size:.78rem;line-height:1.7;overflow:auto;max-height:400px;color:var(--t)">${esc(content)}</pre></div>`;
  } catch {}
}

function promptNewFile(owner, name) {
  const path    = prompt("File path (e.g. src/hello.py):"); if (!path) return;
  const content = prompt("File content:"); if (content === null) return;
  const message = prompt("Commit message:", "Add " + path.split("/").pop()) || "Add file";
  saveGhFile(owner, name, path, content, message, S.currentRepo.branch, null);
}

function editFile(owner, name, path, branch, sha) {
  api(`/api/github/contents/${owner}/${name}?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(branch)}`).then(data => {
    if (!data) return;
    const content = data.content ? atob(data.content.replace(/\n/g, "")) : "";
    const newContent = prompt(`Edit: ${path}\n\nSelect all and paste new content:`, content);
    if (newContent === null) return;
    const message = prompt("Commit message:", "Update " + path.split("/").pop()) || "Update file";
    saveGhFile(owner, name, path, newContent, message, branch, data.sha);
  }).catch(e => toast(e.message, "err"));
}

async function saveGhFile(owner, name, path, content, message, branch, sha) {
  try {
    const d = await api(`/api/workspace/file-gh`, { method: sha ? "PUT" : "POST", body: JSON.stringify({ owner, name, path, content, message, branch, sha }) });
    toast(d?.ok ? "✅ File saved!" : "❌ " + (d?.message || "Failed"), d?.ok ? "ok" : "err");
    if (d?.ok) loadContents(owner, name, pathUp(path), branch);
  } catch (e) { toast(e.message, "err"); }
}

function deleteFile(owner, name, path, branch, sha) {
  if (!confirm(`Delete ${path}?`)) return;
  const message = prompt("Commit message:", "Delete " + path.split("/").pop()) || "Delete file";
  api(`/api/workspace/file-gh?owner=${owner}&name=${name}&path=${encodeURIComponent(path)}&sha=${sha}&message=${encodeURIComponent(message)}&branch=${branch}`, { method: "DELETE" })
    .then(() => { toast("✅ Deleted"); loadContents(owner, name, pathUp(path), branch); })
    .catch(e => toast(e.message, "err"));
}

// ── Repo view tab switching ───────────────────────────────────────────────────
function switchRvTab(el, tab, owner, name) {
  document.querySelectorAll(".rtab").forEach(t => t.classList.remove("active"));
  el.classList.add("active");
  const body = $("rvBody"); if (!body) return;

  if (tab === "code") {
    const branch = S.currentRepo.branch || "main";
    body.innerHTML = `<div id="codeSection"><div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap"><select class="sel" style="width:auto" id="rvBranchSel" onchange="onBranchChange('${esc(owner)}','${esc(name)}')"><option>${branch}</option></select><div id="rvPathBar" style="font-size:.82rem;color:var(--mu);flex:1"></div><button class="btn-gr sm" onclick="promptNewFile('${esc(owner)}','${esc(name)}')">+ File</button></div><div id="rvFileBox" style="background:var(--s);border:1px solid var(--bd);border-radius:var(--r2);overflow:hidden"></div><div id="rvReadme"></div></div>`;
    loadContents(owner, name, "", branch);
  } else if (tab === "commits") {
    body.innerHTML = `<div id="rvComm"><div class="sk"></div><div class="sk"></div></div>`;
    loadRvCommits(owner, name);
  } else if (tab === "issues") {
    body.innerHTML = `<div style="margin-bottom:14px"><button class="btn-gr" onclick="promptNewIssue('${esc(owner)}','${esc(name)}')">+ New Issue</button></div><div id="rvIssues"><div class="sk"></div></div>`;
    loadRvIssues(owner, name);
  } else if (tab === "branches") {
    body.innerHTML = `<div style="margin-bottom:14px"><button class="btn-gr" onclick="promptCreateBranch('${esc(owner)}','${esc(name)}')">+ New Branch</button></div><div id="rvBranches"><div class="sk"></div></div>`;
    loadRvBranches(owner, name);
  } else if (tab === "collabs") {
    body.innerHTML = `<div style="margin-bottom:14px"><button class="btn-gr" onclick="promptAddCollab('${esc(owner)}','${esc(name)}')">+ Add Collaborator</button></div><div id="rvCollabs"><div class="sk"></div></div>`;
    loadRvCollabs(owner, name);
  }
}

async function loadRvCommits(owner, name) {
  try {
    const data = await api(`/api/github/repos/${owner}/${name}/commits?per_page=20`);
    html("rvComm", Array.isArray(data) && data.length
      ? data.map(c => `
        <div style="display:grid;grid-template-columns:1fr auto;gap:8px;padding:12px 0;border-top:1px solid var(--bd)">
          <div>
            <div style="font-size:.88rem;font-weight:500">${esc(c.commit.message.split("\n")[0])}</div>
            <div style="font-size:.75rem;color:var(--mu);margin-top:3px">👤 ${esc(c.commit.author.name)} · ${ta(c.commit.author.date)}</div>
          </div>
          <div style="font-family:var(--fm);font-size:.75rem;color:var(--bl);background:var(--blb);border:1px solid rgba(88,166,255,.2);border-radius:var(--r);padding:4px 10px;align-self:flex-start;white-space:nowrap">${c.sha.slice(0, 7)}</div>
        </div>`).join("")
      : `<div style="padding:32px;text-align:center;color:var(--fa)">No commits found</div>`);
  } catch (e) { html("rvComm", `<div style="color:var(--red)">${e.message}</div>`); }
}

async function loadRvIssues(owner, name) {
  try {
    const data = await api(`/api/github/repos/${owner}/${name}/issues?state=open`);
    html("rvIssues", Array.isArray(data) && data.length
      ? data.map(i => `
        <div style="display:flex;gap:10px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--bd)">
          <div style="color:var(--grt);margin-top:3px;font-size:1rem">●</div>
          <div style="flex:1">
            <div style="font-size:.88rem;font-weight:500">${esc(i.title)}</div>
            <div style="font-size:.75rem;color:var(--fa);margin-top:2px">#${i.number} · opened ${ta(i.created_at)} by ${esc(i.user.login)}</div>
          </div>
          <button class="btn-rd sm" onclick="closeIssue('${esc(owner)}','${esc(name)}',${i.number})">Close</button>
        </div>`).join("")
      : `<div style="padding:32px;text-align:center;color:var(--fa)">🎉 No open issues!</div>`);
  } catch (e) { html("rvIssues", `<div style="color:var(--red)">${e.message}</div>`); }
}

function promptNewIssue(owner, name) {
  const t = prompt("Issue title:"); if (!t) return;
  const b = prompt("Description (optional):") || "";
  api(`/api/github/repos/${owner}/${name}/issues`, { method: "POST", body: JSON.stringify({ title: t, body: b }) })
    .then(() => { toast("✅ Issue created!"); loadRvIssues(owner, name); })
    .catch(e => toast(e.message, "err"));
}

function closeIssue(owner, name, num) {
  api(`/api/github/repos/${owner}/${name}/issues/${num}`, { method: "PATCH" })
    .then(() => { toast("Issue closed"); loadRvIssues(owner, name); })
    .catch(e => toast(e.message, "err"));
}

async function loadRvBranches(owner, name) {
  try {
    const data = await api(`/api/github/repos/${owner}/${name}/branches`);
    html("rvBranches", Array.isArray(data) && data.length
      ? data.map(b => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid var(--bd)">
          <span style="font-size:.88rem;font-weight:500">🌿 ${esc(b.name)}</span>
          <div style="display:flex;gap:6px">
            <button class="btn-ol sm" onclick="loadContents('${esc(owner)}','${esc(name)}','','${esc(b.name)}');switchRvTab(document.querySelector('.rtab'),'code','${esc(owner)}','${esc(name)}')">View</button>
            <button class="btn-rd sm" onclick="deleteBranchRv('${esc(owner)}','${esc(name)}','${esc(b.name)}')">Delete</button>
          </div>
        </div>`).join("")
      : `<div style="padding:24px;text-align:center;color:var(--fa)">No branches</div>`);
  } catch (e) { html("rvBranches", `<div style="color:var(--red)">${e.message}</div>`); }
}

function promptCreateBranch(owner, name) {
  const n = prompt("New branch name:"); if (!n) return;
  const f = prompt("From branch:", S.currentRepo.branch || "main") || "main";
  api("/api/github/branches", { method: "POST", body: JSON.stringify({ repo_url: `https://github.com/${owner}/${name}`, name: n, from_branch: f }) })
    .then(d => { toast(d.ok ? "✅ Branch created!" : "❌ " + d.message, d.ok ? "ok" : "err"); loadRvBranches(owner, name); })
    .catch(e => toast(e.message, "err"));
}

function deleteBranchRv(owner, name, branch) {
  if (!confirm(`Delete branch '${branch}'?`)) return;
  api(`/api/github/branches?repo_url=${encodeURIComponent("https://github.com/"+owner+"/"+name)}&branch=${branch}`, { method: "DELETE" })
    .then(d => { toast(d.ok ? "✅ Deleted" : "❌ " + d.message, d.ok ? "ok" : "err"); loadRvBranches(owner, name); })
    .catch(e => toast(e.message, "err"));
}

async function loadRvCollabs(owner, name) {
  try {
    const d = await api(`/api/github/collaborators?repo_url=${encodeURIComponent("https://github.com/"+owner+"/"+name)}`);
    html("rvCollabs", (d?.collaborators || []).length
      ? d.collaborators.map(c => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid var(--bd)">
          <div style="display:flex;align-items:center;gap:8px">
            <img src="${c.avatar_url}" style="width:28px;height:28px;border-radius:50%;border:1px solid var(--bd)">
            <span style="font-size:.85rem">${esc(c.login)}</span>
          </div>
          <button class="btn-rd sm" onclick="removeCollabRv('${esc(owner)}','${esc(name)}','${esc(c.login)}')">Remove</button>
        </div>`).join("")
      : `<div style="padding:24px;text-align:center;color:var(--fa)">No collaborators</div>`);
  } catch (e) { html("rvCollabs", `<div style="color:var(--red)">${e.message}</div>`); }
}

function promptAddCollab(owner, name) {
  const u = prompt("GitHub username to add:"); if (!u) return;
  api("/api/github/collaborators", { method: "POST", body: JSON.stringify({ repo_url: `https://github.com/${owner}/${name}`, username: u }) })
    .then(d => { toast(d.ok ? "✅ Invitation sent!" : "❌ " + d.message, d.ok ? "ok" : "err"); loadRvCollabs(owner, name); })
    .catch(e => toast(e.message, "err"));
}

function removeCollabRv(owner, name, user) {
  if (!confirm(`Remove ${user}?`)) return;
  api(`/api/github/collaborators?repo_url=${encodeURIComponent("https://github.com/"+owner+"/"+name)}&username=${user}`, { method: "DELETE" })
    .then(d => { toast(d.ok ? "✅ Removed" : "❌ " + d.message, d.ok ? "ok" : "err"); loadRvCollabs(owner, name); })
    .catch(e => toast(e.message, "err"));
}

function confirmDeleteRepo(owner, name) {
  if (!confirm(`⚠️ Permanently delete ${owner}/${name} from GitHub?\n\nThis CANNOT be undone!`)) return;
  if (prompt(`Type "${name}" to confirm:`) !== name) { toast("Cancelled"); return; }
  api(`/api/github/repos?url=${encodeURIComponent("https://github.com/"+owner+"/"+name)}`, { method: "DELETE" })
    .then(d => { toast(d.ok ? "✅ Repo deleted" : "❌ " + d.message, d.ok ? "ok" : "err"); if (d.ok) showTab("repos"); })
    .catch(e => toast(e.message, "err"));
}

// ── CREATE REPO ───────────────────────────────────────────────────────────────
async function createRepo() {
  const name = $("nrName").value.trim().replace(/\s+/g, "-");
  const desc = $("nrDesc").value.trim();
  const priv = document.querySelector('input[name="nrVis"]:checked').value === "private";
  const init = $("nrInit").checked;
  if (!name) { toast("Enter a repo name", "err"); return; }
  try {
    const d = await api("/api/github/repos", { method: "POST", body: JSON.stringify({ name, description: desc, private: priv, auto_init: init }) });
    closeM("newRepoM"); toast(`✅ Repo created!`);
    if (d.url) { const parts = d.url.replace("https://github.com/", "").split("/"); openRepo(parts[0], parts[1]); }
  } catch (e) { toast(e.message, "err"); }
}

// ── WORKSPACE ─────────────────────────────────────────────────────────────────
async function loadWorkspaceSilent() {
  try {
    const d = await api("/api/workspace"); if (!d) return;
    S.wsData = d.folders; populateFolderSelects(d.folders);
  } catch {}
}

async function loadWorkspace() {
  html("wsFolders", "<div class='sk'></div>");
  try {
    const d = await api("/api/workspace"); if (!d) return;
    S.wsData = d.folders; populateFolderSelects(d.folders);
    if (!d.folders.length) {
      html("wsFolders", `<div style="color:var(--fa);font-size:.82rem;padding:16px;text-align:center">Workspace empty — clone a repo first!</div>`);
      return;
    }
    html("wsFolders", `<div class="ws-folders-list">${d.folders.map(f => `
      <div class="wf-item">
        <div><div class="wf-name">📁 ${esc(f.name)}</div><div class="wf-meta">${f.size_kb} KB · ${f.is_git ? "git repo" : "folder"}</div></div>
        <div class="wf-acts">
          <button class="ibtn" onclick="viewFolderTree('${esc(f.name)}')">View</button>
          <button class="btn-rd sm" onclick="deleteWsFolder('${esc(f.name)}')">Delete</button>
        </div>
      </div>`).join("")}</div>`);
  } catch (e) { html("wsFolders", `<div style="color:var(--red);padding:16px">${e.message}</div>`); }
}

function populateFolderSelects(folders) {
  const ids = ["pushFolder","pullFolder","zipFolder","fmBrowseFolder","fmWFolder","fmMFolder","fmEFolder","fmDFolder","fmGrepFolder","fmReplFolder","rndOld","rnpFolder","brFolder"];
  const opts = folders.map(f => `<option value="${esc(f.name)}">${esc(f.name)}</option>`).join("") || `<option value="">No folders</option>`;
  ids.forEach(id => { const el = $(id); if (el) el.innerHTML = opts; });
}

async function viewFolderTree(name) {
  try { const d = await api(`/api/workspace/${name}/tree`); alert(`📁 ${name}:\n\n${d.tree || "(empty)"}`); }
  catch (e) { toast(e.message, "err"); }
}

async function deleteWsFolder(name) {
  if (!confirm(`Delete workspace folder '${name}'?\nThis cannot be undone.`)) return;
  try { await api(`/api/workspace/${name}`, { method: "DELETE" }); toast("✅ Deleted"); loadWorkspace(); }
  catch (e) { toast(e.message, "err"); }
}

// Workspace actions
async function doClone() {
  const url = $("cloneUrl").value.trim(), useToken = $("cloneToken").checked;
  if (!url) { toast("Enter URL", "err"); return; }
  const res = $("cloneRes"); res.className = "res-box"; show("cloneRes"); res.textContent = "⏳ Cloning...";
  try {
    const d = await api("/api/workspace/clone", { method: "POST", body: JSON.stringify({ url, use_token: useToken }) });
    res.textContent = d.message; res.className = "res-box " + (d.ok ? "ok" : "err");
    if (d.ok) loadWorkspace();
  } catch (e) { res.textContent = e.message; res.className = "res-box err"; }
}

async function doPush() {
  const folder = $("pushFolder").value, url = $("pushUrl").value.trim(), branch = $("pushBranch").value.trim() || "main";
  if (!folder || !url) { toast("Fill all fields", "err"); return; }
  const res = $("pushRes"); res.className = "res-box"; show("pushRes"); res.textContent = "⏳ Pushing...";
  try {
    const d = await api("/api/workspace/push", { method: "POST", body: JSON.stringify({ folder, repo_url: url, branch }) });
    res.textContent = d.message; res.className = "res-box " + (d.ok ? "ok" : "err");
  } catch (e) { res.textContent = e.message; res.className = "res-box err"; }
}

async function doPull() {
  const folder = $("pullFolder").value, url = $("pullUrl").value.trim();
  if (!folder) { toast("Select a folder", "err"); return; }
  const res = $("pullRes"); res.className = "res-box"; show("pullRes"); res.textContent = "⏳ Pulling...";
  try {
    const d = await api("/api/workspace/pull", { method: "POST", body: JSON.stringify({ folder, repo_url: url }) });
    res.textContent = d.message; res.className = "res-box " + (d.ok ? "ok" : "err");
  } catch (e) { res.textContent = e.message; res.className = "res-box err"; }
}

async function doUploadZip() {
  const file = $("zipFile").files[0], url = $("zipRepoUrl").value.trim(), branch = $("zipBranch").value.trim() || "main";
  if (!file || !url) { toast("Select file and enter URL", "err"); return; }
  const res = $("zipRes"); res.className = "res-box"; show("zipRes"); res.textContent = "⏳ Uploading & pushing...";
  const fd = new FormData(); fd.append("file", file); fd.append("repo_url", url); fd.append("branch", branch);
  try {
    const r = await fetch("/api/workspace/upload-zip", { method: "POST", headers: { Authorization: "Bearer " + T() }, body: fd });
    const d = await r.json(); res.textContent = d.message; res.className = "res-box " + (d.ok ? "ok" : "err");
  } catch (e) { res.textContent = e.message; res.className = "res-box err"; }
}

async function doMakeZip() {
  const folder = $("zipFolder").value; if (!folder) { toast("Select a folder", "err"); return; }
  toast("⏳ Creating ZIP...");
  try {
    const r = await fetch("/api/workspace/make-zip", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + T() }, body: JSON.stringify({ folder }) });
    if (!r.ok) { const e = await r.json(); toast(e.detail || "Failed", "err"); return; }
    const blob = await r.blob(); const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = folder + ".zip"; a.click();
    toast("✅ Download started!");
  } catch (e) { toast(e.message, "err"); }
}

// ── FILE MANAGER ──────────────────────────────────────────────────────────────
async function loadFmBrowse() {
  const folder = $("fmBrowseFolder")?.value; if (!folder) return;
  const path = S.fmBrowsePath || "";
  try {
    const d = await api(`/api/workspace/${folder}/files?path=${encodeURIComponent(path)}`); if (!d) return;
    html("fmBrowseList", d.items.map(it => `
      <div class="file-row" onclick="${it.type === "dir"
        ? `browseFm('${esc(folder)}','${esc((path ? path + "/" : "") + it.name)}')`
        : `viewFmFile('${esc(folder)}','${esc((path ? path + "/" : "") + it.name)}')`}">
        <span>${it.type === "dir" ? "📁" : fIcon(it.name)}</span>
        <span>${esc(it.name)}</span>
        <span class="ftype">${it.type === "dir" ? "dir" : (it.size / 1024).toFixed(1) + " KB"}</span>
      </div>`).join("") || `<div style="padding:16px;color:var(--fa);font-size:.82rem">Empty</div>`);
    const pb = $("fmBrowsePath"); if (pb) pb.textContent = folder + (path ? "/" + path : "");
  } catch (e) { html("fmBrowseList", `<div style="color:var(--red);padding:12px">${e.message}</div>`); }
}

function browseFm(folder, path) { S.fmBrowsePath = path; $("fmBrowseFolder").value = folder; loadFmBrowse(); }

async function viewFmFile(folder, path) {
  try { const d = await api(`/api/workspace/${folder}/read?path=${encodeURIComponent(path)}`); alert(`📄 ${path}\n\n${d.content}`); }
  catch (e) { toast(e.message, "err"); }
}

async function doWriteFile() {
  const folder = $("fmWFolder").value, path = $("fmWPath").value.trim(), content = $("fmWContent").value;
  if (!folder || !path) { toast("Fill folder and path", "err"); return; }
  const res = $("fmWRes"); res.className = "res-box"; show("fmWRes");
  try { const d = await api("/api/fm/write-file", { method: "POST", body: JSON.stringify({ folder, path, content }) }); res.textContent = d.message; res.className = "res-box " + (d.ok ? "ok" : "err"); }
  catch (e) { res.textContent = e.message; res.className = "res-box err"; }
}

function addMultiRow() {
  $("multiFilesList").insertAdjacentHTML("beforeend", `<div class="multi-file"><input type="text" placeholder="path/file.py" class="mf-path"><textarea rows="3" placeholder="content..." class="mf-content code-ta"></textarea></div>`);
}

async function doMultiWrite() {
  const folder = $("fmMFolder").value; if (!folder) { toast("Select folder", "err"); return; }
  const files = {};
  document.querySelectorAll(".multi-file").forEach(row => {
    const p = row.querySelector(".mf-path").value.trim(), c = row.querySelector(".mf-content").value;
    if (p) files[p] = c;
  });
  if (!Object.keys(files).length) { toast("Add at least one file", "err"); return; }
  const res = $("fmMRes"); res.className = "res-box"; show("fmMRes");
  try { const d = await api("/api/fm/multi-write", { method: "POST", body: JSON.stringify({ folder, files }) }); res.textContent = d.results.map(r => (r.ok ? "✅" : "❌") + " " + r.path).join("\n"); res.className = "res-box ok"; }
  catch (e) { res.textContent = e.message; res.className = "res-box err"; }
}

async function doEditLine() {
  const folder = $("fmEFolder").value, path = $("fmEPath").value.trim(), line = parseInt($("fmELine").value), content = $("fmEContent").value;
  if (!folder || !path || !line) { toast("Fill all fields", "err"); return; }
  const res = $("fmERes"); res.className = "res-box"; show("fmERes");
  try { const d = await api("/api/fm/edit-line", { method: "POST", body: JSON.stringify({ folder, path, line_num: line, new_line: content }) }); res.textContent = d.message; res.className = "res-box " + (d.ok ? "ok" : "err"); }
  catch (e) { res.textContent = e.message; res.className = "res-box err"; }
}

async function doDeletePaths() {
  const folder = $("fmDFolder").value, raw = $("fmDPaths").value.trim();
  if (!folder || !raw) { toast("Fill all fields", "err"); return; }
  const paths = raw.split("\n").map(s => s.trim()).filter(Boolean);
  if (!confirm(`Delete ${paths.length} path(s)?`)) return;
  const res = $("fmDRes"); res.className = "res-box"; show("fmDRes");
  try { const d = await api("/api/fm/delete-paths", { method: "POST", body: JSON.stringify({ folder, paths }) }); res.textContent = d.results.map(r => (r.ok ? "✅" : "❌") + " " + r.path).join("\n"); res.className = "res-box ok"; }
  catch (e) { res.textContent = e.message; res.className = "res-box err"; }
}

async function doGrep() {
  const folder = $("fmGrepFolder").value, text = $("grepText").value.trim(), py = $("grepPy").checked;
  if (!folder || !text) { toast("Fill all fields", "err"); return; }
  const res = $("grepRes"); res.className = "res-box"; show("grepRes"); res.textContent = "🔍 Searching...";
  try { const d = await api("/api/fm/grep", { method: "POST", body: JSON.stringify({ folder, search: text, only_py: py }) }); res.textContent = d.result || "No matches found"; res.className = "res-box ok"; }
  catch (e) { res.textContent = e.message; res.className = "res-box err"; }
}

async function doReplace() {
  const folder = $("fmReplFolder").value, old = $("replOld").value, nw = $("replNew").value, py = $("replPy").checked;
  if (!folder || !old) { toast("Fill all fields", "err"); return; }
  if (!confirm(`Replace all "${old}" → "${nw}"?`)) return;
  const res = $("replRes"); res.className = "res-box"; show("replRes");
  try { const d = await api("/api/fm/replace", { method: "POST", body: JSON.stringify({ folder, old_text: old, new_text: nw, only_py: py }) }); res.textContent = d.result; res.className = "res-box " + (d.ok ? "ok" : "err"); }
  catch (e) { res.textContent = e.message; res.className = "res-box err"; }
}

async function doRenameDir() {
  const old = $("rndOld").value, nw = $("rndNew").value.trim();
  if (!old || !nw) { toast("Fill all fields", "err"); return; }
  const res = $("rndRes"); res.className = "res-box"; show("rndRes");
  try { const d = await api("/api/fm/rename-dir", { method: "POST", body: JSON.stringify({ old_name: old, new_name: nw }) }); res.textContent = d.message; res.className = "res-box " + (d.ok ? "ok" : "err"); if (d.ok) loadWorkspace(); }
  catch (e) { res.textContent = e.message; res.className = "res-box err"; }
}

async function doRenamePath() {
  const folder = $("rnpFolder").value, old = $("rnpOld").value.trim(), nw = $("rnpNew").value.trim();
  if (!folder || !old || !nw) { toast("Fill all fields", "err"); return; }
  const res = $("rnpRes"); res.className = "res-box"; show("rnpRes");
  try { const d = await api("/api/fm/rename-path", { method: "POST", body: JSON.stringify({ folder, old_path: old, new_path: nw }) }); res.textContent = d.message; res.className = "res-box " + (d.ok ? "ok" : "err"); }
  catch (e) { res.textContent = e.message; res.className = "res-box err"; }
}

async function doBulkRename() {
  const folder = $("brFolder").value, pat = $("brPattern").value.trim(), pre = $("brPrefix").value, suf = $("brSuffix").value, from = $("brFrom").value, to2 = $("brTo").value;
  if (!folder || !pat) { toast("Fill folder and pattern", "err"); return; }
  const res = $("brRes"); res.className = "res-box"; show("brRes");
  try { const d = await api("/api/fm/bulk-rename", { method: "POST", body: JSON.stringify({ folder, pattern: pat, prefix: pre, suffix: suf, replace_from: from, replace_to: to2 }) }); res.textContent = d.result; res.className = "res-box " + (d.ok ? "ok" : "err"); }
  catch (e) { res.textContent = e.message; res.className = "res-box err"; }
}

// ── BRANCHES TAB ──────────────────────────────────────────────────────────────
async function loadBranchRepoSelect() {
  const d = await api("/api/my-repos").catch(() => null);
  const repos = d?.repos || [];
  const sel = $("branchRepo"); if (!sel) return;
  sel.innerHTML = repos.map(r => `<option value="${esc(r.url)}">${esc(r.name || r.url.split("/").pop())}</option>`).join("") || `<option value="">No repos — add to My Repos first</option>`;
  if (repos.length) { S.branchRepoUrl = repos[0].url; loadBranches(); }
}

async function loadBranches() {
  const url = $("branchRepo")?.value; if (!url) return;
  S.branchRepoUrl = url;
  html("branchesList", "<div class='sk'></div>");
  try {
    const d = await api(`/api/github/branches?repo_url=${encodeURIComponent(url)}`);
    html("branchesList", (d?.branches || []).map(b => `
      <div class="branch-item">
        <span style="font-size:.88rem;font-weight:500">🌿 ${esc(b.name)}</span>
        <button class="btn-rd sm" onclick="deleteBranch('${esc(b.name)}')">Delete</button>
      </div>`).join("") || `<div style="padding:16px;color:var(--fa)">No branches</div>`);
  } catch (e) { html("branchesList", `<div style="color:var(--red)">${e.message}</div>`); }
}

async function doCreateBranch() {
  const url = S.branchRepoUrl, name = $("newBrName").value.trim(), from = $("newBrFrom").value.trim() || "main";
  if (!url || !name) { toast("Fill all fields", "err"); return; }
  const res = $("brCreateRes"); res.className = "res-box"; show("brCreateRes");
  try { const d = await api("/api/github/branches", { method: "POST", body: JSON.stringify({ repo_url: url, name, from_branch: from }) }); res.textContent = d.message; res.className = "res-box " + (d.ok ? "ok" : "err"); if (d.ok) loadBranches(); }
  catch (e) { res.textContent = e.message; res.className = "res-box err"; }
}

async function deleteBranch(name) {
  if (!confirm(`Delete branch '${name}'?`)) return;
  try { const d = await api(`/api/github/branches?repo_url=${encodeURIComponent(S.branchRepoUrl)}&branch=${name}`, { method: "DELETE" }); toast(d.ok ? "✅ Deleted" : "❌ " + d.message, d.ok ? "ok" : "err"); loadBranches(); }
  catch (e) { toast(e.message, "err"); }
}

async function doMerge() {
  const url = S.branchRepoUrl, head = $("mergeHead").value.trim(), base = $("mergeBase").value.trim(), msg = $("mergeMsg").value.trim();
  if (!url || !head || !base) { toast("Fill all fields", "err"); return; }
  const res = $("mergeRes"); res.className = "res-box"; show("mergeRes");
  try { const d = await api("/api/github/branches/merge", { method: "POST", body: JSON.stringify({ repo_url: url, head, base, message: msg || "Merge via GitHub Manager" }) }); res.textContent = d.message; res.className = "res-box " + (d.ok ? "ok" : "err"); }
  catch (e) { res.textContent = e.message; res.className = "res-box err"; }
}

// ── COLLABORATORS TAB ─────────────────────────────────────────────────────────
async function loadCollabRepoSelect() {
  const d = await api("/api/my-repos").catch(() => null);
  const repos = d?.repos || [];
  const sel = $("collabRepo"); if (!sel) return;
  sel.innerHTML = repos.map(r => `<option value="${esc(r.url)}">${esc(r.name || r.url.split("/").pop())}</option>`).join("") || `<option value="">No repos — add to My Repos first</option>`;
  if (repos.length) { S.collabRepoUrl = repos[0].url; loadCollabs(); }
}

async function loadCollabs() {
  const url = $("collabRepo")?.value; if (!url) return;
  S.collabRepoUrl = url;
  html("collabsList", "<div class='sk'></div>");
  try {
    const d = await api(`/api/github/collaborators?repo_url=${encodeURIComponent(url)}`);
    html("collabsList", (d?.collaborators || []).map(c => `
      <div class="collab-item">
        <div style="display:flex;align-items:center;gap:8px">
          <img src="${c.avatar_url}" style="width:28px;height:28px;border-radius:50%">
          <span style="font-size:.85rem">${esc(c.login)}</span>
        </div>
        <button class="btn-rd sm" onclick="removeCollab('${esc(c.login)}')">Remove</button>
      </div>`).join("") || `<div style="padding:16px;color:var(--fa)">No collaborators</div>`);
  } catch (e) { html("collabsList", `<div style="color:var(--red)">${e.message}</div>`); }
}

async function doAddCollab() {
  const url = S.collabRepoUrl, user = $("collabUser").value.trim(), perm = $("collabPerm").value;
  if (!url || !user) { toast("Fill all fields", "err"); return; }
  const res = $("collabAddRes"); res.className = "res-box"; show("collabAddRes");
  try { const d = await api("/api/github/collaborators", { method: "POST", body: JSON.stringify({ repo_url: url, username: user, permission: perm }) }); res.textContent = d.message; res.className = "res-box " + (d.ok ? "ok" : "err"); if (d.ok) loadCollabs(); }
  catch (e) { res.textContent = e.message; res.className = "res-box err"; }
}

async function doRemoveCollab() {
  const url = S.collabRepoUrl, user = $("collabRemUser").value.trim();
  if (!url || !user) { toast("Fill all fields", "err"); return; }
  if (!confirm(`Remove ${user}?`)) return;
  const res = $("collabRemRes"); res.className = "res-box"; show("collabRemRes");
  try { const d = await api(`/api/github/collaborators?repo_url=${encodeURIComponent(url)}&username=${user}`, { method: "DELETE" }); res.textContent = d.message; res.className = "res-box " + (d.ok ? "ok" : "err"); if (d.ok) loadCollabs(); }
  catch (e) { res.textContent = e.message; res.className = "res-box err"; }
}

async function removeCollab(user) {
  if (!confirm(`Remove ${user}?`)) return;
  try { const d = await api(`/api/github/collaborators?repo_url=${encodeURIComponent(S.collabRepoUrl)}&username=${user}`, { method: "DELETE" }); toast(d.ok ? "✅ Removed" : "❌ " + d.message, d.ok ? "ok" : "err"); loadCollabs(); }
  catch (e) { toast(e.message, "err"); }
}

// ── GISTS ─────────────────────────────────────────────────────────────────────
async function loadGists() {
  html("gistsList", "<div class='sk'></div>");
  try {
    const d = await api("/api/github/gists"); if (!d) return;
    html("gistsList", (d.gists || []).length
      ? d.gists.map(g => {
          const files = Object.keys(g.files || {});
          return `<div class="gi">
            <div class="gi-name" onclick="viewGist('${esc(g.id)}')">${esc(files[0] || g.id.slice(0, 12))}</div>
            ${g.description ? `<div class="gi-desc">${esc(g.description)}</div>` : ""}
            <div class="gi-meta">
              <span>${g.public ? "🔓 Public" : "🔒 Secret"}</span>
              <span>${files.length} file(s)</span>
              <span>${ta(g.updated_at)}</span>
              <a href="${esc(g.html_url)}" target="_blank" style="color:var(--bl)">GitHub ↗</a>
            </div>
            <div><button class="btn-rd sm" onclick="delGist('${esc(g.id)}')">🗑 Delete</button></div>
          </div>`;
        }).join("")
      : `<div style="padding:32px;text-align:center;color:var(--fa)">No gists yet. <button class="btn-gr" onclick="openM('newGistM')">Create one</button></div>`);
  } catch (e) { html("gistsList", `<div style="color:var(--red);padding:24px">${e.message}</div>`); }
}

async function viewGist(id) {
  try { const d = await api(`/api/github/gists/${id}`); const f = Object.values(d?.files || {})[0]; alert(`📎 ${f?.filename || id}\n\n${f?.content || ""}`); }
  catch (e) { toast(e.message, "err"); }
}

async function createGist() {
  const desc = $("gDesc").value.trim(), file = $("gFile").value.trim(), content = $("gContent").value, pub = $("gPub").checked;
  if (!file) { toast("Enter filename", "err"); return; }
  if (!content) { toast("Enter content", "err"); return; }
  try { await api("/api/github/gists", { method: "POST", body: JSON.stringify({ filename: file, content, description: desc, public: pub }) }); closeM("newGistM"); toast("✅ Gist created!"); loadGists(); }
  catch (e) { toast(e.message, "err"); }
}

async function delGist(id) {
  if (!confirm("Delete this gist?")) return;
  try { await api(`/api/github/gists/${id}`, { method: "DELETE" }); toast("Gist deleted"); loadGists(); }
  catch (e) { toast(e.message, "err"); }
}

// ── STARRED ───────────────────────────────────────────────────────────────────
async function loadStarred() {
  html("starredList", "<div class='sk'></div>");
  try {
    const d = await api("/api/github/starred"); if (!d) return;
    html("starredList", Array.isArray(d) && d.length
      ? d.map(r => `
        <div class="ri">
          <div>
            <span class="ri-name" onclick="window.open('${esc(r.html_url)}','_blank')">${esc(r.full_name)}</span>
            ${r.description ? `<div class="ri-desc">${esc(r.description)}</div>` : ""}
            <div class="ri-meta">
              ${r.language ? `<span class="ri-m"><span class="ldot ${lc(r.language)}"></span>${r.language}</span>` : ""}
              <span class="ri-m">⭐ ${fmt(r.stargazers_count)}</span>
            </div>
          </div>
          <div class="ri-acts"><button class="ibtn" onclick="unstar('${esc(r.owner.login)}','${esc(r.name)}',this)">⭐ Starred</button></div>
        </div>`).join("")
      : `<div style="padding:32px;text-align:center;color:var(--fa)">No starred repos</div>`);
  } catch (e) { html("starredList", `<div style="color:var(--red);padding:24px">${e.message}</div>`); }
}

async function unstar(owner, name, btn) {
  try { await api(`/api/github/starred/${owner}/${name}`, { method: "DELETE" }); btn.textContent = "☆ Star"; toast("Unstarred"); }
  catch (e) { toast(e.message, "err"); }
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
async function loadNotifs() {
  try {
    const d = await api("/api/github/notifications"); if (!d) return;
    const count = Array.isArray(d) ? d.length : 0;
    const badge = $("nBadge");
    if (badge) { badge.textContent = count > 9 ? "9+" : String(count); badge.classList.toggle("hid", count === 0); }
    const el = $("notifList"); if (!el) return;
    html("notifList", Array.isArray(d) && d.length
      ? d.map(n => `
        <div class="ni">
          <div class="ndot ${n.unread ? "" : "rd"}"></div>
          <div style="flex:1">
            <div style="font-size:.75rem;color:var(--fa)">${esc(n.repository.full_name)}</div>
            <div style="font-size:.88rem">${esc(n.subject.title)}</div>
            <div style="font-size:.72rem;color:var(--fa)">${n.subject.type} · ${ta(n.updated_at)}</div>
          </div>
        </div>`).join("")
      : `<div style="padding:32px;text-align:center;color:var(--fa)">🎉 All caught up!</div>`);
  } catch {}
}

// ── PROFILE ───────────────────────────────────────────────────────────────────
async function loadProfile() {
  html("profileContent", `<div style="padding:32px"><div class="sk"></div></div>`);
  try {
    const [p, repos] = await Promise.all([api("/api/github/profile"), api("/api/github/repos?sort=updated&per_page=6")]);
    if (!p) return;
    html("profileContent", `
      <div class="prof-wrap">
        <div>
          <img class="prof-av" src="${esc(p.avatar_url)}" alt="">
          <div class="prof-name">${esc(p.name || p.login)}</div>
          <div class="prof-login">${esc(p.login)}</div>
          ${p.bio ? `<div class="prof-bio">${esc(p.bio)}</div>` : ""}
          <button class="edit-prof" onclick="editProfile()">✏️ Edit profile</button>
          <div class="prof-stats">
            <div class="prof-stat"><b>${fmt(p.followers)}</b> followers</div>
            <div class="prof-stat"><b>${fmt(p.following)}</b> following</div>
            <div class="prof-stat"><b>${fmt(p.public_repos)}</b> repos</div>
          </div>
          <div class="prof-meta">
            ${p.company  ? `<div class="prof-mi">🏢 ${esc(p.company)}</div>`  : ""}
            ${p.location ? `<div class="prof-mi">📍 ${esc(p.location)}</div>` : ""}
            ${p.blog     ? `<div class="prof-mi">🔗 <a href="${esc(p.blog)}" target="_blank" style="color:var(--bl)">${esc(p.blog)}</a></div>` : ""}
            ${p.twitter_username ? `<div class="prof-mi">🐦 @${esc(p.twitter_username)}</div>` : ""}
            <div class="prof-mi">📅 Joined ${new Date(p.created_at).toLocaleDateString("en", { month: "long", year: "numeric" })}</div>
          </div>
        </div>
        <div>
          <div class="hs-title">Repositories</div>
          <div class="rlist">${(repos || []).slice(0, 6).map(r => `
            <div class="ri">
              <div>
                <span class="ri-name" onclick="openRepo('${esc(r.owner.login)}','${esc(r.name)}')">${esc(r.name)}</span>
                <span class="vbadge" style="margin-left:8px">${r.private ? "Private" : "Public"}</span>
                ${r.description ? `<div class="ri-desc">${esc(r.description)}</div>` : ""}
                <div class="ri-meta">
                  ${r.language ? `<span class="ri-m"><span class="ldot ${lc(r.language)}"></span>${r.language}</span>` : ""}
                  <span class="ri-m">⭐ ${fmt(r.stargazers_count)}</span>
                </div>
              </div>
            </div>`).join("")}
          </div>
        </div>
      </div>`);
  } catch (e) { html("profileContent", `<div style="padding:32px;color:var(--red)">${e.message}</div>`); }
}

function editProfile() {
  api("/api/github/profile").then(p => {
    if (!p) return;
    const name = prompt("Display name:", p.name || ""); if (name === null) return;
    const bio  = prompt("Bio:", p.bio || ""); if (bio === null) return;
    const loc  = prompt("Location:", p.location || "");
    const blog = prompt("Website:", p.blog || "");
    const tw   = prompt("Twitter username:", p.twitter_username || "");
    return api("/api/github/profile", { method: "PATCH", body: JSON.stringify({ name: name || null, bio: bio || null, location: loc || null, blog: blog || null, twitter_username: tw || null }) });
  }).then(d => { if (d) { toast("✅ Profile updated!"); loadProfile(); } }).catch(e => toast(e.message, "err"));
}

// ── LOGS ──────────────────────────────────────────────────────────────────────
async function loadLogs() {
  html("logsList", "<div class='sk'></div>");
  try {
    const d = await api("/api/logs"); if (!d) return;
    html("logsList", d.logs?.length
      ? d.logs.map(l => `<div class="log-i"><div class="log-act">${esc(l.action)}</div><div class="log-det">${esc(l.detail)}</div><div class="log-t">${ta(l.time)}</div></div>`).join("")
      : `<div style="padding:24px;text-align:center;color:var(--fa)">No activity yet</div>`);
  } catch (e) { html("logsList", `<div style="color:var(--red)">${e.message}</div>`); }
}

async function clearLogs() {
  if (!confirm("Clear all logs?")) return;
  try { await api("/api/logs", { method: "DELETE" }); toast("✅ Logs cleared"); loadLogs(); }
  catch (e) { toast(e.message, "err"); }
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────
function setSTab(el, s) {
  document.querySelectorAll("#tab-settings .pill").forEach(p => p.classList.remove("active")); el.classList.add("active");
  $("sAcc")?.classList.toggle("hid", s !== "acc");
  $("sSec")?.classList.toggle("hid", s !== "sec");
}

async function updateTok() {
  const t = $("newTok").value.trim(); if (!t) { toast("Enter token", "err"); return; }
  try { await api("/api/me/token", { method: "PUT", body: JSON.stringify({ github_token: t }) }); toast("✅ Token updated!"); $("newTok").value = ""; initApp(); }
  catch (e) { toast(e.message, "err"); }
}

async function changePw() {
  const o = $("oldPw").value, n = $("newPw").value; if (!o || !n) { toast("Fill both fields", "err"); return; }
  try { await api("/api/me/password", { method: "PUT", body: JSON.stringify({ old_password: o, new_password: n }) }); toast("✅ Password changed!"); $("oldPw").value = ""; $("newPw").value = ""; }
  catch (e) { toast(e.message, "err"); }
}

// ── SEARCH ────────────────────────────────────────────────────────────────────
function handleSearch(e) {
  if (e.key !== "Enter") return;
  const q = $("sInput").value.trim(); if (!q) return;
  S.searchQ = q; showTab("search");
  $("srchTitle").textContent = `Results: "${q}"`;
  runSearch(S.searchType);
}

function setSType(el, t) {
  document.querySelectorAll("#tab-search .pill").forEach(p => p.classList.remove("active")); el.classList.add("active");
  S.searchType = t; runSearch(t);
}

async function runSearch(type) {
  if (!S.searchQ) return;
  html("searchResults", "<div class='sk'></div>");
  try {
    const d = await api(`/api/github/search/${type}?q=${encodeURIComponent(S.searchQ)}&per_page=20`);
    if (type === "repos") {
      html("searchResults", (d?.items || []).map(r => `
        <div class="ri">
          <div>
            <span class="ri-name" onclick="openRepo('${esc(r.owner.login)}','${esc(r.name)}')">${esc(r.full_name)}</span>
            <span class="vbadge" style="margin-left:8px">${r.private ? "Private" : "Public"}</span>
            ${r.description ? `<div class="ri-desc">${esc(r.description)}</div>` : ""}
            <div class="ri-meta">
              ${r.language ? `<span class="ri-m"><span class="ldot ${lc(r.language)}"></span>${r.language}</span>` : ""}
              <span class="ri-m">⭐ ${fmt(r.stargazers_count)}</span>
            </div>
          </div>
        </div>`).join("") || `<div style="padding:32px;text-align:center;color:var(--fa)">No results for "${esc(S.searchQ)}"</div>`);
    } else {
      html("searchResults", (d?.items || []).map(u => `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--bd)">
          <img src="${esc(u.avatar_url)}" style="width:36px;height:36px;border-radius:50%;border:1px solid var(--bd)">
          <div>
            <div style="font-size:.88rem;font-weight:500;color:var(--bl)">${esc(u.login)}</div>
            <a href="${esc(u.html_url)}" target="_blank" style="font-size:.75rem;color:var(--fa)">${esc(u.html_url)}</a>
          </div>
        </div>`).join("") || `<div style="padding:32px;text-align:center;color:var(--fa)">No users found</div>`);
    }
  } catch (e) { html("searchResults", `<div style="color:var(--red);padding:24px">${e.message}</div>`); }
}

// ── Inline CSS for repo view tabs ─────────────────────────────────────────────
const s = document.createElement("style");
s.textContent = `.rtab{padding:10px 14px;font-size:.82rem;color:var(--mu);border-bottom:2px solid transparent;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:color .12s;white-space:nowrap}.rtab:hover{color:var(--t)}.rtab.active{color:var(--t);border-bottom-color:#e3b341;font-weight:500}`;
document.head.appendChild(s);
