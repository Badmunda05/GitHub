# GitHub Control Bot — Web Dashboard

A clean, secure web interface for your GitHub Control Bot.

## Security Features
- **JWT Authentication** — Each user gets their own token
- **Zero Data Leaks** — Every API call is scoped to the authenticated user's UID
- **No Cross-User Access** — Users cannot see each other's tokens, repos, or logs
- **Admin-Only Routes** — Stats, all users, all logs protected by owner check

---

## Setup

### Step 1 — Install web dependencies
```bash
pip install -r requirements_web.txt
```

### Step 2 — Set environment variables
```bash
export BOT_DIR="/path/to/gitHub2-main"   # Your bot folder
export JWT_SECRET="change-this-to-random-string"
export JWT_EXPIRE_HOURS="24"
```

### Step 3 — Add /websecret command to bot.py
Run the patch script to see what to add:
```bash
python bot_web_patch.py
```
Then paste the handler into your `bot.py` before `app.run()`.

### Step 4 — Start the web server
```bash
cd web_app
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Step 5 — Users set their web secret via bot
Each user sends this to the bot once:
```
/websecret mysecretpassword123
```

### Step 6 — Login to dashboard
Open `http://yourserver:8000` and login with:
- **Telegram User ID** (found in bot or Telegram profile)
- **Secret key** (set via /websecret command)

---

## File Structure
```
web_app/
├── main.py              ← FastAPI backend (all API routes)
├── requirements_web.txt ← Python deps
├── bot_web_patch.py     ← /websecret command to add to bot
└── static/
    ├── index.html       ← Dashboard UI
    ├── style.css        ← Dark terminal theme
    └── app.js           ← Frontend logic
```

---

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login → get JWT |

### User (JWT required)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/me | Own profile + stats |
| GET/POST/DELETE | /api/token | GitHub PAT |
| GET/POST/DELETE/PUT | /api/repos | Saved repos |
| POST | /api/repos/{idx}/activate | Set active repo |
| GET | /api/github/repos | GitHub repos list |
| POST | /api/github/repos | Create repo |
| DELETE | /api/github/repos/{idx} | Delete repo |
| GET | /api/github/commits/{idx} | Repo commits |
| GET | /api/github/branches/{idx} | Repo branches |
| GET/POST/DELETE | /api/gists | Gists |
| GET/PUT | /api/github/profile | GitHub profile |
| GET | /api/logs | Own activity logs |

### Admin (Owner JWT only)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/admin/stats | Bot stats |
| GET | /api/admin/users | All users (tokens hidden) |
| GET | /api/admin/logs | All activity logs |

---

## Running Both Bot + Web Simultaneously
```bash
# Terminal 1 — Run bot
cd gitHub2-main && python bot.py

# Terminal 2 — Run web dashboard  
cd web_app && uvicorn main:app --host 0.0.0.0 --port 8000
```

Both share the same MongoDB database, so data stays in sync.
