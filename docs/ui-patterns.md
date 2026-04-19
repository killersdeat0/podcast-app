# UI Patterns

## Dev-only debug panels

API routes can return an additional `debug` object when `process.env.NODE_ENV === 'development'`. The client checks `process.env.NODE_ENV === 'development'` and renders a collapsible `<details>` panel with `JSON.stringify(debug)`. Never include `debug` in production responses.

## Delayed skeleton pattern

When a UI section fetches data on mount and only shows if data is present, delay the skeleton by 300ms before showing it — this avoids a flash of skeleton UI on fast connections.

- Set a `setTimeout` for 300ms that sets a `showSkeleton` flag
- Clear both the timer and flag in the fetch's `finally` block
- Use a `cancelled` ref to handle unmount races
- The section itself stays hidden (`showSkeleton || items.length > 0`) so nothing appears at all if data loads within 300ms

See the "Continue Listening" section in `web/src/app/(app)/discover/page.tsx` for the reference implementation.

## Modals

All modal dialogs use `@radix-ui/react-dialog` (`import * as Dialog from '@radix-ui/react-dialog'`). Do not use custom backdrop + `useEscapeKey` patterns — Radix Dialog provides focus trap, escape handling, and accessible close for free.

```tsx
<Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
  <Dialog.Portal>
    <Dialog.Overlay ... />
    <Dialog.Content ... />
  </Dialog.Portal>
</Dialog.Root>
```

**Blocking (non-dismissable) modals:** `AuthPromptModal` accepts `dismissable={false}` — `onOpenChange` becomes a no-op and the "Maybe later" cancel button is hidden. Use for hard gates (e.g. guests on `/playlist/[id]`) where continuing without auth is not allowed.

## Equalizer bars (`EqBars`)

`web/src/components/ui/EqBars.tsx` renders animated bouncing bars for the currently-playing episode indicator. Use it anywhere you need this visual — sidebar, podcast episode list, etc.

```tsx
<EqBars
  playing={isNowPlaying && playing}
  bars={[
    { duration: '0.9s', delay: '0s' },
    { duration: '0.7s', delay: '0.2s' },
    { duration: '1.1s', delay: '0.1s' },
  ]}
/>
```

- **`playing`** — should be `isNowPlaying && playing`, not just the global `playing` state. This ensures only the active episode's bars animate; others stay at minimum height.
- **Bar timing** — each bar has its own bounce duration and stagger delay, giving the natural "random" equalizer look.
- **Pause animation** — on pause, each bar reads its current animated `scaleY` via `getComputedStyle` and transitions down to `scaleY(0.2)` over 250ms. This avoids the "snap-to-top then drop" artifact that happens with CSS `@keyframes` alone.
- **CSS vars** — timing is passed as `--eq-dur` / `--eq-delay` CSS custom properties, not as `animationDuration` / `animationDelay` inline styles. This is intentional: the `animation-name` manipulation used to restart the animation on resume would wipe individual animation sub-properties, but CSS custom properties are immune to that reset.
- **Resume** — sets `animation-name: none`, forces a reflow, then clears it so the browser treats the CSS animation as freshly started.

**Do not** use `el.style.animation = 'none'` (the shorthand) in the imperative animation code — it wipes `animation-duration` and `animation-delay` sub-properties. Always use `el.style.animationName = 'none'` instead.

## Podcast artwork (`PodcastArtwork`)

`web/src/components/ui/PodcastArtwork.tsx` — use this instead of raw `<img>` for all podcast/episode artwork everywhere in the app.

```tsx
<PodcastArtwork
  src={episode.artwork_url}
  title={episode.podcast_title}
  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
/>
```

**Props:** `src?: string | null`, `title?: string | null`, `className?: string`. Pass your existing Tailwind size/shape classes via `className` — the component fills the box.

**Behavior:**
- `src` present → renders a wrapper `<div>` with the background color, shows a letter tile placeholder while the image loads, then fades the image in (`opacity-0` → `opacity-100`, `transition-opacity duration-200`)
- `src` absent or image load error → renders the letter tile immediately (no `<img>` attempt)
- Letter = first character of `title`, uppercased; `?` if title is empty/null
- Background color = deterministic from `title` hash, chosen from 8 muted tones so each podcast gets a consistent color everywhere it appears

**State management:** uses `loadedSrc` / `erroredSrc` string state (not booleans) — when `src` changes, the loaded/error states automatically reset without needing a `useEffect`.

**Do not** add `onError` handlers or artwork ternaries at call sites — the component handles everything internally.

## Rendering HTML from RSS feeds

Podcast/episode descriptions from RSS feeds may contain HTML (from CDATA sections). Always sanitize before rendering:

```tsx
<div
  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(description) }}
  className="[&_a]:text-primary [&_a]:underline [&_p]:mb-2"
/>
```

- Use `DOMPurify.sanitize()` — never render raw RSS HTML without sanitization
- Apply Tailwind child selectors (`[&_a]:`, `[&_p]:`, etc.) on the container to style the rendered HTML using semantic tokens

## Sidebar nav active state

The sidebar uses a **left-border + dim-background** style for the active nav item — not a solid fill. This keeps the brand color visible while staying theme-compatible.

**Expanded sidebar** (`border-l-2` on every item, brand-colored when active):

```tsx
const cls = `flex items-center gap-3 py-2 rounded-lg text-sm font-medium transition-colors w-full border-l-2 ${
  isActive
    ? 'border-brand bg-surface-container text-on-surface px-[10px]'
    : 'border-transparent text-on-surface-variant hover:bg-surface-container hover:text-on-surface px-3'
}`
```

`px-[10px]` on active items compensates for the 2px border so text stays aligned with inactive items at `px-3` (12px).

**Collapsed sidebar** (icon-only, uses a dim filled square):

```tsx
const cls = `flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
  isActive ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
}`
```

Do not use `bg-brand` as a nav active fill — it clashes with the theme-switching architecture where `bg-brand` shifts per-theme and a solid fill would be visually heavy across all themes.

## Toasts

Use **sonner** via the single `<AppToasts />` component in the app shell layout (`web/src/app/(app)/layout.tsx`). Do not create standalone toast components — add new toast triggers inside `AppToasts`.

**Exception:** utility/library functions (e.g. `addEpisodeToPlaylist`) may call `toast.error()` directly via dynamic import to surface errors at the call site, without needing a component context.
