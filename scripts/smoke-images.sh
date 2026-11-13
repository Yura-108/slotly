#!/usr/bin/env bash
# Smoke test of the production images (ADR-018): starts them with compose.yaml +
# compose.images.yaml and checks what only the built images can show — that they start,
# migrate, talk to each other and keep the security properties. Behaviour is covered by
# the e2e tests; this checks packaging. Usage (from the repository root):
#   API_IMAGE=… WEB_IMAGE=… scripts/smoke-images.sh      (defaults: slotly-*:local)
set -euo pipefail

compose=(docker compose -f compose.yaml -f compose.images.yaml)
web=http://127.0.0.1:3300

fail() {
  echo "::error::smoke: $1"
  "${compose[@]}" logs --no-color api web migrate | tail -60
  exit 1
}

"${compose[@]}" up -d --wait --wait-timeout 120 || fail 'the stack did not become healthy'

# The migration step ran and finished successfully
[ "$("${compose[@]}" ps -a --format '{{.ExitCode}}' migrate)" = 0 ] || fail 'migrations failed'

# Neither app runs as root
for service in api web; do
  uid=$("${compose[@]}" exec -T "$service" id -u)
  [ "$uid" != 0 ] || fail "$service runs as root"
done

# A page: rendered per request with a nonce CSP (ADR-014)
headers=$(curl -sS -D - -o /dev/null "$web/login")
grep -qi '^HTTP/1.1 200' <<<"$headers" || fail "/login: $(head -1 <<<"$headers")"
grep -qi "^content-security-policy: .*'nonce-" <<<"$headers" || fail '/login has no nonce CSP'

# The API through the web proxy, at the address given at start (API_INTERNAL_URL)
ready=$(curl -sS -o /dev/null -w '%{http_code}' "$web/api/health/ready")
[ "$ready" = 200 ] || fail "/api/health/ready answered $ready"
api_csp=$(curl -sS -D - -o /dev/null "$web/api/health/live" | grep -i '^content-security-policy:' || true)
grep -q "default-src 'none'" <<<"$api_csp" || fail 'API responses lost the API security headers'

# A change without our Origin is refused by the API behind the proxy (CSRF, ADR-005)
status=$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "$web/api/auth/login")
[ "$status" = 403 ] || fail "POST without Origin answered $status, expected 403"

echo 'smoke: images start, migrate, serve pages and proxy the API'
