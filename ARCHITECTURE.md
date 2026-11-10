# Architecture

Extends the WeFaber house architecture (`~/.claude/standards/ARCHITECTURE.md`). Specifics and deviations only.
Sibling repo with the same org pattern: `adastra-org/adastra-site`.

Astra Dev is a **tool** for the Ad Astra team (docs, tools and systems to develop the FiveM server), published at
`https://development.adastrarp.com`. Plan: `docs/plan/README.md`.

## Decision: static site now, minimal server later

Open decision 1 of the plan, resolved as recommended:

- **Now (M0-M2, M4 client side):** a static site. Docs are Markdown in `content/` (this repo, so the history is git's),
  rendered to the SPA at build time. Nginx serves `dist/`. No process to run, nothing to keep alive.
- **M3 Ask Ether (v0.4.0, `server/`):** a Bun server (Elysia shell, Yoga + Pothos at `/graphql`, SSE for the streamed
  chat answer, `/health` and `/ready`) behind `/api/`, loopback only, as a systemd user template unit
  `astra-dev@.service`. It is a retrieval-augmented completion with **no tools** (the public chat is never connected to
  Ether/Hermes). Design, security model and env vars: [docs/server/README.md](docs/server/README.md). Deploy pieces exist
  in the repo but are applied on the VPS by hand once; until then the workflow skips the API stage.
- **Later (M5 GitHub cache):** reuses the same server.
- **Sandbox (M4):** WASM Lua in the browser first (plan decision 2): no server surface.

The static site and the server share the blue/green slot names, so adding the server does not change the
deploy model: the slot symlink flips, and the unit for that slot restarts.

## Shape

```
browser ──► nginx (development.adastrarp.com, TLS)
              └─ /  ──► /var/www/development.adastrarp.com/current ──► blue | green   (Vite SPA build)
              └─ /ready.json   build identity: {"ok":true,"sha":...,"version":...,"slot":...}

              └─ /api/*  ──► astra-dev@<slot> (Bun, 127.0.0.1:4101 blue | 4102 green; nginx strips /api)
```

## Deploy

GitOps, blue/green, per the house delivery rules. Nothing is deployed by hand.

| Item          | Value                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Domain        | `development.adastrarp.com`                                                                        |
| Trigger       | push to `main` (`.github/workflows/deploy.yml`)                                                    |
| Runner        | `adastra-org` self-hosted, labels `self-hosted, linux, x64` (same as `adastra-site`)               |
| Docroot       | `/var/www/development.adastrarp.com/{blue,green}`                                                  |
| Live pointer  | `.../current` symlink (nginx root). `.../next` symlink points at the idle slot                     |
| Deploy script | `deploy/astra-dev.sh` in the repo, installed by the workflow as `/home/hermes/deploy/astra-dev.sh` |
| Vhost         | `deploy/nginx/development.adastrarp.com.conf` (installed once by hand, drift is warned)            |
| Env / secrets | `~/deploy/env/astra-dev.env` (server env, incl. `DEEPSEEK_API_KEY`). Never in the repo             |

Flow of a deploy:

1. Checkout with full history (`fetch-depth: 0`, so each doc can show its `git log`), `bun install --frozen-lockfile`,
   `bun run check`, `bun run build` on the runner.
2. `astra-dev.sh deploy <sha> dist <version>`: clear the idle slot, copy `dist/`, write `ready.json` with the sha.
3. Probe the idle slot through the **real vhost** (TLS, server_name, root): the request goes to local nginx with
   `X-Deploy-Slot: next`, honoured only from loopback. `/ready.json` must contain the sha (the SPA fallback answers 200
   for any path, so a bare 200 proves nothing). Fails here: live slot untouched.
4. Switch `current` atomically (`ln` + `mv -T`), `nginx -t`, reload nginx.
5. Probe `current` for the sha. Fails here: the script points `current` back at the previous slot.
6. Workflow probes `https://development.adastrarp.com/ready.json` over public DNS. Fails here: the workflow runs
   `astra-dev.sh rollback`.

Rollback = flip the symlink to the other slot (`astra-dev.sh rollback`), never a rebuild. The previous slot keeps its
last build until the next deploy overwrites it.

Static assets: `/assets/*` immutable (Vite hashes the names), `index.html` and `ready.json` never cached.

## Deviations

| House rule                           | Today                          | Why / plan                                                                                                                                                              |
| ------------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One Bun process per app, `/ready`    | Static site + server (M3)      | The site is static (`ready.json`); the API server has `/ready`. API stage is skipped until the unit is installed                                                        |
| `/home/hermes/deploy/<app>.sh <sha>` | Workflow installs it from repo | Repo copy is the source of truth, no drift. Same idea as adastra-site vhost install                                                                                     |
| Tools are tailnet-only               | Public vhost                   | Plan decision 4 (access) is open. If staff-only: Cloudflare Access in front, service token for the deploy probe                                                         |
| Branch protection on `main` / `dev`  | Not applied                    | Private repos on the current GitHub plan cannot have it (HTTP 403, same in `adastra-site`). Review gate is by convention until the org upgrades or the repo goes public |

## Frontend

React 19 + React Compiler, Vite, Tailwind v4, motion, animejs, oxlint, oxfmt. Alias `@/*` → `src/*`. Design:
`DESIGN.md` (extends `adastra-site`'s), tokens copied from the Ad Astra DS into `design/tokens.json`, never edited here.

## Checks

`checks.yml` and `format.yml` run on GitHub-hosted runners (pull requests and push to `main`). `deploy.yml` reruns
`bun run check` on the self-hosted runner before building, so a deploy never ships what CI would reject.

## Secrets

Server env: `~/deploy/env/astra-dev.env` (systemd `EnvironmentFile`; variables in docs/server/README.md). Public
build-time variables go in `.env` (gitignored) and may only hold values safe to ship to the browser.
