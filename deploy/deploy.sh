#!/usr/bin/env bash
# Deploys a commit of main to the production-like stack (ADR-019). Rollback is the same
# command with the previous commit (deploy/releases.log) — safe only because migrations are
# expand/contract: every migration works with the code of the release before it.
#
#   deploy/deploy.sh <40-character commit SHA of main>
#
# Needs: Docker, gh (logged in to GitHub; the images are public), deploy/.env with secrets.
set -euo pipefail

repo=Yura-108/slotly
registry=ghcr.io/yura-108
dir=$(cd "$(dirname "$0")" && pwd)
cd "$dir"

sha=${1:-}
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "usage: deploy/deploy.sh <40-char commit SHA>" >&2; exit 2; }
[ -f .env ] || { echo "deploy/.env is missing: copy deploy/.env.example and set the secrets" >&2; exit 2; }

# 1. Provenance: built by our CI workflow on main, from this repository, on GitHub's runners.
#    Anything else — a pushed-by-hand image, another branch, a fork — is refused.
#    An empty Docker config: the registry is read anonymously, as a server would
anon=$(mktemp -d)
trap 'rm -rf "$anon"' EXIT
echo '{}' > "$anon/config.json"
declare -A image
for app in api web; do
  ref="$registry/slotly-$app:sha-$sha"
  echo "verifying $ref"
  DOCKER_CONFIG=$anon gh attestation verify "oci://$ref" --repo "$repo" \
    --signer-workflow "$repo/.github/workflows/ci.yml" --source-ref refs/heads/main \
    --deny-self-hosted-runners > /dev/null
  docker pull -q "$ref" > /dev/null
  # Run by digest: a tag can be moved, the digest is what was verified
  image[$app]=$(docker inspect --format '{{index .RepoDigests 0}}' "$ref")
done

cat > .env.release <<EOF
# Written by deploy.sh: what runs now. Ignored by git
RELEASE_SHA=$sha
API_IMAGE=${image[api]}
WEB_IMAGE=${image[web]}
EOF
compose=(docker compose --env-file .env --env-file .env.release -f compose.yaml)

# 2. Database first, then migrations as their own step with the owner role
"${compose[@]}" up -d --wait postgres mailpit
"${compose[@]}" run --rm migrate

# 3. The new version; --wait returns when the health checks pass (api: /health/ready)
"${compose[@]}" up -d --wait --remove-orphans api web caddy

# 4. Through the front door, as a user would
./smoke.sh

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $sha ${image[api]} ${image[web]}" >> releases.log
echo "deployed $sha"
