/* GitHub Manager — app.js — ALL bot features */
const S={token:null,user:null,repos:[],myRepos:[],repoFilter:"all",searchType:"repos",searchQ:"",wsData:[],branchRepoUrl:"",collabRepoUrl:"",fmBrowsePath:""};
const T=()=>localStorage.getItem("ghm_t");
async function api(p,o={}){
  const r=await fetch(p,{headers:{"Content-Type":"application/json",...(T()?{Authorization:"Bearer "+T()}:{})},method:"GET",...o});
  if(r.status===401){doLogout();return null}
  try{const d=await r.json();if(!r.ok)throw new Error(d.detail||"Error "+r.status);return d}catch(e){if(!r.ok)throw e;return null}
}
let tT;
function toast(msg,type="ok"){const e=document.getElementById("toast");e.textContent=msg;e.className="toast "+type;clearTimeout(tT);tT=setTimeout(()=>e.classList.add("hid"),3200)}
function hid(id){document.getElementById(id)?.classList.add("hid")}
function show(id){document.getElementById(id)?.classList.remove("hid")}
function setHtml(id,h){const e=document.getElementById(id);if(e)e.innerHTML=h}
function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
function ta(iso){if(!iso)return"";const d=Date.now()-new Date(iso);const m=Math.floor(d/60000);if(m<1)return"just now";if(m<60)return m+"m ago";const h=Math.floor(m/60);if(h<24)return h+"h ago";const dy=Math.floor(h/24);if(dy<30)return dy+"d ago";return Math.floor(dy/30)+"mo ago"}
function fmt(n){if(!n)return"0";return n>=1000?(n/1000).toFixed(1)+"k":String(n)}
function lc(l){const m={"JavaScript":"js","TypeScript":"ts","Python":"py","HTML":"html","CSS":"css","Go":"go","Rust":"rs","Ruby":"rb"};return m[l]||""}

document.addEventListener("DOMContentLoaded",()=>{
  if(T())initApp();
  document.addEventListener("keydown",e=>{if(e.key==="/"&&!["INPUT","TEXTAREA"].includes(document.activeElement.tagName)){e.preventDefault();document.getElementById("sInput").focus()}if(e.key==="Escape")closeAll()});
  document.getElementById("lp")?.addEventListener("keydown",e=>e.key==="Enter"&&doLogin());
});

// AUTH
function sw(to){document.getElementById("loginCard")?.classList.toggle("hid",to==="reg");document.getElementById("regCard")?.classList.toggle("hid",to!=="reg")}
async function doLogin(){
  const u=document.getElementById("lu").value.trim(),p=document.getElementById("lp").value;
  const el=document.getElementById("lErr");el.classList.add("hid");
  if(!u||!p)return;
  try{const d=await api("/api/login",{method:"POST",body:JSON.stringify({username:u,password:p})});
    if(!d)return;localStorage.setItem("ghm_t",d.access_token);localStorage.setItem("ghm_u",JSON.stringify(d));S.user=d;initApp()}
  catch(e){el.textContent=e.message;show("lErr")}
}
async function doRegister(){
  const u=document.getElementById("ru").value.trim(),p=document.getElementById("rp").value,t=document.getElementById("rt").value.trim();
  const el=document.getElementById("rErr");el.classList.add("hid");
  if(!u||!p||!t){el.textContent="All fields required";show("rErr");return}
  try{const d=await api("/api/register",{method:"POST",body:JSON.stringify({username:u,password:p,github_token:t})});
    if(!d)return;localStorage.setItem("ghm_t",d.access_token);localStorage.setItem("ghm_u",JSON.stringify(d));S.user=d;initApp()}
  catch(e){el.textContent=e.message;show("rErr")}
}
function doLogout(){localStorage.removeItem("ghm_t");localStorage.removeItem("ghm_u");location.reload()}

// APP INIT
async function initApp(){
  hid("authWrap");show("app");
  const sv=localStorage.getItem("ghm_u");if(sv)S.user=JSON.parse(sv);
  try{const me=await api("/api/me");if(me){S.user={...S.user,...me};localStorage.setItem("ghm_u",JSON.stringify(S.user))}}catch{}
  updateTopbar();showTab("home");loadHomeData();loadNotifs();loadWorkspace();loadFolderSelects();loadMyRepoSelects();
}
function updateTopbar(){
  const u=S.user||{};const av=document.getElementById("tAvatar");const fav=document.getElementById("fAvatar");
  const src=u.gh_avatar||`https://github.com/${u.gh_login||"ghost"}.png`;
  if(av)av.src=src;if(fav)fav.src=src;
  const ddu=document.getElementById("ddUser");const ddg=document.getElementById("ddGh");
  if(ddu)ddu.textContent=u.username||"";if(ddg)ddg.textContent="@"+(u.gh_login||"");
}

// TABS
function showTab(name){
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  const el=document.getElementById("tab-"+name);if(el)el.classList.add("active");closeAll();
  if(name==="repos")loadRepos();if(name==="gists")loadGists();if(name==="starred")loadStarred();
  if(name==="notifications")loadNotifs();if(name==="profile")loadProfile();
  if(name==="logs")loadLogs();if(name==="my-repos")loadMyRepos();
  if(name==="workspace")loadWorkspace();if(name==="filemanager")loadFmFolders();
  if(name==="branches")loadBranchRepoSelect();if(name==="collaborators")loadCollabRepoSelect();
}
function goHome(){showTab("home")}
function toggleNewMenu(){document.getElementById("newMenu").classList.toggle("hid");document.getElementById("overlay").classList.toggle("hid")}
function toggleUserMenu(){document.getElementById("uDrop").classList.toggle("hid");document.getElementById("overlay").classList.toggle("hid")}
function closeAll(){hid("newMenu");hid("uDrop");hid("overlay")}
function openM(id){document.getElementById(id)?.classList.remove("hid")}
function closeM(id){document.getElementById(id)?.classList.add("hid")}
document.addEventListener("click",e=>{if(e.target.classList.contains("mwrap"))closeM(e.target.id)});

// HOME
async function loadHomeData(){
  try{const[repos,stats]=await Promise.all([api("/api/github/repos?sort=updated&per_page=6"),api("/api/stats")]);
    if(repos){S.repos=repos;renderHomeRepos(repos.slice(0,6))}
    if(stats){setHtml("homeStats",`
      <div class="stat-c"><div class="stat-v">${stats.repos}</div><div class="stat-l">Repos</div></div>
      <div class="stat-c"><div class="stat-v">${stats.workspace_folders}</div><div class="stat-l">Workspace</div></div>
      <div class="stat-c"><div class="stat-v">${stats.total_actions}</div><div class="stat-l">Actions</div></div>
      <div class="stat-c"><div class="stat-v">${(stats.active||"—").split("/").slice(-1)[0]||"None"}</div><div class="stat-l">Active</div></div>
    `)}
  }catch{}
}
function renderHomeRepos(repos){
  if(!repos.length){setHtml("homeRepos",`<div style="color:var(--fa);font-size:.82rem">No repos yet. <a style="color:var(--bl);cursor:pointer" onclick="openM('newRepoM')">Create one</a></div>`);return}
  setHtml("homeRepos",repos.map(r=>`
    <div style="padding:10px 0;border-top:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between">
      <div><span class="ri-name" onclick="openRepo('${r.owner.login}','${r.name}')">${r.name}</span>
        <div style="font-size:.72rem;color:var(--fa);margin-top:2px">${ta(r.updated_at)}</div></div>
      <span class="vbadge">${r.private?"🔒":"🔓"}</span>
    </div>`).join(""))
}
async function exploreSearch(){
  const q=document.getElementById("expI").value.trim();if(!q)return;
  setHtml("expRes",`<div style="color:var(--fa);font-size:.78rem">Searching...</div>`);
  try{const d=await api(`/api/github/search/repos?q=${encodeURIComponent(q)}&sort=stars&per_page=5`);
    setHtml("expRes",(d?.items||[]).map(r=>`<div class="exp-item">
      <div class="exp-name" onclick="openRepo('${r.owner.login}','${r.name}')">${r.full_name}</div>
      ${r.description?`<div style="font-size:.75rem;color:var(--mu)">${esc(r.description.slice(0,70))}</div>`:""}
      <div class="exp-meta"><span>⭐ ${fmt(r.stargazers_count)}</span>${r.language?`<span>${r.language}</span>`:""}</div>
    </div>`).join("")||`<div style="color:var(--fa);font-size:.78rem">No results</div>`)}
  catch{setHtml("expRes",`<div style="color:var(--red);font-size:.78rem">Search failed</div>`)}
}

