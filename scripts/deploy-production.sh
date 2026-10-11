#!/usr/bin/env bash
# Deploy current working tree to the pinned production project only.
# Requires: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID
# Forbidden: vercel deploy --temporary
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT_NAME="${VERCEL_PROJECT_NAME:-fleet-nitrogen-6wxfp18}"
PROD_HOST="https://fleet-nitrogen-6wxfp18.vercel.app"

if [[ -z "${VERCEL_TOKEN:-}" || -z "${VERCEL_ORG_ID:-}" || -z "${VERCEL_PROJECT_ID:-}" ]]; then
  cat <<EOF >&2
Missing Vercel credentials for production deploy.

Set all three:
  VERCEL_TOKEN
  VERCEL_ORG_ID
  VERCEL_PROJECT_ID

Target project: ${PROJECT_NAME}
Production URL: ${PROD_HOST}

One-time: Vercel → Account Settings → Tokens (create token)
         → Project ${PROJECT_NAME} → Settings → General (copy Org/Project IDs)

Preferred long-term: connect GitHub to this Vercel project so push to main auto-deploys.
See store docs/auto-deploy.md
EOF
  exit 1
fi

echo "Deploying to ${PROJECT_NAME} (production) → ${PROD_HOST}"
npx --yes vercel@latest deploy --prod --yes \
  --token "$VERCEL_TOKEN" \
  --scope "$VERCEL_ORG_ID"

echo "Done. Confirm: ${PROD_HOST}"
