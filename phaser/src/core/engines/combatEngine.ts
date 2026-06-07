import { UNITS } from '../data/units';
import { appendEvent } from '../events/eventLog';
import type { GameState } from '../galaxy/galaxyData';
import type { CombatUnitKey, Empire, Fleet, Planet, PlanetUnitKey, ScienceKey } from '../models/types';
import { calcEmpireNetworth, getEmpire, getPlanetsForEmpire } from '../selectors/selectors';

const COMBAT_UNIT_KEYS: CombatUnitKey[] = ['fighter', 'bomber', 'soldier', 'droid', 'transport'];

type UnitCounts = Partial<Record<CombatUnitKey, number>>;

export type BattlePhaseReport =
  | {
      phase: 'Air vs Ground';
      lasersDestroyed: number;
      remainingLasers: number;
      bombersLost: number;
      transportsLost: number;
      groundLostToTransports: { soldiersKilled: number; droidsKilled: number };
    }
  | {
      phase: 'Air vs Air';
      atkFightersLost: number;
      defFightersLost: number;
      transportsLostToFighters: number;
      groundLostToTransports: { soldiersKilled: number; droidsKilled: number };
    }
  | {
      phase: 'Ground vs Ground';
      attackerWon: boolean;
      atkPower: number;
      defPower: number;
      atkSoldiersLost: number;
      atkDroidsLost: number;
      defSoldiersLost: number;
      defDroidsLost: number;
    };

export interface BattleReport {
  attackerId: number;
  defenderId: number;
  planetId: number;
  planetName: string;
  attackerWon: boolean;
  phases: BattlePhaseReport[];
  attackerInitial: UnitCounts;
  defenderInitial: Partial<Record<PlanetUnitKey, number>>;
  defenderLasers: number;
  /** Surviving defender units that retreated to a portal planet. */
  defenderRetreated?: UnitCounts;
  /** Surviving attacker units that retreated to a portal planet. */
  attackerRetreated?: UnitCounts;
}

