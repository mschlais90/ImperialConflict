import type { ScienceKey } from '../models/types';

export interface ScienceDefinition {
  name: string;
  description: string;
}

export const SCIENCES: Record<ScienceKey, ScienceDefinition> = {
  military: {
    name: 'Military',
    description: 'Increases attack and defense strength.',
  },
  welfare: {
    name: 'Welfare',
    description: 'Increases maximum population.',
  },
  economy: {
    name: 'Economy',
    description: 'Increases income.',
  },
  construction: {
    name: 'Construction',
    description: 'Reduces building costs and build times.',
  },
  resources: {
    name: 'Resources',
    description: 'Increases resource production rates.',
  },
};
