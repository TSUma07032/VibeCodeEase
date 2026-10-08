import { PersonaId, SituationId, PersonaWeights } from '../../types/personalization';

export const DESIGNER_POLICY = `
【システム基本方針（必須）】
- ユーザーの主導権を尊重すること。
- 必要以上に介入しないこと。
- 正確性を優先すること。
- 安全性を優先すること。
- 明確な根拠のない情報を断定しないこと。
- ユーザーの選択を不当に誘導しないこと。
- ユーザーの嗜好よりも、事実と安全性を常に優先すること。
`;

export interface PersonaDefinition {
  id: PersonaId;
  name: string;
  purpose: string;
  characteristics: string[];
  expectedOutputs: string[];
}

export const PERSONA_DEFINITIONS: Record<PersonaId, PersonaDefinition> = {
  exploration: {
    id: 'exploration',
    name: '探究型 (Persona A)',
    purpose: '自分で考えながら、新しい気づきを得たい。',
    characteristics: [
      '自分で考えることを重視',
      'AIから完成形を一方的に与えられることを好まない',
      '新しい視点・気づきを求める',
      'AIには思考を刺激してほしい',
      '先回りしすぎる支援を避ける'
    ],
    expectedOutputs: [
      '気づき',
      '別の視点',
      '問いかけ',
      '軽い改善提案',
      '必要最小限の指摘'
    ]
  },
  learning: {
    id: 'learning',
    name: '学習型 (Persona B)',
    purpose: '自分で理解し、能力を身につけたい。',
    characteristics: [
      '答えよりも理解を重視',
      'まず自分で考えたい',
      '直接答えを出されることを避けたい',
      '必要なときにはヒントがほしい',
      '間違いそのものを学習機会として捉える'
    ],
    expectedOutputs: [
      'ヒント',
      'エラー原因の説明',
      '段階的な誘導',
      '答えに至るための質問',
      '必要に応じた答え'
    ]
  },
  quality: {
    id: 'quality',
    name: '品質・設計型 (Persona D)',
    purpose: '自分の実装を維持しつつ、全体品質を高めたい。',
    characteristics: [
      '実装そのものはAIに任せてもよい',
      'ただし設計・品質・安全性・保守性を重視する',
      '局所的な修正だけではなく全体構造を見てほしい',
      '自分では気づきにくい問題を発見してほしい'
    ],
    expectedOutputs: [
      '設計上の問題',
      '品質評価',
      '拡張性の指摘',
      'セキュリティ上の問題',
      '保守性の評価',
      '変更による副作用',
      '改善案'
    ]
  }
};

export const SITUATION_WEIGHTS: Record<SituationId, PersonaWeights> = {
  learning: { exploration: 0.3, learning: 0.7, quality: 0.0 },
  ideation: { exploration: 0.8, learning: 0.1, quality: 0.1 },
  design_review: { exploration: 0.2, learning: 0.0, quality: 0.8 },
  implementation: { exploration: 0.1, learning: 0.3, quality: 0.6 },
  debugging: { exploration: 0.2, learning: 0.5, quality: 0.3 },
  deadline_rush: { exploration: 0.0, learning: 0.0, quality: 1.0 }
};

export const SITUATION_LABELS: Record<SituationId, string> = {
  learning: '学習中',
  ideation: 'アイデア発散中',
  design_review: '設計レビュー中',
  implementation: '実装中',
  debugging: 'デバッグ中',
  deadline_rush: '締切直前'
};
