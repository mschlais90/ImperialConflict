import { describe, expect, it } from 'vitest';
import { MAX_CHAT_LENGTH, MAX_PLAYER_NAME_LENGTH, validateClientMessage } from '../../server/messageValidation';

const ALLOCATION = { military: 20, welfare: 20, economy: 20, construction: 20, resources: 20 };

function cmd(command: Record<string, unknown>) {
  return validateClientMessage({ type: 'command', command });
}

describe('validateClientMessage', () => {
  it('accepts every well-formed command type', () => {
    const commands = [
      { type: 'queueBuilding', empireId: 0, planetId: 3, buildingType: 'farm', count: 2 },
      { type: 'queueExplorer', empireId: 0, planetId: 3, count: 1 },
      { type: 'trainUnits', empireId: 0, planetId: 3, unitType: 'fighter', count: 10 },
      { type: 'sendFleet', empireId: 0, sourcePlanetId: 3, targetPlanetId: 9, units: { fighter: 5, transport: 1 } },
      { type: 'sendPortalFleet', empireId: 0, targetPlanetId: 9, units: { soldier: 5 } },
      { type: 'sendExplorer', empireId: 0, sourcePlanetId: 3, targetPlanetId: 9 },
      { type: 'recallToPortal', empireId: 0, sourcePlanetId: 3 },
      { type: 'setResearchAllocation', empireId: 0, allocation: ALLOCATION },
      { type: 'performAgentOperation', empireId: 0, targetEmpireId: 1, operationType: 'spy', units: 5 },
      { type: 'performSpell', empireId: 0, targetEmpireId: 1, spellType: 'vision', targetPlanetId: 4 },
    ];
    for (const c of commands) {
      const result = cmd(c);
      expect(result, c.type).toEqual({ ok: true, value: { type: 'command', command: expect.objectContaining(c) } });
    }
  });

  it.each([
    ['unknown building', { type: 'queueBuilding', empireId: 0, planetId: 1, buildingType: 'deathstar', count: 1 }],
    ['prototype key as building', { type: 'queueBuilding', empireId: 0, planetId: 1, buildingType: '__proto__', count: 1 }],
    ['inherited key as building', { type: 'queueBuilding', empireId: 0, planetId: 1, buildingType: 'toString', count: 1 }],
    ['fractional count', { type: 'trainUnits', empireId: 0, planetId: 1, unitType: 'fighter', count: 1.5 }],
    ['negative count', { type: 'trainUnits', empireId: 0, planetId: 1, unitType: 'fighter', count: -5 }],
    ['NaN-ish count', { type: 'trainUnits', empireId: 0, planetId: 1, unitType: 'fighter', count: '10' }],
    ['explorer via trainUnits', { type: 'trainUnits', empireId: 0, planetId: 1, unitType: 'explorer', count: 1 }],
    ['string planet id', { type: 'queueExplorer', empireId: 0, planetId: '1', count: 1 }],
    ['missing empireId', { type: 'recallToPortal', sourcePlanetId: 1 }],
    ['non-combat unit in fleet', { type: 'sendFleet', empireId: 0, sourcePlanetId: 1, targetPlanetId: 2, units: { agent: 5 } }],
    ['fleet units array', { type: 'sendFleet', empireId: 0, sourcePlanetId: 1, targetPlanetId: 2, units: [1, 2] }],
    ['unknown science', { type: 'setResearchAllocation', empireId: 0, allocation: { ...ALLOCATION, magic: 0 } }],
    ['missing science', { type: 'setResearchAllocation', empireId: 0, allocation: { military: 100 } }],
    ['unknown op', { type: 'performAgentOperation', empireId: 0, targetEmpireId: 1, operationType: 'nuke' }],
    ['unknown spell', { type: 'performSpell', empireId: 0, targetEmpireId: 1, spellType: 'fireball' }],
    ['unknown command', { type: 'deleteGalaxy', empireId: 0 }],
  ])('rejects %s', (_label, command) => {
    expect(cmd(command).ok).toBe(false);
  });

  it('strips unknown fields from commands', () => {
    const result = cmd({ type: 'recallToPortal', empireId: 0, sourcePlanetId: 1, evil: true });
    expect(result).toEqual({ ok: true, value: { type: 'command', command: { type: 'recallToPortal', empireId: 0, sourcePlanetId: 1 } } });
  });

  it('rejects non-object and unknown messages', () => {
    expect(validateClientMessage(null).ok).toBe(false);
    expect(validateClientMessage([1]).ok).toBe(false);
    expect(validateClientMessage('hi').ok).toBe(false);
    expect(validateClientMessage({ type: 'adminShutdown' }).ok).toBe(false);
    expect(validateClientMessage({ type: 'command' }).ok).toBe(false);
  });

  it('only accepts real game speeds', () => {
    expect(validateClientMessage({ type: 'setSpeed', speed: 4 }).ok).toBe(true);
    expect(validateClientMessage({ type: 'setSpeed', speed: 1000 }).ok).toBe(false);
    expect(validateClientMessage({ type: 'setSpeed', speed: '4' }).ok).toBe(false);
  });

  it('truncates and trims player names and chat', () => {
    const long = 'x'.repeat(500);
    const join = validateClientMessage({ type: 'join', roomCode: 'ABC', playerName: `  ${long}` });
    expect(join.ok && join.value.type === 'join' && join.value.playerName.length).toBe(MAX_PLAYER_NAME_LENGTH);
    const chat = validateClientMessage({ type: 'chat', text: long });
    expect(chat.ok && chat.value.type === 'chat' && chat.value.text.length).toBe(MAX_CHAT_LENGTH);
    expect(validateClientMessage({ type: 'join', roomCode: 'ABC', playerName: '   ' }).ok).toBe(false);
  });

  it('rejects structurally broken saved states on create', () => {
    const base = { type: 'create', playerName: 'Host', settings: { empireName: 'Host' } };
    expect(validateClientMessage(base).ok).toBe(true);
    expect(validateClientMessage({ ...base, savedState: { empires: 'nope' } }).ok).toBe(false);
    expect(validateClientMessage({ ...base, savedState: { empires: [], systems: [], planets: [], fleets: [], events: [], aiControllers: {}, currentTick: 'x' } }).ok).toBe(false);
  });
});
