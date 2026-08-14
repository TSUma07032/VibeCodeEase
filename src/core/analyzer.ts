import { AnalysisResult, InterventionLevel, PAIN_CATEGORIES, ProposedIntervention } from '../types';

export class CodeAnalyzer {
  /**
   * 入力されたコードテキストを解析し、タイポや構文エラーなどの問題を検出する
   * @param text 解析対象のコード文字列全体
   * @returns 検出された問題のリスト (AnalysisResult[])
   */
  public analyze(text: string): AnalysisResult[] {
    const results: AnalysisResult[] = [];
    const lines = text.split(/\r?\n/);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const lineText = lines[lineIndex];

      // 1. 'functon' タイポの検出
      let functonMatch: RegExpExecArray | null;
      const functonRegex = /functon/g;
      while ((functonMatch = functonRegex.exec(lineText)) !== null) {
        const interventions: ProposedIntervention[] = [
          {
            originalText: 'functon',
            replacementText: 'function',
            message: '$(lightbulb) **Did you mean:** `function`?'
          }
        ];

        results.push({
          category: 'SYNTAX_TYPO',
          level: 'SUGGESTION', // 初期値としてSUGGESTIONとする（将来的に判定エンジンで書き換わる可能性あり）
          range: {
            start: { line: lineIndex, character: functonMatch.index },
            end: { line: lineIndex, character: functonMatch.index + 'functon'.length }
          },
          interventions
        });
      }

      // 2. 'if condtion:' タイポの検出
      let conditionMatch: RegExpExecArray | null;
      const conditionRegex = /if condtion:/g;
      while ((conditionMatch = conditionRegex.exec(lineText)) !== null) {
        const interventions: ProposedIntervention[] = [
          {
            originalText: 'if condtion:',
            replacementText: 'if condition:',
            message: '$(lightbulb) **Did you mean:** `if condition:`?'
          }
        ];

        results.push({
          category: 'SYNTAX_TYPO',
          level: 'SUGGESTION',
          range: {
            start: { line: lineIndex, character: conditionMatch.index },
            end: { line: lineIndex, character: conditionMatch.index + 'if condtion:'.length }
          },
          interventions
        });
      }
    }

    return results;
  }
}
