# The caller supplies the project's native command array and checkout paths.
# Use independent process runs and disable test transform caches in both orders.
jest_env=
case "$PROJECT" in
  react|drone)
    jest_version=$(node -p 'require("jest-environment-node/package.json").version')
    npm install --prefix "$RUNNER_TEMP/environments" --no-audit --no-fund --legacy-peer-deps \
      "@happy-dom/jest-environment@21.0.4" "jest-environment-node@$jest_version"
    jest_env="$RUNNER_TEMP/environments/node_modules/@happy-dom/jest-environment/lib/index.js"
    export NODE_PATH="$PWD/node_modules:$RUNNER_TEMP/environments/node_modules"
    ;;
esac
for round in 1 2; do
  providers=(candidate reference happy turbo)
  if [[ "$round" == 2 ]]; then providers=(turbo happy reference candidate); fi
  for provider in "${providers[@]}"; do
    unset JSDOM_ENTRY QUAL_ENV
    options=()
    case "$provider" in
      candidate) export JSDOM_ENTRY="$root/packages/jsdom/dist/jsdom.cjs";;
      reference) JSDOM_ENTRY=$(realpath "$root/packages/jsdom/node_modules/jsdom/lib/api.js"); export JSDOM_ENTRY;;
      happy) export QUAL_ENV=happy-dom;;
      turbo) QUAL_ENV=$(realpath "$root/packages/jsdom/node_modules/@miaskiewicz/turbo-dom/src/environment/vitest.mjs"); export QUAL_ENV;;
    esac
    if [[ -n "$jest_env" ]]; then
      options+=(--no-cache)
      case "$provider" in
        happy) options+=(--env "$jest_env");;
        turbo) options+=(--env "$root/packages/jsdom/node_modules/@miaskiewicz/turbo-dom/src/environment/jest.cjs");;
      esac
    elif [[ -n "${QUAL_ENV:-}" ]]; then
      options+=(--environment "$QUAL_ENV")
    fi
    suffix="$provider-r$round"
    export QUAL_PROVIDER_LOG="$RUNNER_TEMP/provider-$suffix.txt"
    export NODE_OPTIONS="--import=$root/qualification/provider.mjs --import=$root/qualification/provider-observation.mjs"
    /usr/bin/time -f '%e %M' -o "$RUNNER_TEMP/timing-$suffix.txt" timeout 150 "${cmd[@]}" "${options[@]}" "--outputFile=$RUNNER_TEMP/result-$suffix.json" >"$RUNNER_TEMP/command-$suffix.log" 2>&1 || true
  done
done
