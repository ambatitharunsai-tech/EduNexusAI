import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronRight,
  LayoutDashboard,
  Users,
  Milestone,
  ShieldAlert,
  BarChart3,
  Menu,
  X,
  Search,
  GraduationCap,
  Sparkles,
  FileSpreadsheet,
  LogOut,
  ChevronDown,
  SlidersHorizontal,
  Sun,
  Moon,
  HelpCircle,
  Cloud,
  UserCircle2,
  Palette,
  Layers,
  Type,
} from 'lucide-react';
import { cn, safeStorageGet, safeStorageSet } from '../lib/utils';
import { useAuth } from '../context';
import { api } from '../lib/api';
import { Modal } from '../components/ui/Modal';
import type { DashboardOverviewResponse, FollowUpStudentItem } from '../types';
import { GeminiCopilotDrawer } from '../features/copilot/GeminiCopilotDrawer';

interface NavItem {
  name: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const navItems: NavItem[] = [
  { name: 'Dashboard', to: '/', icon: LayoutDashboard },
  { name: 'Students Directory', to: '/students', icon: Users },
  { name: 'Student Journey', to: '/journey', icon: Milestone, badge: 'Intelligence' },
  { name: 'Interventions', to: '/interventions', icon: ShieldAlert },
  { name: 'Analytics & Trends', to: '/analytics', icon: BarChart3 },
  { name: 'Data & CSV Hub', to: '/csv-hub', icon: FileSpreadsheet, badge: 'Ingest' },
  { name: 'Help & Support', to: '/help', icon: HelpCircle },
];

export type AppTheme = 'light' | 'dark';
export type ThemePreference = 'system' | 'dark' | 'light';
export type AccentColor = 'monochrome' | 'blue' | 'emerald' | 'rose' | 'violet' | 'amber';

export interface AccentColorOption {
  id: AccentColor;
  name: string;
  label: string;
  lightHex: string;
  darkHex: string;
  description: string;
}

export const ACCENT_COLOR_OPTIONS: AccentColorOption[] = [
  {
    id: 'monochrome',
    name: 'Monochrome',
    label: 'Monochrome Black & White',
    lightHex: '#18181b',
    darkHex: '#f4f4f5',
    description: 'High-contrast monochrome white & zinc accents',
  },
  {
    id: 'blue',
    name: 'Royal Blue',
    label: 'Royal Blue & Indigo',
    lightHex: '#2563eb',
    darkHex: '#3b82f6',
    description: 'Institutional indigo & cobalt analytics tone',
  },
  {
    id: 'emerald',
    name: 'Cyan Accent',
    label: 'Cyan & Teal Accent',
    lightHex: '#0891B2',
    darkHex: '#22D3EE',
    description: 'High-clarity cyan & teal telemetry accent',
  },
  {
    id: 'rose',
    name: 'Crimson Rose',
    label: 'Crimson Rose',
    lightHex: '#e11d48',
    darkHex: '#f43f5e',
    description: 'Urgent priority & proactive advisor alerts',
  },
  {
    id: 'violet',
    name: 'Vibrant Violet',
    label: 'Vibrant Violet',
    lightHex: '#7c3aed',
    darkHex: '#8b5cf6',
    description: 'Deep scholarly violet & research intelligence',
  },
  {
    id: 'amber',
    name: 'Amber Gold',
    label: 'Amber Gold',
    lightHex: '#d97706',
    darkHex: '#f59e0b',
    description: 'Warm gold & high-visibility alert highlights',
  },
];

export type SurfaceTint = 'neutral' | 'slate' | 'sage' | 'sand' | 'rose' | 'violet';

export interface SurfaceTintOption {
  id: SurfaceTint;
  name: string;
  label: string;
  lightBg: string;
  darkBg: string;
  lightBorder: string;
  darkBorder: string;
  description: string;
}

export const SURFACE_TINT_OPTIONS: SurfaceTintOption[] = [
  {
    id: 'neutral',
    name: 'Classic Neutral',
    label: 'Classic High-Contrast Neutral',
    lightBg: '#ffffff',
    darkBg: '#121215',
    lightBorder: '#e4e4e7',
    darkBorder: '#27272a',
    description: 'Pure white light mode and deep obsidian black surfaces',
  },
  {
    id: 'slate',
    name: 'Slate Mist',
    label: 'Cool Slate & Cobalt Mist',
    lightBg: '#f8fafc',
    darkBg: '#111622',
    lightBorder: '#cbd5e1',
    darkBorder: '#1e293b',
    description: 'Subtle icy alpine slate and nocturnal navy tone',
  },
  {
    id: 'sage',
    name: 'Sage Emerald',
    label: 'Botanical Sage & Forest Mist',
    lightBg: '#f6faf7',
    darkBg: '#101814',
    lightBorder: '#c6dec9',
    darkBorder: '#1e3328',
    description: 'Fresh campus sage and serene botanical dark tone',
  },
  {
    id: 'sand',
    name: 'Warm Sand',
    label: 'Architectural Sand & Espresso',
    lightBg: '#fbf9f5',
    darkBg: '#181511',
    lightBorder: '#e6dcce',
    darkBorder: '#362d22',
    description: 'Warm archival parchment light and rich espresso dark',
  },
  {
    id: 'rose',
    name: 'Rose Dusk',
    label: 'Crimson Blush & Burgundy Twilight',
    lightBg: '#fff8f8',
    darkBg: '#1a1114',
    lightBorder: '#f4d0d6',
    darkBorder: '#3a1e2a',
    description: 'Gentle crimson blush light and twilight burgundy dark',
  },
  {
    id: 'violet',
    name: 'Scholarly Violet',
    label: 'Astral Lavender & Midnight Violet',
    lightBg: '#f9f7fd',
    darkBg: '#15121e',
    lightBorder: '#d9d0ed',
    darkBorder: '#2c2340',
    description: 'Scholarly lavender light and deep nocturnal astral violet',
  },
];

export type AppFontSize = 'normal' | 'large' | 'xl';

export interface FontSizeOption {
  id: AppFontSize;
  name: string;
  label: string;
  scaleLabel: string;
  description: string;
}

export const FONT_SIZE_OPTIONS: FontSizeOption[] = [
  {
    id: 'normal',
    name: 'Standard',
    label: 'Standard (16.5px Base)',
    scaleLabel: '100%',
    description: 'Crisp default typography, elevated for clean readability',
  },
  {
    id: 'large',
    name: 'Large',
    label: 'Large (18px Base)',
    scaleLabel: '110%',
    description: 'Enlarged headings and body text for enhanced clarity',
  },
  {
    id: 'xl',
    name: 'Extra Large',
    label: 'Extra Large (19.5px Base)',
    scaleLabel: '120%',
    description: 'Maximum legibility and prominent metrics for high accessibility',
  },
];

export interface AppShellProps {
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
  themePreference?: ThemePreference;
  onThemePreferenceChange?: (pref: ThemePreference) => void;
  systemTheme?: AppTheme;
  accentColor?: AccentColor;
  onAccentColorChange?: (color: AccentColor) => void;
  surfaceTint?: SurfaceTint;
  onSurfaceTintChange?: (tint: SurfaceTint) => void;
  fontSize?: AppFontSize;
  onFontSizeChange?: (size: AppFontSize) => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  theme,
  onThemeChange,
  themePreference: _themePreference = 'dark',
  onThemePreferenceChange = () => {},
  systemTheme: _systemTheme = 'dark',
  accentColor = 'monochrome',
  onAccentColorChange = () => {},
  surfaceTint = 'neutral',
  onSurfaceTintChange = () => {},
  fontSize = 'normal',
  onFontSizeChange = () => {},
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [highRiskStudents, setHighRiskStudents] = useState<FollowUpStudentItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsError, setNotificationsError] = useState(false);
  const [compactNavigation, setCompactNavigation] = useState(() => {
    return safeStorageGet('edunexus_compact_navigation') === 'true';
  });
  const [reduceMotion, setReduceMotion] = useState(() => {
    return safeStorageGet('edunexus_reduce_motion') === 'true';
  });
  const location = useLocation();
  const navigate = useNavigate();
  const { session, signOut, signInWithGoogle, isFirebaseSynced } = useAuth();
  const isStudent = session?.role?.toLowerCase() === 'student';

