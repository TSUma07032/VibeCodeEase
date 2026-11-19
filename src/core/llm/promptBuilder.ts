/**
 * [Why/Intent] コードレビューおよびAI介入生成用のプロンプト構築およびJSONスキーマ定義。
 * 機密ファイルの送信防止ガード（assertNotSensitiveDocument）を一元的に適用し、
 * Gemini APIが拒絶する additionalProperties / $schema を完全除去したスキーマを提供する。
 * さらに5大ペルソナに応じた「変更箇所の選定基準」「変更理由の解説トーン」「初手のセリフ」および
 * 20〜30文字以内の介入一言フォーマッタを提供する。
 */
import type * as vscode from 'vscode';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { LlmInterventionPlanSchema } from '../../types/llmIntervention';
import type { InterventionDetail, PersonaId } from '../../types/onDemandIntervention';
import type { PresetMode } from '../../types/preset';
import { assertNotSensitiveDocument } from '../utils/sensitiveDocumentGuard';

/**
 * [Why/Intent] 介入一言（タイトル）の最大文字数上限（20〜30字以内の要件に準拠）。
 */
export const MAX_INTERVENTION_TITLE_LENGTH = 30;

/**
 * [Why/Intent] Google Gemini API (v1beta response_schema) は OpenAPI 3.0 サブセット仕様であり、
 * JSON Schema Draft-07 の `additionalProperties` や `$schema` が含まれると HTTP 400 エラーとなるため、
 * 再帰的にこれらの非対応キーを除去して安全なスキーマオブジェクトへ変換する。
 */
export function sanitizeSchemaForGemini(schema: unknown): Record<string, unknown> {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
        return {};
    }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
        if (key === 'additionalProperties' || key === '$schema') {
            continue;
        }
        if (Array.isArray(value)) {
            result[key] = (value as unknown[]).map((item: unknown) =>
                item && typeof item === 'object' && !Array.isArray(item)
                    ? sanitizeSchemaForGemini(item)
                    : item,
            );
        } else if (value && typeof value === 'object') {
            result[key] = sanitizeSchemaForGemini(value);
        } else {
            result[key] = value;
        }
    }
    return result;
}

/**
 * [Why/Intent] Gemini API 等に渡す構造化介入出力の JSON Schema 定義 (Zodスキーマから自動生成・サニタイズ済)
 */
export const INTERVENTION_RESPONSE_SCHEMA: Record<string, unknown> = sanitizeSchemaForGemini(
    zodToJsonSchema(LlmInterventionPlanSchema),
);

/**
 * [Why/Intent] 逆指名（Active Intervention）リクエスト時にGemini APIへ渡す構造化レスポンススキーマ。
 */
export const ACTIVE_INTERVENTION_RESPONSE_SCHEMA: Record<string, unknown> = {
    type: 'object',
    properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        proposedCode: { type: 'string' },
    },
    required: ['title', 'summary', 'proposedCode'],
};

/**
 * [Why/Intent] オンデマンドAIチャット対話時にGemini APIへ渡す構造化レスポンススキーマ。
 */
export const CHAT_RESPONSE_SCHEMA: Record<string, unknown> = {
    type: 'object',
    properties: {
        text: { type: 'string' },
    },
    required: ['text'],
};

/**
 * [Why/Intent] 変更方針修正（Refine Intervention）時にGemini APIへ渡す構造化レスポンススキーマ。
 */
export const REFINE_INTERVENTION_RESPONSE_SCHEMA: Record<string, unknown> = {
    type: 'object',
    properties: {
        proposedCode: { type: 'string' },
        summary: { type: 'string' },
    },
    required: ['proposedCode', 'summary'],
};

/**
 * [Why/Intent] ペルソナ別の変更箇所選定基準（targetFocus）、変更理由の文体（reasonStyle）、
 * および介入開始時の初手セリフ生成ルールを定義する構造体。
 */
export interface PersonaInterventionGuide {
    /** [Why/Intent] どのコード箇所を優先して変更対象に選ぶかの指針 */
    targetFocus: string;
    /** [Why/Intent] 変更理由（reason / summary）をどのキャラクター・観点で記述するかの指針 */
    reasonStyle: string;
    /** [Why/Intent] 変更理由の先頭に付与するペルソナ見出しプレフィックス */
    summaryPrefix: string;
}

