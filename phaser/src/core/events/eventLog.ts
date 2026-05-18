import type { GameState } from '../galaxy/galaxyData';
import type { BuildingKey, UnitKey } from '../models/types';

export type GameEvent =
  | { type: 'game_started'; tick: number; empireName: string }
  | { type: 'tick_processed'; tick: number }
  | { type: 'speed_changed'; tick: number; speed: GameSpeed }
  | {
      type: 'fleet_launched';
      tick: number;
      fleetId: number;
      ownerId: number;
      originSystemId: number;
      targetSystemId: number;
      targetPlanetId: number;
    }
  | { type: 'fleet_arrived'; tick: number; fleetId: number; targetPlanetId: number }
  | { type: 'fleet_arrival_blocked'; tick: number; fleetId: number; targetPlanetId: number; reason: string }
  | { type: 'battle_resolved'; tick: number; planetId: number; attackerId: number; defenderId: number }
  | { type: 'building_completed'; tick: number; planetId: number; buildingType: BuildingKey }
  | { type: 'unit_completed'; tick: number; planetId: number; unitType: UnitKey }
  | { type: 'empire_eliminated'; tick: number; empireId: number }
  | { type: 'planet_colonized'; tick: number; planetId: number; empireId: number }
  | { type: 'notification'; tick: number; message: string; category?: string }
  | { type: 'game_over'; tick: number; playerWon: boolean };

export type GameSpeed = 0 | 1 | 2 | 4;

export type EventLogEntry = GameEvent & {
  id: number;
};

export function appendEvent(state: GameState, event: GameEvent): void {
  state.events.push({ id: state.nextEventId, ...event });
  state.nextEventId += 1;
}