// MY REPOS (saved list)
async function loadMyRepos(){
  setHtml("myReposList","<div class='sk'></div>");
  try{const d=await api("/api/my-repos");if(!d)return;S.myRepos=d.repos;renderMyRepos(d)}catch(e){setHtml("myReposList",`<div style="color:var(--red)">${e.message}</div>`)}
}
function renderMyRepos(d){
  const{repos,active}=d;
  if(!repos.length){setHtml("myReposList",`<div style="padding:24px;text-align:center;color:var(--fa)">No repos saved. <button class="btn-gr" onclick="openM('addRepoM')">+ Add one</button></div>`);return}
  setHtml("myReposList",repos.map((r,i)=>`
    <div class="mr-item">
      <div class="mr-info">
        <div class="mr-name" onclick="openRepo('${r.url.replace('https://github.com/','').split('/')[0]}','${r.url.split('/').pop()}')">${r.name||r.url.split('/').pop()}</div>
        <div class="mr-url">${r.url}</div>
        <div style="margin-top:4px;display:flex;gap:6px">
          ${r.url===active?`<span class="vbadge" style="border-color:rgba(88,166,255,.4);color:var(--bl)">⭐ Active</span>`:""}
          <span class="vbadge">${r.is_private?"🔒 Private":"🔓 Public"}</span>
        </div>
      </div>
      <div class="mr-acts">
        ${r.url!==active?`<button class="ibtn" onclick="activateMyRepo(${i})">Set Active</button>`:""}
        <button class="ibtn" onclick="toggleVisibility(${i},'${r.url}',${r.is_private})">${r.is_private?"Make Public":"Make Private"}</button>
        <button class="btn-rd sm" onclick="delMyRepo(${i})">Remove</button>
      </div>
    </div>`).join(""))
}
async function addMyRepo(){
  const url=document.getElementById("arUrl").value.trim(),name=document.getElementById("arName").value.trim(),priv=document.getElementById("arPriv").checked;
  if(!url){toast("Enter a URL","err");return}
  try{await api("/api/my-repos",{method:"POST",body:JSON.stringify({url,name,is_private:priv})});closeM("addRepoM");toast("✅ Added!");loadMyRepos();loadFolderSelects();loadMyRepoSelects()}
  catch(e){toast(e.message,"err")}
}
async function activateMyRepo(idx){
  try{await api(`/api/my-repos/${idx}/activate`,{method:"POST"});toast("✅ Active repo set!");loadMyRepos()}
  catch(e){toast(e.message,"err")}
}
async function delMyRepo(idx){if(!confirm("Remove from list?"))return;
  try{await api(`/api/my-repos/${idx}`,{method:"DELETE"});toast("Removed");loadMyRepos();loadFolderSelects()}
  catch(e){toast(e.message,"err")}
}
async function toggleVisibility(idx,url,currentPriv){
  if(!confirm(`Make this repo ${currentPriv?"public":"private"}?`))return;
  try{const d=await api(`/api/my-repos/${idx}/visibility`,{method:"PUT",body:JSON.stringify({url,private:!currentPriv})});
    toast(d.ok?"✅ Visibility changed!":"❌ "+d.message,d.ok?"ok":"err");loadMyRepos()}
  catch(e){toast(e.message,"err")}
}

// GITHUB REPOS
async function loadRepos(){
  setHtml("reposList","<div class='sk'></div><div class='sk'></div>");
  try{const d=await api("/api/github/repos?sort=updated&per_page=100");if(!d)return;S.repos=d;document.getElementById("reposTitle").textContent=`Repositories (${d.length})`;renderRepos()}
  catch(e){setHtml("reposList",`<div style="padding:24px;color:var(--red)">${e.message}</div>`)}
}
function renderRepos(){
  const f=document.getElementById("rFilter")?.value.toLowerCase()||"";
  let repos=S.repos;
  if(S.repoFilter==="public")repos=repos.filter(r=>!r.private);
  if(S.repoFilter==="private")repos=repos.filter(r=>r.private);
  if(S.repoFilter==="fork")repos=repos.filter(r=>r.fork);
  if(f)repos=repos.filter(r=>r.name.toLowerCase().includes(f)||(r.description||"").toLowerCase().includes(f));
  if(!repos.length){setHtml("reposList",`<div style="padding:32px;text-align:center;color:var(--fa)">No repos found</div>`);return}
  setHtml("reposList",repos.map(r=>`
    <div class="ri">
      <div>
        <span class="ri-name" onclick="openRepo('${r.owner.login}','${r.name}')">${r.full_name}</span>
        <span class="vbadge" style="margin-left:8px">${r.private?"Private":"Public"}</span>
        ${r.fork?`<span class="vbadge" style="margin-left:4px">Fork</span>`:""}
        <div class="ri-desc">${esc(r.description||"")}</div>
        <div class="ri-meta">
          ${r.language?`<span class="ri-m"><span class="ldot ${lc(r.language)}"></span>${r.language}</span>`:""}
          <span class="ri-m">⭐ ${fmt(r.stargazers_count)}</span>
          <span class="ri-m">🍴 ${fmt(r.forks_count)}</span>
          <span class="ri-m">${ta(r.updated_at)}</span>
        </div>
      </div>
      <div class="ri-acts">
        <button class="ibtn" onclick="openRepo('${r.owner.login}','${r.name}')">View</button>
      </div>
    </div>`).join(""))
}
function setPill(el,f){document.querySelectorAll("#tab-repos .pill").forEach(p=>p.classList.remove("active"));el.classList.add("active");S.repoFilter=f;renderRepos()}

