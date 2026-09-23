// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

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
});
