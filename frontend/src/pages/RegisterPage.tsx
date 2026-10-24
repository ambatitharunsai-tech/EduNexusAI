import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  GraduationCap,
  Hash,
  Lock,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  User,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../context';
import { cn } from '../lib/utils';

type RegisterRole = 'student' | 'advisor' | 'faculty';

const SAMPLE_STUDENT_IDS = [
  { id: 'STU1024', label: 'STU1024 · Aarav Sharma (CSE)' },
  { id: 'STU1001', label: 'STU1001 · Diya Patel (CSE)' },
  { id: 'STU1005', label: 'STU1005 · Rohan Verma (ECE)' },
  { id: 'STU1012', label: 'STU1012 · Ananya Iyer (AIML)' },
];

const DEPARTMENTS = ['CSE', 'AIML', 'ECE', 'IT', 'MECH'];

export interface RegisterPageProps {
  theme?: 'light' | 'dark';
  onThemeChange?: (theme: 'light' | 'dark') => void;
  themePreference?: 'system' | 'dark' | 'light';
  onThemePreferenceChange?: (pref: 'system' | 'dark' | 'light') => void;
  accentColor?: string;
  onAccentColorChange?: (color: any) => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({
  theme = 'dark',
  onThemeChange,
  themePreference: _themePreference = 'dark',
  onThemePreferenceChange: _onThemePreferenceChange,
  accentColor: _accentColor = 'monochrome',
  onAccentColorChange: _onAccentColorChange,
}) => {
  const navigate = useNavigate();
  const { signIn, signInWithGoogle } = useAuth();

  const [role, setRole] = useState<RegisterRole>('student');
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [department, setDepartment] = useState<string>('CSE');
  const [studentId, setStudentId] = useState<string>('STU1024');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [consentAccepted, setConsentAccepted] = useState<boolean>(true);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedStudentId = studentId.trim().toUpperCase();

    if (trimmedName.length < 2) {
      setErrorMessage('Please enter your full name (at least 2 characters).');
      return;
    }

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMessage('Please enter a valid institutional email address.');
      return;
    }

    if (role === 'student' && !trimmedStudentId) {
      setErrorMessage('Please provide a Student ID / Roll Number (e.g., STU1024) to link your academic telemetry.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify your password confirmation.');
      return;
    }

