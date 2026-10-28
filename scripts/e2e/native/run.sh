#!/usr/bin/env bash
set -euo pipefail
set -a
source <(supabase status -o env)
set +a
node scripts/e2e/native/run.cjs
