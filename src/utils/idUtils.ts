import { v7 as uuidv7 } from 'uuid';

/**
 * 観測 (Observation) および観測セット (ObservationSet) 用の標準 ID (UUIDv7) を生成します。
 * UUIDv7 は先頭48bitにミリ秒タイムスタンプを含み、時系列ソート性能と分散衝突耐性を両立します。
 */
export function generateId(): string {
  return uuidv7().toLowerCase();
}
