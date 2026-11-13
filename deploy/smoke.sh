#!/usr/bin/env bash
# After every deploy: the stack answers through Caddy over HTTPS with the expected security
# properties (ADR-019). Behaviour is covered by tests; this checks the deployment.
set -euo pipefail
cd "$(dirname "$0")"

compose=(docker compose --env-file .env --env-file .env.release -f compose.yaml)
base=https://localhost:8443

fail() {
  echo "smoke: $1" >&2
  exit 1
}

# Caddy's local CA, exported for curl (and for the browser, if you choose to trust it)
"${compose[@]}" cp caddy:/data/caddy/pki/authorities/local/root.crt caddy-root.crt > /dev/null
tls=(--cacert caddy-root.crt)
# curl on Windows (Schannel) also asks for revocation data, which a local CA does not
# publish; the certificate itself is still verified against caddy-root.crt
if curl -V | grep -q Schannel; then tls+=(--ssl-revoke-best-effort); fi
get() { curl -sS "${tls[@]}" "$@"; }

headers=$(get -D - -o /dev/null "$base/login")
grep -qi '^HTTP/[0-9.]* 200' <<<"$headers" || fail "/login: $(head -1 <<<"$headers")"
grep -qi "^content-security-policy: .*'nonce-" <<<"$headers" || fail '/login has no nonce CSP'
# HSTS is sent over HTTPS by the production web build (ADR-014)
grep -qi '^strict-transport-security: max-age=' <<<"$headers" || fail 'no HSTS'

ready=$(get -o /dev/null -w '%{http_code}' "$base/api/health/ready")
[ "$ready" = 200 ] || fail "/api/health/ready answered $ready"

# CSRF protection behind two proxies: a change without our Origin is refused
status=$(get -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "$base/api/auth/login")
[ "$status" = 403 ] || fail "POST without Origin answered $status, expected 403"

# Only Caddy is reachable from outside; Mailpit's UI only from this machine. Read what Docker
# actually publishes (`docker compose port` reports unpublished ports inconsistently)
published=$(docker ps --filter label=com.docker.compose.project=slotly-prod \
  --format '{{.Label "com.docker.compose.service"}} {{.Ports}}' | grep -- '->' |
  grep -vE '^caddy |^mailpit 127\.0\.0\.1:[0-9]+->[0-9]+/tcp$' || true)
[ -z "$published" ] || fail "unexpected published ports: $published"

echo "smoke: $base serves pages and the API over HTTPS"
