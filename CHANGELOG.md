# Changelog

Notable changes per release, newest first. Format: [Keep a Changelog](https://keepachangelog.com), versions follow `package.json`. Each PR adds its entry under `## [Unreleased]`; the release PR renames it to the version.

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
