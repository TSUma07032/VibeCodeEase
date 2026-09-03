---
name: jules-pr-triage
description: Triage, test, resolve .jules markdown log conflicts, and squash-merge pull requests created by Jules agents.
---

# Jules PR Triage & Merge Skill

Jules（AIエージェント群：Builder, Sentinel, Bolt, Palette等）から作成されたプルリクエストを効率的かつ安全にトリアージ・テスト・マージするための標準手順です。

## ワークフロー

### 1. オープンPRの取得と整理
```bash
gh pr list --limit 50 --json number,title,headRefName,createdAt,labels
```
- 作成日時順（古い順）にソートして処理する。
- 同一機能・修正に対する重複PRがある場合は、最新版を優先し、古いPRは理由を明記してクローズする。

### 2. PRのローカル検証
各PRについて以下を実行：
```bash
git checkout main
git pull origin main
gh pr checkout <PR_NUMBER>
git merge origin/main --no-edit
```

#### コンフリクト発生時の対応ルール
1. **`.jules/*.md`（作業履歴・ログ）のコンフリクト**:
   - 既存のログを消さず、PR側の記録を追加（Union結合）して自動解決する。
   - `git add .jules/` ➔ `git commit -m "docs: resolve .jules log conflict"`
2. **ソースコードのコンフリクト**:
   - 変更意図を確認し、非自明な競合がある場合はユーザーに相談する。

### 3. ビルドとテストの実行
```bash
npm run compile
npm test
```
- ビルドまたはテストに失敗した場合、修正が軽微であればローカルで修正してコミット・プッシュする。
- 重大な問題がある場合はPRにコメントを残して保留/クローズする。

### 4. Squashマージの実行
テストが通過したら、`main` に戻って Squash マージを実行：
```bash
git checkout main
git pull origin main
gh pr merge <PR_NUMBER> --squash --delete-branch
```

### 5. 完了確認
すべてのPRをマージ後、`main` ブランチで最終検証を実施：
```bash
git checkout main
git pull origin main
npm run compile
npm test
```
