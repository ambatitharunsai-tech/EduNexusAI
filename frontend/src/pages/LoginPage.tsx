import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Cloud,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Lock,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../context';
import { cn } from '../lib/utils';

type LoginRoleTab = 'advisor' | 'faculty' | 'student' | 'admin';

interface RoleConfig {
  id: LoginRoleTab;
  label: string;
  identifierLabel: string;
  identifierPlaceholder: string;
  demoIdentifier: string;
  demoPassword: string;
  demoName: string;
  demoToken: string;
  otpHint?: string;
}

const ROLE_CONFIGS: RoleConfig[] = [
  {
    id: 'advisor',
    label: 'Advisor',
    identifierLabel: 'Institutional Email',
    identifierPlaceholder: 'advisor@college.edu',
    demoIdentifier: 'advisor@college.edu',
    demoPassword: 'Advisor@2026',
    demoName: 'Dr. Meera Krishnan',
    demoToken: 'edunexus-demo-advisor-token',
  },
  {
    id: 'faculty',
    label: 'Faculty',
    identifierLabel: 'Institutional Email',
    identifierPlaceholder: 'faculty@college.edu',
    demoIdentifier: 'faculty@college.edu',
    demoPassword: 'Faculty@2026',
    demoName: 'Prof. Rajesh Verma',
    demoToken: 'edunexus-demo-faculty-token',
  },
  {
    id: 'student',
    label: 'Student',
    identifierLabel: 'Student Roll Number or Email',
    identifierPlaceholder: 'STU1024 or stu1024@college.edu',
    demoIdentifier: 'STU1024',
    demoPassword: 'Student@2026',
    demoName: 'Aarav Sharma (STU1024)',
    demoToken: 'edunexus-demo-student-token',
  },
  {
    id: 'admin',
    label: 'Admin',
    identifierLabel: 'Administrator Email',
    identifierPlaceholder: 'admin@college.edu',
    demoIdentifier: 'admin@college.edu',
    demoPassword: 'Admin@2026',
    demoName: 'Vikramaditya Rao',
    demoToken: 'edunexus-demo-admin-token',
    otpHint: '202604',
  },
];

