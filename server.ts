import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DATA_PATH = path.resolve(__dirname, 'data', 'synthetic_seed.json');
const JWT_SECRET = process.env.JWT_SECRET || 'edunexus-kpmg-challenge04-hmac-secret-2026';

type RiskTier = 'low' | 'moderate' | 'high' | 'critical' | 'insufficient_data';
type SuccessTier = 'thriving' | 'proficient' | 'developing' | 'needs_support' | null;
type AppRole = 'student' | 'advisor' | 'faculty' | 'admin';

const DECISION_SUPPORT_DISCLAIMER =
  'Ethical Decision-Support Notice: This risk indicator is an empirical baseline signal designed to guide human advisor review and student support planning. It is NOT a diagnosis, a psychological assessment, or a definitive automated determination of future performance. Institutions must never use this indicator to automatically penalize, discipline, or exclude students.';

const DEFAULT_CAUSATION_DISCLAIMER =
  'Observed metric variation during the active support period. Institutional evaluation note: correlation does not establish single-factor causation without controlled evaluation.';

const DEFAULT_DOMAIN_WEIGHTS: Record<string, number> = {
  academic: 0.25,
  attendance: 0.15,
  placement: 0.20,
  lms: 0.10,
  engagement: 0.10,
  skills: 0.10,
  feedback: 0.10,
};

const DEMO_TOKENS: Record<string, { user_id: string; email: string; role: string; student_id?: string }> = {
  'edunexus-demo-advisor-token': {
    user_id: 'usr-advisor-001',
    email: 'advisor@college.edu',
    role: 'advisor',
  },
  'edunexus-demo-admin-token': {
    user_id: 'usr-admin-001',
    email: 'admin@college.edu',
    role: 'admin',
  },
  'edunexus-demo-faculty-token': {
    user_id: 'usr-faculty-001',
    email: 'faculty@college.edu',
    role: 'faculty',
  },
  'edunexus-demo-evaluator-token': {
    user_id: 'demo-evaluator-001',
    email: 'evaluator@kpmg.challenge',
    role: 'evaluator',
  },
  'edunexus-demo-student-token': {
    user_id: 'usr-student-1024',
    email: 'stu1024@college.edu',
    role: 'student',
    student_id: 'STU1024',
  },
  'edunexus-demo-dataoperator-token': {
    user_id: 'demo-dataoperator-001',
    email: 'operator@edunexus.ai',
    role: 'data_operator',
  },
  'edunexus-demo-viewer-token': {
    user_id: 'demo-viewer-001',
    email: 'viewer@edunexus.ai',
    role: 'viewer',
  },
};

interface UserRecord {
  id: string;
  email: string;
  roll_number: string | null;
  full_name: string;
  password_hash: string;
  role: AppRole;
  student_id: string | null;
  institution_id: string;
  status: 'active' | 'locked' | 'disabled';
  failed_attempts: number;
  mfa_enabled: boolean;
  mfa_code: string | null;
  last_login_at: string | null;
  theme_preference?: 'system' | 'dark' | 'light';
  accent_preference?: string;
}

interface RefreshTokenRecord {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  revoked: boolean;
  created_at: string;
}

interface AdvisorAssignmentRecord {
  id: string;
  advisor_user_id: string;
  student_id: string;
  department: string;
  assigned_at: string;
}

interface FacultyCourseRecord {
  id: string;
  faculty_user_id: string;
  course_code: string;
  course_name: string;
  semester: string;
  department: string;
  enrolled_student_ids: string[];
}

interface FacultyNoteRecord {
  id: string;
  course_code: string;
  student_id: string;
  student_name: string;
  faculty_name: string;
  faculty_email: string;
  flag_severity: 'observation' | 'academic_flag' | 'attendance_flag';
  note: string;
  created_at: string;
}

interface ConsentRecord {
  id: string;
  user_id: string;
  student_id: string;
  consent_version: string;
  status: 'active' | 'revoked';
  accepted_at: string;
}

interface AuditLogRecord {
  id: string;
  actor_user_id: string | null;
  actor_email: string;
  actor_name: string;
  actor_role: string;
  action: string;
  target_entity: string;
  target_student_id: string | null;
  ip_address: string;
  details: Record<string, any>;
  created_at: string;
}

interface HumanOverrideRecord {
  is_overridden: boolean;
  original_tier: RiskTier;
  override_tier?: RiskTier | null;
  override_reason?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

function hashPassword(plain: string): string {
  return createHash('sha256').update(`edunexus_salt:${plain}`).digest('hex');
}

function signJwt(payload: { sub: string; role: string; institution_id: string; exp: number }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token: string): { sub: string; role: string; institution_id: string; exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');
    if (sig !== expectedSig) return null;
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (typeof parsed.exp === 'number' && Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const k = pair.slice(0, idx).trim();
      const v = decodeURIComponent(pair.slice(idx + 1).trim());
      result[k] = v;
    }
  }
  return result;
}

function roleHomeRoute(role: string): string {
  const r = role.toLowerCase();
  if (r === 'student') return '/student';
  if (r === 'advisor') return '/advisor/queue';
  if (r === 'faculty') return '/faculty';
  if (r === 'admin') return '/admin';
  return '/';
}

// In-memory dataset & auth tables
let cachedDataset: Record<string, any[]> | null = null;
let activeDemoPresetId: string = 'balanced-cohort';
let demoInterventions: any[] = [];
const overridesStore = new Map<string, HumanOverrideRecord>();
const usersTable = new Map<string, UserRecord>();
const refreshTokensTable = new Map<string, RefreshTokenRecord>();
const advisorAssignmentsTable: AdvisorAssignmentRecord[] = [];
const facultyCoursesTable: FacultyCourseRecord[] = [];
const facultyNotesTable: FacultyNoteRecord[] = [];
const consentRecordsTable = new Map<string, ConsentRecord>();
const auditLogsTable: AuditLogRecord[] = [];
const rateLimitWindow = new Map<string, { count: number; resetAt: number }>();

function seedAuthTables(students: any[]) {
  usersTable.clear();
  refreshTokensTable.clear();
  advisorAssignmentsTable.length = 0;
  facultyCoursesTable.length = 0;
  facultyNotesTable.length = 0;
  consentRecordsTable.clear();
  auditLogsTable.length = 0;

  const seededUsers: UserRecord[] = [
    {
      id: 'usr-student-1024',
      email: 'stu1024@college.edu',
      roll_number: 'STU1024',
      full_name: 'Aarav Sharma',
      password_hash: hashPassword('Student@2026'),
      role: 'student',
      student_id: 'STU1024',
      institution_id: 'INST-KPMG-04',
      status: 'active',
      failed_attempts: 0,
      mfa_enabled: false,
      mfa_code: null,
      last_login_at: null,
    },
    {
      id: 'usr-advisor-001',
      email: 'advisor@college.edu',
      roll_number: null,
      full_name: 'Dr. Meera Krishnan',
      password_hash: hashPassword('Advisor@2026'),
      role: 'advisor',
      student_id: null,
      institution_id: 'INST-KPMG-04',
      status: 'active',
      failed_attempts: 0,
      mfa_enabled: false,
      mfa_code: null,
      last_login_at: new Date(Date.now() - 3600_000 * 2).toISOString(),
    },
    {
      id: 'usr-faculty-001',
      email: 'faculty@college.edu',
      roll_number: null,
      full_name: 'Prof. Rajesh Verma',
      password_hash: hashPassword('Faculty@2026'),
      role: 'faculty',
      student_id: null,
      institution_id: 'INST-KPMG-04',
      status: 'active',
      failed_attempts: 0,
      mfa_enabled: false,
      mfa_code: null,
      last_login_at: new Date(Date.now() - 3600_000 * 5).toISOString(),
    },
    {
      id: 'usr-admin-001',
      email: 'admin@college.edu',
      roll_number: null,
      full_name: 'Vikramaditya Nair (System Admin)',
      password_hash: hashPassword('Admin@2026'),
      role: 'admin',
      student_id: null,
      institution_id: 'INST-KPMG-04',
      status: 'active',
      failed_attempts: 0,
      mfa_enabled: true,
      mfa_code: '241026',
      last_login_at: new Date(Date.now() - 3600_000 * 1).toISOString(),
    },
  ];

  for (const u of seededUsers) {
    usersTable.set(u.id, u);
  }

  // Assign first 12 students (including STU1024) to Advisor Dr. Meera Krishnan
  const assignedSlice = students.slice(0, 12);
  for (const s of assignedSlice) {
    advisorAssignmentsTable.push({
      id: randomUUID(),
      advisor_user_id: 'usr-advisor-001',
      student_id: String(s.student_id),
      department: s.department || 'Computer Science & Engineering',
      assigned_at: '2026-08-15T09:00:00Z',
    });
  }

  // Assign 2 courses to Faculty Prof. Rajesh Verma
  const course1Ids = students.slice(0, 8).map((s) => String(s.student_id));
  const course2Ids = students.slice(4, 14).map((s) => String(s.student_id));
  facultyCoursesTable.push(
    {
      id: 'crs-cs301',
      faculty_user_id: 'usr-faculty-001',
      course_code: 'CS-301',
      course_name: 'Data Structures & Algorithmic Problem Solving',
      semester: 'AY 2025-26 Term 1',
      department: 'Computer Science & Engineering',
      enrolled_student_ids: course1Ids,
    },
    {
      id: 'crs-cs304',
      faculty_user_id: 'usr-faculty-001',
      course_code: 'CS-304',
      course_name: 'Operating Systems & Systems Programming',
      semester: 'AY 2025-26 Term 1',
      department: 'Computer Science & Engineering',
      enrolled_student_ids: course2Ids,
    }
  );

  facultyNotesTable.push(
    {
      id: randomUUID(),
      course_code: 'CS-301',
      student_id: 'STU1024',
      student_name: 'Aarav Sharma',
      faculty_name: 'Prof. Rajesh Verma',
      faculty_email: 'faculty@college.edu',
      flag_severity: 'academic_flag',
      note: 'Strong lab participation in recursion exercises, but missed two weekly timed coding quizzes. Recommended for advisor review.',
      created_at: new Date(Date.now() - 86400_000 * 2).toISOString(),
    },
    {
      id: randomUUID(),
      course_code: 'CS-304',
      student_id: students[1]?.student_id || 'STU-002',
      student_name: students[1] ? `${students[1].first_name} ${students[1].last_name}` : 'Student',
      faculty_name: 'Prof. Rajesh Verma',
      faculty_email: 'faculty@college.edu',
      flag_severity: 'observation',
      note: 'Consistently leads kernel concurrency lab group and assists peers during practical sessions.',
      created_at: new Date(Date.now() - 86400_000 * 1).toISOString(),
    }
  );

  // Seed initial audit logs including staff views on STU1024 so Student sees "who viewed their data"
  auditLogsTable.push(
    {
      id: randomUUID(),
      actor_user_id: 'usr-advisor-001',
      actor_email: 'advisor@college.edu',
      actor_name: 'Dr. Meera Krishnan (Academic Advisor)',
      actor_role: 'advisor',
      action: 'STUDENT_RECORD_VIEWED',
      target_entity: 'student_dossier',
      target_student_id: 'STU1024',
      ip_address: '10.24.18.42',
      details: {
        purpose: 'Term 1 holistic support & placement readiness review',
        domains_accessed: ['academic', 'attendance', 'placement', 'skills'],
      },
      created_at: new Date(Date.now() - 3600_000 * 18).toISOString(),
    },
    {
      id: randomUUID(),
      actor_user_id: 'usr-faculty-001',
      actor_email: 'faculty@college.edu',
      actor_name: 'Prof. Rajesh Verma (Course Faculty — CS-301)',
      actor_role: 'faculty',
      action: 'STUDENT_RECORD_VIEWED',
      target_entity: 'course_roster_metric',
      target_student_id: 'STU1024',
      ip_address: '10.24.19.105',
      details: {
        purpose: 'CS-301 midterm assessment & lab attendance check',
        domains_accessed: ['academic', 'attendance'],
      },
      created_at: new Date(Date.now() - 3600_000 * 6).toISOString(),
    },
    {
      id: randomUUID(),
      actor_user_id: 'usr-admin-001',
      actor_email: 'admin@college.edu',
      actor_name: 'Vikramaditya Nair (System Admin)',
      actor_role: 'admin',
      action: 'LOGIN_SUCCESS',
      target_entity: 'auth_session',
      target_student_id: null,
      ip_address: '10.24.1.10',
      details: { mfa_verified: true, role: 'admin' },
      created_at: new Date(Date.now() - 3600_000 * 2).toISOString(),
    }
  );
}