// REPO VIEW
async function openRepo(owner,name){
  showTab("repoView");setHtml("rvContent","<div class='sk' style='margin:32px'></div>");
  try{
    const[r,branches]=await Promise.all([api(`/api/github/repos?sort=updated&per_page=100`).then(rs=>(rs||[]).find(x=>x.owner.login===owner&&x.name===name)||api(`/api/my-repos`).then(()=>({owner:{login:owner},name,private:false,stargazers_count:0,forks_count:0,default_branch:"main",description:""}))),
      api(`/api/github/branches?repo_url=${encodeURIComponent("https://github.com/"+owner+"/"+name)}`).catch(()=>({branches:[]}))]);
    const branch=(r?.default_branch)||"main";
    const bList=branches?.branches||[];
    renderRepoView(owner,name,r||{owner:{login:owner},name,private:false,stargazers_count:0,forks_count:0,default_branch:"main",description:""},bList,branch);
    loadGhContents(owner,name,"",branch);
  }catch(e){setHtml("rvContent",`<div style="padding:32px;color:var(--red)">${e.message}</div>`)}
}
function renderRepoView(owner,name,r,branches,branch){
  const bopts=branches.map(b=>`<option value="${b.name}" ${b.name===branch?"selected":""}>${b.name}</option>`).join("")||`<option>${branch}</option>`;
  setHtml("rvContent",`
    <div style="background:var(--bg);border-bottom:1px solid var(--bd);padding:14px 20px">
      <div style="display:flex;align-items:center;gap:6px;font-size:.95rem;margin-bottom:10px;flex-wrap:wrap">
        <span style="color:var(--bl);cursor:pointer" onclick="showTab('repos')">${owner}</span>
        <span style="color:var(--fa)">/</span>
        <span style="font-weight:700;cursor:pointer" onclick="openRepo('${owner}','${name}')">${name}</span>
      </div>
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <span class="vbadge">${r.private?"🔒 Private":"🔓 Public"}</span>
        <span style="font-size:.82rem;color:var(--mu)">⭐ ${fmt(r.stargazers_count)} stars · 🍴 ${fmt(r.forks_count)} forks</span>
        ${r.language?`<span style="font-size:.82rem;color:var(--mu)"><span class="ldot ${lc(r.language)}" style="width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:4px"></span>${r.language}</span>`:""}
      </div>
    </div>
    <div style="display:flex;gap:0;border-bottom:1px solid var(--bd);padding:0 20px;background:var(--bg);overflow-x:auto">
      <div class="rtab active" onclick="setRvTab(this,'code','${owner}','${name}','${branch}')">📁 Code</div>
      <div class="rtab" onclick="setRvTab(this,'commits','${owner}','${name}','${branch}')">🔀 Commits</div>
      <div class="rtab" onclick="setRvTab(this,'issues','${owner}','${name}')">🐛 Issues</div>
      <div class="rtab" onclick="setRvTab(this,'branches2','${owner}','${name}')">🌿 Branches</div>
      <div class="rtab" onclick="setRvTab(this,'collabs2','${owner}','${name}')">👥 Collabs</div>
      <div class="rtab" style="color:var(--red);margin-left:auto" onclick="delGhRepo('${owner}','${name}')">🗑</div>
    </div>
    <div style="max-width:1200px;margin:0 auto;padding:20px" id="rvBody">
      <div id="rvCodeSection">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
          <select class="sel" style="width:auto" onchange="loadGhContents('${owner}','${name}','',this.value)" id="rvBranchSel">${bopts}</select>
          <div id="rvPathBar" style="font-size:.82rem;color:var(--mu);flex:1"></div>
          <button class="btn-gr sm" onclick="promptNewFile('${owner}','${name}','${branch}')">+ File</button>
        </div>
        <div id="rvFileList" style="background:var(--s);border:1px solid var(--bd);border-radius:var(--r2);overflow:hidden"></div>
        <div id="rvReadme"></div>
      </div>
    </div>
  `);
}
function setRvTab(el,tab,owner,name,branch){
  document.querySelectorAll(".rtab").forEach(t=>t.classList.remove("active"));el.classList.add("active");
  const body=document.getElementById("rvBody");if(!body)return;
  if(tab==="code"){body.innerHTML=`<div id="rvCodeSection"><div style="display:flex;gap:8px;align-items:center;margin-bottom:14px"><select class="sel" style="width:auto" id="rvBranchSel"><option>${branch}</option></select><div id="rvPathBar" style="font-size:.82rem;color:var(--mu);flex:1"></div><button class="btn-gr sm" onclick="promptNewFile('${owner}','${name}','${branch}')">+ File</button></div><div id="rvFileList" style="background:var(--s);border:1px solid var(--bd);border-radius:var(--r2);overflow:hidden"></div><div id="rvReadme"></div></div>`;loadGhContents(owner,name,"",branch)}
  else if(tab==="commits"){body.innerHTML=`<div id="rvComm"><div class="sk"></div></div>`;loadRvCommits(owner,name)}
  else if(tab==="issues"){body.innerHTML=`<div style="margin-bottom:12px"><button class="btn-gr" onclick="promptNewIssue('${owner}','${name}')">+ New Issue</button></div><div id="rvIssues"><div class="sk"></div></div>`;loadRvIssues(owner,name)}
  else if(tab==="branches2"){body.innerHTML=`<div style="margin-bottom:12px"><button class="btn-gr" onclick="promptCreateBranch2('${owner}','${name}')">+ New Branch</button></div><div id="rvBranches"><div class="sk"></div></div>`;loadRvBranches(owner,name)}
  else if(tab==="collabs2"){body.innerHTML=`<div style="margin-bottom:12px"><button class="btn-gr" onclick="promptAddCollab2('${owner}','${name}')">+ Add Collaborator</button></div><div id="rvCollabs"><div class="sk"></div></div>`;loadRvCollabs(owner,name)}
}

async function loadGhContents(owner,name,path,branch){
  const wrap=document.getElementById("rvFileList");if(!wrap)return;
  wrap.innerHTML=`<div class="sk" style="margin:12px"></div>`;
  try{
    const r=await fetch(`/api/github/repos?sort=updated&per_page=1`,{headers:{Authorization:"Bearer "+T()}});
    // Use direct GitHub API via our backend
    const res=await fetch(`/api/github/repos?sort=updated&per_page=100`,{headers:{Authorization:"Bearer "+T()}});
    const allRepos=await res.json();
    const repo=allRepos.find(x=>x.owner.login===owner&&x.name===name);
    
    // Fetch contents via GitHub API through our proxy
    const cr=await fetch(`https://api.github.com/repos/${owner}/${name}/contents/${path}`,{headers:{"Authorization":"token "+await getGhToken(),"Accept":"application/vnd.github+json"}});
    if(!cr.ok){wrap.innerHTML=`<div style="padding:20px;color:var(--red)">Could not load files (${cr.status})</div>`;return}
    const items=await cr.json();
    const list=Array.isArray(items)?items:[items];
    const dirs=list.filter(i=>i.type==="dir").sort((a,b)=>a.name.localeCompare(b.name));
    const files=list.filter(i=>i.type==="file").sort((a,b)=>a.name.localeCompare(b.name));
    const sorted=[...dirs,...files];
    let rows=path?`<div class="file-row" onclick="loadGhContents('${owner}','${name}','${pathUp(path)}','${branch}')"><span>📁</span><span>..</span></div>`:"";
    rows+=sorted.map(it=>`<div class="file-row" onclick="${it.type==="dir"?`loadGhContents('${owner}','${name}','${it.path}','${branch}')`:`viewGhFile('${owner}','${name}','${it.path}','${branch}','${it.sha}')`}"><span>${it.type==="dir"?"📁":fIcon(it.name)}</span><span style="color:${it.type==="dir"?"var(--bl)":"var(--t)"}">${it.name}</span><span class="ftype">${it.type==="dir"?"dir":Math.round(it.size/1024*10)/10+" KB"}</span></div>`).join("");
    wrap.innerHTML=rows;
    // Path bar
    const pb=document.getElementById("rvPathBar");if(pb){let bh=`<span style="color:var(--bl);cursor:pointer" onclick="loadGhContents('${owner}','${name}','','${branch}')">${name}</span>`;path.split("/").filter(Boolean).forEach((seg,i,arr)=>{const p2=arr.slice(0,i+1).join("/");bh+=` / <span style="color:var(--bl);cursor:pointer" onclick="loadGhContents('${owner}','${name}','${p2}','${branch}')">${seg}</span>`});pb.innerHTML=bh}
    // README
    const readme=list.find(i=>/readme/i.test(i.name)&&!path);
    if(readme)loadGhReadme(owner,name,readme.path,branch);
  }catch(e){wrap.innerHTML=`<div style="padding:20px;color:var(--red)">${e.message}</div>`}
}
async function getGhToken(){
  try{const d=await api("/api/me");const doc=await fetch("/api/health");// token is stored server-side, we need a way to get it for direct GitHub calls
  // Actually use our backend proxy:
  return "proxy"}catch{return""}
}

async function viewGhFile(owner,name,path,branch,sha){
  const wrap=document.getElementById("rvFileList");if(!wrap)return;
  wrap.innerHTML=`<div class="sk" style="margin:12px"></div>`;
  try{
    const r=await fetch(`https://api.github.com/repos/${owner}/${name}/contents/${path}?ref=${branch}`,{headers:{"Accept":"application/vnd.github+json","Authorization":"token "+await getGhTokenDirect()}});
    const d=await r.json();
    const content=d.content?atob(d.content.replace(/\n/g,"")):"(binary)";
    wrap.innerHTML=`<div style="padding:10px 14px;border-bottom:1px solid var(--bd);background:var(--s2);display:flex;gap:8px;align-items:center">
      <span style="font-weight:500">${path.split("/").pop()}</span><span style="flex:1;color:var(--fa);font-size:.75rem">${Math.round(d.size/1024*10)/10} KB</span>
      <button class="btn-ol sm" onclick="editGhFile('${owner}','${name}','${path}','${branch}','${d.sha}')">✏️ Edit</button>
      <button class="btn-rd sm" onclick="delGhFile('${owner}','${name}','${path}','${branch}','${d.sha}')">🗑</button>
      <button class="btn-ol sm" onclick="loadGhContents('${owner}','${name}','${pathUp(path)}','${branch}')">← Back</button>
    </div><pre style="padding:16px;font-family:var(--fm);font-size:.78rem;line-height:1.7;overflow:auto;max-height:500px;color:var(--t);background:var(--bg)">${esc(content)}</pre>`;
  }catch(e){wrap.innerHTML=`<div style="padding:20px;color:var(--red)">${e.message}</div>`}
}
async function getGhTokenDirect(){
  // We need to expose token to frontend or use backend proxy
  // Let's use a cached approach
  if(window._ghToken)return window._ghToken;
  // Store token in window after first fetch via a dedicated endpoint
  try{const r=await fetch("/api/github/profile",{headers:{Authorization:"Bearer "+T()}});
    if(r.ok){window._ghToken="proxy";return "proxy"}}catch{}
  return "";
}

