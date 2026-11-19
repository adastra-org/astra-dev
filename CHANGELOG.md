# Changelog

Notable changes per release, newest first. Format: [Keep a Changelog](https://keepachangelog.com), versions follow `package.json`. Each PR adds its entry under `## [Unreleased]`; the release PR renames it to the version.

## [0.21.0] - 2026-11-19

### Added

- `/ask`: `@` in the composer attaches a saved conversation, a native or an issue as context for the next question (#33). Conversations are the ones saved in this browser (`localStorage`) and travel as a bounded summary; natives and issues are resolved by the server (issues for staff only).
- `POST /chat` accepts `mentions` (max 5, strict validation, never cached, count-only logging); GraphQL `project.issues(query, limit)` for the picker.

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
