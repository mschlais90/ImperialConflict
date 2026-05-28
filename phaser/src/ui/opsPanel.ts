import {
  AGENT_OP_DIFFICULTY,
  getAgentOperationCost,
  getSpellCost,
  getSuccessChance,
  getTotalAgents,
  getTotalWizards,
  SPELL_DIFFICULTY,
  type AgentOperationType,
  type SpellType,
} from '../core/engines/opsEngine';
import { calcEmpireNetworth, getPlanetsForEmpire } from '../core/selectors/selectors';
import type { Empire } from '../core/models/types';
import { button, formatNumber, select } from './dom';
import type { UiContext } from './types';

const AGENT_OPS: { type: AgentOperationType; name: string; description: string; needsPlanet: boolean }[] = [
  { type: 'spy', name: 'Spy', description: 'Reveal enemy resources and planet count.', needsPlanet: false },
  { type: 'destroy_cash', name: 'Destroy Cash', description: 'Destroy 3-10% of enemy GC.', needsPlanet: false },
  { type: 'destroy_units', name: 'Destroy Units', description: 'Destroy 30% of a random unit type on a planet.', needsPlanet: true },
  { type: 'sabotage_portal', name: 'Sabotage Portal', description: 'Disable a portal for 20 ticks.', needsPlanet: true },
];

const WIZARD_SPELLS: { type: SpellType; name: string; description: string; needsPlanet: boolean }[] = [
  { type: 'vision', name: 'Vision', description: 'Reveal enemy resources and planet count.', needsPlanet: false },
  { type: 'hypnotize', name: 'Hypnotize', description: 'Kill 30% population on a planet.', needsPlanet: true },
  { type: 'reduce_food', name: 'Reduce Food', description: 'Reduce food production by 10% for 8 ticks (max 3 stacks).', needsPlanet: false },
  { type: 'destroy_iron', name: 'Destroy Iron', description: 'Destroy 3-10% of enemy iron.', needsPlanet: false },
];