function promptNewFile(owner,name,branch){
  const path=prompt("File path (e.g. src/hello.py):");if(!path)return;
  const content=prompt("File content:");if(content===null)return;
  const message=prompt("Commit message:","Add "+path.split("/").pop())||"Add file";
  createGhFile(owner,name,path,content,message,branch);
}
async function createGhFile(owner,name,path,content,message,branch){
  try{
    const r=await fetch(`/api/workspace/file-gh`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+T()},body:JSON.stringify({owner,name,path,content,message,branch})});
    const d=await r.json();
    toast(r.ok?"✅ File created!":"❌ "+d.detail,"ok");
    if(r.ok)loadGhContents(owner,name,pathUp(path),branch);
  }catch(e){toast(e.message,"err")}
}
function editGhFile(owner,name,path,branch,sha){
  const newContent=prompt("Edit content (paste new content):");if(newContent===null)return;
  const message=prompt("Commit message:","Update "+path.split("/").pop())||"Update file";
  fetch("/api/workspace/file-gh",{method:"PUT",headers:{"Content-Type":"application/json",Authorization:"Bearer "+T()},body:JSON.stringify({owner,name,path,content:newContent,message,branch,sha})}).then(r=>r.json()).then(d=>{toast(d.ok?"✅ Updated!":"❌ "+d.detail,"ok");loadGhContents(owner,name,pathUp(path),branch)}).catch(e=>toast(e.message,"err"));
}
function delGhFile(owner,name,path,branch,sha){
  if(!confirm("Delete "+path+"?"))return;
  const msg=prompt("Commit message:","Delete "+path.split("/").pop())||"Delete file";
  fetch(`/api/workspace/file-gh?owner=${owner}&name=${name}&path=${encodeURIComponent(path)}&sha=${sha}&message=${encodeURIComponent(msg)}&branch=${branch}`,{method:"DELETE",headers:{Authorization:"Bearer "+T()}}).then(()=>{toast("✅ Deleted");loadGhContents(owner,name,pathUp(path),branch)}).catch(e=>toast(e.message,"err"));
}
async function loadGhReadme(owner,name,path,branch){
  try{const r=await fetch(`https://api.github.com/repos/${owner}/${name}/contents/${path}?ref=${branch}`,{headers:{"Accept":"application/vnd.github+json","Authorization":"token "+await getGhTokenDirect()}});
    const d=await r.json();const content=d.content?atob(d.content.replace(/\n/g,"")):"";
    const el=document.getElementById("rvReadme");if(el)el.innerHTML=`<div style="margin-top:16px;background:var(--s);border:1px solid var(--bd);border-radius:var(--r2);overflow:hidden"><div style="padding:10px 16px;background:var(--s2);border-bottom:1px solid var(--bd);font-weight:600;font-size:.85rem">📖 README.md</div><pre style="padding:16px;font-family:var(--fm);font-size:.78rem;line-height:1.7;overflow:auto;color:var(--t)">${esc(content)}</pre></div>`;
  }catch{}
}
async function loadRvCommits(owner,name){
  try{const d=await api(`/api/github/repos/${owner}/${name}/commits?per_page=20`);
    setHtml("rvComm",`<div style="display:flex;flex-direction:column">${(d?.commits||"").split("\n\n").filter(Boolean).slice(0,20).map(l=>`<div style="padding:12px 0;border-top:1px solid var(--bd);font-size:.85rem;font-family:var(--fm)">${esc(l)}</div>`).join("")||`<div style="color:var(--fa);padding:24px;text-align:center">No commits data</div>`}</div>`)}
  catch(e){setHtml("rvComm",`<div style="color:var(--red)">${e.message}</div>`)}
}
async function loadRvIssues(owner,name){
  try{const url=`https://github.com/${owner}/${name}`;
    const d=await api(`/api/github/issues?repo_url=${encodeURIComponent(url)}&state=open`);
    setHtml("rvIssues",Array.isArray(d)&&d.length?d.map(i=>`<div style="padding:12px 0;border-top:1px solid var(--bd);display:flex;gap:10px;align-items:flex-start">
      <div style="color:var(--grt);margin-top:2px">●</div>
      <div style="flex:1"><div style="font-size:.88rem;font-weight:500">${esc(i.title)}</div>
        <div style="font-size:.75rem;color:var(--fa)">#${i.number} · ${ta(i.created_at)} by ${i.user.login}</div></div>
      <button class="btn-rd sm" onclick="closeRvIssue('${owner}','${name}',${i.number})">Close</button>
    </div>`).join(""):`<div style="padding:32px;text-align:center;color:var(--fa)">🎉 No open issues</div>`)}
  catch(e){setHtml("rvIssues",`<div style="color:var(--red)">${e.message}</div>`)}
}
async function closeRvIssue(owner,name,num){
  try{await api(`/api/github/issues?repo_url=${encodeURIComponent("https://github.com/"+owner+"/"+name)}`,{method:"POST",body:JSON.stringify({title:"",body:""})});toast("Closed");loadRvIssues(owner,name)}
  catch(e){toast(e.message,"err")}
}
function promptNewIssue(owner,name){const t=prompt("Issue title:");if(!t)return;const b=prompt("Description (optional):")||"";
  api(`/api/github/issues?repo_url=${encodeURIComponent("https://github.com/"+owner+"/"+name)}`,{method:"POST",body:JSON.stringify({title:t,body:b})}).then(()=>{toast("✅ Issue created!");loadRvIssues(owner,name)}).catch(e=>toast(e.message,"err"))
}
async function loadRvBranches(owner,name){
  try{const d=await api(`/api/github/branches?repo_url=${encodeURIComponent("https://github.com/"+owner+"/"+name)}`);
    setHtml("rvBranches",(d?.branches||[]).map(b=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid var(--bd)">
      <span style="font-size:.88rem;font-weight:500">🌿 ${b.name}</span>
      <button class="btn-rd sm" onclick="delRvBranch('${owner}','${name}','${b.name}')">Delete</button>
    </div>`).join("")||`<div style="padding:24px;text-align:center;color:var(--fa)">No branches</div>`)}
  catch(e){setHtml("rvBranches",`<div style="color:var(--red)">${e.message}</div>`)}
}
function promptCreateBranch2(owner,name){const n=prompt("New branch name:");if(!n)return;const f=prompt("From branch:","main")||"main";
  api("/api/github/branches",{method:"POST",body:JSON.stringify({repo_url:"https://github.com/"+owner+"/"+name,name:n,from_branch:f})}).then(d=>{toast(d.ok?"✅ Branch created!":"❌ "+d.message,d.ok?"ok":"err");loadRvBranches(owner,name)}).catch(e=>toast(e.message,"err"))
}
function delRvBranch(owner,name,branch){if(!confirm("Delete branch "+branch+"?"))return;
  api(`/api/github/branches?repo_url=${encodeURIComponent("https://github.com/"+owner+"/"+name)}&branch=${branch}`,{method:"DELETE"}).then(d=>{toast(d.ok?"✅ Deleted":"❌ "+d.message,d.ok?"ok":"err");loadRvBranches(owner,name)}).catch(e=>toast(e.message,"err"))
}
async function loadRvCollabs(owner,name){
  try{const d=await api(`/api/github/collaborators?repo_url=${encodeURIComponent("https://github.com/"+owner+"/"+name)}`);
    setHtml("rvCollabs",(d?.collaborators||[]).map(c=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid var(--bd)">
      <div style="display:flex;align-items:center;gap:8px"><img src="${c.avatar_url}" style="width:28px;height:28px;border-radius:50%;border:1px solid var(--bd)"><span style="font-size:.85rem">${c.login}</span></div>
      <button class="btn-rd sm" onclick="removeRvCollab('${owner}','${name}','${c.login}')">Remove</button>
    </div>`).join("")||`<div style="padding:24px;text-align:center;color:var(--fa)">No collaborators</div>`)}
  catch(e){setHtml("rvCollabs",`<div style="color:var(--red)">${e.message}</div>`)}
}
function promptAddCollab2(owner,name){const u=prompt("GitHub username:");if(!u)return;
  api("/api/github/collaborators",{method:"POST",body:JSON.stringify({repo_url:"https://github.com/"+owner+"/"+name,username:u})}).then(d=>{toast(d.ok?"✅ Added!":"❌ "+d.message,d.ok?"ok":"err");loadRvCollabs(owner,name)}).catch(e=>toast(e.message,"err"))
}
function removeRvCollab(owner,name,user){if(!confirm("Remove "+user+"?"))return;
  api(`/api/github/collaborators?repo_url=${encodeURIComponent("https://github.com/"+owner+"/"+name)}&username=${user}`,{method:"DELETE"}).then(d=>{toast(d.ok?"✅ Removed":"❌ "+d.message,d.ok?"ok":"err");loadRvCollabs(owner,name)}).catch(e=>toast(e.message,"err"))
}
function delGhRepo(owner,name){
  if(!confirm(`⚠️ DELETE ${owner}/${name} from GitHub permanently?`))return;
  if(prompt("Type repo name to confirm:")!==name)return toast("Cancelled");
  api(`/api/github/repos?url=${encodeURIComponent("https://github.com/"+owner+"/"+name)}`,{method:"DELETE"}).then(d=>{toast(d.ok?"✅ Deleted!":"❌ "+d.message,d.ok?"ok":"err");if(d.ok)showTab("repos")}).catch(e=>toast(e.message,"err"))
}

