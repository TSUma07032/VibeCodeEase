/**
 * [Why/Intent] コードレビューおよびAI介入生成用のプロンプト構築およびJSONスキーマ定義。
 * 機密ファイルの送信防止ガード（assertNotSensitiveDocument）を一元的に適用する。
 */
import type * as vscode from 'vscode';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { LlmInterventionPlanSchema } from '../../types/llmIntervention';
import type { InterventionDetail, PersonaId } from '../../types/onDemandIntervention';
import type { PresetMode } from '../../types/preset';
import { assertNotSensitiveDocument } from '../utils/sensitiveDocumentGuard';

/**
 * [Why/Intent] Gemini API 等に渡す構造化介入出力の JSON Schema 定義 (Zodスキーマから自動生成)
 */
export const INTERVENTION_RESPONSE_SCHEMA = zodToJsonSchema(LlmInterventionPlanSchema);

/**
 * [Why/Intent] プリセットモードに応じたレビュー指示文を解決するヘルパー（複雑度抑制）
 */
function resolveModeInstruction(presetMode?: PresetMode): string {
    if (presetMode === 'HINT') {
        return 'Analyze the file below and avoid writing the exact solution code. Instead, insert comments or hint texts suggesting how the user can fix/improve the code. Do not write the final implementation.';
    }
    if (presetMode === 'ARCHITECTURE') {
        return 'Analyze the file below and heavily focus on refactoring for better architecture, separation of concerns, scalability, and design patterns. Propose robust architectural improvements.';
    }
    if (presetMode === 'BUG_TYPO') {
        return 'Analyze the file below and strictly focus on fixing typos, null exceptions, vulnerabilities, and simple bugs. Leave the overall logic and architecture completely untouched.';
    }
    return 'Analyze the file below and propose ALL concrete, minimal edits that improve correctness, readability, or remove obvious friction. Please propose MULTIPLE edits across the file if applicable.';
}

/**
 * [Why/Intent] コードレビュー・介入生成用のプロンプト文字列を構築する。
 * 機密ファイルは共通ガード（assertNotSensitiveDocument）により確実に弾く。
 */
export function buildInterventionPrompt(
    document: vscode.TextDocument,
    preferenceSummary?: string,
    presetMode?: PresetMode,
): string {
    // 共通機密ファイルガードを適用
    assertNotSensitiveDocument(document);

    const rawCode = document.getText();
    const sanitizedCode = rawCode.replace(/```/g, '\\`\\`\\`');
    const modeInstruction = resolveModeInstruction(presetMode);

    return [
        'You are a code review assistant.',
        modeInstruction,
        'All line and character positions must be zero-based and must point inside the supplied file. Use the exact line text and never invent a position beyond the line length.',
        'For every edit, oldText must be copied exactly from the target text. It may span multiple lines. The extension will locate oldText in the real file before applying it.',
        preferenceSummary
            ? 'Apply the following user preferences for your explanation style:\n' +
              preferenceSummary
            : '',
        'For the `reason` field, explain the intervention in Japanese, assuming the reader is a university student who has studied Computer Science. Provide a polite and technically sound explanation. You may use markdown like backticks for code.',
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
        ].join('\n');
    },
};
