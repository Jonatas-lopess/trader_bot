// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

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
		plugins: [tailwindcss()],
	},
});