// CREATE REPO
async function createRepo(){
  const name=document.getElementById("nrName").value.trim().replace(/\s+/g,"-"),desc=document.getElementById("nrDesc").value.trim(),priv=document.querySelector('input[name="nrVis"]:checked').value==="private",init=document.getElementById("nrInit").checked;
  if(!name){toast("Enter a name","err");return}
  try{const d=await api("/api/github/repos",{method:"POST",body:JSON.stringify({name,description:desc,private:priv,auto_init:init})});
    closeM("newRepoM");toast("✅ Repo created!");if(d.url){const p=d.url.replace("https://github.com/","").split("/");openRepo(p[0],p[1])}}
  catch(e){toast(e.message,"err")}
}

// WORKSPACE
async function loadWorkspace(){
  try{const d=await api("/api/workspace");if(!d)return;S.wsData=d.folders;renderWsFolders(d.folders);populateFolderSelects(d.folders)}catch{}
}
function renderWsFolders(folders){
  if(!folders.length){setHtml("wsFolders",`<div style="color:var(--fa);font-size:.82rem;padding:16px">Workspace empty — clone a repo first!</div>`);return}
  setHtml("wsFolders",`<div class="ws-folders-list">${folders.map(f=>`<div class="wf-item">
    <div><div class="wf-name">📁 ${f.name}</div><div class="wf-meta">${f.size_kb} KB · ${f.is_git?"git repo":"folder"}</div></div>
    <div class="wf-acts"><button class="ibtn" onclick="showFolderTree('${f.name}')">View</button><button class="btn-rd sm" onclick="delWsFolder('${f.name}')">Delete</button></div>
  </div>`).join("")}</div>`)
}
function populateFolderSelects(folders){
  const ids=["pushFolder","pullFolder","zipFolder","fmBrowseFolder","fmWFolder","fmMFolder","fmEFolder","fmDFolder","fmGrepFolder","fmReplFolder","rndOld","rnpFolder","brFolder"];
  const opts=folders.map(f=>`<option value="${f.name}">${f.name}</option>`).join("")||"<option value=''>No folders</option>";
  ids.forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=opts});
}
function loadFolderSelects(){loadWorkspace()}
async function showFolderTree(folder){
  try{const d=await api(`/api/workspace/${folder}/tree`);alert("📁 "+folder+":\n\n"+(d?.tree||"(empty)"))}
  catch(e){toast(e.message,"err")}
}
async function delWsFolder(name){if(!confirm("Delete workspace folder '"+name+"'? This cannot be undone."))return;
  try{await api(`/api/workspace/${name}`,{method:"DELETE"});toast("✅ Deleted");loadWorkspace()}
  catch(e){toast(e.message,"err")}
}
async function doClone(){
  const url=document.getElementById("cloneUrl").value.trim(),useToken=document.getElementById("cloneToken").checked;
  if(!url){toast("Enter URL","err");return}
  const res=document.getElementById("cloneRes");res.className="res-box";show("cloneRes");res.textContent="⏳ Cloning...";
  try{const d=await api("/api/workspace/clone",{method:"POST",body:JSON.stringify({url,use_token:useToken})});
    res.textContent=d.message;res.className="res-box "+(d.ok?"ok":"err");if(d.ok)loadWorkspace()}
  catch(e){res.textContent=e.message;res.className="res-box err"}
}
async function doPush(){
  const folder=document.getElementById("pushFolder").value,url=document.getElementById("pushUrl").value.trim(),branch=document.getElementById("pushBranch").value.trim()||"main";
  if(!folder||!url){toast("Fill all fields","err");return}
  const res=document.getElementById("pushRes");res.className="res-box";show("pushRes");res.textContent="⏳ Pushing...";
  try{const d=await api("/api/workspace/push",{method:"POST",body:JSON.stringify({folder,repo_url:url,branch})});
    res.textContent=d.message;res.className="res-box "+(d.ok?"ok":"err")}
  catch(e){res.textContent=e.message;res.className="res-box err"}
}
async function doPull(){
  const folder=document.getElementById("pullFolder").value,url=document.getElementById("pullUrl").value.trim();
  if(!folder){toast("Select a folder","err");return}
  const res=document.getElementById("pullRes");res.className="res-box";show("pullRes");res.textContent="⏳ Pulling...";
  try{const d=await api("/api/workspace/pull",{method:"POST",body:JSON.stringify({folder,repo_url:url})});
    res.textContent=d.message;res.className="res-box "+(d.ok?"ok":"err")}
  catch(e){res.textContent=e.message;res.className="res-box err"}
}
async function doUploadZip(){
  const file=document.getElementById("zipFile").files[0],url=document.getElementById("zipRepoUrl").value.trim(),branch=document.getElementById("zipBranch").value.trim()||"main";
  if(!file||!url){toast("Select file and enter URL","err");return}
  const res=document.getElementById("zipRes");res.className="res-box";show("zipRes");res.textContent="⏳ Uploading & pushing...";
  const fd=new FormData();fd.append("file",file);fd.append("repo_url",url);fd.append("branch",branch);
  try{const r=await fetch("/api/workspace/upload-zip",{method:"POST",headers:{Authorization:"Bearer "+T()},body:fd});
    const d=await r.json();res.textContent=d.message;res.className="res-box "+(d.ok?"ok":"err")}
  catch(e){res.textContent=e.message;res.className="res-box err"}
}
async function doMakeZip(){
  const folder=document.getElementById("zipFolder").value;if(!folder){toast("Select a folder","err");return}
  toast("⏳ Creating ZIP...");
  try{const r=await fetch(`/api/workspace/make-zip`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+T()},body:JSON.stringify({folder})});
    if(!r.ok){const e=await r.json();toast(e.detail||"Failed","err");return}
    const blob=await r.blob();const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=folder+".zip";a.click();toast("✅ Download started!")}
  catch(e){toast(e.message,"err")}
}

