#!/usr/bin/env bash
# Blue/green deploy of the Astra Dev static site (development.adastrarp.com).
#
# Installed on the VPS as /home/hermes/deploy/astra-dev.sh by
# .github/workflows/deploy.yml (the workflow copies it from the repo on every
# run, so the repo copy is the source of truth). Never run it by hand to ship
# code: deploys go through the workflow.
#
# Usage:
#   astra-dev.sh deploy <sha> <dist-dir> [version] [server-dir]
#                                                    build output -> idle slot -> switch
#   astra-dev.sh rollback                            point `current` back at the other slot
#   astra-dev.sh status                              print live slot and both ready.json
#
# Layout (see ARCHITECTURE.md):
#   /var/www/development.adastrarp.com/{blue,green}  one build each
#   .../current  -> live slot (nginx root for everyone)
#   .../next     -> idle slot (nginx serves it only to loopback + X-Deploy-Slot: next)
#   .../upstreams.conf  ports of the live and idle API server (written here, included by the vhost)
#
# API server stage (optional, docs/server/README.md): when [server-dir] is given AND the systemd
# user unit astra-dev@.service is installed, the same slot flip also moves the API:
#   ~/deploy/astra-dev-server/{blue,green}  one server bundle each, run by astra-dev@<slot>
#   blue = 127.0.0.1:4101, green = 127.0.0.1:4102 (must match server/src/config.ts)
# Without the unit the stage is skipped with a warning and the static deploy proceeds as before.

set -euo pipefail

DOMAIN="development.adastrarp.com"
BASE="/var/www/${DOMAIN}"
NGINX="/usr/sbin/nginx"
SYSTEMCTL="/usr/bin/systemctl"
SRV_BASE="${HOME}/deploy/astra-dev-server"
UNIT_FILE="${HOME}/.config/systemd/user/astra-dev@.service"
# Set to 1 by cmd_deploy when the API stage runs; cmd_rollback detects it per slot.
API=0

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

# ---- API server (user units astra-dev@<slot>, loopback ports) ----

port_of() { case "$1" in blue) echo 4101 ;; green) echo 4102 ;; *) echo 0 ;; esac; }

# `systemctl --user` from a non-login shell (the runner) needs the user bus path.
user_systemctl() {
  XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}" "${SYSTEMCTL}" --user "$@"
}

# upstreams.conf is derived from the symlinks, so it can never disagree with them:
# astra_dev_api (live) -> server of `current`, astra_dev_api_next (idle) -> server of `next`.
# A slot without a server bundle falls back to the other one, so /api/ never points at nothing.
write_upstreams() {
  local cur nxt cp np tmp
  cur=$(live_slot)
  nxt=$([ -L "${BASE}/next" ] && basename "$(readlink "${BASE}/next")" || echo none)
  [ "${cur}" != none ] || cur=${nxt}
  [ "${nxt}" != none ] || nxt=${cur}
  [ -f "${SRV_BASE}/${cur}/build.json" ] || cur=$(other_slot "${cur}")
  [ -f "${SRV_BASE}/${nxt}/build.json" ] || nxt=$(other_slot "${nxt}")
  cp=$(port_of "${cur}")
  np=$(port_of "${nxt}")
  tmp="${BASE}/upstreams.conf.tmp"
  {
    printf '# written by astra-dev.sh: do not edit\n'
    printf 'upstream astra_dev_api { server 127.0.0.1:%s; keepalive 4; }\n' "${cp}"
    printf 'upstream astra_dev_api_next { server 127.0.0.1:%s; keepalive 4; }\n' "${np}"
  } > "${tmp}"
  mv -Tf "${tmp}" "${BASE}/upstreams.conf"
}

# The API server of a slot answers /ready with the expected sha (loopback, no nginx in between).
wait_api() { # wait_api <slot> <sha>
  local port i body
  port=$(port_of "$1")
  for i in $(seq 1 20); do
    if body=$(curl -fsS --max-time 3 "http://127.0.0.1:${port}/ready" 2>/dev/null) \
      && grep -q '"ok":true' <<<"${body}" && grep -q "\"sha\":\"$2\"" <<<"${body}"; then
      log "api ${1}: ready ${body}"
      return 0
    fi
    sleep 1
  done
  log "api ${1}: not ready on 127.0.0.1:${port} (journalctl --user -u astra-dev@${1})"
  return 1
}

# Real check against the real vhost (TLS, server_name, root). The request goes to
# the local nginx; `X-Deploy-Slot: next` makes the vhost serve the idle slot.
# /ready.json must carry the expected sha: the SPA fallback answers 200 for any
# path, so a plain 200 proves nothing.
#
# With the API stage on (API=1) the same slot header also has to reach the API server through the
# vhost: /api/ready must be ok and carry the sha.
api_probe() { # api_probe <current|next> [sha]
  local body
  body=$(curl -fsS --max-time 5 \
    --resolve "${DOMAIN}:443:127.0.0.1" \
    -H "X-Deploy-Slot: $1" \
    "https://${DOMAIN}/api/ready" 2>/dev/null) || return 1
  grep -q '"ok":true' <<<"${body}" \
    && { [ -z "${2:-}" ] || grep -q "\"sha\":\"$2\"" <<<"${body}"; }
}

