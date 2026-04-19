import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { EquityPoint } from "../types/trading";
import { formatIndianDate } from "../utils/format";

interface EquityCurveChartProps {
  data: EquityPoint[];
}

function formatShortDate(rawDate: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "short",
    year: "2-digit",
  }).format(new Date(rawDate));
}

export function EquityCurveChart({ data }: EquityCurveChartProps) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(23, 32, 51, 0.08)" vertical={false} />
          <XAxis
            dataKey="point_date"
            tickFormatter={formatShortDate}
            tick={{ fill: "#5b6474", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#5b6474", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            domain={["dataMin - 200", "dataMax + 200"]}
          />
          <Tooltip
            formatter={(value: number) => [`$${value.toFixed(2)}`, "Equity"]}
            labelFormatter={(label) => formatIndianDate(label)}
          />
          <Line
            type="monotone"
            dataKey="equity"
            stroke="#0f766e"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 0, fill: "#c77d25" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
