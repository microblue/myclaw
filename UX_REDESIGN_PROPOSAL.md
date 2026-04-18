# Site-wide UX Redesign Proposal — MyClaw.One

> Context: Phase 1 wizard + instance list shipped. User wants "最现代专业的设计" applied across the whole authenticated app.
> This doc is for alignment before code. Pick what you want and I execute.

---

## Current state inventory

### Marketing (unauthenticated)
- `/` Landing — hero + demo preview + pricing + compare
- `/full-comparison` Compare — competitor table
- `/blog` + `/blog/:slug` Blog
- `/changelog` Changelog
- `/affiliate-program` Affiliate program (marketing)
- `/terms`, `/privacy`
- `/login`

### App (authenticated, behind ProtectedRoute)
- `/claws` Dashboard — now the instance list (big cards)
- `/claw/:id` Claw detail — status + connection + danger zone (lightweight monitoring)
- `/new/*` Deploy wizard — 4 steps
- `/ssh-keys` SSH key manager
- `/account` Profile settings
- `/billing` Invoices + payment methods
- `/affiliate` Personal referral dashboard
- `/admin` (admins only)
- `/license` Self-hosted license
- `/desktop` Electron landing

### Problems I see
1. **No consistent shell.** `/claws` has a custom header. `/account`, `/billing`, `/ssh-keys` each re-implement their own layout. No shared navigation — users reach them only via the user-dropdown in the header.
2. **Chat / Playground orphaned.** Removed from the dashboard tabs; the big Chat view (`DashboardChatView`) and Playground (agent graph) are unreachable.
3. **Discovery gap.** `/license`, `/affiliate`, `/billing` are buried in the user-menu. A newcomer never sees they exist.
4. **Detail page is thin.** `/claw/:id` currently shows status + IP. The existing Logs / Terminal / Diagnostics / Agents / Skills / Env / Channels / Versions / Files UIs all live inside the orphaned chat/playground views — users have no path to them now.
5. **Modals everywhere.** Each claw action spawns a dialog; the dashboard has dialog bundles for every feature. Modern SaaS typically uses full pages + sheets/drawers for heavier flows.
6. **Tone inconsistency.** New wizard/dashboard uses clean shadcn/neutral styles. Older pages still use heavier framer-motion grids and gradient backgrounds.

---

## Proposed layout (modern SaaS shell)

```
┌──────────────────────────────────────────────────────────────┐
│ [Logo]            [⌘K search]            [🔔]  [avatar▾]    │  ← thin top bar
├───────────┬──────────────────────────────────────────────────┤
│           │                                                  │
│  📦 Instances    ← primary nav; current page highlighted     │
│  🔑 SSH keys                                                 │
│  💳 Billing                                                  │
│  🤝 Referrals                                                │
│  ⚙️  Account                                                 │
│  🛡️  Admin (role-gated)                                     │
│           │                                                  │
│           │                                                  │
│           │       main content area                          │
│           │                                                  │
│           │                                                  │
│           │                                                  │
│ ─────────  footer: theme · language · version                │
└───────────┴──────────────────────────────────────────────────┘
```

### Shell primitives
- **`AppShell.tsx`** — single component wrapping every authenticated page. Sidebar + top bar + outlet.
- Sidebar collapses on mobile into a hamburger sheet.
- Top-bar search (`⌘K`): jumps to any instance by name, or any page by keyword.
- User menu in top-right (logout, account, theme toggle, language).

### Instance-detail page redesign

Today `/claw/:id` is one scrolling page. Propose tab-style sub-sections so all the orphaned functionality reappears:

```
[instance name]     [status dot]     [Open chat] [Pause] [⋯]
───────────────────────────────────────────────────────────
Overview · Chat · Logs · Terminal · Diagnostics · Skills · Agents · Settings
```

- **Overview** — current monitoring cards + connection info (what we have today).
- **Chat** — re-home the existing `DashboardChatView`'s `ChatView` component here. This closes requirement #8 ("打开Claw对话窗口").
- **Logs / Terminal / Diagnostics** — promote the existing *Content* components (they already exist as `ClawLogsContent`, `ClawTerminalContent`, `ClawDiagnosticsContent`) from modals to tab panels.
- **Skills / Agents / Settings** — absorb the existing Playground functionality, one thing per tab, no agent graph.

The agent *graph* view (ReactFlow) can survive as an optional "Map" tab or get retired. I recommend retiring it for Phase 1 polish — it's visually busy and most users have ≤5 claws so the graph has 5 nodes.

### Wizard polish

Current wizard works but is functional rather than beautiful. Low-cost upgrades:
- Right-rail live summary (picked type / provider / plan / price) that updates as the user moves through steps
- Replace the top progress bar with numbered step dots + labels, like Stripe / Linear
- Add cost estimate on the plan picker ("$20/mo · ~$0.67/day")
- Keyboard navigation (Enter to continue, ⌘← back)

### Tone / design tokens

- **Remove** the `playground-gradient` + `playground-grid` backgrounds — they feel 2023-era SaaS.
- **Commit to shadcn/ui + neutral surfaces.** White/zinc backgrounds, one accent colour for primary actions, sparse use of animation.
- **Typography:** inter 14 for body, inter 16/20 for headings, fixed-width (JetBrains Mono) only for IP addresses and terminal content.
- **Empty states:** friendly illustrations or large emoji + single CTA. No walls of text.
- **Status semantics:** colour-coded dot + label consistently (green running, amber pending, grey stopped, red error). Same language across list / detail / wizard.

---

## Proposed rollout (bite-sized)

Eight work packages, each commit-worthy on its own. You pick which to fund.

| # | Package | Deliverable | Est |
|---|---|---|---|
| 1 | **AppShell** | Sidebar + top bar skeleton, wrap every protected route. Every existing page still renders in the Outlet. | 4h |
| 2 | **⌘K search** | Global spotlight over instances + pages, keyboard-first. | 3h |
| 3 | **Instance detail tabs** | Tabbed sub-routes (`/claw/:id/chat`, `/logs`, `/terminal`, `/diagnostics`, `/skills`, `/agents`, `/settings`). Re-home orphan views. | 8h |
| 4 | **Retire legacy modals** | Move dialog content into detail-page tabs; drop `ClawCardDialogsBundle` + card-level dialogs. | 3h |
| 5 | **Wizard polish** | Right-rail summary, step dots, price-per-day, keyboard nav. | 3h |
| 6 | **Tone pass** | Strip playground-grid/gradient, align all pages to the new neutral tokens, normalise status dots. | 4h |
| 7 | **Marketing tone match** | Touch up `/` and `/blog` so the public site doesn't feel like a different product than the app. | 3h |
| 8 | **Admin polish** | `/admin` gets the same shell + table styling — currently the most unkempt corner. | 3h |

**Total:** ~30h. I'd do them in the order above (shell first, everything else fits inside it).

---

## Decisions I need from you

1. **Sidebar vs top-nav.** I'm proposing left sidebar. Objection? (Some SaaS use condensed top-nav + breadcrumbs; less shell-space, but fewer discoverable items.)
2. **Chat as tab on detail page.** OK? Or would you prefer chat stays a dedicated full-page route like today (`/claw/:id/chat`)?
3. **Retire the agent graph (Playground map view)?** Or keep as optional tab.
4. **Tone pass scope.** Full repaint (#6) or incremental per-page as we touch them?
5. **Marketing pages.** Do the same treatment on landing/blog (#7), or keep marketing separate?
6. **Order.** Start with AppShell (#1) + detail tabs (#3) as the highest-impact duo, or different priorities?

Tell me 1–6 and I start with the top of your list.
