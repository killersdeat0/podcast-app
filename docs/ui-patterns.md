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

## Toasts

Use **sonner** via the single `<AppToasts />` component in the app shell layout (`web/src/app/(app)/layout.tsx`). Do not create standalone toast components — add new toast triggers inside `AppToasts`.

**Exception:** utility/library functions (e.g. `addEpisodeToPlaylist`) may call `toast.error()` directly via dynamic import to surface errors at the call site, without needing a component context.
