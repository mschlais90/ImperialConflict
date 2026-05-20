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

  // GC
  const netGc = breakdown.isStarving
    ? Math.trunc(breakdown.income.total / 2) - breakdown.upkeep.total
    : breakdown.income.total - breakdown.upkeep.total;

  panel.append(collapsible('econ-gc', summaryRow('GC', netGc), () => {
    const frag = document.createElement('div');
    frag.className = 'key-value-list';
    frag.append(
      kvRow('Population bonus', `+${formatNumber(breakdown.income.populationBonus)}`),
      kvRow('Cash factories', `+${formatNumber(breakdown.income.cashFactoryBonus)}`),
    );
    if (breakdown.income.taxMultiplier !== 1) {
      frag.append(kvRow('Tax multiplier', `x${breakdown.income.taxMultiplier.toFixed(2)}`));
    }
    if (breakdown.income.economyMultiplier !== 1) {
      frag.append(kvRow('Economy science', `x${breakdown.income.economyMultiplier.toFixed(2)}`));
    }
    frag.append(kvRow('Gross income', formatNumber(breakdown.income.total)));
    if (breakdown.isStarving) {
      frag.append(kvRow('Starvation penalty', '-50% income'));
      frag.append(kvRow('Halved income', formatNumber(Math.trunc(breakdown.income.total / 2))));
    }
    frag.append(
      kvRow('Upkeep (buildings)', `-${formatNumber(breakdown.upkeep.buildings)}`),
      kvRow('Upkeep (units)', `-${formatNumber(breakdown.upkeep.units)}`),
      kvRow('Net GC', formatSigned(netGc)),
    );
    return frag;
  }, true));

  // Food
  const netFood = breakdown.production.food.total - breakdown.foodConsumption.total - (breakdown.decay.food ?? 0);
  panel.append(collapsible('econ-food', summaryRow('Food', netFood), () => {
    const frag = document.createElement('div');
    frag.className = 'key-value-list';
    for (const d of breakdown.production.food.details) {
      const bonusText = d.bonus !== 1 ? ` (x${d.bonus.toFixed(1)} bonus)` : '';
      frag.append(kvRow(`${d.planetName}: ${d.buildingCount} ${d.buildingType}${bonusText}`, `+${formatNumber(d.amount)}`));
    }
    if (breakdown.production.food.total > 0) {
      frag.append(kvRow('Total production', `+${formatNumber(breakdown.production.food.total)}`));
    }
    frag.append(
      kvRow('Pop consumption', `-${formatNumber(breakdown.foodConsumption.populationCost)}`),
      kvRow('Unit consumption', `-${formatNumber(breakdown.foodConsumption.unitCost)}`),
    );
    if ((breakdown.decay.food ?? 0) > 0) {
      frag.append(kvRow('Decay (0.5%)', `-${formatNumber(breakdown.decay.food!)}`));
    }
    frag.append(kvRow('Net food', formatSigned(netFood)));
    return frag;
  }, false));

  // Iron, Endurium, Octarine
  for (const resource of ['iron', 'endurium', 'octarine'] as const) {
    const prod = breakdown.production[resource];
    const decay = breakdown.decay[resource] ?? 0;
    const net = prod.total - decay;

    panel.append(collapsible(`econ-${resource}`, summaryRow(capitalize(resource), net), () => {
      const frag = document.createElement('div');
      frag.className = 'key-value-list';
      for (const d of prod.details) {
        const bonusText = d.bonus !== 1 ? ` (x${d.bonus.toFixed(1)} bonus)` : '';
        frag.append(kvRow(`${d.planetName}: ${d.buildingCount} ${d.buildingType}${bonusText}`, `+${formatNumber(d.amount)}`));
      }
      if (prod.total > 0) {
        frag.append(kvRow('Total production', `+${formatNumber(prod.total)}`));
      }
      if (decay > 0) {
        frag.append(kvRow('Decay (0.5%)', `-${formatNumber(decay)}`));
      }
      frag.append(kvRow(`Net ${resource}`, formatSigned(net)));
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
    frag.append(kvRow('RP per tick', formatNumber(breakdown.research.rpPerTick)));
    for (const [science, pct] of Object.entries(breakdown.research.allocation)) {
      const effectiveness = breakdown.research.sciencePercents[science as keyof typeof breakdown.research.sciencePercents];
      frag.append(kvRow(`${capitalize(science)}`, `${pct}% alloc -> ${effectiveness.toFixed(1)}% effect`));
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
