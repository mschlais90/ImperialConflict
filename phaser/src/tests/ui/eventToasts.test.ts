import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../core/engines/gameManager';
import type { EventLogEntry, GameEvent } from '../../core/events/eventLog';
import { getPlanetsForEmpire } from '../../core/selectors/selectors';
import { collectEventToasts, MAX_TOASTS_PER_TICK } from '../../ui/eventToasts';

function setup() {
  const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
  const player = state.empires[0];
  const enemy = state.empires[1];
  const playerPlanet = getPlanetsForEmpire(state, player.id)[0];
  let id = 1000;
  const ev = (event: GameEvent): EventLogEntry => ({ id: id++, ...event }) as EventLogEntry;
  return { state, player, enemy, playerPlanet, ev };
}

describe('collectEventToasts', () => {
  it('groups unit completions per unit type and ignores other empires', () => {
    const { state, player, enemy, ev } = setup();
    const { toasts } = collectEventToasts(state, player.id, [
      ev({ type: 'unit_completed', tick: 1, empireId: player.id, counts: { fighter: 2 } }),
      ev({ type: 'unit_completed', tick: 1, empireId: player.id, counts: { fighter: 3, soldier: 1 } }),
      ev({ type: 'unit_completed', tick: 1, empireId: enemy.id, counts: { bomber: 9 } }),
    ]);
    const messages = toasts.map((t) => t.message);
    expect(messages).toContain('5x Fighter completed');
    expect(messages.some((m) => /Soldier completed$/.test(m))).toBe(true);
    expect(messages.some((m) => m.includes('Bomber'))).toBe(false);
  });

  it('warns about incoming enemy fleets and attacks on our planets as errors', () => {
    const { state, player, enemy, playerPlanet, ev } = setup();
    const system = state.systems.find((s) => s.id === playerPlanet.systemId)!;
    const { toasts } = collectEventToasts(state, player.id, [
      ev({ type: 'fleet_launched', tick: 1, fleetId: 999, ownerId: enemy.id, originSystemId: 0, targetSystemId: system.id, targetPlanetId: playerPlanet.id }),
      ev({ type: 'battle_resolved', tick: 1, planetId: playerPlanet.id, attackerId: enemy.id, defenderId: player.id, report: {} as never }),
    ]);
    expect(toasts.every((t) => t.isError)).toBe(true);
    expect(toasts[0].message).toContain(`Incoming fleet from ${enemy.empireName}`);
    expect(toasts[1].message).toBe(`You are under attack at ${system.systemName}:${system.planetIds.indexOf(playerPlanet.id) + 1}!`);
  });

  it('flags local-player elimination and filters notifications by empire and category', () => {
    const { state, player, enemy, ev } = setup();
    const result = collectEventToasts(state, player.id, [
      ev({ type: 'empire_eliminated', tick: 1, empireId: player.id }),
      ev({ type: 'notification', tick: 1, message: 'mine', empireId: player.id }),
      ev({ type: 'notification', tick: 1, message: 'global' }),
      ev({ type: 'notification', tick: 1, message: 'theirs', empireId: enemy.id }),
      ev({ type: 'notification', tick: 1, message: 'combat spam', category: 'combat' }),
    ]);
    expect(result.localPlayerEliminated).toBe(true);
    expect(result.toasts.map((t) => t.message)).toEqual([`${player.empireName} has been eliminated!`, 'mine', 'global']);
  });

  it('caps toasts per tick, errors first, with an overflow hint', () => {
    const { state, player, enemy, playerPlanet, ev } = setup();
    const events = [
      ...Array.from({ length: 6 }, (_, i) => ev({ type: 'notification', tick: 1, message: `info ${i}` })),
      ev({ type: 'battle_resolved', tick: 1, planetId: playerPlanet.id, attackerId: enemy.id, defenderId: player.id, report: {} as never }),
    ];
    const { toasts } = collectEventToasts(state, player.id, events);
    expect(toasts).toHaveLength(MAX_TOASTS_PER_TICK + 1);
    expect(toasts[0].isError).toBe(true);
    expect(toasts[toasts.length - 1].message).toBe(`+${7 - MAX_TOASTS_PER_TICK} more — press N for Notifications`);
  });
});
