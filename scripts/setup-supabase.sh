#!/usr/bin/env bash
# One-time: creates the cloud Supabase project, applies migrations, points Vercel at it,
# redeploys and smoke-tests. Needs a free project slot (free tier: 2 active projects).
# Usage: scripts/setup-supabase.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ORG_ID="pnooqumjhbsztfgimdgb" # Supabase org "Lifelog"
REGION="eu-central-1"
SCOPE="staleski-dev"
ENV_FILE="apps/web/.env.local"
sb() { pnpm exec supabase "$@"; }

DB_PASSWORD="$(grep '^SUPABASE_DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"
: "${DB_PASSWORD:?SUPABASE_DB_PASSWORD missing from $ENV_FILE}"

ref="$(sb projects list -o json | node -e '
  const p = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const list = Array.isArray(p) ? p : p.projects;
  console.log(list.find((x) => x.name === "lifelog")?.ref ?? "")')"
if [[ -z "$ref" ]]; then
  echo "Creating Supabase project 'lifelog'…"
  sb projects create lifelog --org-id "$ORG_ID" --db-password "$DB_PASSWORD" --region "$REGION" >/dev/null
  ref="$(sb projects list -o json | node -e '
    const p = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const list = Array.isArray(p) ? p : p.projects;
    console.log(list.find((x) => x.name === "lifelog").ref)')"
fi
echo "Project ref: $ref"

echo "Waiting for the database to accept connections…"
for _ in $(seq 1 60); do
  if sb link --project-ref "$ref" -p "$DB_PASSWORD" >/dev/null 2>&1; then break; fi
  sleep 10
done
sb link --project-ref "$ref" -p "$DB_PASSWORD" >/dev/null

echo "Applying migrations…"
sb db push -p "$DB_PASSWORD" --include-all

# Transaction-mode pooler (port 6543), as required by `prepare: false` in apps/web/lib/db.ts.
pooler="$(cat supabase/.temp/pooler-url)"
database_url="$(node -e '
  const u = new URL(process.argv[1]);
  u.password = encodeURIComponent(process.argv[2]);
  u.port = "6543";
  console.log(u.toString())' "$pooler" "$DB_PASSWORD")"
if grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  sed -i "s#^DATABASE_URL=.*#DATABASE_URL=$database_url#" "$ENV_FILE"
else
  echo "DATABASE_URL=$database_url" >>"$ENV_FILE"
fi

echo "Setting DATABASE_URL on Vercel and redeploying…"
vercel env rm DATABASE_URL production --yes --scope "$SCOPE" >/dev/null 2>&1 || true
printf '%s' "$database_url" | vercel env add DATABASE_URL production --scope "$SCOPE" >/dev/null
vercel deploy --prod --yes --scope "$SCOPE" >/dev/null

scripts/smoke.sh
