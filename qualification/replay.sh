#!/usr/bin/env bash
# Replays the qualify.yml "frameworks" and "extended" real-project suites locally against RunDOM, jsdom, Happy DOM and TurboDOM.
#
# usage: qualification/replay.sh setup <project>
#        qualification/replay.sh run <project> [round] [provider...]
#   frameworks: vue svelte mui        extended: supabase freecodecamp react drone
#   providers:  candidate reference happy turbo (default: all four, rotated by round)
#
# Revisions, commands and provider wiring mirror .github/workflows/qualify.yml and balanced-project.sh.
# Checkouts and results live under $QUAL_DIR (default <repo>/.cache/qualification-replay); nothing in the
# repository is modified. Build first (bun run build). Runs are serial fresh processes; keep the host otherwise idle.
# Timing files use the CI `/usr/bin/time -f '%e %M'` format (wall seconds, peak RSS KiB) on macOS and Linux.
set -uo pipefail
MODE=${1:?usage: replay.sh setup|run <project> [round] [provider...]}
PROJECT=${2:?missing project}
ROUND=${3:-1}
shift $(($# < 3 ? $# : 3))
root=$(cd "$(dirname "$0")/.." && pwd)
Q=${QUAL_DIR:-$root/.cache/qualification-replay}
dir="$Q/$PROJECT"
out="$Q/results/$PROJECT"
mkdir -p "$out"
export CI=1 TZ=UTC

case "$PROJECT" in
  vue) kind=frameworks repo=vuejs/core rev=8b479a89445868d474f17e2d837765e7c9ece5e4 budget=360;;
  svelte) kind=frameworks repo=sveltejs/svelte rev=ff7404cccd5f112b2e99d640d95b2e17974c1ae9 budget=360;;
  mui) kind=frameworks repo=mui/material-ui rev=4c499c5a4c00dcece4ae60e5d33ec810def4f2ba budget=360;;
  supabase) kind=extended repo=supabase/supabase rev=7ef7d9f648ae8947adcbeb1ad674b044b68f50dd budget=150;;
  freecodecamp) kind=extended repo=freeCodeCamp/freeCodeCamp rev=7fce48a0f6b78fcd93d907fc86475e6286bde34e budget=150;;
  react) kind=extended repo=facebook/react rev=df6aa4ec76cff5b3adde531c6fe8c36099e0469b budget=150;;
  drone) kind=extended repo=drone/drone rev=85bc2b9cd180a9e2cd2c6a6860c94b22f5eeaca2 budget=150;;
  *) echo "unknown project: $PROJECT" >&2; exit 2;;
esac

# The project's pinned pnpm, through npx so no global install is required.
pm() { npx -y "pnpm@$(node -p "(require('$dir/package.json').packageManager||'pnpm@12.18.0').split('@').pop().split('+')[0]")" "$@"; }

if [ "$MODE" = setup ]; then
  [ -e "$dir/.installed" ] && exit 0
  mkdir -p "$dir" && cd "$dir" || exit 1
  [ -e package.json ] || curl -fsSL --retry 3 "https://codeload.github.com/$repo/tar.gz/$rev" | tar xz --strip-components=1 || exit 1
  case "$PROJECT" in
    vue|mui) pm install --frozen-lockfile || exit 1;;
    svelte) pm install --frozen-lockfile && pm --filter svelte generate || exit 1;;
    supabase) pm --filter 'ui...' install --frozen-lockfile || exit 1;;
    freecodecamp)
      pm --filter '@freecodecamp/client...' install --frozen-lockfile || exit 1
      pm --filter @freecodecamp/shared build || exit 1
      pm --filter @freecodecamp/challenge-builder build || exit 1
      [ ! -e sample.env ] || cp sample.env .env
      (cd client && pm create:env) || exit 1;;
    react) npx -y yarn@1.22.22 install --frozen-lockfile --ignore-engines || exit 1;;
    drone) (cd web && npm install --legacy-peer-deps --no-audit --no-fund) || exit 1;;
  esac
  touch .installed
  exit 0
fi
[ "$MODE" = run ] || { echo "unknown mode: $MODE" >&2; exit 2; }
[ -e "$dir/.installed" ] || { echo "run 'replay.sh setup $PROJECT' first" >&2; exit 1; }
[ -e "$root/packages/jsdom/dist/jsdom.cjs" ] || { echo "run 'bun run build' first" >&2; exit 1; }
timeout_bin=$(command -v timeout || command -v gtimeout) || { echo "needs coreutils timeout (macOS: brew install coreutils)" >&2; exit 1; }
turbo="$root/packages/jsdom/node_modules/@miaskiewicz/turbo-dom/src/environment"

# Runs "$@" under the budget and writes "<wall seconds> <peak RSS KiB>" to $1 on both BSD and GNU time.
measure() {
  local file=$1; shift
  if [ "$(uname)" = Darwin ]; then
    /usr/bin/time -l -o "$file.raw" "$timeout_bin" "$budget" "$@"
    local status=$?
    awk '/ real/{wall=$1} /maximum resident/{kib=int($1/1024)} END{print wall, kib}' "$file.raw" > "$file" && rm -f "$file.raw"
    return $status
  fi
  /usr/bin/time -f '%e %M' -o "$file" "$timeout_bin" "$budget" "$@"
}

