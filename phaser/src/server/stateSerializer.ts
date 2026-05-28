import type { GameState } from '../core/galaxy/galaxyData';
import type { SerializedGameState } from '../core/protocol/messages';

export function serializeState(state: GameState): SerializedGameState {
  const { rng: _rng, ...serializable } = state;
  return serializable;
}
