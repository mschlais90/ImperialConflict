import type { ResourceKey } from '../core/models/types';

/** Inline SVG icons for each resource, designed to be legible at 14px. */
const RESOURCE_SVGS: Record<ResourceKey, string> = {
  gc: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14"><ellipse cx="5" cy="9" rx="4" ry="3.5" fill="#c8920a" stroke="#a07008" stroke-width="0.5"/><ellipse cx="5" cy="8.2" rx="3" ry="2.2" fill="#f0c840" opacity="0.4"/><ellipse cx="9" cy="7" rx="4" ry="3.5" fill="#d4a017" stroke="#a07008" stroke-width="0.5"/><ellipse cx="9" cy="6.2" rx="3" ry="2.2" fill="#f5d860" opacity="0.5"/></svg>`,
  food: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14"><path d="M7 2c0.5 0 1 2 1 4s-0.5 3-1 3-1-1-1-3 0.5-4 1-4z" fill="#c8a23a"/><path d="M5 3c0.4-0.3 1.2 1.5 1 3.5s-0.8 2.8-1.2 2.5-0.4-1.6-0.2-3.5S4.6 3.3 5 3z" fill="#d4b044"/><path d="M9 3c-0.4-0.3-1.2 1.5-1 3.5s0.8 2.8 1.2 2.5 0.4-1.6 0.2-3.5S9.4 3.3 9 3z" fill="#d4b044"/><rect x="6.5" y="8" width="1" height="4" rx="0.5" fill="#8b6914"/></svg>`,
  iron: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14"><polygon points="2,11 4,6 10,6 12,11" fill="#8a939e"/><polygon points="4,6 10,6 11,4 3,4" fill="#b0bcc8"/><polygon points="4,6 10,6 10,7 4,7" fill="#6b7580" opacity="0.5"/></svg>`,
  endurium: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14"><rect x="3" y="3" width="8" height="8" rx="1" fill="#2ea06a" opacity="0.7"/><rect x="4" y="4" width="6" height="6" rx="0.5" fill="#5edba0" opacity="0.35"/><rect x="5" y="4.5" width="4" height="2.5" rx="0.5" fill="#a0f0cc" opacity="0.45"/><rect x="3" y="3" width="8" height="8" rx="1" fill="none" stroke="#1a7a4a" stroke-width="0.6"/></svg>`,
  octarine: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14"><path d="M5.5 2h3l0.5 1v3l1.5 2.5v1.5c0 1-1 2-3.5 2s-3.5-1-3.5-2V8.5L5 6V3z" fill="#d946a8"/><path d="M5.5 2h3l0.5 1v1h-4V3z" fill="#f0a0d4" opacity="0.7"/><ellipse cx="7" cy="9" rx="2.5" ry="1" fill="#f472b6" opacity="0.5"/></svg>`,
};

const RESOURCE_NAMES: Record<ResourceKey, string> = {
  gc: 'Credits',
  food: 'Food',
  iron: 'Iron',
  endurium: 'Endurium',
  octarine: 'Octarine',
};

/** Returns an inline icon HTML span with tooltip and aria-label. */
export function resourceIcon(key: ResourceKey): string {
  return `<span class="res-icon res-icon-${key}" aria-label="${RESOURCE_NAMES[key]}" title="${RESOURCE_NAMES[key]}" role="img">${RESOURCE_SVGS[key]}</span>`;
}

/** Returns the human-readable resource name (for long-form contexts like tutorial). */
export function resourceName(key: ResourceKey): string {
  return RESOURCE_NAMES[key];
}
