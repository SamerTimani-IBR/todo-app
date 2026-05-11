// Charts for the admin Overview tab. Themed to match the app, computed from
// the same `transactions` array the rest of the dashboard already has so
// there's no extra DB call.

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend
} from 'recharts';

const STATUS_COLORS = {
  completed: '#16a34a',
  failed: '#dc2626',
  refunded: '#f59e0b'
};

/* ------------------------------------------------------------------
 *  Build a series of the last N days with revenue / count / tokens
 * ------------------------------------------------------------------*/
export function useRevenueSeries(transactions, days = 7) {
  return useMemo(() => {
    const buckets = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      buckets.push({
        date: d,
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        fullLabel: d.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric'
        }),
        revenue: 0,
        count: 0,
        tokens: 0
      });
    }

    transactions.forEach((t) => {
      const ts = new Date(t.createdAt);
      ts.setHours(0, 0, 0, 0);
      const bucket = buckets.find((b) => b.date.getTime() === ts.getTime());
      if (!bucket) return;
      bucket.count += 1;
      if (t.status === 'completed') {
        bucket.revenue += t.amount;
        bucket.tokens += t.tokensAdded;
      }
    });

    return buckets;
  }, [transactions, days]);
}

/* ------------------------------------------------------------------
 *  Status breakdown — completed / failed / refunded
 * ------------------------------------------------------------------*/
export function useStatusBreakdown(transactions) {
  return useMemo(() => {
    const counts = { completed: 0, failed: 0, refunded: 0 };
    transactions.forEach((t) => {
      if (counts[t.status] != null) counts[t.status] += 1;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({
        name: name[0].toUpperCase() + name.slice(1),
        key: name,
        value,
        color: STATUS_COLORS[name]
      }));
  }, [transactions]);
}

/* ------------------------------------------------------------------
 *  Themed tooltip — matches our card surface
 * ------------------------------------------------------------------*/
function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="chart-tooltip">
      {label && <div className="chart-tooltip-label">{label}</div>}
      {payload.map((entry, i) => (
        <div key={i} className="chart-tooltip-row">
          <span
            className="chart-tooltip-dot"
            style={{ background: entry.color || entry.payload?.color }}
          />
          <span className="muted">{entry.name}:</span>
          <strong>{formatter ? formatter(entry.value, entry.name) : entry.value}</strong>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------
 *  Revenue bar chart — last 7 days
 * ------------------------------------------------------------------*/
export function RevenueChart({ data, currency = 'USD' }) {
  const allZero = data.every((d) => d.revenue === 0 && d.count === 0);
  if (allZero) {
    return (
      <div className="chart-empty">
        <p className="muted">No activity in the last 7 days yet.</p>
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data}
        margin={{ top: 10, right: 4, bottom: 0, left: -10 }}
      >
        <defs>
          <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#818cf8" stopOpacity={1} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.7} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(148,163,184,0.18)"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          stroke="var(--muted)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="var(--muted)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `$${v.toFixed(0)}`}
        />
        <Tooltip
          cursor={{ fill: 'rgba(99,102,241,0.08)' }}
          content={
            <ChartTooltip
              formatter={(v, name) =>
                name === 'revenue'
                  ? `${v.toFixed(2)} ${currency}`
                  : v.toLocaleString()
              }
            />
          }
        />
        <Bar
          dataKey="revenue"
          fill="url(#revGradient)"
          radius={[6, 6, 0, 0]}
          maxBarSize={42}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------
 *  Status donut chart
 * ------------------------------------------------------------------*/
export function StatusDonut({ data }) {
  if (data.length === 0) {
    return (
      <div className="chart-empty">
        <p className="muted">No transactions yet.</p>
      </div>
    );
  }
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="donut-wrap">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={58}
            outerRadius={88}
            paddingAngle={2}
            stroke="var(--surface)"
            strokeWidth={2}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            content={
              <ChartTooltip
                formatter={(v, name) => `${v} (${((v / total) * 100).toFixed(0)}%)`}
              />
            }
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: 'var(--text)' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-center">
        <div className="donut-center-value">{total}</div>
        <div className="donut-center-label">total</div>
      </div>
    </div>
  );
}
