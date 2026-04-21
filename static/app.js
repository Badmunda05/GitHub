/* ════════════════════════════════════════════════════════════
   GitHub Control Bot Dashboard — app.js
   All API calls use JWT token — each user sees ONLY their data
   ════════════════════════════════════════════════════════════ */

const API = "";   // Same origin — FastAPI serves both

// ─── Auth helpers ────────────────────────────────────────────
function getToken() { return localStorage.getItem("gbToken"); }
function getUser()  { try { return JSON.parse(localStorage.getItem("gbUser") || "{}"); } catch { return {}; } }

function authHeaders() {
  return { "Content-Type": "application/json", "Authorization": "Bearer " + getToken() };
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: authHeaders(),
    ...opts,
  });
  if (res.status === 401) { logout(); return null; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

// ─── Toast ───────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = "success") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}

// ─── Login ───────────────────────────────────────────────────
async function doLogin() {
  const tgId   = document.getElementById("loginTgId").value.trim();
  const secret = document.getElementById("loginSecret").value.trim();
  const errEl  = document.getElementById("loginError");
  errEl.classList.add("hidden");

  if (!tgId || !secret) {
    errEl.textContent = "Please enter both Telegram ID and secret key.";
    errEl.classList.remove("hidden");
    return;
  }

  try {
    const res = await fetch(API + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: parseInt(tgId), secret_key: secret }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Login failed");

    localStorage.setItem("gbToken", data.access_token);
    localStorage.setItem("gbUser", JSON.stringify(data));
    showDashboard();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove("hidden");
  }
}

// Allow Enter key on login
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("loginSecret")?.addEventListener("keydown", e => {
    if (e.key === "Enter") doLogin();
  });
  document.getElementById("loginTgId")?.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("loginSecret").focus();
  });

  // Check if already logged in
  if (getToken()) {
    showDashboard();
  } else {
    document.getElementById("loginScreen").classList.add("active");
  }
});

function logout() {
  localStorage.removeItem("gbToken");
  localStorage.removeItem("gbUser");
  document.getElementById("dashboard").classList.remove("active");
  document.getElementById("loginScreen").classList.add("active");
  document.getElementById("loginSecret").value = "";
}

// ─── Dashboard init ───────────────────────────────────────────
async function showDashboard() {
  document.getElementById("loginScreen").classList.remove("active");
  document.getElementById("dashboard").classList.add("active");
  await loadMe();
  showTab("overview");
}

async function loadMe() {
  try {
    const me = await apiFetch("/api/me");
    if (!me) return;

    const user = getUser();
    const uname = me.username || user.username || "User";
    const uid   = me.uid || user.uid || "";

    document.getElementById("sidebarUsername").textContent = uname;
    document.getElementById("sidebarUid").textContent = `#${uid}`;
    document.getElementById("sidebarAvatar").textContent = uname[0].toUpperCase();
    document.getElementById("overviewGreeting").textContent = `Welcome, ${uname}`;

    // Stats
    document.getElementById("statToken").textContent  = me.has_token ? "✅ Set" : "❌ Not set";
    document.getElementById("statRepos").textContent  = me.repo_count || "0";
    document.getElementById("statActions").textContent = me.recent_logs?.length || "0";

    const activeShort = me.active_repo
      ? me.active_repo.replace("https://github.com/", "").replace("https://github.com/", "")
      : "None";
    document.getElementById("statActive").textContent = activeShort;

    // Recent logs
    renderLogs(document.getElementById("recentLogs"), me.recent_logs || [], false);

    // Token status
    updateTokenStatus(me.has_token, me.token_preview);

    // Admin nav
    if (me.is_owner) {
      document.getElementById("adminNav").classList.remove("hidden");
    }
  } catch (e) {
    console.error("loadMe failed:", e);
  }
}

// ─── Tab navigation ───────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
  const panel = document.getElementById("tab-" + name);
  if (panel) panel.classList.add("active");

  // Highlight nav
  document.querySelectorAll(".nav-item").forEach(item => {
    if (item.getAttribute("onclick")?.includes(`'${name}'`)) item.classList.add("active");
  });

  // Auto-load
  if (name === "repos") loadMyRepos();
  if (name === "logs") loadMyLogs();
  if (name === "admin") { loadAdminStats(); loadAdminUsers(); loadAdminLogs(); }
  if (name === "token") loadTokenStatus();
}

