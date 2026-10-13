import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { setRobotStatus } from '../../../../modules/catalog/admin';
import { gateAdmin } from '../../../../modules/identity/admin';

export const prerender = false;

// Publish, unpublish, mark coming-soon, archive or restore a Robô from the list
// (storefront-v2 05). POST only, so a cross-site GET can never change a status. Not an admin is
// an empty 404 (the area's existence stays hidden); a foreign Origin is 403.
export const POST: APIRoute = async ({ request, params, url }) => {
	const gate = await gateAdmin(request, env, { checkOrigin: true });
	if (!gate.ok) return gate.response;

	const form = await request.formData();
	const status = form.get('status');
	const result = await setRobotStatus(env, params.slug ?? '', typeof status === 'string' ? status : '');

	const target = new URL('/admin/robos', url.origin);
	if (result.ok) target.searchParams.set('ok', `status-${status}`);
	else target.searchParams.set('error', result.error);
	return Response.redirect(target, 303);
};
