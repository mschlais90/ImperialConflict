# Phaser MVP Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a side-by-side Phaser + TypeScript MVP of Imperial Conflict with a pure simulation core separated from Phaser rendering and DOM UI.

**Architecture:** The new `phaser/` app uses Vite, Phaser, TypeScript, Vitest, and Playwright. `phaser/src/core/` owns all state and rules and cannot import Phaser or DOM APIs; `phaser/src/scenes/` renders map/system views; `phaser/src/ui/` renders HTML overlay panels and dispatches core commands.

**Tech Stack:** TypeScript, Phaser, Vite, Vitest, Playwright, plain HTML/CSS.

---

## File Structure

Create these files under `phaser/`:

```text
phaser/
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  playwright.config.ts
  src/
    main.ts
    styles.css
    core/
      ai/aiController.ts
      commands/playerCommands.ts
      data/buildings.ts
      data/sciences.ts
      data/units.ts
      engines/combatEngine.ts
      engines/economyEngine.ts
      engines/gameManager.ts
      engines/opsEngine.ts
      engines/tickEngine.ts
      events/eventLog.ts
      galaxy/galaxyData.ts
      models/types.ts
      random/rng.ts
      selectors/selectors.ts
    scenes/
      BootScene.ts
      GalaxyScene.ts
      SystemScene.ts
    ui/
      dom.ts
      fleetPanel.ts
      hud.ts
      notifications.ts
      overlay.ts
      planetPanel.ts
      researchPanel.ts
      startScreen.ts
    tests/
      core/data.test.ts
      core/galaxy.test.ts
      core/economy.test.ts
      core/combat.test.ts
      core/commands.test.ts
      core/ai.test.ts
      e2e/app.spec.ts
```

Reference Godot files remain in place and are read-only unless a task explicitly says otherwise.

---

### Task 1: Scaffold Phaser/Vite App

**Files:**
- Create: `phaser/package.json`
- Create: `phaser/index.html`
- Create: `phaser/tsconfig.json`
- Create: `phaser/vite.config.ts`
- Create: `phaser/playwright.config.ts`
- Create: `phaser/src/main.ts`
- Create: `phaser/src/styles.css`

- [ ] **Step 1: Create package metadata and scripts**

Create `phaser/package.json`:

```json
{
  "name": "imperial-conflict-phaser",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "phaser": "^4.1.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.60.0",
    "typescript": "^6.0.3",
    "vite": "^8.0.13",
    "vitest": "^4.1.6"
  }
}
```

- [ ] **Step 2: Add Vite and TypeScript config**

Create `phaser/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "vite.config.ts", "playwright.config.ts"]
}
```

Create `phaser/vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
  },
});
```

Create `phaser/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/tests/e2e',
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

- [ ] **Step 3: Add browser entry files**

Create `phaser/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Imperial Conflict</title>
  </head>
  <body>
    <div id="game"></div>
    <div id="ui-root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Create `phaser/src/main.ts` with a temporary boot message:

```ts
import './styles.css';

const root = document.querySelector<HTMLDivElement>('#ui-root');
if (!root) {
  throw new Error('Missing #ui-root');
}

root.innerHTML = '<main class="boot">Imperial Conflict Phaser MVP</main>';
```

Create `phaser/src/styles.css`:

```css
:root {
  color: #e8edf7;
  background: #030610;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

html,
body,
#game,
#ui-root {
  width: 100%;
  height: 100%;
  margin: 0;
}

body {
  overflow: hidden;
}

.boot {
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-size: 18px;
}
```

- [ ] **Step 4: Install dependencies**

Run:

```bash
cd phaser
npm install
```

Expected: `package-lock.json` is created and dependencies install without errors.

- [ ] **Step 5: Verify scaffold**

Run:

```bash
cd phaser
npm run build
```

Expected: TypeScript passes and Vite creates `phaser/dist/`.

- [ ] **Step 6: Commit scaffold**

