/**
 * [Why/Intent] LLMに対する完成形予想および4段階の教育的ヒント生成プロンプトと構造化出力スキーマを構築する。
 */
import type { ShadowPredictionPromptInput } from '../../types/learningScaffolding';

/** [Why/Intent] Gemini API Structured Outputs (JSON Schema) 用のスキーマ定義 */
export const SHADOW_PREDICTION_SCHEMA = {
    type: 'object',
    properties: {
        milestones: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    weight: { type: 'number' },
                    status: { type: 'string', enum: ['COMPLETED', 'IN_PROGRESS', 'NOT_STARTED'] },
                    isLearningGoalCore: { type: 'boolean' },
                },
                required: ['id', 'title', 'weight', 'status', 'isLearningGoalCore'],
            },
        },
        predictedCompleteCode: { type: 'string' },
        unresolvedKeyTasks: { type: 'array', items: { type: 'string' } },
        stagnationReasonHint: { type: 'string' },
        scaffoldingLevels: {
            type: 'object',
            properties: {
                level1Perspective: { type: 'string' },
                level2Concept: { type: 'string' },
                level3SkeletonCode: { type: 'string' },
                level4CompleteDiff: { type: 'string' },
            },
            required: [
                'level1Perspective',
                'level2Concept',
                'level3SkeletonCode',
                'level4CompleteDiff',
            ],
        },
    },
    required: [
        'milestones',
        'predictedCompleteCode',
        'unresolvedKeyTasks',
        'stagnationReasonHint',
        'scaffoldingLevels',
    ],
};

/**
 * [Why/Intent] ユーザーの課題・学習目標と現在コード・Diagnosticsから、完成予想図と段階的ヒントを構造化出力させるプロンプトを構築する。
 */
export function buildShadowPredictionPrompt(input: ShadowPredictionPromptInput): {
    systemInstruction: string;
    userPrompt: string;
} {
    const systemInstruction = `あなたはプログラミング学習支援AIです。
学習者の書いている途中のコードを分析し、学習目標を達成した理想的な完成形コードを予想してください。
また、学習者が行き詰まった際に提供する4段階の教育的ヒント（足場かけ: Scaffolding）を生成してください。
【ヒント生成ルール】:
- level1Perspective (観点): 答えを書かず、学習者に気付きを与えるSocraticな問いかけ（1〜2文）。
- level2Concept (概念): 課題に関わるプログラミング概念や仕様の明快な解説（2〜3文）。
- level3SkeletonCode (骨組み): 変更箇所のコード骨組みやTODOコメント（穴埋め形式）。
- level4CompleteDiff (解答): 現在コードと完成形コードの完全な差分テキスト。
【マイルストーン評価ルール】:
- 課題を3〜5個の主要サブタスク（Milestones）に分解し、現在のコードでの達成度（COMPLETED / IN_PROGRESS / NOT_STARTED）を判定してください。
- 学習目標に直結する核心タスクには isLearningGoalCore: true を付与し、高配分（30〜40%）を割り当ててください。
必ず指定されたJSON Schemaに従って出力してください。`;

    let diagText = 'なし (エラー0件)';
    if (input.diagnostics.length > 0) {
        diagText = input.diagnostics
            .map((d) => `Line ${d.line}: [${d.severity}] ${d.message}`)
            .join('\n');
    }

    const safeCode = input.currentCode.replace(/```/g, '\\`\\`\\`');
    const userPrompt = `### 課題 (何を作るか):
${input.taskDescription}

### 学習目標 (何を理解したいか):
${input.learningGoal}

### 現在のエディタコード:
\`\`\`
${safeCode}
\`\`\`

### 現在のエラー・警告 (Diagnostics):
${diagText}`;

    return { systemInstruction, userPrompt };
}
