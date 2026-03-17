# Screen Plans — Milestone Index

Individual screen specs for Phase 3b (mobile), grouped into development milestones in build order.

Source: [`docs/plans/phase-3b-mobile-features.md`](../phase-3b-mobile-features.md)

---

| # | Milestone | Screens | Description |
|---|-----------|---------|-------------|
| 1 | [01-app-shell/](01-app-shell/) | — | App.kt nav host setup — no dedicated screen plan (app opens directly to Discover) |
| 2 | [02-auth/](02-auth/) | 3 | Login, sign up, login prompt sheet — must work before any protected screen |
| 3 | [03-onboarding/](03-onboarding/) | 4 | Welcome, genre selection, suggested podcasts, notification permission — post-signup flow |
| 4 | [04-discovery/](04-discovery/) | 2 | Discover, podcast detail — highest-value guest-accessible path |
| 5 | [05-collection/](05-collection/) | 2 | Library, queue — depends on subscriptions + episodes from M4 |
| 6 | [06-player/](06-player/) | 1 | Full player + mini player — most complex screen, most expect/actual surface area |
| 7 | [07-account/](07-account/) | 4 | Profile, settings, notification settings, stats — account management |
| 8 | [08-monetization/](08-monetization/) | 1 | Upgrade sheet — gates features across M4–M7, needs them all to exist first |

**Total: 17 screens**