// ─── Token management ─────────────────────────────────────────
async function loadTokenStatus() {
  try {
    const me = await apiFetch("/api/me");
    if (me) updateTokenStatus(me.has_token, me.token_preview);
  } catch {}
}

function updateTokenStatus(hasToken, preview) {
  const dot  = document.getElementById("tokenDot");
  const text = document.getElementById("tokenStatusText");
  if (!dot) return;
  if (hasToken) {
    dot.className  = "status-dot online";
    text.textContent = `Token saved: ${preview || "***"}`;
  } else {
    dot.className  = "status-dot offline";
    text.textContent = "No token saved";
  }
}

async function saveToken() {
  const val = document.getElementById("tokenInput").value.trim();
  if (!val) return toast("Enter a token first", "error");
  try {
    await apiFetch("/api/token", { method: "POST", body: JSON.stringify({ github_token: val }) });
    document.getElementById("tokenInput").value = "";
    toast("✅ Token saved!");
    loadTokenStatus();
    loadMe();
  } catch (e) { toast(e.message, "error"); }
}

async function deleteToken() {
  if (!confirm("Remove your GitHub token?")) return;
  try {
    await apiFetch("/api/token", { method: "DELETE" });
    toast("Token removed");
    loadTokenStatus();
    loadMe();
  } catch (e) { toast(e.message, "error"); }
}

