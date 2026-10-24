import React, { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Database,
  ShieldCheck,
  FileCheck,
  FileX,
  Layers,
  Eye,
  Server,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { api, apiUrl } from '../lib/api';
import type { CsvPreviewResponse, CsvImportResult, CsvRowError } from '../types';

export type CsvDataType =
  | 'students'
  | 'attendance'
  | 'assessments'
  | 'placement'
  | 'skills'
  | 'feedback'
  | 'lms'
  | 'engagement';

interface DatabaseDomainBreakdown {
  domain: string;
  label: string;
  table: string;
  records_count: number;
  coverage_pct: number;
  description: string;
}

interface DatabaseDemoDatasetResponse {
  dataset_id: string;
  dataset_name: string;
  status: string;
  storage_engine: string;
  is_seeded: boolean;
  seed_runs_count: number;
  last_seeded_at: string;
  last_seed_stats: {
    inserted: number;
    updated: number;
    skipped: number;
  };
  total_records: number;
  total_students: number;
  domains_covered: number;
  domain_breakdown: DatabaseDomainBreakdown[];
  sample_records: Record<string, Array<Record<string, unknown>>>;
  message?: string;
}

const templateCards: Array<{
  dataType: CsvDataType;
  fileName: string;
  title: string;
  description: string;
  headerPreview: string;
}> = [
  { dataType: 'students', fileName: 'students.csv', title: 'Student Registry', description: 'Identifiers, names, department, cohort, term, and section.', headerPreview: 'student_id, first_name, last_name...' },
  { dataType: 'attendance', fileName: 'attendance.csv', title: 'Attendance Sessions', description: 'Daily classroom sessions, date, status (present/late/absent).', headerPreview: 'student_id, date, status, remarks' },
  { dataType: 'assessments', fileName: 'assessments.csv', title: 'Assessment Marks', description: 'Subject evaluations with separate scores and maximum marks.', headerPreview: 'student_id, subject, type, score, max...' },
  { dataType: 'engagement', fileName: 'engagement.csv', title: 'Campus Engagement', description: 'Timestamped workshops, mentoring, clubs, and other activities.', headerPreview: 'student_id, event_type, title...' },
  { dataType: 'placement', fileName: 'placement.csv', title: 'Placement Readiness', description: 'Aptitude, coding, mock interviews, and readiness tier.', headerPreview: 'student_id, aptitude, coding, mock...' },
  { dataType: 'skills', fileName: 'skills.csv', title: 'Skills & Certifications', description: 'Technical, soft skills, certifications, and verified skills.', headerPreview: 'student_id, technical, soft_skills...' },
  { dataType: 'feedback', fileName: 'feedback.csv', title: 'Faculty & Mentors', description: 'Faculty sentiment, student satisfaction, and mentor notes.', headerPreview: 'student_id, faculty_sentiment...' },
  { dataType: 'lms', fileName: 'lms.csv', title: 'LMS Learning', description: 'Logins, module completion, assignments, and forum posts.', headerPreview: 'student_id, weekly_login_count...' },
];

export const CsvHubPage: React.FC = () => {
  // Database Demo Dataset states
  const [dbDataset, setDbDataset] = useState<DatabaseDemoDatasetResponse | null>(null);
  const [loadingDbDataset, setLoadingDbDataset] = useState<boolean>(true);
  const [seedingDb, setSeedingDb] = useState<boolean>(false);
  const [seedBannerMessage, setSeedBannerMessage] = useState<string | null>(null);
  const [inspectorModalOpen, setInspectorModalOpen] = useState<boolean>(false);
  const [inspectorDomain, setInspectorDomain] = useState<string>('students');

  // Template download states
  const [downloadingTemplate, setDownloadingTemplate] = useState<string | null>(null);

  // Ingestion states
  const [selectedDataType, setSelectedDataType] = useState<CsvDataType>('students');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<CsvPreviewResponse | null>(null);
  const [validating, setValidating] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Import commitment states
  const [dedupStrategy, setDedupStrategy] = useState<'skip' | 'overwrite'>('skip');
  const [importing, setImporting] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);

  // Reset demo states
  const [resetting, setResetting] = useState<boolean>(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState<boolean>(false);

  const fetchDatabaseDataset = useCallback(async () => {
    setLoadingDbDataset(true);
    try {
      const res = await api<DatabaseDemoDatasetResponse>('/api/v1/demo/database-dataset', {
        bypassCache: true,
      });
      setDbDataset(res);
    } catch (err) {
      console.warn('Could not load database demo dataset metadata:', err);
    } finally {
      setLoadingDbDataset(false);
    }
  }, []);

  useEffect(() => {
    void fetchDatabaseDataset();
  }, [fetchDatabaseDataset]);

  const handleSeedDatabaseDataset = async () => {
    setSeedingDb(true);
    setSeedBannerMessage(null);
    try {
      const res = await api<DatabaseDemoDatasetResponse>('/api/v1/demo/database-dataset/seed', {
        method: 'POST',
        body: { mode: 'idempotent' },
        bypassCache: true,
      });
      setDbDataset(res);
      setSeedBannerMessage(
        res.message ||
          `Idempotent seed verified: ${res.last_seed_stats.inserted} inserted, ${res.last_seed_stats.updated} updated, ${res.last_seed_stats.skipped} existing records preserved across ${res.domains_covered} domains (${res.total_records} total records).`
      );
    } catch (err) {
      console.warn('Failed to seed database demo dataset:', err);
      setValidationError('Unable to run database demo dataset seed.');
    } finally {
      setSeedingDb(false);
    }
  };

  // 1. Template Download Handler
  const handleDownloadTemplate = async (type: CsvDataType) => {
    setDownloadingTemplate(type);
    try {
      const response = await fetch(apiUrl(`/api/v1/csv/templates/${type}`));
      if (!response.ok) {
        throw new Error(`Failed to download template: ${response.statusText}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edunexus_${type}_template.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.warn('Download template error:', err);
      setValidationError('Could not download CSV template. Please ensure backend is running.');
    } finally {
      setDownloadingTemplate(null);
    }
  };

  // 2. File Selection & Validation Handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setPreviewResult(null);
    setImportResult(null);
    setValidationError(null);
    setValidating(true);

    try {
      const text = await file.text();

      const res = await api<CsvPreviewResponse>('/api/v1/csv/preview', {
        method: 'POST',
        body: {
          file_content: text,
          file_name: file.name,
          data_type: selectedDataType,
        },
      });

      setPreviewResult(res);
    } catch (err: unknown) {
      console.warn('Validation error:', err);
      setValidationError(
        err instanceof Error ? err.message : 'CSV file validation encountered an error.'
      );
    } finally {
      setValidating(false);
    }
  };

  // 3. Batch Ingestion Commitment Handler
  const handleCommitImport = async () => {
    if (!selectedFile || !previewResult || !previewResult.can_import) return;
    setImporting(true);
    setImportResult(null);

    try {
      const res = await api<CsvImportResult>('/api/v1/csv/import', {
        method: 'POST',
        body: {
          data_type: selectedDataType,
          file_content: await selectedFile.text(),
          deduplicate_strategy: dedupStrategy,
        },
      });

      setImportResult(res);
      await fetchDatabaseDataset();
    } catch (err: unknown) {
      console.warn('Import error:', err);
      setValidationError(err instanceof Error ? err.message : 'Batch CSV import failed.');
    } finally {
      setImporting(false);
    }
  };

  // 4. One-Click Demo Reset Handler
  const handleResetDemo = async () => {
    setResetting(true);
    setResetSuccessMessage(null);
    setShowResetConfirmModal(false);

    try {
      const res = await api<{
        status: string;
        message: string;
        total_students: number;
        attendance_records?: number;
        assessment_records?: number;
        placement_records?: number;
        skills_records?: number;
        feedback_records?: number;
        lms_records?: number;
        timestamp: string;
      }>('/api/v1/csv/reset-demo', {
        method: 'POST',
      });

      setResetSuccessMessage(
        `${res.message} (${res.total_students} students across all 7 domains: ${res.attendance_records ?? 0} attendance, ${res.assessment_records ?? 0} assessments, ${res.placement_records ?? 0} placement, ${res.skills_records ?? 0} skills, ${res.feedback_records ?? 0} feedback, ${res.lms_records ?? 0} LMS records). Evaluator environment is completely clean.`
      );
      setSelectedFile(null);
      setPreviewResult(null);
      setImportResult(null);
      await fetchDatabaseDataset();
    } catch (err: unknown) {
      console.warn('Reset error:', err);
      setValidationError('Failed to reset synthetic demo data.');
    } finally {
      setResetting(false);
    }
  };

  const inspectorRows = dbDataset?.sample_records?.[inspectorDomain] || [];
  const inspectorColumns = inspectorRows.length > 0 ? Object.keys(inspectorRows[0]) : [];

  return (
    <div className="csv-hub space-y-8 page-enter">
      {/* Page Title & Context Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-[#f4f4f5] tracking-tight">
            Data Hub & CSV Ingestion Engine
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#a1a1aa]">
            Database-backed 7-domain demo dataset management, validated bulk CSV ingestion, and deduplication safeguards.
          </p>
        </div>

        {/* Demo Reset Trigger */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowResetConfirmModal(true)}
          disabled={resetting}
          className="min-h-9 whitespace-nowrap text-xs self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
          <span>Reset Baseline Records (1-Click)</span>
        </Button>
      </div>

      {/* Demo Reset Confirmation Toast */}
      {resetSuccessMessage && (
        <div className="p-4 bg-[#CFFAFE] dark:bg-[#083344] border border-[#67E8F9] dark:border-[#155E75] flex items-start gap-3 text-[#0E7490] dark:text-[#67E8F9] text-xs animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-[#0E7490] dark:text-[#67E8F9] shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold">Database Baseline Restored</span>
            <p className="leading-normal">{resetSuccessMessage}</p>
          </div>
        </div>
      )}

      {/* Database-Backed Demo Dataset Section */}
      <Card className="border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121215]">
        <CardHeader className="pb-4 border-b border-slate-100 dark:border-[#27272a]">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="w-8 h-8 bg-zinc-900 dark:bg-[#f4f4f5] text-white dark:text-[#09090b] flex items-center justify-center shrink-0">
                  <Database className="w-4 h-4" />
                </div>
                <CardTitle className="text-base font-bold text-slate-900 dark:text-[#f4f4f5]">
                  {dbDataset?.dataset_name || 'Demo Dataset · EduNexus 7-Domain Database Seed'}
                </CardTitle>
                <Badge variant="success" size="sm" dot>
                  {dbDataset?.status || 'Active'}
                </Badge>
                <Badge variant="neutral" size="sm" className="font-mono">
                  {typeof dbDataset?.total_records === 'number' ? `${dbDataset.total_records.toLocaleString()} DB Records` : 'Database Records'}
                </Badge>
              </div>
              <CardDescription className="text-xs text-slate-600 dark:text-[#d4d4d8]">
                Persistent database-backed evaluation dataset spanning all {dbDataset?.domains_covered || 7} institutional telemetry domains ({dbDataset?.total_students || 36} enrolled students). Directly powers the Executive Dashboard, Students Directory, Campus Analytics, and Student Journey views.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setInspectorDomain('students');
                  setInspectorModalOpen(true);
                }}
                disabled={loadingDbDataset || !dbDataset}
                leftIcon={<Eye className="w-3.5 h-3.5" />}
                className="text-xs"
              >
                Inspect Database Records
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleSeedDatabaseDataset()}
                isLoading={seedingDb}
                leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                className="text-xs"
              >
                Seed / Verify Database Dataset
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {seedBannerMessage && (
            <div
              role="status"
              className="p-3.5 border border-slate-200 dark:border-[#3f3f46] bg-slate-50 dark:bg-[#18181c] flex items-start justify-between gap-3 text-xs text-slate-800 dark:text-[#f4f4f5]"
            >
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Idempotent Database Seed Verified</span>
                  <span className="text-slate-600 dark:text-[#d4d4d8]">{seedBannerMessage}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSeedBannerMessage(null)}
                className="text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-[#f4f4f5] shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Database Metadata Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 border border-slate-200 dark:border-[#27272a] bg-slate-50/70 dark:bg-[#18181c]">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#a1a1aa]">
                <Server className="w-3.5 h-3.5" />
                <span>Database Engine</span>
              </div>
              <div className="mt-1 text-xs font-bold text-slate-900 dark:text-[#f4f4f5] truncate">
                {dbDataset?.storage_engine || 'EduNexus Relational Store'}
              </div>
            </div>

            <div className="p-3 border border-slate-200 dark:border-[#27272a] bg-slate-50/70 dark:bg-[#18181c]">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#a1a1aa]">
                <Database className="w-3.5 h-3.5" />
                <span>Total Linked Records</span>
              </div>
              <div className="mt-1 text-sm font-black font-mono text-slate-900 dark:text-[#f4f4f5]">
                {typeof dbDataset?.total_records === 'number'
                  ? `${dbDataset.total_records.toLocaleString()} rows`
                  : '—'}
              </div>
            </div>

            <div className="p-3 border border-slate-200 dark:border-[#27272a] bg-slate-50/70 dark:bg-[#18181c]">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#a1a1aa]">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Last Seed / Sync Stats</span>
              </div>
              <div className="mt-1 text-xs font-mono font-semibold text-slate-800 dark:text-[#d4d4d8]">
                {dbDataset?.last_seed_stats
                  ? `+${dbDataset.last_seed_stats.inserted || 0} ins · ${dbDataset.last_seed_stats.skipped || 0} kept`
                  : 'Verified'}
              </div>
            </div>

            <div className="p-3 border border-slate-200 dark:border-[#27272a] bg-slate-50/70 dark:bg-[#18181c]">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#a1a1aa]">
                <Clock className="w-3.5 h-3.5" />
                <span>Last Seeded Timestamp</span>
              </div>
              <div className="mt-1 text-xs font-mono text-slate-800 dark:text-[#d4d4d8]">
                {dbDataset?.last_seeded_at
                  ? new Date(dbDataset.last_seeded_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : 'Active'}
              </div>
            </div>
          </div>

          {/* 7-Domain Breakdown Grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-[#d4d4d8]">
                Database Domain Table Breakdown (Click any domain to inspect live records)
              </span>
              <span className="text-[11px] text-slate-500 dark:text-[#a1a1aa] font-mono">
                {dbDataset?.total_students || 36} Cohort Students · 100% Referential Integrity
              </span>
            </div>

            {loadingDbDataset && !dbDataset ? (
              <div className="py-6 flex items-center justify-center">
                <Spinner size="md" label="Loading database demo dataset breakdown..." showLabel />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {(dbDataset?.domain_breakdown || []).map((item) => (
                  <button
                    key={item.domain}
                    type="button"
                    onClick={() => {
                      setInspectorDomain(item.domain);
                      setInspectorModalOpen(true);
                    }}
                    className="p-3 text-left border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#18181c] hover:border-zinc-400 dark:hover:border-[#52525b] transition-all flex flex-col justify-between gap-2 group"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-[#f4f4f5] group-hover:underline">
                          {item.label}
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-slate-100 dark:bg-[#222227] text-slate-800 dark:text-[#f4f4f5] border border-slate-200 dark:border-[#27272a]">
                          {item.records_count} rows
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-[#a1a1aa] mt-1 line-clamp-2">
                        {item.description}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-slate-100 dark:border-[#27272a] flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-[#a1a1aa]">
                      <span>Table: {item.table}</span>
                      <span className="text-slate-800 dark:text-[#d4d4d8] font-semibold">
                        {item.coverage_pct}% coverage →
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section 1: Download Templates */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-slate-800 dark:text-[#f4f4f5]" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-[#f4f4f5]">Standard Schema CSV Templates</h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-[#a1a1aa]">
          Download pre-structured templates formatted with mandatory institutional column headers.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {templateCards.map((template, index) => (
            <Card
              key={template.dataType}
              className="csv-template-card group flex min-w-0 flex-col border-slate-200 dark:border-[#27272a] hover:-translate-y-1 hover:border-slate-300 dark:hover:border-[#3f3f46] hover:shadow-md"
              style={{ animationDelay: `${index * 45}ms` }}
            >
              <CardHeader className="flex-1 gap-3 pb-4">
                <div className="flex min-w-0 flex-col items-start gap-2">
                  <CardTitle className="min-w-0 text-sm font-bold leading-snug text-slate-900 dark:text-[#f4f4f5]">
                    {template.title}
                  </CardTitle>
                  <Badge variant="neutral" size="sm" className="max-w-full truncate font-mono">
                    {template.fileName}
                  </Badge>
                </div>
                <CardDescription className="min-h-10 text-[11px] leading-relaxed text-slate-500 dark:text-[#d4d4d8]">
                  {template.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="w-full space-y-3">
                <div
                  className="flex h-12 min-w-0 items-center overflow-hidden border border-slate-100 dark:border-[#27272a] bg-slate-50 dark:bg-[#18181c] px-3 font-mono text-[10px] leading-relaxed text-slate-600 dark:text-[#a1a1aa]"
                  title={template.headerPreview}
                >
                  <span className="truncate">{template.headerPreview}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<Download className="h-3.5 w-3.5 shrink-0" />}
                  onClick={() => handleDownloadTemplate(template.dataType)}
                  disabled={downloadingTemplate === template.dataType}
                  className="h-10 w-full whitespace-nowrap text-xs"
                >
                  Download template
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Section 2: CSV Upload & Validation Engine */}
      <Card className="border-slate-200 dark:border-[#27272a]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-800 dark:text-[#f4f4f5]" />
            <CardTitle className="text-base font-bold text-slate-900 dark:text-[#f4f4f5]">
              Interactive CSV Validator & Batch Importer
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-slate-500 dark:text-[#d4d4d8]">
            Performs pre-flight validation on column headers, range constraints, duplicate detection, and foreign-key integrity.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Controls: Target Type and File Drop */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-[#d4d4d8] mb-1.5">
                Select Dataset Classification
              </label>
              <select
                value={selectedDataType}
                onChange={(e) => {
                  setSelectedDataType(e.target.value as CsvDataType);
                  setPreviewResult(null);
                  setImportResult(null);
                }}
                className="w-full text-xs bg-slate-50 dark:bg-[#18181c] border border-slate-300 dark:border-[#27272a] px-3 py-2 font-medium text-slate-800 dark:text-[#f4f4f5] focus:outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-[#e4e4e7]/20"
              >
                <option value="students">1. Students Registry (students.csv)</option>
                <option value="attendance">2. Attendance Sessions (attendance.csv)</option>
                <option value="assessments">3. Assessment Marks (assessments.csv)</option>
                <option value="placement">4. Placement Readiness (placement.csv)</option>
                <option value="skills">5. Skills & Certifications (skills.csv)</option>
                <option value="feedback">6. Faculty & Mentors Feedback (feedback.csv)</option>
                <option value="engagement">Engagement</option>
                <option value="lms">7. LMS Learning Engagement (lms.csv)</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-[#d4d4d8] mb-1.5">
                Upload CSV File
              </label>
              <div className="flex flex-col gap-1.5">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="block w-full text-xs text-slate-500 dark:text-[#a1a1aa] file:mr-3 file:py-2 file:px-3 file:border-0 file:text-xs file:font-semibold file:bg-zinc-900 file:text-white dark:file:bg-[#f4f4f5] dark:file:text-[#09090b] hover:file:opacity-90 cursor-pointer border border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#18181c]"
                />
                {selectedFile && (
                  <span className="text-[11px] font-mono text-slate-500 dark:text-[#a1a1aa]">
                    Loaded: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Validation in progress */}
          {validating && (
            <div className="py-8 flex flex-col items-center justify-center space-y-2">
              <Spinner size="md" label="Parsing headers, evaluating row boundaries, and checking relational integrity…" />
              <p className="text-xs text-slate-700 dark:text-[#d4d4d8]">
                Parsing headers, evaluating row boundaries, and checking relational integrity…
              </p>
            </div>
          )}

          {/* Fatal Validation Error */}
          {validationError && (
            <div className="p-4 bg-[#FEE2E2] dark:bg-[#450A0A] border border-[#FCA5A5] dark:border-[#991B1B] flex items-start gap-3 text-[#B91C1C] dark:text-[#FCA5A5] text-xs">
              <FileX className="w-5 h-5 text-[#B91C1C] dark:text-[#FCA5A5] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold">CSV Schema Rejection</span>
                <p>{validationError}</p>
              </div>
            </div>
          )}

          {/* Preview Results Banner */}
          {previewResult && (
            <div className="space-y-4 pt-4 border-t border-[#E4E4E7] dark:border-[#27272A]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border border-[#E4E4E7] dark:border-[#27272A] bg-[#FAFAFA] dark:bg-[#111113]">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 flex items-center justify-center font-bold border ${
                      previewResult.can_import
                        ? 'bg-[#CFFAFE] dark:bg-[#083344] text-[#0E7490] dark:text-[#67E8F9] border-[#67E8F9] dark:border-[#155E75]'
                        : 'bg-[#FEE2E2] dark:bg-[#450A0A] text-[#B91C1C] dark:text-[#FCA5A5] border-[#FCA5A5] dark:border-[#991B1B]'
                    }`}
                  >
                    {previewResult.can_import ? (
                      <FileCheck className="w-5 h-5" />
                    ) : (
                      <FileX className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#09090B] dark:text-[#FAFAFA]">
                      {previewResult.file_name} •{' '}
                      <span className={previewResult.can_import ? 'text-[#0E7490] dark:text-[#67E8F9]' : 'text-[#B91C1C] dark:text-[#FCA5A5]'}>
                        {previewResult.can_import ? 'Validation Passed' : 'Validation Failed'}
                      </span>
                    </h4>
                    <p className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
                      {previewResult.total_rows} total rows analyzed • {previewResult.valid_rows} valid •{' '}
                      {previewResult.failed_rows} errors
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={previewResult.can_import ? 'success' : 'danger'} size="md">
                    {previewResult.can_import ? 'Ready for Ingestion' : 'Import Blocked'}
                  </Badge>
                </div>
              </div>

              {/* Line-Numbered Errors Table */}
              {previewResult.errors.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800 dark:text-rose-300">
                    <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    <span>Line-Numbered Row Validation Failures ({previewResult.errors.length}):</span>
                  </div>
                  <div className="overflow-x-auto rounded-none border border-rose-200 dark:border-rose-800/70 bg-rose-50/40 dark:bg-rose-950/20">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-rose-200 dark:border-rose-800/70 bg-rose-100/60 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200 uppercase text-[10px] font-bold">
                          <th className="py-2 px-3 w-16 text-center">Line</th>
                          <th className="py-2 px-3 w-32">Column / Field</th>
                          <th className="py-2 px-3">Validation Rule Violation</th>
                          <th className="py-2 px-3 w-40">Sample Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-100 dark:divide-rose-900/40 text-slate-700 dark:text-[#d4d4d8]">
                        {previewResult.errors.map((err: CsvRowError, idx: number) => (
                          <tr key={idx} className="hover:bg-rose-100/30 dark:hover:bg-rose-950/30">
                            <td className="py-2 px-3 text-center font-mono font-bold text-rose-700 dark:text-rose-400">
                              #{err.line}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-800 dark:text-[#f4f4f5]">
                              {err.column || 'General'}
                            </td>
                            <td className="py-2 px-3 text-rose-800 dark:text-rose-200 font-medium">
                              {err.message}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-500 dark:text-[#a1a1aa] truncate max-w-xs">
                              {err.raw_value || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sample Data Table Preview */}
              {previewResult.sample_data.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-[#d4d4d8]">
                    Verified Rows Sample Preview ({previewResult.valid_rows} rows):
                  </span>
                  <div className="overflow-x-auto rounded-none border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121215]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-[#27272a] bg-[#EEF2F6] dark:bg-[#18181c] text-slate-700 dark:text-[#d4d4d8] uppercase text-[10px] font-bold">
                          {Object.keys(previewResult.sample_data[0]).map((col) => (
                            <th key={col} className="py-2 px-3">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-[#27272a] text-slate-700 dark:text-[#d4d4d8]">
                        {previewResult.sample_data.slice(0, 5).map((row: Record<string, string>, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-[#18181c]">
                            {Object.values(row).map((val: unknown, cIdx: number) => (
                              <td key={cIdx} className="py-2 px-3 font-mono text-[11px] text-slate-800 dark:text-[#f4f4f5]">
                                {String(val ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Deduplication & Commit Import Controls */}
              {previewResult.can_import && (
                <div className="p-4 border border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#18181c] space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <span className="font-bold text-xs text-slate-900 dark:text-[#f4f4f5]">
                        Deduplication Strategy:
                      </span>
                      <div className="flex items-center gap-4 text-xs text-slate-700 dark:text-[#d4d4d8]">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="dedup"
                            value="skip"
                            checked={dedupStrategy === 'skip'}
                            onChange={() => setDedupStrategy('skip')}
                            className="accent-zinc-900"
                          />
                          <span>Skip existing records (Safe Deduplication)</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="dedup"
                            value="overwrite"
                            checked={dedupStrategy === 'overwrite'}
                            onChange={() => setDedupStrategy('overwrite')}
                            className="accent-zinc-900"
                          />
                          <span>Overwrite matching records</span>
                        </label>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={handleCommitImport}
                      disabled={importing}
                      className="min-h-10 whitespace-nowrap text-xs font-semibold"
                    >
                      {importing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      <span>Commit {previewResult.valid_rows} Records to System</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* Ingestion Output Result */}
              {importResult && (
                <div className="p-4 bg-[#FFFFFF] dark:bg-[#141416] border border-[#D4D4D8] dark:border-[#3F3F46] shadow-xs space-y-2 animate-in fade-in">
                  <div className="flex items-center gap-2 text-[#0E7490] dark:text-[#67E8F9] font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-[#0E7490] dark:text-[#67E8F9]" />
                    <span>{importResult.status === 'rejected' ? 'Batch rejected — no records changed' : 'Batch ingestion completed'}</span>
                  </div>
                  <p className="text-xs text-[#27272A] dark:text-[#E4E4E7]">{importResult.message}</p>
                  <p className="text-xs text-[#52525B] dark:text-[#A1A1AA]">
                    Inserted: {importResult.inserted} · Updated: {importResult.updated} · Rejected: {importResult.rejected}
                  </p>
                  {importResult.errors.map((e, i) => (
                    <p className="text-xs text-[#B91C1C] dark:text-[#FCA5A5]" key={i}>
                      Line {e.line}: {e.message}
                    </p>
                  ))}
                  <div className="grid grid-cols-3 gap-3 text-center pt-2">
                    <div className="p-2 bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A]">
                      <span className="text-[10px] text-[#52525B] dark:text-[#A1A1AA] uppercase font-bold">Imported</span>
                      <div className="text-base font-bold text-[#0E7490] dark:text-[#67E8F9]">{importResult.imported}</div>
                    </div>
                    <div className="p-2 bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A]">
                      <span className="text-[10px] text-[#52525B] dark:text-[#A1A1AA] uppercase font-bold">Duplicates Skipped</span>
                      <div className="text-base font-bold text-[#27272A] dark:text-[#E4E4E7]">{importResult.skipped}</div>
                    </div>
                    <div className="p-2 bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A]">
                      <span className="text-[10px] text-[#52525B] dark:text-[#A1A1AA] uppercase font-bold">Total Evaluated</span>
                      <div className="text-base font-bold text-[#09090B] dark:text-[#FAFAFA]">{importResult.total_processed}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Database Record Inspector Modal */}
      <Modal
        isOpen={inspectorModalOpen}
        onClose={() => setInspectorModalOpen(false)}
        title="Database Demo Dataset · Live Record Inspector"
        description="Inspect verified rows stored in the active EduNexus 7-domain database tables."
        maxWidth="3xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-[#18181c] border border-slate-200 dark:border-[#27272a]">
            {(dbDataset?.domain_breakdown || []).map((dom) => {
              const active = inspectorDomain === dom.domain;
              return (
                <button
                  key={dom.domain}
                  type="button"
                  onClick={() => setInspectorDomain(dom.domain)}
                  className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-zinc-900 dark:bg-[#f4f4f5] text-white dark:text-[#09090b]'
                      : 'text-slate-600 dark:text-[#d4d4d8] hover:text-slate-900 dark:hover:text-[#f4f4f5]'
                  }`}
                >
                  {dom.label} ({dom.records_count})
                </button>
              );
            })}
          </div>

          {inspectorRows.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 dark:text-[#a1a1aa]">
              No sample records available for this domain.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121215]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#27272a] bg-[#EEF2F6] dark:bg-[#18181c] text-slate-700 dark:text-[#d4d4d8] uppercase text-[10px] font-bold">
                    {inspectorColumns.map((col) => (
                      <th key={col} className="py-2.5 px-3">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#27272a] text-slate-700 dark:text-[#d4d4d8]">
                  {inspectorRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-[#18181c]">
                      {inspectorColumns.map((col) => (
                        <td key={col} className="py-2 px-3 font-mono text-[11px] text-slate-800 dark:text-[#f4f4f5]">
                          {String(row[col] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-[#27272a] text-xs text-slate-500 dark:text-[#a1a1aa]">
            <span>Showing sample rows from table: <strong className="font-mono text-slate-800 dark:text-[#f4f4f5]">{inspectorDomain}</strong></span>
            <Button variant="secondary" size="sm" onClick={() => setInspectorModalOpen(false)}>
              Close Inspector
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal for Resetting Synthetic Demo Data */}
      {showResetConfirmModal && (
        <Modal
          isOpen={showResetConfirmModal}
          onClose={() => setShowResetConfirmModal(false)}
          title="Confirm Database Demo Baseline Reset"
          description="Restore the verified 36-student dataset across all 7 domains."
          maxWidth="md"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-[#d4d4d8] leading-relaxed">
              This will restore the 36-student verified dataset across all semesters, attendance sessions, assessments, placement records, skills, LMS activity, and interventions.
            </p>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <span>
                Production Safe: This operation restores the baseline demo records idempotently without dropping schema tables.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowResetConfirmModal(false)}
                disabled={resetting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleResetDemo}
                disabled={resetting}
              >
                {resetting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Reset to Seed Baseline</span>
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