  useEffect(() => {
    let isMounted = true;
    if (isStudent) {
      setHighRiskStudents([]);
      setNotificationsError(false);
      setNotificationsLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const loadRiskNotifications = async () => {
      try {
        const dashboard = await api<DashboardOverviewResponse>('/api/v1/dashboard/overview');
        const highRisk = dashboard.follow_up_students
          .filter((student) => student.risk_level === 'high' || student.risk_level === 'critical')
          .sort((left, right) => {
            const tierOrder = (tier: string) => (tier === 'critical' ? 0 : 1);
            return (
              tierOrder(left.risk_level) - tierOrder(right.risk_level) ||
              (right.risk_score ?? -1) - (left.risk_score ?? -1)
            );
          });
        if (isMounted) {
          setHighRiskStudents(highRisk);
          setNotificationsError(false);
        }
      } catch {
        if (isMounted) setNotificationsError(true);
      } finally {
        if (isMounted) setNotificationsLoading(false);
      }
    };

    void loadRiskNotifications();
    const refreshId = window.setInterval(() => void loadRiskNotifications(), 60_000);
    return () => {
      isMounted = false;
      window.clearInterval(refreshId);
    };
  }, [isStudent]);

  useEffect(() => {
    const handleGlobalEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (mobileMenuOpen) setMobileMenuOpen(false);
        if (notificationsOpen) setNotificationsOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalEscape);
    return () => window.removeEventListener('keydown', handleGlobalEscape);
  }, [mobileMenuOpen, notificationsOpen]);

