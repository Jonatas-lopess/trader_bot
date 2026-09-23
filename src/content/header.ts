/**
 * Header content — brand lockup, primary nav, CTA.
 *
 * Convention: content lives in typed content files under `src/content/`,
 * not as inline strings in markup (PLANNING.md §2). This file and
 * `src/content/footer.ts` are the first real example of that convention —
 * full writeup at `docs/agents/content-files.md`, consumed by
 * `src/components/site-header.astro`.
 */

export type NavLink = {
	label: string;
	href: string;
};

export type DeadNavLink = {
	label: string;
	dead: true;
};

export const brand = {
	name: 'Robô Trader',
} as const;

// Anchors point at routes/in-page sections that don't exist yet — built by
// tickets 04 (hero, /#como-funciona), 07 (/planos) and 08 (/#faq). Linking
// ahead of the section is deliberate, not a bug (ticket 03 scope note).
export const primaryNav: NavLink[] = [
	{ label: 'Como funciona', href: '/#como-funciona' },
	{ label: 'Planos', href: '/planos' },
	{ label: 'FAQ', href: '/#faq' },
];

// A real destination since .scratch/customer-area/issues/02-magic-link-login.md
// — no longer one of src/content/dead-links.ts's inert entries.
export const loginLink: NavLink = {
	label: 'Login',
	href: '/login',
};

export const ctaLink: NavLink = {
	label: 'Comprar agora',
	href: '/planos',
};
