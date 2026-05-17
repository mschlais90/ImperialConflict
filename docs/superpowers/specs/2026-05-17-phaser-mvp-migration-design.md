# Phaser MVP Migration Design

## Context

Imperial Conflict is currently a Godot 4.4 project with GDScript models, singleton engines, scene scripts, and UI panels. The Phaser rewrite will start side-by-side in a new `phaser/` web app folder so the Godot project remains available as a behavior reference until the browser version reaches parity.

The first milestone is an MVP, not full parity. The MVP must be playable and must preserve the core simulation loop. Non-MVP parity gaps will be tracked in `docs/phaser-migration-backlog.md` and implemented in later passes.

## Goals

- Build a Phaser + TypeScript project in `phaser/`.
- Keep the simulation core separate from Phaser rendering and DOM UI.
- Port the main playable loop: new game, galaxy generation, tick economy, building queues, unit training, fleet travel, combat, AI turns, victory and defeat.
- Provide enough UI to play the game from start to finish.
- Track all deferred Godot features in a follow-up backlog.

## Non-Goals

- Do not remove the Godot project during the MVP migration.
- Do not attempt pixel-perfect visual parity in the first pass.
- Do not build multiplayer, persistence, or server infrastructure in the MVP.
- Do not introduce a separate UI framework unless the MVP proves the HTML overlay is too limiting.

## Architecture

The Phaser rewrite will have three layers:

1. Pure TypeScript simulation core.
2. Phaser rendering and input scenes.
3. HTML/CSS overlay panels.

The simulation core owns game state and rules. It must not import Phaser or browser DOM APIs. Phaser scenes and HTML panels interact with the core through command functions and state snapshots. This keeps economy, combat, AI, and galaxy generation testable without launching a browser canvas.

## Project Structure

The new web app will live under `phaser/`:

```text
phaser/
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  src/
    main.ts
    styles.css
    core/
      data/
      models/
      engines/
      ai/
      commands/
      events/
      gameState.ts
    scenes/
      BootScene.ts
      GalaxyScene.ts
      SystemScene.ts
    ui/
      overlay.ts
      startScreen.ts
      hud.ts
      planetPanel.ts
      fleetPanel.ts
      researchPanel.ts
      notifications.ts
    tests/
```

The exact file split may change during planning, but the dependency direction must not: `core/` cannot depend on `scenes/` or `ui/`.

## Simulation Core

The core will port the current Godot data and rules into TypeScript:

- Data definitions from `data/building_data.gd`, `data/unit_data.gd`, and `data/science_data.gd`.
- Models from `models/build_order.gd`, `models/empire.gd`, `models/fleet.gd`, `models/planet.gd`, and `models/solar_system.gd`.
- State and lookup behavior from `autoloads/galaxy_data.gd`.
- Tick processing from `autoloads/tick_engine.gd` and `autoloads/economy_engine.gd`.
- Combat resolution from `autoloads/combat_engine.gd`.
- Special-operation rules from `autoloads/ops_engine.gd`, exposed to the UI through a minimal command API.
- AI behavior from `ai/ai_controller.gd`, simplified only where needed to keep the MVP shippable.

The core will expose:

- `createNewGame(options)` to initialize state.
- `advanceTick(state)` to mutate or replace state for one tick.
- Query helpers for selected empires, systems, planets, fleets, resources, and net worth.
- Command functions for player actions such as queueing builds, training units, sending fleets, changing research allocation, and performing operations.
- An event log for notifications, combat reports, colonization, build completions, speed changes, and game-over state.

## Phaser Layer

Phaser will render and handle spatial input:

- `BootScene` initializes assets, the core state container, and the overlay.
- `GalaxyScene` renders systems, ownership colors, home markers, pan, zoom, and system selection.
- `SystemScene` renders planets in the selected system, planet ownership, resource bonuses, portals, hover states, and planet selection.

Scenes will read snapshots from the core and dispatch commands or selection events. They will not directly mutate nested state outside the core command API.

## HTML/CSS UI Layer

The MVP UI will use a DOM overlay instead of building every management panel inside Phaser. This matches the management-heavy nature of the game and keeps forms, buttons, scrollable lists, and numeric inputs practical.

MVP panels:

- Start screen with empire name input.
- HUD with resources, tick, speed, net worth, and planet count.
- Planet panel with ownership, population, buildings, build queue, build controls, unit summary, exploration, and attack controls.
- Fleet panel or fleet section with basic unit training and fleet launch.
- Research panel with allocation controls and science progress.
- Notification feed.
- Simple game-over screen.

## MVP Gameplay Scope

The MVP is complete when a player can:

- Start a new single-player game.
- Inspect the galaxy map and enter a system view.
- Select owned, enemy, and uncolonized planets.
- Queue buildings and explorer ships on owned planets.
- Train basic units.
- Advance ticks at paused, normal, fast, and fastest speeds.
- See resources, population, research, build queues, fleets, and ownership update over time.
- Colonize unowned planets with explorers.
- Send fleets to friendly, unowned, and enemy planets.
- Resolve combat and transfer ownership when attacks succeed.
- Play against AI empires that build, colonize, train units, attack, and perform basic operations.
- Win when all AI empires are eliminated and lose when the player empire is eliminated.

## Testing Strategy

Tests will focus on the pure core first:

- Data definitions load with expected costs, production, and build ticks.
- Galaxy generation creates the expected number of systems, planets, player empire, AI empires, and home planets.
- Economy ticks advance build queues, produce resources, consume food, grow or starve population, apply upkeep, and generate research.
- Fleet travel decrements ticks and resolves arrivals.
- Combat phases preserve the current Godot formulas and outcomes.
- AI can process ticks without throwing and can queue/build/launch actions under controlled state.

Browser or integration checks will verify that the Phaser app starts, the galaxy renders nonblank, selecting a system shows planets, and the HUD reflects tick updates.

## Follow-Up Parity Backlog

Deferred Godot parity work will be tracked in `docs/phaser-migration-backlog.md`. The backlog starts with panels, visual polish, save/load, accessibility, and final Godot cleanup. New gaps discovered during implementation should be added there before they are deferred.

## Risks

- The Godot UI currently contains gameplay behavior, especially around fleets, portals, exploration, and build queue commands. During migration, that behavior must be moved into core commands so Phaser and DOM UI do not duplicate rules.
- Randomness affects galaxy generation, combat, AI, and operations. The TypeScript core should use an injectable RNG for deterministic tests where practical.
- The AI can create hard-to-debug state changes. The MVP should port it after core player commands and economy/combat tests exist.
- A Phaser-only UI would be cumbersome for this management-heavy game. The MVP will use DOM overlay panels to reduce this risk.

## Acceptance Criteria

- `phaser/` can be installed and run independently of Godot.
- The Godot project remains untouched except for documentation and ignore rules.
- Core tests cover the main formulas and state transitions.
- The browser app supports the MVP gameplay scope listed above.
- Deferred parity items are documented in `docs/phaser-migration-backlog.md` and not silently dropped.
