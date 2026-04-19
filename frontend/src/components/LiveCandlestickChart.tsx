import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

import type { Candle, MarketInterval } from "../types/trading";

const UP_COLOR = "#0f766e";
const DOWN_COLOR = "#c2410c";
const SMA_COLOR = "#2563eb";
const EMA_COLOR = "#d97706";

export interface ChartInspection {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sma20: number | null;
  ema50: number | null;
}

interface LiveCandlestickChartProps {
  symbol: string;
  interval: MarketInterval;
  candles: Candle[];
  onLivePrice?: (price: number) => void;
  onInspectChange?: (inspection: ChartInspection) => void;
}

interface IndicatorPoint {
  time: UTCTimestamp;
  sma20: number | null;
  ema50: number | null;
}

function toChartTime(isoValue: string): UTCTimestamp {
  return Math.floor(new Date(isoValue).getTime() / 1000) as UTCTimestamp;
}

function toCandlestickPoint(candle: Candle): CandlestickData {
  return {
    time: toChartTime(candle.open_time),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

function toVolumePoint(candle: Candle): HistogramData {
  return {
    time: toChartTime(candle.open_time),
    value: candle.volume,
    color: candle.close >= candle.open ? "rgba(15, 118, 110, 0.42)" : "rgba(194, 65, 12, 0.38)",
  };
}

function isCryptoSymbol(symbol: string): boolean {
  return !symbol.includes(".");
}

function buildIndicatorPoints(sourceCandles: Candle[]): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  const emaMultiplier = 2 / (50 + 1);
  let emaValue: number | null = null;

  for (let index = 0; index < sourceCandles.length; index += 1) {
    const candle = sourceCandles[index];
    const windowSlice = sourceCandles.slice(Math.max(0, index - 19), index + 1);
    const sma20 = windowSlice.length === 20 ? windowSlice.reduce((sum, item) => sum + item.close, 0) / 20 : null;

    emaValue = emaValue === null ? candle.close : candle.close * emaMultiplier + emaValue * (1 - emaMultiplier);

    points.push({
      time: toChartTime(candle.open_time),
      sma20,
      ema50: index >= 49 ? emaValue : null,
    });
  }

  return points;
}

function buildInspection(sourceCandles: Candle[], indicators: IndicatorPoint[], index: number): ChartInspection | null {
  const candle = sourceCandles[index];
  const indicator = indicators[index];
  if (!candle || !indicator) {
    return null;
  }

  return {
    time: candle.open_time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    sma20: indicator.sma20,
    ema50: indicator.ema50,
  };
}

export function LiveCandlestickChart({ symbol, interval, candles, onLivePrice, onInspectChange }: LiveCandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const smaSeriesRef = useRef<any>(null);
  const emaSeriesRef = useRef<any>(null);
  const candlesRef = useRef<Candle[]>([]);
  const indicatorRef = useRef<IndicatorPoint[]>([]);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const chart = createChart(containerRef.current, {
      autoSize: true,
      height: 470,
      layout: {
        background: { type: ColorType.Solid, color: "rgba(255, 255, 255, 0)" },
        textColor: "#4b5563",
        fontFamily: "IBM Plex Sans, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(23, 32, 51, 0.07)" },
        horzLines: { color: "rgba(23, 32, 51, 0.07)" },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: interval !== "1d" && interval !== "1w",
        secondsVisible: interval === "1m",
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
      borderVisible: false,
      priceLineVisible: true,
      lastValueVisible: true,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const smaSeries = chart.addSeries(LineSeries, {
      color: SMA_COLOR,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const emaSeries = chart.addSeries(LineSeries, {
      color: EMA_COLOR,
      lineWidth: 2,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    candleSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.08,
        bottom: 0.28,
      },
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.78,
        bottom: 0,
      },
    });

    const handleCrosshairMove = (param: any) => {
      if (!param?.time || !param.seriesData || !onInspectChange) {
        const latestInspection = buildInspection(candlesRef.current, indicatorRef.current, candlesRef.current.length - 1);
        if (latestInspection) {
          onInspectChange?.(latestInspection);
        }
        return;
      }

      const candlePoint = param.seriesData.get(candleSeries);
      const volumePoint = param.seriesData.get(volumeSeries);
      const smaPoint = param.seriesData.get(smaSeries);
      const emaPoint = param.seriesData.get(emaSeries);

      if (!candlePoint) {
        return;
      }

      onInspectChange({
        time: new Date((param.time as number) * 1000).toISOString(),
        open: Number(candlePoint.open),
        high: Number(candlePoint.high),
        low: Number(candlePoint.low),
        close: Number(candlePoint.close),
        volume: Number(volumePoint?.value ?? 0),
        sma20: smaPoint?.value !== undefined ? Number(smaPoint.value) : null,
        ema50: emaPoint?.value !== undefined ? Number(emaPoint.value) : null,
      });
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    smaSeriesRef.current = smaSeries;
    emaSeriesRef.current = emaSeries;

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({ width: containerRef.current?.clientWidth ?? 0 });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      smaSeriesRef.current = null;
      emaSeriesRef.current = null;
    };
  }, [interval, onInspectChange]);

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !smaSeriesRef.current || !emaSeriesRef.current || candles.length === 0) {
      return;
    }

    candlesRef.current = candles;
    indicatorRef.current = buildIndicatorPoints(candles);

    candleSeriesRef.current.setData(candles.map(toCandlestickPoint));
    volumeSeriesRef.current.setData(candles.map(toVolumePoint));
    smaSeriesRef.current.setData(
      indicatorRef.current
        .filter((point) => point.sma20 !== null)
        .map((point) => ({ time: point.time, value: Number(point.sma20) })) as LineData[],
    );
    emaSeriesRef.current.setData(
      indicatorRef.current
        .filter((point) => point.ema50 !== null)
        .map((point) => ({ time: point.time, value: Number(point.ema50) })) as LineData[],
    );
    chartRef.current?.timeScale().fitContent();

    const latestInspection = buildInspection(candlesRef.current, indicatorRef.current, candlesRef.current.length - 1);
    if (latestInspection) {
      onInspectChange?.(latestInspection);
    }
  }, [candles, onInspectChange]);

  useEffect(() => {
    if (!isCryptoSymbol(symbol)) {
      return undefined;
    }

    const websocketBaseUrl = import.meta.env.VITE_BINANCE_WS_BASE_URL ?? "wss://data-stream.binance.vision/ws";
    const socket = new WebSocket(`${websocketBaseUrl}/${symbol.toLowerCase()}@kline_${interval}`);

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as {
        k: {
          t: number;
          T: number;
          o: string;
          h: string;
          l: string;
          c: string;
          v: string;
          q: string;
          n: number;
          x: boolean;
        };
      };

      const liveCandle: Candle = {
        open_time: new Date(payload.k.t).toISOString(),
        close_time: new Date(payload.k.T).toISOString(),
        open: Number(payload.k.o),
        high: Number(payload.k.h),
        low: Number(payload.k.l),
        close: Number(payload.k.c),
        volume: Number(payload.k.v),
        quote_volume: Number(payload.k.q),
        trade_count: Number(payload.k.n),
        is_closed: payload.k.x,
      };

      const currentCandles = [...candlesRef.current];
      const existingIndex = currentCandles.findIndex((item) => item.open_time === liveCandle.open_time);
      if (existingIndex >= 0) {
        currentCandles[existingIndex] = liveCandle;
      } else {
        currentCandles.push(liveCandle);
      }

      candlesRef.current = currentCandles.slice(-360);
      indicatorRef.current = buildIndicatorPoints(candlesRef.current);

      candleSeriesRef.current?.update(toCandlestickPoint(liveCandle));
      volumeSeriesRef.current?.update(toVolumePoint(liveCandle));
      smaSeriesRef.current?.setData(
        indicatorRef.current
          .filter((point) => point.sma20 !== null)
          .map((point) => ({ time: point.time, value: Number(point.sma20) })) as LineData[],
      );
      emaSeriesRef.current?.setData(
        indicatorRef.current
          .filter((point) => point.ema50 !== null)
          .map((point) => ({ time: point.time, value: Number(point.ema50) })) as LineData[],
      );

      onLivePrice?.(liveCandle.close);
      const latestInspection = buildInspection(candlesRef.current, indicatorRef.current, candlesRef.current.length - 1);
      if (latestInspection) {
        onInspectChange?.(latestInspection);
      }
    };

    return () => {
      socket.close();
    };
  }, [interval, onInspectChange, onLivePrice, symbol]);

  return <div ref={containerRef} className="h-[470px] w-full" />;
}
