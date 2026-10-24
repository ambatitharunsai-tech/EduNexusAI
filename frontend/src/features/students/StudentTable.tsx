import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  HeartHandshake,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import type { StudentListItem } from '../../types';

interface StudentTableProps {
  students: StudentListItem[];
  onOpenIntervention?: (student: StudentListItem) => void;
}

export const StudentTable: React.FC<StudentTableProps> = ({
  students,
  onOpenIntervention,
}) => {
  const navigate = useNavigate();

  const handleRowKeyDown = (
    event: React.KeyboardEvent<HTMLTableRowElement>,
    studentId: string
  ) => {
    const row = event.currentTarget;
    const tbody = row.parentElement;
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>('tr[tabindex="0"]'));
    const currentIndex = rows.indexOf(row);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, rows.length - 1);
      rows[nextIndex]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prevIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
      rows[prevIndex]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      rows[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      rows[rows.length - 1]?.focus();
    } else if ((event.key === 'Enter' || event.key === ' ') && event.target === row) {
      event.preventDefault();
      navigate(`/journey?student_id=${studentId}`);
    }
  };

  return (
    <div className="bg-white dark:bg-[#121215] rounded-none border border-slate-200 dark:border-[#27272a] overflow-hidden shadow-2xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs" aria-label="Student directory table">
          <thead>
            <tr className="border-b border-slate-200 dark:border-[#27272a] bg-[#EEF2F6] dark:bg-[#18181c] text-slate-700 dark:text-[#d4d4d8] font-semibold uppercase tracking-wider text-[11px]">
              <th scope="col" className="py-3 px-4">Student & ID</th>
              <th scope="col" className="py-3 px-4">Department & Cohort</th>
              <th scope="col" className="py-3 px-4 text-center">Success Score</th>
              <th scope="col" className="py-3 px-4 text-center">Attendance %</th>
              <th scope="col" className="py-3 px-4 text-center">Latest Eval %</th>
              <th scope="col" className="py-3 px-4 text-center">Trajectory Trend</th>
              <th scope="col" className="py-3 px-4">Decoupled Risks</th>
              <th scope="col" className="py-3 px-4">Review Status</th>
              <th scope="col" className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#27272a] text-slate-700 dark:text-[#d4d4d8]">
            {students.map((student) => {
              const acadRiskVariant = {
                insufficient_data: 'neutral',
                critical: 'danger',
                high: 'warning',
                moderate: 'warning',
                medium: 'warning',
                low: 'success',
              }[student.academic_risk_tier || student.risk_tier || 'low'] as 'danger' | 'warning' | 'success';

              const placeRiskVariant = {
                insufficient_data: 'neutral',
                critical: 'danger',
                high: 'warning',
                moderate: 'warning',
                medium: 'warning',
                low: 'success',
              }[student.placement_risk_tier || 'low'] as 'danger' | 'warning' | 'success';

              const trendIcon = {
                improving: <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />,
                declining: <TrendingDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />,
                stable: <Minus className="w-3.5 h-3.5 text-slate-400 dark:text-[#a1a1aa]" />,
              }[student.trend || 'stable'];

              const trendBadgeClass = {
                improving: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
                declining: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
                stable: 'bg-slate-50 dark:bg-[#18181c] text-slate-600 dark:text-[#d4d4d8] border-slate-200 dark:border-[#27272a]',
              }[student.trend || 'stable'];

              const initials = `${student.first_name[0] || ''}${student.last_name[0] || ''}`.toUpperCase();

              const successScoreColor =
                student.success_score === null || student.success_score === undefined
                  ? 'text-slate-400 dark:text-[#a1a1aa] bg-slate-50 dark:bg-[#18181c] border-slate-200 dark:border-[#27272a]'
                  : student.success_score >= 80
                  ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60'
                  : student.success_score >= 65
                  ? 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800/60'
                  : student.success_score >= 50
                  ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60'
                  : 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60';

              return (
                <tr
                  key={student.id}
                  tabIndex={0}
                  aria-label={`${student.first_name} ${student.last_name}, ID ${student.student_id}`}
                  onKeyDown={(e) => handleRowKeyDown(e, student.id)}
                  className="hover:bg-slate-50/75 dark:hover:bg-[#18181c] focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-900 dark:focus-visible:ring-[#e4e4e7] focus-visible:bg-slate-100 dark:focus-visible:bg-[#18181c] transition-colors group"
                >
                  {/* Student Code & Name */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-none bg-slate-100 dark:bg-[#18181c] text-slate-800 dark:text-[#f4f4f5] font-bold flex items-center justify-center shrink-0 border border-slate-200 dark:border-[#27272a] select-none">
                        {initials}
                      </div>
                      <div>
                        <Link
                          to={`/journey?student_id=${student.id}`}
                          className="font-bold text-slate-900 dark:text-[#f4f4f5] group-hover:text-zinc-900 dark:group-hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-[#e4e4e7] focus-visible:ring-offset-1"
                        >
                          {student.first_name} {student.last_name}
                        </Link>
                        <div className="font-mono text-[11px] text-slate-400 dark:text-[#a1a1aa]">
                          {student.student_id}
                        </div>
                        {student.segment_label && (
                          <div className="mt-0.5">
                            <span
                              className={`inline-block px-1.5 py-0.5 text-[9px] font-bold rounded-none ${
                                student.segment_badge_color === 'emerald'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                                  : student.segment_badge_color === 'blue'
                                  ? 'bg-blue-50 dark:bg-sky-950/40 text-blue-700 dark:text-sky-300 border border-blue-200 dark:border-sky-800/60'
                                  : student.segment_badge_color === 'amber'
                                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                                  : student.segment_badge_color === 'rose'
                                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
                                  : 'bg-slate-100 dark:bg-[#18181c] text-slate-700 dark:text-[#d4d4d8] border border-slate-200 dark:border-[#27272a]'
                              }`}
                            >
                              {student.segment_label}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Department & Cohort */}
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-800 dark:text-[#f4f4f5]">
                      {student.department || 'General Academics'}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-[#a1a1aa]">
                      {student.current_grade} • Sec {student.section || 'A'}
                    </div>
                  </td>

                  {/* Student Success Score */}
                  <td className="py-3.5 px-4 text-center">
                    {student.success_score !== null && student.success_score !== undefined ? (
                      <div>
                        <span className={`inline-block px-2 py-0.5 rounded-none text-xs font-bold border ${successScoreColor}`}>
                          {student.success_score.toFixed(1)}/100
                        </span>
                        <div className="text-[10px] text-slate-400 dark:text-[#a1a1aa] capitalize mt-0.5">
                          {student.success_tier || 'active'}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 dark:text-[#a1a1aa] font-medium italic">
                        Insufficient Data
                      </span>
                    )}
                  </td>

                  {/* Attendance Rate */}
                  <td className="py-3.5 px-4 text-center">
                    <div
                      className={`font-bold ${
                        (student.attendance_rate || 0) < 80.0
                          ? 'text-amber-600 dark:text-amber-300'
                          : 'text-emerald-600 dark:text-emerald-300'
                      }`}
                    >
                      {student.attendance_rate != null ? `${student.attendance_rate.toFixed(1)}%` : 'N/A'}
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-[#a1a1aa]">
                      {student.attendance_rate == null ? 'Awaiting records' : student.attendance_rate < 80 ? 'Below benchmark' : 'Benchmark met'}
                    </span>
                  </td>

                  {/* Latest Assessment Score */}
                  <td className="py-3.5 px-4 text-center">
                    <span className="font-bold text-slate-900 dark:text-[#f4f4f5]">
                      {student.latest_assessment_percentage != null
                        ? `${student.latest_assessment_percentage.toFixed(1)}%`
                        : student.average_score == null ? 'N/A' : `${student.average_score.toFixed(1)}%`}
                    </span>
                    <div className="text-[10px] text-slate-400 dark:text-[#a1a1aa]">
                      Avg: {student.average_score == null ? 'N/A' : `${student.average_score.toFixed(1)}%`}
                    </div>
                  </td>

                  {/* Performance Trend */}
                  <td className="py-3.5 px-4 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-none text-[11px] font-semibold border ${trendBadgeClass}`}
                    >
                      {trendIcon}
                      <span className="capitalize">{student.trend || 'stable'}</span>
                    </span>
                  </td>

                  {/* Decoupled Risks: Academic & Placement */}
                  <td className="py-3.5 px-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-medium text-slate-400 dark:text-[#a1a1aa] w-10">Acad:</span>
                        <Badge variant={acadRiskVariant} size="sm">
                          {(student.academic_risk_tier || student.risk_tier || 'low').toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-medium text-slate-400 dark:text-[#a1a1aa] w-10">Place:</span>
                        <Badge variant={placeRiskVariant} size="sm">
                          {(student.placement_risk_tier || 'low').toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  </td>

                  {/* Review Status */}
                  <td className="py-3.5 px-4">
                    <span
                      className={`text-xs font-semibold ${
                        student.review_status === 'Needs Review'
                          ? 'text-amber-600 dark:text-amber-300'
                          : student.review_status === 'Active Support Plan'
                          ? 'text-slate-900 dark:text-[#f4f4f5]'
                          : 'text-slate-600 dark:text-[#d4d4d8]'
                      }`}
                    >
                      {student.review_status || 'On Track'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {onOpenIntervention && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onOpenIntervention(student)}
                          title="Assign Student Support Plan"
                          className="text-slate-700 dark:text-[#d4d4d8] hover:text-slate-900 dark:hover:text-[#f4f4f5] p-1.5 h-auto"
                        >
                          <HeartHandshake className="w-4 h-4" />
                        </Button>
                      )}
                      <Link to={`/journey?student_id=${student.id}`}>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="text-xs px-2.5 flex items-center gap-1"
                        >
                          <span>Journey</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
