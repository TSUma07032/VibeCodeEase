import * as assert from 'assert';
import { parsePainCategory, clampPreferenceValue } from '../types/utils';

suite('Types Utils Test Suite', () => {
  suite('parsePainCategory', () => {
    test('譛牙柑縺ｪ PainCategory 縺ｮ蝣ｴ蜷医・縺昴・縺ｾ縺ｾ霑斐☆縺薙→', () => {
      assert.strictEqual(parsePainCategory('SYNTAX_TYPO'), 'SYNTAX_TYPO');
      assert.strictEqual(parsePainCategory('INDENTATION_FORMATTING'), 'INDENTATION_FORMATTING');
      assert.strictEqual(parsePainCategory('VAR_FUNC_MANAGEMENT'), 'VAR_FUNC_MANAGEMENT');
      assert.strictEqual(parsePainCategory('SYNTAX_ERROR_HANDLING'), 'SYNTAX_ERROR_HANDLING');
    });

    test('辟｡蜉ｹ縺ｪ繧ｫ繝・ざ繝ｪ譁・ｭ怜・縺ｮ蝣ｴ蜷医・繝・ヵ繧ｩ繝ｫ繝亥､縺ｫ繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ縺吶ｋ縺薙→', () => {
      assert.strictEqual(parsePainCategory('INVALID_CATEGORY'), 'SYNTAX_TYPO');
      assert.strictEqual(parsePainCategory(''), 'SYNTAX_TYPO');
    });

    test('繧ｫ繧ｹ繧ｿ繝縺ｮ繝・ヵ繧ｩ繝ｫ繝亥､繧呈欠螳壹＠縺溷ｴ蜷医∫┌蜉ｹ縺ｪ蜈･蜉帙〒縺昴ｌ縺瑚ｿ斐ｋ縺薙→', () => {
      assert.strictEqual(parsePainCategory('UNKNOWN', 'VAR_FUNC_MANAGEMENT'), 'VAR_FUNC_MANAGEMENT');
    });
  });

  suite('clampPreferenceValue', () => {
    test('0.0縲・.0 縺ｮ遽・峇蜀・・謨ｰ蛟､縺ｯ縺昴・縺ｾ縺ｾ霑斐☆縺薙→', () => {
      assert.strictEqual(clampPreferenceValue(0.0), 0.0);
      assert.strictEqual(clampPreferenceValue(0.5), 0.5);
      assert.strictEqual(clampPreferenceValue(1.0), 1.0);
    });

    test('0.0譛ｪ貅縺ｮ謨ｰ蛟､縺ｯ0.0縺ｫ陬懈ｭ｣縺輔ｌ繧九％縺ｨ', () => {
      assert.strictEqual(clampPreferenceValue(-0.1), 0.0);
      assert.strictEqual(clampPreferenceValue(-100), 0.0);
    });

    test('1.0繧医ｊ螟ｧ縺阪＞謨ｰ蛟､縺ｯ1.0縺ｫ陬懈ｭ｣縺輔ｌ繧九％縺ｨ', () => {
      assert.strictEqual(clampPreferenceValue(1.1), 1.0);
      assert.strictEqual(clampPreferenceValue(100), 1.0);
    });

    test('謨ｰ蛟､莉･螟悶・蛟､繧НaN縺梧ｸ｡縺輔ｌ縺溷ｴ蜷医・繝・ヵ繧ｩ繝ｫ繝亥､・・.5・峨′霑斐ｋ縺薙→', () => {
      assert.strictEqual(clampPreferenceValue(undefined), 0.5);
      assert.strictEqual(clampPreferenceValue(null), 0.5);
      assert.strictEqual(clampPreferenceValue('0.5'), 0.5);
      assert.strictEqual(clampPreferenceValue(NaN), 0.5);
    });

    test('繧ｫ繧ｹ繧ｿ繝縺ｮ繝・ヵ繧ｩ繝ｫ繝亥､繧呈欠螳壹＠縺溷ｴ蜷医∫┌蜉ｹ縺ｪ蜈･蜉帙〒縺昴ｌ縺瑚ｿ斐ｋ縺薙→', () => {
      assert.strictEqual(clampPreferenceValue(undefined, 0.8), 0.8);
      assert.strictEqual(clampPreferenceValue(NaN, 0.2), 0.2);
    });
  });

  suite('PAIN_CATEGORY_LABELS & PRESET_MODES', () => {
    test('縺吶∋縺ｦ縺ｮ PainCategory 縺ｫ蟇ｾ蠢懊☆繧九Λ繝吶Ν縺悟ｮ夂ｾｩ縺輔ｌ縺ｦ縺・ｋ縺薙→', () => {
      const { PAIN_CATEGORIES, PAIN_CATEGORY_LABELS } = require('../types');
      for (const cat of PAIN_CATEGORIES) {
        assert.ok(typeof PAIN_CATEGORY_LABELS[cat] === 'string' && PAIN_CATEGORY_LABELS[cat].length > 0);
      }
    });

    test('PRESET_MODES 縺ｫ縺吶∋縺ｦ縺ｮ繝励Μ繧ｻ繝・ヨ縺悟性縺ｾ繧後ｋ縺薙→', () => {
      const { PRESET_MODES } = require('../types');
      assert.deepStrictEqual(Array.from(PRESET_MODES), ['HINT', 'ARCHITECTURE', 'BUG_TYPO', 'CUSTOM']);
    });
  });
});