  const submitStudentSearch = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && event.currentTarget.value.trim()) {
      navigate(`/students?search=${encodeURIComponent(event.currentTarget.value.trim())}`);
      event.currentTarget.blur();
    }
  };

  const handleSidebarKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const navElement = event.currentTarget;
    const links = Array.from(navElement.querySelectorAll<HTMLAnchorElement>('a[href]'));
    if (links.length === 0) return;

    const activeElement = document.activeElement as HTMLAnchorElement | null;
    const currentIndex = activeElement ? links.indexOf(activeElement) : -1;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % links.length;
      links[nextIndex]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prevIndex = currentIndex <= 0 ? links.length - 1 : currentIndex - 1;
      links[prevIndex]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      links[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      links[links.length - 1]?.focus();
    } else if (event.key === 'Escape' && mobileMenuOpen) {
      event.preventDefault();
      setMobileMenuOpen(false);
    }
  };

  const storePreference = (key: string, value: boolean) => {
    safeStorageSet(key, String(value));
  };

  const visibleNavItems = isStudent
    ? navItems.filter((item) => item.to === '/' || item.to === '/help')
    : navItems;

  const currentNav = visibleNavItems.find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
  );
  const pageTitle = currentNav?.name || 'Overview';

  return (
    <div
      className={cn(
        'app-shell h-screen overflow-hidden bg-[#F5F5F5] dark:bg-[#09090B] text-[#27272A] dark:text-[#E4E4E7] flex flex-col antialiased transition-colors duration-200',
        compactNavigation && 'compact-navigation',
        reduceMotion && 'reduce-motion'
      )}
    >
      {/* Skip to Main Content Link for A11y */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#18181B] dark:focus:bg-[#F4F4F5] focus:text-white dark:focus:text-[#09090B] focus:rounded-none focus:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1] dark:focus-visible:ring-[#818CF8] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0A0A0A]"
      >
        Skip to main content
      </a>

      {/* Top Header */}
      <header className="app-shell-header relative z-30 shrink-0 border-b border-[#E4E4E7] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#0A0A0A]">
        <div className="flex min-h-16 items-center gap-3 px-3 sm:px-6">
          {/* Mobile hamburger menu toggle */}
          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center p-2 rounded-none text-[#52525B] dark:text-[#A1A1AA] hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C20] hover:text-[#09090B] dark:hover:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#6366F1]"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Brand Logo & Title */}
          <div className="flex min-w-0 shrink-0 items-center gap-2.5">
            <div className="w-9 h-9 rounded-none bg-[#18181B] dark:bg-[#F4F4F5] flex items-center justify-center text-white dark:text-[#09090B] shadow-xs">
              <GraduationCap className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-[#09090B] dark:text-[#FAFAFA]">
                  EduNexus <span className="text-[#52525B] dark:text-[#A1A1AA]">AI</span>
                </span>
                <span className="hidden lg:inline-flex items-center px-1.5 py-0.5 rounded-none text-[10px] font-semibold bg-[#F4F4F5] dark:bg-[#27272A] text-[#3F3F46] dark:text-[#E4E4E7] border border-[#D4D4D8] dark:border-[#3F3F46]">
                  Prototype
                </span>
              </div>
              <p className="text-[10px] text-[#71717A] dark:text-[#71717A] hidden xl:block">
                Student Journey Intelligence
              </p>
            </div>
          </div>

          {!isStudent && (
            <div className="hidden min-w-0 flex-1 justify-center px-4 md:flex max-w-md mx-auto">
              <div className="relative w-full">
                <Search className="absolute inset-y-0 left-3 my-auto h-4 w-4 text-[#71717A] pointer-events-none" />
                <input
                  type="search"
                  onKeyDown={submitStudentSearch}
                  placeholder="Search students by name or ID"
                  className="w-full border border-[#D4D4D8] dark:border-[#3F3F46] hover:border-[#A1A1AA] dark:hover:border-[#71717A] bg-[#FFFFFF] dark:bg-[#111113] py-1.5 pl-9 pr-4 text-xs text-[#18181B] dark:text-[#FAFAFA] placeholder:text-[#A1A1AA] dark:placeholder:text-[#71717A] focus:border-[#6366F1] dark:focus:border-[#818CF8] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 dark:focus:ring-[#6366F1]/30 transition-colors"
                  aria-label="Quick search students"
                />
              </div>
            </div>
          )}

          <div className="hidden xl:flex shrink-0 items-center gap-1.5 px-2.5 py-1 rounded-none bg-[#F4F4F5] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] text-[11px] font-medium text-[#52525B] dark:text-[#A1A1AA]">
            <span className="w-1.5 h-1.5 rounded-none bg-[#0891B2] dark:bg-[#22D3EE]" aria-hidden="true" />
            <span>Human-reviewed support</span>
          </div>

          {!isStudent && (
            <div className="relative ml-auto shrink-0">
              <button
                type="button"
                onClick={() => setNotificationsOpen((open) => !open)}
                className="relative flex h-10 w-10 items-center justify-center text-slate-600 dark:text-[#d4d4d8] hover:bg-slate-100 dark:hover:bg-[#18181c] focus:outline-none focus:ring-2 focus:ring-zinc-500"
                aria-label={`High-risk student notifications${highRiskStudents.length ? `, ${highRiskStudents.length} students` : ''}`}
                aria-expanded={notificationsOpen}
                aria-controls="high-risk-notifications"
              >
                <Bell className="h-5 w-5" aria-hidden="true" />
                {highRiskStudents.length > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center bg-rose-600 dark:bg-[#9B2C2C] px-1 text-[10px] font-bold leading-none text-white dark:text-[#f4f4f5]">
                    {highRiskStudents.length > 99 ? '99+' : highRiskStudents.length}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <section
                  id="high-risk-notifications"
                  className="fixed right-3 top-[7.5rem] z-50 w-[min(22rem,calc(100vw-1.5rem))] border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121215] text-slate-800 dark:text-[#d4d4d8] shadow-xl md:absolute md:right-0 md:top-full md:mt-2"
                  aria-label="High-risk student notifications"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-[#27272a] px-4 py-3">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-[#f4f4f5]">High-risk students</h2>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-[#a1a1aa]">Current high and critical review flags</p>
                    </div>
                    <span className="flex h-7 min-w-7 items-center justify-center bg-rose-50 dark:bg-[#281518] px-2 text-xs font-bold text-rose-700 dark:text-[#fda4af] border border-rose-200 dark:border-[#4a1e24]">
                      {highRiskStudents.length}
                    </span>
                  </div>
                  {notificationsLoading ? (
                    <p className="px-4 py-5 text-sm text-slate-500 dark:text-[#a1a1aa]" role="status">
                      Loading current risk flags…
                    </p>
                  ) : notificationsError ? (
                    <p className="px-4 py-5 text-sm text-amber-700 dark:text-[#fcd34d]" role="alert">
                      Risk notifications are unavailable right now.
                    </p>
                  ) : highRiskStudents.length === 0 ? (
                    <div className="flex items-start gap-2.5 px-4 py-5 text-sm text-slate-600 dark:text-[#d4d4d8]">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-[#6ee7b7]" />
                      <p>No students currently have a high or critical baseline risk flag.</p>
                    </div>
                  ) : (
                    <ul className="max-h-[min(60vh,28rem)] overflow-y-auto">
                      {highRiskStudents.map((student) => (
                        <li key={student.id} className="border-b border-slate-100 dark:border-[#27272a] last:border-b-0">
                          <Link
                            to={`/journey?student_id=${encodeURIComponent(student.id)}`}
                            onClick={() => setNotificationsOpen(false)}
                            className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-[#18181c] focus:bg-slate-50 dark:focus:bg-[#18181c] focus:outline-none"
                          >
                            <AlertTriangle
                              className={cn(
                                'mt-0.5 h-4 w-4 shrink-0',
                                student.risk_level === 'critical'
                                  ? 'text-rose-600 dark:text-[#fda4af]'
                                  : 'text-orange-600 dark:text-[#fdba74]'
                              )}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-start justify-between gap-2">
                                <span className="truncate text-sm font-semibold text-slate-900 dark:text-[#f4f4f5]">
                                  {student.name}
                                </span>
                                <span
                                  className={cn(
                                    'shrink-0 text-[10px] font-bold uppercase',
                                    student.risk_level === 'critical'
                                      ? 'text-rose-700 dark:text-[#fda4af]'
                                      : 'text-orange-700 dark:text-[#fdba74]'
                                  )}
                                >
                                  {student.risk_level}
                                </span>
                              </span>
                              <span className="mt-0.5 block text-xs text-slate-500 dark:text-[#a1a1aa]">
                                {student.student_id} ·{' '}
                                {student.risk_score == null ? 'Score unavailable' : `${student.risk_score.toFixed(1)} risk score`}
                              </span>
                              <span className="mt-1 block text-xs leading-relaxed text-slate-600 dark:text-[#d4d4d8]">
                                {student.primary_risk_factor}
                              </span>
                            </span>
                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-[#71717a]" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
          )}

          {/* Sign In Link */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <Link
              to="/login?switch=true"
              className="inline-flex h-9 items-center px-3 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 text-xs font-semibold transition-colors"
            >
              Switch Role / Login
            </Link>
          </div>

          {/* Profile and display settings */}
          <div className="flex shrink-0 items-center pl-2 border-l border-[#E4E4E7] dark:border-[#27272A]">
            <details className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 p-1.5 text-[#52525B] dark:text-[#A1A1AA] hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C20] hover:text-[#09090B] dark:hover:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#6366F1]">
                <span className="flex h-8 w-8 items-center justify-center bg-[#18181B] dark:bg-[#27272A] text-xs font-semibold text-white dark:text-[#FAFAFA] border border-transparent dark:border-[#3F3F46]">
                  {session?.role ? session.role.slice(0, 2).toUpperCase() : 'AI'}
                </span>
                <span className="hidden text-xs font-medium sm:block">{session?.role ? session.role : 'Profile'}</span>
                <ChevronDown className="h-4 w-4 text-[#71717A] dark:text-[#A1A1AA] transition-transform group-open:rotate-180" />
              </summary>
              <div className="absolute right-0 top-full z-50 mt-2 w-[min(21rem,calc(100vw-1.5rem))] border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FFFFFF] dark:bg-[#18181B] p-4 text-[#27272A] dark:text-[#E4E4E7] shadow-[var(--shadow-modal)]">
                <div className="border-b border-[#E4E4E7] dark:border-[#27272A] pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                      {session ? 'User Profile & Session' : 'EduNexus AI Workspace'}
                    </p>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.currentTarget.closest('details')?.removeAttribute('open');
                        setProfileModalOpen(true);
                      }}
                      className="text-[11px] font-semibold text-[#4F46E5] dark:text-[#A5B4FC] hover:text-[#4338CA] dark:hover:text-[#C7D2FE] hover:underline flex items-center gap-1"
                    >
                      <UserCircle2 className="h-3.5 w-3.5" />
                      <span>Profile Settings</span>
                    </button>
                  </div>
                  <p className="mt-1 break-all text-xs text-[#27272A] dark:text-[#E4E4E7]">
                    {session?.email || 'Direct Access Workspace'}
                  </p>
                  <p className="mt-1 text-xs text-[#52525B] dark:text-[#A1A1AA]">
                    {session ? `Role: ${session.role}` : 'Role: Institutional Workspace'}
                  </p>
                  {isFirebaseSynced && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#0E7490] dark:text-[#67E8F9]">
                      <Cloud className="h-3 w-3" /> Cloud Synced (Firebase)
                    </p>
                  )}
                  {session?.isDemoSession && (
                    <p className="mt-1 text-[11px] text-[#71717A] dark:text-[#71717A]">Local evaluation session</p>
                  )}
                </div>

                {/* Profile Theme Toggle / Appearance Section */}
                <div className="space-y-3 py-3">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                      <SlidersHorizontal className="h-3.5 w-3.5" /> Appearance
                    </p>
                    <span className="text-[10px] font-mono font-medium text-[#52525B] dark:text-[#A1A1AA]">
                      {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                    </span>
                  </div>
                  <div
                    role="group"
                    aria-label="Theme Toggle / Appearance"
                    className="grid grid-cols-2 gap-1 p-1 bg-[#F4F4F5] dark:bg-[#111113] border border-[#E4E4E7] dark:border-[#27272A]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onThemeChange('dark');
                        onThemePreferenceChange?.('dark');
                      }}
                      aria-pressed={theme === 'dark'}
                      className={cn(
                        'inline-flex min-h-8 items-center justify-center gap-1.5 px-2 py-1 text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1]',
                        theme === 'dark'
                          ? 'bg-[#18181B] dark:bg-[#F4F4F5] text-white dark:text-[#09090B] shadow-2xs'
                          : 'text-[#52525B] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#FAFAFA]'
                      )}
                    >
                      <Moon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Dark Mode</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onThemeChange('light');
                        onThemePreferenceChange?.('light');
                      }}
                      aria-pressed={theme === 'light'}
                      className={cn(
                        'inline-flex min-h-8 items-center justify-center gap-1.5 px-2 py-1 text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1]',
                        theme === 'light'
                          ? 'bg-[#18181B] text-white shadow-2xs'
                          : 'text-[#52525B] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#FAFAFA]'
                      )}
                    >
                      <Sun className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                      <span>Light Mode</span>
                    </button>
                  </div>

                  {/* Quick Color Accent Swatches */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between pb-1.5">
                      <span className="text-[11px] font-medium text-slate-600 dark:text-[#a1a1aa] flex items-center gap-1.5">
                        <Palette className="h-3 w-3" /> Color Accent
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 dark:text-[#71717a] capitalize">
                        {ACCENT_COLOR_OPTIONS.find((c) => c.id === accentColor)?.name || accentColor}
                      </span>
                    </div>
                    <div
                      role="radiogroup"
                      aria-label="Color Accent"
                      className="grid grid-cols-6 gap-1 p-1 bg-slate-100 dark:bg-[#18181c] border border-slate-200 dark:border-[#27272a]"
                    >
                      {ACCENT_COLOR_OPTIONS.map((opt) => {
                        const isSelected = accentColor === opt.id;
                        const swatchHex = theme === 'dark' ? opt.darkHex : opt.lightHex;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => onAccentColorChange(opt.id)}
                            title={opt.label}
                            aria-label={`Select ${opt.label}`}
                            aria-checked={isSelected}
                            role="radio"
                            className={cn(
                              'h-6 w-full flex items-center justify-center transition-all hover:scale-105 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500',
                              isSelected
                                ? 'ring-2 ring-zinc-900 dark:ring-[#e4e4e7] scale-105'
                                : 'opacity-85 hover:opacity-100'
                            )}
                            style={{ backgroundColor: swatchHex }}
                          >
                            {isSelected && (
                              <Check
                                className={cn(
                                  'h-3 w-3',
                                  opt.id === 'monochrome' && theme === 'dark'
                                    ? 'text-zinc-950'
                                    : opt.id === 'amber' && theme === 'dark'
                                    ? 'text-zinc-950'
                                    : 'text-white'
                                )}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Container Background Tint Swatches */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between pb-1.5">
                      <span className="text-[11px] font-medium text-slate-600 dark:text-[#a1a1aa] flex items-center gap-1.5">
                        <Layers className="h-3 w-3" /> Container Tint
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 dark:text-[#71717a] capitalize">
                        {SURFACE_TINT_OPTIONS.find((t) => t.id === surfaceTint)?.name || surfaceTint}
                      </span>
                    </div>
                    <div
                      role="radiogroup"
                      aria-label="Container Background Tint"
                      className="grid grid-cols-6 gap-1 p-1 bg-slate-100 dark:bg-[#18181c] border border-slate-200 dark:border-[#27272a]"
                    >
                      {SURFACE_TINT_OPTIONS.map((tintOpt) => {
                        const isSelected = surfaceTint === tintOpt.id;
                        const activeHex = theme === 'dark' ? tintOpt.darkBg : tintOpt.lightBg;
                        const innerDot = theme === 'dark' ? tintOpt.lightBg : tintOpt.darkBg;
                        return (
                          <button
                            key={tintOpt.id}
                            type="button"
                            onClick={() => onSurfaceTintChange(tintOpt.id)}
                            title={`${tintOpt.name} (${tintOpt.description})`}
                            aria-label={`Select ${tintOpt.label}`}
                            aria-checked={isSelected}
                            role="radio"
                            className={cn(
                              'h-6 w-full flex items-center justify-center transition-all hover:scale-105 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 border border-slate-300 dark:border-[#3f3f46] cursor-pointer',
                              isSelected
                                ? 'ring-2 ring-zinc-900 dark:ring-[#e4e4e7] scale-105'
                                : 'opacity-90 hover:opacity-100'
                            )}
                            style={{ backgroundColor: activeHex }}
                          >
                            <span
                              className="h-2 w-2 border border-black/20 dark:border-white/20"
                              style={{ backgroundColor: innerDot }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Text Size / Typography Scale */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between pb-1.5">
                      <span className="text-[11px] font-medium text-slate-600 dark:text-[#a1a1aa] flex items-center gap-1.5">
                        <Type className="h-3 w-3" /> Text & Font Size
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 dark:text-[#71717a]">
                        {FONT_SIZE_OPTIONS.find((f) => f.id === fontSize)?.name || fontSize} ({FONT_SIZE_OPTIONS.find((f) => f.id === fontSize)?.scaleLabel})
                      </span>
                    </div>
                    <div
                      role="radiogroup"
                      aria-label="Text & Font Size"
                      className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-[#18181c] border border-slate-200 dark:border-[#27272a]"
                    >
                      {FONT_SIZE_OPTIONS.map((opt) => {
                        const isSelected = fontSize === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => onFontSizeChange(opt.id)}
                            aria-label={`Select ${opt.label}`}
                            aria-checked={isSelected}
                            role="radio"
                            className={cn(
                              'py-1 px-1 text-center font-semibold transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 cursor-pointer',
                              opt.id === 'normal' ? 'text-xs' : opt.id === 'large' ? 'text-xs font-bold' : 'text-xs font-black',
                              isSelected
                                ? 'bg-zinc-900 dark:bg-[#e4e4e7] text-white dark:text-[#09090b] shadow-2xs'
                                : 'text-slate-600 dark:text-[#a1a1aa] hover:text-slate-900 dark:hover:text-[#f4f4f5]'
                            )}
                          >
                            <span>{opt.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-slate-700 dark:text-[#d4d4d8] pt-1">
                    <span>Compact navigation</span>
                    <input
                      type="checkbox"
                      checked={compactNavigation}
                      onChange={(event) => {
                        setCompactNavigation(event.target.checked);
                        storePreference('edunexus_compact_navigation', event.target.checked);
                      }}
                      className="h-4 w-4 accent-zinc-900 dark:accent-zinc-200"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-slate-700 dark:text-[#d4d4d8]">
                    <span>Reduce motion</span>
                    <input
                      type="checkbox"
                      checked={reduceMotion}
                      onChange={(event) => {
                        setReduceMotion(event.target.checked);
                        storePreference('edunexus_reduce_motion', event.target.checked);
                      }}
                      className="h-4 w-4 accent-zinc-900 dark:accent-zinc-200"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-slate-200 dark:border-[#27272a] pt-3 mb-2">
                  <Link
                    to="/login?switch=true"
                    onClick={(event) => {
                      event.currentTarget.closest('details')?.removeAttribute('open');
                    }}
                    className="flex min-h-8 items-center justify-center border border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#18181c] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-[#f4f4f5] hover:bg-slate-100 dark:hover:bg-[#222228] transition-colors whitespace-nowrap shrink-0"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/register"
                    onClick={(event) => {
                      event.currentTarget.closest('details')?.removeAttribute('open');
                    }}
                    className="flex min-h-8 items-center justify-center bg-zinc-900 dark:bg-[#e4e4e7] px-2.5 py-1.5 text-xs font-semibold text-white dark:text-[#09090b] hover:bg-zinc-800 dark:hover:bg-white transition-colors whitespace-nowrap shrink-0"
                  >
                    Register
                  </Link>
                </div>
                {!isFirebaseSynced && signInWithGoogle && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.currentTarget.closest('details')?.removeAttribute('open');
                      void signInWithGoogle();
                    }}
                    className="mb-2 flex min-h-9 w-full items-center gap-2 border-t border-slate-200 dark:border-[#27272a] pt-3 text-left text-xs font-semibold text-slate-700 dark:text-[#e4e4e7] hover:text-slate-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 transition-colors"
                  >
                    <Cloud className="h-3.5 w-3.5" /> Connect Google (Cloud Sync)
                  </button>
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open');
                    signOut();
                    navigate('/');
                  }}
                  className="flex min-h-9 w-full items-center gap-2 border-t border-slate-200 dark:border-[#27272a] pt-3 text-left text-xs font-semibold text-slate-700 dark:text-[#d4d4d8] hover:text-rose-600 dark:hover:text-[#fda4af] focus:outline-none focus:ring-2 focus:ring-zinc-500 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5 text-rose-500" /> Sign out
                </button>
              </div>
            </details>
          </div>
        </div>

        {!isStudent && (
          <div className="px-3 pb-3 md:hidden">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                onKeyDown={submitStudentSearch}
                placeholder="Search students by name or ID"
                className="w-full border border-slate-200 dark:border-[#27272a] bg-slate-100 dark:bg-[#18181c] py-2 pl-9 pr-3 text-sm text-slate-800 dark:text-[#f4f4f5] placeholder:text-slate-500 dark:placeholder:text-[#71717a] focus:border-zinc-500 focus:bg-white dark:focus:bg-[#121215] focus:outline-none focus:ring-2 focus:ring-zinc-500/20"
                aria-label="Quick search students"
              />
            </div>
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Desktop Sidebar Navigation */}
        <aside
          className="hidden h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-[#E4E4E7] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#0D0D0F] md:flex"
          aria-label="Main sidebar navigation"
        >
          {/* Main Navigation Links */}
          <div className="flex-1 space-y-1 p-4">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#71717A] dark:text-[#71717A]">
              Platform Modules
            </div>
            <nav
              className="space-y-1"
              aria-label="Primary module navigation"
              onKeyDown={handleSidebarKeyDown}
            >
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center justify-between px-3 py-2 rounded-none text-sm font-medium transition-colors group focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1] dark:focus-visible:ring-[#818CF8] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0D0D0F]',
                        isActive
                          ? 'bg-[#EEF2FF] text-[#3730A3] border-l-4 border-[#4F46E5] dark:bg-[#27272A] dark:text-[#FFFFFF] dark:border-[#A5B4FC] font-semibold shadow-2xs app-active-nav'
                          : 'text-[#52525B] dark:text-[#A1A1AA] hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C20] hover:text-[#09090B] dark:hover:text-[#FAFAFA]'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className="flex items-center gap-3">
                          <Icon
                            className={cn(
                              'w-4 h-4 shrink-0 transition-transform group-hover:scale-105',
                              isActive
                                ? 'text-[#4F46E5] dark:text-[#A5B4FC]'
                                : 'text-[#71717A] dark:text-[#71717A] group-hover:text-[#18181B] dark:group-hover:text-[#E4E4E7]'
                            )}
                          />
                          <span>{item.name}</span>
                        </div>
                        {item.badge && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-none bg-[#F4F4F5] text-[#3F3F46] border border-[#D4D4D8] dark:bg-[#27272A] dark:text-[#E4E4E7] dark:border-[#3F3F46]">
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>

            <div className="pt-6 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#71717A] dark:text-[#71717A]">
              Governance & Integrity
            </div>
            <div className="space-y-1 text-xs text-[#52525B] dark:text-[#A1A1AA]">
              <div className="p-3 bg-[#FAFAFA] dark:bg-[#141416] border border-[#E4E4E7] dark:border-[#29292D] rounded-none space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-[#09090B] dark:text-[#FAFAFA] text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-[#4F46E5] dark:text-[#A5B4FC]" />
                  <span>Explainable AI Principles</span>
                </div>
                <p className="text-[11px] text-[#52525B] dark:text-[#A1A1AA] leading-normal">
                  Risk scores are transparent, descriptive, and require human review. No punitive automated actions.
                </p>
              </div>
            </div>
          </div>

          {/* Sidebar Footer */}
          <div className="p-4 border-t border-[#E4E4E7] dark:border-[#27272A] bg-[#FAFAFA] dark:bg-[#0A0A0A]">
            <div className="flex items-center justify-between text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
              <span>Data Mode:</span>
              <span className="font-medium text-[#0E7490] bg-[#CFFAFE] dark:bg-[#083344] dark:text-[#67E8F9] px-1.5 py-0.5 rounded-none border border-[#67E8F9] dark:border-[#155E75]">
                Database Connected
              </span>
            </div>
            <div className="mt-2 text-[10px] text-[#71717A] dark:text-[#71717A]">
              EduNexus AI Prototype
            </div>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 md:hidden bg-black/60 backdrop-blur-2xs flex modal-backdrop-enter"
            onClick={() => setMobileMenuOpen(false)}
          >
            <div
              className="w-72 bg-white dark:bg-[#121215] text-slate-900 dark:text-[#f4f4f5] h-full shadow-xl flex flex-col p-4 border-r border-slate-200 dark:border-[#27272a]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-[#27272a] mb-4">
                <span className="font-bold text-base text-slate-900 dark:text-[#f4f4f5]">EduNexus AI</span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-none text-slate-500 dark:text-[#d4d4d8] hover:bg-slate-100 dark:hover:bg-[#18181c] focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-[#e4e4e7]"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav
                className="space-y-1 flex-1"
                aria-label="Mobile module navigation"
                onKeyDown={handleSidebarKeyDown}
              >
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-none text-sm font-medium focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-[#e4e4e7] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#121215]',
                          isActive
                            ? 'bg-slate-100 text-slate-900 font-semibold dark:bg-[#1f1f24] dark:text-[#f4f4f5]'
                            : 'text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-50 dark:hover:bg-[#18181c] hover:text-slate-900 dark:hover:text-[#f4f4f5]'
                        )
                      }
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.name}</span>
                    </NavLink>
                  );
                })}
              </nav>

              <div className="p-3 bg-slate-50 dark:bg-[#18181c] rounded-none text-xs text-slate-500 dark:text-[#a1a1aa] border border-slate-200 dark:border-[#27272a]">
                EduNexus AI Prototype
              </div>
            </div>
          </div>
        )}

        {/* Main Content Viewport */}
        <main id="main-content" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Breadcrumb / Section Banner */}
          <div className="bg-white dark:bg-[#121215] border-b border-slate-200 dark:border-[#27272a] px-4 sm:px-8 py-3.5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#a1a1aa] mb-0.5">
                <span>EduNexus</span>
                <span>/</span>
                <span className="font-medium text-slate-800 dark:text-[#d4d4d8]">{pageTitle}</span>
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-[#f4f4f5] tracking-tight">
                {pageTitle}
              </h1>
            </div>
          </div>

          {/* Page Outlet */}
          <div key={location.pathname} className="page-enter p-4 sm:p-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Dedicated Profile & Appearance Settings Modal */}
      <Modal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        title="Profile & Appearance Settings"
        description="Manage your EduNexus AI account identity, theme appearance preference, and accessibility options."
        maxWidth="lg"
      >
        <div className="space-y-6 text-xs">
          {/* Active Institutional Profile Header */}
          <div className="p-3.5 border border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#18181c] space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#71717a]">
              Active Institutional Profile
            </div>
            <div className="text-sm font-bold text-slate-900 dark:text-[#f4f4f5]">
              {session?.email || 'Institutional Workspace Session'}
            </div>
            <div className="text-slate-600 dark:text-[#a1a1aa]">
              Role: <span className="font-semibold uppercase text-slate-900 dark:text-[#f4f4f5]">{session?.role || 'advisor'}</span>
            </div>
          </div>

          {/* Base Appearance: Direct Two-Way Switch between Dark Mode and Light Mode */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#09090B] dark:text-[#FAFAFA] text-sm">
                Appearance
              </span>
              <span className="text-[11px] font-mono text-[#52525B] dark:text-[#A1A1AA]">
                Active: {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
              </span>
            </div>
            <p className="text-[#52525B] dark:text-[#A1A1AA] leading-relaxed">
              Choose your preferred theme. Changes apply immediately without page reload and persist across sessions.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Option 1: Dark Mode (Primary & Default) */}
              <button
                type="button"
                onClick={() => {
                  onThemeChange('dark');
                  onThemePreferenceChange?.('dark');
                }}
                aria-pressed={theme === 'dark'}
                className={cn(
                  'p-4 border text-left transition-all flex flex-col justify-between gap-3 rounded-none cursor-pointer',
                  theme === 'dark'
                    ? 'border-[#18181B] dark:border-[#A5B4FC] bg-[#18181B] text-white dark:bg-[#27272A] dark:text-[#FAFAFA] shadow-sm ring-1 ring-[#18181B] dark:ring-[#A5B4FC]'
                    : 'border-[#E4E4E7] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#141416] text-[#52525B] dark:text-[#A1A1AA] hover:border-[#A1A1AA] dark:hover:border-[#3F3F46]'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Moon className="h-4 w-4" />
                    <span className="h-3.5 w-3.5 inline-block bg-[#09090B] border border-[#3F3F46]" title="#09090B" />
                  </div>
                  {theme === 'dark' && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase bg-white/20 dark:bg-[#F4F4F5] dark:text-[#09090B]">
                      Selected
                    </span>
                  )}
                </div>
                <div>
                  <div className="font-bold text-sm">Dark Mode</div>
                  <div className="text-[12px] opacity-80 mt-1">Primary theme · Deep obsidian (#09090B) with zinc & indigo accents</div>
                </div>
              </button>

              {/* Option 2: Light Mode (Secondary Theme) */}
              <button
                type="button"
                onClick={() => {
                  onThemeChange('light');
                  onThemePreferenceChange?.('light');
                }}
                aria-pressed={theme === 'light'}
                className={cn(
                  'p-4 border text-left transition-all flex flex-col justify-between gap-3 rounded-none cursor-pointer',
                  theme === 'light'
                    ? 'border-[#4F46E5] bg-[#FFFFFF] text-[#09090B] shadow-sm ring-2 ring-[#4F46E5]'
                    : 'border-[#E4E4E7] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#141416] text-[#52525B] dark:text-[#A1A1AA] hover:border-[#A1A1AA] dark:hover:border-[#3F3F46]'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sun className="h-4 w-4 text-amber-500" />
                    <span className="h-3.5 w-3.5 inline-block bg-[#F5F5F5] border border-[#D4D4D8]" title="#F5F5F5" />
                  </div>
                  {theme === 'light' && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase bg-[#18181B] text-white">
                      Selected
                    </span>
                  )}
                </div>
                <div>
                  <div className="font-bold text-sm">Light Mode</div>
                  <div className="text-[12px] opacity-80 mt-1">Secondary theme · Clean neutral (#F5F5F5) & white (#FFFFFF) surfaces</div>
                </div>
              </button>
            </div>
          </div>

          {/* Container & Card Background Tints Section */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-[#27272a]">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 dark:text-[#f4f4f5] text-sm flex items-center gap-2">
                <Layers className="h-4 w-4" /> Container & Card Background Tints
              </span>
              <span className="text-[11px] font-mono text-slate-500 dark:text-[#a1a1aa]">
                Active: {SURFACE_TINT_OPTIONS.find((t) => t.id === surfaceTint)?.name || surfaceTint}
              </span>
            </div>
            <p className="text-slate-500 dark:text-[#a1a1aa] leading-relaxed">
              Choose subtle tinted ambient backgrounds for cards and dashboard containers with dedicated variations for Dark and Light modes.
            </p>

            <div
              role="radiogroup"
              aria-label="Container Background Tints"
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1"
            >
              {SURFACE_TINT_OPTIONS.map((tintOpt) => {
                const isSelected = surfaceTint === tintOpt.id;
                const activeBg = theme === 'dark' ? tintOpt.darkBg : tintOpt.lightBg;
                const altBg = theme === 'dark' ? tintOpt.lightBg : tintOpt.darkBg;
                return (
                  <button
                    key={tintOpt.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`Select ${tintOpt.label}`}
                    onClick={() => onSurfaceTintChange(tintOpt.id)}
                    className={cn(
                      'p-3 border text-left transition-all flex flex-col justify-between gap-2.5 rounded-none group cursor-pointer',
                      isSelected
                        ? 'border-zinc-900 dark:border-[#e4e4e7] bg-slate-50 dark:bg-[#18181c] shadow-2xs ring-1 ring-zinc-900 dark:ring-[#e4e4e7]'
                        : 'border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121215] hover:border-slate-400 dark:hover:border-[#3f3f46]'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {/* Dual-color preview chip: active surface with alternative tone swatch */}
                        <span
                          className="h-4 w-4 shrink-0 inline-flex items-center justify-center border border-black/15 dark:border-white/20 shadow-xs"
                          style={{ backgroundColor: activeBg }}
                        >
                          <span
                            className="h-2 w-2 border border-black/20 dark:border-white/20"
                            style={{ backgroundColor: altBg }}
                          />
                        </span>
                        <span className="font-bold text-xs text-slate-900 dark:text-[#f4f4f5]">
                          {tintOpt.name}
                        </span>
                      </div>
                      {isSelected && (
                        <span className="px-1 py-0.2 text-[9px] font-bold uppercase tracking-wider bg-zinc-900 text-white dark:bg-[#e4e4e7] dark:text-[#09090b]">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-[#a1a1aa] leading-snug">
                      {tintOpt.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Color Accent Swatches Section */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-[#27272a]">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 dark:text-[#f4f4f5] text-sm flex items-center gap-2">
                <Palette className="h-4 w-4" /> Color Accent Swatches
              </span>
              <span className="text-[11px] font-mono text-slate-500 dark:text-[#a1a1aa]">
                Active: {ACCENT_COLOR_OPTIONS.find((c) => c.id === accentColor)?.name || accentColor}
              </span>
            </div>
            <p className="text-slate-500 dark:text-[#a1a1aa] leading-relaxed">
              Select an accent palette for action buttons, active navigation markers, priority highlights, and focus outlines.
            </p>

            <div
              role="radiogroup"
              aria-label="Color Accent Swatches"
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1"
            >
              {ACCENT_COLOR_OPTIONS.map((opt) => {
                const isSelected = accentColor === opt.id;
                const swatchHex = theme === 'dark' ? opt.darkHex : opt.lightHex;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`Select ${opt.label}`}
                    onClick={() => onAccentColorChange(opt.id)}
                    className={cn(
                      'p-3 border text-left transition-all flex flex-col justify-between gap-2.5 rounded-none group',
                      isSelected
                        ? 'border-zinc-900 dark:border-[#e4e4e7] bg-slate-50 dark:bg-[#18181c] shadow-2xs ring-1 ring-zinc-900 dark:ring-[#e4e4e7]'
                        : 'border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121215] hover:border-slate-400 dark:hover:border-[#3f3f46]'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-4 w-4 shrink-0 inline-flex items-center justify-center border border-black/10 dark:border-white/20 shadow-xs"
                          style={{ backgroundColor: swatchHex }}
                        >
                          {isSelected && (
                            <Check
                              className={cn(
                                'h-3 w-3',
                                opt.id === 'monochrome' && theme === 'dark'
                                  ? 'text-zinc-950'
                                  : opt.id === 'amber' && theme === 'dark'
                                  ? 'text-zinc-950'
                                  : 'text-white'
                              )}
                            />
                          )}
                        </span>
                        <span className="font-bold text-xs text-slate-900 dark:text-[#f4f4f5]">
                          {opt.name}
                        </span>
                      </div>
                      {isSelected && (
                        <span className="px-1 py-0.2 text-[9px] font-bold uppercase tracking-wider bg-zinc-900 text-white dark:bg-[#e4e4e7] dark:text-[#09090b]">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-[#a1a1aa] leading-snug">
                      {opt.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Text Size & Typography Scale Section */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-[#27272a]">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 dark:text-[#f4f4f5] text-sm flex items-center gap-2">
                <Type className="h-4 w-4" /> Text Size & Typography Scale
              </span>
              <span className="text-[11px] font-mono text-slate-500 dark:text-[#a1a1aa]">
                Active: {FONT_SIZE_OPTIONS.find((f) => f.id === fontSize)?.name || fontSize} ({FONT_SIZE_OPTIONS.find((f) => f.id === fontSize)?.scaleLabel})
              </span>
            </div>
            <p className="text-slate-500 dark:text-[#a1a1aa] leading-relaxed">
              Dynamically scale typography across cards, metrics, student journey timelines, and navigation with guaranteed high contrast against background colors.
            </p>

            <div
              role="radiogroup"
              aria-label="Text Size & Typography Scale"
              className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1"
            >
              {FONT_SIZE_OPTIONS.map((opt) => {
                const isSelected = fontSize === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`Select ${opt.label}`}
                    onClick={() => onFontSizeChange(opt.id)}
                    className={cn(
                      'p-3 border text-left transition-all flex flex-col justify-between gap-2.5 rounded-none group cursor-pointer',
                      isSelected
                        ? 'border-zinc-900 dark:border-[#e4e4e7] bg-slate-50 dark:bg-[#18181c] shadow-2xs ring-1 ring-zinc-900 dark:ring-[#e4e4e7]'
                        : 'border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121215] hover:border-slate-400 dark:hover:border-[#3f3f46]'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'font-bold text-slate-900 dark:text-[#f4f4f5]',
                          opt.id === 'normal' ? 'text-sm' : opt.id === 'large' ? 'text-base' : 'text-lg'
                        )}>
                          {opt.name}
                        </span>
                        <span className="text-[10px] font-mono px-1 py-0.5 bg-slate-200 dark:bg-[#27272a] text-slate-700 dark:text-[#d4d4d8]">
                          {opt.scaleLabel}
                        </span>
                      </div>
                      {isSelected && (
                        <span className="px-1 py-0.2 text-[9px] font-bold uppercase tracking-wider bg-zinc-900 text-white dark:bg-[#e4e4e7] dark:text-[#09090b]">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-[#a1a1aa] leading-snug">
                      {opt.description}
                    </div>
                    <div className={cn(
                      'pt-1 border-t border-slate-200/60 dark:border-[#27272a]/60 text-slate-800 dark:text-[#e4e4e7] font-medium',
                      opt.id === 'normal' ? 'text-xs' : opt.id === 'large' ? 'text-sm' : 'text-base'
                    )}>
                      Aa Preview Text
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-[#27272a]">
            <span className="text-[11px] text-slate-400 dark:text-[#71717a]">
              Preferences sync automatically across browser sessions.
            </span>
            <button
              type="button"
              onClick={() => setProfileModalOpen(false)}
              className="px-5 py-2 bg-zinc-900 dark:bg-[#e4e4e7] text-white dark:text-[#09090b] font-semibold text-xs hover:opacity-90 app-accent-btn"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>

      {/* Multi-turn Gemini AI Analytics Copilot Drawer */}
      <GeminiCopilotDrawer />
    </div>
  );
};
