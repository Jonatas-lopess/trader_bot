/**
 * Video section content — badge, heading, supporting paragraph, and the
 * video player state.
 *
 * See `docs/agents/content-files.md` for the typed-content-file and
 * launch-blocking conventions this follows, consumed by
 * `src/components/video-section.astro`. Ticket
 * `.scratch/marketing-pages/issues/05-landing-video-and-steps.md`.
 *
 * No video exists and no YouTube URL has been provided — `videoUrl` is
 * empty on purpose. The component renders a deliberate poster/play empty
 * state while it is empty, and swaps to a direct YouTube iframe
 * (PLANNING.md §3 — no facade library) once a real URL lands here. One
 * item here is launch-blocking:
 *
 *   grep -rn "launchBlocking(" src/content/video-section.ts
 */

import { launchBlocking, type LaunchBlocking } from '../shared/launch-blocking';

export const badge = 'Demonstração';

export const heading = 'Veja o robô em ação';

// "2 minutos" is a claim about a video asset that does not exist yet — no
// recording, no edit, no confirmed runtime. Flagged with the other missing
// assets: .scratch/marketing-pages/spec.md → "Carried by the tickets, not
// resolved by them" ("Missing assets: hero visual (6:36), demo video and
// its '2 minutos' claim").
export const supportingParagraph: LaunchBlocking<string> = launchBlocking(
	'Em menos de 2 minutos, veja o robô sendo configurado e executando ordens em uma ' +
		'conta real — do login na plataforma à primeira operação.',
	'"2 minutos" is a claim about a video asset that does not exist yet — no recording, ' +
		'no edit, no confirmed runtime to point to. ' +
		'.scratch/marketing-pages/issues/05-landing-video-and-steps.md; ' +
		'.scratch/marketing-pages/spec.md → "Carried by the tickets, not resolved by them" ' +
		'("demo video and its \'2 minutos\' claim").',
);

// Empty on purpose: no video exists, no YouTube URL has been provided.
// src/components/video-section.astro renders the poster/play empty state
// when this is falsy, and a direct YouTube iframe (PLANNING.md §3 — no
// facade library) once a real URL is supplied here.
export const videoUrl = '';
