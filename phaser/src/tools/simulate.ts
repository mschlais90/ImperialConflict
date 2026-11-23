import type { AiStrategy } from '../core/galaxy/galaxyData';
import { runAiGame, type Difficulty, type SimEmpireConfig, type SimResult } from '../core/sim/headlessSim';

// Batch AI-vs-AI simulator for balance and AI tuning.
//
//   npm run sim -- --games 40 --ticks 800 --empires hard:adaptive,hard:classic,hard:classic,hard:classic
//
// Each game rotates the configs through the empire slots so no config always
// gets the same start position. Results are aggregated per config label.
// Flags: --games N  --ticks N  --seed N (first seed)  --empires d:s,...  --json

interface Args {
  games: number;
  ticks: number;
  seed: number;
  empires: SimEmpireConfig[];
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const spec = get('--empires') ?? 'hard:adaptive,hard:adaptive,hard:adaptive,hard:adaptive';
  const empires = spec.split(',').map((part) => {
    const [difficulty = 'hard', strategy = 'adaptive'] = part.trim().split(':');
    if (!['easy', 'normal', 'hard'].includes(difficulty)) throw new Error(`Bad difficulty: ${difficulty}`);
    if (!['classic', 'adaptive'].includes(strategy)) throw new Error(`Bad strategy: ${strategy}`);
    return { difficulty: difficulty as Difficulty, strategy: strategy as AiStrategy };
  });
  return {
    games: Number(get('--games') ?? 20),
    ticks: Number(get('--ticks') ?? 800),
    seed: Number(get('--seed') ?? 1),
    empires,
    json: argv.includes('--json'),
  };
}

const label = (c: SimEmpireConfig): string => `${c.difficulty ?? 'hard'}:${c.strategy ?? 'adaptive'}`;

interface Agg {
  label: string;
  entries: number;
  wins: number;
  rankSum: number;
  eliminated: number;
  planetsSum: number;
  peakPlanetsSum: number;
  networthSum: number;
  attacks: number;
  attacksWon: number;
  defencesHeld: number;
  planetsLost: number;
  colonized: number;
  units: Record<string, number>;
  ops: Record<string, number>;
}

function aggregate(results: Array<{ result: SimResult; configs: SimEmpireConfig[] }>): Map<string, Agg> {
  const byLabel = new Map<string, Agg>();
  for (const { result, configs } of results) {
    for (const e of result.empires) {
      const key = label(configs[e.empireId]);
      const agg = byLabel.get(key) ?? {
        label: key, entries: 0, wins: 0, rankSum: 0, eliminated: 0, planetsSum: 0, peakPlanetsSum: 0, networthSum: 0,
        attacks: 0, attacksWon: 0, defencesHeld: 0, planetsLost: 0, colonized: 0, units: {}, ops: {},
      };
      agg.entries += 1;
      if (e.rank === 1) agg.wins += 1;
      agg.rankSum += e.rank;
      if (e.eliminatedTick !== null) agg.eliminated += 1;
      agg.planetsSum += e.finalPlanets;
      agg.peakPlanetsSum += e.peakPlanets;
      agg.networthSum += e.finalNetworth;
      agg.attacks += e.attacksLaunched;
      agg.attacksWon += e.attacksWon;
      agg.defencesHeld += e.defencesHeld;
      agg.planetsLost += e.planetsLost;
      agg.colonized += e.colonized;
      for (const [k, v] of Object.entries(e.unitsBuilt)) agg.units[k] = (agg.units[k] ?? 0) + (v ?? 0);
      for (const [k, v] of Object.entries(e.opsLaunched)) agg.ops[k] = (agg.ops[k] ?? 0) + v;
      byLabel.set(key, agg);
    }
  }
  return byLabel;
}

const pct = (n: number, d: number): string => (d === 0 ? '  -  ' : `${((100 * n) / d).toFixed(0).padStart(3)}%`);
const avg = (n: number, d: number, digits = 1): string => (d === 0 ? '-' : (n / d).toFixed(digits));

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const n = args.empires.length;
  const results: Array<{ result: SimResult; configs: SimEmpireConfig[] }> = [];
  const started = Date.now();

  for (let g = 0; g < args.games; g++) {
    const shift = g % n;
    const configs = args.empires.map((_, slot) => args.empires[(slot + shift) % n]);
    results.push({ result: runAiGame({ seed: args.seed + g, empires: configs, maxTicks: args.ticks }), configs });
  }

  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const conquests = results.filter((r) => r.result.conquestWinnerId !== null);
  const firstElims = results.map((r) => r.result.firstEliminationTick).filter((t): t is number => t !== null);
  console.log(`\n${args.games} games x ${n} empires, max ${args.ticks} ticks, seeds ${args.seed}..${args.seed + args.games - 1} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  console.log(`Conquest finishes: ${conquests.length}/${args.games}` +
    (conquests.length ? `, avg length ${avg(conquests.reduce((s, r) => s + r.result.ticksPlayed, 0), conquests.length, 0)} ticks` : ''));
  console.log(`Games with an elimination: ${firstElims.length}/${args.games}` +
    (firstElims.length ? `, first elimination avg tick ${avg(firstElims.reduce((s, t) => s + t, 0), firstElims.length, 0)}` : ''));

  // Snowball: share of total networth held by the leader at each sample point.
  const samples = new Map<number, number[]>();
  for (const { result } of results) {
    for (const point of result.networthCurve) {
      const total = point.networth.reduce((s, v) => s + v, 0);
      if (total <= 0) continue;
      const list = samples.get(point.tick) ?? [];
      list.push(Math.max(...point.networth) / total);
      samples.set(point.tick, list);
    }
  }
  const curve = [...samples.entries()].filter(([tick]) => tick % 100 === 0)
    .map(([tick, shares]) => `t${tick}:${pct(shares.reduce((s, v) => s + v, 0), shares.length).trim()}`);
  console.log(`Leader networth share: ${curve.join('  ')}`);

  console.log('\nconfig          win%  rank  elim%  planets(peak)  networth   atk  atkWin%  heldDef  lost  colon');
  for (const a of aggregate(results).values()) {
    console.log(
      `${a.label.padEnd(15)} ${pct(a.wins, a.entries)}  ${avg(a.rankSum, a.entries, 2).padStart(4)}  ${pct(a.eliminated, a.entries)}  ` +
      `${avg(a.planetsSum, a.entries).padStart(6)} (${avg(a.peakPlanetsSum, a.entries).padStart(4)})  ${avg(a.networthSum, a.entries, 0).padStart(9)}  ` +
      `${avg(a.attacks, a.entries).padStart(4)}  ${pct(a.attacksWon, a.attacks).padStart(6)}  ${avg(a.defencesHeld, a.entries).padStart(7)}  ` +
      `${avg(a.planetsLost, a.entries).padStart(4)}  ${avg(a.colonized, a.entries).padStart(5)}`,
    );
  }
  console.log('\nunits built per empire:');
  for (const a of aggregate(results).values()) {
    const units = Object.entries(a.units).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${avg(v, a.entries, 0)}`).join(', ');
    const ops = Object.entries(a.ops).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${avg(v, a.entries)}`).join(', ');
    console.log(`  ${a.label.padEnd(15)} ${units}\n  ${''.padEnd(15)} ops: ${ops || 'none'}`);
  }
}

main();
