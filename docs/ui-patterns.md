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

## Toasts

Use **sonner** via the single `<AppToasts />` component in the app shell layout (`web/src/app/(app)/layout.tsx`). Do not create standalone toast components — add new toast triggers inside `AppToasts`.

**Exception:** utility/library functions (e.g. `addEpisodeToPlaylist`) may call `toast.error()` directly via dynamic import to surface errors at the call site, without needing a component context.
