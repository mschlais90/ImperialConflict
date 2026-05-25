import { calcEconomyBreakdown } from '../core/selectors/economySelectors';
import { collapsible, formatNumber } from './dom';
import type { UiContext } from './types';

export function renderEconomyPanel(context: UiContext): HTMLElement {
  const state = context.controller.state;
  if (!state) {
    throw new Error('Economy panel requires game state.');
  }

  const panel = document.createElement('section');
  panel.className = 'main-panel interactive';

  const title = document.createElement('h2');
  title.textContent = 'Economy Overview';
  const hint = document.createElement('p');
  hint.className = 'empty-text';
  hint.textContent = 'Press E to return';
  panel.append(title, hint);

  const breakdown = calcEconomyBreakdown(state, context.player.id);
  const resourceSciencePct = breakdown.research.sciencePercents.resources ?? 0;
  const resourceMult = 1 + resourceSciencePct / 100;

  // GC
  const netGc = breakdown.isStarving
    ? Math.trunc(breakdown.income.total / 2) - breakdown.upkeep.total
    : breakdown.income.total - breakdown.upkeep.total;

  panel.append(collapsible('econ-gc', summaryRow('GC (Income)', netGc), () => {
    const frag = document.createElement('div');
    frag.className = 'key-value-list';
    frag.append(
      kvRow('Base income', '+100'),
      kvRow(`Population (${formatNumber(breakdown.income.populationBonus * 30)} / 30)`, `+${formatNumber(breakdown.income.populationBonus)}`),
      kvRow(`Cash Factories (${Math.round(breakdown.income.cashFactoryBonus / 8)} x 8)`, `+${formatNumber(breakdown.income.cashFactoryBonus)}`),
    );
    if (breakdown.income.taxMultiplier !== 1) {
      frag.append(kvRow('Tax Office bonus', `x${breakdown.income.taxMultiplier.toFixed(2)}`));
    }
    if (breakdown.income.economyMultiplier !== 1) {
      frag.append(kvRow(`Economy Science (${(breakdown.income.economyMultiplier - 1) * 100 | 0}%)`, `x${breakdown.income.economyMultiplier.toFixed(2)}`));
    }
    if (breakdown.isStarving) {
      frag.append(kvRow('STARVATION PENALTY', 'x0.50'));
    }
    frag.append(kvRow('Gross income', `=${formatNumber(breakdown.isStarving ? Math.trunc(breakdown.income.total / 2) : breakdown.income.total)}`));
    frag.append(
      kvRow(`Building upkeep (${formatNumber(breakdown.upkeep.buildings)} x 1)`, `-${formatNumber(breakdown.upkeep.buildings)}`),
      kvRow(`Unit upkeep (${formatNumber(breakdown.upkeep.units)} x 1)`, `-${formatNumber(breakdown.upkeep.units)}`),
      kvRow('Net income', `=${formatSigned(netGc)}`),
    );
    return frag;
  }, true));

  // Food
  const netFood = breakdown.production.food.total - breakdown.foodConsumption.total - (breakdown.decay.food ?? 0);
  const foodProd = breakdown.production.food;
  panel.append(collapsible('econ-food', summaryRow('Food', netFood), () => {
    const frag = document.createElement('div');
    frag.className = 'key-value-list';
    frag.append(kvRow(`Farms (${foodProd.buildingCount} x 100)`, `+${formatNumber(foodProd.baseProduction)}`));
    if (resourceSciencePct > 0) {
      frag.append(kvRow(`  Resources Science (${resourceSciencePct.toFixed(1)}%)`, `x${resourceMult.toFixed(2)}`));
    }
    if (foodProd.bonusTotal > 0) {
      frag.append(kvRow('Planet Bonuses', `+${formatNumber(foodProd.bonusTotal)}`));
      for (const bp of foodProd.bonusedPlanets) {
        frag.append(kvRow(`  ${bp.planetName} (x${bp.bonus.toFixed(1)})`, `+${formatNumber(bp.extra)}`));
      }
    }
    frag.append(
      kvRow(`Pop consumption (${formatNumber(breakdown.foodConsumption.populationCost * 10)} / 10)`, `-${formatNumber(breakdown.foodConsumption.populationCost)}`),
      kvRow(`Unit consumption (${formatNumber(breakdown.foodConsumption.unitCost)} units)`, `-${formatNumber(breakdown.foodConsumption.unitCost)}`),
    );
    if ((breakdown.decay.food ?? 0) > 0) {
      frag.append(kvRow(`Decay (0.5%)`, `-${formatNumber(breakdown.decay.food!)}`));
    }
    frag.append(kvRow('Net food', `=${formatSigned(netFood)}`));
    return frag;
  }, false));

  // Iron, Endurium, Octarine
  const RESOURCE_BUILDINGS: Record<string, { buildingName: string; perBuilding: number }> = {
    iron: { buildingName: 'Mining Facility', perBuilding: 1 },
    endurium: { buildingName: 'Refinement Station', perBuilding: 1 },
    octarine: { buildingName: 'Occult Center', perBuilding: 1 },
  };

  for (const resource of ['iron', 'endurium', 'octarine'] as const) {
    const prod = breakdown.production[resource];
    const decay = breakdown.decay[resource] ?? 0;
    const net = prod.total - decay;
    const info = RESOURCE_BUILDINGS[resource];

    panel.append(collapsible(`econ-${resource}`, summaryRow(capitalize(resource), net), () => {
      const frag = document.createElement('div');
      frag.className = 'key-value-list';
      frag.append(kvRow(`${info.buildingName} (${prod.buildingCount} x ${info.perBuilding})`, `+${formatNumber(prod.baseProduction)}`));
      if (resourceSciencePct > 0) {
        frag.append(kvRow(`  Resources Science (${resourceSciencePct.toFixed(1)}%)`, `x${resourceMult.toFixed(2)}`));
      }
      if (prod.bonusTotal > 0) {
        frag.append(kvRow('Planet Bonuses', `+${formatNumber(prod.bonusTotal)}`));
        for (const bp of prod.bonusedPlanets) {
          frag.append(kvRow(`  ${bp.planetName} (x${bp.bonus.toFixed(1)})`, `+${formatNumber(bp.extra)}`));
        }
      }
      if (decay > 0) {
        frag.append(kvRow('Decay (0.5%)', `-${formatNumber(decay)}`));
      }
      frag.append(kvRow(`Net ${resource}`, `=${formatSigned(net)}`));
      return frag;
    }, false));
  }

  // Population
  panel.append(collapsible('econ-population', 'Population', () => {
    const frag = document.createElement('div');
    frag.className = 'key-value-list';
    frag.append(kvRow('Growth rate', `${breakdown.populationGrowth.growthRate}% per tick`));
    if (breakdown.populationGrowth.welfareMultiplier !== 1) {
      frag.append(kvRow('Welfare multiplier', `x${breakdown.populationGrowth.welfareMultiplier.toFixed(2)}`));
    }
    if (breakdown.isStarving) {
      frag.append(kvRow('Status', 'STARVING - income halved'));
    }
    return frag;
  }, false));

  // Research
  panel.append(collapsible('econ-research', 'Research', () => {
    const frag = document.createElement('div');
    frag.className = 'key-value-list';
    const rpPerTick = breakdown.research.rpPerTick;
    frag.append(kvRow(`Research Centers (${Math.round(rpPerTick / 20)} x 20)`, `+${formatNumber(rpPerTick)}`));
    for (const [science, pct] of Object.entries(breakdown.research.allocation)) {
      const rp = Math.trunc(rpPerTick * pct / 100);
      frag.append(kvRow(`  ${capitalize(science)} (${pct}%)`, `+${formatNumber(rp)} RP`));
    }
    return frag;
  }, false));

  return panel;
}

function summaryRow(label: string, net: number): HTMLElement {
  const row = document.createElement('span');
  row.className = 'econ-summary-row';
  const colorClass = net >= 0 ? 'tick-positive' : 'tick-negative';
  row.innerHTML = `<span>${label}</span><span class="${colorClass}">${formatSigned(net)}/tick</span>`;
  return row;
}

function kvRow(label: string, value: string): HTMLElement {
  const row = document.createElement('div');
  row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
  return row;
}

function formatSigned(value: number): string {
  const text = formatNumber(Math.abs(value));
  return value >= 0 ? `+${text}` : `-${text}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
