import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * ==============================================================================
 * [Lint Setup] 堅牢・可読性特化型 黄金設定 (ESLint Flat Config)
 * ==============================================================================
 * 共通黄金テンプレート (~/.gemini/config/skills/lint-setup/templates/) と同期済み
 */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/out/**",
      "**/build/**",
      "**/.next/**",
      "**/.svelte-kit/**",
      "**/webview-ui/**",
      "**/.vscode-test/**",
    ],
  },

  js.configs.recommended,
  // 【思想2】TSの良さを全面に活かすため、標準推奨ではなく「型チェック付き推奨」にアップグレード
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    rules: {
      // ==============================================================================
      // 【思想1】システム全体の共通化・一貫性 (Uniformity)
      // ==============================================================================
      "eqeqeq": ["error", "always"], // 厳格な等価演算子 (===) を絶対強制
      "curly": ["error", "all"], // 1行のif文でも必ず中カッコ{}を強制（一貫性と修正時のバグ防止）
      "yoda": ["error", "never"], // ヨーダ記法禁止 (例: if(5 === val) ではなく if(val === 5) に統一)
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }], // 型のimportは必ず `import type` に統一する

      // ==============================================================================
      // 【思想2】TypeScriptの良さを全面に活かす (Maximize TypeScript)
      // ==============================================================================
      "@typescript-eslint/no-floating-promises": "error", // 非同期処理の未待機を絶つ
      "@typescript-eslint/no-explicit-any": "error", // anyは「警告」ではなく「禁止」に格上げ
      "@typescript-eslint/switch-exhaustiveness-check": "error", // switch文で未処理の条件（列挙型の漏れ）を許さない
      "@typescript-eslint/prefer-nullish-coalescing": "error", // `||` ではなく `??` を推奨（厳格なnull/undefined判定）
      "@typescript-eslint/prefer-optional-chain": "error", // 冗長な && チェックではなく `?.` を使う

      // ==============================================================================
      // 【思想3】人間が読めるシンプルな文法のみ許容 (Human Readability)
      // ==============================================================================
      // ▼ トリッキーな構文の禁止
      "no-nested-ternary": "error", // ネストされた三項演算子（a ? b : c ? d : e）を禁止（読めないコードの代表格）
      "no-implicit-coercion": "error", // `!!val` や `+val` のような暗黙的キャストを禁止。`Boolean(val)` のように書かせる
      "no-sequences": "error", // カンマ演算子禁止（変態的な1行コードを防ぐ）

      // ▼ 認知負荷の制限（「複雑すぎる＝悪」をシステムで定義）
      "complexity": ["warn", { max: 10 }], // 循環的複雑度（ifやforの数）を制限。複雑な関数は分割を促す
      "max-depth": ["warn", 3], // ネストの深さは最大3まで（ifの中のforの中のif...は人間が追えない）

      // ▼ 変数・関数定義の明瞭化
      "@typescript-eslint/explicit-module-boundary-types": "warn", // exportする関数には必ず戻り値の型を明記する（使う人が中身を読まなくて済むようにする）
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },

  // ==============================================================================
  // 【思想4】コンポーネント指向・単一責任の強制 (Single Responsibility)
  // ==============================================================================
  // ▼ ファイルレベルの肥大化防止（神ファイルの禁止）
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "max-lines": [
        "warn",
        {
          max: 300,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "max-lines-per-function": [
        "warn",
        {
          max: 100,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "max-statements": ["warn", { max: 20 }],
      "max-params": ["warn", 3],
      "complexity": ["warn", { max: 10 }],
      "max-depth": ["warn", 3],
    },
  },

  // ==============================================================================
  // [Project Specific Rules] プロジェクト固有ツギハギ追加エリア
  // ==============================================================================
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "import",
          format: ["camelCase", "PascalCase"],
        },
      ],
      semi: "warn",
    },
  }
);