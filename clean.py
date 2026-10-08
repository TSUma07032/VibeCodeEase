import re

with open('webview-ui/src/App.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Remove duplicate imports of PersonalizationPanel
text = re.sub(r'(import \{ PersonalizationPanel \} from \''\./components/PersonalizationPanel\'';\n)+', r'import { PersonalizationPanel } from \'./components/PersonalizationPanel\';\n', text)

# Remove getInterventionBadge
text = re.sub(r'export function getInterventionBadge[\s\S]*?\n\}\n', '', text)

with open('webview-ui/src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
