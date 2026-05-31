# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a single-player/multiplayer 4X space strategy game built with Phaser 4 + TypeScript under `phaser/`.

## Commands

All commands run from `phaser/`.

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

### Core modules

| Module | Description |
| --- | --- |
| `core/engines/gameManager.ts` | `createNewGame`, galaxy generation |
| `core/galaxy/galaxyData.ts` | `GameState` shape |
| `core/engines/tickEngine.ts` | `advanceTick`, speed constants |
| `core/engines/economyEngine.ts` | Per-empire economy processing |
| `core/engines/combatEngine.ts` | Fleet combat resolution |
| `core/engines/opsEngine.ts` | Agent ops and wizard spells |
| `core/ai/aiController.ts` | AI decision-making |
| `core/data/buildings.ts`, `units.ts`, `sciences.ts` | Static game data |
| `core/models/types.ts` | Type definitions |
| `core/events/eventLog.ts` | Append-only event log |

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

- **Keep the core pure.** No timers, no `async`, no DOM, no Phaser inside `core/`. Side effects belong in scenes/UI.
- **Don't pre-mutate.** Build a plan and validate it fully before mutating `GameState` — partial mutations on a failed command/attack are a recurring class of bug here.
- Unit tests live in `phaser/src/tests/core/` (Vitest, node environment); the Playwright smoke test is in `phaser/src/tests/e2e/`.