// FILE MANAGER
function loadFmFolders(){loadWorkspace();loadFmBrowse()}
async function loadFmBrowse(){
  const folder=document.getElementById("fmBrowseFolder")?.value;if(!folder)return;
  const path=S.fmBrowsePath||"";
  try{const d=await api(`/api/workspace/${folder}/files?path=${encodeURIComponent(path)}`);
    if(!d)return;setHtml("fmBrowseList",d.items.map(it=>`<div class="file-row" onclick="${it.type==="dir"?`browseFmDir('${folder}','${path?path+"/":""}${it.name}')`:`viewFmFile('${folder}','${path?path+"/":""}${it.name}')`}">
      <span>${it.type==="dir"?"📁":fIcon(it.name)}</span><span>${it.name}</span>
      <span class="ftype">${it.type==="dir"?"dir":(it.size/1024).toFixed(1)+" KB"}</span></div>`).join("")||`<div style="padding:16px;color:var(--fa);font-size:.82rem">Empty folder</div>`);
    document.getElementById("fmBrowsePath").textContent=folder+(path?"/"+path:"")}
  catch(e){setHtml("fmBrowseList",`<div style="color:var(--red);padding:12px">${e.message}</div>`)}
}
function browseFmDir(folder,path){S.fmBrowsePath=path;document.getElementById("fmBrowseFolder").value=folder;loadFmBrowse()}
async function viewFmFile(folder,path){
  try{const d=await api(`/api/workspace/${folder}/read?path=${encodeURIComponent(path)}`);alert(`📄 ${path}\n\n${d.content}`)}
  catch(e){toast(e.message,"err")}
}
async function doWriteFile(){
  const folder=document.getElementById("fmWFolder").value,path=document.getElementById("fmWPath").value.trim(),content=document.getElementById("fmWContent").value;
  if(!folder||!path){toast("Fill folder and path","err");return}
  const res=document.getElementById("fmWRes");res.className="res-box";show("fmWRes");
  try{const d=await api("/api/fm/write-file",{method:"POST",body:JSON.stringify({folder,path,content})});res.textContent=d.message;res.className="res-box "+(d.ok?"ok":"err")}
  catch(e){res.textContent=e.message;res.className="res-box err"}
}
function addMultiRow(){const c=document.getElementById("multiFilesList");c.insertAdjacentHTML("beforeend",`<div class="multi-file"><input type="text" placeholder="path/file.py" class="mf-path"><textarea rows="3" placeholder="content..." class="mf-content code-ta"></textarea></div>`)}
async function doMultiWrite(){
  const folder=document.getElementById("fmMFolder").value;if(!folder){toast("Select folder","err");return}
  const files={};document.querySelectorAll(".multi-file").forEach(row=>{const p=row.querySelector(".mf-path").value.trim(),c=row.querySelector(".mf-content").value;if(p)files[p]=c});
  if(!Object.keys(files).length){toast("Add at least one file","err");return}
  const res=document.getElementById("fmMRes");res.className="res-box";show("fmMRes");
  try{const d=await api("/api/fm/multi-write",{method:"POST",body:JSON.stringify({folder,files})});res.textContent=d.results.map(r=>(r.ok?"✅":"❌")+" "+r.path+" — "+r.message).join("\n");res.className="res-box ok"}
  catch(e){res.textContent=e.message;res.className="res-box err"}
}
async function doEditLine(){
  const folder=document.getElementById("fmEFolder").value,path=document.getElementById("fmEPath").value.trim(),line=parseInt(document.getElementById("fmELine").value),content=document.getElementById("fmEContent").value;
  if(!folder||!path||!line){toast("Fill all fields","err");return}
  const res=document.getElementById("fmERes");res.className="res-box";show("fmERes");
  try{const d=await api("/api/fm/edit-line",{method:"POST",body:JSON.stringify({folder,path,line_num:line,new_line:content})});res.textContent=d.message;res.className="res-box "+(d.ok?"ok":"err")}
  catch(e){res.textContent=e.message;res.className="res-box err"}
}
async function doDeletePaths(){
  const folder=document.getElementById("fmDFolder").value,raw=document.getElementById("fmDPaths").value.trim();
  if(!folder||!raw){toast("Fill all fields","err");return}
  const paths=raw.split("\n").map(s=>s.trim()).filter(Boolean);
  if(!confirm("Delete "+paths.length+" path(s)?"))return;
  const res=document.getElementById("fmDRes");res.className="res-box";show("fmDRes");
  try{const d=await api("/api/fm/delete-paths",{method:"POST",body:JSON.stringify({folder,paths})});res.textContent=d.results.map(r=>(r.ok?"✅":"❌")+" "+r.path).join("\n");res.className="res-box ok"}
  catch(e){res.textContent=e.message;res.className="res-box err"}
}
async function doGrep(){
  const folder=document.getElementById("fmGrepFolder").value,text=document.getElementById("grepText").value.trim(),py=document.getElementById("grepPy").checked;
  if(!folder||!text){toast("Fill all fields","err");return}
  const res=document.getElementById("grepRes");res.className="res-box";show("grepRes");res.textContent="🔍 Searching...";
  try{const d=await api("/api/fm/grep",{method:"POST",body:JSON.stringify({folder,search:text,only_py:py})});res.textContent=d.result||"No matches";res.className="res-box ok"}
  catch(e){res.textContent=e.message;res.className="res-box err"}
}
async function doReplace(){
  const folder=document.getElementById("fmReplFolder").value,old=document.getElementById("replOld").value,nw=document.getElementById("replNew").value,py=document.getElementById("replPy").checked;
  if(!folder||!old){toast("Fill all fields","err");return}
  if(!confirm(`Replace all "${old}" with "${nw}"?`))return;
  const res=document.getElementById("replRes");res.className="res-box";show("replRes");
  try{const d=await api("/api/fm/replace",{method:"POST",body:JSON.stringify({folder,old_text:old,new_text:nw,only_py:py})});res.textContent=d.result;res.className="res-box "+(d.ok?"ok":"err")}
  catch(e){res.textContent=e.message;res.className="res-box err"}
}
async function doRenameDir(){
  const old=document.getElementById("rndOld").value,nw=document.getElementById("rndNew").value.trim();
  if(!old||!nw){toast("Fill all fields","err");return}
  const res=document.getElementById("rndRes");res.className="res-box";show("rndRes");
  try{const d=await api("/api/fm/rename-dir",{method:"POST",body:JSON.stringify({old_name:old,new_name:nw})});res.textContent=d.message;res.className="res-box "+(d.ok?"ok":"err");if(d.ok)loadWorkspace()}
  catch(e){res.textContent=e.message;res.className="res-box err"}
}
async function doRenamePath(){
  const folder=document.getElementById("rnpFolder").value,old=document.getElementById("rnpOld").value.trim(),nw=document.getElementById("rnpNew").value.trim();
  if(!folder||!old||!nw){toast("Fill all fields","err");return}
  const res=document.getElementById("rnpRes");res.className="res-box";show("rnpRes");
  try{const d=await api("/api/fm/rename-path",{method:"POST",body:JSON.stringify({folder,old_path:old,new_path:nw})});res.textContent=d.message;res.className="res-box "+(d.ok?"ok":"err")}
  catch(e){res.textContent=e.message;res.className="res-box err"}
}
async function doBulkRename(){
  const folder=document.getElementById("brFolder").value,pat=document.getElementById("brPattern").value.trim(),pre=document.getElementById("brPrefix").value,suf=document.getElementById("brSuffix").value,from=document.getElementById("brFrom").value,to2=document.getElementById("brTo").value;
  if(!folder||!pat){toast("Fill folder and pattern","err");return}
  const res=document.getElementById("brRes");res.className="res-box";show("brRes");
  try{const d=await api("/api/fm/bulk-rename",{method:"POST",body:JSON.stringify({folder,pattern:pat,prefix:pre,suffix:suf,replace_from:from,replace_to:to2})});res.textContent=d.result;res.className="res-box "+(d.ok?"ok":"err")}
  catch(e){res.textContent=e.message;res.className="res-box err"}
}

// BRANCHES (dedicated tab)
async function loadBranchRepoSelect(){
  const mr=await api("/api/my-repos").catch(()=>null);const repos=mr?.repos||[];
  const sel=document.getElementById("branchRepo");if(!sel)return;
  sel.innerHTML=repos.map(r=>`<option value="${r.url}">${r.name||r.url.split("/").pop()}</option>`).join("")||"<option>No repos in list</option>";
  if(repos.length)loadBranches();
}
async function loadBranches(){
  const url=document.getElementById("branchRepo")?.value;if(!url)return;S.branchRepoUrl=url;
  setHtml("branchesList","<div class='sk'></div>");
  try{const d=await api(`/api/github/branches?repo_url=${encodeURIComponent(url)}`);
    setHtml("branchesList",(d?.branches||[]).map(b=>`<div class="branch-item">
      <span style="font-size:.88rem;font-weight:500">🌿 ${b.name}</span>
      <button class="btn-rd sm" onclick="deleteBranch('${b.name}')">Delete</button>
    </div>`).join("")||`<div style="padding:16px;color:var(--fa)">No branches</div>`)}
  catch(e){setHtml("branchesList",`<div style="color:var(--red)">${e.message}</div>`)}
}
async function doCreateBranch(){
  const url=S.branchRepoUrl,name=document.getElementById("newBrName").value.trim(),from=document.getElementById("newBrFrom").value.trim()||"main";
  if(!url||!name){toast("Fill all fields","err");return}
  const res=document.getElementById("brCreateRes");res.className="res-box";show("brCreateRes");
  try{const d=await api("/api/github/branches",{method:"POST",body:JSON.stringify({repo_url:url,name,from_branch:from})});res.textContent=d.message;res.className="res-box "+(d.ok?"ok":"err");if(d.ok)loadBranches()}
  catch(e){res.textContent=e.message;res.className="res-box err"}
}
async function deleteBranch(name){if(!confirm("Delete branch "+name+"?"))return;
  try{const d=await api(`/api/github/branches?repo_url=${encodeURIComponent(S.branchRepoUrl)}&branch=${name}`,{method:"DELETE"});toast(d.ok?"✅ Deleted":"❌ "+d.message,d.ok?"ok":"err");loadBranches()}
  catch(e){toast(e.message,"err")}
}
async function doMerge(){
  const url=S.branchRepoUrl,head=document.getElementById("mergeHead").value.trim(),base=document.getElementById("mergeBase").value.trim(),msg=document.getElementById("mergeMsg").value.trim();
  if(!url||!head||!base){toast("Fill all fields","err");return}
  const res=document.getElementById("mergeRes");res.className="res-box";show("mergeRes");
  try{const d=await api("/api/github/branches/merge",{method:"POST",body:JSON.stringify({repo_url:url,head,base,message:msg||"Merge via GitHub Manager"})});res.textContent=d.message;res.className="res-box "+(d.ok?"ok":"err")}
  catch(e){res.textContent=e.message;res.className="res-box err"}
}

