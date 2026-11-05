"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate, formatTime } from "@/lib/format";
import { HOUSEHOLD_TIME_ZONE } from "@/lib/time";

export type TrendChartSeries = {
  key: string;
  testName: string;
  unit: string;
  // Oldest first. `time` is epoch ms.
  points: { id: string; time: number; value: number; rangeLow: number | null; rangeHigh: number | null }[];
  // Medication changes inside the series' span; `time` is the household midnight of the change day.
  changes: { time: number; text: string }[];
};

type ChartPoint = TrendChartSeries["points"][number];

const tickFormat = new Intl.DateTimeFormat("en-US", { timeZone: HOUSEHOLD_TIME_ZONE, month: "short", day: "numeric" });
const tickText = (time: number) => tickFormat.format(new Date(time));

const outOfRange = (point: ChartPoint) =>
  (point.rangeLow !== null && point.value < point.rangeLow) || (point.rangeHigh !== null && point.value > point.rangeHigh);

// The band needs both ends. A draw missing either has no band: null leaves a gap rather than inventing a bound.
const bandOf = (point: ChartPoint): [number, number] | null =>
  point.rangeLow !== null && point.rangeHigh !== null ? [point.rangeLow, point.rangeHigh] : null;

function Dot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: ChartPoint }) {
  if (cx === undefined || cy === undefined || !payload) return <g />;
  const bad = outOfRange(payload);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={bad ? 6 : 5}
      fill={bad ? "var(--sw-alert)" : "var(--sw-brand)"}
      stroke="var(--sw-surface)"
      strokeWidth={2}
    />
  );
}

function PointTooltip({ active, payload, unit }: { active?: boolean; payload?: { payload?: ChartPoint }[]; unit: string }) {
  const point = payload?.find((item) => item.payload)?.payload;
  if (!active || !point) return null;
  const instant = new Date(point.time);
  return (
    <div className="sw-card rounded-xl px-3 py-2 text-base">
      <p className="text-muted">
        {formatDate(instant)}, {formatTime(instant)}
      </p>
      <p className="font-semibold" style={outOfRange(point) ? { color: "var(--sw-alert)" } : undefined}>
        {point.value} {unit}
      </p>
    </div>
  );
}

export function TrendChart({ series }: { series: TrendChartSeries }) {
  const { points, changes, unit } = series;
  const first = points[0];
  const last = points[points.length - 1];

  // Tight y-axis around the values and every range end, with a little air.
  const numbers = points.flatMap((p) => [p.value, p.rangeLow, p.rangeHigh]).filter((n): n is number => n !== null);
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const pad = (max - min) * 0.1 || Math.abs(max) * 0.1 || 1;
  // Lab values that are never negative don't get a negative axis.
  const domain: [number, number] = [min >= 0 ? Math.max(0, min - pad) : min - pad, max + pad];

  // Starts early enough to show a change dated the first draw's day (its midnight is before the draw).
  const start = Math.min(first.time, ...changes.map((change) => change.time));
  // Three ticks (first, middle, last) so labels never collide at 390px.
  const ticks = [start, Math.round((start + last.time) / 2), last.time];

  const label = `${series.testName} chart: ${points.length} results, latest ${last.value} ${unit} on ${formatDate(new Date(last.time))}`;

  return (
    <section className="sw-card p-5" aria-label={`${series.testName} trend`}>
      <h2 className="text-2xl font-semibold break-words">
        {series.testName} ({unit})
      </h2>
      <div role="img" aria-label={label} className="mt-3 h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid stroke="var(--sw-border)" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={[start, last.time]}
              ticks={ticks}
              tickFormatter={tickText}
              padding={{ left: 12, right: 12 }}
              tick={{ fill: "var(--sw-muted)", fontSize: 13 }}
              stroke="var(--sw-border)"
            />
            <YAxis
              domain={domain}
              allowDataOverflow
              width={48}
              tickCount={4}
              tickFormatter={(n: number) => String(Math.round(n * 100) / 100)}
              tick={{ fill: "var(--sw-muted)", fontSize: 13 }}
              stroke="var(--sw-border)"
            />
            <Area
              dataKey={bandOf}
              type="linear"
              stroke="none"
              fill="var(--sw-brand)"
              fillOpacity={0.18}
              connectNulls={false}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              legendType="none"
              tooltipType="none"
            />
            {changes.map((change) => (
              <ReferenceLine
                key={`${change.time}-${change.text}`}
                x={change.time}
                stroke="var(--sw-muted)"
                strokeDasharray="4 3"
                ifOverflow="hidden"
              />
            ))}
            <Line
              dataKey="value"
              type="linear"
              stroke="var(--sw-brand)"
              strokeWidth={2.5}
              dot={<Dot />}
              activeDot={<Dot />}
              isAnimationActive={false}
            />
            <Tooltip
              trigger="click"
              content={<PointTooltip unit={unit} />}
              cursor={{ stroke: "var(--sw-muted)", strokeDasharray: "2 2" }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {changes.length > 0 && (
        <div className="mt-3">
          <h3 className="text-base font-semibold">Medication changes (dashed lines)</h3>
          <ul className="mt-1 flex flex-col gap-1 text-base text-muted">
            {changes.map((change) => (
              <li key={`${change.time}-${change.text}`}>{change.text}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