    if (role === 'student' && !consentAccepted) {
      setErrorMessage('Please accept the Ethical Student Telemetry & Privacy Notice to create a student account.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: trimmedName,
          email: trimmedEmail,
          password,
          role,
          department,
          student_id: role === 'student' ? trimmedStudentId : undefined,
          consent_accepted: consentAccepted,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(
          typeof data.detail === 'string'
            ? data.detail
            : 'Unable to complete registration. Please check your details and try again.'
        );
        return;
      }

      const token = String(data.access_token || `edunexus-registered-${role}-token`);
      const userObj = data.user || {};
      signIn(token, {
        userId: String(userObj.id || `usr-${role}`),
        email: String(userObj.email || trimmedEmail),
        role: String(userObj.role || role),
        isDemoSession: false,
      });

      navigate('/');
    } catch {
      setErrorMessage('Unable to reach the registration service. Please verify your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignUp = async () => {
    if (!signInWithGoogle) return;
    setErrorMessage(null);
    setIsGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result) {
        navigate('/');
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Google Sign-In popup was closed or blocked by the browser.'
      );
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#09090b] text-slate-900 dark:text-[#f4f4f5] flex flex-col justify-between transition-colors">
      {/* Top Institutional Bar (3-Zone Contract) */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121215]">
        <Link
          to="/"
          className="flex items-center gap-2.5 text-base font-bold tracking-tight text-slate-900 dark:text-[#f4f4f5] whitespace-nowrap shrink-0"
        >
          <span className="w-8 h-8 bg-zinc-900 dark:bg-[#f4f4f5] flex items-center justify-center text-white dark:text-[#09090b]">
            <GraduationCap className="w-4 h-4" aria-hidden="true" />
          </span>
          <span>EduNexus AI</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600 dark:text-[#d4d4d8]">
          <Link to="/" className="hover:text-slate-900 dark:hover:text-[#f4f4f5] transition-colors whitespace-nowrap shrink-0">
            Executive Dashboard
          </Link>
          <Link to="/students" className="hover:text-slate-900 dark:hover:text-[#f4f4f5] transition-colors whitespace-nowrap shrink-0">
            Students Directory
          </Link>
          <Link to="/login?switch=true" className="hover:text-slate-900 dark:hover:text-[#f4f4f5] transition-colors whitespace-nowrap shrink-0">
            Sign In
          </Link>
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          {onThemeChange && (
            <button
              type="button"
              onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Switch appearance theme"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#18181c] text-slate-800 dark:text-[#f4f4f5] hover:bg-slate-100 dark:hover:bg-[#222227] transition-colors whitespace-nowrap shrink-0"
            >
              {theme === 'dark' ? (
                <>
                  <Moon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Black Mode</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span className="hidden sm:inline">Pure White</span>
                </>
              )}
            </button>
          )}
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#18181c] text-slate-800 dark:text-[#f4f4f5] hover:bg-slate-100 dark:hover:bg-[#222227] transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Public Dashboard
          </Link>
        </div>
      </header>

      {/* Main Split-Screen Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8 page-enter">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 items-stretch border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121215] shadow-sm">
          {/* Left Column: Onboarding Value & Role Capabilities */}
          <section className="lg:col-span-5 p-6 sm:p-10 bg-zinc-950 dark:bg-[#0c0c0f] text-white border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-[#27272a] flex flex-col justify-between">
            <div className="space-y-6">
              <div className="text-xs font-medium text-zinc-400 tracking-wide uppercase">
                Institutional Onboarding · EduNexus AI
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight">
                Create Your Smart Campus Analytics Account
              </h1>

              <p className="text-sm text-zinc-300 leading-relaxed">
                Register as a Student, Academic Advisor, or Faculty member to personalize your EduNexus AI workspace and synchronize support actions.
              </p>

              <div className="pt-4 border-t border-zinc-800 dark:border-[#27272a] space-y-3">
                <div className="text-xs font-semibold text-zinc-200">
                  Role-Scoped Capabilities
                </div>
                <div className="space-y-2.5 text-xs text-zinc-300">
                  <div className="p-3 bg-zinc-900/90 dark:bg-[#141418] border border-zinc-800 dark:border-[#27272a]">
                    <div className="font-semibold text-zinc-100">Student Account</div>
                    <p className="text-zinc-400 mt-1 leading-relaxed">
                      Link your Roll Number / Student ID (e.g., STU1024) to track your 7-domain success score, attendance velocity, and advisor support plans.
                    </p>
                  </div>
                  <div className="p-3 bg-zinc-900/90 dark:bg-[#141418] border border-zinc-800 dark:border-[#27272a]">
                    <div className="font-semibold text-zinc-100">Academic Advisor Account</div>
                    <p className="text-zinc-400 mt-1 leading-relaxed">
                      Review holistic risk explanations, record human-reviewed tier overrides, and launch structured student interventions.
                    </p>
                  </div>
                  <div className="p-3 bg-zinc-900/90 dark:bg-[#141418] border border-zinc-800 dark:border-[#27272a]">
                    <div className="font-semibold text-zinc-100">Faculty Account</div>
                    <p className="text-zinc-400 mt-1 leading-relaxed">
                      Monitor course rosters, assessment trends, and log early academic or attendance observations for advisor follow-up.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-zinc-800 dark:border-[#27272a] space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Consent-Driven Student Privacy</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Students retain full visibility into their telemetry factors and can review or update their privacy consent at any time.
              </p>
            </div>
          </section>

          {/* Right Column: Registration Form */}
          <section className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-between">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-[#f4f4f5]">
                    Register Institutional Account
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-[#a1a1aa] mt-1">
                    Choose your role and complete the fields below to activate your workspace.
                  </p>
                </div>
                <Link
                  to="/login?switch=true"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 dark:text-[#f4f4f5] hover:underline whitespace-nowrap shrink-0"
                >
                  <span>Already registered? Sign in</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Role Selection Tabs */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-[#d4d4d8] mb-2">
                  1. Select Account Role
                </label>
                <div
                  role="tablist"
                  aria-label="Registration role selector"
                  className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-[#18181c] border border-slate-200 dark:border-[#27272a]"
                >
                  {(
                    [
                      { id: 'student', label: 'Student' },
                      { id: 'advisor', label: 'Academic Advisor' },
                      { id: 'faculty', label: 'Faculty' },
                    ] as const
                  ).map((item) => {
                    const active = role === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => {
                          setRole(item.id);
                          setErrorMessage(null);
                        }}
                        className={cn(
                          'py-2 px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0',
                          active
                            ? 'bg-zinc-900 dark:bg-[#f4f4f5] text-white dark:text-[#09090b] shadow-2xs'
                            : 'text-slate-600 dark:text-[#d4d4d8] hover:text-slate-900 dark:hover:text-[#f4f4f5]'
                        )}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  className="p-3 border border-rose-300 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/40 text-xs font-medium text-rose-800 dark:text-rose-300"
                >
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="register-fullname"
                      className="block text-xs font-semibold text-slate-700 dark:text-[#d4d4d8] mb-1.5"
                    >
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 dark:text-[#a1a1aa] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="register-fullname"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder={role === 'student' ? 'Aarav Sharma' : 'Dr. Kavita Menon'}
                        autoComplete="name"
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 dark:border-[#27272a] bg-white dark:bg-[#18181c] text-slate-900 dark:text-[#f4f4f5] placeholder:text-slate-400 dark:placeholder:text-[#71717a] focus:border-zinc-900 dark:focus:border-[#e4e4e7] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="register-department"
                      className="block text-xs font-semibold text-slate-700 dark:text-[#d4d4d8] mb-1.5"
                    >
                      Academic Department
                    </label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 text-slate-400 dark:text-[#a1a1aa] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <select
                        id="register-department"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 dark:border-[#27272a] bg-white dark:bg-[#18181c] text-slate-900 dark:text-[#f4f4f5] focus:border-zinc-900 dark:focus:border-[#e4e4e7] focus:outline-none"
                      >
                        {DEPARTMENTS.map((dept) => (
                          <option key={dept} value={dept}>
                            {dept} Department
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="register-email"
                    className="block text-xs font-semibold text-slate-700 dark:text-[#d4d4d8] mb-1.5"
                  >
                    Institutional Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 dark:text-[#a1a1aa] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="register-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@college.edu"
                      autoComplete="email"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 dark:border-[#27272a] bg-white dark:bg-[#18181c] text-slate-900 dark:text-[#f4f4f5] placeholder:text-slate-400 dark:placeholder:text-[#71717a] focus:border-zinc-900 dark:focus:border-[#e4e4e7] focus:outline-none"
                    />
                  </div>
                </div>

                {role === 'student' && (
                  <div className="p-3.5 border border-slate-200 dark:border-[#27272a] bg-slate-50/70 dark:bg-[#18181c] space-y-2.5">
                    <label
                      htmlFor="register-student-id"
                      className="block text-xs font-semibold text-slate-800 dark:text-[#f4f4f5]"
                    >
                      Student ID / Roll Number Link
                    </label>
                    <div className="relative">
                      <Hash className="w-4 h-4 text-slate-400 dark:text-[#a1a1aa] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="register-student-id"
                        type="text"
                        value={studentId}
                        onChange={(e) => setStudentId(e.target.value.toUpperCase())}
                        placeholder="e.g. STU1024"
                        className="w-full pl-9 pr-3 py-1.5 text-sm font-mono tabular-nums border border-slate-300 dark:border-[#27272a] bg-white dark:bg-[#121215] text-slate-900 dark:text-[#f4f4f5] focus:border-zinc-900 dark:focus:border-[#e4e4e7] focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[11px] text-slate-500 dark:text-[#a1a1aa]">
                        Link sample cohort ID:
                      </span>
                      {SAMPLE_STUDENT_IDS.map((sample) => (
                        <button
                          key={sample.id}
                          type="button"
                          onClick={() => setStudentId(sample.id)}
                          className={cn(
                            'px-2 py-0.5 text-[11px] font-mono tabular-nums border transition-colors whitespace-nowrap shrink-0',
                            studentId === sample.id
                              ? 'border-zinc-900 dark:border-[#f4f4f5] bg-zinc-900 dark:bg-[#f4f4f5] text-white dark:text-[#09090b] font-semibold'
                              : 'border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121215] text-slate-600 dark:text-[#d4d4d8] hover:border-slate-300'
                          )}
                        >
                          {sample.id}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="register-password"
                      className="block text-xs font-semibold text-slate-700 dark:text-[#d4d4d8] mb-1.5"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 dark:text-[#a1a1aa] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="register-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 6 characters"
                        autoComplete="new-password"
                        className="w-full pl-9 pr-9 py-2 text-sm border border-slate-300 dark:border-[#27272a] bg-white dark:bg-[#18181c] text-slate-900 dark:text-[#f4f4f5] placeholder:text-slate-400 dark:placeholder:text-[#71717a] focus:border-zinc-900 dark:focus:border-[#e4e4e7] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-[#f4f4f5]"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="register-confirm-password"
                      className="block text-xs font-semibold text-slate-700 dark:text-[#d4d4d8] mb-1.5"
                    >
                      Confirm Password
                    </label>
                    <div className="relative">
                      <CheckCircle2 className="w-4 h-4 text-slate-400 dark:text-[#a1a1aa] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="register-confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        autoComplete="new-password"
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 dark:border-[#27272a] bg-white dark:bg-[#18181c] text-slate-900 dark:text-[#f4f4f5] placeholder:text-slate-400 dark:placeholder:text-[#71717a] focus:border-zinc-900 dark:focus:border-[#e4e4e7] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {role === 'student' && (
                  <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-[#d4d4d8] cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={consentAccepted}
                      onChange={(e) => setConsentAccepted(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-zinc-900 shrink-0"
                    />
                    <span className="leading-relaxed">
                      I consent to ethical, human-reviewed academic and engagement telemetry processing for personalized student support under the EduNexus AI Governance Charter.
                    </span>
                  </label>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-white dark:text-[#09090b] bg-zinc-900 hover:bg-zinc-800 dark:bg-[#f4f4f5] dark:hover:bg-[#e4e4e7] disabled:opacity-60 transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{isSubmitting ? 'Creating Account…' : 'Create Institutional Account'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isGoogleLoading}
                    onClick={() => void handleGoogleSignUp()}
                    className="w-full py-2.5 px-4 text-xs font-semibold border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#18181c] text-slate-800 dark:text-[#f4f4f5] hover:bg-slate-100 dark:hover:bg-[#222227] disabled:opacity-60 transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                  >
                    <Cloud className="w-4 h-4 text-zinc-700 dark:text-[#d4d4d8]" />
                    <span>{isGoogleLoading ? 'Connecting Google…' : 'Sign Up with Google'}</span>
                  </button>
                </div>
              </form>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-[#27272a] flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-[#a1a1aa]">
              <span>Already have an institutional account?</span>
              <Link
                to="/login?switch=true"
                className="font-semibold text-zinc-900 dark:text-[#f4f4f5] hover:underline"
              >
                Sign in to your workspace →
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
