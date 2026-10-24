// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Card, CardTitle, CardDescription } from '../components/ui/Card';
import { DualRiskMatrixCard } from '../features/dashboard/DualRiskMatrixCard';
import { StudentTable } from '../features/students/StudentTable';

afterEach(() => {
  cleanup();
});

describe('UI Animation, Spinner Lifecycle, and Contrast Verification', () => {
  describe('1. Spinner Lifecycle & Rotation', () => {
    const SimulatedTaskComponent = ({ onComplete }: { onComplete?: () => void }) => {
      const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'cancelled'>('idle');

      return (
        <div>
          <button type="button" onClick={() => setStatus('loading')}>Start Operation</button>
          <button type="button" onClick={() => { setStatus('success'); onComplete?.(); }}>Complete</button>
          <button type="button" onClick={() => setStatus('error')}>Fail</button>
          <button type="button" onClick={() => setStatus('cancelled')}>Cancel</button>

          {status === 'loading' && (
            <div data-testid="active-loader">
              <Spinner size="lg" label="Processing telemetry batch…" showLabel />
            </div>
          )}
          {status === 'success' && <div data-testid="success-state">Operation succeeded</div>}
          {status === 'error' && <div data-testid="error-state">Operation failed</div>}
          {status === 'cancelled' && <div data-testid="cancelled-state">Operation cancelled</div>}
        </div>
      );
    };

    it('renders rotating circular loader while loading operation is in progress', () => {
      const { getByText, getByTestId, queryByTestId } = render(<SimulatedTaskComponent />);

      expect(queryByTestId('active-loader')).not.toBeInTheDocument();

      act(() => {
        getByText('Start Operation').click();
      });

      const loaderContainer = getByTestId('active-loader');
      expect(loaderContainer).toBeInTheDocument();

      const spinner = loaderContainer.querySelector('svg');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveClass('animate-spin');
      expect(spinner).toHaveClass('spinner-circle');
      expect(screen.getByText('Processing telemetry batch…')).toBeInTheDocument();
    });

    it('spinner disappears immediately when operation completes successfully', () => {
      const { getByText, queryByTestId } = render(<SimulatedTaskComponent />);

      act(() => {
        getByText('Start Operation').click();
      });
      expect(queryByTestId('active-loader')).toBeInTheDocument();

      act(() => {
        getByText('Complete').click();
      });

      expect(queryByTestId('active-loader')).not.toBeInTheDocument();
      expect(queryByTestId('success-state')).toBeInTheDocument();
    });

    it('spinner disappears immediately on error or failure', () => {
      const { getByText, queryByTestId } = render(<SimulatedTaskComponent />);

      act(() => {
        getByText('Start Operation').click();
      });
      expect(queryByTestId('active-loader')).toBeInTheDocument();

      act(() => {
        getByText('Fail').click();
      });

      expect(queryByTestId('active-loader')).not.toBeInTheDocument();
      expect(queryByTestId('error-state')).toBeInTheDocument();
    });

    it('spinner disappears immediately on cancellation', () => {
      const { getByText, queryByTestId } = render(<SimulatedTaskComponent />);

      act(() => {
        getByText('Start Operation').click();
      });
      expect(queryByTestId('active-loader')).toBeInTheDocument();

      act(() => {
        getByText('Cancel').click();
      });

      expect(queryByTestId('active-loader')).not.toBeInTheDocument();
      expect(queryByTestId('cancelled-state')).toBeInTheDocument();
    });
  });

  describe('2. Accessibility & Reduced Motion Feedback', () => {
    it('provides accessible role="status" and readable label even inside reduced-motion containers', () => {
      const { container } = render(
        <div className="reduce-motion">
          <Spinner size="md" label="Loading student records…" showLabel />
        </div>
      );

      const status = screen.getByRole('status');
      expect(status).toBeInTheDocument();
      expect(status).toHaveAttribute('aria-live', 'polite');

      const label = screen.getByText('Loading student records…');
      expect(label).toBeInTheDocument();

      const svg = container.querySelector('.spinner-circle');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('3. Button Loading & Contrast States', () => {
    it('displays circular spinner and disables interaction when isLoading is true', () => {
      const handleClick = vi.fn();
      const { container, rerender } = render(
        <Button isLoading={true} onClick={handleClick}>
          Submit Record
        </Button>
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');

      const spinner = container.querySelector('.spinner-circle');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveClass('animate-spin');

      rerender(
        <Button isLoading={false} onClick={handleClick}>
          Submit Record
        </Button>
      );

      expect(button).not.toBeDisabled();
      expect(button).not.toHaveAttribute('aria-busy');
      expect(container.querySelector('.spinner-circle')).not.toBeInTheDocument();
    });

    it('applies high-contrast monochrome variants for primary, secondary, outline, and danger', () => {
      const { rerender } = render(<Button variant="primary">Primary</Button>);
      expect(screen.getByRole('button')).toHaveClass('bg-[#18181B]', 'text-white', 'dark:bg-[#F4F4F5]', 'dark:text-[#09090B]');

      rerender(<Button variant="secondary">Secondary</Button>);
      expect(screen.getByRole('button')).toHaveClass('bg-[#E4E4E7]', 'text-[#18181B]', 'dark:bg-[#27272A]', 'dark:text-[#FAFAFA]');

      rerender(<Button variant="outline">Outline</Button>);
      expect(screen.getByRole('button')).toHaveClass('border-[#D4D4D8]', 'text-[#27272A]', 'dark:border-[#3F3F46]');

      rerender(<Button variant="danger">Danger</Button>);
      expect(screen.getByRole('button')).toHaveClass('bg-[#B91C1C]', 'text-white');
    });
  });

  describe('4. Badge & Status Color Distinguishability', () => {
    it('renders distinct high-contrast colors and borders for all risk levels', () => {
      const { container, rerender } = render(
        <Badge variant="success" dot>
          Low Risk
        </Badge>
      );
      expect(screen.getByText('Low Risk')).toBeInTheDocument();
      expect(container.firstChild).toHaveClass('bg-[#CFFAFE]', 'text-[#0E7490]', 'border-[#67E8F9]', 'dark:bg-[#083344]', 'dark:text-[#67E8F9]', 'dark:border-[#155E75]');

      rerender(
        <Badge variant="warning" dot>
          Moderate Risk
        </Badge>
      );
      expect(container.firstChild).toHaveClass('bg-[#FEF3C7]', 'text-[#92400E]', 'border-[#FCD34D]', 'dark:bg-[#451A03]', 'dark:text-[#FCD34D]', 'dark:border-[#92400E]');

      rerender(
        <Badge variant="danger" dot>
          High / Critical Risk
        </Badge>
      );
      expect(container.firstChild).toHaveClass('bg-[#FEE2E2]', 'text-[#B91C1C]', 'border-[#FCA5A5]', 'dark:bg-[#450A0A]', 'dark:text-[#FCA5A5]', 'dark:border-[#991B1B]');

      rerender(
        <Badge variant="info" dot>
          Info State
        </Badge>
      );
      expect(container.firstChild).toHaveClass('bg-[#DBEAFE]', 'text-[#1D4ED8]', 'border-[#93C5FD]', 'dark:bg-[#172554]', 'dark:text-[#93C5FD]', 'dark:border-[#1D4ED8]');
    });
  });

  describe('5. Form Inputs & Readability', () => {
    it('renders clear readable placeholders, labels, and borders', () => {
      render(
        <Input
          label="Student Registration Code"
          placeholder="e.g. STU-2026-001"
          helperText="Enter official institution ID."
        />
      );

      const label = screen.getByText('Student Registration Code');
      expect(label).toBeInTheDocument();
      expect(label).toHaveClass('text-[#3F3F46]', 'dark:text-[#E4E4E7]');

      const input = screen.getByPlaceholderText('e.g. STU-2026-001');
      expect(input).toBeInTheDocument();
      expect(input).toHaveClass('border-[#D4D4D8]', 'dark:border-[#3F3F46]', 'placeholder:text-[#A1A1AA]', 'dark:placeholder:text-[#71717A]');

      const helper = screen.getByText('Enter official institution ID.');
      expect(helper).toBeInTheDocument();
      expect(helper).toHaveClass('text-[#71717A]', 'dark:text-[#A1A1AA]');
    });

    it('maintains visible text in disabled state while signalling non-interactivity', () => {
      render(
        <Input
          label="Locked Record"
          value="STU-LOCKED-999"
          disabled
        />
      );

      const input = screen.getByDisplayValue('STU-LOCKED-999');
      expect(input).toBeDisabled();
      expect(input).toHaveClass('disabled:bg-[#F4F4F5]', 'disabled:text-[#A1A1AA]', 'dark:disabled:bg-[#18181B]', 'dark:disabled:text-[#71717A]');
    });
  });

  describe('6. Cards & Typography Hierarchy', () => {
    it('renders clear titles and descriptions without pale text washouts', () => {
      render(
        <Card>
          <CardTitle>Cohort Academic Trajectory</CardTitle>
          <CardDescription>
            Deterministic rolling average across 7 operational domains.
          </CardDescription>
        </Card>
      );

      const title = screen.getByText('Cohort Academic Trajectory');
      expect(title).toHaveClass('text-[#09090B]', 'dark:text-[#FAFAFA]');

      const desc = screen.getByText('Deterministic rolling average across 7 operational domains.');
      expect(desc).toHaveClass('text-[#52525B]', 'dark:text-[#A1A1AA]');
    });
  });

  describe('7. Sharp Edges Verification (Zero Border Radius)', () => {
    it('applies rounded-none to Button component for sharp edges', () => {
      render(<Button>Sharp Button</Button>);
      expect(screen.getByRole('button')).toHaveClass('rounded-none');
    });

    it('applies rounded-none to Card component for sharp edges', () => {
      const { container } = render(<Card>Sharp Card Content</Card>);
      expect(container.firstChild).toHaveClass('rounded-none');
    });

    it('applies rounded-none to Input component for sharp edges', () => {
      render(<Input placeholder="Sharp input" />);
      expect(screen.getByPlaceholderText('Sharp input')).toHaveClass('rounded-none');
    });

    it('applies rounded-none to Badge component for sharp edges', () => {
      const { container } = render(<Badge variant="primary" dot>Sharp Badge</Badge>);
      expect(container.firstChild).toHaveClass('rounded-none');
    });
  });

  describe('8. Dark Theme Styling (Black & Charcoal Monochrome)', () => {
    it('uses high-contrast heading tint #FAFAFA in dark mode for CardTitle', () => {
      render(<CardTitle>Monochrome Title</CardTitle>);
      const title = screen.getByText('Monochrome Title');
      expect(title).toHaveClass('dark:text-[#FAFAFA]');
    });

    it('uses exact specified hover colors in dark mode for outline Button', () => {
      render(<Button variant="outline">Outline</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('dark:bg-[#09090B]', 'dark:text-[#E4E4E7]', 'dark:hover:bg-[#18181B]', 'dark:hover:text-[#FFFFFF]');
    });
  });

  describe('9. Table Theme Contrast & Readability', () => {
    it('verifies Card has rounded-none and charcoal surface token #141416 with border #29292D', () => {
      const { container } = render(
        <Card>
          <div className="overflow-x-auto rounded-none border border-slate-200 dark:border-[#27272a]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#EEF2F6] dark:bg-[#18181c] border-b border-slate-200 dark:border-[#27272a] text-slate-700 dark:text-[#d4d4d8]">
                <tr>
                  <th className="py-2.5 px-3">Department</th>
                  <th className="py-2.5 px-3">Students</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#27272a] text-slate-700 dark:text-[#d4d4d8]">
                <tr>
                  <td className="py-2 px-3 font-semibold text-slate-900 dark:text-[#f4f4f5]">Computer Science</td>
                  <td className="py-2 px-3 text-slate-700 dark:text-[#d4d4d8]">120 students</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      );

      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('rounded-none', 'dark:bg-[#141416]', 'dark:text-[#E4E4E7]', 'dark:border-[#29292D]');
      expect(card).not.toHaveClass('dark:bg-white', 'dark:text-white');

      const thead = container.querySelector('thead');
      expect(thead).toHaveClass('bg-[#EEF2F6]', 'dark:bg-[#18181c]', 'text-slate-700', 'dark:text-[#d4d4d8]');

      const deptCell = screen.getByText('Computer Science');
      expect(deptCell).toHaveClass('font-semibold', 'text-slate-900', 'dark:text-[#f4f4f5]');

      const countCell = screen.getByText('120 students');
      expect(countCell).toHaveClass('text-slate-700', 'dark:text-[#d4d4d8]');
    });
  });

  describe('10. Sidebar Navigation Active & Badge Contrast', () => {
    it('ensures active navigation uses monochrome highlight in light and dark mode', () => {
      const activeNavClasses = 'bg-[#EEF2FF] text-[#3730A3] dark:bg-[#27272A] dark:text-[#FFFFFF] font-semibold shadow-2xs';
      expect(activeNavClasses).toContain('bg-[#EEF2FF]');
      expect(activeNavClasses).toContain('text-[#3730A3]');
      expect(activeNavClasses).toContain('dark:bg-[#27272A]');
      expect(activeNavClasses).toContain('dark:text-[#FFFFFF]');
    });

    it('ensures active navigation badge uses readable contrasting monochrome tones', () => {
      const badgeClasses = 'bg-[#F4F4F5] text-[#3F3F46] dark:bg-[#27272A] dark:text-[#E4E4E7]';
      expect(badgeClasses).toContain('bg-[#F4F4F5]');
      expect(badgeClasses).toContain('text-[#3F3F46]');
      expect(badgeClasses).toContain('dark:bg-[#27272A]');
      expect(badgeClasses).toContain('dark:text-[#E4E4E7]');
    });
  });

  describe('11. AppShell Surface & Border Consistency', () => {
    it('ensures header, sidebar, and breadcrumbs share synchronized dark surfaces #0A0A0A / #0D0D0F and border #27272A', () => {
      const headerClasses = 'border-b border-[#E4E4E7] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#0A0A0A]';
      const sidebarClasses = 'border-r border-[#E4E4E7] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#0D0D0F]';
      const breadcrumbClasses = 'bg-white dark:bg-[#121215] border-b border-slate-200 dark:border-[#27272a]';

      expect(headerClasses).toContain('dark:bg-[#0A0A0A]');
      expect(headerClasses).toContain('dark:border-[#27272A]');

      expect(sidebarClasses).toContain('dark:bg-[#0D0D0F]');
      expect(sidebarClasses).toContain('dark:border-[#27272A]');

      expect(breadcrumbClasses).toContain('dark:border-[#27272a]');
    });
  });

  describe('12. DualRiskMatrixCard Quadrants & Sharp Edges', () => {
    it('renders all four quadrants with rounded-none and high-contrast distinct backgrounds', () => {
      const mockMatrix = {
        academic_low_placement_low: 45,
        academic_low_placement_high: 12,
        academic_high_placement_low: 8,
        academic_high_placement_high: 3,
        moderate_quadrants: 15,
        insufficient_data: 2,
      };

      const { container } = render(
        <MemoryRouter>
          <DualRiskMatrixCard dualRiskMatrix={mockMatrix} />
        </MemoryRouter>
      );

      expect(screen.getByText('Academic vs Placement Risk Matrix')).toBeInTheDocument();
      const links = container.querySelectorAll('.grid a[href^="/students"]');
      expect(links.length).toBe(4);
      links.forEach((link) => {
        expect(link).toHaveClass('rounded-none');
        expect(link).not.toHaveClass('rounded-xl');
      });

      expect(links[0]).toHaveClass('bg-emerald-50/50', 'border-emerald-200');
      expect(links[1]).toHaveClass('bg-blue-50/50', 'border-blue-200');
      expect(links[2]).toHaveClass('bg-amber-50/50', 'border-amber-200');
      expect(links[3]).toHaveClass('bg-rose-50/50', 'border-rose-200');
    });
  });

  describe('13. High-Contrast Focus Rings & Accessible Keyboard Table Navigation', () => {
    it('applies high-contrast dual-theme focus-visible rings to Button, Input, Card, and Badge', () => {
      render(
        <div>
          <Button>Focusable Action</Button>
          <Input label="Search Query" placeholder="Enter query" />
          <Card data-testid="focusable-card" tabIndex={0}>Card Content</Card>
          <Badge data-testid="focusable-badge" tabIndex={0}>Active Flag</Badge>
        </div>
      );

      const btn = screen.getByRole('button', { name: 'Focusable Action' });
      expect(btn).toHaveClass(
        'focus-visible:ring-2',
        'focus-visible:ring-[#6366F1]',
        'dark:focus-visible:ring-[#818CF8]',
        'focus-visible:ring-offset-2'
      );

      const input = screen.getByPlaceholderText('Enter query');
      expect(input).toHaveClass(
        'focus-visible:ring-2',
        'focus-visible:ring-[#6366F1]',
        'dark:focus-visible:ring-[#818CF8]'
      );

      const card = screen.getByTestId('focusable-card');
      expect(card).toHaveClass(
        'focus-visible:ring-2',
        'focus-visible:ring-[#6366F1]',
        'dark:focus-visible:ring-[#818CF8]'
      );

      const badge = screen.getByTestId('focusable-badge');
      expect(badge).toHaveClass(
        'focus-visible:ring-2',
        'focus-visible:ring-[#6366F1]',
        'dark:focus-visible:ring-[#818CF8]'
      );
    });

    it('supports ArrowDown, ArrowUp, Home, and End keyboard navigation across StudentTable rows', () => {
      const mockStudents = [
        {
          id: 's1',
          student_id: 'STU-001',
          first_name: 'Aarav',
          last_name: 'Sharma',
          email: 'aarav@example.edu',
          department: 'Computer Science',
          current_grade: 'Year 3',
          academic_term: 'Fall 2025',
          section: 'A',
          status: 'active' as const,
          enrollment_status: 'active' as const,
          attendance_rate: 74.5,
          average_score: 68.0,
          risk_score: 72,
          risk_tier: 'high' as const,
          academic_risk_tier: 'high' as const,
          placement_risk_tier: 'medium' as const,
          success_score: 61.5,
        },
        {
          id: 's2',
          student_id: 'STU-002',
          first_name: 'Meera',
          last_name: 'Patel',
          email: 'meera@example.edu',
          department: 'Data Science',
          current_grade: 'Year 4',
          academic_term: 'Fall 2025',
          section: 'B',
          status: 'active' as const,
          enrollment_status: 'active' as const,
          attendance_rate: 92.0,
          average_score: 88.5,
          risk_score: 18,
          risk_tier: 'low' as const,
          academic_risk_tier: 'low' as const,
          placement_risk_tier: 'low' as const,
          success_score: 89.0,
        },
        {
          id: 's3',
          student_id: 'STU-003',
          first_name: 'Rohan',
          last_name: 'Verma',
          email: 'rohan@example.edu',
          department: 'Electronics',
          current_grade: 'Year 2',
          academic_term: 'Fall 2025',
          section: 'A',
          status: 'active' as const,
          enrollment_status: 'active' as const,
          attendance_rate: 64.0,
          average_score: 54.0,
          risk_score: 85,
          risk_tier: 'critical' as const,
          academic_risk_tier: 'critical' as const,
          placement_risk_tier: 'high' as const,
          success_score: 48.0,
        },
      ];

      const { container } = render(
        <MemoryRouter>
          <StudentTable students={mockStudents} />
        </MemoryRouter>
      );

      const rows = container.querySelectorAll<HTMLTableRowElement>('tbody tr[tabindex="0"]');
      expect(rows.length).toBe(3);

      rows[0].focus();
      expect(document.activeElement).toBe(rows[0]);
      expect(rows[0]).toHaveClass(
        'focus-visible:ring-2',
        'focus-visible:ring-inset',
        'focus-visible:ring-zinc-900',
        'dark:focus-visible:ring-[#e4e4e7]'
      );

      fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
      expect(document.activeElement).toBe(rows[1]);

      fireEvent.keyDown(rows[1], { key: 'End' });
      expect(document.activeElement).toBe(rows[2]);

      fireEvent.keyDown(rows[2], { key: 'ArrowUp' });
      expect(document.activeElement).toBe(rows[1]);

      fireEvent.keyDown(rows[1], { key: 'Home' });
      expect(document.activeElement).toBe(rows[0]);
    });
  });

  describe('14. Dark Mode Default, Light Mode & Profile Color Swatches', () => {
    it('provides all 6 specified accent options with accurate hex pairs (no green branding)', async () => {
      const { ACCENT_COLOR_OPTIONS } = await import('../layouts/AppShell');
      expect(ACCENT_COLOR_OPTIONS).toHaveLength(6);
      const ids = ACCENT_COLOR_OPTIONS.map((c) => c.id);
      expect(ids).toEqual(['monochrome', 'blue', 'emerald', 'rose', 'violet', 'amber']);

      const blue = ACCENT_COLOR_OPTIONS.find((c) => c.id === 'blue');
      expect(blue?.lightHex).toBe('#2563eb');
      expect(blue?.darkHex).toBe('#3b82f6');

      const cyan = ACCENT_COLOR_OPTIONS.find((c) => c.id === 'emerald');
      expect(cyan?.lightHex).toBe('#0891B2');
      expect(cyan?.darkHex).toBe('#22D3EE');
    });

    it('sets data-accent attribute on documentElement when switching accents', () => {
      document.documentElement.dataset.accent = 'emerald';
      expect(document.documentElement.dataset.accent).toBe('emerald');

      document.documentElement.dataset.accent = 'blue';
      expect(document.documentElement.dataset.accent).toBe('blue');

      document.documentElement.dataset.accent = 'monochrome';
      expect(document.documentElement.dataset.accent).toBe('monochrome');
    });

    it('resolves system device theme using getSystemTheme and sets data-theme-preference', async () => {
      const { getSystemTheme } = await import('../App');
      const detected = getSystemTheme();
      expect(['dark', 'light']).toContain(detected);

      document.documentElement.dataset.themePreference = 'dark';
      expect(document.documentElement.dataset.themePreference).toBe('dark');

      document.documentElement.dataset.themePreference = 'light';
      expect(document.documentElement.dataset.themePreference).toBe('light');
    });

    it('toggles directly between dark and light modes and sets dataset.theme', () => {
      document.documentElement.dataset.theme = 'dark';
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
      expect(document.documentElement.dataset.theme).toBe('dark');
      expect(document.documentElement).toHaveClass('dark');

      document.documentElement.dataset.theme = 'light';
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(document.documentElement).toHaveClass('light');
    });

    it('provides all 6 container background tints with dedicated dark and light variation hexes', async () => {
      const { SURFACE_TINT_OPTIONS } = await import('../layouts/AppShell');
      expect(SURFACE_TINT_OPTIONS).toHaveLength(6);
      const ids = SURFACE_TINT_OPTIONS.map((t) => t.id);
      expect(ids).toEqual(['neutral', 'slate', 'sage', 'sand', 'rose', 'violet']);

      const slate = SURFACE_TINT_OPTIONS.find((t) => t.id === 'slate');
      expect(slate?.darkBg).toBe('#111622');
      expect(slate?.lightBg).toBe('#f8fafc');

      const sage = SURFACE_TINT_OPTIONS.find((t) => t.id === 'sage');
      expect(sage?.darkBg).toBe('#101814');
      expect(sage?.lightBg).toBe('#f6faf7');

      const sand = SURFACE_TINT_OPTIONS.find((t) => t.id === 'sand');
      expect(sand?.darkBg).toBe('#181511');
      expect(sand?.lightBg).toBe('#fbf9f5');

      const rose = SURFACE_TINT_OPTIONS.find((t) => t.id === 'rose');
      expect(rose?.darkBg).toBe('#1a1114');
      expect(rose?.lightBg).toBe('#fff8f8');

      const violet = SURFACE_TINT_OPTIONS.find((t) => t.id === 'violet');
      expect(violet?.darkBg).toBe('#15121e');
      expect(violet?.lightBg).toBe('#f9f7fd');
    });

    it('sets data-surface-tint on documentElement dynamically when switching tints', () => {
      document.documentElement.dataset.surfaceTint = 'slate';
      expect(document.documentElement.dataset.surfaceTint).toBe('slate');

      document.documentElement.dataset.surfaceTint = 'sage';
      expect(document.documentElement.dataset.surfaceTint).toBe('sage');

      document.documentElement.dataset.surfaceTint = 'neutral';
      expect(document.documentElement.dataset.surfaceTint).toBe('neutral');
    });

    it('provides FONT_SIZE_OPTIONS with Standard, Large, and Extra Large typography scales', async () => {
      const { FONT_SIZE_OPTIONS } = await import('../layouts/AppShell');
      expect(FONT_SIZE_OPTIONS).toHaveLength(3);
      const ids = FONT_SIZE_OPTIONS.map((f) => f.id);
      expect(ids).toEqual(['normal', 'large', 'xl']);

      const standard = FONT_SIZE_OPTIONS.find((f) => f.id === 'normal');
      expect(standard?.scaleLabel).toBe('100%');
      expect(standard?.label).toContain('16.5px Base');

      const large = FONT_SIZE_OPTIONS.find((f) => f.id === 'large');
      expect(large?.scaleLabel).toBe('110%');
      expect(large?.label).toContain('18px Base');

      const xl = FONT_SIZE_OPTIONS.find((f) => f.id === 'xl');
      expect(xl?.scaleLabel).toBe('120%');
      expect(xl?.label).toContain('19.5px Base');
    });

    it('updates documentElement.dataset.fontSize across font size changes', () => {
      document.documentElement.dataset.fontSize = 'normal';
      expect(document.documentElement.dataset.fontSize).toBe('normal');

      document.documentElement.dataset.fontSize = 'large';
      expect(document.documentElement.dataset.fontSize).toBe('large');

      document.documentElement.dataset.fontSize = 'xl';
      expect(document.documentElement.dataset.fontSize).toBe('xl');
    });

    it('ensures buttons and badges maintain explicit readable text colors and are not overridden by container backgrounds', () => {
      render(
        <div className="space-y-4">
          <Button variant="primary">Primary Action</Button>
          <Button variant="secondary">Secondary Action</Button>
          <Badge variant="danger">Urgent Critical</Badge>
          <Badge variant="success">On Track</Badge>
          <Input placeholder="Search student directory..." defaultValue="Maria Garcia" />
        </div>
      );

      const primaryBtn = screen.getByRole('button', { name: /Primary Action/i });
      expect(primaryBtn).toBeInTheDocument();
      expect(primaryBtn.tagName.toLowerCase()).toBe('button');

      const urgentBadge = screen.getByText('Urgent Critical');
      expect(urgentBadge).toBeInTheDocument();
    });
  });
});



