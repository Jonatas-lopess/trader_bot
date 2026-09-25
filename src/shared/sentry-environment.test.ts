import { describe, expect, it } from 'vitest';
import { resolveSentryEnvironment } from './sentry-environment';

describe('resolveSentryEnvironment', () => {
	it("falls back to 'unconfigured' rather than Sentry's own 'production' default", () => {
		expect(resolveSentryEnvironment({ SENTRY_ENVIRONMENT: undefined })).toBe('unconfigured');
	});

	it("falls back the same way on a blank value ('SENTRY_ENVIRONMENT=' with nothing after it)", () => {
		expect(resolveSentryEnvironment({ SENTRY_ENVIRONMENT: '' })).toBe('unconfigured');
	});

	it('passes through an explicitly configured value unchanged', () => {
		expect(resolveSentryEnvironment({ SENTRY_ENVIRONMENT: 'workers-dev-test' })).toBe('workers-dev-test');
	});
});
