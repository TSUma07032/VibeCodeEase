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
 * 介入詳細展開、チャット応答、履歴状態同期、ローディング状態制御を担う。
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
          type: 'RECEIVE_CHAT_MESSAGE';
          payload: {
              interventionId: string;
              message: ChatMessage;
          };
      }
    | {
          type: 'SYNC_HISTORY_STATE';
          payload: {
              documentUri: string;
              interventions: InterventionItem[];
          };
      }
    | {
          type: 'SET_CHAT_LOADING';
          payload: {
              interventionId: string;
              isLoading: boolean;
          };
      };

/**
 * [Why/Intent] Webview側からVS Code拡張機能ホストへ要求を発行するオンデマンドアクションメッセージ型群。
 * 提案適用・差分アンドゥ・提案却下・チャット送信・ペルソナ切替・能動的指示・パネルクローズを担う。
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
