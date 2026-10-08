import re

with open('webview-ui/src/App.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace the PersonalizationPanel invocation and the hr
pattern = r'<PersonalizationPanel[\s\S]*?error=\{pzError\}\s*/>\s*<hr[^>]*>'
replacement = '''<div style={{ padding: '15px', margin: '20px', background: 'var(--vscode-editorWidget-background)', border: '1px solid var(--vscode-widget-border)', borderRadius: '6px' }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>🎭 AI人格・パーソナライズ設定</h2>
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
                className={preset-card }
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
                className={preset-card }
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
                className={preset-card }
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
      </div>

      <hr style={{ margin: '20px 0', borderColor: 'var(--vscode-widget-border)' }} />
'''
text = re.sub(pattern, replacement, text)

# Delete the old preset section
text = re.sub(r'\{\/\* .*?プリセット.*?\*\/\}\s*<section className="preset-section">.*?<\/section>', '', text, flags=re.DOTALL)

with open('webview-ui/src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
