import { BUILDINGS } from '../core/data/buildings';
import { SCIENCES } from '../core/data/sciences';
import { UNITS } from '../core/data/units';
import { AGENT_OP_DIFFICULTY, SPELL_DIFFICULTY } from '../core/engines/opsEngine';
import { SPEEDS } from '../core/engines/tickEngine';
import type { ClientMessage, SerializedCommand } from '../core/protocol/messages';

// Runtime validation for everything a client sends. The protocol types in
// core/protocol/messages.ts are compile-time only; over the wire any JSON can
// arrive, so this is the trust boundary. Core commands still do their own
// game-rule validation (ownership, affordability) — this layer guarantees
// they receive well-formed, correctly-typed input.

export const MAX_PLAYER_NAME_LENGTH = 32;
export const MAX_CHAT_LENGTH = 200;
// Far above any affordable order; keeps per-unit work in core commands bounded.
const MAX_COUNT = 100_000;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

class ValidationError extends Error {}

const BUILDING_KEYS = new Set(Object.keys(BUILDINGS));
const TRAINABLE_UNIT_KEYS = new Set(Object.keys(UNITS).filter((k) => k !== 'explorer'));
const COMBAT_UNIT_KEYS = new Set(['fighter', 'bomber', 'soldier', 'droid', 'transport']);
const SCIENCE_KEYS = Object.keys(SCIENCES);
const AGENT_OP_KEYS = new Set(Object.keys(AGENT_OP_DIFFICULTY));
const SPELL_KEYS = new Set(Object.keys(SPELL_DIFFICULTY));
const SPEED_VALUES = new Set<number>(Object.values(SPEEDS));

