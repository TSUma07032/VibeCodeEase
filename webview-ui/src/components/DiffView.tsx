import React, { useMemo } from 'react';
import * as Diff from 'diff';

interface DiffViewProps {
  original: string;
  proposed: string;
}

export const DiffView = React.memo(({ original, proposed }: DiffViewProps) => {
  const diffParts = useMemo(() => Diff.diffLines(original, proposed), [original, proposed]);

  return (
    <>
      {diffParts.map((part, index) => {
        const color = part.added 
          ? 'var(--vscode-diffEditor-insertedTextBackground, rgba(155, 185, 85, 0.2))' 
          : part.removed 
            ? 'var(--vscode-diffEditor-removedTextBackground, rgba(255, 0, 0, 0.2))' 
            : 'transparent';
        const textColor = part.added 
          ? 'var(--vscode-gitDecoration-addedResourceForeground, #81b88b)' 
          : part.removed 
            ? 'var(--vscode-gitDecoration-deletedResourceForeground, #c74e39)' 
            : 'inherit';
        const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
        
        const lines = part.value.split('\n');
        // Filter out the trailing empty line from split
        if (lines[lines.length - 1] === '') {
          lines.pop();
        }

        return (
          <div key={index} style={{ backgroundColor: color, color: textColor, padding: '0 4px' }}>
            {lines.map((line, i) => (
              <div key={i}>{prefix}{line}</div>
            ))}
          </div>
        );
      })}
    </>
  );
});

DiffView.displayName = 'DiffView';
