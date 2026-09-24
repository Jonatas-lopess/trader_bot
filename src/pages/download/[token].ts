import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { resolveDownload } from '../../modules/licensing/download';

export const prerender = false;

// .scratch/robot-delivery/issues/02-mint-dispatch-redeem.md: "no content-file
// copy needed (this is a support-mediated dead end, not a user-facing flow
// to polish)" — a plain string, not a content file (docs/agents/content-files.md
// governs customer-facing copy; this route deliberately isn't that).
const INVALID_TOKEN_MESSAGE = 'Link inválido ou expirado.';
const UNAVAILABLE_MESSAGE = 'Arquivo indisponível no momento.';

export const GET: APIRoute = async ({ params }) => {
	const token = params.token;
	const resolution = token !== undefined ? await resolveDownload(env, token) : ({ ok: false, status: 404 } as const);

	if (!resolution.ok) {
		const message = resolution.status === 404 ? INVALID_TOKEN_MESSAGE : UNAVAILABLE_MESSAGE;
		return new Response(message, { status: resolution.status });
	}

	return new Response(resolution.body, {
		headers: {
			'Content-Type': resolution.contentType,
			'Content-Disposition': `attachment; filename="${resolution.filename}"`,
			'Content-Length': String(resolution.size),
		},
	});
};
