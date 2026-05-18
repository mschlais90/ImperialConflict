import type { GameSpeed, EventLogEntry } from '../events/eventLog';
import type { Empire, Fleet, Planet, SolarSystem } from '../models/types';
import type { Rng } from '../random/rng';

export type GameLifecycleState = 'main_menu' | 'playing' | 'game_over';

export interface AiControllerState {
  empireId: number;
}

export interface GameState {
  empires: Empire[];
  systems: SolarSystem[];
  planets: Planet[];
  fleets: Fleet[];
  aiControllers: AiControllerState[];
  events: EventLogEntry[];
  currentTick: number;
  currentSpeed: GameSpeed;
  currentState: GameLifecycleState;
  selectedEmpireId: number | null;
  selectedSystemId: number | null;
  selectedPlanetId: number | null;
  selectedFleetId: number | null;
  nextEmpireId: number;
  nextSystemId: number;
  nextPlanetId: number;
  nextFleetId: number;
  nextEventId: number;
  rng?: Rng;
}

export function createEmptyGameState(): GameState {
  return {
    empires: [],
    systems: [],
    planets: [],
    fleets: [],
    aiControllers: [],
    events: [],
    currentTick: 0,
    currentSpeed: 0,
    currentState: 'main_menu',
    selectedEmpireId: null,
    selectedSystemId: null,
    selectedPlanetId: null,
    selectedFleetId: null,
    nextEmpireId: 0,
    nextSystemId: 0,
    nextPlanetId: 0,
    nextFleetId: 0,
    nextEventId: 0,
  };
}