// COLLABORATORS (dedicated tab)
async function loadCollabRepoSelect(){
  const mr=await api("/api/my-repos").catch(()=>null);const repos=mr?.repos||[];
  const sel=document.getElementById("collabRepo");if(!sel)return;
  sel.innerHTML=repos.map(r=>`<option value="${r.url}">${r.name||r.url.split("/").pop()}</option>`).join("")||"<option>No repos in list</option>";
  if(repos.length)loadCollabs();
}
async function loadCollabs(){
  const url=document.getElementById("collabRepo")?.value;if(!url)return;S.collabRepoUrl=url;
  setHtml("collabsList","<div class='sk'></div>");
  try{const d=await api(`/api/github/collaborators?repo_url=${encodeURIComponent(url)}`);
    setHtml("collabsList",(d?.collaborators||[]).map(c=>`<div class="collab-item">
      <div style="display:flex;align-items:center;gap:8px"><img src="${c.avatar_url}" style="width:28px;height:28px;border-radius:50%"><span style="font-size:.85rem">${c.login}</span></div>
      <button class="btn-rd sm" onclick="removeCollab('${c.login}')">Remove</button>
    </div>`).join("")||`<div style="padding:16px;color:var(--fa)">No collaborators</div>`)}
  catch(e){setHtml("collabsList",`<div style="color:var(--red)">${e.message}</div>`)}
}
async function doAddCollab(){
  const url=S.collabRepoUrl,user=document.getElementById("collabUser").value.trim(),perm=document.getElementById("collabPerm").value;
  if(!url||!user){toast("Fill all fields","err");return}
  const res=document.getElementById("collabAddRes");res.className="res-box";show("collabAddRes");
  try{const d=await api("/api/github/collaborators",{method:"POST",body:JSON.stringify({repo_url:url,username:user,permission:perm})});res.textContent=d.message;res.className="res-box "+(d.ok?"ok":"err");if(d.ok)loadCollabs()}
  catch(e){res.textContent=e.message;res.className="res-box err"}
}
async function doRemoveCollab(){
  const url=S.collabRepoUrl,user=document.getElementById("collabRemUser").value.trim();
  if(!url||!user){toast("Fill all fields","err");return}
  if(!confirm("Remove "+user+"?"))return;
  const res=document.getElementById("collabRemRes");res.className="res-box";show("collabRemRes");
  try{const d=await api(`/api/github/collaborators?repo_url=${encodeURIComponent(url)}&username=${user}`,{method:"DELETE"});res.textContent=d.message;res.className="res-box "+(d.ok?"ok":"err");if(d.ok)loadCollabs()}
  catch(e){res.textContent=e.message;res.className="res-box err"}
}
async function removeCollab(user){if(!confirm("Remove "+user+"?"))return;
  try{const d=await api(`/api/github/collaborators?repo_url=${encodeURIComponent(S.collabRepoUrl)}&username=${user}`,{method:"DELETE"});toast(d.ok?"✅ Removed":"❌ "+d.message,d.ok?"ok":"err");loadCollabs()}
  catch(e){toast(e.message,"err")}
}
function loadMyRepoSelects(){loadCollabRepoSelect();loadBranchRepoSelect()}

// GISTS
async function loadGists(){
  setHtml("gistsList","<div class='sk'></div><div class='sk'></div>");
  try{const d=await api("/api/github/gists");if(!d)return;
    setHtml("gistsList",d.gists?.map(g=>{const files=Object.keys(g.files||{});return`<div class="gi">
      <div class="gi-name" onclick="viewGist('${g.id}')">${files[0]||g.id.slice(0,12)}</div>
      ${g.description?`<div class="gi-desc">${esc(g.description)}</div>`:""}
      <div class="gi-meta"><span>${g.public?"🔓 Public":"🔒 Secret"}</span><span>${files.length} file(s)</span><span>${ta(g.updated_at)}</span><a href="${g.html_url}" target="_blank" style="color:var(--bl)">GitHub ↗</a></div>
      <div style="display:flex;gap:6px"><button class="btn-rd sm" onclick="delGist('${g.id}')">🗑 Delete</button></div>
    </div>`}).join("")||`<div style="padding:32px;text-align:center;color:var(--fa)">No gists yet</div>`)}
  catch(e){setHtml("gistsList",`<div style="color:var(--red);padding:24px">${e.message}</div>`)}
}
async function viewGist(id){
  try{const d=await api(`/api/github/gists/${id}`);const file=Object.values(d.gist?.files||{})[0];alert(`📎 ${file?.filename||id}\n\n${file?.content||""}`)}
  catch(e){toast(e.message,"err")}
}
async function createGist(){
  const desc=document.getElementById("gDesc").value.trim(),file=document.getElementById("gFile").value.trim(),content=document.getElementById("gContent").value,pub=document.getElementById("gPub").checked;
  if(!file){toast("Enter filename","err");return}if(!content){toast("Enter content","err");return}
  try{const d=await api("/api/github/gists",{method:"POST",body:JSON.stringify({filename:file,content,description:desc,public:pub})});closeM("newGistM");toast("✅ Gist created!");loadGists()}
  catch(e){toast(e.message,"err")}
}
async function delGist(id){if(!confirm("Delete this gist?"))return;
  try{await api(`/api/github/gists/${id}`,{method:"DELETE"});toast("Gist deleted");loadGists()}
  catch(e){toast(e.message,"err")}
}

// STARRED
async function loadStarred(){
  setHtml("starredList","<div class='sk'></div><div class='sk'></div>");
  try{const d=await api("/api/github/starred");if(!d)return;
    setHtml("starredList",d.map?d.map(r=>`<div class="ri"><div>
      <span class="ri-name" onclick="window.open('${r.html_url}','_blank')">${r.full_name}</span>
      ${r.description?`<div class="ri-desc">${esc(r.description)}</div>`:""}
      <div class="ri-meta"><span class="ri-m">⭐ ${fmt(r.stargazers_count)}</span>${r.language?`<span class="ri-m"><span class="ldot ${lc(r.language)}"></span>${r.language}</span>`:""}</div>
    </div><div class="ri-acts"><button class="ibtn" onclick="unstar('${r.owner.login}','${r.name}',this)">⭐ Starred</button></div></div>`).join(""):""||`<div style="padding:32px;text-align:center;color:var(--fa)">No starred repos</div>`)}
  catch(e){setHtml("starredList",`<div style="color:var(--red);padding:24px">${e.message}</div>`)}
}
async function unstar(owner,name,btn){
  try{await api(`/api/github/starred/${owner}/${name}`,{method:"DELETE"});btn.textContent="☆ Star";toast("Unstarred")}
  catch(e){toast(e.message,"err")}
}

// NOTIFICATIONS
async function loadNotifs(){
  try{const d=await api("/api/github/notifications");if(!d)return;
    const count=Array.isArray(d)?d.length:0;const badge=document.getElementById("nBadge");
    if(badge){badge.textContent=count>9?"9+":String(count);badge.classList.toggle("hid",count===0)}
    const el=document.getElementById("notifList");if(!el)return;
    setHtml("notifList",Array.isArray(d)&&d.length?d.map(n=>`<div class="ni"><div class="ndot ${n.unread?"":"rd"}"></div><div style="flex:1"><div style="font-size:.75rem;color:var(--fa)">${n.repository.full_name}</div><div style="font-size:.88rem">${esc(n.subject.title)}</div><div style="font-size:.72rem;color:var(--fa)">${n.subject.type} · ${ta(n.updated_at)}</div></div></div>`).join(""):`<div style="padding:32px;text-align:center;color:var(--fa)">🎉 All caught up!</div>`)}
  catch{}
}

