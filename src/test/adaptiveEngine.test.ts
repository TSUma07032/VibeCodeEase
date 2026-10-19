import * as assert from 'node:assert';
import { AdaptiveEngine } from '../core/adaptiveEngine';
import { THRESHOLDS } from '../core/interventionEngine';
import { GlobalState } from '../state/globalState';

suite('AdaptiveEngine Test Suite', () => {
    test('連続承認回数を正しくカウントできること', () => {
        const engine = new AdaptiveEngine(3);

        assert.strictEqual(engine.getConsecutiveApproveCount('SYNTAX_TYPO'), 0);

        engine.recordAction('SYNTAX_TYPO', 'APPLY');
        assert.strictEqual(engine.getConsecutiveApproveCount('SYNTAX_TYPO'), 1);

        engine.recordAction('SYNTAX_TYPO', 'APPLY');
        assert.strictEqual(engine.getConsecutiveApproveCount('SYNTAX_TYPO'), 2);

        // 却下が入るとカウントがリセットされること
        engine.recordAction('SYNTAX_TYPO', 'REJECT');
        assert.strictEqual(engine.getConsecutiveApproveCount('SYNTAX_TYPO'), 0);

        // 再び承認すると1からカウントされること
        engine.recordAction('SYNTAX_TYPO', 'APPLY');
        assert.strictEqual(engine.getConsecutiveApproveCount('SYNTAX_TYPO'), 1);
    });

    test('異なるカテゴリの承認は独立してカウントされること', () => {
        const engine = new AdaptiveEngine(3);

        engine.recordAction('SYNTAX_TYPO', 'APPLY');
        engine.recordAction('INDENTATION_FORMATTING', 'APPLY');
        engine.recordAction('SYNTAX_TYPO', 'APPLY');

        assert.strictEqual(engine.getConsecutiveApproveCount('SYNTAX_TYPO'), 2);
        assert.strictEqual(engine.getConsecutiveApproveCount('INDENTATION_FORMATTING'), 1);
        assert.strictEqual(engine.getConsecutiveApproveCount('VAR_FUNC_MANAGEMENT'), 0);
    });

    test('SUGGESTIONレベルでしきい値回数連続承認するとSILENTへ自動昇格すること', async () => {
        GlobalState.resetInstanceForTesting();
        const state = GlobalState.getInstance();
        await state.updatePreference('INDENTATION_FORMATTING', 0.5); // SUGGESTION
        const engine = new AdaptiveEngine(3);

        assert.strictEqual(engine.recordAction('INDENTATION_FORMATTING', 'APPLY'), false);
        assert.strictEqual(engine.recordAction('INDENTATION_FORMATTING', 'APPLY'), false);
        assert.strictEqual(engine.recordAction('INDENTATION_FORMATTING', 'APPLY'), true);

        assert.strictEqual(engine.getConsecutiveApproveCount('INDENTATION_FORMATTING'), 3);
        assert.ok(
            state.preferences.preferences.INDENTATION_FORMATTING >= THRESHOLDS.SUGGESTION_MAX,
        );
        GlobalState.resetInstanceForTesting();
    });
});
