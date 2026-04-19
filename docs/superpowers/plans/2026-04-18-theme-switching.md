# Theme Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed violet accent with 4 user-selectable themes (Rose default, Amber, Sky, Violet), synced cross-device via Supabase, with instant switching from Settings.

**Architecture:** CSS custom properties on `[data-theme]` override ~7 `--md-*` variables — zero component changes needed. A `useTheme` hook owns state, syncs localStorage ↔ DB. An inline script in `layout.tsx` applies the stored theme before hydration to prevent flash.

**Tech Stack:** Next.js 16 App Router · Tailwind CSS v4 · Supabase (`user_profiles` table) · Vitest + @testing-library/react-hooks

**Spec:** `docs/superpowers/specs/2026-04-18-theme-switching-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `web/src/app/globals.css` | Modify | Add `[data-theme]` override blocks; update `:root` to Rose |
| `web/src/app/layout.tsx` | Modify | Add flash-prevention inline script |
| `web/src/lib/theme/useTheme.ts` | Create | Hook: read/write theme from localStorage + DB |
| `web/src/lib/theme/useTheme.test.ts` | Create | Unit tests for the hook |
| `web/src/app/api/profile/route.ts` | Modify | Add `theme` to GET response and PATCH handler |
| `web/src/components/ui/Sidebar.tsx` | Modify | Nav active state: solid fill → left border + dim bg |
| `web/src/app/(app)/settings/page.tsx` | Modify | Add Appearance section with swatch picker |
| `supabase/migrations/20260418000000_add_theme_to_user_profiles.sql` | Create | Add `theme` column |

---

## Task 1: Hardcoded color audit

Find and replace raw color values that would resist theming. Run from `web/`.

**Files:** Any file under `web/src/` (excluding `globals.css`, `*.test.*`, `node_modules`)

- [ ] **Step 1: Search for raw Tailwind palette classes**

```bash
cd web && npx grep-pattern() { grep -rn "$1" src/ --include="*.tsx" --include="*.ts" --include="*.css" \
  --exclude="globals.css" \
  --exclude="*.test.*" \
  --exclude-dir=node_modules; }

grep -rn \
  -e "bg-gray-\|bg-slate-\|bg-zinc-\|bg-neutral-\|bg-violet-\|bg-purple-\|bg-green-\|bg-red-\|bg-blue-\|bg-amber-\|bg-yellow-\|bg-rose-\|bg-sky-\|bg-white\b\|bg-black\b" \
  -e "text-gray-\|text-slate-\|text-zinc-\|text-violet-\|text-purple-\|text-green-\|text-white\b\|text-black\b" \
  -e "border-gray-\|border-violet-\|border-purple-" \
  src/ --include="*.tsx" --exclude-dir=node_modules
```

- [ ] **Step 2: Search for inline hex/rgba colors in style props**

```bash
grep -rn "style={{.*#[0-9a-fA-F]\{3,6\}\|style={{.*rgba(" \
  src/ --include="*.tsx" --exclude-dir=node_modules
```

- [ ] **Step 3: Search for banned opacity modifiers on semantic tokens**

```bash
grep -rn "bg-primary/\|bg-brand/\|bg-surface/\|text-primary/\|text-brand/" \
  src/ --include="*.tsx" --exclude-dir=node_modules
```

- [ ] **Step 4: Fix each finding**

For each match, replace with the nearest semantic token from `globals.css`. Common mappings:

| Raw value | Use instead |
|---|---|
| `text-white` | `text-on-surface` |
| `bg-black/60` | `bg-scrim/60` |
| `text-gray-400` | `text-on-surface-variant` |
| `text-gray-500` | `text-on-surface-dim` |
| `bg-gray-800` | `bg-surface-container` |
| `text-violet-*` | `text-primary` |
| `bg-violet-*` | `bg-brand` |
| `bg-primary/10` | `bg-primary-container` (or define a new token) |

- [ ] **Step 5: Build to confirm no TypeScript errors**

```bash
npm run build 2>&1 | tail -20
```

Expected: build completes with no errors.

- [ ] **Step 6: Commit**

```bash
git add -p
git commit -m "fix: replace hardcoded colors with semantic tokens for theme compatibility"
```

---

## Task 2: DB migration

**Files:**
- Create: `supabase/migrations/20260418000000_add_theme_to_user_profiles.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260418000000_add_theme_to_user_profiles.sql
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'rose';

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_theme_check
  CHECK (theme IN ('rose', 'amber', 'sky', 'violet'));