```bash
git add phaser
git commit -m "feat: scaffold Phaser TypeScript app"
```

---

### Task 2: Port Core Types, Data Tables, and RNG

**Files:**
- Create: `phaser/src/core/models/types.ts`
- Create: `phaser/src/core/data/buildings.ts`
- Create: `phaser/src/core/data/units.ts`
- Create: `phaser/src/core/data/sciences.ts`
- Create: `phaser/src/core/random/rng.ts`
- Create: `phaser/src/tests/core/data.test.ts`

- [ ] **Step 1: Write failing data/type tests**

Create `phaser/src/tests/core/data.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BUILDINGS, getBuildCost, getBuildTicks } from '../../core/data/buildings';
import { SCIENCES } from '../../core/data/sciences';
import { UNITS } from '../../core/data/units';
import { createPlanet } from '../../core/models/types';
import { createSeededRng } from '../../core/random/rng';

describe('ported data tables', () => {
  it('ports the Godot building definitions used by the MVP', () => {
    expect(BUILDINGS.mine.cost).toEqual({ gc: 200, food: 5, endurium: 1 });
    expect(BUILDINGS.farm.production).toEqual({ food: 100 });
    expect(BUILDINGS.portal.buildTicks).toBe(40);
  });

  it('ports unit costs and transport capacity', () => {
    expect(UNITS.fighter.networth).toBe(3);
    expect(UNITS.explorer.cost).toEqual({ gc: 10000 });
    expect(UNITS.transport.capacity).toBe(100);
  });

  it('ports all five science branches', () => {
    expect(Object.keys(SCIENCES).sort()).toEqual(['construction', 'economy', 'military', 'resources', 'welfare']);
  });

  it('applies construction science and overbuild cost rules', () => {
    const planet = createPlanet({ id: 1, planetName: 'Test I', systemId: 1, size: 1 });
    planet.buildings.mine = 1;
    planet.buildQueue.push({ itemType: 'farm', ticksRemaining: 3, category: 'building' });
    expect(getBuildCost('farm', 0, planet).gc).toBe(320);
    expect(getBuildTicks('portal', 100)).toBe(20);
  });

  it('provides deterministic RNG for tests', () => {
    const a = createSeededRng(123);
    const b = createSeededRng(123);
    expect([a.float(), a.intRange(1, 10), a.pick(['a', 'b', 'c'])]).toEqual([
      b.float(),
      b.intRange(1, 10),
      b.pick(['a', 'b', 'c']),
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd phaser
npm test -- src/tests/core/data.test.ts
```

Expected: FAIL because core modules do not exist.

- [ ] **Step 3: Create shared model types and factories**

Create `phaser/src/core/models/types.ts` with exported resource keys, unit keys, model interfaces, and factories:

```ts
export type ResourceKey = 'gc' | 'food' | 'iron' | 'endurium' | 'octarine';
export type ScienceKey = 'military' | 'welfare' | 'economy' | 'construction' | 'resources';
export type UnitKey = 'fighter' | 'bomber' | 'soldier' | 'droid' | 'transport' | 'explorer' | 'agent' | 'wizard';
export type CombatUnitKey = 'fighter' | 'bomber' | 'soldier' | 'droid' | 'transport';
export type BuildingKey =
  | 'mine'
  | 'refinery'
  | 'occult_center'
  | 'farm'
  | 'research_center'
  | 'cash_factory'
  | 'tax_office'
  | 'living_quarter'
  | 'laser'
  | 'portal';

export type BuildCategory = 'building' | 'unit';

export interface BuildOrder {
  itemType: BuildingKey | UnitKey;
  ticksRemaining: number;
  category: BuildCategory;
}

export interface Empire {
  id: number;
  empireName: string;
  isPlayer: boolean;
  color: string;
  homeSystemId: number;
  homePlanetId: number;
  resources: Record<ResourceKey, number>;
  researchPoints: Record<ScienceKey, number>;
  researchAllocation: Record<ScienceKey, number>;
  debuffs: Array<{ type: string; ticksRemaining: number; value: number; planetId?: number }>;
}

export interface Fleet {
  id: number;
  ownerId: number;
  units: Partial<Record<UnitKey, number>>;
  originSystemId: number;
  targetSystemId: number;
  targetPlanetId: number;
  ticksRemaining: number;
  isExploration: boolean;
}

export interface Planet {
  id: number;
  planetName: string;
  systemId: number;
  size: number;
  ownerId: number;
  population: number;
  buildings: Partial<Record<BuildingKey, number>>;
  buildQueue: BuildOrder[];
  hasPortal: boolean;
  resourceBonuses: Partial<Record<ResourceKey, number>>;
  units: Partial<Record<UnitKey, number>>;
}

export interface SolarSystem {
  id: number;
  systemName: string;
  position: { x: number; y: number };
  planetIds: number[];
}

export function createPlanet(input: Pick<Planet, 'id' | 'planetName' | 'systemId' | 'size'>): Planet {
  return {
    ...input,
    ownerId: -1,
    population: 0,
    buildings: {},
    buildQueue: [],
    hasPortal: false,
    resourceBonuses: {},
    units: {},
  };
}

export function createEmpire(input: Pick<Empire, 'id' | 'empireName' | 'isPlayer' | 'color'>): Empire {
  return {
    ...input,
    homeSystemId: -1,
    homePlanetId: -1,
    resources: { gc: 0, food: 0, iron: 0, endurium: 0, octarine: 0 },
    researchPoints: { military: 0, welfare: 0, economy: 0, construction: 0, resources: 0 },
    researchAllocation: { military: 20, welfare: 20, economy: 20, construction: 20, resources: 20 },
    debuffs: [],
  };
}
```

- [ ] **Step 4: Port data tables and helper formulas**

Create `buildings.ts`, `units.ts`, and `sciences.ts` by translating the constants in `data/*.gd`. Use `buildTicks` camelCase in TypeScript. `getBuildCost()` must apply the same construction science discount, overbuild multiplier, and 50% cost floor as `BuildingData.get_build_cost()`.

- [ ] **Step 5: Add seeded RNG**

Create `phaser/src/core/random/rng.ts`:

```ts
export interface Rng {
  float(): number;
  floatRange(min: number, max: number): number;
  intRange(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}

export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  return {
    float: next,
    floatRange: (min, max) => min + next() * (max - min),
    intRange: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
cd phaser
npm test -- src/tests/core/data.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit core data**

```bash
git add phaser/src/core phaser/src/tests/core/data.test.ts
git commit -m "feat: port core data tables"
```

---

### Task 3: Port Galaxy State, Lookups, and New Game Generation

**Files:**
- Create: `phaser/src/core/events/eventLog.ts`
- Create: `phaser/src/core/galaxy/galaxyData.ts`
- Create: `phaser/src/core/engines/gameManager.ts`
- Create: `phaser/src/core/selectors/selectors.ts`
- Create: `phaser/src/tests/core/galaxy.test.ts`

- [ ] **Step 1: Write failing galaxy tests**

Create tests asserting:

```ts
import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../core/engines/gameManager';
import { calcEmpireNetworth, getPlanetsForEmpire, getPlayerEmpire } from '../../core/selectors/selectors';

