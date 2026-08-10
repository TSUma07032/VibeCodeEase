/**
 * 位置情報 (0-indexed または 1-indexed に依存)
 */
export interface Position {
  line: number;
  character: number;
}

/**
 * コードの範囲
 */
export interface Range {
  start: Position;
  end: Position;
}
