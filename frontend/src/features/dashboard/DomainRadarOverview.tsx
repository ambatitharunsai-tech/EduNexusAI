import React from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Compass } from 'lucide-react';

interface DomainRadarOverviewProps {
  domainAverages?: Record<string, number | null>;
}

export const DomainRadarOverview: React.FC<DomainRadarOverviewProps> = ({ domainAverages }) => {
  if (!domainAverages) return null;

  const data = [
    { subject: 'Academic', score: domainAverages.academic ?? null, fullMark: 100 },
    { subject: 'Attendance', score: domainAverages.attendance ?? null, fullMark: 100 },
    { subject: 'Placement', score: domainAverages.placement ?? null, fullMark: 100 },
    { subject: 'LMS Activity', score: domainAverages.lms ?? null, fullMark: 100 },
    { subject: 'Engagement', score: domainAverages.engagement ?? null, fullMark: 100 },
    { subject: 'Skills', score: domainAverages.skills ?? null, fullMark: 100 },
    { subject: 'Feedback', score: domainAverages.feedback ?? null, fullMark: 100 },
  ];

  return (
    <Card className="border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="p-2 rounded-lg bg-teal-50 text-teal-700 shrink-0">
              <Compass className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold text-slate-900">
                7-Domain Campus Health Fingerprint
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Holistic cohort baseline across academic, behavioral, and career readiness domains
              </CardDescription>
            </div>
          </div>
          <Badge variant="neutral" className="bg-teal-50/50 text-teal-800 border-teal-200 text-xs shrink-0 self-start sm:self-auto">
            Available domain averages
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
              <PolarGrid stroke="var(--chart-grid)" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fill: 'var(--chart-axis-labels)', fontSize: 11, fontWeight: 500 }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 100]}
                tick={{ fill: 'var(--chart-axis-labels)', fontSize: 9 }}
              />
              <Radar
                name="Cohort Average"
                dataKey="score"
                stroke="var(--chart-2)"
                fill="var(--chart-2)"
                fillOpacity={0.35}
              />
              <Tooltip
                formatter={(val: any) => [`${val}%`, 'Cohort Score']}
                contentStyle={{
                  backgroundColor: 'var(--chart-tooltip-bg)',
                  borderRadius: 0,
                  borderColor: 'var(--chart-tooltip-border)',
                  color: 'var(--chart-tooltip-text)',
                  fontSize: '12px',
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Domain Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 pt-3 border-t border-[#E4E4E7] dark:border-[#27272A] text-xs">
          {data.map((item) => (
            <div key={item.subject} className="bg-[#FAFAFA] dark:bg-[#18181B] p-2 rounded-none border border-[#E4E4E7] dark:border-[#27272A]">
              <span className="text-[#52525B] dark:text-[#A1A1AA] block truncate">{item.subject}</span>
              <span className="font-semibold text-[#09090B] dark:text-[#FAFAFA] text-sm">{item.score == null ? 'Not recorded' : `${item.score}%`}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