describe('galaxy generation', () => {
  it('creates the same MVP galaxy shape as Godot', () => {
    const state = createNewGame({ empireName: 'Aurora League', seed: 42 });
    expect(state.systems).toHaveLength(30);
    expect(state.empires).toHaveLength(4);
    expect(state.planets.length).toBeGreaterThanOrEqual(150);
    expect(state.planets.length).toBeLessThanOrEqual(450);
    expect(getPlayerEmpire(state)?.empireName).toBe('Aurora League');
  });

  it('assigns each empire a populated home planet with starting resources', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    for (const empire of state.empires) {
      const planets = getPlanetsForEmpire(state, empire.id);
      expect(planets).toHaveLength(1);
      expect(planets[0].population).toBe(planets[0].size * 10);
      expect(planets[0].buildings.mine).toBe(3);
      expect(empire.resources.gc).toBe(5000);
    }
  });

  it('calculates networth from empire, planets, buildings, population, and units', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = getPlayerEmpire(state);
    expect(player).toBeDefined();
    expect(calcEmpireNetworth(state, player!.id)).toBeGreaterThan(1900);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd phaser
npm test -- src/tests/core/galaxy.test.ts
```

Expected: FAIL because galaxy modules do not exist.

- [ ] **Step 3: Implement `GameState` and event log**

`eventLog.ts` should define event types for `game_started`, `tick_processed`, `speed_changed`, `fleet_launched`, `fleet_arrived`, `battle_resolved`, `building_completed`, `empire_eliminated`, `planet_colonized`, `notification`, and `game_over`.

`galaxyData.ts` should define `GameState` with arrays for `empires`, `systems`, `planets`, `fleets`, `aiControllers`, `events`, `currentTick`, `currentSpeed`, `currentState`, selected IDs, and next ID counters.

- [ ] **Step 4: Port galaxy generation**

Port constants and behavior from `autoloads/galaxy_data.gd`:

- 30 systems.
- 5 to 15 planets per system.
- planet size 30 to 350.
- 3 AI empires plus the player.
- same starting buildings, resources, units, empire colors, and home planet selection strategy.
- resource bonuses on about 30% of planets.
- same Roman numerals for planet names.

- [ ] **Step 5: Implement selectors**

Implement player, empire, system, planet, planets-in-system, planets-for-empire, system-owner, fleets-for-empire, travel-ticks, and empire-networth selectors using the Godot formulas.

- [ ] **Step 6: Run tests**

Run:

```bash
cd phaser
npm test -- src/tests/core/galaxy.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit galaxy state**

```bash
git add phaser/src/core phaser/src/tests/core/galaxy.test.ts
git commit -m "feat: port galaxy generation"
```

---

### Task 4: Port Economy and Tick Engines

**Files:**
- Create: `phaser/src/core/engines/economyEngine.ts`
- Create: `phaser/src/core/engines/tickEngine.ts`
- Create: `phaser/src/tests/core/economy.test.ts`

- [ ] **Step 1: Write failing economy tests**

Create tests covering:

```ts
import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../core/engines/gameManager';
import { advanceTick, setSpeed } from '../../core/engines/tickEngine';
import { getPlanetsForEmpire, getPlayerEmpire } from '../../core/selectors/selectors';

describe('economy and ticks', () => {
  it('advances current tick and emits a tick event', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    advanceTick(state);
    expect(state.currentTick).toBe(1);
    expect(state.events.some((event) => event.type === 'tick_processed' && event.tick === 1)).toBe(true);
  });

  it('completes build queue items and adds buildings', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = getPlayerEmpire(state)!;
    const home = getPlanetsForEmpire(state, player.id)[0];
    home.buildQueue.push({ itemType: 'farm', ticksRemaining: 1, category: 'building' });
    advanceTick(state);
    expect(home.buildings.farm).toBe(4);
  });

  it('produces resources, applies food consumption, and generates research', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = getPlayerEmpire(state)!;
    const foodBefore = player.resources.food;
    const ironBefore = player.resources.iron;
    advanceTick(state);
    expect(player.resources.iron).toBeGreaterThanOrEqual(ironBefore);
    expect(player.resources.food).not.toBe(foodBefore);
    expect(player.researchPoints.military).toBeGreaterThan(0);
  });

  it('updates speed without processing a tick', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    setSpeed(state, 4);
    expect(state.currentSpeed).toBe(4);
    expect(state.currentTick).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd phaser
npm test -- src/tests/core/economy.test.ts
```

Expected: FAIL because economy modules are incomplete.

- [ ] **Step 3: Port tick engine**

Implement speed constants `{ PAUSED: 0, NORMAL: 1, FAST: 2, FASTEST: 4 }`, `setSpeed(state, speed)`, and `advanceTick(state)`. The browser timer will call `advanceTick`; the core function should only process one tick.

- [ ] **Step 4: Port economy processing**

Port these Godot behaviors from `autoloads/economy_engine.gd`:

- advance fleets before empire economy.
- advance all build queue items simultaneously.
- complete unit and building orders.
- production with resource science and resource bonuses.
- 0.5% decay for food, iron, endurium, octarine.
- food consumption, starvation, population growth, upkeep, and research generation.
- debuff countdown and portal restoration.
- elimination checks.

- [ ] **Step 5: Run tests**

Run:

```bash
cd phaser
npm test -- src/tests/core/economy.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit economy engine**

```bash
git add phaser/src/core phaser/src/tests/core/economy.test.ts
git commit -m "feat: port economy tick engine"
```

---

### Task 5: Port Combat, Fleets, Operations, and Player Commands

**Files:**
- Create: `phaser/src/core/engines/combatEngine.ts`
- Create: `phaser/src/core/engines/opsEngine.ts`
- Create: `phaser/src/core/commands/playerCommands.ts`
- Create: `phaser/src/tests/core/combat.test.ts`
- Create: `phaser/src/tests/core/commands.test.ts`
- Modify: `phaser/src/core/engines/economyEngine.ts`

- [ ] **Step 1: Write failing combat tests**

Create `combat.test.ts` with deterministic assertions:

```ts
import { describe, expect, it } from 'vitest';
import { resolveBattle } from '../../core/engines/combatEngine';
import { createNewGame } from '../../core/engines/gameManager';
import { getPlanetsForEmpire } from '../../core/selectors/selectors';

describe('combat engine', () => {
  it('captures a planet when attacker ground power beats defender ground power', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const attacker = state.empires[0];
    const defender = state.empires[1];
    const target = getPlanetsForEmpire(state, defender.id)[0];
    target.units = { soldier: 10, droid: 0, fighter: 0, bomber: 0, transport: 0 };
    const fleet = {
      id: 99,
      ownerId: attacker.id,
      units: { soldier: 100, droid: 0, fighter: 0, bomber: 0, transport: 1 },
      originSystemId: attacker.homeSystemId,
      targetSystemId: target.systemId,
      targetPlanetId: target.id,
      ticksRemaining: 0,
      isExploration: false,
    };
    state.fleets.push(fleet);

    const report = resolveBattle(state, fleet, target);
    expect(report.attackerWon).toBe(true);
    expect(target.ownerId).toBe(attacker.id);
    expect(state.fleets.some((item) => item.id === fleet.id)).toBe(false);
  });
});
```

- [ ] **Step 2: Write failing command tests**

Create `commands.test.ts` covering queue builds, train units, launch explorer, launch attack fleet, and research allocation validation:

```ts
import { describe, expect, it } from 'vitest';
import { queueBuilding, queueExplorer, sendFleet, setResearchAllocation, trainUnits } from '../../core/commands/playerCommands';
import { createNewGame } from '../../core/engines/gameManager';
import { getPlanetsForEmpire } from '../../core/selectors/selectors';

describe('player commands', () => {
  it('queues buildings through the command API', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = state.empires[0];
    const home = getPlanetsForEmpire(state, player.id)[0];
    const result = queueBuilding(state, { empireId: player.id, planetId: home.id, buildingType: 'farm', count: 1 });
    expect(result.ok).toBe(true);
    expect(home.buildQueue.some((order) => order.itemType === 'farm')).toBe(true);
  });

  it('trains affordable units immediately like the Godot fleet panel', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = state.empires[0];
    const home = getPlanetsForEmpire(state, player.id)[0];
    const result = trainUnits(state, { empireId: player.id, planetId: home.id, unitType: 'soldier', count: 2 });
    expect(result.ok).toBe(true);
    expect(home.units.soldier).toBe(52);
  });

  it('rejects research allocation totals that are not 100', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const result = setResearchAllocation(state, {
      empireId: state.empires[0].id,
      allocation: { military: 100, welfare: 0, economy: 0, construction: 0, resources: 1 },
    });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
cd phaser
npm test -- src/tests/core/combat.test.ts src/tests/core/commands.test.ts
```

Expected: FAIL because combat and command modules are incomplete.

- [ ] **Step 4: Port combat engine**

Translate `autoloads/combat_engine.gd` into pure TypeScript. Preserve:

- portal defense pooling.
- air vs ground phase.
- air vs air phase.
- ground vs ground phase.
- stranded ground losses when transports are destroyed.
- ownership transfer and surviving unit assignment.
- battle report shape with phase details.

- [ ] **Step 5: Port operations engine**

Translate `autoloads/ops_engine.gd` for MVP command usage. Include spy, destroy cash, destroy units, sabotage portal, vision, hypnotize, reduce food, and destroy iron. Use injected RNG from state where random rolls are needed.

- [ ] **Step 6: Implement player command API**

`playerCommands.ts` should expose result objects:

```ts
export type CommandResult = { ok: true; message: string } | { ok: false; message: string };
```

Implement `queueBuilding`, `queueExplorer`, `trainUnits`, `sendFleet`, `sendExplorer`, `setResearchAllocation`, `performAgentOperation`, and `performSpell`. These functions must validate ownership, affordability, capacity, target IDs, and research allocation totals before mutating state.

- [ ] **Step 7: Wire fleet arrival to combat and colonization**

Modify `economyEngine.ts` so fleet arrivals call the new combat engine, merge friendly fleets, colonize unowned planets with explorers, and emit matching events.

- [ ] **Step 8: Run tests**

Run:

```bash
cd phaser
npm test -- src/tests/core/combat.test.ts src/tests/core/commands.test.ts src/tests/core/economy.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit combat and commands**

```bash
git add phaser/src/core phaser/src/tests/core/combat.test.ts phaser/src/tests/core/commands.test.ts
git commit -m "feat: port combat fleets and commands"
```

---

### Task 6: Port AI Controller

**Files:**
- Create: `phaser/src/core/ai/aiController.ts`
- Create: `phaser/src/tests/core/ai.test.ts`
- Modify: `phaser/src/core/engines/economyEngine.ts`
- Modify: `phaser/src/core/galaxy/galaxyData.ts`

- [ ] **Step 1: Write failing AI tests**

Create `ai.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { processAiTurn } from '../../core/ai/aiController';
import { createNewGame } from '../../core/engines/gameManager';
import { getPlanetsForEmpire } from '../../core/selectors/selectors';

describe('AI controller', () => {
  it('queues economic buildings for AI empires', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const ai = state.empires.find((empire) => !empire.isPlayer)!;
    processAiTurn(state, ai.id, 1);
    const planets = getPlanetsForEmpire(state, ai.id);
    expect(planets.some((planet) => planet.buildQueue.length > 0)).toBe(true);
  });

  it('does not throw when processing repeated turns', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const ai = state.empires.find((empire) => !empire.isPlayer)!;
    for (let tick = 1; tick <= 120; tick += 1) {
      processAiTurn(state, ai.id, tick);
    }
    expect(getPlanetsForEmpire(state, ai.id).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd phaser
npm test -- src/tests/core/ai.test.ts
```

Expected: FAIL because AI module does not exist.

- [ ] **Step 3: Port AI behavior**

Translate `ai/ai_controller.gd` into `processAiTurn(state, empireId, tickNumber)`. Preserve priorities: build economy, colonize, build military after tick 40, attack after tick 100, perform operations every 5 ticks after tick 100. Keep attack memory in `state.aiControllers[empireId]`.

- [ ] **Step 4: Wire AI into economy processing**

Modify `processEconomyTick()` so each non-player empire runs `processAiTurn()` after empire economy, matching the Godot flow.

- [ ] **Step 5: Run tests**

Run:

```bash
cd phaser
npm test -- src/tests/core/ai.test.ts src/tests/core/economy.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit AI port**

```bash
git add phaser/src/core phaser/src/tests/core/ai.test.ts
git commit -m "feat: port AI controller"
```

---

### Task 7: Add Phaser Scenes and Canvas Rendering

**Files:**
- Modify: `phaser/src/main.ts`
- Create: `phaser/src/scenes/BootScene.ts`
- Create: `phaser/src/scenes/GalaxyScene.ts`
- Create: `phaser/src/scenes/SystemScene.ts`
- Modify: `phaser/src/styles.css`

- [ ] **Step 1: Replace temporary boot with Phaser game config**

`main.ts` should create a Phaser game mounted at `#game`, configure 1280x720 scale with resize support, register `BootScene`, `GalaxyScene`, and `SystemScene`, and expose a shared app controller object to scenes.

- [ ] **Step 2: Implement `BootScene`**

Boot scene responsibilities:

- set background color.
- create initial game state with default player name.
- initialize DOM overlay in Task 8 through a stub call.
- start `GalaxyScene`.

- [ ] **Step 3: Implement `GalaxyScene`**

Render systems from core state:

- coordinates use the Godot scale factor of 20.
- circles show ownership color or neutral gray.
- home systems have a small white marker.
- pointer wheel zooms between 0.3 and 3.0.
- right or middle pointer drag pans the camera.
- clicking a system stores selected system ID and starts `SystemScene`.

- [ ] **Step 4: Implement `SystemScene`**

Render selected system planets:

- grid layout centered in the camera view.
- planet radius derived from size.
- owner color ring.
- labels for name, owner, size, population.
- portal indicator.
- clicking a planet stores selected planet ID and refreshes overlay panels.
- Escape or a back button returns to `GalaxyScene`.

- [ ] **Step 5: Verify build**

Run:

```bash
cd phaser
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit scenes**

```bash
git add phaser/src/main.ts phaser/src/scenes phaser/src/styles.css
git commit -m "feat: render galaxy and system scenes"
```

---

### Task 8: Build MVP DOM Overlay UI

**Files:**
- Create: `phaser/src/ui/dom.ts`
- Create: `phaser/src/ui/overlay.ts`
- Create: `phaser/src/ui/startScreen.ts`
- Create: `phaser/src/ui/hud.ts`
- Create: `phaser/src/ui/planetPanel.ts`
- Create: `phaser/src/ui/fleetPanel.ts`
- Create: `phaser/src/ui/researchPanel.ts`
- Create: `phaser/src/ui/notifications.ts`
- Modify: `phaser/src/scenes/BootScene.ts`
- Modify: `phaser/src/scenes/GalaxyScene.ts`
- Modify: `phaser/src/scenes/SystemScene.ts`
- Modify: `phaser/src/styles.css`

- [ ] **Step 1: Create DOM helpers**

`dom.ts` should export helpers for `clearElement`, `button`, `numberInput`, `select`, `formatNumber`, and `resourceCostText`. Keep helpers small and typed.

- [ ] **Step 2: Build overlay coordinator**

`overlay.ts` should own `#ui-root`, render panels from current state, and expose:

```ts
export interface OverlayApi {
  render(): void;
  showStartScreen(): void;
  showGameOver(playerWon: boolean): void;
}
```

- [ ] **Step 3: Build start screen and HUD**

Start screen accepts empire name and calls `createNewGame`. HUD shows GC, food, iron, endurium, octarine, tick, speed, net worth, planet count, and speed buttons.

- [ ] **Step 4: Build planet panel**

Planet panel shows selected planet data and command controls:

- owned planet: buildings, queue, build controls, unit summary, explorer queue.
- uncolonized planet: explorer launch if possible.
- enemy planet: attack controls using available player units.

- [ ] **Step 5: Build fleet and research panels**

Fleet controls train units and send fleets. Research controls five allocation inputs and requires total allocation to equal 100 before applying.

- [ ] **Step 6: Build notifications and game-over**

Render newest notifications and simple victory/defeat overlay from core events.

- [ ] **Step 7: Wire scene selection to overlay refresh**

After system or planet selection changes, call `overlay.render()`. After commands, call `overlay.render()` and refresh scene visuals.

- [ ] **Step 8: Verify build**

Run:

```bash
cd phaser
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit UI overlay**

```bash
git add phaser/src/ui phaser/src/scenes phaser/src/styles.css
git commit -m "feat: add MVP management overlay"
```

---

### Task 9: Add App Timer, E2E Smoke Test, and Verification

**Files:**
- Modify: `phaser/src/main.ts`
- Modify: `phaser/src/ui/overlay.ts`
- Create: `phaser/src/tests/e2e/app.spec.ts`
- Modify: `docs/phaser-migration-backlog.md`

- [ ] **Step 1: Add browser tick timer**

Create an app controller in `main.ts` that:

- tracks elapsed time.
- calls `advanceTick(state)` according to current speed and `BASE_TICK_SECONDS = 2`.
- skips tick advancement when speed is paused.
- calls overlay render and scene refresh after each processed tick.

- [ ] **Step 2: Write Playwright smoke test**

Create `phaser/src/tests/e2e/app.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('starts the Phaser MVP and renders the main playable UI', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Imperial Conflict')).toBeVisible();
  await page.getByLabel('Empire name').fill('Smoke Test Empire');
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByText('GC')).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
});
```

- [ ] **Step 3: Run unit and build verification**

Run:

```bash
cd phaser
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 4: Install Playwright browser if needed**

