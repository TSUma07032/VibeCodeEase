import { useState } from 'react';
import './VersionControlTab.css';

/**
 * 修正提案のデータ構造
 * 
 * 【構造の説明】
 * - id: 提案の一意な識別子。
 * - type: 提案の発生源 ('gemini' = AIによる推論, 'local' = AST/静的解析等のルールベース)
 * - title: 提案の概要（ユーザー向け表示用）
 * - diff: 変更前後を示すコードスニペット。UIではこれを左右/上下に並べて差分を強調表示します。
 */
type Proposal = {
  id: string;
  type: 'gemini' | 'local';
  title: string;
  timestamp: string;
  diff: {
    before: string;
    after: string;
  };
};

const MOCK_PROPOSALS: Proposal[] = [
  {
    id: 'p1',
    type: 'gemini',
    title: 'Gemini: メソッドの最適化',
    timestamp: '10:30',
    diff: {
      before: `function calculate() {
  let result = 0;
  for(let i=0; i<10; i++) {
    result += i;
  }
  return result;
}`,
      after: `function calculate() {
  return Array.from({length: 10}, (_, i) => i).reduce((a, b) => a + b, 0);
}`
    }
  },
  {
    id: 'p2',
    type: 'local',
    title: 'User: 変数名の変更',
    timestamp: '10:45',
    diff: {
      before: `let x = 10;`,
      after: `let itemCount = 10;`
    }
  }
];

/**
 * @component VersionControlTab
 * @description
 * このコンポーネントは、AI（Gemini等）やローカルルールによるコード修正案を、
 * GitHubのプルリクエストやコミット履歴のような形式（差分ビュー）でユーザーに提示し、
 * 承認・却下（Accept/Reject）の判断を促すUIを提供します。
 * 
 * 【設計意図 (AI向けコンテキスト)】
 * - AIエージェントやLSPからの自動修正を勝手に適用せず、ユーザーの認知負荷を下げつつ
 *   「どのように変更されるか」を視覚的に確認・選択できるフローを実現するために設計されました。
 * 
 * 【データの構造とフロー】
 * - 現在は `MOCK_PROPOSALS` (モックデータ) を初期ステートとして使用していますが、
 *   本来はVS Code拡張機能側から送られてくる修正提案を受け取りリスト化する想定です。
 * - `proposals`: 未処理の修正案のリスト。
 * - `selectedId`: 現在プレビュー表示中の修正案ID。リスト(左側)と差分ビュー(右側)を同期させます。
 */
export function VersionControlTab() {
  const [proposals, setProposals] = useState<Proposal[]>(MOCK_PROPOSALS);
  const [selectedId, setSelectedId] = useState<string | null>(MOCK_PROPOSALS[0].id);

  const selectedProposal = proposals.find(p => p.id === selectedId);

  const handleAccept = () => {
    if (!selectedId) return;
    alert(`Accepted: ${selectedProposal?.title}`);
    setProposals(prev => prev.filter(p => p.id !== selectedId));
    setSelectedId(null);
  };

  const handleReject = () => {
    if (!selectedId) return;
    alert(`Rejected: ${selectedProposal?.title}`);
    setProposals(prev => prev.filter(p => p.id !== selectedId));
    setSelectedId(null);
  };

  return (
    <div className="vc-container">
      <div className="vc-sidebar">
        <h3 className="vc-sidebar-title">変更履歴</h3>
        <ul className="vc-list">
          {proposals.length === 0 && <div style={{padding: '1rem', color: '#888'}}>提案はありません</div>}
          {proposals.map(p => (
            <li 
              key={p.id} 
              className={`vc-list-item ${selectedId === p.id ? 'active' : ''}`}
              onClick={() => setSelectedId(p.id)}
            >
              <div className="vc-item-title">{p.title}</div>
              <div className="vc-item-meta">
                <span className={`vc-badge ${p.type === 'gemini' ? 'gemini' : 'local'}`}>
                  {p.type === 'gemini' ? '🤖 Gemini' : '👤 User'}
                </span>
                <span className="vc-item-time">{p.timestamp}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      
      <div className="vc-main">
        {selectedProposal ? (
          <div className="vc-diff-view">
            <div className="vc-diff-header">
              <h3>{selectedProposal.title}</h3>
              <div className="vc-actions">
                <button className="vc-btn accept" onClick={handleAccept}>Accept All</button>
                <button className="vc-btn reject" onClick={handleReject}>Discard All</button>
              </div>
            </div>
            
            <div className="vc-diff-content">
              <div className="vc-diff-pane before">
                <h4>変更前</h4>
                <pre><code>{selectedProposal.diff.before}</code></pre>
              </div>
              <div className="vc-diff-pane after">
                <h4>変更後</h4>
                <pre><code>{selectedProposal.diff.after}</code></pre>
              </div>
            </div>
          </div>
        ) : (
          <div className="vc-empty-state">
            <p>左側のリストから項目を選択してください</p>
          </div>
        )}
      </div>
    </div>
  );
}
