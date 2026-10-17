/**
 * Routes of the checkout flow, built in one place. Pure, so the browser script of `/checkout`
 * (`checkout-form.ts`) checks the same path the server builds.
 */

/** Where a checkout that cannot be rebuilt starts over. */
export const CATALOG_PATH = '/catalog';

/** The intermediate confirmation page (PLANNING.md §7), `src/pages/checkout/confirmacao.astro`. */
export const CONFIRMATION_PATH = '/checkout/confirmacao';

/** The confirmation page of one checkout; `reference` is its checkout id. */
export const confirmationPath = (reference: string): string => `${CONFIRMATION_PATH}?ref=${reference}`;
