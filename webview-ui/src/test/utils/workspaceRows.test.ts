/**
 * [Why/Intent] buildWorkspaceDisplayRows の単体テストスイート。
 * 1) 古い介入（applied / dismissed / reverted）がコード行右側に一切出ないこと
 * 2) 新しい介入（pending）が赤の削除行（diffKind: 'deletion', diffSign: '-'）と
 *    緑の追加行（diffKind: 'addition', diffSign: '+'）として生成され、最初の変更行右端にボタンが付与されること
 * 3) 複数行置換・部分変更（未変更行を含むハンク）でも変更行のみ赤 `-` / 緑 `+` で表示されることを検証する。
 */
import { describe, expect, it } from 'vitest';
import {
    buildWorkspaceDisplayRows,
    type IndexedIntervention,
} from '../../utils/workspaceRows';

describe('workspaceRows utils', () => {
    const doc = [
        'export function calc(items) {',
        '  const total = sum(items);',
        '  const raw = getInput();',
        '  const data = JSON.parse(raw);',
        '  return format(total, data);',
        '}',
    ].join('\n');

    it('古い介入は通常行のまま、新しい介入だけ赤の削除行(-)と緑の追加行(+)として生成され先頭変更行にボタンが付与されること', () => {
        const interventions: IndexedIntervention[] = [
            {
                indexNumber: 1,
                item: {
                    id: 'int-1',
                    title: '古い採用済提案',
                    summary: '適用済み',
                    range: {
                        start: { line: 1, character: 0 },
                        end: { line: 1, character: 20 },
                    },
                    status: 'applied',
                    personaId: 'mentor',
                    originalCode: 'var total = sum(items);',
                    proposedCode: 'const total = sum(items);',
                    createdAt: '',
                    updatedAt: '',
                },
            },
            {
                indexNumber: 2,
                item: {
                    id: 'int-2',
                    title: '古い却下済提案',
                    summary: '却下済み',
                    range: {
                        start: { line: 2, character: 0 },
                        end: { line: 2, character: 20 },
                    },
                    status: 'dismissed',
                    personaId: 'mentor',
                    originalCode: 'const raw = getInput();',
                    proposedCode: 'const raw = readInput();',
                    createdAt: '',
                    updatedAt: '',
                },
            },
            {
                indexNumber: 3,
                item: {
                    id: 'int-3',
                    title: 'JSON.parseの安全化',
                    summary: '安全なパーサーに置換',
                    range: {
                        start: { line: 3, character: 15 },
                        end: { line: 3, character: 30 },
                    },
                    status: 'pending',
                    personaId: 'mentor',
                    originalCode: 'JSON.parse(raw);',
                    proposedCode: 'safeParse(raw);',
                    createdAt: '',
                    updatedAt: '',
                },
            },
        ];

        const rows = buildWorkspaceDisplayRows(doc, interventions);
        // 元6行のうち行3が「削除行(-) + 追加行(+)」の2行になったので計7行
        expect(rows).toHaveLength(7);

        // 古い介入の行（index 1, 2）は通常表示のまま
        expect(rows[1]?.diffKind).toBe('unchanged');
        expect(rows[1]?.diffSign).toBe('');
        expect(rows[1]?.pendingButtons).toHaveLength(0);
        expect(rows[2]?.diffKind).toBe('unchanged');
        expect(rows[2]?.diffSign).toBe('');
        expect(rows[2]?.pendingButtons).toHaveLength(0);

        // 削除行（赤 -）：先頭変更行なので介入3ボタン付き
        expect(rows[3]?.diffKind).toBe('deletion');
        expect(rows[3]?.diffSign).toBe('-');
        expect(rows[3]?.isPendingHighlight).toBe(true);
        expect(rows[3]?.text).toBe('  const data = JSON.parse(raw);');
        expect(rows[3]?.pendingButtons).toHaveLength(1);
        expect(rows[3]?.pendingButtons[0]?.indexNumber).toBe(3);

        // 追加行（緑 +）：インデント維持で置換後のコード
        expect(rows[4]?.diffKind).toBe('addition');
        expect(rows[4]?.diffSign).toBe('+');
        expect(rows[4]?.isPendingHighlight).toBe(true);
        expect(rows[4]?.text).toBe('  const data = safeParse(raw);');
        expect(rows[4]?.pendingButtons).toHaveLength(0);
    });

    it('1行が複数行へ増える pending 提案では元1行が赤(-)・新4行が緑(+)として並ぶこと', () => {
        const interventions: IndexedIntervention[] = [
            {
                indexNumber: 1,
                item: {
                    id: 'int-multi',
                    title: 'try-catch追加',
                    summary: '安全化',
                    range: {
                        start: { line: 3, character: 0 },
                        end: { line: 3, character: 31 },
                    },
                    status: 'pending',
                    personaId: 'mentor',
                    originalCode: '  const data = JSON.parse(raw);',
                    proposedCode: [
                        '  let data = null;',
                        '  try {',
                        '    data = JSON.parse(raw);',
                        '  } catch {}',
                    ].join('\n'),
                    createdAt: '',
                    updatedAt: '',
                },
            },
        ];

        const rows = buildWorkspaceDisplayRows(doc, interventions);
        // 元6行のうち1行が「削除1行 + 追加4行」になったので計10行
        expect(rows).toHaveLength(10);

        expect(rows[3]?.diffKind).toBe('deletion');
        expect(rows[3]?.diffSign).toBe('-');
        expect(rows[3]?.pendingButtons).toHaveLength(1);

        expect(rows[4]?.diffKind).toBe('addition');
        expect(rows[4]?.diffSign).toBe('+');
        expect(rows[4]?.text).toBe('  let data = null;');
        expect(rows[4]?.pendingButtons).toHaveLength(0);

        expect(rows[7]?.diffKind).toBe('addition');
        expect(rows[7]?.diffSign).toBe('+');
        expect(rows[7]?.text).toBe('  } catch {}');

        expect(rows[8]?.diffKind).toBe('unchanged');
        expect(rows[8]?.sourceLine).toBe(4);
    });
});
