# oxe — UA dashboard

Internal Next.js dashboard for the UA team. Pulls a report from Adjust on
demand and renders it behind a shared-password gate, so UA can see spend /
ROAS without needing a seat on the Adjust dashboard itself.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Adjust Reports API (`https://automate.adjust.com/reports-service/report`)
- Shared-password auth via HMAC-signed cookie (no DB, no per-user accounts)

## Setup

```bash
npm install
cp .env.example .env.local
# fill in ADJUST_API_TOKEN and DASHBOARD_PASSWORD
npm run dev
```

`ADJUST_API_TOKEN` is the user-level token from
**Adjust dashboard → Account Settings → "Your API token"**. The dashboard
inherits whichever apps that token has access to.

Set `ADJUST_APP_TOKENS` (comma-separated) to restrict the dashboard to a
subset of apps server-side; otherwise the UI just filters across whatever
the API returns.

## Auth model

One shared password (`DASHBOARD_PASSWORD`). On a correct submit, the server
sets a `oxe_session` cookie signed with HMAC-SHA256 using the password as
the key. The cookie expires after 7 days. `middleware.ts` gates
`/dashboard/*` and `/api/report/*`.

Rotating the password invalidates all existing sessions automatically.

## Refresh model

On-demand. The dashboard fetches `/api/report` on mount and whenever the
user hits **Refresh**. There is no background job, no DB, no caching — each
refresh hits Adjust. This keeps the API quota bill predictable and avoids
stale data, at the cost of latency on each click.

## Columns

Matches the Adjust "Report overall" screenshot the UA team is used to:
App, Channel, Campaign, Installs, Ad spend, Ad revenue, ROAS (ad),
3D ROAS, 7D ROAS, Gross profit, LTV (ad), ARPDAU (ad).

If Adjust returns a metric under a different name than what `lib/adjust.ts`
expects, the cell shows `—` — adjust the `METRICS` list to match your
account's report schema.
