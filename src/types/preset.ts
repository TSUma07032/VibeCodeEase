import { PainCategory } from './painCategory';
import { UserPreferenceProfile } from './userPreference';

export type PresetMode = 'LEARNING' | 'FLOW' | 'ZEN' | 'CUSTOM';

export interface PresetDefinition {
  id: PresetMode;
  name: string;
  description: string;
  icon: string;
  preferences: Record<PainCategory, number>;
}

export const PRESET_DEFINITIONS: Record<Exclude<PresetMode, 'CUSTOM'>, PresetDefinition> = {
  LEARNING: {
    id: 'LEARNING',
    name: '学習モード (Learning)',
    description: 'タイポは手軽に直しつつ、構文やロジックはあえて解説ヒントを提示。コード理解を最優先。',
    icon: '$(mortar-board)',
    preferences: {
      SYNTAX_TYPO: 0.8,
      INDENTATION_FORMATTING: 0.7,
      VAR_FUNC_MANAGEMENT: 0.3,
      SYNTAX_ERROR_HANDLING: 0.4
    }
  },
  FLOW: {
    id: 'FLOW',
    name: 'フローモード (Flow)',
    description: '面倒なタイポ・整形・構文修正を自動化。思考の流れとバイブスを最優先。',
    icon: '$(zap)',
    preferences: {
      SYNTAX_TYPO: 1.0,
      INDENTATION_FORMATTING: 1.0,
      VAR_FUNC_MANAGEMENT: 0.8,
      SYNTAX_ERROR_HANDLING: 0.85
    }
  },
  ZEN: {
    id: 'ZEN',
    name: '職人モード (Zen)',
    description: 'AIの介入を最小限に。自分の手でじっくりコードを紡ぎたい時に。',
    icon: '$(eye-closed)',
    preferences: {
      SYNTAX_TYPO: 0.2,
      INDENTATION_FORMATTING: 0.2,
      VAR_FUNC_MANAGEMENT: 0.1,
      SYNTAX_ERROR_HANDLING: 0.2
    }
  }
};

export const DEFAULT_PRESET_MODE: PresetMode = 'LEARNING';

export const DEFAULT_USER_PREFERENCES: UserPreferenceProfile = {
  preferences: { ...PRESET_DEFINITIONS.LEARNING.preferences }
};