export function resolveBattle(state: GameState, attackerFleet: Fleet, defenderPlanet: Planet): BattleReport {
  poolPortalDefense(state, defenderPlanet);

  const defenderId = defenderPlanet.ownerId;
  const report: BattleReport = {
    attackerId: attackerFleet.ownerId,
    defenderId,
    planetId: defenderPlanet.id,
    planetName: defenderPlanet.planetName,
    attackerWon: false,
    phases: [],
    attackerInitial: { ...attackerFleet.units },
    defenderInitial: { ...defenderPlanet.units },
    defenderLasers: defenderPlanet.buildings.laser ?? 0,
  };

  const attacker = getEmpire(state, attackerFleet.ownerId);
  const defender = getEmpire(state, defenderId);
  const attackerMilitaryBonus = 1 + (attacker === undefined ? 0 : getSciencePercent(state, attacker, 'military') / 100);
  const defenderMilitaryBonus = 1 + (defender === undefined ? 0 : getSciencePercent(state, defender, 'military') / 100);
  const attackerUnits: UnitCounts = { ...attackerFleet.units };
  const defenderUnits: UnitCounts = combatUnitsFromPlanet(defenderPlanet);

  const defenseBonus = defenderPlanet.resourceBonuses['defense'] ?? 1;
  const transportsBefore1 = getCount(attackerUnits, 'transport');
  const airGround = phaseAirVsGround(state, attackerUnits, defenderPlanet.buildings.laser ?? 0, defenseBonus, attackerMilitaryBonus, defenderMilitaryBonus);
  airGround.groundLostToTransports = killProportionalGround(attackerUnits, airGround.transportsLost, transportsBefore1);
  report.phases.push(airGround);
  defenderPlanet.buildings.laser = airGround.remainingLasers;

  const transportsBefore2 = getCount(attackerUnits, 'transport');
  const airAir = phaseAirVsAir(attackerUnits, defenderUnits, attackerMilitaryBonus, defenderMilitaryBonus, defenseBonus);
  airAir.groundLostToTransports = killProportionalGround(attackerUnits, airAir.transportsLostToFighters, transportsBefore2);
  report.phases.push(airAir);

  const ground = phaseGroundVsGround(attackerUnits, defenderUnits, attackerMilitaryBonus, defenderMilitaryBonus, defenseBonus);
  report.phases.push(ground);
  report.attackerWon = ground.attackerWon;

  if (report.attackerWon) {
    // Surviving defender units retreat to a portal planet if one exists
    report.defenderRetreated = { ...defenderUnits };
    retreatSurvivors(state, defenderId, defenderUnits);

    defenderPlanet.ownerId = attackerFleet.ownerId;
    // Destroy portal on captured planet
    if (defenderPlanet.hasPortal) {
      defenderPlanet.hasPortal = false;
      defenderPlanet.buildings.portal = 0;
    }
    defenderPlanet.units = {
      fighter: getCount(attackerUnits, 'fighter'),
      bomber: getCount(attackerUnits, 'bomber'),
      soldier: getCount(attackerUnits, 'soldier'),
      droid: getCount(attackerUnits, 'droid'),
      transport: getCount(attackerUnits, 'transport'),
      agent: 0,
      wizard: 0,
    };
  } else {
    // Surviving attacker units retreat to a portal planet if one exists
    report.attackerRetreated = { ...attackerUnits };
    retreatSurvivors(state, attackerFleet.ownerId, attackerUnits);

    const agents = defenderPlanet.units.agent ?? 0;
    const wizards = defenderPlanet.units.wizard ?? 0;
    defenderPlanet.units = {
      fighter: getCount(defenderUnits, 'fighter'),
      bomber: getCount(defenderUnits, 'bomber'),
      soldier: getCount(defenderUnits, 'soldier'),
      droid: getCount(defenderUnits, 'droid'),
      transport: getCount(defenderUnits, 'transport'),
      agent: agents,
      wizard: wizards,
    };
  }

  state.fleets = state.fleets.filter((fleet) => fleet.id !== attackerFleet.id);
  appendEvent(state, {
    type: 'battle_resolved',
    tick: state.currentTick,
    planetId: defenderPlanet.id,
    attackerId: attackerFleet.ownerId,
    defenderId,
    report,
  });

  const attackerName = attacker?.empireName ?? 'Unknown';
  const defenderName = defender?.empireName ?? 'Unknown';
  appendEvent(state, {
    type: 'notification',
    tick: state.currentTick,
    category: 'combat',
    message: report.attackerWon
      ? `${attackerName} captured ${defenderPlanet.planetName} from ${defenderName}!`
      : `${attackerName} failed to take ${defenderPlanet.planetName} from ${defenderName}`,
  });

  return report;
}

/** Send surviving defender combat units to a friendly portal planet after a lost battle. */
function retreatSurvivors(state: GameState, defenderId: number, survivors: UnitCounts): void {
  const retreatTarget = getPlanetsForEmpire(state, defenderId).find(
    (p) => p.hasPortal,
  );
  if (retreatTarget === undefined) return;

  for (const unit of COMBAT_UNIT_KEYS) {
    const count = getCount(survivors, unit);
    if (count > 0) {
      retreatTarget.units[unit] = (retreatTarget.units[unit] ?? 0) + count;
    }
  }
}

function poolPortalDefense(state: GameState, defenderPlanet: Planet): void {
  if (!defenderPlanet.hasPortal) {
    return;
  }

  for (const donor of getPlanetsForEmpire(state, defenderPlanet.ownerId)) {
    if (donor.id === defenderPlanet.id || !donor.hasPortal) {
      continue;
    }

    for (const unit of COMBAT_UNIT_KEYS) {
      const count = donor.units[unit] ?? 0;
      if (count > 0) {
        defenderPlanet.units[unit] = (defenderPlanet.units[unit] ?? 0) + count;
        donor.units[unit] = 0;
      }
    }
  }
}

