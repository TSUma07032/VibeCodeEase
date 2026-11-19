/**
 * [Why/Intent] VS Code拡張機能ホストとWebviewオンデマンドサイドパネル間の
 * 双方向IPCメッセージ型定義。
 */
import type {
    ChatMessage,
    InterventionDetail,
    InterventionItem,
    PersonaId,
    Range,
} from './onDemandIntervention';

/**
 * [Why/Intent] VS Code拡張機能ホストからWebview側へ送信されるオンデマンド通知メッセージ型群。
 * 介入詳細展開、チャット応答、履歴状態同期、ローディング状態制御、再推敲結果更新を担う。
 */
export type ExtensionToWebviewInterventionMessage =
    | {
          type: 'EXPAND_INTERVENTION_DETAIL';
          payload: {
              interventionId: string;
              persona: PersonaId;
              detail: InterventionDetail;
          };
      }
    | {
          type: 'UPDATE_INTERVENTION_DETAIL';
          payload: {
              interventionId: string;
              detail: InterventionDetail;
          };
      }
    | {
          type: 'SET_REFINE_LOADING';
          payload: {
              interventionId: string;
              isLoading: boolean;
              error?: string;
          };
      }
    | {
          type: 'RECEIVE_CHAT_MESSAGE';
          payload: {
              interventionId: string;
              message: ChatMessage;
          };
      }
    | {
          type: 'SET_CHAT_LOADING';
          payload: {
              interventionId: string;
              isLoading: boolean;
              error?: string;
          };
      }
    | {
          type: 'SYNC_HISTORY_STATE';
          payload: {
              documentUri: string;
              interventions: InterventionItem[];
          };
      };

/**
 * [Why/Intent] Webview側からVS Code拡張機能ホストへ要求を発行するオンデマンドアクションメッセージ型群。
 * 提案適用・差分アンドゥ・提案却下・チャット送信・方針修正・ペルソナ切替・設定更新・パネルクローズを担う。
 */
export type WebviewToExtensionInterventionMessage =
    | {
          type: 'APPLY_INTERVENTION';
          payload: { interventionId: string };
      }
    | {
          type: 'UNDO_INTERVENTION';
          payload: { interventionId: string };
      }
    | {
          type: 'DISCARD_INTERVENTION';
          payload: { interventionId: string };
      }
    | {
          type: 'REFINE_INTERVENTION';
          payload: {
              interventionId: string;
              userInstruction: string;
              personaId: PersonaId;
          };
      }
    | {
          type: 'UPDATE_QUICK_SETTINGS';
          payload: {
              personaId?: PersonaId;
              frequency?: 'manual' | 'onSave' | 'interval';
              intervalSeconds?: number;
              model?: string;
              scrollSyncEnabled?: boolean;
          };
      }
    | {
          type: 'SYNC_WEBVIEW_SCROLL';
          payload: { topLine: number };
      }
    | {
          type: 'SET_DETAIL_PANEL_OPEN';
          payload: { isOpen: boolean };
      }
    | {
          type: 'UPDATE_API_KEY';
          payload: { apiKey: string };
      }
    | {
          type: 'REQUEST_EXPAND_DETAIL';
          payload: { interventionId: string };
      }
    | {
          type: 'SEND_CHAT_MESSAGE';
          payload: {
              interventionId: string;
              personaId: PersonaId;
              text: string;
          };
      }
    | {
          type: 'SWITCH_PERSONA';
          payload: { personaId: PersonaId };
      }
    | {
          type: 'REQUEST_ACTIVE_INTERVENTION';
          payload: {
              range: Range;
              instruction: string;
          };
      }
    | {
          type: 'CLOSE_SIDE_PANEL';
      };
