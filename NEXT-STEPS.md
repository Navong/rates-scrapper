# Production setup — local Docker + Cloudflare (all 5 providers)

We run the backend on **your machine** (residential IP) so **SBI works** — Railway
(datacenter IP) couldn't do that reliably. Railway is decommissioned.

## ✅ LIVE production endpoint

```
https://rates.navong.xyz/rates?token=<YOUR_RATES_TOKEN>
https://rates.navong.xyz/health
```

- Tunnel: **cloudflared Windows service** (auto-starts on boot) → `localhost:8787`.
- Backend: `docker compose up -d backend` (restart: unless-stopped).
- Keep both running: Docker Desktop "start on sign in" + the cloudflared service.
- All 5 providers incl. SBI; auth enforced; CORS enabled for Office Scripts.

## What's running now

```
docker compose --profile quick up -d --build
```
- `backend` container (Node, KST timezone, token-protected, 60s cache, healthcheck)
- `tunnel-quick` → a **temporary** public URL `https://<random>.trycloudflare.com`

Current test URL is in `tunnel-url.txt`. Token is in `.env` (`RATES_TOKEN`).
Call:  `https://<url>/rates?token=<RATES_TOKEN>`

⚠️ The quick-tunnel URL is **random and changes on restart** — fine for testing,
not for a Power Automate flow you don't want to keep editing.

## ➤ Step 1 (you): make the URL permanent — named tunnel

Needs a domain on Cloudflare (free plan is fine).

1. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel**
   → **Cloudflared** → name it (e.g. `rate-backend`).
2. On the install screen, copy the **token** (the long `eyJ…` after `--token`).
3. Paste it into `.env`:  `CF_TUNNEL_TOKEN=eyJ...`
4. In the tunnel's **Public Hostname** tab → **Add a public hostname**:
   - Subdomain: `rates` · Domain: `yourdomain.com`
   - Service: **HTTP** → `backend:8787`
5. Start the stable stack:
   ```
   docker compose down
   docker compose --profile named up -d --build
   ```
6. Your permanent endpoint:  `https://rates.yourdomain.com/rates?token=<RATES_TOKEN>`

## ➤ Step 2 (you): keep it always-on

- Docker Desktop → **Settings → General → “Start Docker Desktop when you sign in.”**
- Containers use `restart: unless-stopped`, so they relaunch with Docker.
- The PC must stay powered on (and signed in) for the flow to reach it.
- Verify after a reboot:  `curl https://rates.yourdomain.com/health` → `{"ok":true}`

## ➤ Step 3: point Power Automate at it

In your flow's **HTTP GET**: `https://rates.yourdomain.com/rates?token=<RATES_TOKEN>`
→ Parse JSON → add the 2 rows → Run your Office Script. (Full details in
`POWER-AUTOMATE-SETUP.md`.) The payload now also carries:
- `sbiAvailable` (bool), `partial` (bool), `failed` (list) — so the flow/script can
  skip a provider that momentarily failed instead of writing a bad value.

## Handy commands

```
docker compose --profile quick logs -f tunnel-quick   # show quick-tunnel URL / logs
docker compose logs -f backend                        # backend request log
docker compose restart backend                        # after code edits + rebuild
docker compose down                                   # stop everything
docker compose --profile named up -d --build          # rebuild & start stable stack
```

## Optional: fully delete the old Railway project
`railway down` already stopped the deployment. To remove the project entirely:
Railway dashboard → project **rate-backend** → Settings → Delete, or `railway delete`.