cd "$dir" || exit 1
jest_env=
case "$PROJECT" in
  vue) cmd=(node node_modules/vitest/vitest.mjs run --project unit-jsdom packages/runtime-dom);;
  svelte) cmd=(node node_modules/vitest/vitest.mjs run packages/svelte/tests/runtime-runes/test.ts packages/svelte/tests/runtime-legacy/test.ts packages/svelte/tests/motion/test.ts);;
  mui)
    cmd=(node node_modules/vitest/vitest.mjs run --project node:@mui/material)
    for f in Button Checkbox Dialog Select TextField; do cmd+=("packages/mui-material/src/$f/$f.test.js"); done;;
  supabase) cd packages/ui || exit 1; cmd=(node node_modules/vitest/vitest.mjs run);;
  freecodecamp)
    cd client || exit 1
    cases=(); while IFS= read -r f; do cases+=("$f"); done < <(find . -path ./node_modules -prune -o -type f \( -iname 'flash.test.tsx' -o -iname '*two*button*cta*.test.tsx' -o -iname '*two*button*cta*.test.jsx' \) -print)
    [ "${#cases[@]}" -eq 2 ] || { echo "expected 2 freeCodeCamp cases, found ${#cases[@]}" >&2; exit 1; }
    cmd=(node node_modules/vitest/vitest.mjs run --project react "${cases[@]}");;
  react) cmd=(node scripts/jest/jest-cli.js CSSPropertyOperations DOMPropertyOperations --runInBand --json);;
  drone) cd web || exit 1; cmd=(node node_modules/jest/bin/jest.js CreateRepositoryButton --runInBand --coverage=false --json);;
esac
case "$PROJECT" in
  react|drone)
    jest_version=$(node -p 'require("jest-environment-node/package.json").version')
    envs="$Q/environments-$PROJECT"
    [ -e "$envs/node_modules/@happy-dom/jest-environment" ] || npm install --prefix "$envs" --no-audit --no-fund --legacy-peer-deps "@happy-dom/jest-environment@21.0.4" "jest-environment-node@$jest_version" >"$out/environments.log" 2>&1 || exit 1
    jest_env="$envs/node_modules/@happy-dom/jest-environment/lib/index.js"
    export NODE_PATH="$PWD/node_modules:$envs/node_modules";;
  *) cmd+=(--maxWorkers=1 --no-file-parallelism --no-cache --reporter=json);;
esac

# Points the suite's jsdom environment at QUAL_ENV; idempotent because setup checkouts are reused across runs.
configure_environment() {
  PROJECT=$PROJECT python3 - <<'PYENV'
import os, pathlib
project, env = os.environ["PROJECT"], os.environ.get("QUAL_ENV", "jsdom")
if project == "svelte":
    for case in ["motion", "runtime-runes", "runtime-legacy"]:
        path = pathlib.Path("packages/svelte/tests") / case / "test.ts"
        lines = path.read_text().splitlines(keepends=True)
        assert lines[0].startswith("// @vitest-environment ")
        lines[0] = "// @vitest-environment " + env + "\n"
        path.write_text("".join(lines))
elif project in ("vue", "mui", "supabase", "freecodecamp"):
    path = pathlib.Path({"vue": "vitest.config.ts", "mui": "vitest.shared.mts", "supabase": "vitest.config.ts", "freecodecamp": "vitest.config.js"}[project])
    text = path.read_text()
    if "process.env.QUAL_ENV" not in text:
        original, replacement = (("environment: jsdom ? 'jsdom' : 'node'", "environment: jsdom ? (process.env.QUAL_ENV || 'jsdom') : 'node'")
                                 if project == "mui" else ("environment: 'jsdom'", "environment: process.env.QUAL_ENV || 'jsdom'"))
        assert original in text, f"{path}: jsdom environment line not found"
        path.write_text(text.replace(original, replacement))
PYENV
}

providers=("$@")
if [ ${#providers[@]} -eq 0 ]; then
  case "$ROUND" in
    2) providers=(turbo happy reference candidate);;
    3) providers=(reference turbo candidate happy);;
    *) providers=(candidate reference happy turbo);;
  esac
fi
status=0
for provider in "${providers[@]}"; do
  unset JSDOM_ENTRY
  export QUAL_ENV=jsdom
  options=()
  case "$provider" in
    candidate) export JSDOM_ENTRY="$root/packages/jsdom/dist/jsdom.cjs";;
    reference) JSDOM_ENTRY=$(realpath "$root/packages/jsdom/node_modules/jsdom/lib/api.js"); export JSDOM_ENTRY;;
    happy) export QUAL_ENV=happy-dom;;
    turbo) QUAL_ENV=$(realpath "$turbo/vitest.mjs"); export QUAL_ENV;;
    *) echo "unknown provider: $provider" >&2; exit 2;;
  esac
  configure_environment || exit 1
  if [ -n "$jest_env" ]; then
    options+=(--no-cache)
    case "$provider" in
      happy) options+=(--testEnvironment "$jest_env");;
      turbo) options+=(--testEnvironment "$turbo/jest.cjs");;
    esac
  elif [ "$kind" = extended ] && [ "$QUAL_ENV" != jsdom ]; then
    options+=(--environment "$QUAL_ENV")
  fi
  tag="$provider-r$ROUND"
  export QUAL_PROVIDER_LOG="$out/provider-$tag.txt"
  rm -f "$QUAL_PROVIDER_LOG"
  NODE_OPTIONS="--import=$root/qualification/provider.mjs --import=$root/qualification/provider-observation.mjs" \
    measure "$out/timing-$tag.txt" "${cmd[@]}" ${options[@]+"${options[@]}"} "--outputFile=$out/result-$tag.json" >"$out/command-$tag.log" 2>&1
  code=$?
  [ "$code" -eq 0 ] || status=1
  read -r wall kib < "$out/timing-$tag.txt" 2>/dev/null
  echo "$PROJECT-$tag exit=$code wall=${wall:-?}s rss=$(awk -v k="${kib:-0}" 'BEGIN{printf "%.1f", k/1024}')MiB loaded=$(wc -l < "$QUAL_PROVIDER_LOG" 2>/dev/null | tr -d ' ')"
done
exit "$status"
