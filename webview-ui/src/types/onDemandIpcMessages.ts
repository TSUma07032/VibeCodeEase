/**
 * [Why/Intent] Webview側における双方向IPCメッセージ型定義。
 */
import type {
    ChatMessage,
    InterventionDetail,
    InterventionItem,
    PersonaId,
    Range,
} from './onDemandIntervention';

/**
 * [Why/Intent] VS Code拡張機能本体（Extensionホスト）からWebviewサイドパネルへ送信されるメッセージの判別共用体定義。
 * 介入詳細の展開、チャット受信、履歴状態同期、ローディング状態制御を網羅する。
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
 * [Why/Intent] WebviewサイドパネルからVS Code拡張機能本体（Extensionホスト）へ送信されるメッセージの判別共用体定義。
 * 介入の適用/アンドゥ/却下、チャット送信、ペルソナ変更、能動的介入要求、パネル閉じる操作を網羅する。
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