function phaseAirVsGround(
  state: GameState,
  attackerUnits: UnitCounts,
  laserCount: number,
  defenseBonus: number,
  attackerMilitaryBonus: number,
  defenderMilitaryBonus: number,
): Extract<BattlePhaseReport, { phase: 'Air vs Ground' }> {
  let bombers = getCount(attackerUnits, 'bomber');
  let transports = getCount(attackerUnits, 'transport');
  let lasersDestroyed = 0;

  const destroyChance = 0.1 * attackerMilitaryBonus;
  for (let i = 0; i < bombers; i += 1) {
    if (laserCount <= 0) {
      break;
    }
    if (rollFloat(state) < destroyChance) {
      lasersDestroyed += 1;
      laserCount -= 1;
    }
  }

  let unitsKilledByLasers = Math.trunc(laserCount * 10 * defenseBonus * defenderMilitaryBonus);
  const transportsLost = Math.min(transports, unitsKilledByLasers);
  unitsKilledByLasers -= transportsLost;
  transports -= transportsLost;
  const bombersLost = Math.min(bombers, unitsKilledByLasers);
  bombers -= bombersLost;

  attackerUnits.bomber = bombers;
  attackerUnits.transport = transports;

  return {
    phase: 'Air vs Ground',
    lasersDestroyed,
    remainingLasers: laserCount,
    bombersLost,
    transportsLost,
    groundLostToTransports: { soldiersKilled: 0, droidsKilled: 0 },
  };
}

function phaseAirVsAir(
  attackerUnits: UnitCounts,
  defenderUnits: UnitCounts,
  attackerMilitaryBonus: number,
  defenderMilitaryBonus: number,
  defenseBonus: number,
): Extract<BattlePhaseReport, { phase: 'Air vs Air' }> {
  let attackerFighters = getCount(attackerUnits, 'fighter');
  let defenderFighters = getCount(defenderUnits, 'fighter');
  let attackerFightersLost = 0;
  let defenderFightersLost = 0;
  let transportsLost = 0;

  if (attackerFighters > 0 && defenderFighters > 0) {
    const attackerPower = UNITS.fighter.airAttack * attackerMilitaryBonus;
    const defenderPower = UNITS.fighter.airDefense * defenderMilitaryBonus * defenseBonus;
    const attackerLossRatio = (defenderPower * defenderFighters) / (attackerPower * attackerFighters) / 4;
    attackerFightersLost = Math.min(
      Math.trunc(Math.min(attackerFighters * attackerLossRatio, attackerFighters) / 2),
      Math.trunc(attackerFighters * 0.3),
    );
    attackerFighters -= attackerFightersLost;

    if (attackerFighters > 0) {
      const defenderLossRatio = (attackerPower * attackerFighters) / (defenderPower * defenderFighters) / 4;
      defenderFightersLost = Math.min(
        Math.trunc(Math.min(defenderFighters * defenderLossRatio, defenderFighters) / 2),
        Math.trunc(defenderFighters * 0.3),
      );
      defenderFighters -= defenderFightersLost;
    }
  }

  const attackerTransports = getCount(attackerUnits, 'transport');
  if (attackerTransports > 0 && defenderFighters > 0) {
    const initialAttackerFighters = attackerFighters + attackerFightersLost;
    const lossRate = initialAttackerFighters > 0
      ? attackerFightersLost / initialAttackerFighters
      : 0.3;
    transportsLost = Math.trunc(attackerTransports * lossRate);
    attackerUnits.transport = attackerTransports - transportsLost;
  }

  attackerUnits.fighter = attackerFighters;
  defenderUnits.fighter = defenderFighters;

  return {
    phase: 'Air vs Air',
    atkFightersLost: attackerFightersLost,
    defFightersLost: defenderFightersLost,
    transportsLostToFighters: transportsLost,
    groundLostToTransports: { soldiersKilled: 0, droidsKilled: 0 },
  };
}