/**
 * [Why/Intent] 5大ペルソナごとの「変更箇所の選び方」および「変更理由の書き方」のガイド定義。
 */
export const PERSONA_INTERVENTION_GUIDES: Record<PersonaId, PersonaInterventionGuide> = {
    mentor: {
        targetFocus:
            'Target selection (mentor): Focus on places where beginners commonly struggle, such as deprecated syntax (e.g., `var`), unclear variable/function names, typos, and missing basic error handling.',
        reasonStyle:
            'Reason style (mentor): Explain gently and clearly in Japanese for a beginner. Clarify WHY this change makes the code safer or easier to read, avoiding overly dense jargon.',
        summaryPrefix: '🌱 【やさしい解説】',
    },
    concise: {
        targetFocus:
            'Target selection (concise): Select only the most critical, high-impact fixes (redundant expressions, leftover debug logs, obvious bugs/typos). Keep edits minimal.',
        reasonStyle:
            'Reason style (concise): Conclusion-first in Japanese. Omit greetings and filler. State only the core reason in 1-2 short sentences.',
        summaryPrefix: '⚡ 【要点】',
    },
    architect: {
        targetFocus:
            'Target selection (architect): Prioritize structural and maintainability issues such as Single Responsibility Principle (SRP) violations, tight coupling, magic numbers, inconsistent naming, and poor modularity.',
        reasonStyle:
            'Reason style (architect): Explain the change in Japanese from a software architecture perspective (maintainability, separation of concerns, SOLID principles, and future extensibility).',
        summaryPrefix: '🏗️ 【設計・保守性】',
    },
    qa_security: {
        targetFocus:
            'Target selection (qa_security): Strictly prioritize bug risks, unhandled exceptions (empty catch blocks), null/undefined boundary conditions, type-safety weaknesses, and security risks.',
        reasonStyle:
            'Reason style (qa_security): Explain in Japanese what runtime failure, edge-case bug, or vulnerability could occur without this fix, emphasizing defensive programming.',
        summaryPrefix: '🛡️ 【品質・安全性】',
    },
    tutor: {
        targetFocus:
            'Target selection (tutor): Choose code locations that offer strong learning value around control flow, scope management, error handling, or data transformation.',
        reasonStyle:
            'Reason style (tutor): Use a Socratic, thought-provoking tone in Japanese. Include a guiding question or hint that helps the developer understand the underlying concept while showing the concrete improvement.',
        summaryPrefix: '💡 【ヒント・思考促進】',
    },
};

/**
 * [Why/Intent] 介入一言（タイトル）を20〜30文字以内（最大30文字）の簡潔な日本語フレーズに整形する。
 * カテゴリタグ（`[SYNTAX_TYPO]`等）、絵文字、Markdown記号を除去し、長すぎる場合は30文字以内に丸める。
 */