```

- [ ] **Step 2: Apply to dev**

```bash
cd /path/to/project
supabase db push
```

Expected output includes: `ALTER TABLE`

- [ ] **Step 3: Verify column exists**

```bash
supabase db diff
```

Expected: no pending changes (migration was applied cleanly).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260418000000_add_theme_to_user_profiles.sql
git commit -m "feat: add theme column to user_profiles"
```

---

## Task 3: CSS theme tokens

**Files:**
- Modify: `web/src/app/globals.css`

- [ ] **Step 1: Update `:root` to Rose defaults**

In `globals.css`, replace the primary/brand block inside `:root` (currently violet):

```css
:root {
  --md-primary:               #fda4af;
  --md-on-primary:            #4c0519;
  --md-primary-container:     #9f1239;
  --md-on-primary-container:  #ffe4e6;

  /* ── Brand (rose — new default) ── */
  --md-brand:      #f43f5e;
  --md-brand-dark: #e11d48;
  --md-on-brand:   #ffffff;
  /* leave all other tokens unchanged */
}
```

- [ ] **Step 2: Add `[data-theme]` override blocks**

Append after `:root`, before `@theme inline`:

```css
/* ─── Theme overrides ─────────────────────────────────────────────────────── */
[data-theme="amber"] {
  --md-primary:               #fcd34d;
  --md-on-primary:            #451a03;
  --md-primary-container:     #92400e;
  --md-on-primary-container:  #fef3c7;
  --md-brand:                 #f59e0b;
  --md-brand-dark:            #d97706;
  --md-on-brand:              #ffffff;
}

[data-theme="sky"] {
  --md-primary:               #7dd3fc;
  --md-on-primary:            #082f49;
  --md-primary-container:     #075985;
  --md-on-primary-container:  #e0f2fe;
  --md-brand:                 #0ea5e9;
  --md-brand-dark:            #0284c7;
  --md-on-brand:              #ffffff;
}

[data-theme="violet"] {
  --md-primary:               #a78bfa;
  --md-on-primary:            #1e0070;
  --md-primary-container:     #4f378b;
  --md-on-primary-container:  #eaddff;
  --md-brand:                 #7c3aed;
  --md-brand-dark:            #5b21b6;
  --md-on-brand:              #ffffff;
}
```

- [ ] **Step 3: Verify in browser**

Start dev server (`npm run dev` from `web/`). Open the app. In DevTools console run:

```js
document.documentElement.dataset.theme = 'amber'
```

Expected: sidebar brand color, play button, and active nav all shift to amber. Run for `sky` and `violet` too. Remove the attribute to restore Rose.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/globals.css
git commit -m "feat: add rose default and [data-theme] override blocks for amber/sky/violet"
```

---

## Task 4: Flash prevention

**Files:**
- Modify: `web/src/app/layout.tsx`

- [ ] **Step 1: Add inline script to `layout.tsx`**

Inside the `<body>` tag, as the very first child (before `{children}`):

```tsx
<body>
  <script
    dangerouslySetInnerHTML={{
      __html: `try{var t=localStorage.getItem('theme');if(t&&t!=='rose')document.documentElement.dataset.theme=t}catch(e){}`,
    }}
  />
  {children}
  {/* ... rest of body ... */}