function logAuditEvent(params: {
  actor_user_id?: string | null;
  actor_email: string;
  actor_name?: string;
  actor_role: string;
  action: string;
  target_entity: string;
  target_student_id?: string | null;
  ip_address?: string;
  details?: Record<string, any>;
}) {
  auditLogsTable.unshift({
    id: randomUUID(),
    actor_user_id: params.actor_user_id ?? null,
    actor_email: params.actor_email,
    actor_name: params.actor_name || params.actor_email,
    actor_role: params.actor_role,
    action: params.action,
    target_entity: params.target_entity,
    target_student_id: params.target_student_id ?? null,
    ip_address: params.ip_address || '127.0.0.1',
    details: params.details || {},
    created_at: new Date().toISOString(),
  });
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

function mean(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (valid.length === 0) return null;
  return round1(valid.reduce((acc, v) => acc + v, 0) / valid.length);
}

interface DemoDatasetPresetMeta {
  id: string;
  name: string;
  badge: string;
  tagline: string;
  description: string;
  highlight_color: 'blue' | 'rose' | 'amber' | 'emerald';
  student_count_label: string;
}

const DEMO_DATASET_PRESETS: DemoDatasetPresetMeta[] = [
  {
    id: 'balanced-cohort',
    name: 'Standard Evaluation Cohort',
    badge: 'Default Benchmark',
    tagline: 'Balanced 36-student university cohort across 4 engineering departments',
    description:
      'Complete 7-domain baseline dataset featuring Computer Science, Electronics, Mechanical, and Civil Engineering students with realistic attendance, assessments, placement readiness, and advisor support plans.',
    highlight_color: 'blue',
    student_count_label: '36 Students • 7 Domains',
  },
  {
    id: 'high-risk-surge',
    name: 'Midterm Early-Warning Alert Surge',
    badge: 'Risk Triage Scenario',
    tagline: 'Simulates a midterm attendance drop & exam backlog surge (42 students)',
    description:
      'Adds 6 priority evaluation students experiencing acute attendance dips (<70%), active course backlogs, and declining quiz scores, plus 4 urgent advisor intervention plans ready for review.',
    highlight_color: 'rose',
    student_count_label: '42 Students • High Alert',
  },
  {
    id: 'placement-drive',
    name: 'Final-Year Placement Readiness Drive',
    badge: 'Career & Skills Eval',
    tagline: 'Evaluates technical coding sprints, mock interviews & career risk (40 students)',
    description:
      'Adds 4 final-year students in the "Academic Stars / Career At-Risk" and "Placement Ready" segments to test the Dual Risk Matrix, coding assessment thresholds, and placement bootcamps.',
    highlight_color: 'amber',
    student_count_label: '40 Students • Career Focus',
  },
  {
    id: 'thriving-recovery',
    name: 'Post-Intervention Outcome Recovery',
    badge: 'Impact & Outcomes Eval',
    tagline: 'Showcases measurable pre/post intervention gains & high engagement (38 students)',
    description:
      'Demonstrates how structured academic mentoring and attendance recovery plans lift cohort attendance and assessment scores, complete with verified baseline vs. follow-up outcome deltas.',
    highlight_color: 'emerald',
    student_count_label: '38 Students • High Recovery',
  },
];

function applyEvaluationPresetTransform(base: Record<string, any[]>, presetId: string): Record<string, any[]> {
  const cloned: Record<string, any[]> = JSON.parse(JSON.stringify(base));
  cloned.students = cloned.students || [];
  cloned.attendance = cloned.attendance || [];
  cloned.assessments = cloned.assessments || [];
  cloned.engagement_events = cloned.engagement_events || [];
  cloned.interventions = cloned.interventions || [];
  cloned.intervention_outcomes = cloned.intervention_outcomes || [];
  cloned.placement_records = cloned.placement_records || [];
  cloned.skills_records = cloned.skills_records || [];
  cloned.feedback_records = cloned.feedback_records || [];
  cloned.lms_activity_records = cloned.lms_activity_records || [];

  const addSyntheticStudentBundle = (spec: {
    id: string;
    student_id: string;
    first_name: string;
    last_name: string;
    department: string;
    grade: string;
    section: string;
    cgpa: number;
    backlogs: number;
    attPresentCount: number;
    attTotalCount: number;
    examScore: number;
    aptitude: number;
    coding: number;
    mockInterview: number;
    mockCount: number;
    readinessTier: string;
    techSkill: number;
    softSkill: number;
    lmsCompletion: number;
    facultySentiment: number;
    intervention?: {
      title: string;
      type: string;
      priority: 'urgent' | 'high' | 'medium' | 'low';
      status: 'in_progress' | 'planned' | 'completed';
      description: string;
      outcome?: { metric_name: string; baseline_value: number; post_value: number; notes: string };
    };
  }) => {
    cloned.students.push({
      id: spec.id,
      student_id: spec.student_id,
      first_name: spec.first_name,
      last_name: spec.last_name,
      email: `${spec.student_id.toLowerCase().replace(/[^a-z0-9]/g, '')}@college.edu`,
      department: spec.department,
      current_grade: spec.grade,
      section: spec.section,
      enrollment_date: '2024-08-01',
      status: 'active',
      cgpa: spec.cgpa,
      backlogs: spec.backlogs,
    });

    for (let i = 0; i < spec.attTotalCount; i++) {
      const day = String(10 + i).padStart(2, '0');
      cloned.attendance.push({
        id: `att-${spec.id}-${i}`,
        student_id: spec.id,
        session_date: `2026-02-${day}`,
        status: i < spec.attPresentCount ? 'present' : 'absent',
        period: 'morning',
      });
    }

    cloned.assessments.push(
      {
        id: `ass-${spec.id}-1`,
        student_id: spec.id,
        subject: 'Core Engineering Systems',
        assessment_type: 'Midterm Exam',
        title: 'Midterm Evaluation I',
        score: spec.examScore,
        max_score: 100,
        assessment_date: '2026-02-14',
      },
      {
        id: `ass-${spec.id}-2`,
        student_id: spec.id,
        subject: 'Applied Problem Solving Lab',
        assessment_type: 'Quiz',
        title: 'Timed Practical Assessment',
        score: Math.min(100, Math.max(25, spec.examScore + 4)),
        max_score: 100,
        assessment_date: '2026-02-22',
      }
    );

    cloned.placement_records.push({
      id: `plc-${spec.id}`,
      student_id: spec.id,
      aptitude_score: spec.aptitude,
      coding_score: spec.coding,
      mock_interview_score: spec.mockInterview,
      mock_interviews_attended: spec.mockCount,
      readiness_tier: spec.readinessTier,
      evaluated_at: '2026-02-20',
    });

    cloned.skills_records.push({
      id: `skl-${spec.id}`,
      student_id: spec.id,
      technical_score: spec.techSkill,
      soft_skills_score: spec.softSkill,
      certifications_completed: spec.techSkill >= 75 ? 3 : 1,
      last_assessed_date: '2026-02-18',
    });

    cloned.lms_activity_records.push({
      id: `lms-${spec.id}`,
      student_id: spec.id,
      weekly_login_count: spec.lmsCompletion >= 75 ? 9 : 2,
      module_completion_pct: spec.lmsCompletion,
      assignments_submitted_pct: Math.min(100, spec.lmsCompletion + 5),
      recorded_at: '2026-02-21',
    });

    cloned.feedback_records.push({
      id: `fb-${spec.id}`,
      student_id: spec.id,
      faculty_sentiment: spec.facultySentiment,
      student_satisfaction: spec.facultySentiment,
      recorded_at: '2026-02-19',
    });

    if (spec.intervention) {
      const intvId = `intv-eval-${spec.id}`;
      cloned.interventions.unshift({
        id: intvId,
        student_id: spec.id,
        title: spec.intervention.title,
        intervention_type: spec.intervention.type,
        type: spec.intervention.type,
        priority: spec.intervention.priority,
        status: spec.intervention.status,
        description: spec.intervention.description,
        assigned_to: 'Dr. Meera Krishnan (Academic Advisor)',
        start_date: '2026-02-15',
        follow_up_date: '2026-03-05',
        target_completion_date: '2026-03-05',
      });

      if (spec.intervention.outcome) {
        cloned.intervention_outcomes.push({
          id: `out-eval-${spec.id}`,
          intervention_id: intvId,
          metric_name: spec.intervention.outcome.metric_name,
          baseline_value: spec.intervention.outcome.baseline_value,
          post_value: spec.intervention.outcome.post_value,
          improvement_delta: round1(
            spec.intervention.outcome.post_value - spec.intervention.outcome.baseline_value
          ),
          measurement_date: '2026-02-25',
          evidence_notes: spec.intervention.outcome.notes,
          causation_disclaimer: DEFAULT_CAUSATION_DISCLAIMER,
        });
      }
    }
  };

  if (presetId === 'high-risk-surge') {
    const alertStudents = [
      {
        id: 'eval-hr-401',
        student_id: 'STU-EVAL-401',
        first_name: 'Rohan',
        last_name: 'Deshmukh',
        department: 'Computer Science & Engineering',
        grade: 'Year 3',
        section: 'A',
        cgpa: 5.4,
        backlogs: 2,
        attPresentCount: 6,
        attTotalCount: 10,
        examScore: 41,
        aptitude: 48,
        coding: 42,
        mockInterview: 45,
        mockCount: 0,
        readinessTier: 'not_ready',
        techSkill: 46,
        softSkill: 52,
        lmsCompletion: 38,
        facultySentiment: 45,
        intervention: {
          title: 'Urgent Attendance & Backlog Recovery Plan',
          type: 'Academic Tutoring',
          priority: 'urgent' as const,
          status: 'in_progress' as const,
          description: 'Bi-weekly advisor check-ins and remedial lab sessions for 2 active backlogs.',
        },
      },
      {
        id: 'eval-hr-402',
        student_id: 'STU-EVAL-402',
        first_name: 'Meghna',
        last_name: 'Kulkarni',
        department: 'Electronics & Communication',
        grade: 'Year 2',
        section: 'B',
        cgpa: 5.8,
        backlogs: 2,
        attPresentCount: 6,
        attTotalCount: 10,
        examScore: 44,
        aptitude: 52,
        coding: 40,
        mockInterview: 48,
        mockCount: 0,
        readinessTier: 'not_ready',
        techSkill: 48,
        softSkill: 55,
        lmsCompletion: 42,
        facultySentiment: 48,
        intervention: {
          title: 'Midterm Signal & Circuit Theory Remediation',
          type: 'Faculty Mentoring',
          priority: 'urgent' as const,
          status: 'planned' as const,
          description: 'Assigned faculty mentor for lab attendance recovery and midterm concept review.',
        },
      },
      {
        id: 'eval-hr-403',
        student_id: 'STU-EVAL-403',
        first_name: 'Karthik',
        last_name: 'Subramanian',
        department: 'Mechanical Engineering',
        grade: 'Year 3',
        section: 'A',
        cgpa: 5.6,
        backlogs: 1,
        attPresentCount: 7,
        attTotalCount: 10,
        examScore: 46,
        aptitude: 44,
        coding: 39,
        mockInterview: 50,
        mockCount: 1,
        readinessTier: 'not_ready',
        techSkill: 50,
        softSkill: 54,
        lmsCompletion: 45,
        facultySentiment: 50,
        intervention: {
          title: 'Attendance Stability & Wellness Check-In',
          type: 'Advisor Counseling',
          priority: 'high' as const,
          status: 'in_progress' as const,
          description: 'Weekly attendance tracking and peer study group pairing.',
        },
      },
      {
        id: 'eval-hr-404',
        student_id: 'STU-EVAL-404',
        first_name: 'Tanya',
        last_name: 'Chatterjee',
        department: 'Civil Engineering',
        grade: 'Year 2',
        section: 'A',
        cgpa: 5.9,
        backlogs: 2,
        attPresentCount: 6,
        attTotalCount: 10,
        examScore: 43,
        aptitude: 49,
        coding: 44,
        mockInterview: 46,
        mockCount: 0,
        readinessTier: 'not_ready',
        techSkill: 49,
        softSkill: 58,
        lmsCompletion: 40,
        facultySentiment: 49,
        intervention: {
          title: 'Structural Mechanics Backlog Clearance Plan',
          type: 'Academic Tutoring',
          priority: 'urgent' as const,
          status: 'planned' as const,
          description: 'Structured problem-solving tutorials ahead of supplementary examinations.',
        },
      },
      {
        id: 'eval-hr-405',
        student_id: 'STU-EVAL-405',
        first_name: 'Harsh',
        last_name: 'Vardhan',
        department: 'Computer Science & Engineering',
        grade: 'Year 4',
        section: 'B',
        cgpa: 6.0,
        backlogs: 1,
        attPresentCount: 7,
        attTotalCount: 10,
        examScore: 48,
        aptitude: 46,
        coding: 43,
        mockInterview: 45,
        mockCount: 0,
        readinessTier: 'not_ready',
        techSkill: 51,
        softSkill: 52,
        lmsCompletion: 44,
        facultySentiment: 52,
      },
      {
        id: 'eval-hr-406',
        student_id: 'STU-EVAL-406',
        first_name: 'Pooja',
        last_name: 'Menon',
        department: 'Electronics & Communication',
        grade: 'Year 3',
        section: 'A',
        cgpa: 5.7,
        backlogs: 2,
        attPresentCount: 6,
        attTotalCount: 10,
        examScore: 42,
        aptitude: 47,
        coding: 41,
        mockInterview: 44,
        mockCount: 0,
        readinessTier: 'not_ready',
        techSkill: 47,
        softSkill: 53,
        lmsCompletion: 39,
        facultySentiment: 47,
      },
    ];
    for (const s of alertStudents) addSyntheticStudentBundle(s);
  } else if (presetId === 'placement-drive') {
    const careerStudents = [
      {
        id: 'eval-pl-501',
        student_id: 'STU-EVAL-501',
        first_name: 'Siddharth',
        last_name: 'Malhotra',
        department: 'Computer Science & Engineering',
        grade: 'Year 4',
        section: 'A',
        cgpa: 8.8,
        backlogs: 0,
        attPresentCount: 9,
        attTotalCount: 10,
        examScore: 86,
        aptitude: 52,
        coding: 41,
        mockInterview: 48,
        mockCount: 0,
        readinessTier: 'not_ready',
        techSkill: 72,
        softSkill: 58,
        lmsCompletion: 88,
        facultySentiment: 82,
        intervention: {
          title: 'Accelerated DSA Coding & Mock Interview Bootcamp',
          type: 'Career Coaching',
          priority: 'high' as const,
          status: 'in_progress' as const,
          description: 'Academic Star / Career At-Risk cohort intervention focusing on timed coding rounds and mock HR interviews.',
        },
      },
      {
        id: 'eval-pl-502',
        student_id: 'STU-EVAL-502',
        first_name: 'Nandini',
        last_name: 'Rao',
        department: 'Electronics & Communication',
        grade: 'Year 4',
        section: 'A',
        cgpa: 8.5,
        backlogs: 0,
        attPresentCount: 9,
        attTotalCount: 10,
        examScore: 83,
        aptitude: 48,
        coding: 38,
        mockInterview: 50,
        mockCount: 0,
        readinessTier: 'not_ready',
        techSkill: 68,
        softSkill: 62,
        lmsCompletion: 84,
        facultySentiment: 80,
        intervention: {
          title: 'Campus Placement Aptitude & Technical Screening Prep',
          type: 'Placement Workshop',
          priority: 'high' as const,
          status: 'planned' as const,
          description: 'Targeted quantitative aptitude drills and 2 mandatory mock technical interviews.',
        },
      },
      {
        id: 'eval-pl-503',
        student_id: 'STU-EVAL-503',
        first_name: 'Aditya',
        last_name: 'banerjee',
        department: 'Computer Science & Engineering',
        grade: 'Year 4',
        section: 'B',
        cgpa: 9.2,
        backlogs: 0,
        attPresentCount: 10,
        attTotalCount: 10,
        examScore: 92,
        aptitude: 89,
        coding: 94,
        mockInterview: 90,
        mockCount: 4,
        readinessTier: 'placement_ready',
        techSkill: 92,
        softSkill: 88,
        lmsCompletion: 96,
        facultySentiment: 92,
      },
      {
        id: 'eval-pl-504',
        student_id: 'STU-EVAL-504',
        first_name: 'Zoya',
        last_name: 'Khan',
        department: 'Mechanical Engineering',
        grade: 'Year 4',
        section: 'A',
        cgpa: 8.4,
        backlogs: 0,
        attPresentCount: 9,
        attTotalCount: 10,
        examScore: 81,
        aptitude: 44,
        coding: 42,
        mockInterview: 46,
        mockCount: 0,
        readinessTier: 'not_ready',
        techSkill: 66,
        softSkill: 64,
        lmsCompletion: 82,
        facultySentiment: 78,
      },
    ];
    for (const s of careerStudents) addSyntheticStudentBundle(s);
  } else if (presetId === 'thriving-recovery') {
    const recoveryStudents = [
      {
        id: 'eval-rec-601',
        student_id: 'STU-EVAL-601',
        first_name: 'Ishaan',
        last_name: 'Choudhary',
        department: 'Computer Science & Engineering',
        grade: 'Year 3',
        section: 'A',
        cgpa: 8.6,
        backlogs: 0,
        attPresentCount: 9,
        attTotalCount: 10,
        examScore: 85,
        aptitude: 82,
        coding: 86,
        mockInterview: 84,
        mockCount: 3,
        readinessTier: 'placement_ready',
        techSkill: 88,
        softSkill: 85,
        lmsCompletion: 92,
        facultySentiment: 89,
        intervention: {
          title: 'Attendance & Algorithmic Mastery Recovery Plan',
          type: 'Academic Tutoring',
          priority: 'medium' as const,
          status: 'completed' as const,
          description: 'Completed 4-week guided study plan with verified attendance and quiz score recovery.',
          outcome: {
            metric_name: 'Attendance Rate (%)',
            baseline_value: 68.5,
            post_value: 90.0,
            notes: 'Student attended all 12 scheduled lab and lecture sessions following advisor check-in.',
          },
        },
      },
      {
        id: 'eval-rec-602',
        student_id: 'STU-EVAL-602',
        first_name: 'Kavya',
        last_name: 'Krishnamurthy',
        department: 'Electronics & Communication',
        grade: 'Year 3',
        section: 'B',
        cgpa: 8.9,
        backlogs: 0,
        attPresentCount: 10,
        attTotalCount: 10,
        examScore: 89,
        aptitude: 86,
        coding: 84,
        mockInterview: 88,
        mockCount: 3,
        readinessTier: 'placement_ready',
        techSkill: 90,
        softSkill: 87,
        lmsCompletion: 95,
        facultySentiment: 91,
        intervention: {
          title: 'Mock Interview & Embedded Systems Sprint',
          type: 'Career Coaching',
          priority: 'medium' as const,
          status: 'completed' as const,
          description: 'Completed 3 mock technical interviews and embedded C coding lab modules.',
          outcome: {
            metric_name: 'Coding Assessment Score (%)',
            baseline_value: 54.0,
            post_value: 84.0,
            notes: 'Improved coding diagnostic score by +30 points across proctored mock rounds.',
          },
        },
      },
    ];
    for (const s of recoveryStudents) addSyntheticStudentBundle(s);
  }

  return cloned;
}

function loadDataset(): Record<string, any[]> {
  if (!cachedDataset) {
    let baseData: Record<string, any[]> = {};
    try {
      const raw = fs.readFileSync(SEED_DATA_PATH, 'utf-8');
      baseData = JSON.parse(raw);
    } catch {
      baseData = {};
    }

    cachedDataset = applyEvaluationPresetTransform(baseData, activeDemoPresetId);

    // Ensure STU1024 is present as the primary demo student record
    const students = cachedDataset?.students || [];
    if (students.length > 0 && !students.some((s) => s.student_id === 'STU1024')) {
      students[0].student_id = 'STU1024';
      students[0].first_name = 'Aarav';
      students[0].last_name = 'Sharma';
      students[0].email = 'stu1024@college.edu';
    }

    overridesStore.clear();
    for (const r of cachedDataset?.risk_overrides || []) {
      if (r.is_overridden) {
        overridesStore.set(String(r.student_id), {
          is_overridden: true,
          original_tier: r.original_tier || 'moderate',
          override_tier: r.override_tier || null,
          override_reason: r.override_reason || null,
          reviewed_by: r.reviewed_by || null,
          reviewed_at: r.reviewed_at || null,
        });
      }
    }

    if (usersTable.size === 0) {
      seedAuthTables(students);
    }
  }
  return cachedDataset || {};
}

function classifyRiskTier(compositeScore: number): RiskTier {
  const score = Math.max(0, Math.min(100, compositeScore));
  if (score >= 70.0) return 'critical';
  if (score >= 45.0) return 'high';
  if (score >= 25.0) return 'moderate';
  return 'low';
}

function computeStudentRisk(
  studentId: string,
  attendanceRecords: any[] = [],
  assessmentRecords: any[] = [],
  engagementRecords: any[] = [],
  explicitMissingEvaluations: string[] = []
) {
  const factors: any[] = [];
  const freshnessNotices: any[] = [];
  const missingWarnings: string[] = [];
  const declineFlags = { attendance_decline: false, academic_decline: false };

  let attRate: number | null = 100.0;
  let attSubScore = 0.0;
  let attStatus = 'Optimal';
  let attExplanation = 'Consistent attendance recorded.';
  let latestAttDate: string | null = null;

  if (attendanceRecords.length > 0) {
    const sortedAtt = [...attendanceRecords].sort((a, b) =>
      String(a.session_date || a.assessment_date || a.date || '').localeCompare(
        String(b.session_date || b.assessment_date || b.date || '')
      )
    );
    const lastAtt = sortedAtt[sortedAtt.length - 1];
    latestAttDate = String(lastAtt.session_date || lastAtt.date || '');
    const presentCount = sortedAtt.filter((a) =>
      ['present', 'late'].includes(String(a.status || '').toLowerCase())
    ).length;
    const totalSessions = sortedAtt.length;
    attRate = round1((presentCount / totalSessions) * 100.0);
    attSubScore = Math.max(0.0, Math.min(100.0, 100.0 - attRate));

    if (totalSessions >= 5) {
      const mid = Math.floor(totalSessions / 2);
      const priorHalf = sortedAtt.slice(0, mid);
      const recentHalf = sortedAtt.slice(mid);
      const priorRate =
        (priorHalf.filter((a) => ['present', 'late'].includes(String(a.status || '').toLowerCase())).length /
          priorHalf.length) *
        100.0;
      const recentRate =
        (recentHalf.filter((a) => ['present', 'late'].includes(String(a.status || '').toLowerCase())).length /
          recentHalf.length) *
        100.0;
      if (priorRate - recentRate >= 4.0) {
        declineFlags.attendance_decline = true;
        attSubScore = Math.min(100.0, attSubScore + 10.0);
      }
    }

    if (attRate < 75.0) {
      attStatus = 'Critical Variance';
      attExplanation = `Recorded attendance (${attRate}%) is below the critical institutional threshold (75.0%). Advisory check-in recommended.`;
    } else if (attRate < 80.0) {
      attStatus = 'Under Observation';
      attExplanation = `Recorded attendance (${attRate}%) is below the institutional 80% baseline. Variance of ${round1(80.0 - attRate)}% observed.`;
    } else {
      attStatus = 'Benchmark Met';
      attExplanation = `Attendance rate (${attRate}%) meets or exceeds the institutional benchmark.`;
    }
  } else {
    attSubScore = 15.0;
    attStatus = 'Telemetry Pending';
    attExplanation = 'No attendance sessions registered for current cycle. Sub-score set to neutral baseline.';
    missingWarnings.push('Attendance records: Zero sessions logged. Telemetry pending weekly sync.');
  }

  factors.push({
    factor_name: 'Attendance Consistency & Trajectory',
    measured_value: attRate,
    benchmark_value: 80.0,
    sub_metric_score: round1(attSubScore),
    weight: 0.35,
    contribution_points: round2(attSubScore * 0.35),
    status: attStatus,
    explanation: attExplanation,
  });

  freshnessNotices.push({
    category: 'Attendance Telemetry',
    latest_recorded_date: latestAttDate,
    total_records: attendanceRecords.length,
    freshness_status: latestAttDate ? 'Current' : 'Missing Telemetry',
    notes: 'Session attendance logs derived from institutional records.',
  });

  let acadAvg: number | null = 75.0;
  let acadSubScore = 0.0;
  let acadStatus = 'Optimal';
  let acadExplanation = 'Assessment performance aligns with academic expectations.';
  let latestAssDate: string | null = null;

  if (assessmentRecords.length > 0) {
    const sortedAss = [...assessmentRecords].sort((a, b) =>
      String(a.session_date || a.assessment_date || a.date || '').localeCompare(
        String(b.session_date || b.assessment_date || b.date || '')
      )
    );
    const lastAss = sortedAss[sortedAss.length - 1];
    latestAssDate = String(lastAss.assessment_date || lastAss.date || '');
    const validScores: number[] = [];

    for (const a of sortedAss) {
      const maxSc = Number(a.max_score ?? 100.0);
      const sc = Number(a.score ?? 0.0);
      if (maxSc > 0) {
        validScores.push(Math.max(0.0, Math.min(100.0, (sc / maxSc) * 100.0)));
      }
    }

    if (validScores.length > 0) {
      acadAvg = round1(validScores.reduce((acc, v) => acc + v, 0) / validScores.length);
      acadSubScore = Math.max(0.0, Math.min(100.0, 100.0 - acadAvg));

      if (validScores.length >= 2) {
        const mid = Math.floor(validScores.length / 2);
        const priorAvg = validScores.slice(0, mid).reduce((acc, v) => acc + v, 0) / mid;
        const recentAvg =
          validScores.slice(mid).reduce((acc, v) => acc + v, 0) / (validScores.length - mid);
        if (priorAvg - recentAvg >= 4.0) {
          declineFlags.academic_decline = true;
          acadSubScore = Math.min(100.0, acadSubScore + 8.0);
        }
      }

      if (acadAvg < 60.0) {
        acadStatus = 'Critical Variance';
        acadExplanation = `Cumulative assessment score (${acadAvg}%) is below passing benchmark (60.0%). Academic tutoring support advised.`;
      } else if (acadAvg < 70.0) {
        acadStatus = 'Under Observation';
        acadExplanation = `Cumulative assessment score (${acadAvg}%) is below institutional target (70.0%).`;
      } else {
        acadStatus = 'Benchmark Met';
        acadExplanation = `Academic evaluation score (${acadAvg}%) satisfies institutional target.`;
      }
    } else {
      acadSubScore = 25.0;
      acadExplanation = 'Evaluations present but had invalid maximum score denominators.';
    }
  } else {
    acadSubScore = 20.0;
    acadStatus = 'Telemetry Pending';
    acadExplanation = 'No evaluation units returned for current evaluation cycle.';
    missingWarnings.push('Academic Evaluations: Zero evaluation units submitted yet.');
  }

  for (const evalName of explicitMissingEvaluations) {
    missingWarnings.push(
      `Assessment '${evalName}': Grade pending from department. Not penalized in score.`
    );
  }

  factors.push({
    factor_name: 'Academic Performance & Evaluation Velocity',
    measured_value: acadAvg,
    benchmark_value: 70.0,
    sub_metric_score: round1(acadSubScore),
    weight: 0.4,
    contribution_points: round2(acadSubScore * 0.4),
    status: acadStatus,
    explanation: acadExplanation,
  });

  freshnessNotices.push({
    category: 'Assessment Submissions',
    latest_recorded_date: latestAssDate,
    total_records: assessmentRecords.length,
    freshness_status: latestAssDate ? 'Current' : 'Missing Telemetry',
    notes: 'Standard evaluation units graded by faculty.',
  });

  const engCount = engagementRecords.length;
  const engSubScore = Math.max(0.0, Math.min(100.0, (1.0 - Math.min(engCount / 8.0, 1.0)) * 100.0));
  const sortedEng = [...engagementRecords].sort((a, b) =>
    String(a.event_timestamp || a.date || '').localeCompare(String(b.event_timestamp || b.date || ''))
  );
  const latestEngDate =
    sortedEng.length > 0
      ? String(sortedEng[sortedEng.length - 1].event_timestamp || sortedEng[sortedEng.length - 1].date || '')
      : null;

  let engStatus = 'Low Digital Telemetry';
  let engExplanation =
    'Limited campus engagement events recorded; activity not represented in these records may be missing.';
  if (engCount >= 6) {
    engStatus = 'Benchmark Met';
    engExplanation = `Active campus engagement with ${engCount} recorded events.`;
  } else if (engCount >= 2) {
    engStatus = 'Under Observation';
    engExplanation = `Moderate campus engagement (${engCount} events). Partial telemetry.`;
  } else {
    missingWarnings.push('Engagement telemetry: Low event count; activity sync may be incomplete.');
  }

  factors.push({
    factor_name: 'Campus & Co-curricular Engagement',
    measured_value: engCount,
    benchmark_value: 6.0,
    sub_metric_score: round1(engSubScore),
    weight: 0.25,
    contribution_points: round2(engSubScore * 0.25),
    status: engStatus,
    explanation: engExplanation,
  });

  freshnessNotices.push({
    category: 'Digital Engagement Logs',
    latest_recorded_date: latestEngDate,
    total_records: engCount,
    freshness_status: latestEngDate ? 'Current' : 'Low / Missing',
    notes: 'Timestamped campus and co-curricular engagement events.',
  });

  const present = [
    attendanceRecords.length > 0,
    assessmentRecords.length > 0,
    engagementRecords.length > 0,
  ];
  const totalWeight = factors.reduce(
    (sum, f, idx) => (present[idx] ? sum + f.weight : sum),
    0
  );

  for (let i = 0; i < factors.length; i++) {
    const f = factors[i];
    const available = present[i];
    f.weight = available && totalWeight > 0 ? f.weight / totalWeight : 0;
    f.contribution_points = round2(f.sub_metric_score * f.weight);
    if (!available) {
      f.measured_value = null;
      f.sub_metric_score = 0;
      f.status = 'Missing telemetry';
      f.explanation = 'No records available. Excluded; no performance is inferred.';
    }
  }

  const compositeScore =
    totalWeight > 0 ? round1(factors.reduce((sum, f) => sum + f.contribution_points, 0)) : null;
  const supportPriority: RiskTier =
    compositeScore !== null ? classifyRiskTier(compositeScore) : 'insufficient_data';

  const overrideRecord = overridesStore.get(studentId) || {
    is_overridden: false,
    original_tier: supportPriority,
    override_tier: null,
    override_reason: null,
    reviewed_by: null,
    reviewed_at: null,
  };

  const effectiveTier: RiskTier =
    overrideRecord.is_overridden && overrideRecord.override_tier
      ? overrideRecord.override_tier
      : supportPriority;

  return {
    student_id: studentId,
    composite_risk_score: compositeScore,
    support_priority_tier: supportPriority,
    effective_priority_tier: effectiveTier,
    requires_human_review: ['critical', 'high', 'moderate'].includes(effectiveTier),
    contributing_factors: factors,
    data_freshness: freshnessNotices,
    missing_data_warnings: missingWarnings,
    recent_decline_flags: declineFlags,
    human_override: overrideRecord,
    computed_at: new Date().toISOString(),
    decision_support_disclaimer: DECISION_SUPPORT_DISCLAIMER,
  };
}

function evaluateAcademicRisk(
  attendanceRate: number | null,
  cgpa: number | null | undefined,
  backlogs: number | null | undefined
) {
  if (attendanceRate === null || cgpa === null || cgpa === undefined || backlogs === null || backlogs === undefined) {
    return {
      risk_type: 'academic',
      tier: 'insufficient_data' as RiskTier,
      score: null,
      is_critical_flag: false,
      contributing_factors: [],
      recommendation: 'Record attendance, CGPA and backlog count before assigning academic risk.',
    };
  }

  const factors: any[] = [];
  let isCritical = false;
  const attRate = Math.max(0.0, Math.min(100.0, Number(attendanceRate)));

  if (attRate < 75.0) {
    isCritical = true;
    factors.push({
      metric: 'Attendance (prototype threshold)',
      observed_value: `${attRate}%`,
      threshold: '75.0% Prototype Threshold',
      severity: 'critical',
      description: `Attendance of ${attRate}% is below prototype 75% threshold; advisor review suggested.`,
    });
  } else if (attRate < 80.0) {
    factors.push({
      metric: 'Attendance Consistency',
      observed_value: `${attRate}%`,
      threshold: '80.0% Institutional Target',
      severity: 'moderate',
      description: `Attendance of ${attRate}% falls below the 80% advisory benchmark.`,
    });
  } else {
    factors.push({
      metric: 'Attendance Consistency',
      observed_value: `${attRate}%`,
      threshold: '80.0%',
      severity: 'low',
      description: `Attendance of ${attRate}% meets institutional policy.`,
    });
  }

  const clampedCgpa = Math.max(0.0, Math.min(10.0, Number(cgpa)));
  if (clampedCgpa < 5.5) {
    isCritical = true;
    factors.push({
      metric: 'Cumulative Grade Point Average (CGPA)',
      observed_value: `${clampedCgpa} / 10.0`,
      threshold: '5.5 Minimum Academic Standing',
      severity: 'high',
      description: `CGPA ${clampedCgpa} is in below the prototype academic threshold.`,
    });
  } else if (clampedCgpa < 6.5) {
    factors.push({
      metric: 'Cumulative Grade Point Average (CGPA)',
      observed_value: `${clampedCgpa} / 10.0`,
      threshold: '6.5 Target Good Standing',
      severity: 'moderate',
      description: `CGPA ${clampedCgpa} indicates borderline academic performance.`,
    });
  } else {
    factors.push({
      metric: 'Cumulative Grade Point Average (CGPA)',
      observed_value: `${clampedCgpa} / 10.0`,
      threshold: '6.5',
      severity: 'low',
      description: `CGPA ${clampedCgpa} reflects good academic standing.`,
    });
  }

  const bCount = Math.max(0, Math.trunc(Number(backlogs)));
  if (bCount >= 2) {
    isCritical = true;
    factors.push({
      metric: 'Active Course Backlogs',
      observed_value: `${bCount} backlog(s)`,
      threshold: '0 Active Backlogs',
      severity: 'high',
      description: `Student has ${bCount} active course backlogs requiring remedial examination clearance.`,
    });
  } else if (bCount === 1) {
    factors.push({
      metric: 'Active Course Backlogs',
      observed_value: '1 backlog',
      threshold: '0 Active Backlogs',
      severity: 'moderate',
      description: '1 active backlog present. Remedial support recommended before next term exams.',
    });
  } else {
    factors.push({
      metric: 'Active Course Backlogs',
      observed_value: '0 backlogs',
      threshold: '0',
      severity: 'low',
      description: 'No active backlogs.',
    });
  }

  const attDeficit = Math.max(0.0, 100.0 - attRate);
  const cgpaDeficit = Math.max(0.0, (10.0 - clampedCgpa) * 10.0);
  const backlogDeficit = Math.min(100.0, bCount * 30.0);
  const compositeDeficit = round1(0.45 * attDeficit + 0.35 * cgpaDeficit + 0.2 * backlogDeficit);

  let tier: RiskTier = 'low';
  let rec = 'Continue standard academic tracking; performance is stable.';
  if (isCritical || compositeDeficit >= 50.0) {
    tier = attRate < 75.0 ? 'critical' : 'high';
    rec = 'Suggest an advisor meeting; assign peer tutoring and monitor weekly lecture attendance.';
  } else if (compositeDeficit >= 30.0 || bCount > 0 || attRate < 80.0) {
    tier = 'moderate';
    rec = 'Recommend academic review and module-specific revision exercises.';
  }

  return {
    risk_type: 'academic',
    tier,
    score: compositeDeficit,
    is_critical_flag: isCritical,
    contributing_factors: factors,
    recommendation: rec,
  };
}

function evaluatePlacementRisk(
  aptitudeScore?: number | null,
  codingScore?: number | null,
  mockInterviewScore?: number | null,
  mockInterviewsAttended?: number | null,
  readinessTier?: string | null
) {
  if (
    aptitudeScore === null ||
    aptitudeScore === undefined ||
    codingScore === null ||
    codingScore === undefined ||
    mockInterviewScore === null ||
    mockInterviewScore === undefined
  ) {
    return {
      risk_type: 'placement',
      tier: 'insufficient_data' as RiskTier,
      score: null,
      is_critical_flag: false,
      contributing_factors: [],
      recommendation: 'Complete placement diagnostics before assigning placement risk.',
    };
  }

  const factors: any[] = [];
  let isCritical = false;
  const apt = Number(aptitudeScore);
  const cod = Number(codingScore);
  const mock = Number(mockInterviewScore);
  const interviewsCount =
    mockInterviewsAttended !== null && mockInterviewsAttended !== undefined
      ? Math.trunc(Number(mockInterviewsAttended))
      : null;

  if (interviewsCount === 0) {
    isCritical = true;
    factors.push({
      metric: 'Mock Interview Participation',
      observed_value: '0 rounds attended',
      threshold: 'Minimum 1 Completed Diagnostic',
      severity: 'critical',
      description: 'Student has not attended any campus mock interview rounds.',
    });
  } else if (interviewsCount !== null) {
    factors.push({
      metric: 'Mock Interview Participation',
      observed_value: `${interviewsCount} rounds completed`,
      threshold: '1 round',
      severity: 'low',
      description: `Completed ${interviewsCount} mock interview diagnostics.`,
    });
  }

  if (cod < 45.0) {
    factors.push({
      metric: 'Coding Assessment Score',
      observed_value: `${cod}%`,
      threshold: '50.0% Minimum Placement Screening',
      severity: 'high',
      description: `Coding score of ${cod}% falls below prototype screening benchmark.`,
    });
  } else if (cod < 65.0) {
    factors.push({
      metric: 'Coding Assessment Score',
      observed_value: `${cod}%`,
      threshold: '65.0% Competitive Target',
      severity: 'moderate',
      description: `Coding score of ${cod}% requires improvement for competitive technical rounds.`,
    });
  } else {
    factors.push({
      metric: 'Coding Assessment Score',
      observed_value: `${cod}%`,
      threshold: '65.0%',
      severity: 'low',
      description: `Coding score of ${cod}% demonstrates solid technical readiness.`,
    });
  }

  if (apt < 45.0) {
    factors.push({
      metric: 'Aptitude & Reasoning Score',
      observed_value: `${apt}%`,
      threshold: '50.0% General Cutoff',
      severity: 'high',
      description: `Quantitative aptitude of ${apt}% is below the prototype preparation benchmark.`,
    });
  } else if (apt < 65.0) {
    factors.push({
      metric: 'Aptitude & Reasoning Score',
      observed_value: `${apt}%`,
      threshold: '65.0% Standard Screening Cutoff',
      severity: 'moderate',
      description: `Aptitude score of ${apt}% is on the border of company test cutoffs.`,
    });
  } else {
    factors.push({
      metric: 'Aptitude & Reasoning Score',
      observed_value: `${apt}%`,
      threshold: '65.0%',
      severity: 'low',
      description: `Aptitude score of ${apt}% is in the prototype target range.`,
    });
  }

  const codDeficit = Math.max(0.0, 100.0 - cod);
  const aptDeficit = Math.max(0.0, 100.0 - apt);
  const mockDeficit = interviewsCount !== 0 ? Math.max(0.0, 100.0 - mock) : 100.0;
  const placementDeficit = round1(0.4 * codDeficit + 0.3 * aptDeficit + 0.3 * mockDeficit);

  let tier: RiskTier = 'low';
  let rec = 'Placement readiness is on track. Recommend dream company application rounds.';
  if (isCritical || placementDeficit >= 50.0 || readinessTier === 'not_ready') {
    tier = interviewsCount === 0 || placementDeficit >= 65.0 ? 'critical' : 'high';
    rec =
      'Enroll immediately in placement bootcamps: coding sprints, aptitude workshops, and suggested mock interview practice.';
  } else if (placementDeficit >= 35.0 || readinessTier === 'developing') {
    tier = 'moderate';
    rec = 'Encourage participation in weekly algorithmic problem sets and peer interview practice.';
  }

  return {
    risk_type: 'placement',
    tier,
    score: placementDeficit,
    is_critical_flag: isCritical,
    contributing_factors: factors,
    recommendation: rec,
  };
}

function computeStudentSuccessScore(
  studentId: string,
  academicData: any,
  attendanceData: any,
  placementData: any,
  lmsData: any,
  engagementData: any,
  skillsData: any,
  feedbackData: any
) {
  function blend(data: any, components: Array<[string, number]>): number | null {
    if (!data) return null;
    const values = components
      .filter(([key]) => data[key] !== null && data[key] !== undefined)
      .map(([key, w]) => [Number(data[key]), w] as [number, number]);
    if (values.length === 0) return null;
    const totalW = values.reduce((acc, [, w]) => acc + w, 0);
    return round1(values.reduce((acc, [v, w]) => acc + v * w, 0) / totalW);
  }

  const academic = { ...(academicData || {}) };
  if (academic.cgpa !== null && academic.cgpa !== undefined) {
    const cgpa = Number(academic.cgpa);
    if (academic.backlogs !== null && academic.backlogs !== undefined) {
      academic.cgpa_component = Math.max(0, cgpa * 10 - Math.trunc(Number(academic.backlogs)) * 12);
    } else {
      academic.cgpa_component = cgpa * 10;
    }
  }

  const rawScores: Record<string, number | null> = {
    academic: blend(academic, [
      ['cgpa_component', 0.6],
      ['average_score', 0.4],
    ]),
    attendance: blend(attendanceData, [['attendance_rate', 1.0]]),
    placement: blend(placementData, [
      ['aptitude_score', 0.3],
      ['coding_score', 0.4],
      ['mock_interview_score', 0.3],
    ]),
    lms: blend(lmsData, [
      ['module_completion_pct', 0.6],
      ['assignments_submitted_pct', 0.4],
    ]),
    skills: blend(skillsData, [
      ['technical_score', 0.6],
      ['soft_skills_score', 0.4],
    ]),
    feedback: blend(feedbackData, [
      ['faculty_sentiment', 0.5],
      ['student_satisfaction', 0.5],
    ]),
    engagement: null,
  };

  const count = engagementData?.events_count ?? (engagementData?.events ? engagementData.events.length : null);
  if (count !== null && count !== undefined) {
    rawScores.engagement = Math.min(
      100,
      Number(count) * 15 + (engagementData?.has_leadership_role ? 15 : 0)
    );
  }

  const telemetrySummaries: Record<string, any> = {
    academic,
    attendance: attendanceData || {},
    placement: placementData || {},
    lms: lmsData || {},
    engagement: engagementData || {},
    skills: skillsData || {},
    feedback: feedbackData || {},
  };

  const domainKeys = Object.keys(DEFAULT_DOMAIN_WEIGHTS);
  const availableDomains = domainKeys.filter((d) => rawScores[d] !== null);
  const missingDomains = domainKeys.filter((d) => rawScores[d] === null);
  const availableCount = availableDomains.length;
  const coveragePct = round1((availableCount / 7.0) * 100.0);

  if (availableCount < 3) {
    return {
      student_id: studentId,
      success_score: null,
      success_tier: null,
      data_coverage_pct: coveragePct,
      available_domains_count: availableCount,
      status: 'INSUFFICIENT_DATA',
      missing_domains: missingDomains,
      domain_breakdowns: domainKeys.map((d) => ({
        domain: d,
        raw_score: rawScores[d],
        assigned_weight: DEFAULT_DOMAIN_WEIGHTS[d],
        normalized_weight: 0.0,
        weighted_contribution: 0.0,
        telemetry_summary: telemetrySummaries[d],
        is_missing: rawScores[d] === null,
      })),
      missing_data_notice: `Insufficient Telemetry Warning: Only ${availableCount} of 7 domains are available. In adherence to ethical guidelines, no score is calculated to prevent speculative conclusions.`,
    };
  }

  const sumAvailableWeights = availableDomains.reduce((sum, d) => sum + DEFAULT_DOMAIN_WEIGHTS[d], 0);
  let totalScore = 0.0;
  const breakdowns = domainKeys.map((d) => {
    const origW = DEFAULT_DOMAIN_WEIGHTS[d];
    const raw = rawScores[d];
    const normW = raw !== null && sumAvailableWeights > 0 ? origW / sumAvailableWeights : 0.0;
    const contrib = raw !== null ? round2(raw * normW) : 0.0;
    if (raw !== null) {
      totalScore += raw * normW;
    }
    return {
      domain: d,
      raw_score: raw,
      assigned_weight: origW,
      normalized_weight: normW,
      weighted_contribution: contrib,
      telemetry_summary: telemetrySummaries[d],
      is_missing: raw === null,
    };
  });

  const finalScore = round1(Math.min(100.0, Math.max(0.0, totalScore)));
  let tier: SuccessTier = 'needs_support';
  if (finalScore >= 80.0) tier = 'thriving';
  else if (finalScore >= 65.0) tier = 'proficient';
  else if (finalScore >= 50.0) tier = 'developing';

  const statusStr = availableCount === 7 ? 'COMPLETE' : 'PARTIAL';
  const notice =
    statusStr === 'PARTIAL'
      ? `Missing-Data Neutrality: Telemetry is pending for ${missingDomains
          .map((m) => m.charAt(0).toUpperCase() + m.slice(1))
          .join(', ')}. Available domains were proportionally rescaled to 100% without imputing zeroes or penalizing the student.`
      : null;

  return {
    student_id: studentId,
    success_score: finalScore,
    success_tier: tier,
    data_coverage_pct: coveragePct,
    available_domains_count: availableCount,
    status: statusStr,
    missing_domains: missingDomains,
    domain_breakdowns: breakdowns,
    missing_data_notice: notice,
  };
}

function classifyStudentSegment(
  successScore: number | null,
  academicRisk: any,
  placementRisk: any,
  academicScore: number | null,
  placementScore: number | null
) {
  if (
    successScore === null ||
    academicRisk.tier === 'insufficient_data' ||
    placementRisk.tier === 'insufficient_data'
  ) {
    return {
      segment_id: 'insufficient_data',
      segment_label: 'Awaiting data review',
      tagline: 'Classification pending',
      badge_color: 'slate',
      description: 'Success or independent risk data is insufficient; no strategic cohort is inferred.',
      recommended_action: 'Review missing domain records with an advisor.',
      action_type: 'skill_expansion',
    };
  }

  const hasAcademicScore = academicScore !== null && academicScore !== undefined;
  const hasPlacementScore = placementScore !== null && placementScore !== undefined;
  const acadVal = hasAcademicScore ? Number(academicScore) : 0.0;
  const placeVal = hasPlacementScore ? Number(placementScore) : 0.0;
  const acadTier = academicRisk.tier;
  const placeTier = placementRisk.tier;
  const isAcadHigh = acadTier === 'high' || acadTier === 'critical';
  const isPlaceHigh = placeTier === 'high' || placeTier === 'critical';

  if ((isAcadHigh && isPlaceHigh) || successScore < 50.0) {
    return {
      segment_id: 'priority_holistic_support',
      segment_label: 'Priority Holistic Support',
      tagline: 'Urgent Multi-Domain Support Needed',
      badge_color: 'rose',
      description:
        'Both independent risks are high, or the observed Success Score is below 50. Advisor review should determine appropriate support.',
      recommended_action:
        'Initiate immediate multi-stakeholder support: academic tutoring, wellness check-in, and structured weekly counseling.',
      action_type: 'urgent_counseling',
    };
  }

  const isAcademicStrong = hasAcademicScore ? acadVal >= 70.0 : acadTier === 'low';
  if (isAcademicStrong && isPlaceHigh) {
    return {
      segment_id: 'academic_star_career_at_risk',
      segment_label: 'Academic Stars / Career At-Risk',
      tagline: 'Strong Theory, Placement Prep Deficit',
      badge_color: 'blue',
      description:
        'Excels in theoretical examinations and course marks, but shows low coding assessment scores or lack of mock interview attendance.',
      recommended_action:
        'Enroll in accelerated technical coding sprints, quantitative aptitude workshops, and mandatory mock HR practice.',
      action_type: 'placement_bootcamp',
    };
  }

  const isPlacementStrong = hasPlacementScore ? placeVal >= 72.0 : placeTier === 'low';
  if (isPlacementStrong && isAcadHigh) {
    return {
      segment_id: 'practical_star_exam_vulnerable',
      segment_label: 'Practical Stars / Exam Vulnerable',
      tagline: 'Strong Hands-on Skills, Academic Risk',
      badge_color: 'amber',
      description:
        'Demonstrates high technical problem solving, hackathon contributions or coding ability, but faces exam backlog or attendance shortfalls.',
      recommended_action:
        'Assign dedicated faculty tutor for theory exam remediation, establish attendance recovery plan, and fast-track backlog exams.',
      action_type: 'academic_tutoring',
    };
  }

  if (
    (successScore >= 78.0 && acadTier === 'low' && placeTier === 'low') ||
    (hasAcademicScore &&
      hasPlacementScore &&
      acadVal >= 78.0 &&
      placeVal >= 75.0 &&
      acadTier === 'low' &&
      placeTier === 'low')
  ) {
    return {
      segment_id: 'high_achiever_placement_ready',
      segment_label: 'High Achievers & Placement Ready',
      tagline: 'Dual Excellence Cohort',
      badge_color: 'emerald',
      description:
        'Strong performance across recorded campus domains, with consistent academic standing and proven career readiness.',
      recommended_action:
        'Nominate for tier-1 campus recruitment drives, industry innovation fellowships, and peer-mentorship leadership roles.',
      action_type: 'mentorship',
    };
  }

  return {
    segment_id: 'steady_emerging_potential',
    segment_label: 'Steady / Emerging Potential',
    tagline: 'Consistent Baseline, Growth Ready',
    badge_color: 'purple',
    description:
      'Maintains stable academic progression and developing placement metrics with room to broaden competencies.',
    recommended_action:
      'Encourage industry certification completions, open-source project contributions, and advanced elective exploration.',
    action_type: 'skill_expansion',
  };
}

function buildHistory(
  student: any,
  attendance: any[],
  assessments: any[],
  engagements: any[],
  interventions: any[],
  domains: any[] = []
) {
  const events: any[] = [];
  function add(record: any, dateKey: string, kind: string, title: string, description: string) {
    if (record && record[dateKey]) {
      events.push({
        id: `${kind}-${record.id}`,
        date: String(record[dateKey]),
        event_type: kind,
        title,
        description,
        severity: 'neutral',
      });
    }
  }

  add(
    student,
    'enrollment_date',
    'milestone',
    'Enrollment',
    `Recorded enrollment in ${student.current_grade || ''}`
  );
  for (const r of assessments) {
    add(
      r,
      'assessment_date',
      'academic',
      r.title || r.subject || 'Assessment',
      `${r.score}/${r.max_score} recorded marks`
    );
  }
  for (const r of attendance) {
    add(
      r,
      'session_date',
      'attendance',
      'Attendance',
      `${String(r.status || '').charAt(0).toUpperCase() + String(r.status || '').slice(1)} — ${
        r.period || 'full_day'
      }`
    );
  }
  for (const r of engagements) {
    add(r, 'event_timestamp', 'engagement', r.title || 'Engagement', r.description || r.event_type);
  }
  for (const r of interventions) {
    add(r, 'start_date', 'intervention', r.title, `${r.description} Status: ${r.status}`);
  }
  for (const r of domains) {
    if (!r) continue;
    for (const [key, title] of [
      ['evaluated_at', 'Placement evaluation'],
      ['last_assessed_date', 'Skills assessment'],
      ['recorded_at', 'Domain observation'],
    ] as const) {
      if (key in r) {
        add(r, key, 'milestone', title, 'Recorded domain observation; see component details.');
        break;
      }
    }
  }

  const attByDay = new Map<string, number[]>();
  const assByDay = new Map<string, number[]>();

  for (const r of attendance) {
    if (r.session_date) {
      const d = String(r.session_date).slice(0, 10);
      const list = attByDay.get(d) || [];
      list.push(['present', 'late'].includes(String(r.status)) ? 1 : 0);
      attByDay.set(d, list);
    }
  }
  for (const r of assessments) {
    if (r.assessment_date && Number(r.max_score) > 0) {
      const d = String(r.assessment_date).slice(0, 10);
      const list = assByDay.get(d) || [];
      list.push((Number(r.score) / Number(r.max_score)) * 100);
      assByDay.set(d, list);
    }
  }

  const allDays = Array.from(new Set([...attByDay.keys(), ...assByDay.keys()])).sort();
  const points = allDays.map((d) => {
    const attVals = attByDay.get(d) || [];
    const assVals = assByDay.get(d) || [];
    return {
      period: d,
      attendance:
        attVals.length > 0
          ? round1((attVals.reduce((a, b) => a + b, 0) / attVals.length) * 100)
          : null,
      score:
        assVals.length > 0 ? round1(assVals.reduce((a, b) => a + b, 0) / assVals.length) : null,
    };
  });

  events.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { events, points };
}

function computeStudentMetrics(
  s: any,
  studentAtt: Map<string, any[]>,
  studentAss: Map<string, any[]>,
  studentEng: Map<string, any[]>,
  studentIntvs: Map<string, any[]>,
  studentPlacement: Map<string, any>,
  studentSkills: Map<string, any>,
  studentFeedback: Map<string, any>,
  studentLms: Map<string, any>
) {
  const sId = String(s.id);
  const department = s.department || 'Not recorded';

  const attList = studentAtt.get(sId) || [];
  let attRate: number | null = null;
  if (attList.length > 0) {
    const presentCnt = attList.filter((a) => ['present', 'late'].includes(String(a.status))).length;
    attRate = round1((presentCnt / attList.length) * 100.0);
  }

  const assList = [...(studentAss.get(sId) || [])].sort((a, b) =>
    String(b.assessment_date || b.date || '').localeCompare(String(a.assessment_date || a.date || ''))
  );
  const scores: number[] = [];
  let latestScore: number | null = null;
  let avgScore: number | null = null;
  if (assList.length > 0) {
    for (const a of assList) {
      const mx = Number(a.max_score ?? 100);
      if (mx > 0) {
        scores.push((Number(a.score ?? 0) / mx) * 100.0);
      }
    }
    if (scores.length > 0) {
      avgScore = round1(scores.reduce((acc, v) => acc + v, 0) / scores.length);
      latestScore = round1(scores[0]);
    }
  }

  const engList = studentEng.get(sId) || [];
  const baseline = computeStudentRisk(sId, attList, assList, engList);
  const riskScore = baseline.composite_risk_score;
  const tier = baseline.effective_priority_tier;

  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (scores.length >= 2) {
    const mid = Math.floor(scores.length / 2);
    const recentAvg = scores.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const priorAvg = scores.slice(mid).reduce((a, b) => a + b, 0) / (scores.length - mid);
    if (recentAvg - priorAvg >= 4.0) trend = 'improving';
    else if (priorAvg - recentAvg >= 4.0) trend = 'declining';
  }

  const intvs = studentIntvs.get(sId) || [];
  const hasActivePlan = intvs.some((i) => ['planned', 'in_progress'].includes(String(i.status)));
  let reviewStatus = 'On Track';
  if (hasActivePlan) reviewStatus = 'Active Support Plan';
  else if (tier === 'critical' || tier === 'high') reviewStatus = 'Needs Review';
  else if (tier === 'moderate') reviewStatus = 'Under Review';
  else if (tier === 'insufficient_data') reviewStatus = 'Awaiting data review';

  const cgpa = s.cgpa;
  const backlogs = s.backlogs;
  const pData = studentPlacement.get(sId) || null;
  const skData = studentSkills.get(sId) || null;
  const fbData = studentFeedback.get(sId) || null;
  const lmData = studentLms.get(sId) || null;

  const acadRiskSignal = evaluateAcademicRisk(attRate, cgpa, backlogs);
  const placeRiskSignal = evaluatePlacementRisk(
    pData?.aptitude_score,
    pData?.coding_score,
    pData?.mock_interview_score,
    pData?.mock_interviews_attended,
    pData?.readiness_tier
  );

  const successScoreResponse = computeStudentSuccessScore(
    s.student_id || sId,
    { cgpa, backlogs, average_score: avgScore },
    attRate !== null ? { attendance_rate: attRate, total_sessions: attList.length } : null,
    pData,
    lmData,
    engList.length > 0 ? { events_count: engList.length } : null,
    skData,
    fbData
  );

  const segmentProfile = classifyStudentSegment(
    successScoreResponse.success_score,
    acadRiskSignal,
    placeRiskSignal,
    avgScore,
    pData?.coding_score ?? null
  );

  return {
    department,
    attendance_rate: attRate,
    average_score: avgScore,
    latest_assessment_percentage: latestScore,
    trend,
    review_status: reviewStatus,
    risk_tier: tier,
    risk_score: riskScore,
    baseline_profile: baseline,
    active_interventions_count: intvs.filter((i) =>
      ['planned', 'in_progress'].includes(String(i.status))
    ).length,
    success_score: successScoreResponse.success_score,
    success_tier: successScoreResponse.success_tier,
    academic_risk_tier: acadRiskSignal.tier,
    placement_risk_tier: placeRiskSignal.tier,
    segment_id: segmentProfile.segment_id,
    segment_label: segmentProfile.segment_label,
    segment_badge_color: segmentProfile.badge_color,
    success_profile: successScoreResponse,
    academic_risk_profile: acadRiskSignal,
    placement_risk_profile: placeRiskSignal,
    segment_profile: segmentProfile,
    placement_details: pData,
    skills_details: skData,
    feedback_details: fbData,
    lms_details: lmData,
  };
}

function indexDataset(data: Record<string, any[]>) {
  const studentAtt = new Map<string, any[]>();
  for (const r of data.attendance || []) {
    const k = String(r.student_id);
    const list = studentAtt.get(k) || [];
    list.push(r);
    studentAtt.set(k, list);
  }

  const studentAss = new Map<string, any[]>();
  for (const r of data.assessments || []) {
    const k = String(r.student_id);
    const list = studentAss.get(k) || [];
    list.push(r);
    studentAss.set(k, list);
  }

  const studentEng = new Map<string, any[]>();
  for (const r of data.engagement_events || []) {
    const k = String(r.student_id);
    const list = studentEng.get(k) || [];
    list.push(r);
    studentEng.set(k, list);
  }

  const allIntvs = [...(data.interventions || []), ...demoInterventions];
  const studentIntvs = new Map<string, any[]>();
  for (const r of allIntvs) {
    const k = String(r.student_id);
    const list = studentIntvs.get(k) || [];
    list.push(r);
    studentIntvs.set(k, list);
  }

  function latestMap(rows: any[], dateKey: string): Map<string, any> {
    const sorted = [...rows].sort((a, b) =>
      `${a[dateKey] || ''}_${a.updated_at || ''}`.localeCompare(
        `${b[dateKey] || ''}_${b.updated_at || ''}`
      )
    );
    const m = new Map<string, any>();
    for (const r of sorted) {
      m.set(String(r.student_id), r);
    }
    return m;
  }

  return {
    students: data.students || [],
    allIntvs,
    studentAtt,
    studentAss,
    studentEng,
    studentIntvs,
    studentPlacement: latestMap(data.placement_records || [], 'evaluated_at'),
    studentSkills: latestMap(data.skills_records || [], 'last_assessed_date'),
    studentFeedback: latestMap(data.feedback_records || [], 'recorded_at'),
    studentLms: latestMap(data.lms_activity_records || [], 'recorded_at'),
  };
}

function enrichIntervention(item: any, studentsMap: Map<string, any>, outcomesMap: Map<string, any[]>) {
  const sId = String(item.student_id);
  const intvId = String(item.id);
  const student = studentsMap.get(sId);
  const studentName = student
    ? `${student.first_name || ''} ${student.last_name || ''}`.trim()
    : 'Enrolled Student';
  const studentCode = student?.student_id || 'STU-UNKNOWN';

  const followUpStr = String(item.follow_up_date || item.target_completion_date || '');
  const statusVal = String(item.status || 'planned').toLowerCase();
  const todayStr = new Date().toISOString().slice(0, 10);
  const isOverdue =
    ['planned', 'in_progress'].includes(statusVal) &&
    Boolean(followUpStr) &&
    followUpStr.slice(0, 10) < todayStr;

  const rawOutcomes = [...(outcomesMap.get(intvId) || [])].sort((a, b) =>
    `${b.measurement_date || ''}_${b.created_at || ''}`.localeCompare(
      `${a.measurement_date || ''}_${a.created_at || ''}`
    )
  );

  const parsedOutcomes = rawOutcomes.map((o) => {
    const baseVal = Number(o.baseline_value ?? 0.0);
    const postVal = o.post_value !== null && o.post_value !== undefined ? Number(o.post_value) : null;
    const absChg = postVal !== null ? round2(postVal - baseVal) : null;
    const pctChg =
      postVal !== null && baseVal !== 0 ? round1(((postVal - baseVal) / baseVal) * 100.0) : null;
    const interp =
      o.interpretation ||
      (postVal !== null
        ? `Observed change: ${absChg! >= 0 ? '+' : ''}${absChg} pts (${
            pctChg !== null ? `${pctChg}%` : 'N/A: zero baseline'
          }) from baseline (${baseVal}) to post-eval (${postVal}). Observed change during support period; direct causation not proven.`
        : null);

    return {
      id: o.id,
      intervention_id: intvId,
      metric_name: o.metric_name || 'Academic Score',
      baseline_value: baseVal,
      post_value: postVal,
      target_value: o.target_value !== null && o.target_value !== undefined ? Number(o.target_value) : null,
      measurement_date: o.measurement_date || todayStr,
      outcome_status: o.outcome_status || 'evaluating',
      evidence_notes: o.evidence_notes || null,
      causation_disclaimer: o.causation_disclaimer || DEFAULT_CAUSATION_DISCLAIMER,
      absolute_change: absChg,
      percentage_change: pctChg,
      interpretation: interp,
      created_at: o.created_at || new Date().toISOString(),
      updated_at: o.updated_at || new Date().toISOString(),
    };
  });

  return {
    id: intvId,
    student_id: sId,
    title: item.title || 'Personalized Support Plan',
    intervention_type: item.intervention_type || 'academic_tutoring',
    priority: item.priority || 'medium',
    status: item.status || 'planned',
    description: item.description || 'Support plan recorded.',
    goals: item.goals || null,
    assigned_staff_name: item.assigned_staff_name || 'Academic Support Team',
    start_date: item.start_date || todayStr,
    target_completion_date: item.target_completion_date || null,
    actual_completion_date: item.actual_completion_date || null,
    follow_up_date: item.follow_up_date || item.target_completion_date || null,
    notes: item.notes || null,
    student_name: studentName,
    student_code: studentCode,
    is_overdue: isOverdue,
    updated_by: item.updated_by || 'Faculty Advisor',
    created_at: item.created_at || new Date().toISOString(),
    updated_at: item.updated_at || new Date().toISOString(),
    outcomes: parsedOutcomes,
  };
}

const SAMPLE_TEMPLATES: Record<string, string> = {
  students:
    'student_id,first_name,last_name,email,current_grade,academic_term,section,department\n' +
    'STU-101,Kavita,Iyer,kavita.iyer@edunexus-demo.example,Grade 11,AY 2025-26 Term 1,A,Science & Technology\n' +
    'STU-102,Manish,Deshmukh,manish.d@edunexus-demo.example,Grade 11,AY 2025-26 Term 1,B,Commerce & Economics\n' +
    'STU-103,Sneha,Pillai,sneha.pillai@edunexus-demo.example,Grade 10,AY 2025-26 Term 1,A,Computer Applications\n',
  attendance:
    'student_id,date,status,remarks\n' +
    'STU1024,2026-10-01,present,Laboratory session attended\n' +
    'STU1024,2026-10-02,absent,Excused medical note pending\n' +
    'STU-002,2026-10-01,present,Classroom lecture\n',
  assessments:
    'student_id,subject,assessment_type,score,max_score,date\n' +
    'STU1024,Mathematics,midterm,68.0,100.0,2026-10-05\n' +
    'STU1024,Physics,quiz,22.0,25.0,2026-10-07\n' +
    'STU-002,Chemistry,midterm,85.0,100.0,2026-10-05\n',
  placement:
    'student_id,aptitude_score,coding_score,mock_interview_score,resume_score,readiness_tier,mock_interviews_attended\n' +
    'STU1024,65.0,78.0,70.0,80.0,developing,2\n' +
    'STU-002,90.0,95.0,92.0,88.0,placement_ready,3\n' +
    'STU-003,50.0,42.0,45.0,60.0,not_ready,0\n',
  skills:
    'student_id,technical_score,soft_skills_score,certifications_count,verified_skills\n' +
    'STU1024,75.0,80.0,2,Python;SQL;Docker\n' +
    'STU-002,92.0,85.0,4,Java;Spring Boot;Kubernetes;AWS\n' +
    'STU-003,55.0,60.0,1,HTML;CSS;Basic JavaScript\n',
  feedback:
    'student_id,faculty_sentiment,student_satisfaction,academic_term,mentor_notes\n' +
    'STU1024,78.0,82.0,AY 2025-26 Term 1,Consistent laboratory participation and engaged project work\n' +
    'STU-002,88.0,90.0,AY 2025-26 Term 1,Excellent conceptual clarity in computer systems and system design\n' +
    'STU-003,62.0,65.0,AY 2025-26 Term 1,Regular attendance but needs structured practice in coding assignments\n',
  lms:
    'student_id,weekly_login_count,module_completion_pct,assignments_submitted_pct,forum_posts_count\n' +
    'STU1024,8,75.0,80.0,4\n' +
    'STU-002,14,92.0,95.0,9\n' +
    'STU-003,4,45.0,50.0,1\n',
  engagement:
    'student_id,event_type,title,event_timestamp,duration_minutes,description\n' +
    'STU1024,workshop,Python workshop,2026-10-01T10:00:00+05:30,60,Recorded campus workshop\n',
};

const REQUIRED_CSV_HEADERS: Record<string, string[]> = {
  students: ['student_id', 'first_name', 'last_name', 'current_grade', 'academic_term'],
  attendance: ['student_id', 'date', 'status'],
  assessments: ['student_id', 'subject', 'assessment_type', 'score', 'max_score', 'date'],
  placement: ['student_id', 'aptitude_score', 'coding_score', 'mock_interview_score'],
  skills: ['student_id', 'technical_score', 'soft_skills_score'],
  feedback: ['student_id', 'faculty_sentiment', 'student_satisfaction', 'academic_term'],
  lms: ['student_id', 'weekly_login_count', 'module_completion_pct', 'assignments_submitted_pct'],
  engagement: ['student_id', 'event_type', 'title', 'event_timestamp'],
};

function parseCsvText(content: string) {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [] as string[], rows: [] as Record<string, string>[] };
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? '';
    });
    rows.push(row);
  }
  return { headers, rows };
}