// ─── My Repos ─────────────────────────────────────────────────
async function loadMyRepos() {
  const container = document.getElementById("reposList");
  container.innerHTML = "<div class='loading-pulse'>Loading repos...</div>";
  try {
    const data = await apiFetch("/api/repos");
    if (!data) return;
    const { repos, active } = data;

    if (!repos.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📂</div>
          <p>No repos saved yet</p>
          <div class="btn-group">
            <button class="btn-primary" onclick="openAddRepo()">+ Add Repo</button>
            <button class="btn-ghost" onclick="document.getElementById('createRepoModal').classList.remove('hidden')">🆕 Create New</button>
          </div>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div style="display:flex;gap:10px;margin-bottom:12px">
        <button class="btn-primary" onclick="openAddRepo()">+ Add Repo</button>
        <button class="btn-ghost" onclick="document.getElementById('createRepoModal').classList.remove('hidden')">🆕 Create on GitHub</button>
      </div>` +
      repos.map((r, i) => {
        const isActive = r.url === active;
        const lock = r.is_private ? `<span class="badge badge-private">🔒 Private</span>` : `<span class="badge badge-public">🔓 Public</span>`;
        const act  = isActive ? `<span class="badge badge-active">⭐ Active</span>` : "";
        return `
          <div class="repo-card ${isActive ? "is-active" : ""}">
            <div class="repo-icon">📁</div>
            <div class="repo-info">
              <div class="repo-name">${r.name || r.url.split("/").slice(-1)[0]}</div>
              <div class="repo-url">${r.url}</div>
              <div class="repo-badges">${lock}${act}</div>
            </div>
            <div class="repo-actions">
              ${!isActive ? `<button class="btn-icon" onclick="setActiveRepo(${i})" title="Set Active">⭐</button>` : ""}
              <button class="btn-icon" onclick="loadCommits(${i})" title="Commits">📋</button>
              <button class="btn-icon" onclick="loadBranches(${i})" title="Branches">🌿</button>
              <button class="btn-icon danger" onclick="deleteRepo(${i})" title="Remove" style="color:var(--danger)">🗑</button>
            </div>
          </div>`;
      }).join("");
  } catch (e) { container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">${e.message}</p></div>`; }
}

function openAddRepo() {
  document.getElementById("addRepoUrl").value  = "";
  document.getElementById("addRepoName").value = "";
  document.getElementById("addRepoPrivate").checked = false;
  document.getElementById("addRepoModal").classList.remove("hidden");
}

async function addRepo() {
  const url     = document.getElementById("addRepoUrl").value.trim();
  const name    = document.getElementById("addRepoName").value.trim();
  const priv    = document.getElementById("addRepoPrivate").checked;
  if (!url) return toast("Enter a URL", "error");
  try {
    await apiFetch("/api/repos", { method: "POST", body: JSON.stringify({ url, name, is_private: priv }) });
    closeModal("addRepoModal");
    toast("✅ Repo added!");
    loadMyRepos(); loadMe();
  } catch (e) { toast(e.message, "error"); }
}

async function setActiveRepo(idx) {
  try {
    await apiFetch(`/api/repos/${idx}/activate`, { method: "POST" });
    toast("✅ Active repo set!");
    loadMyRepos(); loadMe();
  } catch (e) { toast(e.message, "error"); }
}

async function deleteRepo(idx) {
  if (!confirm("Remove this repo from your list?")) return;
  try {
    await apiFetch(`/api/repos/${idx}`, { method: "DELETE" });
    toast("Repo removed");
    loadMyRepos(); loadMe();
  } catch (e) { toast(e.message, "error"); }
}

async function loadCommits(idx) {
  try {
    toast("Loading commits...");
    const d = await apiFetch(`/api/github/commits/${idx}`);
    alert("📋 Commits:\n\n" + d.commits);
  } catch (e) { toast(e.message, "error"); }
}

async function loadBranches(idx) {
  try {
    toast("Loading branches...");
    const d = await apiFetch(`/api/github/branches/${idx}`);
    alert("🌿 Branches:\n\n" + d.branches.join("\n"));
  } catch (e) { toast(e.message, "error"); }
}

async function createRepo() {
  const name = document.getElementById("createRepoName").value.trim();
  const desc = document.getElementById("createRepoDesc").value.trim();
  const priv = document.getElementById("createRepoPrivate").checked;
  if (!name) return toast("Enter repo name", "error");
  try {
    const d = await apiFetch("/api/github/repos", {
      method: "POST",
      body: JSON.stringify({ name, description: desc, private: priv }),
    });
    closeModal("createRepoModal");
    toast(`✅ Created: ${d.url}`);
    loadMyRepos();
  } catch (e) { toast(e.message, "error"); }
}

// ─── GitHub Repos ──────────────────────────────────────────────
async function loadGithubRepos() {
  const container = document.getElementById("githubReposList");
  container.innerHTML = "<div class='loading-pulse'>Fetching from GitHub...</div>";
  try {
    const data = await apiFetch("/api/github/repos");
    if (!data) return;
    const { repos } = data;
    if (!repos.length) {
      container.innerHTML = `<div class="empty-state"><p>No repos on GitHub</p></div>`;
      return;
    }
    container.innerHTML = repos.map((r, i) => {
      const lock = r.private ? `<span class="badge badge-private">🔒 Private</span>` : `<span class="badge badge-public">🔓 Public</span>`;
      return `
        <div class="repo-card">
          <div class="repo-icon">🌐</div>
          <div class="repo-info">
            <div class="repo-name">${r.full_name}</div>
            <div class="repo-url">${r.html_url}</div>
            <div class="repo-badges">${lock}
              <span class="badge" style="background:rgba(255,255,255,.05);color:var(--text2)">⭐ ${r.stargazers_count}</span>
              <span class="badge" style="background:rgba(255,255,255,.05);color:var(--text2)">🍴 ${r.forks_count}</span>
            </div>
          </div>
          <div class="repo-actions">
            <button class="btn-icon" onclick="addGhToList('${r.html_url}','${r.name}',${r.private})" title="Add to list">📌</button>
            <button class="btn-icon" style="color:var(--danger)" onclick="deleteGhRepo('${r.html_url}')" title="Delete">🗑</button>
          </div>
        </div>`;
    }).join("");
  } catch (e) { container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">${e.message}</p></div>`; }
}

async function addGhToList(url, name, priv) {
  try {
    await apiFetch("/api/repos", { method: "POST", body: JSON.stringify({ url, name, is_private: priv }) });
    toast("📌 Added to your list!");
    loadMyRepos();
  } catch (e) { toast(e.message === "Repo already in list" ? "Already in your list" : e.message, "error"); }
}

async function deleteGhRepo(url) {
  if (!confirm(`⚠️ Permanently delete this repo from GitHub?\n\n${url}\n\nThis CANNOT be undone!`)) return;
  if (prompt("Type DELETE to confirm:") !== "DELETE") return toast("Cancelled");
  try {
    // Find repo index
    const repos = (await apiFetch("/api/repos")).repos;
    const idx   = repos.findIndex(r => r.url === url);
    if (idx < 0) return toast("Repo not in your list", "error");
    const d = await apiFetch(`/api/github/repos/${idx}`, { method: "DELETE" });
    toast(d.ok ? "✅ Deleted from GitHub" : "❌ " + d.message, d.ok ? "success" : "error");
    loadGithubRepos(); loadMyRepos();
  } catch (e) { toast(e.message, "error"); }
}

// ─── Gists ────────────────────────────────────────────────────
async function loadGists() {
  const container = document.getElementById("gistsList");
  container.innerHTML = "<div class='loading-pulse'>Loading gists...</div>";
  try {
    const data = await apiFetch("/api/gists");
    if (!data) return;
    const { gists } = data;
    if (!gists.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📎</div><p>No gists yet</p></div>`;
      return;
    }
    container.innerHTML = gists.map(g => {
      const vis = g.public ? `<span class="badge badge-public">🔓 Public</span>` : `<span class="badge badge-private">🔒 Secret</span>`;
      const files = g.files.map(f => `<span class="gist-file">${f}</span>`).join("");
      return `
        <div class="gist-card">
          <div style="font-size:1.4rem">📎</div>
          <div class="gist-info">
            <div class="repo-name">${g.id.slice(0,12)}...</div>
            <div class="repo-url"><a href="${g.url}" target="_blank" style="color:var(--accent2)">${g.url}</a></div>
            <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${vis}<div class="gist-files">${files}</div></div>
          </div>
          <div class="repo-actions">
            <button class="btn-icon" style="color:var(--danger)" onclick="deleteGist('${g.id}')">🗑</button>
          </div>
        </div>`;
    }).join("");
  } catch (e) { container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">${e.message}</p></div>`; }
}

function openCreateGist() {
  document.getElementById("gistFilename").value = "";
  document.getElementById("gistContent").value  = "";
  document.getElementById("gistPublic").checked = true;
  document.getElementById("createGistModal").classList.remove("hidden");
}

async function createGist() {
  const filename = document.getElementById("gistFilename").value.trim();
  const content  = document.getElementById("gistContent").value;
  const pub      = document.getElementById("gistPublic").checked;
  if (!filename) return toast("Enter a filename", "error");
  if (!content)  return toast("Enter content", "error");
  try {
    await apiFetch("/api/gists", { method: "POST", body: JSON.stringify({ filename, content, public: pub }) });
    closeModal("createGistModal");
    toast("✅ Gist created!");
    loadGists();
  } catch (e) { toast(e.message, "error"); }
}

async function deleteGist(id) {
  if (!confirm("Delete this gist from GitHub?")) return;
  try {
    await apiFetch(`/api/gists/${id}`, { method: "DELETE" });
    toast("Gist deleted");
    loadGists();
  } catch (e) { toast(e.message, "error"); }
}

// ─── Profile ──────────────────────────────────────────────────
async function loadProfile() {
  const container = document.getElementById("profileContent");
  container.innerHTML = "<div class='loading-pulse'>Loading profile...</div>";
  try {
    const p = await apiFetch("/api/github/profile");
    if (!p) return;

    const fields = [
      { key: "login",    label: "Username",  editable: false },
      { key: "name",     label: "Display Name", field: "name" },
      { key: "bio",      label: "Bio",           field: "bio" },
      { key: "location", label: "Location",      field: "location" },
      { key: "blog",     label: "Website",       field: "blog" },
      { key: "twitter_username", label: "Twitter", field: "twitter" },
    ];

    container.innerHTML = `<div class="card-section profile-grid">` +
      fields.map(f => `
        <div class="profile-field">
          <div class="profile-key">${f.label}</div>
          <div class="profile-edit-row">
            <div class="profile-val" style="flex:1">${p[f.key] || "<span style='color:var(--text3)'>—</span>"}</div>
            ${f.editable === false ? "" : `<button class="btn-icon" onclick="editProfileField('${f.field}','${p[f.key] || ""}')">✏️</button>`}
          </div>
        </div>
      `).join("") +
    `</div>`;
  } catch (e) {
    container.innerHTML = `<div class="card-section"><div class="empty-state"><p style="color:var(--danger)">${e.message}</p></div></div>`;
  }
}

function editProfileField(field, current) {
  const val = prompt(`Edit ${field}:`, current || "");
  if (val === null) return;
  updateProfile(field, val || null);
}

async function updateProfile(field, value) {
  try {
    const body = {};
    body[field] = value || null;
    await apiFetch("/api/github/profile", { method: "PUT", body: JSON.stringify(body) });
    toast("✅ Profile updated!");
    loadProfile();
  } catch (e) { toast(e.message, "error"); }
}

// ─── Logs ─────────────────────────────────────────────────────
async function loadMyLogs() {
  const container = document.getElementById("fullLogsList");
  container.innerHTML = "<div class='loading-pulse'>Loading...</div>";
  try {
    const data = await apiFetch("/api/logs?limit=50");
    if (!data) return;
    renderLogs(container, data.logs, false);
  } catch (e) { container.innerHTML = `<div style="color:var(--danger);padding:16px">${e.message}</div>`; }
}

function renderLogs(container, logs, showUser = false) {
  if (!logs || !logs.length) {
    container.innerHTML = `<div class="empty-state"><p>No activity yet</p></div>`;
    return;
  }
  container.innerHTML = logs.map(l => `
    <div class="log-item">
      ${showUser ? `<div class="log-user">@${l.username}</div>` : ""}
      <div class="log-action">🔧 ${l.action}</div>
      <div class="log-detail">${l.detail || "—"}</div>
      <div class="log-time">${l.time}</div>
    </div>
  `).join("");
}

// ─── Admin ────────────────────────────────────────────────────
async function loadAdminStats() {
  const grid = document.getElementById("adminStatsGrid");
  try {
    const s = await apiFetch("/api/admin/stats");
    if (!s) return;
    grid.innerHTML = [
      { icon:"👥", val: s.total_users,   label:"Total Users" },
      { icon:"📦", val: s.total_repos,   label:"Total Repos" },
      { icon:"🚀", val: s.git_pushes,    label:"Git Pushes" },
      { icon:"📥", val: s.clones,        label:"Clones" },
      { icon:"📤", val: s.zip_uploads,   label:"ZIP Uploads" },
      { icon:"📋", val: s.total_actions, label:"Total Actions" },
    ].map(c => `
      <div class="stat-card">
        <div class="stat-icon">${c.icon}</div>
        <div class="stat-info">
          <div class="stat-value">${c.val ?? "—"}</div>
          <div class="stat-label">${c.label}</div>
        </div>
      </div>
    `).join("");
  } catch (e) { grid.innerHTML = `<div style="color:var(--danger)">${e.message}</div>`; }
}

async function loadAdminUsers() {
  const container = document.getElementById("adminUsersList");
  try {
    const data = await apiFetch("/api/admin/users");
    if (!data) return;
    container.innerHTML = data.users.map(u => `
      <div class="admin-user-item">
        <div class="avatar" style="width:24px;height:24px;font-size:.65rem">${(u.username || "U")[0].toUpperCase()}</div>
        <div class="admin-username">@${u.username || "—"}</div>
        <div class="admin-uid">#${u._id}</div>
        <div class="admin-meta">${u.has_token ? "🔑" : "❌"} ${u.repo_count} repos</div>
      </div>
    `).join("") || `<div class="empty-state"><p>No users</p></div>`;
  } catch (e) { container.innerHTML = `<div style="color:var(--danger)">${e.message}</div>`; }
}

async function loadAdminLogs() {
  const container = document.getElementById("adminLogsList");
  try {
    const data = await apiFetch("/api/admin/logs?limit=30");
    if (!data) return;
    renderLogs(container, data.logs, true);
  } catch (e) { container.innerHTML = `<div style="color:var(--danger)">${e.message}</div>`; }
}

// ─── Modal helpers ────────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}

// Close modal on backdrop click
document.addEventListener("click", e => {
  if (e.target.classList.contains("modal")) {
    e.target.classList.add("hidden");
  }
});

// Keyboard shortcut: Escape to close modal
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal:not(.hidden)").forEach(m => m.classList.add("hidden"));
  }
});
