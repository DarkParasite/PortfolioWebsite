# Tier list API (Cloudflare Worker)

Backend for the game tier list editor at `rishikhanna.dev/tiers/edit/`.
The site itself is static (GitHub Pages), so this small Worker does the parts that need secrets:

| Endpoint | What it does |
| --- | --- |
| `POST /login` | Checks the password, returns a 7-day session token. Limited to 5 tries a minute per IP. |
| `GET /data` | Reads `public/data/tiers.json` from the repo. |
| `GET /search?q=` | Searches IGDB for games and covers. |
| `GET /image?url=` | Fetches an image so the editor can turn any URL into a cover. |
| `POST /save` | Commits the tier list and any new covers to `master` in one commit. GitHub Pages redeploys in about a minute. |

Everything except `/login` needs a valid session.

## Where the secrets live

Only in Cloudflare (encrypted Worker secrets). Nothing secret is in this public repo or in the editor page.

| Secret | What it is |
| --- | --- |
| `PASSWORD` | What you type on the editor's login screen. Changing it logs out every device. |
| `GITHUB_TOKEN` | Fine-grained token that can only write to this one repo. |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | IGDB's API keys (IGDB is owned by Twitch). |

## One-time setup (~15 minutes)

### 1. IGDB keys (Twitch developer app)

1. Go to <https://dev.twitch.tv/console/apps> and sign in with a Twitch account (Twitch requires two-factor auth turned on for this).
2. **Register Your Application**: any name (e.g. `rishikhanna-tiers`), OAuth Redirect URL `http://localhost`, category **Website Integration**, client type **Confidential**.
3. Open the app, copy the **Client ID**, click **New Secret** and copy the **Client Secret**.

### 2. GitHub token

1. Go to <https://github.com/settings/personal-access-tokens/new>.
2. **Repository access**: Only select repositories → `PortfolioWebsite`.
3. **Permissions** → Repository permissions → **Contents: Read and write**. Nothing else.
4. Pick an expiration (e.g. 1 year) and note the date. Generate and copy the token.

### 3. Deploy the Worker

Make a free Cloudflare account at <https://dash.cloudflare.com/sign-up>, then from this folder:

```bash
npm install
npx wrangler login
npx wrangler deploy
```

The first deploy asks you to pick a `workers.dev` subdomain, then prints the Worker's URL,
like `https://tier-list-api.<your-subdomain>.workers.dev`.

Now add the four secrets (each command asks you to paste the value):

```bash
npx wrangler secret put PASSWORD
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put TWITCH_CLIENT_ID
npx wrangler secret put TWITCH_CLIENT_SECRET
```

Use a long password (a few random words is good): the Worker is public on the internet, the rate limit only slows guessing down.

### 4. Point the editor at the Worker

In `public/src/javascript/tier-editor.js`, replace the `API_URL` placeholder with the URL from step 3, then commit and push.
Open `rishikhanna.dev/tiers/edit/` and log in.

## Later

- **Change the password**: `npx wrangler secret put PASSWORD` again.
- **GitHub token expired** (saving fails with "GitHub error 401"): make a new one as in step 2, then `npx wrangler secret put GITHUB_TOKEN`.
- **Change the Worker code**: edit `src/index.js`, then `npx wrangler deploy`. Secrets are kept.
- **Logs**: `npx wrangler tail` shows requests and errors live.

## Running locally

Put test values in `worker/.dev.vars` (git-ignored, never commit it):

```
PASSWORD=something
GITHUB_TOKEN=...
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...
```

Run `npm run dev` here (Worker on `localhost:8787`) and serve the site on `localhost:8080`.
The editor uses `localhost:8787` automatically when opened from localhost.
Saving still commits to the real repo, so use it carefully.
