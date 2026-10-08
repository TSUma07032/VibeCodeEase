import re

with open('webview-ui/src/App.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Fix the corrupted classNames
text = re.sub(r'className=\{`preset-card.*?`\}', r'className={`preset-card ${presetMode === \'LEARNING\' ? \'active\' : \'\'}`}', text, count=1)
text = re.sub(r'className=\{`preset-card.*?`\}', r'className={`preset-card ${presetMode === \'FLOW\' ? \'active\' : \'\'}`}', text, count=1)
text = re.sub(r'className=\{`preset-card.*?`\}', r'className={`preset-card ${presetMode === \'ZEN\' ? \'active\' : \'\'}`}', text, count=1)

with open('webview-ui/src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
