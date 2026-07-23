#!/usr/bin/env bash
# Usage:
#   ./.local.sh          — start postgres, migrate, seed, and run both dev servers
#   ./.local.sh --down   — stop dev servers and containers
#   ./.local.sh --reset  — stop everything and clear the postgres volume
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

GRN='\033[0;32m'; YLW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
step() { echo -e "\n${YLW}==> $*${NC}"; }
ok()   { echo -e "${GRN}    ✓ $*${NC}"; }
fail() { echo -e "${RED}    ✗ $*${NC}"; exit 1; }

API_URL="http://localhost:3000"
WEB_URL="http://localhost:3001"

if [[ "${1:-}" == "--down" || "${1:-}" == "--reset" ]]; then
  step "Stopping dev servers"
  pkill -f "tsx watch src/index.ts" 2>/dev/null && ok "API stopped" || true
  pkill -f "next dev -p 3001" 2>/dev/null && ok "Web stopped" || true

  if [[ "${1:-}" == "--reset" ]]; then
    step "Stopping containers and removing volumes"
    docker compose down -v
    ok "Volumes cleared"
  else
    step "Stopping containers"
    docker compose down
  fi
  ok "Done"
  exit 0
fi

step "Starting Postgres"
docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U postgres -q 2>/dev/null; do sleep 1; done
ok "Postgres ready"

step "Applying migrations"
pnpm --filter ticketing-api db:migrate
ok "Migrations applied"

step "Seeding demo data"
pnpm --filter ticketing-api seed
ok "Seeded (idempotent — safe to rerun)"

step "Starting dev servers"
pnpm --filter ticketing-api dev >> /tmp/nbl-api.log 2>&1 & API_PID=$!
pnpm --filter ticketing-web dev >> /tmp/nbl-web.log 2>&1 & WEB_PID=$!

_cleanup() {
  echo
  step "Shutting down"
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
  docker compose down
  ok "Bye"
  exit 0
}
trap _cleanup INT TERM

step "Waiting for API"
until curl -sf "$API_URL/games" > /dev/null 2>&1; do sleep 1; done
ok "API ready"

step "Waiting for Web"
until curl -sf "$WEB_URL" > /dev/null 2>&1; do sleep 1; done
ok "Web ready"

echo
echo -e "${GRN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  Local environment ready"
echo -e ""
echo -e "  Web          $WEB_URL"
echo -e "  API          $API_URL"
echo -e "  API docs     $API_URL/docs"
echo -e ""
echo -e "  Member       member@example.com / password123"
echo -e "  Season pass  season@example.com / password123"
echo -e "  Admin        admin@example.com / password123"
echo -e ""
echo -e "  Logs         /tmp/nbl-api.log"
echo -e "               /tmp/nbl-web.log"
echo -e ""
echo -e "  Press Ctrl+C to stop (or run ./.local.sh --down from another shell)"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

wait "$API_PID" "$WEB_PID"