function fail(error: string): never {
  throw new ValidationError(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function id(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  if (!Number.isSafeInteger(v) || (v as number) < -1) fail(`${key} must be an integer id`);
  return v as number;
}

function optionalId(obj: Record<string, unknown>, key: string): number | undefined {
  return obj[key] === undefined ? undefined : id(obj, key);
}

function count(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  if (!Number.isSafeInteger(v) || (v as number) < 0 || (v as number) > MAX_COUNT) fail(`${key} must be a non-negative integer`);
  return v as number;
}

function optionalCount(obj: Record<string, unknown>, key: string): number | undefined {
  return obj[key] === undefined ? undefined : count(obj, key);
}

function oneOf<T extends string>(obj: Record<string, unknown>, key: string, allowed: Set<string>): T {
  const v = obj[key];
  // hasOwn-style check via Set avoids prototype keys like "__proto__" or "toString".
  if (typeof v !== 'string' || !allowed.has(v)) fail(`${key} is not a valid value`);
  return v as T;
}

function str(obj: Record<string, unknown>, key: string, maxLength: number): string {
  const v = obj[key];
  if (typeof v !== 'string') fail(`${key} must be a string`);
  return v.slice(0, maxLength);
}

function playerName(obj: Record<string, unknown>): string {
  const name = str(obj, 'playerName', Number.MAX_SAFE_INTEGER).trim().slice(0, MAX_PLAYER_NAME_LENGTH).trim();
  if (!name) fail('playerName must not be empty');
  return name;
}

function unitMap(obj: Record<string, unknown>, key: string): Partial<Record<string, number>> {
  const v = obj[key];
  if (!isRecord(v)) fail(`${key} must be an object`);
  const out: Record<string, number> = {};
  for (const unit of Object.keys(v)) {
    if (!COMBAT_UNIT_KEYS.has(unit)) fail(`${key} has invalid unit "${unit}"`);
    out[unit] = count(v, unit);
  }
  return out;
}

function allocation(obj: Record<string, unknown>): Record<string, number> {
  const v = obj.allocation;
  if (!isRecord(v)) fail('allocation must be an object');
  const out: Record<string, number> = {};
  for (const key of SCIENCE_KEYS) {
    const n = v[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100) fail(`allocation.${key} must be 0-100`);
    out[key] = n;
  }
  for (const key of Object.keys(v)) {
    if (!SCIENCE_KEYS.includes(key)) fail(`allocation has invalid science "${key}"`);
  }
  return out;
}

function parseCommand(raw: unknown): SerializedCommand {
  if (!isRecord(raw)) fail('command must be an object');
  const empireId = id(raw, 'empireId');
  switch (raw.type) {
    case 'queueBuilding':
      return { type: raw.type, empireId, planetId: id(raw, 'planetId'), buildingType: oneOf(raw, 'buildingType', BUILDING_KEYS), count: count(raw, 'count') };
    case 'queueExplorer':
      return { type: raw.type, empireId, planetId: id(raw, 'planetId'), count: count(raw, 'count') };
    case 'trainUnits':
      return { type: raw.type, empireId, planetId: id(raw, 'planetId'), unitType: oneOf(raw, 'unitType', TRAINABLE_UNIT_KEYS), count: count(raw, 'count') };
    case 'sendFleet':
      return { type: raw.type, empireId, sourcePlanetId: id(raw, 'sourcePlanetId'), targetPlanetId: id(raw, 'targetPlanetId'), units: unitMap(raw, 'units') };
    case 'sendPortalFleet':
      return { type: raw.type, empireId, targetPlanetId: id(raw, 'targetPlanetId'), units: unitMap(raw, 'units') };
    case 'sendExplorer':
      return { type: raw.type, empireId, sourcePlanetId: id(raw, 'sourcePlanetId'), targetPlanetId: id(raw, 'targetPlanetId') };
    case 'recallToPortal':
      return { type: raw.type, empireId, sourcePlanetId: id(raw, 'sourcePlanetId') };
    case 'setResearchAllocation':
      return { type: raw.type, empireId, allocation: allocation(raw) as Record<keyof typeof SCIENCES, number> };
    case 'performAgentOperation':
      return {
        type: raw.type,
        empireId,
        targetEmpireId: id(raw, 'targetEmpireId'),
        operationType: oneOf(raw, 'operationType', AGENT_OP_KEYS),
        targetPlanetId: optionalId(raw, 'targetPlanetId'),
        units: optionalCount(raw, 'units'),
      };
    case 'performSpell':
      return {
        type: raw.type,
        empireId,
        targetEmpireId: id(raw, 'targetEmpireId'),
        spellType: oneOf(raw, 'spellType', SPELL_KEYS),
        targetPlanetId: optionalId(raw, 'targetPlanetId'),
        units: optionalCount(raw, 'units'),
      };
    default:
      return fail('unknown command type');
  }
}

/** Minimal structural check on an uploaded save so a malformed one can't crash the tick loop. */
function validateSavedState(v: unknown): void {
  if (!isRecord(v)) fail('savedState must be an object');
  for (const key of ['empires', 'systems', 'planets', 'fleets', 'events']) {
    if (!Array.isArray(v[key])) fail(`savedState.${key} must be an array`);
  }
  if (!Number.isSafeInteger(v.currentTick)) fail('savedState.currentTick must be an integer');
  if (!isRecord(v.aiControllers)) fail('savedState.aiControllers must be an object');
  for (const empire of v.empires as unknown[]) {
    if (!isRecord(empire) || !Number.isSafeInteger(empire.id) || typeof empire.empireName !== 'string') {
      fail('savedState.empires contains an invalid empire');
    }
  }
}

function parseMessage(raw: unknown): ClientMessage {
  if (!isRecord(raw)) fail('message must be an object');
  switch (raw.type) {
    case 'create': {
      const settings = isRecord(raw.settings) ? raw.settings : fail('settings must be an object');
      if (raw.savedState !== undefined) validateSavedState(raw.savedState);
      if (raw.savedRngState !== undefined && !Number.isSafeInteger(raw.savedRngState)) fail('savedRngState must be an integer');
      if (settings.seed !== undefined && !Number.isSafeInteger(settings.seed)) fail('settings.seed must be an integer');
      return {
        type: 'create',
        playerName: playerName(raw),
        settings: { empireName: str(settings, 'empireName', MAX_PLAYER_NAME_LENGTH), seed: settings.seed as number | undefined },
        savedState: raw.savedState as Extract<ClientMessage, { type: 'create' }>['savedState'],
        savedRngState: raw.savedRngState as number | undefined,
      };
    }
    case 'join':
      return { type: 'join', roomCode: str(raw, 'roomCode', 16), playerName: playerName(raw) };
    case 'reconnect':
      return { type: 'reconnect', roomCode: str(raw, 'roomCode', 16), empireId: id(raw, 'empireId') };
    case 'startGame':
      return { type: 'startGame' };
    case 'command':
      return { type: 'command', command: parseCommand(raw.command) };
    case 'setSpeed':
      if (typeof raw.speed !== 'number' || !SPEED_VALUES.has(raw.speed)) fail('speed is not a valid value');
      return { type: 'setSpeed', speed: raw.speed as Extract<ClientMessage, { type: 'setSpeed' }>['speed'] };
    case 'chat':
      return { type: 'chat', text: str(raw, 'text', MAX_CHAT_LENGTH) };
    default:
      return fail('unknown message type');
  }
}

/**
 * Validate a raw (already JSON-parsed) client message. Returns a freshly
 * built, correctly-typed message containing only known fields.
 */
export function validateClientMessage(raw: unknown): ValidationResult<ClientMessage> {
  try {
    return { ok: true, value: parseMessage(raw) };
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, error: err.message };
    throw err;
  }
}