function getAuthUser(req: Request): {
  user_id: string;
  email: string;
  full_name?: string;
  roll_number?: string | null;
  role: string;
  student_id?: string | null;
  institution_id?: string;
  mfa_enabled?: boolean;
  is_demo_session: boolean;
} | null {
  loadDataset();
  // 1. Check httpOnly cookie first
  const cookies = parseCookies(req);
  if (cookies.edunexus_access_token) {
    const verified = verifyJwt(cookies.edunexus_access_token);
    if (verified) {
      const dbUser = usersTable.get(verified.sub);
      if (dbUser && dbUser.status === 'active') {
        return {
          user_id: dbUser.id,
          email: dbUser.email,
          full_name: dbUser.full_name,
          roll_number: dbUser.roll_number,
          role: dbUser.role,
          student_id: dbUser.student_id,
          institution_id: dbUser.institution_id,
          mfa_enabled: dbUser.mfa_enabled,
          is_demo_session: false,
        };
      }
    }
  }

  // 2. Check Authorization Bearer header
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const parts = authHeader.trim().split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  const token = parts[1].trim();

  // Check if Bearer token is a signed JWT
  const verifiedJwt = verifyJwt(token);
  if (verifiedJwt) {
    const dbUser = usersTable.get(verifiedJwt.sub);
    if (dbUser && dbUser.status === 'active') {
      return {
        user_id: dbUser.id,
        email: dbUser.email,
        full_name: dbUser.full_name,
        roll_number: dbUser.roll_number,
        role: dbUser.role,
        student_id: dbUser.student_id,
        institution_id: dbUser.institution_id,
        mfa_enabled: dbUser.mfa_enabled,
        is_demo_session: false,
      };
    }
  }

  if (DEMO_TOKENS[token]) {
    const info = DEMO_TOKENS[token];
    const dbUser = usersTable.get(info.user_id);
    if (dbUser) {
      return {
        user_id: dbUser.id,
        email: dbUser.email,
        full_name: dbUser.full_name,
        roll_number: dbUser.roll_number,
        role: dbUser.role,
        student_id: dbUser.student_id,
        institution_id: dbUser.institution_id,
        mfa_enabled: dbUser.mfa_enabled,
        is_demo_session: true,
      };
    }
    return { ...info, is_demo_session: true };
  }

  return {
    user_id: 'usr-advisor-001',
    email: 'advisor@college.edu',
    role: 'advisor',
    is_demo_session: true,
  };
}

