import type { CommandResult } from '../core/commands/playerCommands';
import {
  AGENT_OP_DIFFICULTY,
  agentOpName,
  getActiveMissionCount,
  getAgentOperationCost,
  getMissionDuration,
  getSpellCost,
  getSuccessChance,
  getTotalAgents,
  getTotalWizards,
  MAX_ACTIVE_MISSIONS,
  REDUCE_FOOD_MAX_STACKS,
  REDUCE_FOOD_PCT,
  REDUCE_FOOD_TICKS,
  SPELL_DIFFICULTY,
  spellName,
  type AgentOperationType,
  type MissionKind,
  type OpDifficulty,
  type SpellType,
} from '../core/engines/opsEngine';
import { calcEmpireNetworth, getEmpire, getPlanet, getPlanetsForEmpire } from '../core/selectors/selectors';
import type { Empire } from '../core/models/types';
import { button, formatNumber, labeledControl, numberInput, select } from './dom';
import { resourceIcon } from './resourceIcons';
import type { UiContext } from './types';

// Persist last selected targets and commitments across re-renders
let persistedEmpireId: number | null = null;
let persistedPlanetId: number | null = null;
const persistedCommit: Record<MissionKind, number | null> = { agent: null, wizard: null };

type OpEntry<T extends string> = { type: T; name: string; description: string; needsPlanet: boolean };

const AGENT_OPS: OpEntry<AgentOperationType>[] = [
  { type: 'spy', name: 'Spy', description: 'Reveal enemy resources and planet count.', needsPlanet: false },
  { type: 'destroy_cash', name: 'Destroy Cash', description: 'Destroy 3-10% of enemy GC.', needsPlanet: false },
  { type: 'destroy_units', name: 'Destroy Units', description: 'Destroy 30% of a random unit type on a planet.', needsPlanet: true },
  { type: 'sabotage_portal', name: 'Sabotage Portal', description: 'Disable a portal for 20 ticks.', needsPlanet: true },
];

