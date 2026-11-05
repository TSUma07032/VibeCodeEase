/**
 * [Why/Intent] SidebarInitialView コンポーネントの単体テストスイート。
 * ⚡ 簡易設定（ペルソナ・トリガー・モデル）、🔑 APIキー管理、📋 提案リストの3要素のみが描画され、
 * 余計なボタンが存在せず、各イベントハンドラが正しく発火することを検証する。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarInitialView } from '../../components/SidebarInitialView';
import type { InterventionItem } from '../../types/onDemandIntervention';

describe('SidebarInitialView Test Suite', () => {
    const mockInterventions: InterventionItem[] = [
        {
            id: 'intv-1',
            title: '不要な再計算のメモ化',
            summary: 'useMemoを使用して重い計算をキャッシュします',
            range: { start: { line: 10, character: 0 }, end: { line: 15, character: 0 } },
            status: 'pending',
            personaId: 'mentor',
            createdAt: '2026-11-05T00:00:00Z',
            updatedAt: '2026-11-05T00:00:00Z',
        },
        {
            id: 'intv-2',
            title: 'null安全チェックの追加',
            summary: 'オプショナルチェイニングを適用します',
            range: { start: { line: 20, character: 0 }, end: { line: 22, character: 0 } },
            status: 'applied',
            personaId: 'concise',
            createdAt: '2026-11-05T00:00:00Z',
            updatedAt: '2026-11-05T00:00:00Z',
        },
    ];

    it('簡易設定3要素（ペルソナ、介入トリガー、モデル）が正確に描画されること', () => {
        const onPersonaChange = vi.fn();
        const onFrequencyChange = vi.fn();
        const onModelChange = vi.fn();

        render(
            <SidebarInitialView
                personaId="mentor"
                onPersonaChange={onPersonaChange}
                frequency="onSave"
                onFrequencyChange={onFrequencyChange}
                intervalSeconds={60}
                onIntervalSecondsChange={vi.fn()}
                model="gemini-3.5-flash-lite"
                onModelChange={onModelChange}
                hasApiKey={true}
                apiKeyLength={39}
                onSaveApiKey={vi.fn()}
                interventions={mockInterventions}
                onSelectIntervention={vi.fn()}
            />,
        );

        // ペルソナ選択
        const personaSelect = screen.getByLabelText(/ペルソナ/i);
        expect(personaSelect).toBeInTheDocument();
        fireEvent.change(personaSelect, { target: { value: 'concise' } });
        expect(onPersonaChange).toHaveBeenCalledWith('concise');

        // 介入トリガー
        const frequencySelect = screen.getByLabelText(/介入トリガー/i);
        expect(frequencySelect).toBeInTheDocument();
        fireEvent.change(frequencySelect, { target: { value: 'interval' } });
        expect(onFrequencyChange).toHaveBeenCalledWith('interval');

        // モデル選択
        const modelSelect = screen.getByLabelText(/モデル/i);
        expect(modelSelect).toBeInTheDocument();
        fireEvent.change(modelSelect, { target: { value: 'gemini-3.8-flash' } });
        expect(onModelChange).toHaveBeenCalledWith('gemini-3.8-flash');
    });

    it('APIキー設定状態の表示および変更フォームの保存コールバックが発火すること', () => {
        const onSaveApiKey = vi.fn();

        const { rerender } = render(
            <SidebarInitialView
                personaId="mentor"
                onPersonaChange={vi.fn()}
                frequency="onSave"
                onFrequencyChange={vi.fn()}
                intervalSeconds={60}
                onIntervalSecondsChange={vi.fn()}
                model="gemini-3.5-flash-lite"
                onModelChange={vi.fn()}
                hasApiKey={false}
                apiKeyLength={0}
                onSaveApiKey={onSaveApiKey}
                interventions={mockInterventions}
                onSelectIntervention={vi.fn()}
            />,
        );

        expect(screen.getByText(/未設定/i)).toBeInTheDocument();

        // 設定済みの状態で再描画
        rerender(
            <SidebarInitialView
                personaId="mentor"
                onPersonaChange={vi.fn()}
                frequency="onSave"
                onFrequencyChange={vi.fn()}
                intervalSeconds={60}
                onIntervalSecondsChange={vi.fn()}
                model="gemini-3.5-flash-lite"
                onModelChange={vi.fn()}
                hasApiKey={true}
                apiKeyLength={39}
                onSaveApiKey={onSaveApiKey}
                interventions={mockInterventions}
                onSelectIntervention={vi.fn()}
            />,
        );

        expect(screen.getByText(/設定済/i)).toBeInTheDocument();

        // 変更ボタンを押して入力
        const changeBtn = screen.getByRole('button', { name: /変更/i });
        fireEvent.click(changeBtn);

        const apiKeyInput = screen.getByPlaceholderText(/Gemini API Key/i);
        fireEvent.change(apiKeyInput, { target: { value: 'AIzaSyTestNewKey12345' } });

        const saveBtn = screen.getByRole('button', { name: /保存/i });
        fireEvent.click(saveBtn);

        expect(onSaveApiKey).toHaveBeenCalledWith('AIzaSyTestNewKey12345');
    });

    it('提案リストが描画され、アイテムクリックでonSelectInterventionが呼ばれること', () => {
        const onSelectIntervention = vi.fn();

        render(
            <SidebarInitialView
                personaId="mentor"
                onPersonaChange={vi.fn()}
                frequency="onSave"
                onFrequencyChange={vi.fn()}
                intervalSeconds={60}
                onIntervalSecondsChange={vi.fn()}
                model="gemini-3.5-flash-lite"
                onModelChange={vi.fn()}
                hasApiKey={true}
                apiKeyLength={39}
                onSaveApiKey={vi.fn()}
                interventions={mockInterventions}
                onSelectIntervention={onSelectIntervention}
            />,
        );

        expect(screen.getByText(/不要な再計算のメモ化/)).toBeInTheDocument();
        expect(screen.getByText(/null安全チェックの追加/)).toBeInTheDocument();

        const item = screen.getByText(/不要な再計算のメモ化/);
        fireEvent.click(item);

        expect(onSelectIntervention).toHaveBeenCalledWith('intv-1');
    });

    it('不要なボタン（今すぐAI解析ボタンなど）が存在しないこと', () => {
        render(
            <SidebarInitialView
                personaId="mentor"
                onPersonaChange={vi.fn()}
                frequency="onSave"
                onFrequencyChange={vi.fn()}
                intervalSeconds={60}
                onIntervalSecondsChange={vi.fn()}
                model="gemini-3.5-flash-lite"
                onModelChange={vi.fn()}
                hasApiKey={true}
                apiKeyLength={39}
                onSaveApiKey={vi.fn()}
                interventions={mockInterventions}
                onSelectIntervention={vi.fn()}
            />,
        );

        expect(screen.queryByText(/今すぐAI解析/i)).not.toBeInTheDocument();
    });
});