</body>
```

- [ ] **Step 2: Verify no flash**

Set a theme in DevTools console: `localStorage.setItem('theme', 'amber')`. Hard-reload the page (Cmd+Shift+R). Expected: amber colors appear immediately with no violet flash.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/layout.tsx
git commit -m "feat: apply stored theme before hydration to prevent color flash"
```

---

## Task 5: Extend profile API for theme

**Files:**
- Modify: `web/src/app/api/profile/route.ts`

- [ ] **Step 1: Extend the `GET` handler**

In the `profileResult` select query, add `theme` to the selected columns:

```ts
supabase
  .from('user_profiles')
  .select('tier, default_volume, skip_back_seconds, skip_forward_seconds, theme')
  .eq('user_id', user.id)
  .single(),
```

Add `theme` to the return value:

```ts
const theme = profileResult.data?.theme ?? 'rose'
return NextResponse.json({
  email: user.email, tier, listeningSeconds, completedThisWeek, streakDays,
  defaultVolume, skipBackSeconds, skipForwardSeconds, theme,
})
```

- [ ] **Step 2: Extend the `PATCH` handler**

Widen the `update` type and add theme handling:

```ts
const update: Record<string, number | string | null> = {}

// ... existing volume/skip handling unchanged ...

const VALID_THEMES = ['rose', 'amber', 'sky', 'violet'] as const
if (body.theme !== undefined) {
  if (!VALID_THEMES.includes(body.theme)) {
    return NextResponse.json({ error: 'Invalid theme' }, { status: 400 })
  }
  update.theme = body.theme
}
```

- [ ] **Step 3: Test manually**

```bash
# In another terminal, start dev server
npm run dev

# In a third terminal (with a valid session cookie):
curl -X GET http://localhost:3000/api/profile \
  -H "Cookie: <your-session-cookie>" | jq '.theme'
# Expected: "rose"

curl -X PATCH http://localhost:3000/api/profile \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"theme":"amber"}' | jq .
# Expected: {"ok":true}

curl -X PATCH http://localhost:3000/api/profile \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"theme":"invalid"}' | jq .
# Expected: {"error":"Invalid theme"} with status 400
```

- [ ] **Step 4: Commit**

```bash
git add web/src/app/api/profile/route.ts
git commit -m "feat: add theme field to profile GET and PATCH"
```

---

## Task 6: useTheme hook

**Files:**
- Create: `web/src/lib/theme/useTheme.ts`
- Create: `web/src/lib/theme/useTheme.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// web/src/lib/theme/useTheme.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme, THEMES } from './useTheme'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

beforeEach(() => {
  localStorageMock.clear()
  document.documentElement.removeAttribute('data-theme')
  vi.restoreAllMocks()
})

describe('useTheme', () => {
  it('defaults to rose when nothing stored', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ theme: null }) }))
    const { result } = renderHook(() => useTheme(false))
    expect(result.current.theme).toBe('rose')
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('reads stored theme from localStorage on init', () => {
    localStorageMock.setItem('theme', 'amber')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ theme: 'amber' }) }))
    const { result } = renderHook(() => useTheme(false))
    expect(result.current.theme).toBe('amber')
  })

  it('applies data-theme attribute when theme is not rose', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ theme: 'sky' }) }))
    const { result } = renderHook(() => useTheme(false))
    await act(async () => {})
    expect(document.documentElement.dataset.theme).toBe('sky')
  })

  it('removes data-theme attribute when theme is rose', async () => {
    document.documentElement.dataset.theme = 'violet'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ theme: 'rose' }) }))
    renderHook(() => useTheme(false))
    await act(async () => {})
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('changeTheme updates state, DOM, and localStorage', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({}) }))
    const { result } = renderHook(() => useTheme(false))
    act(() => result.current.changeTheme('violet'))
    expect(result.current.theme).toBe('violet')
    expect(document.documentElement.dataset.theme).toBe('violet')
    expect(localStorageMock.getItem('theme')).toBe('violet')
  })

  it('skips API call for guest users', async () => {
    const fetchSpy = vi.stubGlobal('fetch', vi.fn())
    const { result } = renderHook(() => useTheme(true))
    await act(async () => {})
    expect(fetchSpy).not.toHaveBeenCalled()
    act(() => result.current.changeTheme('amber'))
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd web && npm test -- --run src/lib/theme/useTheme.test.ts
```