probe() { # probe <current|next> [sha]
  local slot=$1 want=${2:-} body i
  for i in $(seq 1 10); do
    if body=$(curl -fsS --max-time 5 \
        --resolve "${DOMAIN}:443:127.0.0.1" \
        -H "X-Deploy-Slot: ${slot}" \
        "https://${DOMAIN}/ready.json" 2>/dev/null) \
      && grep -q '"ok":true' <<<"${body}" \
      && { [ -z "${want}" ] || grep -q "\"sha\":\"${want}\"" <<<"${body}"; } \
      && { [ "${API}" != 1 ] || api_probe "${slot}" "${want}"; } \
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
  local sha=${1:-} src=${2:-} version=${3:-unknown} server_src=${4:-}
  [[ "${sha}" =~ ^[0-9a-f]{7,40}$ ]] || die "usage: deploy <sha> <dist-dir> [version] [server-dir] (sha must be hex)"
  [ -f "${src}/index.html" ] || die "${src}/index.html not found: build first"
  [ -d "${BASE}" ] || die "${BASE} missing: VPS setup not done (docs/deploy/README.md)"

  API=0
  if [ -n "${server_src}" ]; then
    if [ ! -f "${UNIT_FILE}" ]; then
      log "WARNING: API stage skipped: ${UNIT_FILE} is not installed (docs/server/README.md, Deploy)"
    elif [ ! -f "${server_src}/src/main.ts" ] || [ ! -f "${server_src}/data/index.json" ]; then
      die "server bundle in ${server_src} is incomplete (needs src/main.ts and data/index.json)"
    else
      API=1
    fi
  fi

  local live idle slot_dir srv_dir now
  live=$(live_slot)
  idle=$(other_slot "${live}")
  slot_dir="${BASE}/${idle}"
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  log "live=${live} idle=${idle} sha=${sha} api=${API}"

  mkdir -p "${slot_dir}"
  find "${slot_dir}" -mindepth 1 -delete
  cp -a "${src}/." "${slot_dir}/"
  printf '{"ok":true,"app":"astra-dev","sha":"%s","version":"%s","slot":"%s","builtAt":"%s"}\n' \
    "${sha}" "${version}" "${idle}" "${now}" > "${slot_dir}/ready.json"

  if [ "${API}" = 1 ]; then
    # The idle slot's server serves nobody (only the probe), so it is safe to stop and replace.
    srv_dir="${SRV_BASE}/${idle}"
    user_systemctl stop "astra-dev@${idle}" || true
    mkdir -p "${srv_dir}"
    find "${srv_dir}" -mindepth 1 -delete
    cp -a "${server_src}/." "${srv_dir}/"
    printf '{"sha":"%s","version":"%s","builtAt":"%s"}\n' "${sha}" "${version}" "${now}" > "${srv_dir}/build.json"
    user_systemctl restart "astra-dev@${idle}"
    wait_api "${idle}" "${sha}" || die "API server of idle slot ${idle} is not healthy; live slot untouched"
  fi

  point next "${idle}"
  if [ "${API}" = 1 ]; then write_upstreams; reload_nginx; fi
  probe next "${sha}" || die "idle slot ${idle} is not healthy; live slot untouched"

  point current "${idle}"
  if [ "${API}" = 1 ]; then write_upstreams; fi
  reload_nginx
  if ! probe current "${sha}"; then
    log "new slot failed after switch: rolling back to ${live}"
    if [ "${live}" != none ]; then
      point current "${live}"
      if [ "${API}" = 1 ]; then write_upstreams; fi
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
  if [ -f "${SRV_BASE}/${prev}/build.json" ]; then
    API=1
    user_systemctl start "astra-dev@${prev}" || true
    write_upstreams
  fi
  reload_nginx
  probe current || die "rollback target ${prev} is not healthy"
}

cmd_status() {
  local live s
  live=$(live_slot)
  log "live=${live}"
  for s in blue green; do
    if [ -f "${BASE}/${s}/ready.json" ]; then log "${s}: $(cat "${BASE}/${s}/ready.json")"; else log "${s}: empty"; fi
    if [ -f "${SRV_BASE}/${s}/build.json" ]; then log "${s} api: $(cat "${SRV_BASE}/${s}/build.json") $(user_systemctl is-active "astra-dev@${s}" 2>&1 || true)"; fi
  done
}

case "${1:-}" in
  deploy) shift; cmd_deploy "$@" ;;
  rollback) cmd_rollback ;;
  status) cmd_status ;;
  *) die "usage: $0 deploy <sha> <dist-dir> [version] [server-dir] | rollback | status" ;;
esac
