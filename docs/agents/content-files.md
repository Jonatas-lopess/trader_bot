# Content files and the launch-blocking marker

Two conventions established in ticket `.scratch/marketing-pages/issues/03-site-shell.md`
that every later marketing-pages ticket (04, 05, 06, 07, 08) depends on. This is the one
canonical place they're documented — referenced by a short comment at each convention's
first real usage.

## Content lives in typed content files

PLANNING.md §2: no CMS, content hardcoded but typed. Copy, labels, prices and feature
rows are never inline string literals inside an `.astro` template. Each lives in a typed
`const` (object or array) exported from `src/content/<section>.ts`, and the `.astro`
component imports and renders it.

Pattern:

```ts
// src/content/<section>.ts
export type Thing = { label: string; href: string };
export const things: Thing[] = [
	/* ... */
];
```

```astro
---
import { things } from '../content/<section>';
---

{things.map((t) => <a href={t.href}>{t.label}</a>)}
```

**First real example:** `src/content/header.ts` and `src/content/footer.ts`, consumed by
`src/components/site-header.astro` and `src/components/site-footer.astro`.

One content file per section (`header.ts`, `footer.ts`, `hero.ts`, `plans.ts`, ...). Facts
shared across pages — e.g. plan prices used by both the plans page (ticket 07) and the
landing teaser (ticket 08) — live in the file owned by the ticket that introduces them and
are imported by the other, never duplicated into a second file.

## The launch-blocking marker

Some copy in the Figma frames ships to the layout but is not approved to go live:
fabricated metrics, unverified compatibility claims, a headline that reads as a
performance guarantee. See `.scratch/marketing-pages/spec.md` → "Carried by the tickets,
not resolved by them" for the running inventory.

`src/shared/launch-blocking.ts` exports a typed wrapper:

```ts
export type LaunchBlocking<T> = { value: T; blocked: true; reason: string };
export const launchBlocking = <T>(value: T, reason: string): LaunchBlocking<T> => ({
	value,
	blocked: true,
	reason,
});
```

Rules:

- A content file wraps any not-yet-approved string/array in `launchBlocking(...)` instead
  of exporting it bare — e.g.
  `launchBlocking('Resultados consistentes', 'CDC art. 37 — performance claim; Appmax onboarding pending (PLANNING.md §2, §12)')`.
- Components render `.value` and otherwise leave the wrapper alone. `launchBlocking` flags
  the source of the copy, it does not gate whether it renders — the frame ships as drawn,
  flagged for the pre-launch pass.
- Every blocked item is discoverable with one command, so keep the call name and object
  shape exact — don't rename it, don't hand-construct an equivalent object literal:

  ```
  grep -rn "launchBlocking(" src/content/
  ```

- The `reason` string is not decoration. Write enough that a reviewer doesn't have to
  re-derive why a line is blocked — cite the PLANNING.md section or the spec.md line it
  comes from.

No runtime registry exists for either convention, and none is needed: `launchBlocking`
call sites are found by the grep above, and content-file render sites are found by
grepping `from '../content/` (or `from '../../content/`) across `src/`.

## Dead links (adjacent, not the same convention)

Links with no destination in this scope (Termos de uso, Política de privacidade, Contato,
Login) are a separate concern from launch-blocking copy — they're not unapproved copy,
they're routes that don't exist yet. They're inventoried once, in
`src/content/dead-links.ts`, and rendered as inert `<span>` elements (never
`<a href="#">`) by `src/components/site-header.astro` and `site-footer.astro`. Grep:
`grep -rn "deadLinks\." src/`.