Expected: FAIL — `Cannot find module './useTheme'`

- [ ] **Step 3: Implement `useTheme.ts`**

```ts
// web/src/lib/theme/useTheme.ts
'use client'

import { useEffect, useState } from 'react'

export type Theme = 'rose' | 'amber' | 'sky' | 'violet'
export const THEMES: Theme[] = ['rose', 'amber', 'sky', 'violet']

const STORAGE_KEY = 'theme'

function applyTheme(theme: Theme) {
  if (theme === 'rose') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.dataset.theme = theme
  }
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (THEMES as string[]).includes(stored)) return stored as Theme
  } catch {}
  return 'rose'
}

export function useTheme(isGuest: boolean) {
  const [theme, setTheme] = useState<Theme>(readStoredTheme)

  useEffect(() => {
    if (isGuest) return
    fetch('/api/profile')
      .then((r) => r.json())
      .then((data: { theme?: Theme }) => {
        if (data.theme && (THEMES as string[]).includes(data.theme)) {
          setTheme(data.theme)
          applyTheme(data.theme)
          try { localStorage.setItem(STORAGE_KEY, data.theme) } catch {}
        }
      })
      .catch(() => {})
  }, [isGuest])

  function changeTheme(next: Theme) {
    setTheme(next)
    applyTheme(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch {}
    if (!isGuest) {
      fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: next }),
      }).catch(() => {})
    }
  }

  return { theme, changeTheme }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd web && npm test -- --run src/lib/theme/useTheme.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/theme/useTheme.ts web/src/lib/theme/useTheme.test.ts
git commit -m "feat: add useTheme hook with localStorage and DB sync"
```

---

## Task 7: Nav active state

**Files:**
- Modify: `web/src/components/ui/Sidebar.tsx`

- [ ] **Step 1: Update collapsed nav active class**

Find the collapsed nav item active class (around line 232):

```tsx
// Before
const cls = `flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
  isActive ? 'bg-brand text-on-surface' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
}`
```

Replace with:

```tsx
const cls = `flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
  isActive ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
}`
```

- [ ] **Step 2: Update expanded nav active class**

Find the expanded nav item active class (around line 265):

```tsx
// Before
const cls = `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full ${
  isActive ? 'bg-brand text-on-surface' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
}`
```

Replace with:

```tsx
const cls = `flex items-center gap-3 py-2 rounded-lg text-sm font-medium transition-colors w-full border-l-2 ${
  isActive
    ? 'border-brand bg-surface-container text-on-surface px-[10px]'
    : 'border-transparent text-on-surface-variant hover:bg-surface-container hover:text-on-surface px-3'
}`
```

Note: `px-[10px]` (12px - 2px border) keeps text aligned with inactive items at `px-3` (12px).

- [ ] **Step 3: Verify visually**

Open the app. Navigate between pages. Expected:
- Active item shows a left-colored border with the Rose brand color + dim background
- Inactive items look identical to before
- Switching to `[data-theme="amber"]` in DevTools makes the border amber

- [ ] **Step 4: Run unit tests to check nothing broke**

```bash
cd web && npm test -- --run
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ui/Sidebar.tsx
git commit -m "feat: replace solid nav active fill with left-border accent style"
```

---

## Task 8: Settings swatch picker

**Files:**
- Modify: `web/src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Import `useTheme` and define theme metadata**

Add at the top of `settings/page.tsx`, alongside existing imports:

```tsx
import { useTheme, THEMES, type Theme } from '@/lib/theme/useTheme'

