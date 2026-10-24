import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context';
import { AppShell } from './layouts/AppShell';
import { safeStorageGet, safeStorageSet } from './lib/utils';
import {
  AnalyticsPage,
  CsvHubPage,
  DashboardPage,
  HelpPage,
  InterventionsPage,
  LoginPage,
  NotFoundPage,
  RegisterPage,
  StudentJourneyPage,
  StudentsPage,
} from './pages';

export type AppTheme = 'light' | 'dark';
export type ThemePreference = 'system' | 'dark' | 'light';
export type AccentColor = 'monochrome' | 'blue' | 'emerald' | 'rose' | 'violet' | 'amber';
export type SurfaceTint = 'neutral' | 'slate' | 'sage' | 'sand' | 'rose' | 'violet';
export type AppFontSize = 'normal' | 'large' | 'xl';

export function getSystemTheme(): AppTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function AppRoutes({
  theme = 'dark',
  onThemeChange = () => {},
  accentColor = 'monochrome',
  onAccentColorChange = () => {},
  surfaceTint = 'neutral',
  onSurfaceTintChange = () => {},
  fontSize = 'normal',
  onFontSizeChange = () => {},
}: {
  theme?: AppTheme;
  onThemeChange?: (theme: AppTheme) => void;
  themePreference?: ThemePreference;
  onThemePreferenceChange?: (pref: ThemePreference) => void;
  systemTheme?: AppTheme;
  accentColor?: AccentColor;
  onAccentColorChange?: (accent: AccentColor) => void;
  surfaceTint?: SurfaceTint;
  onSurfaceTintChange?: (tint: SurfaceTint) => void;
  fontSize?: AppFontSize;
  onFontSizeChange?: (size: AppFontSize) => void;
}) {
  return (
    <Routes>
      {/* Dedicated Institutional Login & Registration Routes */}
      <Route
        path="/login"
        element={
          <LoginPage
            theme={theme}
            onThemeChange={onThemeChange}
            accentColor={accentColor}
            onAccentColorChange={onAccentColorChange}
          />
        }
      />
      <Route
        path="/register"
        element={
          <RegisterPage
            theme={theme}
            onThemeChange={onThemeChange}
            accentColor={accentColor}
            onAccentColorChange={onAccentColorChange}
          />
        }
      />

      {/* Main direct-access application layout */}
      <Route
        path="/"
        element={
          <AppShell
            theme={theme}
            onThemeChange={onThemeChange}
            accentColor={accentColor}
            onAccentColorChange={onAccentColorChange}
            surfaceTint={surfaceTint}
            onSurfaceTintChange={onSurfaceTintChange}
            fontSize={fontSize}
            onFontSizeChange={onFontSizeChange}
          />
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="students/:id" element={<StudentJourneyPage />} />
        <Route path="journey" element={<StudentJourneyPage />} />
        <Route path="journey/:id" element={<StudentJourneyPage />} />
        <Route path="interventions" element={<InterventionsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="csv-hub" element={<CsvHubPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  const [theme, setTheme] = useState<AppTheme>(() => {
    const saved = safeStorageGet('edunexus_theme');
    if (saved === 'dark' || saved === 'light') {
      return saved;
    }
    const savedPref = safeStorageGet('edunexus_theme_preference');
    if (savedPref === 'dark' || savedPref === 'light') {
      return savedPref;
    }
    // Requirement: Black/Dark Mode is the default for new users
    return 'dark';
  });

  const [accentColor, setAccentColor] = useState<AccentColor>(() => {
    const saved = safeStorageGet('edunexus_accent_color');
    if (
      saved === 'blue' ||
      saved === 'emerald' ||
      saved === 'rose' ||
      saved === 'violet' ||
      saved === 'amber'
    ) {
      return saved;
    }
    return 'monochrome';
  });

  const [surfaceTint, setSurfaceTint] = useState<SurfaceTint>(() => {
    const saved = safeStorageGet('edunexus_surface_tint');
    if (
      saved === 'slate' ||
      saved === 'sage' ||
      saved === 'sand' ||
      saved === 'rose' ||
      saved === 'violet'
    ) {
      return saved;
    }
    return 'neutral';
  });

  const [fontSize, setFontSize] = useState<AppFontSize>(() => {
    const saved = safeStorageGet('edunexus_font_size');
    if (saved === 'normal' || saved === 'large' || saved === 'xl') {
      return saved;
    }
    return 'normal';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = theme;
    document.documentElement.dataset.accent = accentColor;
    document.documentElement.dataset.surfaceTint = surfaceTint;
    document.documentElement.dataset.fontSize = fontSize;
    document.documentElement.removeAttribute('data-palette');
    document.documentElement.style.colorScheme = theme;
    document.documentElement.style.backgroundColor = theme === 'dark' ? '#09090B' : '#F5F5F5';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme, accentColor, surfaceTint, fontSize]);

  const handleThemeChange = (nextTheme: AppTheme) => {
    setTheme(nextTheme);
    safeStorageSet('edunexus_theme', nextTheme);
    safeStorageSet('edunexus_theme_preference', nextTheme);
    // Non-blocking sync to authenticated user record if a session exists
    void fetch('/api/auth/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: nextTheme, accent: accentColor, surfaceTint, fontSize }),
    }).catch(() => {
      // Ignore if unauthenticated
    });
  };

  const handleAccentColorChange = (nextAccent: AccentColor) => {
    setAccentColor(nextAccent);
    safeStorageSet('edunexus_accent_color', nextAccent);
    document.documentElement.dataset.accent = nextAccent;
    // Non-blocking sync to authenticated user record if a session exists
    void fetch('/api/auth/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme, accent: nextAccent, surfaceTint, fontSize }),
    }).catch(() => {
      // Ignore if unauthenticated
    });
  };

  const handleSurfaceTintChange = (nextTint: SurfaceTint) => {
    setSurfaceTint(nextTint);
    safeStorageSet('edunexus_surface_tint', nextTint);
    document.documentElement.dataset.surfaceTint = nextTint;
    // Non-blocking sync to authenticated user record if a session exists
    void fetch('/api/auth/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme, accent: accentColor, surfaceTint: nextTint, fontSize }),
    }).catch(() => {
      // Ignore if unauthenticated
    });
  };

  const handleFontSizeChange = (nextSize: AppFontSize) => {
    setFontSize(nextSize);
    safeStorageSet('edunexus_font_size', nextSize);
    document.documentElement.dataset.fontSize = nextSize;
    // Non-blocking sync to authenticated user record if a session exists
    void fetch('/api/auth/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme, accent: accentColor, surfaceTint, fontSize: nextSize }),
    }).catch(() => {
      // Ignore if unauthenticated
    });
  };

  return (
    <div
      className={`${theme === 'dark' ? 'dark-app' : 'light-app'} min-h-screen`}
      data-accent={accentColor}
      data-surface-tint={surfaceTint}
      data-font-size={fontSize}
    >
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes
            theme={theme}
            onThemeChange={handleThemeChange}
            accentColor={accentColor}
            onAccentColorChange={handleAccentColorChange}
            surfaceTint={surfaceTint}
            onSurfaceTintChange={handleSurfaceTintChange}
            fontSize={fontSize}
            onFontSizeChange={handleFontSizeChange}
          />
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