const WIZARD_SPELLS: OpEntry<SpellType>[] = [
  { type: 'vision', name: 'Vision', description: 'Reveal resources, military totals and active ops missions.', needsPlanet: false },
  { type: 'hypnotize', name: 'Hypnotize', description: 'Kill 30% population on a planet.', needsPlanet: true },
  {
    type: 'reduce_food',
    name: 'Reduce Food',
    description: `Curse: -${REDUCE_FOOD_PCT * 100}% food production for ${REDUCE_FOOD_TICKS} ticks (max ${REDUCE_FOOD_MAX_STACKS} stacks).`,
    needsPlanet: false,
  },
  { type: 'destroy_iron', name: 'Destroy Iron', description: 'Destroy 8-15% of enemy iron.', needsPlanet: false },
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
    (e) => e.id !== context.player.id && !e.isEliminated,
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

  // Use persisted empire if still valid, otherwise first enemy
  const defaultEmpire = persistedEmpireId !== null && enemies.some((e) => e.id === persistedEmpireId)
    ? persistedEmpireId
    : enemies[0].id;
  const empireSelect = select(
    enemies.map((e) => ({ label: e.empireName, value: e.id })),
    defaultEmpire,
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
    // Use persisted planet if still owned by the selected empire
    const defaultPlanet = persistedPlanetId !== null && planets.some((p) => p.id === persistedPlanetId)
      ? persistedPlanetId
      : planets.length > 0 ? planets[0].id : -1;
    const newPlanetSelect = select(
      planets.map((p) => ({ label: p.planetName, value: p.id })),
      defaultPlanet,
    );
    const newLabel = document.createElement('label');
    newLabel.className = 'form-row';
    newLabel.append(document.createTextNode('Target Planet'), newPlanetSelect);

    newPlanetSelect.addEventListener('change', () => {
      persistedPlanetId = Number(newPlanetSelect.value);
    });

    if (planetSelectLabel) {
      planetSelectLabel.replaceWith(newLabel);
    } else {
      targetRow.append(newLabel);
    }
    planetSelectLabel = newLabel;
    planetSelect = newPlanetSelect;
    persistedPlanetId = Number(newPlanetSelect.value);
  }

  rebuildPlanetSelect();
  empireSelect.addEventListener('change', () => {
    persistedEmpireId = Number(empireSelect.value);
    rebuildPlanetSelect();
  });
  // Initialize persisted values from current selections (rebuildPlanetSelect sets planetSelect)
  persistedEmpireId = Number(empireSelect.value);
  panel.append(targetRow);

  const agentCost = getAgentOperationCost(state, context.player);
  const spellCost = getSpellCost(state, context.player);

  function getTargetEmpire(): Empire {
    return enemies.find((e) => e.id === Number(empireSelect.value)) ?? enemies[0];
  }

  const playerNetworth = calcEmpireNetworth(state, context.player.id);

  function renderSection<T extends string>(config: {
    kind: MissionKind;
    title: string;
    unitLabel: string;
    actionLabel: string;
    available: number;
    costHtml: string;
    canAfford: boolean;
    entries: OpEntry<T>[];
    difficulty: Record<T, OpDifficulty>;
    countDefenders: (target: Empire) => number;
    launch: (type: T, targetPlanetId: number | undefined, units: number) => CommandResult;
  }): HTMLElement {
    const section = document.createElement('div');
    section.className = 'ops-section';
    const heading = document.createElement('h3');
    heading.textContent = config.title;
    section.append(heading);

    const activeCount = getActiveMissionCount(context.player, config.kind);
    const atCap = activeCount >= MAX_ACTIVE_MISSIONS;
    const costEl = document.createElement('p');
    costEl.className = 'ops-cost';
    costEl.innerHTML = `${config.costHtml} · Missions ${activeCount}/${MAX_ACTIVE_MISSIONS}`;
    section.append(costEl);

    const persisted = persistedCommit[config.kind];
    const initialCommit = persisted !== null && persisted <= config.available ? persisted : config.available;
    const commitInput = numberInput(initialCommit, { min: 1, max: Math.max(config.available, 1) });
    commitInput.className = 'ops-commit-input';
    const commitRow = labeledControl(`Commit ${config.unitLabel} (of ${config.available})`, commitInput);
    commitRow.classList.add('ops-commit-row');
    const etaEl = document.createElement('span');
    etaEl.className = 'ops-desc';
    commitRow.append(etaEl);
    section.append(commitRow);

    const chanceEls: Array<{ el: HTMLElement; type: T }> = [];
    const updateEstimates = () => {
      const target = getTargetEmpire();
      const commit = Math.min(Math.max(Math.trunc(Number(commitInput.value) || 0), 0), config.available);
      const defenders = config.countDefenders(target);
      const targetNetworth = calcEmpireNetworth(state!, target.id);
      for (const { el, type } of chanceEls) {
        const chance = getSuccessChance(commit, defenders, playerNetworth, targetNetworth, config.difficulty[type]);
        el.textContent = `${Math.trunc(chance * 100)}% chance`;
      }
      const eta = getMissionDuration(state!, config.kind, context.player, target);
      etaEl.textContent = `Arrives in ~${eta} ticks`;
    };
    commitInput.addEventListener('input', () => {
      const value = Math.trunc(Number(commitInput.value));
      persistedCommit[config.kind] = Number.isFinite(value) && value > 0 ? value : null;
      updateEstimates();
    });
    empireSelect.addEventListener('change', updateEstimates);

    for (const entry of config.entries) {
      const row = document.createElement('div');
      row.className = 'ops-row';

      const info = document.createElement('div');
      info.className = 'ops-info';
      const nameEl = document.createElement('span');
      nameEl.className = 'ops-name';
      nameEl.textContent = entry.name;
      const descEl = document.createElement('span');
      descEl.className = 'ops-desc';
      descEl.textContent = entry.description;
      const chanceEl = document.createElement('span');
      chanceEl.className = 'ops-chance';
      chanceEls.push({ el: chanceEl, type: entry.type });
      info.append(nameEl, descEl, chanceEl);

      const btn = button(config.actionLabel, () => {
        context.runCommand(() =>
          config.launch(
            entry.type,
            entry.needsPlanet && planetSelect ? Number(planetSelect.value) : undefined,
            Math.trunc(Number(commitInput.value)),
          ),
        );
      });
      if (config.available <= 0 || !config.canAfford || atCap) {
        btn.disabled = true;
      }

      row.append(info, btn);
      section.append(row);
    }

    updateEstimates();
    return section;
  }

  panel.append(
    renderSection<AgentOperationType>({
      kind: 'agent',
      title: 'Agent Operations',
      unitLabel: 'agents',
      actionLabel: 'Launch',
      available: totalAgents,
      costHtml: `Cost: ${formatNumber(agentCost)} ${resourceIcon('gc')} per mission`,
      canAfford: context.player.resources.gc >= agentCost,
      entries: AGENT_OPS,
      difficulty: AGENT_OP_DIFFICULTY,
      countDefenders: (target) => getTotalAgents(state, target),
      launch: (operationType, targetPlanetId, units) =>
        context.commands.performAgentOperation({
          empireId: context.player.id,
          targetEmpireId: Number(empireSelect.value),
          operationType,
          targetPlanetId,
          units,
        }),
    }),
    renderSection<SpellType>({
      kind: 'wizard',
      title: 'Wizard Spells',
      unitLabel: 'wizards',
      actionLabel: 'Cast',
      available: totalWizards,
      costHtml: `Cost: ${formatNumber(spellCost)} ${resourceIcon('octarine')} per spell`,
      canAfford: context.player.resources.octarine >= spellCost,
      entries: WIZARD_SPELLS,
      difficulty: SPELL_DIFFICULTY,
      countDefenders: (target) => getTotalWizards(state, target),
      launch: (spellType, targetPlanetId, units) =>
        context.commands.performSpell({
          empireId: context.player.id,
          targetEmpireId: Number(empireSelect.value),
          spellType,
          targetPlanetId,
          units,
        }),
    }),
  );

  // Active Missions section
  if (context.player.missions.length > 0) {
    const missionSection = document.createElement('div');
    missionSection.className = 'ops-section';
    const missionTitle = document.createElement('h3');
    missionTitle.textContent = 'Active Missions';
    missionSection.append(missionTitle);

    for (const mission of context.player.missions) {
      const row = document.createElement('div');
      row.className = 'ops-mission';
      const name = mission.kind === 'agent' ? agentOpName(mission.opType) : spellName(mission.opType);
      const targetName = getEmpire(state, mission.targetEmpireId)?.empireName ?? 'Unknown';
      const planet = mission.targetPlanetId === undefined ? undefined : getPlanet(state, mission.targetPlanetId);
      const where = planet ? ` (${planet.planetName})` : '';
      const unitLabel = mission.kind === 'agent' ? 'agent' : 'wizard';
      row.textContent = `${name} → ${targetName}${where} · ${mission.units} ${unitLabel}${mission.units === 1 ? '' : 's'} · ${mission.ticksRemaining} tick${mission.ticksRemaining === 1 ? '' : 's'}`;
      missionSection.append(row);
    }
    panel.append(missionSection);
  }

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
      const typeLabel = debuff.type === 'portal_disabled' ? 'Portal Disabled' : debuff.type === 'reduced_food' ? `Reduced Food (-${Math.round(debuff.value * 100)}%)` : debuff.type;
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
