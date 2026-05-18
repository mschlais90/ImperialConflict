# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state: mid-migration

This repo holds two codebases. The original is a Godot 4.4 / GDScript game; it is being rewritten to Phaser 4 + TypeScript under `phaser/`.

- **`phaser/`** — the active codebase. New work happens here.
- **Godot project (repo root: `ai/`, `autoloads/`, `data/`, `models/`, `scenes/`, `project.godot`)** — the **behavior reference**. It stays intact until the Phaser app reaches parity. Do not modify Godot files except docs/ignore rules. When porting a feature, read the corresponding `.gd` file to confirm behavior.

The Phaser MVP is not full parity. Deferred Godot features are tracked in `docs/phaser-migration-backlog.md` — add an item there before deferring it, never silently drop parity.

Migration plan and design spec: `docs/superpowers/plans/2026-05-17-phaser-mvp-migration.md` and `docs/superpowers/specs/2026-05-17-phaser-mvp-migration-design.md`. Work is organized into numbered tasks (Task 1–10).

## Commands

All commands run from `phaser/` (the Godot project at the root has no build system; it just needs Godot 4.4 to open `project.godot`).

```bash
cd phaser
npm install
npm run dev          # Vite dev server at http://127.0.0.1:5173
npm run build        # tsc --noEmit (typecheck) then vite build — must pass before merging
npm test             # vitest run — unit tests for the simulation core
npm run test:watch   # vitest in watch mode
npm run test:e2e     # Playwright smoke test (auto-starts the dev server)
```

Run a single unit test file or test by name:

```bash
npm test -- src/tests/core/economy.test.ts
npm test -- -t "advances build queue"
```

`npm run build` typechecks the whole project. `tsconfig.json` uses `strict`, `noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch` — unused symbols and fallthrough are build errors.

## Architecture

The Phaser app has three layers with a **strict, one-way dependency direction**:

1. **`phaser/src/core/` — pure TypeScript simulation.** Owns all game state and rules. **Must not import Phaser or browser DOM APIs.** This is the single most important constraint and is checked in every code review; keeping the core pure is what makes economy/combat/AI testable in Node without a browser.
2. **`phaser/src/scenes/` — Phaser rendering and spatial input** (`BootScene`, `GalaxyScene`, `SystemScene`).
3. **`phaser/src/ui/` — DOM/HTML overlay panels** (planned for the MVP UI task).

`core/` cannot depend on `scenes/` or `ui/`. Scenes and UI read state snapshots and dispatch player actions through the command API — they do not mutate nested core state directly.

### Godot → TypeScript module mapping

The port is roughly 1:1 by file. When changing a core module, the matching `.gd` file is the source of truth for behavior:

| Godot reference | TypeScript module |
| --- | --- |
| `autoloads/game_manager.gd` | `core/engines/gameManager.ts` (`createNewGame`, galaxy generation) |
| `autoloads/galaxy_data.gd` | `core/galaxy/galaxyData.ts` (`GameState` shape) |
| `autoloads/tick_engine.gd` | `core/engines/tickEngine.ts` (`advanceTick`, speed constants) |
| `autoloads/economy_engine.gd` | `core/engines/economyEngine.ts` |
| `autoloads/combat_engine.gd` | `core/engines/combatEngine.ts` |
| `autoloads/ops_engine.gd` | `core/engines/opsEngine.ts` |
| `ai/ai_controller.gd` | `core/ai/aiController.ts` |
| `data/*_data.gd` | `core/data/buildings.ts`, `units.ts`, `sciences.ts` |
| `models/*.gd` | `core/models/types.ts` |
| `autoloads/event_bus.gd` (signal bus) | `core/events/eventLog.ts` (append-only log) |

### Core simulation model

- **Single mutable `GameState`** (`core/galaxy/galaxyData.ts`): flat arrays of `empires`, `systems`, `planets`, `fleets` plus selection IDs and `next*Id` counters. Engines mutate this object in place.
- **IDs are integers.** Cross-references are by ID; resolve them with the helpers in `core/selectors/selectors.ts`. `ownerId === -1` means unowned/neutral.
- **Tick loop:** `advanceTick(state)` increments the tick, then `processEconomyTick` runs per-empire economy, then AI turns for non-player empires, then elimination checks, and appends a `tick_processed` event.
- **RNG is injectable and seeded** (`core/random/rng.ts`), stored on `state.rng`. Pass `createNewGame({ seed })` for deterministic tests. Anything random (galaxy generation, combat, AI, ops) must go through this RNG, not `Math.random()`.
- **Player actions go through commands** (`core/commands/playerCommands.ts`): `queueBuilding`, `queueExplorer`, `trainUnits`, `sendFleet`, `sendExplorer`, `setResearchAllocation`, `performAgentOperation`, `performSpell`. They validate, mutate state, and return a `CommandResult` (`{ ok, message }`). Validate *before* spending resources or rolling RNG.
- **Events are append-only** (`core/events/eventLog.ts`): use `appendEvent`; never mutate or reorder `state.events`. This drives notifications, combat reports, build completions, and game-over.

### Phaser ↔ core bridge

`main.ts` builds an `AppController` (`{ playerName, state, overlay }`) and stores it in the Phaser registry under `APP_CONTROLLER_KEY`. `BootScene` calls `createNewGame` and assigns `controller.state`; scenes read state and call `controller.overlay.render()` to refresh the DOM overlay.

## Conventions

- **Match Godot behavior, including representation choices.** Example: `GameSpeed` is the numeric union `0 | 1 | 2 | 4` (paused/normal/fast/fastest) to mirror Godot, not string labels.
- **Keep the core pure.** No timers, no `async`, no DOM, no Phaser inside `core/`. Side effects belong in scenes/UI.
- **Don't pre-mutate.** Build a plan and validate it fully before mutating `GameState` — partial mutations on a failed command/attack are a recurring class of bug here.
- Unit tests live in `phaser/src/tests/core/` (Vitest, node environment); the Playwright smoke test is in `phaser/src/tests/e2e/`.
