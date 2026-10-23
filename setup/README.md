# EduCore — Windows Setup & Deployment

## Option A: Quick Start (no service, just run it)

1. Install **Node.js LTS** from https://nodejs.org
2. Install **MongoDB Community** from https://www.mongodb.com/try/download/community
3. Double-click **`start.bat`** — opens EduCore at http://localhost:3000
4. Other computers on the same WiFi connect via `http://<your-ip>:3000`

---

## Option B: PowerShell Installer (installs as Windows service)

Installs everything automatically: Node.js, MongoDB, creates Windows services
that start on boot. Other staff never need to manually start the server.

```
Right-click  install.ps1  →  Run as Administrator
```

What it does:
- Installs Node.js LTS (via winget)
- Installs MongoDB Community (via winget)
- Builds the app (`npm run build`)
- Creates `.env.local` with a random JWT secret
- Creates Windows services `EduCore` and `EduCoreDB` (auto-start on boot)
- Adds a Windows Firewall rule for port 3000
- Creates a desktop shortcut

---

## Option C: Build a standalone .exe installer

Compile `EduCore-Setup.iss` with [Inno Setup 6](https://jrsoftware.org/isdl.php)
to get a single `EduCore-Setup.exe` that end-users can double-click.

**Before building:**
```bash
npm run build     # builds the Next.js app
```

Then open `EduCore-Setup.iss` in Inno Setup Compiler → **Build → Compile**.

Output: `setup/Output/EduCore-Setup.exe`

The `.exe` will:
1. Check for / install Node.js
2. Copy all app files to `C:\EduCore`
3. Create MongoDB + EduCore Windows services
4. Open the browser to http://localhost:3000

---

## Online Sync (Local ↔ Server)

To sync with an online server (MongoDB Atlas or VPS):

1. Go to **Settings → Server & Sync** tab in EduCore
2. Paste the remote MongoDB connection string
3. Enable sync and click **Save Sync Settings**
4. Click **Test Connection** to verify
5. Click **Sync Now** to push/pull all data

The sync is two-way and timestamp-based — whichever side has the newer
record wins. Runs on demand (button) or can be automated with Windows
Task Scheduler:

```
schtasks /create /tn "EduCore Sync" /tr "powershell -Command \"Invoke-WebRequest -Uri 'http://localhost:3000/api/system/sync' -Method POST -Body '{\"action\":\"sync\"}' -ContentType 'application/json'\"" /sc hourly
```

---

## Managing the Service

| Action | Command |
|--------|---------|
| Start  | `net start EduCore` |
| Stop   | `net stop EduCore`  |
| Restart | `net stop EduCore && net start EduCore` |
| Uninstall | Run `uninstall.bat` as Administrator |

Logs: `C:\EduCore\logs\service.log`
