# Implementation Plan - Subtle Tinted Card & Dashboard Container Backgrounds

Introduce customizable, subtle tinted card and container background color options for the EduNexus AI platform, featuring dedicated dark and light mode variations with live preview swatches inside the Profile menu appearance section.

---

## User Review Required

> [!NOTE]
> Based on your clarifying choices:
> 1. **Background Style**: Subtle tinted card and dashboard container backgrounds only (retaining high readability and crisp borders).
> 2. **Theme Pairing**: Dedicated dark and light variations for each background tone.
> 3. **Placement**: Located inside the Profile menu appearance section (both the profile dropdown and the profile settings modal) with live preview swatches.

---

## Proposed Changes

### 1. Theme & Surface Tint Type Definitions (`frontend/src/types/index.ts` & `App.tsx`)
- Define `SurfaceTint` union:
  ```ts
  export type SurfaceTint = 'neutral' | 'slate' | 'sage' | 'sand' | 'rose' | 'violet';
  ```
- Export `SURFACE_TINT_OPTIONS` array with metadata:
  - `id`: Tint identifier
  - `name`: Display label (e.g., "Classic Neutral", "Slate Mist", "Sage Emerald", "Warm Sand", "Rose Dusk", "Scholarly Violet")
  - `darkBg`: Hex preview for dark mode surface (`#121215`, `#111622`, `#101814`, `#171410`, `#1a1114`, `#15121e`)
  - `lightBg`: Hex preview for light mode surface (`#ffffff`, `#f1f5f9`, `#f0f7f3`, `#fdfbf7`, `#fff1f2`, `#f5f3ff`)
  - `description`: Educational institutional tone description

### 2. Global CSS Token System (`frontend/src/index.css`)
- Define data attribute selectors: `[data-surface-tint="neutral"]`, `[data-surface-tint="slate"]`, `[data-surface-tint="sage"]`, `[data-surface-tint="sand"]`, `[data-surface-tint="rose"]`, `[data-surface-tint="violet"]`.
- Map `--card-bg`, `--card-border`, `--subtle-bg` tokens for both light and dark modes:
  - **Neutral**: Default pure white light (`#ffffff`) and deep obsidian dark (`#121215`)
  - **Slate Mist**: Crisp iced slate light (`#f1f5f9`) and deep navy-charcoal dark (`#111622`)
  - **Sage Emerald**: Fresh organic mint light (`#f0f7f3`) and nocturnal pine dark (`#101814`)
  - **Warm Sand**: Architectural parchment light (`#fdfbf7`) and warm espresso dark (`#171410`)
  - **Rose Dusk**: Gentle crimson blush light (`#fff1f2`) and burgundy twilight dark (`#1a1114`)
  - **Scholarly Violet**: Scholarly lavender light (`#f5f3ff`) and deep astral purple dark (`#15121e`)
- Apply tinted backgrounds seamlessly to `.card-surface`, `.app-shell-header`, `.app-shell-sidebar`, and card containers without breaking text contrast or 0-pill discipline.

### 3. Application State & Storage Sync (`frontend/src/App.tsx`)
- Manage `surfaceTint` state initialized from `safeStorageGet('edunexus_surface_tint') || 'neutral'`.
- Apply `document.documentElement.dataset.surfaceTint = surfaceTint` in `useEffect`.
- Handle persistence in `localStorage` and sync to `/api/auth/preferences`.
- Pass `surfaceTint` and `onSurfaceTintChange` through `AppRoutes` to `AppShell`.

### 4. Profile Menu & Settings Modal UI (`frontend/src/layouts/AppShell.tsx`)
- **Header Profile Dropdown**:
  - Add a "Container Background Tint" section with 6 interactive circular/square swatches displaying dual split-tone or tinted chips for live visual feedback.
  - Active indicator, label, and title tooltip for each tint.
- **Profile Settings Modal**:
  - Add a dedicated "Card & Container Background Tints" section with a 6-option responsive grid.
  - Each option renders:
    - Dual split-color swatch showing Dark and Light tint variations
    - Tint title and description
    - "Selected" badge when active
    - Accessible radio semantics (`role="radiogroup"` / `aria-checked`)

### 5. Unit Tests (`frontend/src/__tests__/UIAnimationAndContrast.test.tsx`)
- Add unit tests verifying:
  - All 6 surface tint options exist with verified hex pairs.
  - Setting `dataset.surfaceTint` dynamically updates root element.
  - Local storage key `edunexus_surface_tint` correctly persists state.

---

## Verification Plan

### Automated Build & Compilation
- Run `compile_applet` to ensure TypeScript types and bundle compilation pass with 0 errors.
- Run `lint_applet` to ensure full compliance with zero warnings/errors.

### Automated Test Suite
- Run `npm --prefix frontend test -- --run` to ensure all existing test suites (121 tests) and new surface tint tests pass cleanly.

### Manual Verification
- Test each tint in Dark Mode and Light Mode via the Profile dropdown and Profile Modal.
- Verify that typography contrast remains WCAG AA compliant across all 6 container tints.
