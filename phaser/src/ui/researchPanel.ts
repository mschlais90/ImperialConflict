import { SCIENCES } from '../core/data/sciences';
import type { ScienceKey } from '../core/models/types';
import { calcSciencePercent, getPlanetsForEmpire } from '../core/selectors/selectors';
import { button, formatNumber, numberInput, parseIntegerInput } from './dom';
import type { UiContext } from './types';

const SCIENCE_KEYS: ScienceKey[] = ['military', 'welfare', 'economy', 'construction', 'resources'];

export function renderResearchPanel(context: UiContext): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'side-panel interactive';
  const title = document.createElement('h2');
  title.textContent = 'Research';
  panel.append(title, renderResearchContent(context));
  return panel;
}

export function renderResearchContent(context: UiContext): HTMLElement {
  const state = context.controller.state;
  if (!state) {
    throw new Error('Research panel requires game state.');
  }

  const frag = document.createElement('div');

  // RP generation info
  const planets = getPlanetsForEmpire(state, context.player.id);
  const totalRc = planets.reduce((sum, p) => sum + (p.buildings.research_center ?? 0), 0);
  const rpPerTick = totalRc * 20;

  const rpInfo = document.createElement('div');
  rpInfo.className = 'research-info';
  rpInfo.textContent = `Research Centers: ${totalRc} | RP/tick: ${formatNumber(rpPerTick)}`;
  frag.append(rpInfo);

  const inputs = new Map<ScienceKey, HTMLInputElement>();
  const rpPreviews = new Map<ScienceKey, HTMLSpanElement>();
  const total = document.createElement('div');
  total.className = 'form-note';

  const updateTotal = (): void => {
    const parsed = parseAllocation(inputs);
    if (!parsed.ok) {
      total.textContent = 'Total allocation: invalid';
      total.classList.add('error-text');
      total.classList.remove('tick-positive');
      return;
    }
    const sum = SCIENCE_KEYS.reduce((value, key) => value + parsed.allocation[key], 0);
    total.textContent = `Total allocation: ${sum}%`;
    total.classList.toggle('error-text', sum !== 100);
    total.classList.toggle('tick-positive', sum === 100);

    // Update live RP previews
    for (const science of SCIENCE_KEYS) {
      const preview = rpPreviews.get(science);
      if (!preview) continue;
      const inputVal = parsed.allocation[science];
      const currentAlloc = context.player.researchAllocation[science] ?? 0;
      const projected = Math.trunc(rpPerTick * inputVal / 100);
      if (inputVal !== currentAlloc) {
        const current = Math.trunc(rpPerTick * currentAlloc / 100);
        const diff = projected - current;
        const sign = diff >= 0 ? '+' : '';
        preview.textContent = ` \u2192 ${formatNumber(projected)}/tick (${sign}${formatNumber(diff)})`;
        preview.className = diff >= 0 ? 'research-rp-preview tick-positive' : 'research-rp-preview tick-negative';
      } else {
        preview.textContent = '';
        preview.className = 'research-rp-preview';
      }
    }
  };

  for (const science of SCIENCE_KEYS) {
    const sciDef = SCIENCES[science];
    const currentPct = calcSciencePercent(state, context.player, science);
    const totalRp = context.player.researchPoints[science] ?? 0;
    const allocPct = context.player.researchAllocation[science] ?? 0;
    const rpForScience = Math.trunc(rpPerTick * allocPct / 100);

    // Science header: name + current %
    const header = document.createElement('div');
    header.className = 'research-header';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'research-name';
    nameSpan.textContent = sciDef.name;
    const pctSpan = document.createElement('span');
    pctSpan.className = 'research-pct';
    pctSpan.textContent = `${currentPct.toFixed(1)}%`;
    header.append(nameSpan, pctSpan);
    frag.append(header);

    // Description
    const desc = document.createElement('div');
    desc.className = 'research-desc';
    desc.textContent = sciDef.description;
    frag.append(desc);

    // RP info with live preview
    const rpLine = document.createElement('div');
    rpLine.className = 'research-rp';
    const rpText = document.createTextNode(`Total RP: ${formatNumber(totalRp)} | +${formatNumber(rpForScience)}/tick`);
    const rpPreview = document.createElement('span');
    rpPreview.className = 'research-rp-preview';
    rpPreviews.set(science, rpPreview);
    rpLine.append(rpText, rpPreview);
    frag.append(rpLine);

    // Allocation input
    const row = document.createElement('label');
    row.className = 'form-row';
    row.append(document.createTextNode('Allocation'));
    const input = numberInput(context.player.researchAllocation[science], { min: 0, max: 100 });
    input.addEventListener('input', updateTotal);
    inputs.set(science, input);
    row.append(input);
    frag.append(row);
  }

  const apply = button('Apply research', () => {
    const parsed = parseAllocation(inputs);
    if (!parsed.ok) {
      context.setNotice(parsed.message, true);
      return;
    }
    const allocation = parsed.allocation;
    const sum = SCIENCE_KEYS.reduce((value, key) => value + allocation[key], 0);
    if (sum !== 100) {
      context.setNotice('Research allocation must total 100.', true);
      return;
    }
    context.runCommand(() => context.commands.setResearchAllocation({ empireId: context.player.id, allocation }));
  });

  frag.append(total, apply);
  updateTotal();
  return frag;
}

function parseAllocation(
  inputs: Map<ScienceKey, HTMLInputElement>,
): { ok: true; allocation: Record<ScienceKey, number> } | { ok: false; message: string } {
  const allocation = {} as Record<ScienceKey, number>;
  for (const science of SCIENCE_KEYS) {
    const parsed = parseIntegerInput(inputs.get(science)?.value ?? '', {
      label: `${SCIENCES[science].name} allocation`,
      min: 0,
      max: 100,
    });
    if (!parsed.ok) {
      return parsed;
    }
    allocation[science] = parsed.value;
  }
  return { ok: true, allocation };
}