function phaseGroundVsGround(
  attackerUnits: UnitCounts,
  defenderUnits: UnitCounts,
  attackerMilitaryBonus: number,
  defenderMilitaryBonus: number,
  defenseBonus: number,
): Extract<BattlePhaseReport, { phase: 'Ground vs Ground' }> {
  let transportCapacity = getCount(attackerUnits, 'transport') * (UNITS.transport.capacity ?? 100);
  const attackerSoldiers = Math.min(getCount(attackerUnits, 'soldier'), transportCapacity);
  transportCapacity -= attackerSoldiers;
  const attackerDroids = Math.min(getCount(attackerUnits, 'droid'), transportCapacity);
  const defenderSoldiers = getCount(defenderUnits, 'soldier');
  const defenderDroids = getCount(defenderUnits, 'droid');
  const attackerPower = Math.trunc(
    (attackerSoldiers * UNITS.soldier.groundAttack + attackerDroids * UNITS.droid.groundAttack) * attackerMilitaryBonus,
  );
  const defenderPower = Math.trunc(
    (defenderSoldiers * UNITS.soldier.groundDefense + defenderDroids * UNITS.droid.groundDefense) * defenderMilitaryBonus * defenseBonus,
  );
  const attackerWon = attackerPower > defenderPower;

  let attackerLossPct = 0;
  let defenderLossPct = 0;
  if (attackerPower + defenderPower > 0) {
    attackerLossPct = Math.min(0.15, (0.15 * defenderPower) / Math.max(attackerPower, 1));
    defenderLossPct = Math.min(0.15, (0.15 * attackerPower) / Math.max(defenderPower, 1));
  }

  const attackerSoldiersLost = Math.trunc(attackerSoldiers * attackerLossPct);
  const attackerDroidsLost = Math.trunc(attackerDroids * attackerLossPct);
  const defenderSoldiersLost = Math.trunc(defenderSoldiers * defenderLossPct);
  const defenderDroidsLost = Math.trunc(defenderDroids * defenderLossPct);

  attackerUnits.soldier = getCount(attackerUnits, 'soldier') - attackerSoldiersLost;
  attackerUnits.droid = getCount(attackerUnits, 'droid') - attackerDroidsLost;
  defenderUnits.soldier = defenderSoldiers - defenderSoldiersLost;
  defenderUnits.droid = defenderDroids - defenderDroidsLost;

  return {
    phase: 'Ground vs Ground',
    attackerWon,
    atkPower: attackerPower,
    defPower: defenderPower,
    atkSoldiersLost: attackerSoldiersLost,
    atkDroidsLost: attackerDroidsLost,
    defSoldiersLost: defenderSoldiersLost,
    defDroidsLost: defenderDroidsLost,
  };
}

/** Kill ground units proportionally when transports are destroyed (troops inside die). */
function killProportionalGround(attackerUnits: UnitCounts, transportsLost: number, transportsBefore: number): { soldiersKilled: number; droidsKilled: number } {
  const soldiers = getCount(attackerUnits, 'soldier');
  const droids = getCount(attackerUnits, 'droid');
  let soldiersKilled = 0;
  let droidsKilled = 0;

  if (transportsLost > 0 && transportsBefore > 0) {
    const lossFraction = transportsLost / transportsBefore;
    soldiersKilled = Math.trunc(soldiers * lossFraction);
    droidsKilled = Math.trunc(droids * lossFraction);
    attackerUnits.soldier = soldiers - soldiersKilled;
    attackerUnits.droid = droids - droidsKilled;
  }

  return { soldiersKilled, droidsKilled };
}

function combatUnitsFromPlanet(planet: Planet): UnitCounts {
  const units: UnitCounts = {};
  for (const unit of COMBAT_UNIT_KEYS) {
    units[unit] = planet.units[unit] ?? 0;
  }
  return units;
}

function getSciencePercent(state: GameState, empire: Empire, science: ScienceKey): number {
  const networth = Math.max(calcEmpireNetworth(state, empire.id), 1);
  return 100 * (1 - Math.exp(-empire.researchPoints[science] / (100 * networth)));
}

function getCount(units: UnitCounts, unit: CombatUnitKey): number {
  return units[unit] ?? 0;
}

function rollFloat(state: GameState): number {
  if (state.rng === undefined) {
    throw new Error('GameState RNG is not initialized.');
  }
  return state.rng.float();
}

