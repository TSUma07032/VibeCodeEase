import re

with open('webview-ui/src/App.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# We will completely replace the return ( ... ) block of App component.
# First, extract everything BEFORE the return statement.
match = re.search(r'([\s\S]*?)(\s*return \(\s*<div className="App">\s*<header)', text)
if not match:
    print("Could not find return statement!")
    exit(1)

pre_return = match.group(1)

new_return = """
  return (
    <div className="App">
      <header className="header">
        <h1>✨ vibeCodeEase</h1>
        <p>AI-assisted Flow & Learning Support</p>
      </header>

      {/* Section 0: LLM & API 設定 */}
      <section className="card llm-section">
        <h2 className="section-title">🤖 LLM & API設定</h2>
        <div className="llm-config-box">
          <div className="form-group">
            <label>LLM プロバイダー</label>
            <select value={llmConfig.provider} onChange={handleLlmProviderChange} className="styled-select">
              <option value="gemini">💎 Google Gemini (推奨)</option>
              <option value="vscode-lm">🖥️ VS Code LM (Copilot等)</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>使用モデル</label>
            <select value={llmConfig.model} onChange={handleLlmModelChange} className="styled-select">
              {llmConfig.provider === 'gemini' ? (
                <>
                  <option value="gemini-3.6-flash">gemini-3.6-flash (推奨・最速)</option>
                  <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                  <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                  <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                  <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                  <option value="auto">自動選択 (Auto)</option>
                </>
              ) : (
                <>
                  <option value="auto">自動選択 (Default)</option>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="claude-3.5-sonnet">claude-3.5-sonnet</option>
                </>
              )}
            </select>
          </div>

          {llmConfig.provider === 'gemini' && (
            <div className="form-group api-key-group">
              <label>Gemini API キー</label>
              {hasGeminiApiKey && !isEditingApiKey ? (
                <div className="api-key-status">
                  <span className="status-badge success">✅ 設定済み</span>
                  <div className="api-key-actions">
                    <button className="action-button small" onClick={() => setIsEditingApiKey(true)}>変更</button>
                    <button className="secondary-button small danger" onClick={handleDeleteApiKey}>削除</button>
                  </div>
                </div>
              ) : (
                <div className="api-key-input-box">
                  <input
                    type="password"
                    value={apiKeyValue}
                    onChange={e => setApiKeyValue(e.target.value)}
                    placeholder="AI StudioのAPIキーを入力"
                    className="styled-input"
                  />
                  <div className="api-key-actions">
                    <button className="action-button small" onClick={handleSaveApiKey} disabled={!apiKeyValue}>保存</button>
                    {hasGeminiApiKey && <button className="secondary-button small" onClick={() => setIsEditingApiKey(false)}>キャンセル</button>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Section 1: UIUX 設定 */}
      <section className="card uiux-section">
        <h2 className="section-title">🖥️ UIUX（AIとの接し方）設定</h2>
        <div className="uiux-desc" style={{ marginBottom: '15px', fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
          個人のお好みに合わせて、AIからの通知頻度や自動化レベルを自由に設定できます。
        </div>

        <div className="form-group">
          <label>AI介入の発生タイミング (Trigger Mode)</label>
          <div className="radio-group">
            {[
              { value: 'continuous', label: '10秒ごと(連続)', desc: '作業中に自動で継続的に解析・生成' },
              { value: 'on-save', label: '保存時のみ', desc: '推奨・APIコスト節約' },
              { value: 'disabled', label: '無効', desc: 'LLM解析を完全に停止' },
            ].map(opt => (
              <label key={opt.value} className={`radio-option ${llmTriggerMode === opt.value ? 'radio-selected' : ''}`}>
                <input
                  type="radio"
                  name="llm-trigger"
                  value={opt.value}
                  checked={llmTriggerMode === opt.value}
                  onChange={() => {
                    vscode?.postMessage({ command: 'SET_LLM_TRIGGER_MODE', payload: opt.value });
                  }}
                />
                <span className="radio-label-text">
                  <strong>{opt.label}</strong>
                  <small>{opt.desc}</small>
                </span>
              </label>
            ))}
          </div>
        </div>

        {pzProfile && (
          <div className="pz-controls uiux-controls" style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <div>
              <label>通知・提示の強さ: </label>
              <select
                value={pzProfile.visibilityLevel}
                onChange={e => vscode?.postMessage({ command: 'PZ_SET_UIUX', payload: { visibility: e.target.value } })}
              >
                <option value="stealth">Stealth (最小限)</option>
                <option value="subtle">Subtle (控えめ)</option>
                <option value="active">Active (積極的)</option>
              </select>
            </div>
            <div>
              <label>理由説明の表示量: </label>
              <select
                value={pzProfile.explanationVerbosity}
                onChange={e => vscode?.postMessage({ command: 'PZ_SET_UIUX', payload: { verbosity: e.target.value } })}
              >
                <option value="minimal">Minimal (1行要約)</option>
                <option value="summary">Summary (箇条書き)</option>
                <option value="detailed">Detailed (詳細)</option>
              </select>
            </div>
            <div>
              <label>差分適用の自動化: </label>
              <select
                value={pzProfile.applicationAutomation}
                onChange={e => vscode?.postMessage({ command: 'PZ_SET_UIUX', payload: { automation: e.target.value } })}
              >
                <option value="manual">Manual (手動確認)</option>
                <option value="bulk">Bulk (ファイル一括)</option>
                <option value="auto">Auto (保存時自動適用)</option>
              </select>
            </div>
          </div>
        )}
      </section>

      {/* Section 2: 生成物の設定 */}
      <section className="card generation-section">
        <h2 className="section-title">🧠 生成物の方向性（AIの人格）設定</h2>
        <div style={{ display: 'flex', gap: '20px', marginBottom: '15px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
            <input type="radio" checked={isPersonalizedMode} onChange={() => setIsPersonalizedMode(true)} />
            <span>🧠 パーソナライズ (動的学習)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
            <input type="radio" checked={!isPersonalizedMode} onChange={() => setIsPersonalizedMode(false)} />
            <span>🔧 既存人格 (固定プリセット)</span>
          </label>
        </div>

        {isPersonalizedMode ? (
          <>
            <PersonalizationPanel 
              vscode={vscode} 
              profile={pzProfile} 
              metrics={pzMetrics} 
              candidates={pzCandidates} 
              isBusy={pzBusy} 
              error={pzError} 
            />
            <div style={{ marginTop: '15px', padding: '10px', background: 'var(--vscode-input-background)', borderRadius: '4px' }}>
              <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', marginBottom: '5px' }}>📝 現在の生成プロンプト（パーソナライズ）:</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '12px', color: 'var(--vscode-editor-foreground)' }}>{pzProfile?.preferenceSummary || '学習データがありません。'}</pre>
            </div>
          </>
        ) : (
          <>
            <div className="preset-grid">
              <div
                className={`preset-card ${presetMode === 'LEARNING' ? 'active' : ''}`}
                onClick={() => handleSelectPreset('LEARNING')}
              >
                <div className="preset-card-header">
                  <span>🎓 学習モード(Learning)</span>
                </div>
                <div className="preset-card-desc">
                  タイポを手軽に直しつつ、構文・ロジックは解説ヒントを提示。コード理解を最優先。
                </div>
              </div>
              <div
                className={`preset-card ${presetMode === 'FLOW' ? 'active' : ''}`}
                onClick={() => handleSelectPreset('FLOW')}
              >
                <div className="preset-card-header">
                  <span>⚡ フローモード(Flow)</span>
                </div>
                <div className="preset-card-desc">
                  タイポや構文ミスを裏で自動修正。思考のノリとバイブスを最優先。
                </div>
              </div>
              <div
                className={`preset-card ${presetMode === 'ZEN' ? 'active' : ''}`}
                onClick={() => handleSelectPreset('ZEN')}
              >
                <div className="preset-card-header">
                  <span>🛠️ 職人モード(Zen)</span>
                </div>
                <div className="preset-card-desc">
                  AI介入を最小限に抑え、自力でコードを紡ぐクラフト重視。
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: '15px', padding: '10px', background: 'var(--vscode-input-background)', borderRadius: '4px' }}>
              <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', marginBottom: '5px' }}>📝 現在の生成プロンプト（プリセット）:</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '12px', color: 'var(--vscode-editor-foreground)' }}>{presetMode === 'LEARNING' ? 'タイポを手軽に直しつつ、構文・ロジックはあえて解説ヒントを提示。コード理解を最優先。' : presetMode === 'FLOW' ? '面倒なタイポや整形・構文修正を自動化。思考の流れとバイブスを最優先。' : 'AIの介入を最小限に。自力・手でじっくりコードを紡ぎたい時に。'}</pre>
            </div>
          </>
        )}
      </section>

      {/* Section 3: Live Issues (Grammarly panel) */}
      <section className="card grammarly-panel">
        <div className="section-title">
          🔍 現在の問題
          <span className={`issue-count-badge ${liveIssues.length === 0 ? 'badge-ok' : 'badge-warn'}`}>
            {liveIssues.length === 0 ? '✅ なし' : `${liveIssues.length}件`}
          </span>
          {isBackgroundAnalyzing && <span className="bg-analysis-loader">🧠 AI思考中...</span>}
        </div>
        {liveIssues.length === 0 ? (
          <div className="no-issues">✅ 問題は検出されていません</div>
        ) : (
          <ul className="issue-list">
            {liveIssues.map((issue, i) => (
              <li
                key={i}
                className={`issue-item issue-${issue.source}`}
                onClick={() => vscode?.postMessage({ command: 'JUMP_TO_ISSUE', payload: { line: issue.line, character: issue.character } })}
                title={`行${issue.line + 1} へジャンプ`}
              >
                <span className="issue-location">L{issue.line + 1}</span>
                <span className="issue-source-badge">
                  {issue.source === 'llm' ? '🧠' : issue.source === 'ast' ? '🌲' : '🔤'}
                </span>
                
                <div className="issue-content">
                  {issue.message.includes('🧠 **AI 提案**: ') ? (
                    <div className="ai-reason-bubble">
                      <div className="ai-reason-header">🧠 AI 提案</div>
                      <div className="ai-reason-body">{issue.message.replace('🧠 **AI 提案**: ', '')}</div>
                    </div>
                  ) : (
                    <div className="issue-message">{issue.message}</div>
                  )}
                </div>

                <div className="issue-actions">
                  <button className="issue-btn-apply" onClick={(e) => { e.stopPropagation(); vscode?.postMessage({ command: 'SHOW_DIFF' }); }}>🔍 差分</button>
                  <button className="issue-btn-apply" onClick={(e) => handleApplyIssue(e, issue)}>✨ 適用</button>
                  <button className="issue-btn-reject" onClick={(e) => handleRejectIssue(e, issue)}>✕ 却下</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default App;
"""

with open('webview-ui/src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(pre_return + new_return)
