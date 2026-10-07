/** Documentation-only TypeScript interfaces: runtime intentionally zero-dependency Node ESM.
 * Agent can migrate to strict TypeScript after live Jupiter schema discovery.
 */
export type EpochMs = number;
export type Direction = 'UP' | 'DOWN' | 'VOID';
export type PaperAction = 'UP' | 'DOWN' | 'SKIP';
export type Provider = 'openai' | 'jev' | 'glide';
export type Provenance = 'LIVE_RECEIVED_WS' | 'HISTORICAL_BACKFILL';
export interface MarketTick { symbol: 'BTC'; price: number; sourceMs: EpochMs; receivedMs: EpochMs; provenance: Provenance; raw?: unknown }
export interface ArcadeRound { id: string; symbol: 'BTC'; startMs: EpochMs; endMs: EpochMs; openMicro: string | null; closeMicro: string | null; result: Direction | null; raw?: unknown }
export interface PriceFeatures {last_price_usd: number;price_age_ms: number;latest_source_age_ms: number;sample_count_60s: number;observed_returns_bps: Record<string,number|null>;realized_volatility_sample_bps:number;direction_flips_60s:number;last_received_at_ms:EpochMs}
export interface FrozenSnapshot {experiment: 'ARCADE_DECISIONS_V0';version:string;market:string;target:{round_id:string;start_ms:EpochMs;end_ms:EpochMs;open_price_known:false};as_of_received_ms:EpochMs;feature:PriceFeatures;provenance:'JUPITER_LIVE_RECEIPT_ONLY';task:string;unknown:string[]}
export interface Decision {roundId:string;arm:Provider;status:string;pUp:number|null;action:PaperAction;sentMs?:EpochMs;receivedMs?:EpochMs;model?:string;errorCode?:string|null;snapshotHash?:string}
