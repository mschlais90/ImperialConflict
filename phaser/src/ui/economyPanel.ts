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

  // Per-tick summary for all resources
  const netGc = breakdown.income.total - breakdown.upkeep.total;
  const netFood = breakdown.production.food.total - breakdown.foodConsumption.total - (breakdown.decay.food ?? 0);
  const netIron = breakdown.production.iron.total - (breakdown.decay.iron ?? 0);
  const netEndurium = breakdown.production.endurium.total - (breakdown.decay.endurium ?? 0);
  const netOctarine = breakdown.production.octarine.total - (breakdown.decay.octarine ?? 0);

  const summary = document.createElement('div');
  summary.className = 'key-value-list';
  summary.append(
    kvRow('GC', formatSigned(netGc)),
    kvRow('Food', formatSigned(netFood)),
    kvRow('Iron', formatSigned(netIron)),
    kvRow('Endurium', formatSigned(netEndurium)),
    kvRow('Octarine', formatSigned(netOctarine)),
  );
  panel.append(summary);

  // Income
  panel.append(collapsible('econ-income', 'Income (GC)', () => {
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
    frag.append(kvRow('Total income', formatNumber(breakdown.income.total)));
    return frag;
  }, true));

  // Production per resource
  for (const resource of ['food', 'iron', 'endurium', 'octarine'] as const) {
    const prod = breakdown.production[resource];
    if (prod.total === 0 && prod.details.length === 0) continue;

    panel.append(collapsible(`econ-prod-${resource}`, `${capitalize(resource)} Production`, () => {
      const frag = document.createElement('div');
      frag.className = 'key-value-list';
      for (const d of prod.details) {
        const bonusText = d.bonus !== 1 ? ` (x${d.bonus.toFixed(1)} bonus)` : '';
        frag.append(kvRow(`${d.planetName}: ${d.buildingCount} ${d.buildingType}${bonusText}`, `+${formatNumber(d.amount)}`));
      }
      frag.append(kvRow('Total', formatNumber(prod.total)));
      return frag;
    }, false));
  }

  // Expenses
  panel.append(collapsible('econ-expenses', 'Expenses', () => {
    const frag = document.createElement('div');
    frag.className = 'key-value-list';
    frag.append(
      kvRow('Food consumption (pop)', formatNumber(breakdown.foodConsumption.populationCost)),
      kvRow('Food consumption (units)', formatNumber(breakdown.foodConsumption.unitCost)),
      kvRow('Food total', formatNumber(breakdown.foodConsumption.total)),
    );
    for (const [res, amount] of Object.entries(breakdown.decay)) {
      if (amount && amount > 0) {
        frag.append(kvRow(`${capitalize(res)} decay (0.5%)`, `-${formatNumber(amount)}`));
      }
    }
    frag.append(
      kvRow('Upkeep (buildings)', formatNumber(breakdown.upkeep.buildings)),
      kvRow('Upkeep (units)', formatNumber(breakdown.upkeep.units)),
      kvRow('Total upkeep (GC)', formatNumber(breakdown.upkeep.total)),
    );
    return frag;
  }, true));

  // Population
  panel.append(collapsible('econ-population', 'Population', () => {
    const frag = document.createElement('div');
    frag.className = 'key-value-list';
    frag.append(kvRow('Growth rate', `${breakdown.populationGrowth.growthRate}% per tick`));
    if (breakdown.populationGrowth.welfareMultiplier !== 1) {
      frag.append(kvRow('Welfare multiplier', `x${breakdown.populationGrowth.welfareMultiplier.toFixed(2)}`));
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
