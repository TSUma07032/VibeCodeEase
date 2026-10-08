import { PainCategory } from './painCategory';
import { UserPreferenceProfile } from './userPreference';

export type PresetMode = 'HINT' | 'ARCHITECTURE' | 'BUG_TYPO' | 'CUSTOM';

export const PRESET_MODES: readonly PresetMode[] = ['HINT', 'ARCHITECTURE', 'BUG_TYPO', 'CUSTOM'] as const;

export interface PresetDefinition {
  id: PresetMode;
  name: string;
  description: string;
  icon: string;
  preferences: Record<PainCategory, number>;
}

export const PRESET_DEFINITIONS: Record<Exclude<PresetMode, 'CUSTOM'>, PresetDefinition> = {
  HINT: {
    id: 'HINT',
    name: 'ヒントモード (Hint)',
    description: 'AI avoids writing exact solution code, suggests comments/hint texts for fixing/improving.',
    icon: '$(lightbulb)',
    preferences: {
      SYNTAX_TYPO: 0.3,
      INDENTATION_FORMATTING: 0.3,
      VAR_FUNC_MANAGEMENT: 0.3,
      SYNTAX_ERROR_HANDLING: 0.4
    }
  },
  ARCHITECTURE: {
    id: 'ARCHITECTURE',
    name: 'アーキテクチャモード (Architecture)',
    description: 'Heavily focuses on refactoring, architecture, separation of concerns, scalability, and design patterns.',
    icon: '$(versions)',
    preferences: {
      SYNTAX_TYPO: 0.5,
      INDENTATION_FORMATTING: 0.8,
      VAR_FUNC_MANAGEMENT: 1.0,
      SYNTAX_ERROR_HANDLING: 0.6
    }
  },
  BUG_TYPO: {
    id: 'BUG_TYPO',
    name: 'バグ・タイポ修正 (Bug/Typo)',
    description: 'Focuses strictly on fixing typos, null exceptions, vulnerabilities, and simple bugs while leaving overall logic untouched.',
    icon: '$(bug)',
    preferences: {
      SYNTAX_TYPO: 1.0,
      INDENTATION_FORMATTING: 0.8,
      VAR_FUNC_MANAGEMENT: 0.1,
      SYNTAX_ERROR_HANDLING: 1.0
    }
  }
};

export const DEFAULT_PRESET_MODE: PresetMode = 'HINT';

export const DEFAULT_USER_PREFERENCES: UserPreferenceProfile = {
  preferences: { ...PRESET_DEFINITIONS.HINT.preferences }
};
