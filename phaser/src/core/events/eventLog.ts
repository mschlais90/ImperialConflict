import type { BuildingKey } from '../models/types';

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
  | { type: 'battle_resolved'; tick: number; planetId: number; attackerId: number; defenderId: number }
  | { type: 'building_completed'; tick: number; planetId: number; buildingType: BuildingKey }
  | { type: 'empire_eliminated'; tick: number; empireId: number }
  | { type: 'planet_colonized'; tick: number; planetId: number; empireId: number }
  | { type: 'notification'; tick: number; message: string; category?: string }
  | { type: 'game_over'; tick: number; playerWon: boolean };

export type GameSpeed = 'paused' | 'normal' | 'fast' | 'very_fast';

export interface EventLogEntry {
  id: number;
  event: GameEvent;
}
