export type StrategyName = "moving_average" | "rsi" | "momentum";
export type ManualTradeAction = "BUY" | "SELL" | "CLOSE";
export type MarketInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w";
export type OutlookDirection = "bullish" | "neutral" | "bearish";

export interface StrategyDefinition {
  name: StrategyName;
  label: string;
  description: string;
  default_parameters: Record<string, number>;
}

export interface Candle {
  open_time: string;
  close_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quote_volume: number;
  trade_count: number;
  is_closed: boolean;
}

export interface MarketOverview {
  symbol: string;
  display_name?: string | null;
  market: string;
  asset_class: string;
  last_price: number;
  price_change: number;
  price_change_percent: number;
  weighted_avg_price: number;
  high_price: number;
  low_price: number;
  volume: number;
  quote_volume: number;
  bid_price: number;
  ask_price: number;
  open_time: string;
  close_time: string;
  trade_count: number;
}

export interface WatchlistItem {
  symbol: string;
  display_name?: string | null;
  market: string;
  asset_class: string;
  last_price: number;
  price_change_percent: number;
  quote_volume: number;
}

export interface AssetSearchResult {
  symbol: string;
  display_name: string;
  market: string;
  asset_class: string;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBook {
  symbol: string;
  last_update_id: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface RecentTrade {
  id: number;
  price: number;
  quantity: number;
  quote_quantity: number;
  trade_time: string;
  is_buyer_maker: boolean;
}

export interface BacktestMetrics {
  final_equity: number;
  total_return_pct: number;
  win_rate_pct: number;
  max_drawdown_pct: number;
  trade_count: number;
}

export interface EquityPoint {
  point_date: string;
  equity: number;
  cash: number;
  position_value: number;
}

export interface TradeRecord {
  side: string;
  trade_date: string;
  price: number;
  quantity: number;
  pnl?: number | null;
  note?: string | null;
}

export interface BacktestResponse {
  symbol: string;
  strategy: StrategyName;
  strategy_label: string;
  bars_processed: number;
  latest_close: number;
  latest_signal: string;
  metrics: BacktestMetrics;
  trades: TradeRecord[];
  equity_curve: EquityPoint[];
}

export interface OutlookComponent {
  name: string;
  label: string;
  score: number;
  signal: OutlookDirection;
  explanation: string;
}

export interface AssetModelMetrics {
  validation_accuracy_pct: number;
  walk_forward_accuracy_pct: number;
  walk_forward_precision_pct: number;
  average_bullish_return_pct: number;
  training_samples: number;
  walk_forward_windows: number;
}

export interface FeatureImportance {
  feature: string;
  label: string;
  importance_pct: number;
}

export interface PredictionHistoryPoint {
  point_date: string;
  probability_up_pct: number;
  actual_up?: boolean | null;
  realized_return_pct?: number | null;
}

export interface ValidationWindow {
  window_label: string;
  accuracy_pct: number;
  precision_pct: number;
}

export interface AIOutlook {
  model_name: string;
  horizon: string;
  direction: OutlookDirection;
  freshness_status: string;
  generated_at: string;
  confidence_pct: number;
  upside_probability_pct: number;
  metrics: AssetModelMetrics;
  feature_importance: FeatureImportance[];
  prediction_history: PredictionHistoryPoint[];
  validation_windows: ValidationWindow[];
  summary: string;
  components: OutlookComponent[];
  key_drivers: string[];
  risks: string[];
  disclaimer: string;
}

export interface PaperPosition {
  id: number;
  symbol: string;
  strategy_name: string;
  status: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  entry_date: string;
  exit_price?: number | null;
  exit_date?: string | null;
  realized_pnl?: number | null;
  unrealized_pnl: number;
  notes?: string | null;
}

export interface PaperTrade {
  id: number;
  position_id: number;
  symbol: string;
  strategy_name: string;
  side: string;
  quantity: number;
  price: number;
  trade_date: string;
  pnl?: number | null;
  note?: string | null;
  created_at: string;
}

export interface AlertEvent {
  id: number;
  symbol: string;
  strategy_name: string;
  channel: string;
  message: string;
  created_at: string;
}

export interface DashboardResponse {
  market: MarketOverview;
  backtest: BacktestResponse;
  ai_outlook: AIOutlook;
  positions: PaperPosition[];
  trades: PaperTrade[];
  alerts: AlertEvent[];
}

export interface DashboardQuery {
  symbol: string;
  strategy: StrategyName;
  weeks: number;
  initial_cash: number;
  cash_per_trade: number;
}

export interface PaperTradingRequest {
  symbols: string[];
  strategy: StrategyName;
  initial_cash: number;
  cash_per_trade: number;
  quantity?: number;
  ai_entry_threshold_pct?: number;
  lookback_weeks: number;
  parameters?: Record<string, number>;
}

export interface ManualPaperTradeRequest {
  symbol: string;
  strategy: StrategyName;
  action: ManualTradeAction;
  quantity?: number;
  note?: string;
}

export interface ManualPaperTradeResponse {
  action_summary: string;
  position?: PaperPosition | null;
  trade: PaperTrade;
  alerts: AlertEvent[];
}

export interface PaperTradingResponse {
  executed_actions: string[];
  positions: PaperPosition[];
  trades: PaperTrade[];
  alerts: AlertEvent[];
}
