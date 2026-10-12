/**
 * Cart copy — the "Adicionar ao carrinho" feedback (storefront-v2 08) and, from ticket 09,
 * the `/carrinho` page. Consumed by `src/shared/cart-client.ts` and `src/pages/carrinho.astro`.
 * The button's own label ("Adicionar ao carrinho") lives with the catalog copy in
 * `src/content/catalog-page.ts`; the header icon's labels in `src/content/header.ts`.
 */

/** The add button's label for a moment after a click. */
export const addedLabel = 'Adicionado';
/** Read out by the polite live region in the header when a line is added. */
export const addedAnnouncement = 'Adicionado ao carrinho.';
/** How long the button wears `addedLabel` before going back to its own label. */
export const addedFeedbackMs = 1500;
