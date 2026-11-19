# Changelog

Notable changes per release, newest first. Format: [Keep a Changelog](https://keepachangelog.com), versions follow `package.json`. Each PR adds its entry under `## [Unreleased]`; the release PR renames it to the version.

## [0.22.0] - 2026-11-19

### Added

- Compartir una charla de `/ask` por enlace de solo lectura (#34): botón en el rail, diálogo con vista previa exacta, audiencia `staff` (por defecto) o `public` (por ahora solo la crea staff), vencimiento 24 h / 7 d / 30 d, copiar, "Mis enlaces" y revocar. Lectura en `/ask/s/:token` con banner de captura sin verificar, `noindex` y `no-referrer`.
- Server: operaciones GraphQL `shareConfig`, `shareChat`, `sharedChat`, `myShares`, `revokeShare`. SQLite propio (`SHARE_DB_PATH`, apagado si falta), token de 128 bits guardado solo como hash, payload por allow-list, fuentes reconstruidas desde el índice, límites y rate limits (`SHARE_*`, `RATE_SHARE_*`).

### Changed

- `cleanText` también quita los aislantes bidi U+2066 a U+2069 (afecta al chat).
- `/graphql` rechaza cuerpos de más de 128 KiB.

## [0.20.0] - 2026-11-19

### Added

- `/ask`: select text in an answer and quote it in the next question ("Citar en la pregunta", #36). The quote carries the sources of the fragment (its `[n]` cites, or its block's when it has none) and they replace the previous answer's sources for that follow-up. Up to 2 quotes per question, shown as removable chips above the composer and as a quote block in the sent turn; Edit and Resend keep them. Client-only: no change to `POST /api/chat`.

## [0.19.12] - 2026-11-19

### Fixed

- `CodeBlock`: the sandbox `import()` calls moved out of the component so the React Compiler can optimize it (`react-hooks-js/todo`, #24). Loading stays lazy.

## [0.19.11] - 2026-11-19

### Fixed

- Onboarding dialog: the tour body mounts on open, so step and draft start fresh without a reset effect (#52).
- `useRemote`: `loading` and `error` are derived in render instead of a synchronous `setState` in the effect (#29).

## [0.19.10] - 2026-11-19

### Added

- Deploy workflow can be run by hand from the Actions tab (`workflow_dispatch`).

## [0.19.9] - 2026-11-19

### Added

- `AGENTS.md`, guard hook for server-side FiveM code and Enhanced migration checklist (#50).

### Fixed

- Onboarding dialog: `skip` declared before its first use (#50).
- `usage-report` test pins the clock (#49, #50).

## [0.19.3] - 2026-11-16

### Added

- MLO audit of the server and fixes checklist per MLO (#49).

## [0.19.2] - 2026-11-13

### Added

- Onboarding with Ether: chat tone, length and color (#44).
- Single collapsible group for steps and reasoning (#43).

### Fixed

- Theme in follow-ups, drawing glossary and real speed (#46).

## [0.17.3] - 2026-11-13

### Added

- `/ask` page with context budget, speed and edit/resend (#31).
- User memories in localStorage as chat context (#32).

### Fixed

- `/ask` fixes: ES->EN retrieval, follow-ups, UI (#39).

## [0.14.2] - 2026-11-13

### Added

- Owner role, usage records and AI dashboard (#30).

## [0.12.0] - 2026-11-13

### Added

- Local LLM provider for loopback OpenAI-compatible servers (#20).
- Follow-up decision step with Liquid d1 (#21).
- Context gate, `<entorno>`, local fallback, `bun dev --local` and activity view (#23).

## [0.10.1] - 2026-11-12

Security-sensitive: lands the M4 sandbox.

### Added

- M4 sandbox and M5 roadmap on dev (#19).
- `/tools` playground (#19).
- Collapsible sidebar (#19).

## [0.8.0] - 2026-11-12

### Added

- Published natives, ES/EN interface and translation pipeline (#18).

## [0.6.1] - 2026-11-12

### Added

- Natives importer (GTA + CFX) and fivem-docs importer (#10).
- Natives in the server index, exact name/hash lookup (#11).
- Offline embeddings, binary vectors and vector reuse (#12).
- Vehicle docs: flags, armored glass, collision materials and shaders (#8).

### Changed

- Server overlaps independent awaits (#13).

## [0.4.0] - 2026-11-10

### Added

- Docs engine (M1) (#4).
- Ctrl+K command palette and floating-pill header (#6).
- Ask Ether read-only chat server, server half of M3 (#7).

### Fixed

- No text selection when toggling a collapsible (#5).

## [0.1.0] - 2026-11-10

### Added

- Blue/green deploy, nginx vhost and ARCHITECTURE (M0 infra) (#1).
- Shell: sidebar, top bar, router and Ad Astra tokens (#2).
