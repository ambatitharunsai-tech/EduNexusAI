import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';

interface StudentMetricTrendsChartProps {
  metricsTrend: Array<{
    period: string;
    attendance: number;
    score: number;
  }>;
}

export const StudentMetricTrendsChart: React.FC<StudentMetricTrendsChartProps> = ({ metricsTrend }) => {
  return (
    <Card className="border-slate-200">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-bold text-slate-900">
            Student Metric Trajectories Over Time
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Attendance consistency vs evaluation marks progression across semester cycles
          </CardDescription>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
            <span>Attendance %</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block" />
            <span>Assessment Score %</span>
          </span>
          <span className="flex items-center gap-1.5 text-rose-600 font-medium">
            <span className="w-2.5 h-0.5 bg-rose-500 inline-block" />
            <span>80% Min</span>
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={metricsTrend}
              margin={{ top: 10, right: 15, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11, fill: 'var(--chart-axis-labels)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--chart-baseline)' }}
              />
              <YAxis
                domain={[50, 100]}
                tick={{ fontSize: 11, fill: 'var(--chart-axis-labels)' }}
                tickFormatter={(val) => `${val}%`}
                tickLine={false}
                axisLine={{ stroke: 'var(--chart-baseline)' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--chart-tooltip-bg)',
                  borderRadius: 0,
                  border: '1px solid var(--chart-tooltip-border)',
                  color: 'var(--chart-tooltip-text)',
                  boxShadow: 'var(--shadow-modal)',
                  fontSize: '12px',
                }}
                formatter={(val: any, name: any) => [
                  `${Number(val || 0)}%`,
                  name === 'attendance' ? 'Attendance Rate' : 'Evaluation Score',
                ]}
              />
              <ReferenceLine
                y={80}
                stroke="var(--chart-6)"
                strokeDasharray="4 4"
                label={{
                  value: '80% Benchmark',
                  position: 'top',
                  fill: 'var(--chart-6)',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
              <Line
                type="monotone"
                dataKey="attendance"
                name="attendance"
                stroke="var(--chart-1)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: 'var(--chart-1)' }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="score"
                name="score"
                stroke="var(--chart-2)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: 'var(--chart-2)' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
