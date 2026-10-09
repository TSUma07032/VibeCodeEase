import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import { MirrorEditor } from './components/MirrorEditor';
import { ProposalPopup } from './components/ProposalPopup';
import type { WebviewIntervention } from './types';


// Setup Mock for vscode API
const postMessageMock = vi.fn();
(window as any).vscode = { postMessage: postMessageMock };

describe('App Component', () => {
  it('shows waiting message initially', () => {
    render(<App />);
    expect(screen.getByText('Waiting for document sync...')).toBeDefined();
  });
});

describe('MirrorEditor Component', () => {
  const dummyIntervention: WebviewIntervention = {
    id: '123',
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
    originalText: 'const',
    replacementText: 'let',
    message: 'Use let'
  };

  it('renders text with line numbers', () => {
    render(<MirrorEditor text={"line 1\nline 2"} interventions={[]} onApply={vi.fn()} onDiscard={vi.fn()} />);
    expect(screen.getByText('line 1')).toBeDefined();
    expect(screen.getByText('line 2')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
  });

  it('shows bulb icon when there is an intervention', () => {
    render(<MirrorEditor text="const x = 1;" interventions={[dummyIntervention]} onApply={vi.fn()} onDiscard={vi.fn()} />);
    expect(screen.getByTitle('View AI Proposal')).toBeDefined();
  });
});

describe('ProposalPopup Component', () => {
  const dummyIntervention: WebviewIntervention = {
    id: '123',
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
    originalText: 'const',
    replacementText: 'let',
    message: 'Use let'
  };

  it('renders diff texts and buttons', () => {
    const onApply = vi.fn();
    const onDiscard = vi.fn();
    render(<ProposalPopup intervention={dummyIntervention} onApply={onApply} onDiscard={onDiscard} />);
    
    expect(screen.getByText('Use let')).toBeDefined();
    expect(screen.getByText('const')).toBeDefined();
    expect(screen.getByText('let')).toBeDefined();
    
    fireEvent.click(screen.getByText('[反映 (Accept)]'));
    expect(onApply).toHaveBeenCalledWith(dummyIntervention);

    fireEvent.click(screen.getByText('[破棄 (Discard)]'));
    expect(onDiscard).toHaveBeenCalledWith('123');
  });
});
