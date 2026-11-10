#!/usr/bin/env bash
# Blue/green deploy of the Astra Dev static site (development.adastrarp.com).
#
# Installed on the VPS as /home/hermes/deploy/astra-dev.sh by
# .github/workflows/deploy.yml (the workflow copies it from the repo on every
# run, so the repo copy is the source of truth). Never run it by hand to ship
# code: deploys go through the workflow.
#
# Usage:
#   astra-dev.sh deploy <sha> <dist-dir> [version]   build output -> idle slot -> switch
#   astra-dev.sh rollback                            point `current` back at the other slot
#   astra-dev.sh status                              print live slot and both ready.json
#
# Layout (see ARCHITECTURE.md):
#   /var/www/development.adastrarp.com/{blue,green}  one build each
#   .../current  -> live slot (nginx root for everyone)
#   .../next     -> idle slot (nginx serves it only to loopback + X-Deploy-Slot: next)

set -euo pipefail

DOMAIN="development.adastrarp.com"
BASE="/var/www/${DOMAIN}"
NGINX="/usr/sbin/nginx"
SYSTEMCTL="/usr/bin/systemctl"

log() { printf '[astra-dev] %s\n' "$*"; }
die() { printf '[astra-dev] ERROR: %s\n' "$*" >&2; exit 1; }

live_slot() {
  if [ -L "${BASE}/current" ]; then basename "$(readlink "${BASE}/current")"; else echo none; fi
}

other_slot() {
  case "$1" in
    blue) echo green ;;
    green) echo blue ;;
    *) echo blue ;;
  esac
}

# Atomic symlink replace: rename(2) over the old link, never a window with no link.
point() { # point <link-name> <slot>
  ln -sfn "$2" "${BASE}/$1.tmp"
  mv -Tf "${BASE}/$1.tmp" "${BASE}/$1"
}

reload_nginx() {
  sudo "${NGINX}" -t
  sudo "${SYSTEMCTL}" reload nginx
}

# Real check against the real vhost (TLS, server_name, root). The request goes to
# the local nginx; `X-Deploy-Slot: next` makes the vhost serve the idle slot.
# /ready.json must carry the expected sha: the SPA fallback answers 200 for any
# path, so a plain 200 proves nothing.
probe() { # probe <current|next> [sha]
  local slot=$1 want=${2:-} body i
  for i in $(seq 1 10); do
    if body=$(curl -fsS --max-time 5 \
        --resolve "${DOMAIN}:443:127.0.0.1" \
        -H "X-Deploy-Slot: ${slot}" \
        "https://${DOMAIN}/ready.json" 2>/dev/null) \
      && grep -q '"ok":true' <<<"${body}" \
      && { [ -z "${want}" ] || grep -q "\"sha\":\"${want}\"" <<<"${body}"; } \
      && curl -fsS --max-time 5 -o /dev/null \
        --resolve "${DOMAIN}:443:127.0.0.1" \
        -H "X-Deploy-Slot: ${slot}" \
        "https://${DOMAIN}/"; then
      log "probe ${slot}: ok ${body}"
      return 0
    fi
    sleep 2
  done
  log "probe ${slot}: failed (wanted sha '${want:-any}')"
  return 1
}

cmd_deploy() {
  local sha=${1:-} src=${2:-} version=${3:-unknown}
  [[ "${sha}" =~ ^[0-9a-f]{7,40}$ ]] || die "usage: deploy <sha> <dist-dir> [version] (sha must be hex)"
  [ -f "${src}/index.html" ] || die "${src}/index.html not found: build first"
  [ -d "${BASE}" ] || die "${BASE} missing: VPS setup not done (docs/deploy/README.md)"

  local live idle slot_dir
  live=$(live_slot)
  idle=$(other_slot "${live}")
  slot_dir="${BASE}/${idle}"
  log "live=${live} idle=${idle} sha=${sha}"

  mkdir -p "${slot_dir}"
  find "${slot_dir}" -mindepth 1 -delete
  cp -a "${src}/." "${slot_dir}/"
  printf '{"ok":true,"app":"astra-dev","sha":"%s","version":"%s","slot":"%s","builtAt":"%s"}\n' \
    "${sha}" "${version}" "${idle}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${slot_dir}/ready.json"

  point next "${idle}"
  probe next "${sha}" || die "idle slot ${idle} is not healthy; live slot untouched"

  point current "${idle}"
  reload_nginx
  if ! probe current "${sha}"; then
    log "new slot failed after switch: rolling back to ${live}"
    if [ "${live}" != none ]; then
      point current "${live}"
      reload_nginx
    fi
    die "deploy of ${sha} rolled back"
  fi
  log "deployed ${sha} (v${version}) to ${idle}; ${live} stays up for rollback"
}

cmd_rollback() {
  local live prev
  live=$(live_slot)
  [ "${live}" != none ] || die "no live slot"
  prev=$(other_slot "${live}")
  [ -f "${BASE}/${prev}/ready.json" ] || die "slot ${prev} has no previous build to roll back to"
  log "rollback: ${live} -> ${prev}"
  point current "${prev}"
  reload_nginx
  probe current || die "rollback target ${prev} is not healthy"
}

cmd_status() {
  local live s
  live=$(live_slot)
  log "live=${live}"
  for s in blue green; do
    if [ -f "${BASE}/${s}/ready.json" ]; then log "${s}: $(cat "${BASE}/${s}/ready.json")"; else log "${s}: empty"; fi
  done
}

case "${1:-}" in
  deploy) shift; cmd_deploy "$@" ;;
  rollback) cmd_rollback ;;
  status) cmd_status ;;
  *) die "usage: $0 deploy <sha> <dist-dir> [version] | rollback | status" ;;
esac