export interface LoginPageProps {
  theme?: 'light' | 'dark';
  onThemeChange?: (theme: 'light' | 'dark') => void;
  themePreference?: 'system' | 'dark' | 'light';
  onThemePreferenceChange?: (pref: 'system' | 'dark' | 'light') => void;
  accentColor?: string;
  onAccentColorChange?: (color: any) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  theme = 'dark',
  onThemeChange,
  themePreference: _themePreference = 'dark',
  onThemePreferenceChange: _onThemePreferenceChange,
  accentColor: _accentColor = 'monochrome',
  onAccentColorChange: _onAccentColorChange,
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, signIn, signInWithGoogle } = useAuth();

  // If authenticated with a real non-public session and not explicitly switching accounts, redirect to "/"
  const isSwitchMode = searchParams.get('switch') === 'true';
  const hasExplicitSession = Boolean(
    session && session.token && session.userId !== 'public-workspace'
  );

  const [selectedRole, setSelectedRole] = useState<LoginRoleTab>('advisor');
  const [identifier, setIdentifier] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (hasExplicitSession && !isSwitchMode) {
    return <Navigate to="/" replace />;
  }

  const activeConfig = ROLE_CONFIGS.find((r) => r.id === selectedRole) || ROLE_CONFIGS[0];

  const handleRoleSwitch = (role: LoginRoleTab) => {
    setSelectedRole(role);
    setErrorMessage(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    const trimmedId = identifier.trim();
    if (!trimmedId || !password) {
      setErrorMessage('Please enter both your institutional identifier and password.');
      return;
    }

    if (selectedRole === 'admin' && !otpCode.trim()) {
      setErrorMessage('Administrator sign-in requires the 6-digit One-Time Code (Demo: 202604).');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: trimmedId,
          password,
          expected_role: selectedRole,
          otp_code: selectedRole === 'admin' ? otpCode.trim() : undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(
          typeof data.detail === 'string'
            ? data.detail
            : 'Invalid credentials. Please verify your selected role tab, email/roll number, and password.'
        );
        return;
      }

      const token = String(data.access_token || activeConfig.demoToken);
      const userObj = data.user || {};
      signIn(token, {
        userId: String(userObj.id || `usr-${selectedRole}`),
        email: String(userObj.email || trimmedId),
        role: String(userObj.role || selectedRole),
        isDemoSession: false,
      });

      navigate('/');
    } catch {
      setErrorMessage('Unable to reach the authentication service. Please try again or use a Quick Demo role below.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickDemoLogin = async (cfg: RoleConfig) => {
    setErrorMessage(null);
    setSelectedRole(cfg.id);
    setIdentifier(cfg.demoIdentifier);
    setPassword(cfg.demoPassword);
    if (cfg.otpHint) setOtpCode(cfg.otpHint);

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: cfg.demoIdentifier,
          password: cfg.demoPassword,
          expected_role: cfg.id,
          otp_code: cfg.otpHint,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const token = String(data.access_token || cfg.demoToken);
        const userObj = data.user || {};
        signIn(token, {
          userId: String(userObj.id || `usr-${cfg.id}`),
          email: String(userObj.email || cfg.demoIdentifier),
          role: String(userObj.role || cfg.id),
          isDemoSession: false,
        });
      } else {
        signIn(cfg.demoToken, {
          userId: `usr-${cfg.id}-demo`,
          email: cfg.demoIdentifier.includes('@') ? cfg.demoIdentifier : `${cfg.demoIdentifier.toLowerCase()}@college.edu`,
          role: cfg.id,
          isDemoSession: true,
        });
      }
      navigate('/');
    } catch {
      signIn(cfg.demoToken, {
        userId: `usr-${cfg.id}-demo`,
        email: cfg.demoIdentifier.includes('@') ? cfg.demoIdentifier : `${cfg.demoIdentifier.toLowerCase()}@college.edu`,
        role: cfg.id,
        isDemoSession: true,
      });
      navigate('/');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
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
          <Link to="/register" className="hover:text-slate-900 dark:hover:text-[#f4f4f5] transition-colors whitespace-nowrap shrink-0">
            Create Account
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
          {/* Left Column: Institutional Context & Governance */}
          <section className="lg:col-span-5 p-6 sm:p-10 bg-zinc-950 dark:bg-[#0c0c0f] text-white border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-[#27272a] flex flex-col justify-between">
            <div className="space-y-6">
              <div className="text-xs font-medium text-zinc-400 tracking-wide uppercase">
                Smart Campus Analytics · HacXLerate 2026
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight">
                Sign in to the Student Success Intelligence Workspace
              </h1>

              <p className="text-sm text-zinc-300 leading-relaxed">
                Access role-scoped 7-domain student telemetry, human-reviewed risk explanations, and advisor intervention workflows.
              </p>

              <div className="pt-4 border-t border-zinc-800 dark:border-[#27272a] space-y-4">
                <div className="text-xs font-semibold text-zinc-200">
                  7-Domain Weighted Holistic Model
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs text-zinc-300 font-mono tabular-nums">
                  <div className="p-2.5 bg-zinc-900/90 dark:bg-[#141418] border border-zinc-800 dark:border-[#27272a]">
                    <div className="text-zinc-100 font-bold">25% Academic</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">CGPA & Assessments</div>
                  </div>
                  <div className="p-2.5 bg-zinc-900/90 dark:bg-[#141418] border border-zinc-800 dark:border-[#27272a]">
                    <div className="text-zinc-100 font-bold">20% Placement</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">Coding & Mock Readiness</div>
                  </div>
                  <div className="p-2.5 bg-zinc-900/90 dark:bg-[#141418] border border-zinc-800 dark:border-[#27272a]">
                    <div className="text-zinc-100 font-bold">15% Attendance</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">Session Consistency</div>
                  </div>
                  <div className="p-2.5 bg-zinc-900/90 dark:bg-[#141418] border border-zinc-800 dark:border-[#27272a]">
                    <div className="text-zinc-100 font-bold">40% Co-Curricular</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">LMS · Skills · Feedback</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-zinc-800 dark:border-[#27272a] space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Ethical Decision-Support Guarantee</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                All predictive indicators require human advisor review before intervention planning. Missing telemetry is re-normalized—never penalized.
              </p>
            </div>
          </section>

          {/* Right Column: Authentication Form & Quick Demo Access */}
          <section className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-[#f4f4f5]">
                    Institutional Sign In
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-[#a1a1aa] mt-1">
                    Select your institutional role and enter your credentials or choose a demo role below.
                  </p>
                </div>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 dark:text-[#f4f4f5] hover:underline whitespace-nowrap shrink-0"
                >
                  <span>Create account</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Role Selector Segmented Control */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-[#d4d4d8] mb-2">
                  1. Select Workspace Role
                </label>
                <div
                  role="tablist"
                  aria-label="Institutional role selector"
                  className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-[#18181c] border border-slate-200 dark:border-[#27272a]"
                >
                  {ROLE_CONFIGS.map((role) => {
                    const active = selectedRole === role.id;
                    return (
                      <button
                        key={role.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => handleRoleSwitch(role.id)}
                        className={cn(
                          'py-2 px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0',
                          active
                            ? 'bg-zinc-900 dark:bg-[#f4f4f5] text-white dark:text-[#09090b] shadow-2xs'
                            : 'text-slate-600 dark:text-[#d4d4d8] hover:text-slate-900 dark:hover:text-[#f4f4f5]'
                        )}
                      >
                        {role.label}
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

              {/* Credential Form */}
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="login-identifier"
                    className="block text-xs font-semibold text-slate-700 dark:text-[#d4d4d8] mb-1.5"
                  >
                    {activeConfig.identifierLabel}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 dark:text-[#a1a1aa] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="login-identifier"
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={activeConfig.identifierPlaceholder}
                      autoComplete="username"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 dark:border-[#27272a] bg-white dark:bg-[#18181c] text-slate-900 dark:text-[#f4f4f5] placeholder:text-slate-400 dark:placeholder:text-[#71717a] focus:border-zinc-900 dark:focus:border-[#e4e4e7] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-semibold text-slate-700 dark:text-[#d4d4d8] mb-1.5"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 dark:text-[#a1a1aa] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className="w-full pl-9 pr-10 py-2 text-sm border border-slate-300 dark:border-[#27272a] bg-white dark:bg-[#18181c] text-slate-900 dark:text-[#f4f4f5] placeholder:text-slate-400 dark:placeholder:text-[#71717a] focus:border-zinc-900 dark:focus:border-[#e4e4e7] focus:outline-none"
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

                {selectedRole === 'admin' && (
                  <div>
                    <label
                      htmlFor="login-otp"
                      className="block text-xs font-semibold text-slate-700 dark:text-[#d4d4d8] mb-1.5"
                    >
                      Admin One-Time Security Code (OTP)
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-400 dark:text-[#a1a1aa] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="login-otp"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="6-digit code (Demo: 202604)"
                        className="w-full pl-9 pr-3 py-2 text-sm font-mono tabular-nums border border-slate-300 dark:border-[#27272a] bg-white dark:bg-[#18181c] text-slate-900 dark:text-[#f4f4f5] placeholder:text-slate-400 dark:placeholder:text-[#71717a] focus:border-zinc-900 dark:focus:border-[#e4e4e7] focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-white dark:text-[#09090b] bg-zinc-900 hover:bg-zinc-800 dark:bg-[#f4f4f5] dark:hover:bg-[#e4e4e7] disabled:opacity-60 transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>{isSubmitting ? 'Signing in…' : `Sign In as ${activeConfig.label}`}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isGoogleLoading}
                    onClick={() => void handleGoogleSignIn()}
                    className="w-full py-2.5 px-4 text-xs font-semibold border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#18181c] text-slate-800 dark:text-[#f4f4f5] hover:bg-slate-100 dark:hover:bg-[#222227] disabled:opacity-60 transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                  >
                    <Cloud className="w-4 h-4 text-zinc-700 dark:text-[#d4d4d8]" />
                    <span>{isGoogleLoading ? 'Connecting Google…' : 'Continue with Google'}</span>
                  </button>
                </div>
              </form>

              {/* Quick Demo Roles for Evaluators & Judges */}
              <div className="pt-5 border-t border-slate-200 dark:border-[#27272a]">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-semibold text-slate-700 dark:text-[#d4d4d8]">
                    Quick Evaluation Demo Sign-In (1-Click)
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-[#a1a1aa] font-mono tabular-nums">
                    Pre-seeded accounts
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ROLE_CONFIGS.map((cfg) => (
                    <button
                      key={cfg.id}
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => void handleQuickDemoLogin(cfg)}
                      className="p-2.5 text-left border border-slate-200 dark:border-[#27272a] bg-slate-50/70 dark:bg-[#18181c] hover:bg-slate-100 dark:hover:bg-[#222227] transition-colors flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-[#f4f4f5] truncate">
                          {cfg.demoName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-[#a1a1aa] font-mono tabular-nums truncate">
                          {cfg.label} · {cfg.demoIdentifier}
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 dark:text-[#a1a1aa] shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-[#27272a] flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-[#a1a1aa]">
              <span>Need a new institutional profile?</span>
              <Link
                to="/register"
                className="font-semibold text-zinc-900 dark:text-[#f4f4f5] hover:underline"
              >
                Register as Student, Advisor, or Faculty →
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
