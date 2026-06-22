import type { Empire } from '../core/models/types';

/**
 * The player always sees themselves as blue. Other empires get the remaining
 * palette colors, assigned in a stable order by empire ID so each opponent
 * looks the same color every tick.
 */
const PLAYER_COLOR = '#3380ff';

/** Orange — used exclusively for systems contested between the local player and an enemy. */
export const PLAYER_CONTESTED_COLOR = 0xff8c00;

const OTHER_COLORS = [
  '#ff4d4d',  // red
  '#4de64d',  // green
  '#ffcc33',  // yellow
  '#cc66ff',  // purple
  '#33cccc',  // teal
  '#ff66b2',  // pink
  '#b366ff',  // violet
];

export function getDisplayColor(empire: Empire, localEmpireId: number): string {
  if (empire.id === localEmpireId) return PLAYER_COLOR;

  // Build a stable index for non-local empires by counting how many
  // empire IDs below this one are also non-local.  Because empire IDs
  // are assigned sequentially and never reused, sorting by ID gives a
  // deterministic order without needing the full empire list.
  //
  // We can't just use empire.id directly because the local player's
  // slot should be skipped.  Instead the caller-visible index is:
  //   ids-below-me  minus  (1 if localEmpireId < empire.id)
  // which equals the count of *other* non-local empires with a smaller ID.
  const offset = localEmpireId < empire.id ? 1 : 0;
  const index = (empire.id - offset) % OTHER_COLORS.length;
  return OTHER_COLORS[index];
}

export function displayColorNumber(empire: Empire, localEmpireId: number): number {
  return Number.parseInt(getDisplayColor(empire, localEmpireId).replace('#', ''), 16);
}
