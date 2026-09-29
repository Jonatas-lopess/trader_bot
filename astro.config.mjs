// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// Source-map upload (.scratch/sentry-integration/issues/06-sourcemap-upload.md).
// Only wired when SENTRY_AUTH_TOKEN is present (the deploy job's build step),
// so CI's build/test job and local builds ship fine without it — same "unset
// ships fine" convention as SENTRY_DSN. `SENTRY_RELEASE` (the commit SHA in CI)
// must equal the value the deploy passes as `--var SENTRY_RELEASE:...`, which
// @sentry/cloudflare reads off the env, so events match the uploaded maps.
const sentryUpload = Boolean(process.env.SENTRY_AUTH_TOKEN);

// https://astro.build/config
export default defineConfig({
	output: 'static',
	adapter: cloudflare({
		imageService: 'passthrough',
	}),
	// PLANNING.md §3: KV is not used for auth state (eventually consistent,
	// 1k writes/day free-tier cap). Sessions live in D1, not Cloudflare KV.
	// Disable the adapter's default auto-provisioned KV session binding.
	session: false,
	// Tailwind v4 is CSS-first: no tailwind.config.js. Tokens live in
	// src/styles/global.css under an @theme block (PLANNING.md §3).
	vite: {
		plugins: [
			tailwindcss(),
			...(sentryUpload
				? [
						sentryVitePlugin({
							authToken: process.env.SENTRY_AUTH_TOKEN,
							org: process.env.SENTRY_ORG,
							project: process.env.SENTRY_PROJECT,
							release: { name: process.env.SENTRY_RELEASE },
							sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
							telemetry: false,
						}),
					]
				: []),
		],
		build: { sourcemap: sentryUpload },
	},
});