export function renderOpsPanel(context: UiContext): HTMLElement {
  const state = context.controller.state;
  if (!state) throw new Error('Ops panel requires game state.');

  const panel = document.createElement('section');
  panel.className = 'main-panel interactive';

  const title = document.createElement('h2');
  title.textContent = 'Operations';
  const hint = document.createElement('p');
  hint.className = 'empty-text';
  hint.textContent = 'Press O to return';
  panel.append(title, hint);

  const totalAgents = getTotalAgents(state, context.player);
  const totalWizards = getTotalWizards(state, context.player);

  const forces = document.createElement('div');
  forces.className = 'ops-forces';
  forces.innerHTML = `<span>Agents: <strong>${totalAgents}</strong></span> <span>Wizards: <strong>${totalWizards}</strong></span>`;
  panel.append(forces);

  // Target selection
  const enemies = state.empires.filter(
    (e) => e.id !== context.player.id && !state.events.some((ev) => ev.type === 'empire_eliminated' && ev.empireId === e.id),
  );

  if (enemies.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'empty-text';
    msg.textContent = 'No enemy empires remain.';
    panel.append(msg);
    return panel;
  }

  const targetRow = document.createElement('div');
  targetRow.className = 'ops-target-row';

  const empireSelect = select(
    enemies.map((e) => ({ label: e.empireName, value: e.id })),
    enemies[0].id,
  );
  const empireLabel = document.createElement('label');
  empireLabel.className = 'form-row';
  empireLabel.append(document.createTextNode('Target Empire'), empireSelect);
  targetRow.append(empireLabel);

  let planetSelectLabel: HTMLLabelElement | null = null;
  let planetSelect: HTMLSelectElement | null = null;

  function rebuildPlanetSelect(): void {
    const empireId = Number(empireSelect.value);
    const planets = getPlanetsForEmpire(state!, empireId);
    const newPlanetSelect = select(
      planets.map((p) => ({ label: p.planetName, value: p.id })),
      planets.length > 0 ? planets[0].id : -1,
    );
    const newLabel = document.createElement('label');
    newLabel.className = 'form-row';
    newLabel.append(document.createTextNode('Target Planet'), newPlanetSelect);

    if (planetSelectLabel) {
      planetSelectLabel.replaceWith(newLabel);
    } else {
      targetRow.append(newLabel);
    }
    planetSelectLabel = newLabel;
    planetSelect = newPlanetSelect;
  }

  rebuildPlanetSelect();
  empireSelect.addEventListener('change', rebuildPlanetSelect);
  panel.append(targetRow);

  // Success chance info
  function getTargetEmpire(): Empire {
    return enemies.find((e) => e.id === Number(empireSelect.value)) ?? enemies[0];
  }

  // Agent Operations section
  const agentSection = document.createElement('div');
  agentSection.className = 'ops-section';
  const agentTitle = document.createElement('h3');
  agentTitle.textContent = 'Agent Operations';
  agentSection.append(agentTitle);

  const agentCost = getAgentOperationCost(state, context.player);
  const agentCostEl = document.createElement('p');
  agentCostEl.className = 'ops-cost';
  agentCostEl.textContent = `Cost: ${formatNumber(agentCost)} GC per operation`;
  agentSection.append(agentCostEl);

  for (const op of AGENT_OPS) {
    const target = getTargetEmpire();
    const chance = getSuccessChance(
      totalAgents,
      getTotalAgents(state, target),
      calcEmpireNetworth(state, context.player.id),
      calcEmpireNetworth(state, target.id),
      AGENT_OP_DIFFICULTY[op.type],
    );

    const row = document.createElement('div');
    row.className = 'ops-row';

    const info = document.createElement('div');
    info.className = 'ops-info';
    const nameEl = document.createElement('span');
    nameEl.className = 'ops-name';
    nameEl.textContent = op.name;
    const descEl = document.createElement('span');
    descEl.className = 'ops-desc';
    descEl.textContent = op.description;
    const chanceEl = document.createElement('span');
    chanceEl.className = 'ops-chance';
    chanceEl.textContent = `${Math.trunc(chance * 100)}% chance`;
    info.append(nameEl, descEl, chanceEl);

    const btn = button('Execute', () => {
      context.runCommand(() =>
        context.commands.performAgentOperation({
          empireId: context.player.id,
          targetEmpireId: Number(empireSelect.value),
          operationType: op.type,
          targetPlanetId: op.needsPlanet && planetSelect ? Number(planetSelect.value) : undefined,
        }),
      );
    });
    if (totalAgents <= 0 || context.player.resources.gc < agentCost) {
      btn.disabled = true;
    }

    row.append(info, btn);
    agentSection.append(row);
  }
  panel.append(agentSection);

  // Wizard Spells section
  const wizardSection = document.createElement('div');
  wizardSection.className = 'ops-section';
  const wizardTitle = document.createElement('h3');
  wizardTitle.textContent = 'Wizard Spells';
  wizardSection.append(wizardTitle);

  const spellCost = getSpellCost(state, context.player);
  const spellCostEl = document.createElement('p');
  spellCostEl.className = 'ops-cost';
  spellCostEl.textContent = `Cost: ${formatNumber(spellCost)} octarine per spell`;
  wizardSection.append(spellCostEl);

  for (const spell of WIZARD_SPELLS) {
    const target = getTargetEmpire();
    const chance = getSuccessChance(
      totalWizards,
      getTotalWizards(state, target),
      calcEmpireNetworth(state, context.player.id),
      calcEmpireNetworth(state, target.id),
      SPELL_DIFFICULTY[spell.type],
    );

    const row = document.createElement('div');
    row.className = 'ops-row';

    const info = document.createElement('div');
    info.className = 'ops-info';
    const nameEl = document.createElement('span');
    nameEl.className = 'ops-name';
    nameEl.textContent = spell.name;
    const descEl = document.createElement('span');
    descEl.className = 'ops-desc';
    descEl.textContent = spell.description;
    const chanceEl = document.createElement('span');
    chanceEl.className = 'ops-chance';
    chanceEl.textContent = `${Math.trunc(chance * 100)}% chance`;
    info.append(nameEl, descEl, chanceEl);

    const btn = button('Cast', () => {
      context.runCommand(() =>
        context.commands.performSpell({
          empireId: context.player.id,
          targetEmpireId: Number(empireSelect.value),
          spellType: spell.type,
          targetPlanetId: spell.needsPlanet && planetSelect ? Number(planetSelect.value) : undefined,
        }),
      );
    });
    if (totalWizards <= 0 || context.player.resources.octarine < spellCost) {
      btn.disabled = true;
    }

    row.append(info, btn);
    wizardSection.append(row);
  }
  panel.append(wizardSection);

  // Active Debuffs section
  if (context.player.debuffs.length > 0) {
    const debuffSection = document.createElement('div');
    debuffSection.className = 'ops-section';
    const debuffTitle = document.createElement('h3');
    debuffTitle.textContent = 'Active Debuffs';
    debuffSection.append(debuffTitle);

    for (const debuff of context.player.debuffs) {
      const row = document.createElement('div');
      row.className = 'ops-debuff';
      const typeLabel = debuff.type === 'portal_disabled' ? 'Portal Disabled' : debuff.type === 'reduced_food' ? 'Reduced Food (-10%)' : debuff.type;
      let text = `${typeLabel} - ${debuff.ticksRemaining} ticks remaining`;
      if (debuff.planetId !== undefined) {
        const planet = state.planets.find((p) => p.id === debuff.planetId);
        if (planet) text += ` (${planet.planetName})`;
      }
      row.textContent = text;
      debuffSection.append(row);
    }
    panel.append(debuffSection);
  }

  return panel;
}
