1. **Remove hardcoded JSON schema and auto-generate it using Zod**
   - In `src/core/llm/promptBuilder.ts`, import `LlmInterventionPlanSchema` from `../../types/llmIntervention` and `zodToJsonSchema` from `zod-to-json-schema`.
   - Replace the hardcoded `INTERVENTION_RESPONSE_SCHEMA` with an auto-generated schema from the Zod schema: `export const INTERVENTION_RESPONSE_SCHEMA = zodToJsonSchema(LlmInterventionPlanSchema, "LlmInterventionPlan");`.
2. **Verify changes in promptBuilder**
   - Use `git diff` to confirm the new imports and schema definition were written correctly in `src/core/llm/promptBuilder.ts`.
3. **Verify and Update `TODO.md`**
   - Change the Zod JSON schema task from `[ ]` to `[x]` in `TODO.md` at line 139.
   - Insert exactly this string under the task: `  - Jules Memo: zod-to-json-schemaを利用し、src/core/llm/promptBuilder.tsのハードコードされたINTERVENTION_RESPONSE_SCHEMAをLlmInterventionPlanSchemaからの自動生成に置き換えました。`
   - Use `git diff` to verify the `TODO.md` changes.
4. **Run compilation and tests**
   - Execute `npm run compile` and `xvfb-run -a npm test` to ensure everything works correctly.
5. **Create PR Body**
   - Write the exactly following PR body content to a file `pr_body.txt`:
```
🎯 消化したTODO:
- [x] ZodスキーマからJSON Schemaを自動生成し、OpenAI等の直接APIのStructured Outputs（strict: true）へ渡す。

💡 実装内容 (What):
- `zod-to-json-schema` パッケージを用いて、`src/core/llm/promptBuilder.ts` でハードコードされていた `INTERVENTION_RESPONSE_SCHEMA` を、`LlmInterventionPlanSchema` (Zod) からの自動生成に置き換えました。

🔗 活用した基盤:
- `src/types/llmIntervention.ts` に定義済みの `LlmInterventionPlanSchema` を活用。

📝 次のステップ:
- [ ] 直接API用のLLMプロバイダー抽象化を追加し、VS Code Language Model APIと切り替え可能にする。
- [ ] Zodによるレスポンス再検証と、スキーマ不一致・拒否応答・タイムアウト時のエラー処理を追加する。
- [ ] 判定結果を `HoverProvider` と `CodeActionProvider` が参照する仕組みを追加する。
```
6. **Complete pre commit steps**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
7. **Submit PR**
   - Submit the pull request with a branch name like `builder-zod-json-schema` and title "🏗️ Builder: ZodスキーマからのJSON Schema自動生成".
