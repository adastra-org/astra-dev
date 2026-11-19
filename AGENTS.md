# Astra Dev: agent guide

Tool for the Ad Astra team to develop the FiveM server (docs, natives, tools, `/chat`). Stack, deploy and layout: [ARCHITECTURE.md](ARCHITECTURE.md), [docs/README.md](docs/README.md). UI: [DESIGN.md](DESIGN.md).

## FiveM server code (Lua, `server.cfg`, `fxmanifest.lua`)

The server runs Legacy today; Enhanced is the migration target ([docs/server-dev/README.md](docs/server-dev/README.md) holds the checklist). Write code that is valid on both.

- **Authority**: the server decides. Validate money, inventory, position, XP, jobs and permissions in server code, inside every `RegisterNetEvent` handler. A client check is a UX hint, never a gate.
- **Net events**: `RegisterNetEvent` does not stop same-side callers. On the client, accept an event only when `source == 65535` (the server). On the server, treat every argument as attacker-controlled and take the player from `source`, not from a parameter.
- **Sandbox**: write only inside the same resource, with `@resource/path` paths; `io.readdir()` returns a handle, iterate it with `:lines()`. Reach for `add_filesystem_permission`, `add_unsafe_worker_permission` or `add_unsafe_child_process_permission` only for a fully trusted resource, and ask Faku first.
- **Player IDs**: key long-lived data by license identifier. Enhanced reuses server IDs after a disconnect.
- **Config**: `sv_syncTickRate` replaces `sv_useAccurateSends`; `sv_entityLockdown` replaces `sv_protectServerEntities`; `sv_devMode true` replaces `+set moo`.
- **Assets**: Gen9 in `stream_enhanced`, Gen8 in `stream`.
- **NUI**: callbacks run in strict mode by default; opt out per resource with `nui_callback_strict_mode 'false'` in the manifest.

Source pages (pinned import, read them before changing these rules): `.cache/import/fivem-docs/content/docs/developers/{server-security,sandbox,legacy-vs-enhanced}.md`, or `/docs/developers/...` on the site.

## Guard hook

`.claude/settings.json` registers `scripts/server-guard/guard.ts` on `Write|Edit|MultiEdit`. In `.lua` and `.cfg` files it denies APIs the sandbox blocks or Enhanced removed, and asks before sandbox-widening permissions. A denial names the replacement; apply it. Rules live in `scripts/server-guard/guard.ts` with tests beside it.

## Working here

- Bun only. Before a commit: `bun run check` (hook-gated), tests and typecheck included.
- A `.claude/settings.json` hook adds to the user-level hooks; it cannot switch them off.