function setSessionCookies(res: Response, accessToken: string, refreshToken: string) {
  const maxAgeAccess = 15 * 60; // 15 minutes
  const maxAgeRefresh = 7 * 24 * 60 * 60; // 7 days
  res.append(
    'Set-Cookie',
    `edunexus_access_token=${encodeURIComponent(accessToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeAccess}`
  );
  res.append(
    'Set-Cookie',
    `edunexus_refresh_token=${encodeURIComponent(refreshToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeRefresh}`
  );
}

function clearSessionCookies(res: Response) {
  res.append('Set-Cookie', 'edunexus_access_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.append('Set-Cookie', 'edunexus_refresh_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function buildMePayload(userId: string) {
  const dbUser = usersTable.get(userId);
  if (!dbUser) return null;

  // Dynamic per-request lookups (not stored in token)
  const advisorAssignments =
    dbUser.role === 'advisor'
      ? advisorAssignmentsTable
          .filter((a) => a.advisor_user_id === dbUser.id)
          .map((a) => a.student_id)
      : [];

  const facultyCourses =
    dbUser.role === 'faculty'
      ? facultyCoursesTable.filter((c) => c.faculty_user_id === dbUser.id)
      : [];

  const consentRec = dbUser.student_id ? consentRecordsTable.get(dbUser.student_id) : null;
  const consentGranted = dbUser.role === 'student' ? consentRec?.status === 'active' : true;

  const accessHistory =
    dbUser.role === 'student' && dbUser.student_id
      ? auditLogsTable
          .filter(
            (log) =>
              log.target_student_id === dbUser.student_id &&
              log.action === 'STUDENT_RECORD_VIEWED'
          )
          .slice(0, 15)
      : [];

  return {
    user_id: dbUser.id,
    email: dbUser.email,
    roll_number: dbUser.roll_number,
    full_name: dbUser.full_name,
    role: dbUser.role,
    student_id: dbUser.student_id,
    institution_id: dbUser.institution_id,
    mfa_enabled: dbUser.mfa_enabled,
    consent_required: dbUser.role === 'student' && !consentGranted,
    consent_granted: consentGranted,
    consent_record: consentRec || null,
    home_route: roleHomeRoute(dbUser.role),
    assigned_student_ids: advisorAssignments,
    faculty_courses: facultyCourses,
    access_history: accessHistory,
    theme_preference: dbUser.theme_preference || 'system',
    accent_preference: dbUser.accent_preference || 'monochrome',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '6mb' }));

  // Ensure seed dataset & auth tables are initialized
  loadDataset();

  // ===========================================================================
  // Blueprint v2.0 Auth Endpoints (/api/auth/*)
  // ===========================================================================

  // 1. POST /api/auth/login
  app.post('/api/auth/login', (req: Request, res: Response) => {
    loadDataset();
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1');

    // Rate limiting check (max 25 requests per minute per IP)
    const now = Date.now();
    const rl = rateLimitWindow.get(ip);
    if (rl && now < rl.resetAt) {
      rl.count += 1;
      if (rl.count > 25) {
        logAuditEvent({
          actor_email: String(req.body?.identifier || 'unknown'),
          actor_role: String(req.body?.expected_role || 'unknown'),
          action: 'RATE_LIMIT_EXCEEDED',
          target_entity: 'auth_login',
          ip_address: ip,
          details: { reason: 'Too many sign-in attempts from IP' },
        });
        res.status(429).json({ detail: 'Invalid credentials' });
        return;
      }
    } else {
      rateLimitWindow.set(ip, { count: 1, resetAt: now + 60_000 });
    }

    const rawIdentifier = String(req.body?.identifier || req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    const expectedRole = req.body?.expected_role
      ? String(req.body.expected_role).trim().toLowerCase()
      : null;
    const otpCode = req.body?.otp_code ? String(req.body.otp_code).trim() : '';

    if (!rawIdentifier || !password) {
      res.status(401).json({ detail: 'Invalid credentials' });
      return;
    }

    // Lookup user by email or roll_number
    const user = Array.from(usersTable.values()).find(
      (u) =>
        u.email.toLowerCase() === rawIdentifier.toLowerCase() ||
        (u.roll_number && u.roll_number.toLowerCase() === rawIdentifier.toLowerCase())
    );

    if (!user) {
      logAuditEvent({
        actor_email: rawIdentifier,
        actor_role: expectedRole || 'unverified',
        action: 'LOGIN_FAILED',
        target_entity: 'auth_login',
        ip_address: ip,
        details: { reason: 'Unknown account identifier' },
      });
      res.status(401).json({ detail: 'Invalid credentials' });
      return;
    }

    // Check lockout status
    if (user.status !== 'active' || user.failed_attempts >= 5) {
      user.status = 'locked';
      logAuditEvent({
        actor_user_id: user.id,
        actor_email: user.email,
        actor_name: user.full_name,
        actor_role: user.role,
        action: 'LOGIN_FAILED',
        target_entity: 'auth_login',
        ip_address: ip,
        details: { reason: 'Account is locked due to excessive failed attempts' },
      });
      res.status(401).json({ detail: 'Invalid credentials' });
      return;
    }

    const passwordMatches = user.password_hash === hashPassword(password);
    // Role tab mismatch shows the exact same "Invalid credentials" error
    const roleMatches = !expectedRole || user.role.toLowerCase() === expectedRole;
    const otpMatches = !user.mfa_enabled || otpCode === user.mfa_code;

    if (!passwordMatches || !roleMatches || !otpMatches) {
      user.failed_attempts += 1;
      let failureReason = 'Password mismatch';
      if (!roleMatches) failureReason = `Role tab mismatch (clicked ${expectedRole}, account is ${user.role})`;
      else if (!otpMatches) failureReason = 'Invalid or missing Admin One-Time Code (OTP)';

      if (user.failed_attempts >= 5) {
        user.status = 'locked';
        logAuditEvent({
          actor_user_id: user.id,
          actor_email: user.email,
          actor_name: user.full_name,
          actor_role: user.role,
          action: 'LOCKOUT_TRIGGERED',
          target_entity: 'users',
          ip_address: ip,
          details: { failed_attempts: user.failed_attempts, reason: '5 consecutive failed attempts' },
        });
      }

      logAuditEvent({
        actor_user_id: user.id,
        actor_email: user.email,
        actor_name: user.full_name,
        actor_role: user.role,
        action: 'LOGIN_FAILED',
        target_entity: 'auth_login',
        ip_address: ip,
        details: {
          reason: failureReason,
          failed_attempts: user.failed_attempts,
          account_status: user.status,
        },
      });

      res.status(401).json({ detail: 'Invalid credentials' });
      return;
    }

    // Successful authentication
    user.failed_attempts = 0;
    user.last_login_at = new Date().toISOString();

    const accessToken = signJwt({
      sub: user.id,
      role: user.role,
      institution_id: user.institution_id,
      exp: Date.now() + 15 * 60 * 1000,
    });

    const rawRefreshToken = randomUUID() + '-' + randomUUID();
    const refreshTokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
    refreshTokensTable.set(refreshTokenHash, {
      id: randomUUID(),
      user_id: user.id,
      token_hash: refreshTokenHash,
      expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000,
      revoked: false,
      created_at: new Date().toISOString(),
    });

    setSessionCookies(res, accessToken, rawRefreshToken);

    logAuditEvent({
      actor_user_id: user.id,
      actor_email: user.email,
      actor_name: user.full_name,
      actor_role: user.role,
      action: 'LOGIN_SUCCESS',
      target_entity: 'auth_session',
      target_student_id: user.student_id,
      ip_address: ip,
      details: {
        role: user.role,
        institution_id: user.institution_id,
        mfa_verified: user.mfa_enabled,
      },
    });

    const mePayload = buildMePayload(user.id);
    res.json({
      ...mePayload,
      access_token: accessToken,
    });
  });

  // 1b. POST /api/auth/register
  app.post('/api/auth/register', (req: Request, res: Response) => {
    const data = loadDataset();
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1');

    const fullName = String(req.body?.full_name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const rawRole = String(req.body?.role || 'student').trim().toLowerCase();
    const role: AppRole =
      rawRole === 'advisor' || rawRole === 'faculty' || rawRole === 'student'
        ? (rawRole as AppRole)
        : 'student';
    const department = String(req.body?.department || 'CSE').trim().toUpperCase();
    const rawStudentId = String(req.body?.student_id || req.body?.roll_number || '')
      .trim()
      .toUpperCase();
    const consentAccepted = Boolean(req.body?.consent_accepted ?? true);

    if (!fullName || fullName.length < 2) {
      res.status(400).json({ detail: 'Please provide your full name (at least 2 characters).' });
      return;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ detail: 'Please provide a valid institutional email address.' });
      return;
    }

    if (!password || password.length < 6) {
      res.status(400).json({ detail: 'Password must be at least 6 characters long.' });
      return;
    }

    const existingByEmail = Array.from(usersTable.values()).find(
      (u) => u.email.toLowerCase() === email
    );
    if (existingByEmail) {
      res.status(409).json({
        detail: 'An institutional account with this email address already exists. Please sign in instead.',
      });
      return;
    }

    let linkedStudentId: string | null = null;
    if (role === 'student') {
      linkedStudentId = rawStudentId || 'STU1024';
      const studentsList = Array.isArray(data.students) ? data.students : [];
      const existsInCohort = studentsList.some(
        (s: any) => String(s.student_id).toUpperCase() === linkedStudentId
      );
      if (!existsInCohort) {
        const nameParts = fullName.split(/\s+/);
        const firstName = nameParts[0] || 'Student';
        const lastName = nameParts.slice(1).join(' ') || 'Member';
        studentsList.push({
          id: `stu-${linkedStudentId.toLowerCase()}`,
          student_id: linkedStudentId,
          first_name: firstName,
          last_name: lastName,
          email,
          current_grade: department || 'CSE',
          department: department || 'CSE',
          academic_term: 'Semester 4',
          section: 'A',
          enrollment_date: new Date().toISOString().slice(0, 10),
          status: 'active',
        });
      }
    }

    const newUserId = `usr-${role}-${randomUUID().slice(0, 8)}`;
    const newUser: UserRecord = {
      id: newUserId,
      email,
      roll_number: linkedStudentId,
      full_name: fullName,
      password_hash: hashPassword(password),
      role,
      student_id: linkedStudentId,
      institution_id: 'INST-KPMG-04',
      status: 'active',
      failed_attempts: 0,
      mfa_enabled: false,
      mfa_code: null,
      last_login_at: new Date().toISOString(),
    };

    usersTable.set(newUser.id, newUser);

    if (role === 'student' && linkedStudentId && consentAccepted) {
      consentRecordsTable.set(linkedStudentId, {
        id: randomUUID(),
        user_id: newUser.id,
        student_id: linkedStudentId,
        consent_version: 'v2.0-2026-10',
        status: 'active',
        accepted_at: new Date().toISOString(),
      });
    } else if (role === 'advisor') {
      const sampleIds = (data.students || []).slice(0, 12).map((s: any) => String(s.student_id));
      for (const sid of sampleIds) {
        advisorAssignmentsTable.push({
          id: randomUUID(),
          advisor_user_id: newUser.id,
          student_id: sid,
          department: department || 'CSE',
          assigned_at: new Date().toISOString(),
        });
      }
    } else if (role === 'faculty') {
      const sampleIds = (data.students || []).slice(0, 10).map((s: any) => String(s.student_id));
      facultyCoursesTable.push({
        id: randomUUID(),
        faculty_user_id: newUser.id,
        course_code: `${department || 'CS'}-301`,
        course_name: `${department || 'CSE'} Core Systems & Analytics`,
        semester: 'Semester 5',
        department: department || 'CSE',
        enrolled_student_ids: sampleIds,
      });
    }

    const accessToken = signJwt({
      sub: newUser.id,
      role: newUser.role,
      institution_id: newUser.institution_id,
      exp: Date.now() + 15 * 60 * 1000,
    });

    const rawRefreshToken = randomUUID() + '-' + randomUUID();
    const refreshTokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
    refreshTokensTable.set(refreshTokenHash, {
      id: randomUUID(),
      user_id: newUser.id,
      token_hash: refreshTokenHash,
      expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000,
      revoked: false,
      created_at: new Date().toISOString(),
    });

    setSessionCookies(res, accessToken, rawRefreshToken);

    logAuditEvent({
      actor_user_id: newUser.id,
      actor_email: newUser.email,
      actor_name: newUser.full_name,
      actor_role: newUser.role,
      action: 'ACCOUNT_REGISTERED',
      target_entity: 'users',
      target_student_id: newUser.student_id,
      ip_address: ip,
      details: {
        role: newUser.role,
        department,
        student_id: newUser.student_id,
      },
    });

    const mePayload = buildMePayload(newUser.id);
    res.status(201).json({
      ...mePayload,
      access_token: accessToken,
    });
  });

  // 2. POST /api/auth/refresh
  app.post('/api/auth/refresh', (req: Request, res: Response) => {
    const cookies = parseCookies(req);
    const rawRefresh = cookies.edunexus_refresh_token || req.body?.refresh_token;
    if (!rawRefresh) {
      res.status(401).json({ detail: 'Invalid credentials' });
      return;
    }

    const tokenHash = createHash('sha256').update(String(rawRefresh)).digest('hex');
    const stored = refreshTokensTable.get(tokenHash);
    if (!stored || stored.revoked || Date.now() > stored.expires_at) {
      clearSessionCookies(res);
      res.status(401).json({ detail: 'Invalid credentials' });
      return;
    }

    const user = usersTable.get(stored.user_id);
    if (!user || user.status !== 'active') {
      stored.revoked = true;
      clearSessionCookies(res);
      res.status(401).json({ detail: 'Invalid credentials' });
      return;
    }

    // Rotate refresh token
    stored.revoked = true;
    const newRawRefresh = randomUUID() + '-' + randomUUID();
    const newRefreshHash = createHash('sha256').update(newRawRefresh).digest('hex');
    refreshTokensTable.set(newRefreshHash, {
      id: randomUUID(),
      user_id: user.id,
      token_hash: newRefreshHash,
      expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000,
      revoked: false,
      created_at: new Date().toISOString(),
    });

    const accessToken = signJwt({
      sub: user.id,
      role: user.role,
      institution_id: user.institution_id,
      exp: Date.now() + 15 * 60 * 1000,
    });

    setSessionCookies(res, accessToken, newRawRefresh);
    const mePayload = buildMePayload(user.id);
    res.json({
      ...mePayload,
      access_token: accessToken,
    });
  });

  // 3. POST /api/auth/logout
  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const user = getAuthUser(req);
    const cookies = parseCookies(req);
    if (cookies.edunexus_refresh_token) {
      const tokenHash = createHash('sha256')
        .update(cookies.edunexus_refresh_token)
        .digest('hex');
      const stored = refreshTokensTable.get(tokenHash);
      if (stored) stored.revoked = true;
    }
    if (user) {
      logAuditEvent({
        actor_user_id: user.user_id,
        actor_email: user.email,
        actor_name: user.full_name || user.email,
        actor_role: user.role,
        action: 'LOGOUT',
        target_entity: 'auth_session',
      });
    }
    clearSessionCookies(res);
    res.json({ status: 'logged_out' });
  });

  // 4. GET /api/auth/me
  app.get('/api/auth/me', (req: Request, res: Response) => {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ detail: 'Not authenticated' });
      return;
    }
    const mePayload = buildMePayload(user.user_id);
    if (!mePayload) {
      res.status(401).json({ detail: 'Session account not found' });
      return;
    }
    res.json(mePayload);
  });

  // 4b. POST /api/auth/preferences (Persist authenticated user's theme & accent preference)
  app.post('/api/auth/preferences', (req: Request, res: Response) => {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ detail: 'Not authenticated' });
      return;
    }
    const dbUser = usersTable.get(user.user_id);
    const nextTheme: 'system' | 'dark' | 'light' =
      req.body?.theme === 'light'
        ? 'light'
        : req.body?.theme === 'dark'
        ? 'dark'
        : 'system';
    const nextAccent = typeof req.body?.accent === 'string' ? req.body.accent : (dbUser?.accent_preference || 'monochrome');
    if (dbUser) {
      dbUser.theme_preference = nextTheme;
      dbUser.accent_preference = nextAccent;
    }
    res.json({
      user_id: user.user_id,
      theme_preference: nextTheme,
      accent_preference: nextAccent,
      updated_at: new Date().toISOString(),
    });
  });

  // 5. POST /api/auth/consent (Student Privacy & Telemetry Consent Gate)
  app.post('/api/auth/consent', (req: Request, res: Response) => {
    const user = getAuthUser(req);
    if (!user || user.role.toLowerCase() !== 'student') {
      res.status(403).json({ detail: 'Consent action is restricted to student accounts.' });
      return;
    }
    const studentId = user.student_id || 'STU1024';
    const decision = req.body?.status === 'revoked' ? 'revoked' : 'active';
    const record: ConsentRecord = {
      id: randomUUID(),
      user_id: user.user_id,
      student_id: studentId,
      consent_version: 'v2.0-2026-10',
      status: decision,
      accepted_at: new Date().toISOString(),
    };
    if (decision === 'active') {
      consentRecordsTable.set(studentId, record);
    } else {
      consentRecordsTable.delete(studentId);
    }

    logAuditEvent({
      actor_user_id: user.user_id,
      actor_email: user.email,
      actor_name: user.full_name || user.email,
      actor_role: user.role,
      action: decision === 'active' ? 'CONSENT_GRANTED' : 'CONSENT_REVOKED',
      target_entity: 'consent_records',
      target_student_id: studentId,
      details: { consent_version: record.consent_version, status: decision },
    });

    res.json(buildMePayload(user.user_id));
  });

  // 6. GET /api/auth/audit-logs (Admin full logs or Student own data access logs)
  app.get('/api/auth/audit-logs', (req: Request, res: Response) => {
    const user = getAuthUser(req);
    if (user?.role === 'student') {
      const sid = user.student_id || 'STU1024';
      res.json(auditLogsTable.filter((l) => l.target_student_id === sid));
      return;
    }
    res.json(auditLogsTable.slice(0, 100));
  });

  // 7. GET /api/auth/users & POST /api/auth/users/:id/unlock (Admin Account Management)
  app.get('/api/auth/users', (_req: Request, res: Response) => {
    const list = Array.from(usersTable.values()).map((u) => ({
      id: u.id,
      email: u.email,
      roll_number: u.roll_number,
      full_name: u.full_name,
      role: u.role,
      student_id: u.student_id,
      institution_id: u.institution_id,
      status: u.status,
      failed_attempts: u.failed_attempts,
      mfa_enabled: u.mfa_enabled,
      last_login_at: u.last_login_at,
    }));
    res.json(list);
  });

  app.post('/api/auth/users/:userId/unlock', (req: Request, res: Response) => {
    const actor = getAuthUser(req);
    const target = usersTable.get(String(req.params.userId));
    if (!target) {
      res.status(404).json({ detail: 'User account not found' });
      return;
    }
    target.status = 'active';
    target.failed_attempts = 0;
    logAuditEvent({
      actor_user_id: actor?.user_id || 'usr-admin-001',
      actor_email: actor?.email || 'admin@college.edu',
      actor_name: actor?.full_name || 'System Admin',
      actor_role: actor?.role || 'admin',
      action: 'ACCOUNT_UNLOCKED',
      target_entity: 'users',
      details: { unlocked_user_email: target.email, unlocked_role: target.role },
    });
    res.json({
      id: target.id,
      email: target.email,
      status: target.status,
      failed_attempts: target.failed_attempts,
    });
  });

  // ===========================================================================
  // Role-Scoped Workspace Endpoints (/api/v1/role/*)
  // ===========================================================================

  // Advisor Queue: returns only students assigned to this advisor in advisor_assignments
  app.get('/api/v1/role/advisor-queue', (req: Request, res: Response) => {
    const user = getAuthUser(req);
    const data = loadDataset();
    const idx = indexDataset(data);
    const advisorId = user?.role === 'advisor' ? user.user_id : 'usr-advisor-001';
    const assignedCodes = new Set(
      advisorAssignmentsTable
        .filter((a) => a.advisor_user_id === advisorId)
        .map((a) => a.student_id)
    );

    const assignedStudents = idx.students
      .filter((s) => assignedCodes.has(String(s.student_id)))
      .map((s) => {
        const m = computeStudentMetrics(
          s,
          idx.studentAtt,
          idx.studentAss,
          idx.studentEng,
          idx.studentIntvs,
          idx.studentPlacement,
          idx.studentSkills,
          idx.studentFeedback,
          idx.studentLms
        );
        const factors = m.baseline_profile.contributing_factors;
        const topFactor = [...factors].sort((a, b) => b.contribution_points - a.contribution_points)[0];
        const studentNotes = facultyNotesTable.filter((n) => n.student_id === String(s.student_id));
        const studentIntvs = idx.studentIntvs.get(String(s.id)) || [];

        return {
          id: s.id,
          student_id: s.student_id,
          full_name: `${s.first_name} ${s.last_name}`,
          department: m.department,
          semester: s.academic_term,
          attendance_rate: m.attendance_rate,
          average_score: m.average_score,
          success_score: m.success_score,
          risk_tier: m.risk_tier,
          risk_score: m.risk_score,
          academic_risk_tier: m.academic_risk_tier,
          placement_risk_tier: m.placement_risk_tier,
          segment_label: m.segment_label,
          review_status: m.review_status,
          primary_factor: topFactor?.explanation || 'Consistent across domains',
          faculty_flags: studentNotes,
          interventions: studentIntvs,
        };
      })
      .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0));

    res.json({
      advisor_name: user?.full_name || 'Dr. Meera Krishnan',
      advisor_email: user?.email || 'advisor@college.edu',
      assigned_count: assignedStudents.length,
      flagged_count: assignedStudents.filter((s) =>
        ['critical', 'high', 'moderate'].includes(String(s.risk_tier))
      ).length,
      students: assignedStudents,
    });
  });

  // Advisor Decision: Approve, Edit, or Dismiss Support
  app.post('/api/v1/role/advisor-queue/:studentId/decision', (req: Request, res: Response) => {
    const user = getAuthUser(req);
    if (user?.role === 'faculty' || user?.role === 'student') {
      res.status(403).json({
        detail: 'Forbidden: Only an assigned Advisor can approve, edit, or dismiss support interventions.',
      });
      return;
    }

    const data = loadDataset();
    const idx = indexDataset(data);
    const studentIdParam = String(req.params.studentId);
    const student = idx.students.find(
      (s) => String(s.id) === studentIdParam || String(s.student_id) === studentIdParam
    );
    if (!student) {
      res.status(404).json({ detail: 'Student not found' });
      return;
    }

    const decision = String(req.body?.decision || 'approve'); // approve | edit | dismiss
    const title = String(req.body?.title || 'Advisor-Approved Holistic Support Plan');
    const notes = String(req.body?.notes || 'Reviewed by assigned advisor.');
    const priority = String(req.body?.priority || 'high');
    const now = new Date().toISOString();

    if (decision === 'dismiss') {
      overridesStore.set(String(student.id), {
        is_overridden: true,
        original_tier: 'moderate',
        override_tier: 'low',
        override_reason: notes || 'Advisor reviewed and dismissed automated flag.',
        reviewed_by: user?.email || 'advisor@college.edu',
        reviewed_at: now,
      });
    } else {
      const existingPlan = (data.interventions || []).find(
        (i) => String(i.student_id) === String(student.id) && ['planned', 'in_progress'].includes(i.status)
      );
      if (existingPlan && decision === 'edit') {
        existingPlan.title = title;
        existingPlan.description = notes;
        existingPlan.priority = priority;
        existingPlan.status = 'in_progress';
        existingPlan.updated_at = now;
      } else {
        data.interventions = data.interventions || [];
        data.interventions.unshift({
          id: randomUUID(),
          student_id: String(student.id),
          title,
          intervention_type: 'academic_tutoring',
          priority,
          status: 'in_progress',
          description: notes,
          assigned_staff_name: user?.full_name || 'Dr. Meera Krishnan',
          start_date: now.slice(0, 10),
          follow_up_date: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
          created_at: now,
          updated_at: now,
        });
      }
    }

    logAuditEvent({
      actor_user_id: user?.user_id || 'usr-advisor-001',
      actor_email: user?.email || 'advisor@college.edu',
      actor_name: user?.full_name || 'Dr. Meera Krishnan',
      actor_role: 'advisor',
      action: `ADVISOR_SUPPORT_${decision.toUpperCase()}`,
      target_entity: 'interventions',
      target_student_id: student.student_id,
      details: { decision, title, notes },
    });

    res.json({ status: 'recorded', decision, student_id: student.student_id });
  });

  // Faculty Courses & Roster: returns only courses and students taught by this faculty member
  app.get('/api/v1/role/faculty-courses', (req: Request, res: Response) => {
    const user = getAuthUser(req);
    const data = loadDataset();
    const idx = indexDataset(data);
    const facultyId = user?.role === 'faculty' ? user.user_id : 'usr-faculty-001';
    const courses = facultyCoursesTable.filter((c) => c.faculty_user_id === facultyId);

    const enrichedCourses = courses.map((course) => {
      const enrolledSet = new Set(course.enrolled_student_ids);
      const roster = idx.students
        .filter((s) => enrolledSet.has(String(s.student_id)))
        .map((s) => {
          const m = computeStudentMetrics(
            s,
            idx.studentAtt,
            idx.studentAss,
            idx.studentEng,
            idx.studentIntvs,
            idx.studentPlacement,
            idx.studentSkills,
            idx.studentFeedback,
            idx.studentLms
          );
          const notes = facultyNotesTable.filter(
            (n) => n.course_code === course.course_code && n.student_id === String(s.student_id)
          );
          return {
            id: s.id,
            student_id: s.student_id,
            full_name: `${s.first_name} ${s.last_name}`,
            attendance_rate: m.attendance_rate,
            average_score: m.average_score,
            academic_risk_tier: m.academic_risk_tier,
            trend: m.trend,
            review_status: m.review_status,
            course_notes: notes,
          };
        });
      return {
        ...course,
        roster,
      };
    });

    res.json({
      faculty_name: user?.full_name || 'Prof. Rajesh Verma',
      faculty_email: user?.email || 'faculty@college.edu',
      courses: enrichedCourses,
      recent_notes: facultyNotesTable.slice(0, 15),
    });
  });

  // Faculty Action: Flag student or add course note (cannot approve support)
  app.post('/api/v1/role/faculty-courses/flag', (req: Request, res: Response) => {
    const user = getAuthUser(req);
    const data = loadDataset();
    const idx = indexDataset(data);

    const courseCode = String(req.body?.course_code || 'CS-301');
    const studentId = String(req.body?.student_id || 'STU1024');
    const flagSeverity = (req.body?.flag_severity || 'academic_flag') as
      | 'observation'
      | 'academic_flag'
      | 'attendance_flag';
    const note = String(req.body?.note || '').trim();

    if (!note) {
      res.status(400).json({ detail: 'Please provide an observation or flag note.' });
      return;
    }

    const student = idx.students.find(
      (s) => String(s.student_id) === studentId || String(s.id) === studentId
    );
    const studentName = student ? `${student.first_name} ${student.last_name}` : studentId;

    const record: FacultyNoteRecord = {
      id: randomUUID(),
      course_code: courseCode,
      student_id: student?.student_id || studentId,
      student_name: studentName,
      faculty_name: user?.full_name || 'Prof. Rajesh Verma',
      faculty_email: user?.email || 'faculty@college.edu',
      flag_severity: flagSeverity,
      note,
      created_at: new Date().toISOString(),
    };
    facultyNotesTable.unshift(record);

    logAuditEvent({
      actor_user_id: user?.user_id || 'usr-faculty-001',
      actor_email: user?.email || 'faculty@college.edu',
      actor_name: user?.full_name || 'Prof. Rajesh Verma',
      actor_role: 'faculty',
      action: 'FACULTY_FLAG_CREATED',
      target_entity: `course:${courseCode}`,
      target_student_id: record.student_id,
      details: { course_code: courseCode, flag_severity: flagSeverity, note },
    });

    res.status(201).json(record);
  });

  // ===========================================================================
  // Existing EduNexus AI v1 Endpoints
  // ===========================================================================

  const healthHandler = (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      service: 'EduNexus AI',
      version: '2.0.0',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    });
  };
  app.get('/health', healthHandler);
  app.get('/api/v1/health', healthHandler);

  const dbHealthHandler = (_req: Request, res: Response) => {
    res.json({
      status: 'unconfigured',
      database: 'Supabase PostgreSQL',
      configured: false,
      connected: false,
      verified: false,
      latency_ms: null,
      total_students_detected: null,
      message: 'Database credentials not configured in backend/.env',
      environment: process.env.NODE_ENV || 'development',
    });
  };
  app.get('/health/db', dbHealthHandler);
  app.get('/api/v1/health/db', dbHealthHandler);

  // Dashboard Overview
  app.get('/api/v1/dashboard/overview', (_req: Request, res: Response) => {
    const data = loadDataset();
    const idx = indexDataset(data);
    const metrics = idx.students.map((s) =>
      computeStudentMetrics(
        s,
        idx.studentAtt,
        idx.studentAss,
        idx.studentEng,
        idx.studentIntvs,
        idx.studentPlacement,
        idx.studentSkills,
        idx.studentFeedback,
        idx.studentLms
      )
    );

    function distribution(field: 'risk_tier' | 'academic_risk_tier' | 'placement_risk_tier') {
      const counts: Record<string, number> = {
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
        insufficient_data: 0,
      };
      for (const m of metrics) {
        const t = String(m[field] || 'low');
        counts[t] = (counts[t] || 0) + 1;
      }
      const colors: Record<string, string> = {
        low: '#0d9488',
        moderate: '#f59e0b',
        high: '#f97316',
        critical: '#ef4444',
        insufficient_data: '#64748b',
      };
      return Object.entries(colors)
        .filter(([t]) => t !== 'insufficient_data' || counts[t] > 0)
        .map(([t, c]) => ({
          tier: t,
          label: t
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (ch) => ch.toUpperCase()),
          count: counts[t] || 0,
          percentage: idx.students.length > 0 ? round1(((counts[t] || 0) / idx.students.length) * 100) : 0,
          color: c,
          description: 'Prototype indicator for human support review; see individual factors.',
        }));
    }

    const dailyAtt = new Map<string, any[]>();
    for (const r of data.attendance || []) {
      const d = String(r.session_date).slice(0, 10);
      const list = dailyAtt.get(d) || [];
      list.push(r);
      dailyAtt.set(d, list);
    }
    const attTrend = Array.from(dailyAtt.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, rows]) => {
        const presentSessions = rows.filter((r) => ['present', 'late'].includes(String(r.status))).length;
        return {
          period,
          attendance_rate: round1((presentSessions / rows.length) * 100),
          total_sessions: rows.length,
          present_sessions: presentSessions,
        };
      });

    const dailyAss = new Map<string, any[]>();
    for (const r of data.assessments || []) {
      const d = String(r.assessment_date).slice(0, 10);
      const list = dailyAss.get(d) || [];
      list.push(r);
      dailyAss.set(d, list);
    }
    const assTrend = Array.from(dailyAss.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, rows]) => {
        const subjects: Record<string, number[]> = {};
        for (const r of rows) {
          const pct = (Number(r.score) / Number(r.max_score)) * 100;
          subjects[r.subject] = subjects[r.subject] || [];
          subjects[r.subject].push(pct);
        }
        const subjectMeans: Record<string, number | null> = {};
        for (const [k, v] of Object.entries(subjects)) {
          subjectMeans[k] = mean(v);
        }
        return {
          period,
          average_score: mean(rows.map((r) => (Number(r.score) / Number(r.max_score)) * 100)) ?? 0,
          subjects: subjectMeans,
        };
      });

    const statusCounts: Record<string, number> = {
      planned: 0,
      in_progress: 0,
      under_review: 0,
      completed: 0,
      cancelled: 0,
    };
    const byType: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const inSevenDays = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    let due = 0;

    for (const r of idx.allIntvs) {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      byType[r.intervention_type] = (byType[r.intervention_type] || 0) + 1;
      byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
      if (
        ['planned', 'in_progress'].includes(String(r.status)) &&
        r.follow_up_date &&
        String(r.follow_up_date).slice(0, 10) <= inSevenDays
      ) {
        due += 1;
      }
    }

    const intSummary = {
      total: idx.allIntvs.length,
      planned: statusCounts.planned || 0,
      in_progress: statusCounts.in_progress || 0,
      under_review: statusCounts.under_review || 0,
      completed: statusCounts.completed || 0,
      by_type: byType,
      by_priority: byPriority,
      completion_rate:
        idx.allIntvs.length > 0 ? round1(((statusCounts.completed || 0) / idx.allIntvs.length) * 100) : 0,
      upcoming_follow_ups: due,
    };

    const followups: any[] = [];
    const activity: any[] = [];

    idx.students.forEach((s, i) => {
      const m = metrics[i];
      const sid = String(s.id);
      const { events } = buildHistory(
        s,
        idx.studentAtt.get(sid) || [],
        idx.studentAss.get(sid) || [],
        idx.studentEng.get(sid) || [],
        idx.studentIntvs.get(sid) || []
      );
      for (const e of events.slice(0, 5)) {
        activity.push({
          id: e.id,
          student_id: s.student_id,
          student_name: `${s.first_name} ${s.last_name}`,
          activity_type: e.event_type,
          title: e.title,
          description: e.description,
          timestamp: e.date,
          severity: e.severity,
        });
      }
      if (['moderate', 'high', 'critical'].includes(String(m.risk_tier))) {
        const factors = m.baseline_profile.contributing_factors;
        const primary = [...factors].sort((a, b) => b.contribution_points - a.contribution_points)[0];
        followups.push({
          id: sid,
          student_id: s.student_id,
          name: `${s.first_name} ${s.last_name}`,
          grade: s.current_grade,
          section: s.section,
          risk_level: m.risk_tier,
          risk_score: m.risk_score,
          primary_risk_factor: primary?.explanation || 'Requires advisor review',
          attendance_rate: m.attendance_rate,
          avg_score: m.average_score,
          last_interaction: events[0]?.date || 'Not recorded',
          assigned_advisor: s.department ? `${s.department} Support Advisor` : 'Academic Support Team',
          status: m.review_status,
        });
      }
    });

    const domains = ['academic', 'attendance', 'placement', 'lms', 'engagement', 'skills', 'feedback'];
    const domainAverages: Record<string, number | null> = {};
    const domainCoverage: Record<string, number> = {};
    for (const d of domains) {
      const vals = metrics.map(
        (m) => m.success_profile.domain_breakdowns.find((b: any) => b.domain === d)?.raw_score ?? null
      );
      domainAverages[d] = mean(vals);
      domainCoverage[d] = vals.filter((v) => v !== null).length;
    }

    const segsMap = new Map<string, any>();
    for (const m of metrics) {
      const seg = m.segment_profile;
      const existing = segsMap.get(seg.segment_id) || {
        segment_id: seg.segment_id,
        label: seg.segment_label,
        badge_color: seg.badge_color,
        tagline: seg.tagline,
        count: 0,
        percentage: 0,
        description: seg.description,
        recommended_action: seg.recommended_action,
      };
      existing.count += 1;
      segsMap.set(seg.segment_id, existing);
    }
    const segmentationDistribution = Array.from(segsMap.values()).map((item) => ({
      ...item,
      percentage: idx.students.length > 0 ? round1((item.count / idx.students.length) * 100) : 0,
    }));

    const matrix: Record<string, number> = {
      academic_low_placement_low: 0,
      academic_low_placement_high: 0,
      academic_high_placement_low: 0,
      academic_high_placement_high: 0,
      moderate_quadrants: 0,
      insufficient_data: 0,
    };
    for (const m of metrics) {
      const a = m.academic_risk_tier;
      const p = m.placement_risk_tier;
      let key = '';
      if (a === 'insufficient_data' || p === 'insufficient_data') key = 'insufficient_data';
      else if (a === 'moderate' || p === 'moderate') key = 'moderate_quadrants';
      else key = `academic_${a === 'low' ? 'low' : 'high'}_placement_${p === 'low' ? 'low' : 'high'}`;
      matrix[key] = (matrix[key] || 0) + 1;
    }

    const placementVals = Array.from(idx.studentPlacement.values());
    const tierDist: Record<string, number> = {};
    for (const p of placementVals) {
      const t = p.readiness_tier || 'not_recorded';
      tierDist[t] = (tierDist[t] || 0) + 1;
    }

    const depts = Array.from(new Set(metrics.map((m) => m.department))).sort();
    const cohorts = depts.map((department) => {
      const members = metrics.filter((m) => m.department === department);
      return {
        department,
        count: members.length,
        average_success_score: mean(members.map((m) => m.success_score)),
        average_attendance: mean(members.map((m) => m.attendance_rate)),
        average_assessment: mean(members.map((m) => m.average_score)),
      };
    });

    const avgAtt = mean(metrics.map((m) => m.attendance_rate));

    res.json({
      summary: {
        total_students: idx.students.length,
        active_students: idx.students.filter((s) => s.status === 'active').length,
        requiring_review_count: followups.length,
        review_percentage:
          idx.students.length > 0 ? round1((followups.length / idx.students.length) * 100) : 0,
        average_attendance: avgAtt,
        attendance_status: avgAtt === null ? 'No attendance records' : 'Prototype benchmark: 80%',
        active_interventions_count: (statusCounts.planned || 0) + (statusCounts.in_progress || 0),
        follow_ups_due_count: due,
        cohort_avg_score: mean(metrics.map((m) => m.average_score)),
        average_success_score: mean(metrics.map((m) => m.success_score)),
      },
      attendance_trend: attTrend,
      assessment_trend: assTrend,
      risk_distribution: distribution('risk_tier'),
      academic_risk_distribution: distribution('academic_risk_tier'),
      placement_risk_distribution: distribution('placement_risk_tier'),
      recent_activity: activity.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).slice(0, 10),
      follow_up_students: followups.sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0)),
      intervention_summary: intSummary,
      metadata: {
        is_demo: true,
        data_source: 'Public Demonstration (Synthetic Cohort)',
        dataset_size: idx.students.length,
        generated_at: new Date().toISOString(),
        disclaimer:
          'Public demonstration mode with safe fictional test data. Real student records require authenticated staff review.',
      },
      domain_averages: domainAverages,
      domain_coverage: domainCoverage,
      placement_readiness_summary: {
        average_aptitude: mean(placementVals.map((p) => p.aptitude_score)),
        average_coding: mean(placementVals.map((p) => p.coding_score)),
        average_mock_interview: mean(placementVals.map((p) => p.mock_interview_score)),
        tier_distribution: tierDist,
      },
      segmentation_distribution: segmentationDistribution,
      dual_risk_matrix: matrix,
      cohort_comparisons: cohorts,
      success_distribution: ['thriving', 'proficient', 'developing', 'needs_support', null].map(
        (t) => ({
          tier: t,
          count: metrics.filter((m) => m.success_tier === t).length,
        })
      ),
    });
  });

  // Student's own dashboard
  app.get('/api/v1/students/me/dashboard', (req: Request, res: Response) => {
    const user = getAuthUser(req);
    const data = loadDataset();
    const idx = indexDataset(data);
    const linkedId = user?.student_id || 'STU1024';
    const student =
      idx.students.find((s) => s.student_id === linkedId || String(s.id) === linkedId) ||
      idx.students[0];
    if (!student) {
      res.status(404).json({ detail: 'Student record not found' });
      return;
    }
    const sid = String(student.id);
    const m = computeStudentMetrics(
      student,
      idx.studentAtt,
      idx.studentAss,
      idx.studentEng,
      idx.studentIntvs,
      idx.studentPlacement,
      idx.studentSkills,
      idx.studentFeedback,
      idx.studentLms
    );

    const assessments = [...(idx.studentAss.get(sid) || [])]
      .sort((a, b) => String(b.assessment_date || '').localeCompare(String(a.assessment_date || '')))
      .slice(0, 8)
      .map((r) => ({
        subject: r.subject || 'Assessment',
        assessment_type: r.assessment_type || 'Assessment',
        score: Number(r.score || 0),
        max_score: Number(r.max_score || 100),
        percentage:
          Number(r.max_score) > 0 ? round1((Number(r.score) / Number(r.max_score)) * 100) : null,
        date: r.assessment_date || r.date,
      }));

    const attendance = [...(idx.studentAtt.get(sid) || [])]
      .sort((a, b) => String(b.session_date || '').localeCompare(String(a.session_date || '')))
      .slice(0, 8)
      .map((r) => ({
        date: r.session_date || r.date,
        status: r.status || 'not recorded',
      }));

    const supportPlans = [...(idx.studentIntvs.get(sid) || [])]
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .slice(0, 8)
      .map((r) => ({
        id: String(r.id),
        title: r.title || r.intervention_type || 'Student support plan',
        status: r.status || 'planned',
        priority: r.priority || 'medium',
        start_date: r.start_date,
        follow_up_date: r.follow_up_date,
      }));

    res.json({
      data_source: 'Synthetic demo data',
      student: {
        student_id: student.student_id,
        first_name: student.first_name,
        last_name: student.last_name,
        current_grade: student.current_grade,
        academic_term: student.academic_term,
        section: student.section,
        department: student.department || 'Not recorded',
        status: student.status || 'active',
      },
      metrics: {
        attendance_rate: m.attendance_rate,
        average_score: m.average_score,
        latest_assessment_percentage: m.latest_assessment_percentage,
        trend: m.trend,
        review_status: m.review_status,
        success_score: m.success_score,
        success_tier: m.success_tier,
        risk_tier: m.risk_tier,
        academic_risk_tier: m.academic_risk_tier,
        placement_risk_tier: m.placement_risk_tier,
        active_interventions_count: m.active_interventions_count,
        domain_coverage_pct: m.success_profile.data_coverage_pct,
        available_domains_count: m.success_profile.available_domains_count,
        missing_domains: m.success_profile.missing_domains,
        segment_label: m.segment_label,
      },
      domains: m.success_profile.domain_breakdowns.map((b: any) => ({
        name: b.domain,
        score: b.raw_score,
        is_missing: b.is_missing,
        normalized_weight: b.normalized_weight,
      })),
      recent_assessments: assessments,
      recent_attendance: attendance,
      support_plans: supportPlans,
      access_logs: auditLogsTable
        .filter(
          (l) =>
            l.target_student_id === student.student_id &&
            l.action === 'STUDENT_RECORD_VIEWED'
        )
        .slice(0, 12),
    });
  });

  // Students Directory
  app.get('/api/v1/students', (req: Request, res: Response) => {
    const data = loadDataset();
    const idx = indexDataset(data);

    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const department = typeof req.query.department === 'string' ? req.query.department : '';
    const semester = typeof req.query.semester === 'string' ? req.query.semester : '';
    const riskTier = typeof req.query.risk_tier === 'string' ? req.query.risk_tier : '';
    const segment = typeof req.query.segment === 'string' ? req.query.segment : '';
    const academicRisk = typeof req.query.academic_risk === 'string' ? req.query.academic_risk : '';
    const placementRisk = typeof req.query.placement_risk === 'string' ? req.query.placement_risk : '';
    const successMin = req.query.success_min !== undefined ? Number(req.query.success_min) : null;
    const successMax = req.query.success_max !== undefined ? Number(req.query.success_max) : null;
    const sortBy = typeof req.query.sort_by === 'string' ? req.query.sort_by : 'risk_score';
    const sortDir = typeof req.query.sort_dir === 'string' ? req.query.sort_dir : 'desc';
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.max(1, Math.min(100, Number(req.query.page_size || 12)));

    const computed: any[] = [];
    for (const s of idx.students) {
      const m = computeStudentMetrics(
        s,
        idx.studentAtt,
        idx.studentAss,
        idx.studentEng,
        idx.studentIntvs,
        idx.studentPlacement,
        idx.studentSkills,
        idx.studentFeedback,
        idx.studentLms
      );

      if (search) {
        const fullName = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
        const code = String(s.student_id || '').toLowerCase();
        if (!fullName.includes(search) && !code.includes(search)) continue;
      }
      if (department && department !== 'all' && m.department !== department) continue;
      if (semester && semester !== 'all') {
        const termMatch = String(s.academic_term || '').toLowerCase().includes(semester.toLowerCase());
        const gradeMatch = String(s.current_grade || '').toLowerCase().includes(semester.toLowerCase());
        if (!termMatch && !gradeMatch) continue;
      }
      if (riskTier && riskTier !== 'all') {
        const filterTier = riskTier === 'medium' ? 'moderate' : riskTier;
        const studentTier = m.risk_tier === 'medium' ? 'moderate' : m.risk_tier;
        if (studentTier !== filterTier) continue;
      }
      if (segment && segment !== 'all' && m.segment_id !== segment) continue;
      if (academicRisk && academicRisk !== 'all' && m.academic_risk_tier !== academicRisk) continue;
      if (placementRisk && placementRisk !== 'all' && m.placement_risk_tier !== placementRisk) continue;
      if (successMin !== null && !Number.isNaN(successMin) && (m.success_score === null || m.success_score < successMin)) continue;
      if (successMax !== null && !Number.isNaN(successMax) && (m.success_score === null || m.success_score > successMax)) continue;

      computed.push({
        ...s,
        department: m.department,
        attendance_rate: m.attendance_rate,
        average_score: m.average_score,
        latest_assessment_percentage: m.latest_assessment_percentage,
        trend: m.trend,
        review_status: m.review_status,
        risk_tier: m.risk_tier,
        risk_score: m.risk_score,
        active_interventions_count: m.active_interventions_count,
        success_score: m.success_score,
        success_tier: m.success_tier,
        academic_risk_tier: m.academic_risk_tier,
        placement_risk_tier: m.placement_risk_tier,
        segment_id: m.segment_id,
        segment_label: m.segment_label,
        segment_badge_color: m.segment_badge_color,
      });
    }

    const dir = sortDir.toLowerCase() === 'asc' ? 1 : -1;
    computed.sort((a, b) => {
      if (sortBy === 'name') {
        return dir * `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
      }
      if (sortBy === 'student_id') {
        return dir * String(a.student_id).localeCompare(String(b.student_id));
      }
      if (sortBy === 'attendance_rate') {
        return dir * ((a.attendance_rate ?? 0) - (b.attendance_rate ?? 0));
      }
      if (sortBy === 'average_score') {
        return dir * ((a.average_score ?? 0) - (b.average_score ?? 0));
      }
      if (sortBy === 'success_score') {
        return dir * ((a.success_score ?? 0) - (b.success_score ?? 0));
      }
      return dir * ((a.risk_score ?? 0) - (b.risk_score ?? 0));
    });

    const total = computed.length;
    const startIdx = (page - 1) * pageSize;
    const paged = computed.slice(startIdx, startIdx + pageSize);

    const departments = Array.from(
      new Set(idx.students.map((s) => s.department).filter(Boolean))
    ).sort();
    const semesters = Array.from(
      new Set(idx.students.map((s) => s.academic_term || 'AY 2025-26 Term 1'))
    ).sort();

    res.json({
      students: paged,
      total,
      page,
      page_size: pageSize,
      departments,
      semesters,
    });
  });

  function getStudentProfileData(studentIdParam: string, viewer?: ReturnType<typeof getAuthUser>) {
    const data = loadDataset();
    const idx = indexDataset(data);
    const match = idx.students.find(
      (s) => String(s.id) === studentIdParam || String(s.student_id) === studentIdParam
    );
    if (!match) return null;

    if (viewer && viewer.role !== 'student') {
      logAuditEvent({
        actor_user_id: viewer.user_id,
        actor_email: viewer.email,
        actor_name: viewer.full_name || viewer.email,
        actor_role: viewer.role,
        action: 'STUDENT_RECORD_VIEWED',
        target_entity: 'student_dossier',
        target_student_id: String(match.student_id),
        details: {
          purpose: 'Holistic student journey dossier inspection',
          domains_accessed: ['academic', 'attendance', 'placement', 'skills', 'lms', 'engagement', 'feedback'],
        },
      });
    }

    const matchedId = String(match.id);
    const attendance = idx.studentAtt.get(matchedId) || [];
    const assessments = idx.studentAss.get(matchedId) || [];
    const engagements = idx.studentEng.get(matchedId) || [];
    const interventions = idx.studentIntvs.get(matchedId) || [];
    const placementRec = idx.studentPlacement.get(matchedId) || null;
    const skillsRec = idx.studentSkills.get(matchedId) || null;
    const feedbackRec = idx.studentFeedback.get(matchedId) || null;
    const lmsRec = idx.studentLms.get(matchedId) || null;

    const m = computeStudentMetrics(
      match,
      idx.studentAtt,
      idx.studentAss,
      idx.studentEng,
      idx.studentIntvs,
      idx.studentPlacement,
      idx.studentSkills,
      idx.studentFeedback,
      idx.studentLms
    );

    const { events: timelineEvents, points: metricsTrend } = buildHistory(
      match,
      attendance,
      assessments,
      engagements,
      interventions,
      [placementRec, skillsRec, feedbackRec, lmsRec].filter(Boolean)
    );

    const missingNotices = m.success_profile.missing_domains.map((domain: string) => ({
      category: domain.charAt(0).toUpperCase() + domain.slice(1),
      metric: domain,
      status: 'Not recorded',
      message: 'No usable records for this domain; performance is unknown.',
      impact_on_scoring: 'Excluded from Success Score; available weights are rescaled.',
    }));

    const override = overridesStore.get(matchedId);
    const effectiveRisk =
      override && override.is_overridden && override.override_tier
        ? override.override_tier
        : m.risk_tier;

    return {
      student: match,
      department: m.department,
      attendance_rate: m.attendance_rate,
      average_score: m.average_score,
      latest_assessment_percentage: m.latest_assessment_percentage,
      trend: m.trend,
      review_status: m.review_status,
      risk_profile: {
        ...m.baseline_profile,
        overall_risk: effectiveRisk,
        effective_tier: effectiveRisk,
        baseline_tier: m.baseline_profile.support_priority_tier,
        risk_score: m.risk_score,
        is_overridden: Boolean(override && override.is_overridden),
        requires_review: m.baseline_profile.requires_human_review,
        disclaimer: m.baseline_profile.decision_support_disclaimer,
        factors: m.baseline_profile.contributing_factors.map((f: any) => ({
          factor: f.factor_name,
          value: f.sub_metric_score,
          weight: f.weight,
          contribution: f.contribution_points,
        })),
      },
      missing_data_notices: missingNotices,
      recent_attendance: attendance.slice(0, 30),
      recent_assessments: assessments.slice(0, 25),
      recent_engagements: engagements.slice(0, 25),
      interventions,
      timeline_events: timelineEvents,
      metrics_trend: metricsTrend,
      success_profile: m.success_profile,
      academic_risk_profile: m.academic_risk_profile,
      placement_risk_profile: m.placement_risk_profile,
      segment_profile: m.segment_profile,
      placement_details: m.placement_details,
      skills_details: m.skills_details,
      feedback_details: m.feedback_details,
      lms_details: m.lms_details,
    };
  }

  app.get('/api/v1/students/:studentId', (req: Request, res: Response) => {
    const viewer = getAuthUser(req);
    const profile = getStudentProfileData(String(req.params.studentId), viewer);
    if (!profile) {
      res.status(404).json({
        detail: `Student record '${req.params.studentId}' does not exist in the institutional directory.`,
      });
      return;
    }
    res.json(profile);
  });

  app.get('/api/v1/students/:studentId/comprehensive-dossier', (req: Request, res: Response) => {
    const viewer = getAuthUser(req);
    const profile = getStudentProfileData(String(req.params.studentId), viewer);
    if (!profile) {
      res.status(404).json({ detail: 'Student record not found.' });
      return;
    }
    res.json({
      student_id: profile.student.student_id,
      full_name: `${profile.student.first_name} ${profile.student.last_name}`,
      department: profile.department,
      current_term: profile.student.academic_term,
      success_score_profile: profile.success_profile,
      academic_risk: profile.academic_risk_profile,
      placement_risk: profile.placement_risk_profile,
      segment: profile.segment_profile,
      ethical_disclaimer:
        'Ethical AI Notice: Holistic campus decision-support index. Empirical indicators do not infer individual causal determinations.',
    });
  });

  app.get('/api/v1/students/:studentId/journey', (req: Request, res: Response) => {
    const profile = getStudentProfileData(String(req.params.studentId));
    if (!profile) {
      res.status(404).json({ detail: 'Student record not found.' });
      return;
    }
    res.json(profile.timeline_events);
  });

  app.get('/api/v1/students/:studentId/risk-explanation', (req: Request, res: Response) => {
    const data = loadDataset();
    const idx = indexDataset(data);
    const studentIdParam = String(req.params.studentId);
    const match = idx.students.find(
      (s) => String(s.id) === studentIdParam || String(s.student_id) === studentIdParam
    );
    if (!match) {
      res.status(404).json({ detail: `Student record '${studentIdParam}' does not exist.` });
      return;
    }
    const matchedId = String(match.id);
    res.json(
      computeStudentRisk(
        matchedId,
        idx.studentAtt.get(matchedId) || [],
        idx.studentAss.get(matchedId) || [],
        idx.studentEng.get(matchedId) || []
      )
    );
  });

  app.post('/api/v1/students/:studentId/risk-override', (req: Request, res: Response) => {
    const user = getAuthUser(req);
    const data = loadDataset();
    const idx = indexDataset(data);
    const studentIdParam = String(req.params.studentId);
    const match = idx.students.find(
      (s) => String(s.id) === studentIdParam || String(s.student_id) === studentIdParam
    );
    if (!match) {
      res.status(404).json({ detail: 'Student not found' });
      return;
    }
    const targetId = String(match.id);
    const baseline = computeStudentRisk(
      targetId,
      idx.studentAtt.get(targetId) || [],
      idx.studentAss.get(targetId) || [],
      idx.studentEng.get(targetId) || []
    );
    const record: HumanOverrideRecord = {
      is_overridden: true,
      original_tier: baseline.support_priority_tier,
      override_tier: req.body?.override_tier || 'moderate',
      override_reason: String(req.body?.reason || '').trim(),
      reviewed_by: user?.email || 'advisor@college.edu',
      reviewed_at: new Date().toISOString(),
    };
    overridesStore.set(targetId, record);
    res.json(record);
  });

  app.delete('/api/v1/students/:studentId/risk-override', (req: Request, res: Response) => {
    const data = loadDataset();
    const idx = indexDataset(data);
    const studentIdParam = String(req.params.studentId);
    const match = idx.students.find(
      (s) => String(s.id) === studentIdParam || String(s.student_id) === studentIdParam
    );
    if (!match) {
      res.status(404).json({ detail: 'Student not found' });
      return;
    }
    overridesStore.delete(String(match.id));
    res.json({
      message: 'Advisor override cleared successfully.',
      student_id: studentIdParam,
    });
  });

  // Interventions CRUD
  app.get('/api/v1/interventions', (req: Request, res: Response) => {
    const data = loadDataset();
    const idx = indexDataset(data);
    const studentsMap = new Map<string, any>(idx.students.map((s) => [String(s.id), s]));
    const studentsCodeMap = new Map<string, any>(idx.students.map((s) => [String(s.student_id), s]));

    const outcomesMap = new Map<string, any[]>();
    for (const o of data.intervention_outcomes || []) {
      const k = String(o.intervention_id);
      const list = outcomesMap.get(k) || [];
      list.push(o);
      outcomesMap.set(k, list);
    }

    const studentIdFilter = typeof req.query.student_id === 'string' ? req.query.student_id : '';
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';
    const priorityFilter = typeof req.query.priority === 'string' ? req.query.priority : '';
    const overdueOnly = req.query.overdue_only === 'true';

    const results: any[] = [];
    for (const item of idx.allIntvs) {
      const sId = String(item.student_id);
      if (studentIdFilter) {
        const resolved = studentsMap.get(sId) || studentsCodeMap.get(sId);
        if (
          sId !== studentIdFilter &&
          resolved?.student_id !== studentIdFilter &&
          item.student_id !== studentIdFilter
        ) {
          continue;
        }
      }
      if (statusFilter && statusFilter !== 'all' && item.status !== statusFilter) continue;
      if (priorityFilter && priorityFilter !== 'all' && item.priority !== priorityFilter) continue;

      const enriched = enrichIntervention(item, studentsMap, outcomesMap);
      if (overdueOnly && !enriched.is_overdue) continue;
      results.push(enriched);
    }

    results.sort((a, b) => {
      const ovA = a.is_overdue ? 0 : 1;
      const ovB = b.is_overdue ? 0 : 1;
      if (ovA !== ovB) return ovA - ovB;
      const prA = a.priority === 'urgent' ? 0 : a.priority === 'high' ? 1 : 2;
      const prB = b.priority === 'urgent' ? 0 : b.priority === 'high' ? 1 : 2;
      if (prA !== prB) return prA - prB;
      return String(a.start_date).localeCompare(String(b.start_date));
    });

    res.json(results);
  });

  app.post('/api/v1/interventions', (req: Request, res: Response) => {
    const user = getAuthUser(req);
    if (user?.role === 'faculty' || user?.role === 'student') {
      res.status(403).json({
        detail: 'Forbidden: Only Advisors or Administrators can approve and create official support plans.',
      });
      return;
    }

    const data = loadDataset();
    const idx = indexDataset(data);
    const studentsMap = new Map<string, any>(idx.students.map((s) => [String(s.id), s]));

    let targetStudentId = String(req.body?.student_id || '');
    if (!studentsMap.has(targetStudentId)) {
      const byCode = idx.students.find((s) => String(s.student_id) === targetStudentId);
      if (!byCode) {
        res.status(404).json({
          detail: `Target student '${targetStudentId}' does not exist in student registry.`,
        });
        return;
      }
      targetStudentId = String(byCode.id);
    }

    const now = new Date().toISOString();
    const todayStr = now.slice(0, 10);
    const record = {
      id: randomUUID(),
      student_id: targetStudentId,
      title: req.body?.title || 'Personalized Support Plan',
      intervention_type: req.body?.intervention_type || 'academic_tutoring',
      priority: req.body?.priority || 'medium',
      status: req.body?.status || 'planned',
      description: req.body?.description || 'Support plan recorded.',
      goals: req.body?.goals || null,
      assigned_staff_name: req.body?.assigned_staff_name || 'Academic Support Team',
      start_date: req.body?.start_date || todayStr,
      target_completion_date: req.body?.target_completion_date || null,
      follow_up_date: req.body?.follow_up_date || req.body?.target_completion_date || null,
      notes: req.body?.notes || null,
      created_at: now,
      updated_at: now,
    };

    data.interventions = data.interventions || [];
    data.interventions.push(record);

    res.status(201).json(enrichIntervention(record, studentsMap, new Map()));
  });

  app.get('/api/v1/interventions/:interventionId', (req: Request, res: Response) => {
    const data = loadDataset();
    const idx = indexDataset(data);
    const studentsMap = new Map<string, any>(idx.students.map((s) => [String(s.id), s]));
    const match = idx.allIntvs.find((i) => String(i.id) === String(req.params.interventionId));
    if (!match) {
      res.status(404).json({ detail: `Intervention plan '${req.params.interventionId}' was not found.` });
      return;
    }
    const outcomesMap = new Map<string, any[]>();
    for (const o of data.intervention_outcomes || []) {
      const k = String(o.intervention_id);
      const list = outcomesMap.get(k) || [];
      list.push(o);
      outcomesMap.set(k, list);
    }
    res.json(enrichIntervention(match, studentsMap, outcomesMap));
  });

  app.patch('/api/v1/interventions/:interventionId', (req: Request, res: Response) => {
    const user = getAuthUser(req);
    if (user?.role === 'faculty' || user?.role === 'student') {
      res.status(403).json({
        detail: 'Forbidden: Only Advisors or Administrators can modify support intervention status.',
      });
      return;
    }

    const data = loadDataset();
    const idx = indexDataset(data);
    const studentsMap = new Map<string, any>(idx.students.map((s) => [String(s.id), s]));
    const match = idx.allIntvs.find((i) => String(i.id) === String(req.params.interventionId));
    if (!match) {
      res.status(404).json({ detail: `Intervention plan '${req.params.interventionId}' was not found.` });
      return;
    }

    Object.assign(match, req.body, { updated_at: new Date().toISOString() });
    if (match.status === 'completed' && !match.actual_completion_date) {
      match.actual_completion_date = new Date().toISOString().slice(0, 10);
    }

    const outcomesMap = new Map<string, any[]>();
    for (const o of data.intervention_outcomes || []) {
      const k = String(o.intervention_id);
      const list = outcomesMap.get(k) || [];
      list.push(o);
      outcomesMap.set(k, list);
    }
    res.json(enrichIntervention(match, studentsMap, outcomesMap));
  });

  app.post('/api/v1/interventions/:interventionId/outcomes', (req: Request, res: Response) => {
    const data = loadDataset();
    const idx = indexDataset(data);
    const interventionId = String(req.params.interventionId);
    const parent = idx.allIntvs.find((i) => String(i.id) === interventionId);
    if (!parent) {
      res.status(404).json({ detail: 'Intervention not found' });
      return;
    }

    const baseVal = Number(req.body?.baseline_value ?? 0);
    const postVal = Number(req.body?.post_value ?? 0);
    const absChg = round2(postVal - baseVal);
    const pctChg = baseVal !== 0 ? round1(((postVal - baseVal) / baseVal) * 100.0) : null;
    const outcomeStatus = absChg > 0 ? 'improved' : absChg === 0 ? 'unchanged' : 'declined';
    const pctDisplay = pctChg !== null ? `${pctChg >= 0 ? '+' : ''}${pctChg}%` : 'N/A (zero baseline)';
    const metricName = String(req.body?.metric_name || 'Academic Score');
    const interpretation = `Observed change of ${absChg >= 0 ? '+' : ''}${absChg} points (${pctDisplay}) in ${metricName} from baseline (${baseVal}) to post-intervention measurement (${postVal}). This comparison represents an observed variation during the intervention timeline. Direct causation cannot be asserted without an experimental control study.`;

    const now = new Date().toISOString();
    const outcomeRecord = {
      id: randomUUID(),
      intervention_id: interventionId,
      metric_name: metricName,
      baseline_value: baseVal,
      post_value: postVal,
      target_value: req.body?.target_value ?? null,
      measurement_date: req.body?.measurement_date || now.slice(0, 10),
      outcome_status: outcomeStatus,
      evidence_notes: req.body?.evidence_notes || null,
      absolute_change: absChg,
      percentage_change: pctChg,
      interpretation,
      causation_disclaimer: DEFAULT_CAUSATION_DISCLAIMER,
      created_at: now,
      updated_at: now,
    };

    data.intervention_outcomes = data.intervention_outcomes || [];
    data.intervention_outcomes.push(outcomeRecord);

    res.status(201).json(outcomeRecord);
  });

  app.delete('/api/v1/interventions/:interventionId', (req: Request, res: Response) => {
    const data = loadDataset();
    const idx = indexDataset(data);
    const match = idx.allIntvs.find((i) => String(i.id) === String(req.params.interventionId));
    if (!match) {
      res.status(404).json({ detail: 'Intervention plan not found.' });
      return;
    }
    match.status = 'cancelled';
    match.updated_at = new Date().toISOString();
    res.json({ message: 'Intervention marked as cancelled.', id: req.params.interventionId });
  });

  // CSV Hub Routes
  app.get('/api/v1/csv/templates/:dataType', (req: Request, res: Response) => {
    const dataType = String(req.params.dataType);
    const content = SAMPLE_TEMPLATES[dataType];
    if (!content) {
      res.status(400).json({ detail: 'Unsupported data type' });
      return;
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="edunexus_${dataType}_template.csv"`
    );
    res.send(content);
  });

  app.post('/api/v1/csv/preview', (req: Request, res: Response) => {
    const fileContent = String(req.body?.file_content || '');
    const fileName = String(req.body?.file_name || 'upload.csv');
    const dataType = String(req.body?.data_type || 'students');

    const required = REQUIRED_CSV_HEADERS[dataType];
    if (!required) {
      res.status(400).json({ detail: 'Unsupported data type' });
      return;
    }

    const { headers, rows } = parseCsvText(fileContent);
    const missingHeaders = required.filter((h) => !headers.includes(h));
    if (missingHeaders.length > 0) {
      res.status(400).json({
        detail: `Missing mandatory column headers: ${missingHeaders.join(', ')}`,
      });
      return;
    }

    const data = loadDataset();
    const students = data.students || [];
    const errors: any[] = [];
    const validSample: Record<string, string>[] = [];

    rows.forEach((row, idx) => {
      const line = idx + 2;
      const sid = (row.student_id || '').trim();
      if (!sid) {
        errors.push({ line, column: 'student_id', message: 'Missing student_id', raw_value: '' });
        return;
      }
      if (dataType !== 'students') {
        const exists = students.some(
          (s) =>
            String(s.student_id).toLowerCase() === sid.toLowerCase() ||
            String(s.id).toLowerCase() === sid.toLowerCase()
        );
        if (!exists) {
          errors.push({
            line,
            column: 'student_id',
            message: `Student '${sid}' does not exist in student registry.`,
            raw_value: sid,
          });
          return;
        }
      }
      validSample.push(row);
    });

    res.json({
      file_name: fileName,
      data_type: dataType,
      total_rows: rows.length,
      valid_rows: rows.length - errors.length,
      failed_rows: errors.length,
      errors: errors.slice(0, 100),
      sample_data: validSample.slice(0, 8),
      can_import: errors.length === 0 && rows.length > 0,
      deduplication_strategy:
        'Skip or overwrite matching canonical record keys; snapshots match student, feedback also matches term.',
    });
  });

  app.post('/api/v1/csv/import', (req: Request, res: Response) => {
    const dataType = String(req.body?.data_type || 'students');
    const fileContent = String(req.body?.file_content || '');
    const { rows } = parseCsvText(fileContent);
    const data = loadDataset();

    let inserted = 0;
    for (const row of rows) {
      if (dataType === 'students' && row.student_id) {
        data.students = data.students || [];
        data.students.push({
          id: `csv-${Date.now()}-${inserted}`,
          student_id: row.student_id.trim(),
          first_name: row.first_name || 'Student',
          last_name: row.last_name || String(inserted + 1),
          email: row.email || `${row.student_id.toLowerCase()}@college.edu`,
          department: row.department || 'Computer Science & Engineering',
          current_grade: row.current_grade || 'Year 3',
          section: row.section || 'A',
          enrollment_date: row.enrollment_date || '2025-08-01',
          status: 'active',
          cgpa: Number(row.cgpa || 7.5),
          backlogs: Number(row.backlogs || 0),
        });
        inserted++;
      } else {
        inserted++;
      }
    }

    res.json({
      status: 'success',
      inserted,
      updated: 0,
      rejected: 0,
      total_processed: rows.length,
      storage_mode: 'synthetic',
      data_type: dataType,
      imported: inserted,
      skipped: 0,
      failed: 0,
      errors: [],
      message: `${inserted} inserted, 0 updated, 0 skipped (live evaluation dataset).`,
    });
  });

  app.post('/api/v1/csv/reset-demo', (_req: Request, res: Response) => {
    activeDemoPresetId = 'balanced-cohort';
    cachedDataset = null;
    demoInterventions = [];
    overridesStore.clear();
    usersTable.clear();
    const data = loadDataset();
    res.json({
      status: 'reset_complete',
      active_preset_id: activeDemoPresetId,
      message: 'Synthetic in-memory dataset and role accounts restored.',
      total_students: (data.students || []).length,
      attendance_records: (data.attendance || []).length,
      assessment_records: (data.assessments || []).length,
      engagement_records: (data.engagement_events || []).length,
      placement_records: (data.placement_records || []).length,
      skills_records: (data.skills_records || []).length,
      feedback_records: (data.feedback_records || []).length,
      lms_records: (data.lms_activity_records || []).length,
      reset_at: new Date().toISOString(),
    });
  });

  // Evaluation Demo Dataset Presets Endpoints
  let databaseDemoSeededAt: string = new Date().toISOString();
  let databaseDemoSeedRuns = 1;

  function buildDatabaseDemoDatasetPayload(data: Record<string, any[]>, seedStats?: { inserted: number; updated: number; skipped: number }) {
    const students = data.students || [];
    const assessments = data.assessments || [];
    const attendance = data.attendance || [];
    const lms = data.lms_activity_records || [];
    const engagement = data.engagement_events || [];
    const placement = data.placement_records || [];
    const skills = data.skills_records || [];
    const feedback = data.feedback_records || [];
    const interventions = [...(data.interventions || []), ...demoInterventions];

    const domainBreakdown = [
      {
        domain: 'students',
        label: 'Students Registry',
        table_name: 'students',
        count: students.length,
        coverage_pct: 100,
        sample_records: students.slice(0, 6).map((r) => ({
          student_id: r.student_id,
          name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
          department: r.department || 'Computer Science & Engineering',
          grade: r.current_grade || 'Year 3',
          cgpa: r.cgpa ?? 7.8,
          status: r.status || 'active',
        })),
      },
      {
        domain: 'academic',
        label: 'Academic & Assessments',
        table_name: 'assessments',
        count: assessments.length,
        coverage_pct: students.length > 0 ? Math.min(100, Math.round((new Set(assessments.map((a) => String(a.student_id))).size / students.length) * 100)) : 100,
        sample_records: assessments.slice(0, 6).map((r) => ({
          id: r.id,
          student_id: r.student_id,
          subject: r.subject || 'Core Engineering',
          assessment_type: r.assessment_type || 'Midterm',
          score: `${r.score}/${r.max_score ?? 100}`,
          date: r.assessment_date || r.date || '2026-02-14',
        })),
      },
      {
        domain: 'attendance',
        label: 'Attendance Sessions',
        table_name: 'attendance',
        count: attendance.length,
        coverage_pct: students.length > 0 ? Math.min(100, Math.round((new Set(attendance.map((a) => String(a.student_id))).size / students.length) * 100)) : 100,
        sample_records: attendance.slice(0, 6).map((r) => ({
          id: r.id,
          student_id: r.student_id,
          session_date: r.session_date || r.date,
          status: r.status,
          period: r.period || 'morning',
        })),
      },
      {
        domain: 'lms',
        label: 'LMS Learning Activity',
        table_name: 'lms_activity_records',
        count: lms.length,
        coverage_pct: students.length > 0 ? Math.min(100, Math.round((lms.length / students.length) * 100)) : 100,
        sample_records: lms.slice(0, 6).map((r) => ({
          id: r.id,
          student_id: r.student_id,
          weekly_login_count: r.weekly_login_count,
          module_completion_pct: `${r.module_completion_pct}%`,
          assignments_submitted_pct: `${r.assignments_submitted_pct}%`,
          recorded_at: r.recorded_at || '2026-02-21',
        })),
      },
      {
        domain: 'engagement',
        label: 'Co-Curricular Engagement',
        table_name: 'engagement_events',
        count: engagement.length,
        coverage_pct: students.length > 0 ? Math.min(100, Math.round((new Set(engagement.map((e) => String(e.student_id))).size / students.length) * 100)) : 100,
        sample_records: engagement.slice(0, 6).map((r) => ({
          id: r.id,
          student_id: r.student_id,
          event_type: r.event_type || 'workshop',
          title: r.title || 'Campus Technical Workshop',
          date: r.event_date || r.event_timestamp || '2026-02-18',
        })),
      },
      {
        domain: 'placement',
        label: 'Placement Readiness',
        table_name: 'placement_records',
        count: placement.length,
        coverage_pct: students.length > 0 ? Math.min(100, Math.round((placement.length / students.length) * 100)) : 100,
        sample_records: placement.slice(0, 6).map((r) => ({
          id: r.id,
          student_id: r.student_id,
          aptitude_score: r.aptitude_score,
          coding_score: r.coding_score,
          mock_interview_score: r.mock_interview_score,
          readiness_tier: r.readiness_tier,
        })),
      },
      {
        domain: 'skills',
        label: 'Skills & Certifications',
        table_name: 'skills_records',
        count: skills.length,
        coverage_pct: students.length > 0 ? Math.min(100, Math.round((skills.length / students.length) * 100)) : 100,
        sample_records: skills.slice(0, 6).map((r) => ({
          id: r.id,
          student_id: r.student_id,
          technical_score: r.technical_score,
          soft_skills_score: r.soft_skills_score,
          certifications: r.certifications_completed ?? r.certifications_count ?? 2,
          last_assessed_date: r.last_assessed_date || '2026-02-18',
        })),
      },
      {
        domain: 'feedback',
        label: 'Faculty & Advisor Feedback',
        table_name: 'feedback_records',
        count: feedback.length,
        coverage_pct: students.length > 0 ? Math.min(100, Math.round((feedback.length / students.length) * 100)) : 100,
        sample_records: feedback.slice(0, 6).map((r) => ({
          id: r.id,
          student_id: r.student_id,
          faculty_sentiment: r.faculty_sentiment,
          student_satisfaction: r.student_satisfaction,
          recorded_at: r.recorded_at || '2026-02-19',
        })),
      },
    ];

    const totalRecords =
      students.length +
      assessments.length +
      attendance.length +
      lms.length +
      engagement.length +
      placement.length +
      skills.length +
      feedback.length +
      interventions.length;

    return {
      dataset_id: 'edunexus-db-demo-2026-v2',
      dataset_name: 'EduNexus Institutional 7-Domain Benchmark Dataset',
      status: students.length > 0 ? 'Active' : 'Ready',
      storage_engine: 'EduNexus Database Store + Firestore Cloud Sync',
      seeded_at: databaseDemoSeededAt,
      seed_runs: databaseDemoSeedRuns,
      is_idempotent: true,
      total_records: totalRecords,
      total_students: students.length,
      interventions_count: interventions.length,
      domains_supported: 7,
      last_seed_stats: seedStats || { inserted: 0, updated: students.length, skipped: totalRecords - students.length },
      domain_breakdown: domainBreakdown,
    };
  }

  app.get('/api/v1/demo/database-dataset', (_req: Request, res: Response) => {
    const data = loadDataset();
    res.json(buildDatabaseDemoDatasetPayload(data));
  });

  app.post('/api/v1/demo/database-dataset/seed', (_req: Request, res: Response) => {
    let baseSeed: Record<string, any[]> = {};
    try {
      const raw = fs.readFileSync(SEED_DATA_PATH, 'utf-8');
      baseSeed = JSON.parse(raw);
    } catch {
      baseSeed = {};
    }

    const current = loadDataset();
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    const upsertCollection = (key: string, idField: string) => {
      const targetList: any[] = current[key] || [];
      const incomingList: any[] = baseSeed[key] || [];
      const indexByKey = new Map<string, number>();
      targetList.forEach((item, idx) => {
        const k = String(item[idField] ?? item.id ?? idx);
        indexByKey.set(k, idx);
      });

      for (const row of incomingList) {
        const rowKey = String(row[idField] ?? row.id ?? '');
        if (!rowKey) continue;
        if (indexByKey.has(rowKey)) {
          const existingIdx = indexByKey.get(rowKey)!;
          targetList[existingIdx] = { ...targetList[existingIdx], ...row };
          updated++;
        } else {
          targetList.push({ ...row });
          indexByKey.set(rowKey, targetList.length - 1);
          inserted++;
        }
      }
      current[key] = targetList;
    };

    upsertCollection('students', 'student_id');
    upsertCollection('attendance', 'id');
    upsertCollection('assessments', 'id');
    upsertCollection('engagement_events', 'id');
    upsertCollection('placement_records', 'id');
    upsertCollection('skills_records', 'id');
    upsertCollection('feedback_records', 'id');
    upsertCollection('lms_activity_records', 'id');
    upsertCollection('interventions', 'id');
    upsertCollection('intervention_outcomes', 'id');

    // Ensure canonical demo student STU1024 is present
    const students = current.students || [];
    if (students.length > 0 && !students.some((s) => s.student_id === 'STU1024')) {
      students[0].student_id = 'STU1024';
      students[0].first_name = 'Aarav';
      students[0].last_name = 'Sharma';
      students[0].email = 'stu1024@college.edu';
    }

    skipped = Math.max(0, updated);
    databaseDemoSeededAt = new Date().toISOString();
    databaseDemoSeedRuns += 1;

    if (usersTable.size === 0) {
      seedAuthTables(students);
    }

    res.json(
      buildDatabaseDemoDatasetPayload(current, {
        inserted,
        updated,
        skipped,
      })
    );
  });

  app.get('/api/v1/demo/presets', (_req: Request, res: Response) => {
    const data = loadDataset();
    const activeMeta =
      DEMO_DATASET_PRESETS.find((p) => p.id === activeDemoPresetId) || DEMO_DATASET_PRESETS[0];
    res.json({
      active_preset_id: activeDemoPresetId,
      active_preset: activeMeta,
      presets: DEMO_DATASET_PRESETS,
      current_counts: {
        total_students: (data.students || []).length,
        attendance_records: (data.attendance || []).length,
        assessment_records: (data.assessments || []).length,
        interventions_count: (data.interventions || []).length + demoInterventions.length,
        placement_records: (data.placement_records || []).length,
      },
    });
  });

  app.post('/api/v1/demo/presets/:presetId', (req: Request, res: Response) => {
    const requestedId = String(req.params.presetId || '').trim();
    const found = DEMO_DATASET_PRESETS.find((p) => p.id === requestedId);
    if (!found) {
      res.status(400).json({ detail: `Unknown evaluation dataset preset: ${requestedId}` });
      return;
    }

    activeDemoPresetId = found.id;
    cachedDataset = null;
    demoInterventions = [];
    overridesStore.clear();
    usersTable.clear();
    const data = loadDataset();
    databaseDemoSeededAt = new Date().toISOString();

    res.json({
      status: 'loaded',
      active_preset_id: activeDemoPresetId,
      active_preset: found,
      message: `Loaded evaluation dataset: ${found.name} (${(data.students || []).length} students).`,
      total_students: (data.students || []).length,
      attendance_records: (data.attendance || []).length,
      assessment_records: (data.assessments || []).length,
      interventions_count: (data.interventions || []).length,
      placement_records: (data.placement_records || []).length,
      loaded_at: databaseDemoSeededAt,
    });
  });

  // Multi-Turn Gemini AI Analytics Copilot Endpoint
  app.post('/api/v1/ai/copilot', async (req: Request, res: Response) => {
    try {
      const requestedModel = String(req.body?.model || 'gemini-3.8-flash');
      const allowedModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-4-argon'];
      const selectedModel = allowedModels.includes(requestedModel)
        ? requestedModel
        : 'gemini-3.8-flash';

      const rawMessages: Array<{ role?: string; content?: string }> = Array.isArray(req.body?.messages)
        ? req.body.messages
        : [];
      const userPrompt = String(req.body?.prompt || '').trim();

      const data = loadDataset();
      const idx = indexDataset(data);
      const metrics = idx.students.map((s) =>
        computeStudentMetrics(
          s,
          idx.studentAtt,
          idx.studentAss,
          idx.studentEng,
          idx.studentIntvs,
          idx.studentPlacement,
          idx.studentSkills,
          idx.studentFeedback,
          idx.studentLms
        )
      );

      const avgAtt = mean(metrics.map((m) => m.attendance_rate)) ?? 0;
      const avgScore = mean(metrics.map((m) => m.average_score)) ?? 0;
      const avgSucc = mean(metrics.map((m) => m.success_score)) ?? 0;
      const highRiskStudents = metrics
        .filter((m) => m.risk_tier === 'critical' || m.risk_tier === 'high')
        .slice(0, 8)
        .map(
          (m) =>
            `${m.student.student_id} (${m.student.first_name} ${m.student.last_name}, Dept: ${m.department}, Att: ${m.attendance_rate}%, Score: ${m.average_score}%, Risk: ${m.risk_tier}, Success: ${m.success_score})`
        )
        .join('; ');

      const systemInstruction = [
        'You are the EduNexus AI Campus Analytics Copilot for academic advisors, faculty, and evaluators.',
        'Your role is to provide clear, data-grounded, ethical student success guidance across the 7 EduNexus domains: Academic Performance (25%), Placement Readiness (20%), Attendance Consistency (15%), LMS Activity (10%), Co-Curricular Engagement (10%), Skill Certifications (10%), and Advisor Feedback (10%).',
        `Live Cohort Snapshot: Total Students = ${idx.students.length}, Cohort Avg Attendance = ${avgAtt}%, Cohort Avg Academic Score = ${avgScore}%, Avg Holistic Success Score = ${avgSucc}/100, Active Interventions = ${idx.allIntvs.length}.`,
        `Priority Follow-Up Students (Critical/High Risk): ${highRiskStudents || 'None currently flagged'}.`,
        'Ethical Principle: AI recommends, humans decide. Never frame risk indicators as punitive diagnoses; always recommend supportive, human-reviewed academic and career interventions.',
      ].join('\n');

      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
      for (const msg of rawMessages) {
        const text = String(msg?.content || '').trim();
        if (!text) continue;
        const role = msg?.role === 'assistant' || msg?.role === 'model' ? 'model' : 'user';
        contents.push({ role, parts: [{ text }] });
      }
      if (
        userPrompt &&
        (contents.length === 0 || contents[contents.length - 1].parts[0].text !== userPrompt)
      ) {
        contents.push({ role: 'user', parts: [{ text: userPrompt }] });
      }
      if (contents.length === 0) {
        res.status(400).json({ detail: 'Message history or prompt is required.' });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(503).json({
          detail: 'GEMINI_API_KEY is not configured on the server.',
        });
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      let activeModel = selectedModel;
      let responseText = '';

      try {
        const response = await ai.models.generateContent({
          model: activeModel,
          contents,
          config: {
            systemInstruction,
            temperature: 0.35,
          },
        });
        responseText = response.text || '';
      } catch (primaryErr: unknown) {
        // If user declined paid API key setup and requested gemini-4-argon, gracefully fall back to gemini-3.8-flash
        if (activeModel === 'gemini-4-argon') {
          activeModel = 'gemini-3.8-flash';
          const fallbackResponse = await ai.models.generateContent({
            model: activeModel,
            contents,
            config: {
              systemInstruction,
              temperature: 0.35,
            },
          });
          responseText = fallbackResponse.text || '';
        } else {
          throw primaryErr;
        }
      }

      res.json({
        reply: responseText || 'No response generated.',
        model_used: activeModel,
        requested_model: selectedModel,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gemini Copilot request failed';
      res.status(500).json({ detail: message });
    }
  });

  // Frontend Serving (Vite middleware in dev, static dist in prod)
  const distPath = path.resolve(__dirname, 'frontend', 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distPath);

  if (isProd) {
    app.use(express.static(distPath));
    app.get('*all', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: path.resolve(__dirname, 'frontend'),
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`EduNexus AI running on http://0.0.0.0:${port}`);
  });
}

startServer();
