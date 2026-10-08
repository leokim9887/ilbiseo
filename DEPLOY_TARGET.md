# Deploy target (canonical)

**Production host:** https://fleet-nitrogen-6wxfp18.vercel.app  

Do **not** create anonymous/`temporary-*` deployments. Always deploy to the claimed Vercel project that owns this domain.

## One-time link (on a machine with Vercel login)

```bash
npx vercel login
npx vercel link
# Pick the project whose Domains include fleet-nitrogen-6wxfp18.vercel.app
# (name may contain fleet-nitrogen-6wxfp18)
```

Confirm Domains in the Vercel dashboard show:

- `fleet-nitrogen-6wxfp18.vercel.app` (primary)
- optional alias: `temporary-fleet-nitrogen-6wxfp18.vercel.app` → redirects here

## Env on that project (Production + Preview if used)

```bash
npx vercel env add GOOGLE_REDIRECT_URI production
# value: https://fleet-nitrogen-6wxfp18.vercel.app/api/google/callback

npx vercel env add NEXT_PUBLIC_APP_URL production
# value: https://fleet-nitrogen-6wxfp18.vercel.app
```

Or set the same keys in **Project → Settings → Environment Variables**, then redeploy.

## Deploy (always --prod to linked project)

```bash
npx vercel --prod
# equivalent: npx vercel deploy --prod
```

Forbidden for this app:

```bash
npx vercel deploy --temporary   # creates a new temporary-* URL — DO NOT
```

## Google Cloud redirect (one line)

```
https://fleet-nitrogen-6wxfp18.vercel.app/api/google/callback
```

## Local `.env.local` (dev / smoke)

```bash
GOOGLE_REDIRECT_URI=https://fleet-nitrogen-6wxfp18.vercel.app/api/google/callback
NEXT_PUBLIC_APP_URL=https://fleet-nitrogen-6wxfp18.vercel.app
```

Store mirror: `/cursor/stores/self/docs/production-url.md`
