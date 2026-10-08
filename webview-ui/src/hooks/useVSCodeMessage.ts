import { useEffect } from 'react';
import type { Proposal } from '../types/index';

type MessagePayload = 
  | { command: 'aiStageUpdate'; data: { stage: string } }
  | { command: 'aiProposalsComplete'; data: { proposals: Proposal[] } }
  | { command: 'personalizationUpdated'; data: { trend: string } }
  | { command: 'aiProposalsError'; data: { error: string } }
  | { command: 'loadSettings'; data: any }
  | { command: 'codeSynced'; data: { code: string; uri?: string } };

export function useVSCodeMessage(handlers: {
  onStageUpdate: (stage: string) => void;
  onProposalsComplete: (proposals: Proposal[]) => void;
  onPersonalizationUpdated: (trend: string) => void;
  onError: (error: string) => void;
  onLoadSettings?: (settings: any) => void;
  onCodeSynced?: (data: { code: string; uri?: string }) => void;
}) {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data as MessagePayload;
      switch (message.command) {
        case 'aiStageUpdate':
          handlers.onStageUpdate(message.data.stage);
          break;
        case 'aiProposalsComplete':
          handlers.onProposalsComplete(message.data.proposals);
          break;
        case 'personalizationUpdated':
          handlers.onPersonalizationUpdated(message.data.trend);
          break;
        case 'aiProposalsError':
          handlers.onError(message.data.error);
          break;
        case 'loadSettings':
          if (handlers.onLoadSettings) handlers.onLoadSettings(message.data);
          break;
        case 'codeSynced':
          if (handlers.onCodeSynced) handlers.onCodeSynced(message.data);
          break;
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handlers]);
}
