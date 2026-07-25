#!/usr/bin/env bash
# One-command deploy on the Raspberry Pi.
#
#   ./pi-update.sh            pull the PINNED image + recreate the container
#   ./pi-update.sh v1.0.1     switch the pin to v1.0.1 first, then deploy
#
# There is no build on the Pi — it pulls the prebuilt multi-arch image from
# Docker Hub (arm64 variant). To publish a new version first, push a git tag
# (git tag v1.0.1 && git push origin v1.0.1) — GitHub Actions builds & pushes it.
set -euo pipefail
cd "$(dirname "$0")"

FILE="docker-compose.pi.yml"
DC="docker compose -f $FILE"

# Optional version arg → repin the image tag in the compose file.
if [ "${1:-}" != "" ]; then
  sed -i -E "s#(image: navong/rate-scraper:).*#\1${1}#" "$FILE"
  echo "→ pinned image to ${1}"
fi

IMG="$(grep -m1 -oE 'navong/rate-scraper:[^[:space:]]+' "$FILE")"
echo "→ pulling ${IMG} ..."
$DC pull
$DC up -d
docker image prune -f >/dev/null 2>&1 && echo "✓ removed old dangling images"

echo "→ status:"
$DC ps
echo -n "→ health: "
curl -fsS localhost:8787/health || echo "(not ready yet — give it a few seconds, then: curl localhost:8787/health)"
echo
