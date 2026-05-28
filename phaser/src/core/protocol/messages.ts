import type { AgentOperationType, SpellType } from '../engines/opsEngine';
import type { GameSpeed } from '../events/eventLog';
import type { GameState } from '../galaxy/galaxyData';
import type { BuildingKey, CombatUnitKey, ScienceKey, UnitKey } from '../models/types';

// ---------------------------------------------------------------------------
// Lobby / player info
// ---------------------------------------------------------------------------

export interface PlayerInfo {
  empireId: number;
  name: string;
  isHost: boolean;
}

export interface GameSettings {
  empireName: string;
  seed?: number;
}

// ---------------------------------------------------------------------------
// Serialized commands — mirror CommandProxy methods without game state
// ---------------------------------------------------------------------------

export type SerializedCommand =
  | { type: 'queueBuilding'; empireId: number; planetId: number; buildingType: BuildingKey; count: number }
  | { type: 'queueExplorer'; empireId: number; planetId: number; count: number }
  | { type: 'trainUnits'; empireId: number; planetId: number; unitType: Exclude<UnitKey, 'explorer'>; count: number }
  | { type: 'sendFleet'; empireId: number; sourcePlanetId: number; targetPlanetId: number; units: Partial<Record<CombatUnitKey, number>> }
  | { type: 'sendPortalFleet'; empireId: number; targetPlanetId: number; units: Partial<Record<CombatUnitKey, number>> }
  | { type: 'sendExplorer'; empireId: number; sourcePlanetId: number; targetPlanetId: number }
  | { type: 'recallToPortal'; empireId: number; sourcePlanetId: number }
  | { type: 'setResearchAllocation'; empireId: number; allocation: Record<ScienceKey, number> }
  | { type: 'performAgentOperation'; empireId: number; targetEmpireId: number; operationType: AgentOperationType; targetPlanetId?: number }
  | { type: 'performSpell'; empireId: number; targetEmpireId: number; spellType: SpellType; targetPlanetId?: number };

// ---------------------------------------------------------------------------
// Serialized game state — GameState minus non-serializable fields (rng)
// ---------------------------------------------------------------------------

export type SerializedGameState = Omit<GameState, 'rng'>;

// ---------------------------------------------------------------------------
// Client -> Server messages
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { type: 'create'; playerName: string; settings: GameSettings }
  | { type: 'join'; roomCode: string; playerName: string }
  | { type: 'reconnect'; roomCode: string; empireId: number }
  | { type: 'startGame' }
  | { type: 'command'; command: SerializedCommand }
  | { type: 'setSpeed'; speed: GameSpeed }
  | { type: 'chat'; text: string };

// ---------------------------------------------------------------------------
// Server -> Client messages
// ---------------------------------------------------------------------------

export type ServerMessage =
  | { type: 'roomCreated'; roomCode: string }
  | { type: 'joined'; empireId: number; players: PlayerInfo[] }
  | { type: 'playerJoined'; player: PlayerInfo }
  | { type: 'playerLeft'; empireId: number }
  | { type: 'playerReconnected'; empireId: number }
  | { type: 'gameStarted'; state: SerializedGameState }
  | { type: 'tick'; state: SerializedGameState }
  | { type: 'commandResult'; ok: boolean; message: string }
  | { type: 'reconnected'; empireId: number; state: SerializedGameState }
  | { type: 'chat'; empireId: number; playerName: string; text: string }
  | { type: 'error'; message: string };