Run only if Playwright reports missing browser binaries:

```bash
cd phaser
npx playwright install chromium
```

Expected: Chromium browser installs successfully.

- [ ] **Step 5: Run E2E test**

Run:

```bash
cd phaser
npm run test:e2e
```

Expected: PASS.

- [ ] **Step 6: Update backlog with discovered gaps**

Review the MVP against `docs/phaser-migration-backlog.md`. Add any discovered Godot parity gaps before calling the MVP complete.

- [ ] **Step 7: Commit verification work**

```bash
git add phaser docs/phaser-migration-backlog.md
git commit -m "test: verify Phaser MVP smoke flow"
```

---

### Task 10: Final MVP Acceptance Pass

**Files:**
- Modify only files required by failed verification.

- [ ] **Step 1: Run full verification**

Run:

```bash
cd phaser
npm test
npm run build
npm run test:e2e
```

Expected: all commands PASS.

- [ ] **Step 2: Manually check MVP flow**

Run:

```bash
cd phaser
npm run dev -- --port 5173
```

Open `http://127.0.0.1:5173` and verify:

- start screen accepts empire name.
- galaxy map renders and supports pan/zoom.
- clicking a system opens system view.
- clicking a planet opens planet data.
- building queue changes resources and completes after ticks.
- units can be trained.
- fleets can be launched.
- combat can resolve and transfer ownership.
- speed controls affect tick cadence.
- victory or defeat can be reached through state changes.

- [ ] **Step 3: Stop dev server**

Stop the server process started in Step 2.

- [ ] **Step 4: Commit acceptance fixes**

If Step 2 required code changes:

```bash
git add phaser docs/phaser-migration-backlog.md
git commit -m "fix: complete Phaser MVP acceptance flow"
```

If Step 2 required no code changes, do not create an empty commit.

---

## Plan Self-Review Checklist

- Spec coverage: tasks cover scaffold, core separation, data/models, galaxy generation, tick economy, commands, fleets, combat, operations, AI, Phaser scenes, DOM overlay, tests, and backlog tracking.
- Dependency rule: `core/` stays free of Phaser and DOM imports.
- Verification: unit tests, TypeScript build, Playwright smoke test, and manual MVP flow are required before completion.
- Backlog: deferred parity items stay in `docs/phaser-migration-backlog.md`.