// PROFILE
async function loadProfile(){
  setHtml("profileContent","<div class='sk' style='margin:32px'></div>");
  try{const[p,repos]=await Promise.all([api("/api/github/profile"),api("/api/github/repos?sort=updated&per_page=6")]);
    if(!p)return;
    setHtml("profileContent",`<div class="prof-wrap"><div class="prof-side">
      <img class="prof-av" src="${p.avatar_url}" alt="">
      <div class="prof-name">${esc(p.name||p.login)}</div><div class="prof-login">${p.login}</div>
      ${p.bio?`<div class="prof-bio">${esc(p.bio)}</div>`:""}
      <button class="edit-prof" onclick="editProfile()">Edit profile</button>
      <div class="prof-stats"><div class="prof-stat"><b>${fmt(p.followers)}</b> followers</div><div class="prof-stat"><b>${fmt(p.following)}</b> following</div></div>
      <div class="prof-meta">
        ${p.company?`<div class="prof-mi">🏢 ${esc(p.company)}</div>`:""}
        ${p.location?`<div class="prof-mi">📍 ${esc(p.location)}</div>`:""}
        ${p.blog?`<div class="prof-mi">🔗 <a href="${p.blog}" target="_blank" style="color:var(--bl)">${p.blog}</a></div>`:""}
        ${p.twitter_username?`<div class="prof-mi">🐦 @${p.twitter_username}</div>`:""}
        <div class="prof-mi">📅 Joined ${new Date(p.created_at).toLocaleDateString("en",{month:"long",year:"numeric"})}</div>
      </div>
    </div><div><div class="hs-title">Repositories</div><div class="rlist">${
      (repos||[]).slice(0,6).map(r=>`<div class="ri"><div><span class="ri-name" onclick="openRepo('${r.owner.login}','${r.name}')">${r.name}</span><span class="vbadge" style="margin-left:8px">${r.private?"Private":"Public"}</span>${r.description?`<div class="ri-desc">${esc(r.description)}</div>`:""}<div class="ri-meta">${r.language?`<span class="ri-m"><span class="ldot ${lc(r.language)}"></span>${r.language}</span>`:""}<span class="ri-m">⭐ ${fmt(r.stargazers_count)}</span></div></div></div>`).join("")
    }</div></div></div>`)}
  catch(e){setHtml("profileContent",`<div style="padding:32px;color:var(--red)">${e.message}</div>`)}
}
function editProfile(){
  api("/api/github/profile").then(p=>{if(!p)return;
    const name=prompt("Name:",p.name||"");if(name===null)return;
    const bio=prompt("Bio:",p.bio||"");if(bio===null)return;
    const loc=prompt("Location:",p.location||"");const blog=prompt("Website:",p.blog||"");const tw=prompt("Twitter username:",p.twitter_username||"");
    return api("/api/github/profile",{method:"PATCH",body:JSON.stringify({name:name||null,bio:bio||null,location:loc||null,blog:blog||null,twitter_username:tw||null})})
  }).then(d=>{if(d)toast("✅ Profile updated!");loadProfile()}).catch(e=>toast(e.message,"err"))
}

// LOGS
async function loadLogs(){
  setHtml("logsList","<div class='sk'></div>");
  try{const d=await api("/api/logs");if(!d)return;
    setHtml("logsList",d.logs?.length?d.logs.map(l=>`<div class="log-i"><div class="log-act">${l.action}</div><div class="log-det">${esc(l.detail)}</div><div class="log-t">${ta(l.time)}</div></div>`).join(""):`<div style="padding:24px;text-align:center;color:var(--fa)">No logs yet</div>`)}
  catch(e){setHtml("logsList",`<div style="color:var(--red)">${e.message}</div>`)}
}
async function clearLogs(){if(!confirm("Clear all your logs?"))return;
  try{await api("/api/logs",{method:"DELETE"});toast("✅ Logs cleared");loadLogs()}
  catch(e){toast(e.message,"err")}
}

// SETTINGS
function setSTab(el,s){document.querySelectorAll("#tab-settings .pill").forEach(p=>p.classList.remove("active"));el.classList.add("active");document.getElementById("sAcc")?.classList.toggle("hid",s!=="acc");document.getElementById("sSec")?.classList.toggle("hid",s!=="sec")}
async function updateTok(){const t=document.getElementById("newTok").value.trim();if(!t){toast("Enter token","err");return}
  try{await api("/api/me/token",{method:"PUT",body:JSON.stringify({github_token:t})});toast("✅ Token updated!");document.getElementById("newTok").value="";initApp()}
  catch(e){toast(e.message,"err")}
}
async function changePw(){const o=document.getElementById("oldPw").value,n=document.getElementById("newPw").value;if(!o||!n){toast("Fill both fields","err");return}
  try{await api("/api/me/password",{method:"PUT",body:JSON.stringify({old_password:o,new_password:n})});toast("✅ Password changed!");document.getElementById("oldPw").value="";document.getElementById("newPw").value=""}
  catch(e){toast(e.message,"err")}
}

// SEARCH
function handleSearch(e){if(e.key!=="Enter")return;const q=document.getElementById("sInput").value.trim();if(!q)return;S.searchQ=q;showTab("search");document.getElementById("srchTitle").textContent=`Results: "${q}"`;runSearch(S.searchType)}
function setSType(el,t){document.querySelectorAll("#tab-search .pill").forEach(p=>p.classList.remove("active"));el.classList.add("active");S.searchType=t;runSearch(t)}
async function runSearch(type){
  if(!S.searchQ)return;setHtml("searchResults","<div class='sk'></div>");
  try{const d=await api(`/api/github/search/${type}?q=${encodeURIComponent(S.searchQ)}&per_page=20`);
    if(type==="repos")setHtml("searchResults",(d?.items||[]).map(r=>`<div class="ri"><div><span class="ri-name" onclick="openRepo('${r.owner.login}','${r.name}')">${r.full_name}</span><span class="vbadge" style="margin-left:8px">${r.private?"Private":"Public"}</span>${r.description?`<div class="ri-desc">${esc(r.description)}</div>`:""}<div class="ri-meta">${r.language?`<span class="ri-m"><span class="ldot ${lc(r.language)}"></span>${r.language}</span>`:""}<span class="ri-m">⭐ ${fmt(r.stargazers_count)}</span></div></div></div>`).join("")||`<div style="padding:32px;text-align:center;color:var(--fa)">No results</div>`);
    else setHtml("searchResults",(d?.items||[]).map(u=>`<div style="padding:12px 0;border-top:1px solid var(--bd);display:flex;align-items:center;gap:12px"><img src="${u.avatar_url}" style="width:36px;height:36px;border-radius:50%"><div><div style="font-size:.88rem;font-weight:500;color:var(--bl)">${u.login}</div><a href="${u.html_url}" target="_blank" style="font-size:.75rem;color:var(--fa)">${u.html_url}</a></div></div>`).join("")||`<div style="padding:32px;text-align:center;color:var(--fa)">No users found</div>`)
  }catch(e){setHtml("searchResults",`<div style="color:var(--red);padding:24px">${e.message}</div>`)}
}

// Helpers
function pathUp(p){const parts=p.split("/");parts.pop();return parts.join("/")}
function fIcon(name){const ext=name.split(".").pop().toLowerCase();const m={js:"📜",ts:"📜",py:"🐍",html:"🌐",css:"🎨",json:"📋",md:"📝",txt:"📄",sh:"⚡",go:"🔵",rs:"🦀",java:"☕",rb:"💎",php:"🐘",c:"⚙️",cpp:"⚙️",zip:"📦",png:"🖼",jpg:"🖼",gif:"🖼",svg:"🖼",pdf:"📕",yml:"⚙️",yaml:"⚙️",env:"🔐"};return m[ext]||"📄"}

// Repo view tab CSS
const rtabStyle=document.createElement("style");rtabStyle.textContent=`.rtab{padding:10px 14px;font-size:.82rem;color:var(--mu);border-bottom:2px solid transparent;cursor:pointer;display:flex;align-items:center;gap:6px;transition:color .12s;white-space:nowrap}.rtab:hover{color:var(--t)}.rtab.active{color:var(--t);border-bottom-color:var(--yw,#e3b341);font-weight:500}`;document.head.appendChild(rtabStyle);