export function formatInterventionOneLiner(rawText: string): string {
    const cleaned = rawText
        .replace(/^\[[A-Z_]+\]\s*/g, '')
        .replace(/^\$\([a-z-]+\)\s*/gi, '')
        .replace(/^(?:🤖|🌲|💡|🌱|⚡|🏗️|🛡️)+\s*/gu, '')
        .replace(/^【[^】]+】\s*/g, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(
            /^(AI\s*提案|Did you mean|命名規則|デバッグ用コード|空の\s*catch\s*ブロック)\s*[:：]?\s*/i,
            '',
        )
        .split(/\r?\n/)[0]
        .trim();

    if (!cleaned) {
        return 'コード改善の提案';
    }

    // 句点「。」で区切られている場合は最初の文を優先し、30文字以内に収める
    const firstSentence = cleaned.split(/(?<=。)/)[0]?.trim() ?? cleaned;
    const candidate =
        firstSentence.length <= MAX_INTERVENTION_TITLE_LENGTH ? firstSentence : cleaned;

    if (candidate.length <= MAX_INTERVENTION_TITLE_LENGTH) {
        return candidate;
    }
    return `${candidate.slice(0, MAX_INTERVENTION_TITLE_LENGTH - 1)}…`;
}

const PERSONA_SUMMARY_FORMATTERS: Record<PersonaId, (prefix: string, cleaned: string) => string> = {
    mentor: (prefix, cleaned) =>
        `${prefix} ${cleaned}\n基礎を固めて読みやすく安全なコードにするためのおすすめ改善です。`,
    concise: (prefix, cleaned) => {
        const firstLine = cleaned.split(/\r?\n/).filter(Boolean).slice(0, 2).join(' ');
        return `${prefix} ${firstLine}`;
    },
    architect: (prefix, cleaned) =>
        `${prefix} ${cleaned}\n保守性と責務の明確化（クリーンな構造維持）の観点から修正を推奨します。`,
    qa_security: (prefix, cleaned) =>
        `${prefix} ${cleaned}\n予期せぬ実行時エラーや品質リスクを未然に防ぐための防御的修正です。`,
    tutor: (prefix, cleaned) =>
        `${prefix} ${cleaned}\nなぜ元の書き方だと問題が起きやすいか、変更後のコードと比較して考えてみましょう。`,
};

/**
 * [Why/Intent] 変更理由（summary）を選択中のペルソナの口調・観点に合わせて整形する。
 */
export function formatPersonaSummary(personaId: PersonaId, rawSummary: string): string {
    const guide = PERSONA_INTERVENTION_GUIDES[personaId] ?? PERSONA_INTERVENTION_GUIDES.mentor;
    const cleaned = rawSummary
        .replace(/^\$\([a-z-]+\)\s*/gi, '')
        .replace(/^🤖\s*\*\*AI\s*提案\*\*:\s*/u, '')
        .replace(/^🌲\s*/u, '')
        .trim();

    if (!cleaned) {
        return `${guide.summaryPrefix} コードの品質と可読性を高めるための改善案です。`;
    }

    if (/^(?:🌱|⚡|🏗️|🛡️|💡)/u.test(cleaned)) {
        return cleaned;
    }

    const formatter = PERSONA_SUMMARY_FORMATTERS[personaId] ?? PERSONA_SUMMARY_FORMATTERS.mentor;
    return formatter(guide.summaryPrefix, cleaned);
}

/**
 * [Why/Intent] 介入開始時の「初手のセリフ」（AIチャットの初期メッセージ）を選択中のペルソナに合わせて生成する。
 */
export function getPersonaOpeningMessage(personaId: PersonaId, title?: string): string {
    const shortTitle = formatInterventionOneLiner(title ?? 'この箇所');
    switch (personaId) {
        case 'mentor':
            return `🌱 こんにちは！やさしい解説メンターです。「${shortTitle}」について、より分かりやすく安全な書き方を提案しました。なぜこう直すと良いのか、気になる点があれば何でも聞いてくださいね！`;
        case 'concise':
            return `⚡ 「${shortTitle}」の最短修正案です。差分と要点を確認し、疑問点があれば端的にどうぞ。`;
        case 'architect':
            return `🏗️ 設計・保守性レビューの観点から「${shortTitle}」を提案しました。責務の分離や将来の拡張性について議論したい点があればお知らせください。`;
        case 'qa_security':
            return `🛡️ バグ・安全性チェックの観点から「${shortTitle}」を検出しました。境界値や例外発生時の挙動について確認したい点はありますか？`;
        case 'tutor':
            return `💡 ヒントで自力解決サポートです！「${shortTitle}」について、元のコードのままだとどんな場面で困りそうか、一緒に考えてみませんか？`;
    }
}

/**
 * [Why/Intent] プリセットモードに応じたレビュー指示文を解決するヘルパー（複雑度抑制）。
 * コメントアウトやTODOコメントのみの修正は全モードで厳格に禁止する。
 */
function resolveModeInstruction(presetMode?: PresetMode): string {
    if (presetMode === 'HINT') {
        return 'Analyze the file below and guide the user with educational hints in the `reason` field, while providing concrete, executable improved code in `newText`. Never output comment-only edits or comment out existing code.';
    }
    if (presetMode === 'ARCHITECTURE') {
        return 'Analyze the file below and heavily focus on refactoring for better architecture, separation of concerns, scalability, and design patterns. Propose robust architectural improvements.';
    }
    if (presetMode === 'BUG_TYPO') {
        return 'Analyze the file below and strictly focus on fixing typos, null exceptions, vulnerabilities, and simple bugs. Leave the overall logic and architecture completely untouched.';
    }
    return 'Analyze the file below and propose concrete, minimal edits that improve correctness, readability, or remove obvious friction.';
}

export interface BuildInterventionPromptOptions {
    presetMode?: PresetMode;
    personaId?: PersonaId;
}

/**
 * [Why/Intent] コードレビュー・介入生成用のプロンプト文字列を構築する。
 * 機密ファイルは共通ガード（assertNotSensitiveDocument）により確実に弾き、
 * ペルソナ別の変更箇所選定・変更理由スタイル、コメントのみ修正の禁止、重複箇所推薦の禁止、
 * 20〜30文字以内の介入一言ルールを注入する。
 */
export function buildInterventionPrompt(
    document: vscode.TextDocument,
    preferenceSummary?: string,
    presetOrOptions?: PresetMode | BuildInterventionPromptOptions,
): string {
    // 共通機密ファイルガードを適用
    assertNotSensitiveDocument(document);

    const presetMode =
        typeof presetOrOptions === 'string' ? presetOrOptions : presetOrOptions?.presetMode;
    const personaId =
        typeof presetOrOptions === 'object' && presetOrOptions?.personaId
            ? presetOrOptions.personaId
            : 'mentor';

    const rawCode = document.getText();
    const sanitizedCode = rawCode.replace(/```/g, '\\`\\`\\`');
    const modeInstruction = resolveModeInstruction(presetMode);
    const personaGuide =
        PERSONA_INTERVENTION_GUIDES[personaId] ?? PERSONA_INTERVENTION_GUIDES.mentor;
    const personaPrompt = PERSONA_PROMPTS[personaId] ?? PERSONA_PROMPTS.mentor;

    return [
        'You are a code review assistant.',
        modeInstruction,
        personaPrompt,
        personaGuide.targetFocus,
        personaGuide.reasonStyle,
        'STRICT RULES:',
        '1. PROHIBIT COMMENT-ONLY EDITS: `newText` MUST be executable code changes (or empty string when removing leftover debug code). NEVER propose edits that only add `// TODO` or `/* ... */` comments, and NEVER fix code merely by commenting it out.',
        '2. NO DUPLICATE OR OVERLAPPING LOCATIONS: Do NOT propose multiple edits for the same line or overlapping line ranges. Consolidate changes per distinct code location.',
        '3. ONE-LINE SUMMARY LENGTH: The first line of `reason` MUST be a concise Japanese one-line summary within 20 to 30 characters (20〜30字以内), followed by a newline and the detailed explanation matching the active persona.',
        'All line and character positions must be zero-based and must point inside the supplied file. Use the exact line text and never invent a position beyond the line length.',
        'For every edit, oldText must be copied exactly from the target text. It may span multiple lines. The extension will locate oldText in the real file before applying it.',
        preferenceSummary
            ? 'Apply the following user preferences for your explanation style:\n' +
              preferenceSummary
            : '',
        'For the `reason` field, write in Japanese following the active persona style above. You may use markdown like backticks for code.',
        'Return JSON only. Do not wrap it in markdown fences.',
        `JSON schema: ${JSON.stringify(INTERVENTION_RESPONSE_SCHEMA)}`,
        `File: ${document.fileName}`,
        `Language: ${document.languageId}`,
        'Content:',
        '```',
        sanitizedCode,
        '```',
    ].join('\n');
}

/**
 * [Why/Intent] オンデマンド対話で指定可能な5大ペルソナ（mentor, concise, architect, qa_security, tutor）ごとの
 * キャラクター・振る舞い・制約を定義したシステムプロンプト定義。
 */
export const PERSONA_PROMPTS: Record<PersonaId, string> = {
    mentor: `【ペルソナ: 初心者向けメンター】
あなたは親切で教育熱心なシニアメンターです。
- 初心者にも直感的にわかる平易な言葉で説明してください。
- 専門用語を使う際は簡単な補足を添えてください。
- なぜこの修正を行うと良いのか、背景となる理由（可読性、安全性の向上など）を優しく解説してください。`,

    concise: `【ペルソナ: シニア・コードオンリー】
あなたは無駄を極限まで削ぎ落とすミニマリストエンジニアです。
- 挨拶や定型句は一切不要です。
- 説明は最小限（最大2行以内）とし、コード差分と変更理由の本質のみを端的に伝えてください。
- 結論ファーストで即座にコードを提示してください。`,

    architect: `【ペルソナ: 設計・アーキテクト】
あなたはソフトウェアアーキテクチャの専門家です。
- 単一責任原則（SRP）や開放閉鎖原則（OCP）などのSOLID原則、関心の分離の観点から助言してください。
- 将来の仕様変更に対する保守性・拡張性・結合度の観点を提示してください。
- より美しい設計パターンの適用案を論理的に解説してください。`,

    qa_security: `【ペルソナ: デバッグ・品質特化】
あなたはQAおよびセキュリティのスペシャリストです。
- 境界値（空文字、0、null/undefined、配列境界外）の挙動に厳しく着目してください。
- 型安全性、例外処理の欠落、リソースリーク、セキュリティ脆弱性のリスクを最優先で指摘してください。
- 防御的プログラミングの観点から堅牢なコードを提示してください。`,

    tutor: `【ペルソナ: 思考促進チューター】
あなたはソクラテスメソッドを用いる対話型チューターです。
- すぐに完成形の答えを与えてはいけません。
- ユーザーに問いかけを行い、どの部分に改善の余地があるかを自発的に気づかせるヒントを提示してください。
- ユーザーの理解度を確認しながら段階的に正解へと導いてください。`,
};

/**
 * [Why/Intent] ペルソナ固有指示、対象提案コード、およびユーザー発言を結合した
 * LLMチャット対話用プロンプトを構築するビルダークラス。
 */
export const PromptBuilder = {
    /**
     * [Why/Intent] 選択中のペルソナシステムプロンプト、変更前後のコード、提案メタデータ、
     * およびユーザーの入力テキストを統合したLLM問い合わせプロンプトを生成する。
     */
    buildChatPrompt(personaId: PersonaId, detail: InterventionDetail, userMessage: string): string {
        const personaPrompt = PERSONA_PROMPTS[personaId] ?? PERSONA_PROMPTS.concise;
        return [
            personaPrompt,
            '対象の提案:',
            `タイトル: ${detail.title}`,
            `サマリー: ${detail.summary}`,
            `元のコード:\n${detail.originalCode}`,
            `提案コード:\n${detail.proposedCode}`,
            `ユーザーの質問・指示: ${userMessage}`,
            '回答は日本語で作成し、JSON形式 {"text": "あなたの返答内容"} で出力してください。',
        ].join('\n');
    },

    /**
     * [Why/Intent] ユーザーからの修正方針指示（「こういう方向で変えて？」）を反映し、
     * 提案コードおよび変更理由を再推敲するためのプロンプトを生成する。
     */
    buildRefinePrompt(
        personaId: PersonaId,
        detail: InterventionDetail,
        userInstruction: string,
    ): string {
        const personaPrompt = PERSONA_PROMPTS[personaId] ?? PERSONA_PROMPTS.concise;
        return [
            personaPrompt,
            '対象の提案をユーザーの指示に基づいて修正・再推敲してください。',
            'コメントアウトのみの修正やTODOコメント追加のみの提案は禁止です。必ず実行可能なコードとして記述してください。',
            `タイトル: ${detail.title}`,
            `変更前のコード:\n${detail.originalCode}`,
            `現在の提案コード:\n${detail.proposedCode}`,
            `現在の変更理由: ${detail.summary}`,
            `ユーザーからの修正指示: ${userInstruction}`,
            '必ず以下のJSONフォーマットのみで出力してください（Markdownのコードフェンス等で囲まないでください）：',
            '{"proposedCode": "修正後の完全なコード文字列", "summary": "修正された変更理由（日本語）"}',
        ].join('\n');
    },
};