const THEME_META: Record<Theme, { label: string; color: string }> = {
  rose:   { label: 'Rose',   color: '#f43f5e' },
  amber:  { label: 'Amber',  color: '#f59e0b' },
  sky:    { label: 'Sky',    color: '#0ea5e9' },
  violet: { label: 'Violet', color: '#7c3aed' },
}
```

- [ ] **Step 2: Call `useTheme` in the component**

Inside `SettingsPage`, alongside existing hooks:

```tsx
const { theme, changeTheme } = useTheme(isGuest)
```

- [ ] **Step 3: Add the Appearance section**

Find the first settings section in the JSX (the playback defaults section). Add the Appearance section immediately before it:

```tsx
{/* ─── Appearance ─────────────────────────────────────────── */}
<section className="mb-8">
  <h2 className="text-xs font-semibold text-on-surface-dim uppercase tracking-wider mb-3">
    Appearance
  </h2>
  <div className="bg-surface-container rounded-xl overflow-hidden divide-y divide-outline-variant">
    <div className="px-4 py-3 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-on-surface">Theme</p>
        <p className="text-xs text-on-surface-variant mt-0.5">Choose your accent color</p>
      </div>
      <div className="flex items-center gap-2.5 flex-shrink-0">
        {THEMES.map((t) => (
          <button
            key={t}
            onClick={() => changeTheme(t)}
            title={THEME_META[t].label}
            aria-label={`${THEME_META[t].label} theme${theme === t ? ' (active)' : ''}`}
            className="w-6 h-6 rounded-full transition-all"
            style={{
              background: THEME_META[t].color,
              outline: theme === t ? `2px solid white` : 'none',
              outlineOffset: '2px',
            }}
          />
        ))}
      </div>
    </div>
    {/* Mini preview strip */}
    <div className="px-4 py-2.5 flex items-center gap-3 bg-surface-container-low">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-on-brand text-xs flex-shrink-0"
        style={{ background: THEME_META[theme].color }}
      >
        ▶
      </div>
      <div className="flex-1">
        <div className="h-1.5 rounded-full bg-surface-container-high overflow-hidden">
          <div
            className="h-1.5 rounded-full w-2/5 transition-colors"
            style={{ background: THEME_META[theme].color }}
          />
        </div>
      </div>
      <span className="text-xs text-on-surface-variant">{THEME_META[theme].label}</span>
    </div>
  </div>
</section>
```

- [ ] **Step 4: Verify visually**

Open `/settings`. Expected:
- "Appearance" section appears at the top
- 4 color dots shown; the active one has a white ring
- Clicking a dot instantly changes the app accent color
- The mini preview strip below updates to show the new color
- Hard-reload preserves the selection (flash prevention + localStorage)
- Sign in on a second device — theme syncs from DB

- [ ] **Step 5: Run build to check no TypeScript errors**

```bash
cd web && npm run build 2>&1 | tail -20
```

Expected: clean build.

- [ ] **Step 6: Run all tests**

```bash
cd web && npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 7: Apply migration to prod**

```bash
supabase db push --project-ref dqqybduklxwxtcahqswh
```

- [ ] **Step 8: Commit**

```bash
git add web/src/app/(app)/settings/page.tsx
git commit -m "feat: add theme swatch picker to Settings with live preview"
```

---

## Done checklist

- [ ] Hardcoded colors replaced with semantic tokens
- [ ] `theme` column added to `user_profiles` in dev and prod
- [ ] `:root` is Rose; `[data-theme]` blocks exist for amber/sky/violet
- [ ] No theme flash on hard reload
- [ ] `GET /api/profile` returns `theme`; `PATCH /api/profile` validates and saves it
- [ ] `useTheme` hook tested and passing
- [ ] Nav active state uses left-border style (not solid fill)
- [ ] Settings swatch picker works, syncs cross-device, works for guests (localStorage only)
