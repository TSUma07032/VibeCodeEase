import re

with open('webview-ui/src/App.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('className={preset-card }', 'className={`preset-card ${presetMode === \'LEARNING\' ? \'active\' : \'\'}`}', 1)
text = text.replace('className={preset-card }', 'className={`preset-card ${presetMode === \'FLOW\' ? \'active\' : \'\'}`}', 1)
text = text.replace('className={preset-card }', 'className={`preset-card ${presetMode === \'ZEN\' ? \'active\' : \'\'}`}', 1)

with open('webview-ui/src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
