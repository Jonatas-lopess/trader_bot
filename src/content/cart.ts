/**
 * Cart copy — the "Adicionar ao carrinho" feedback (storefront-v2 08) and the `/carrinho` page
 * (09). Consumed by `src/shared/cart-client.ts`, `src/shared/cart-page.ts` and
 * `src/pages/carrinho.astro`. The add button's own label lives with the catalog copy in
 * `src/content/catalog-page.ts`; the header icon's labels in `src/content/header.ts`.
 *
 * launch-blocking call sites in this file:
 *
 *   grep -rn "launchBlocking(" src/content/cart.ts
 */

import { launchBlocking } from '../shared/launch-blocking';

/** The add button's label for a moment after a click. */
export const addedLabel = 'Adicionado';
/** Read out by the polite live region in the header when a line is added. */
export const addedAnnouncement = 'Adicionado ao carrinho.';
/** How long the button wears `addedLabel` before going back to its own label. */
export const addedFeedbackMs = 1500;

// ---------------------------------------------------------------------
// `/carrinho` page (storefront-v2 09)
// ---------------------------------------------------------------------

export const pageTitle = 'Carrinho';
export const pageDescription = 'Revise os Robôs escolhidos antes de finalizar a compra.';
export const pageHeading = 'Seu carrinho';

export const loadingMessage = 'Carregando o carrinho…';
export const emptyMessage = 'Seu carrinho está vazio.';
export const emptyCtaLabel = 'Ver o catálogo';
export const errorMessage = 'Não foi possível carregar os preços agora. Tente novamente.';
export const retryLabel = 'Tentar de novo';

export const continueLabel = 'Continuar comprando';
export const continueHref = '/catalog';
export const totalLabel = 'Total';
export const removeLabel = 'Remover';
export const quantityLabel = 'Quantidade';
/** Next to a quantity above 1: the price of one unit. */
export const unitPriceSuffix = 'cada';
export const unavailableLabel = 'Indisponível no momento';
export const unavailableNote = 'Remova os itens indisponíveis para continuar. Eles não entram no total.';

export const decreaseLabel = (name: string): string => `Diminuir a quantidade de ${name}`;
export const increaseLabel = (name: string): string => `Aumentar a quantidade de ${name}`;
export const removeLabelFor = (name: string): string => `${removeLabel} ${name} do carrinho`;

// Goes to the checkout of every line (storefront-v2 11); disabled while a line is unavailable.
export const checkoutLabel = 'Finalizar compra';

// Placeholder, a lawyer and the owner confirm it. Anual is a single charge steered toward Pix
// (PLANNING.md §6); Compra and Anual both take card, Boleto and Pix.
export const paymentMethodsNote = launchBlocking(
	'Aceitamos cartão, Boleto e Pix. Para a licença Anual, recomendamos o Pix.',
	'PLANNING.md §6 (methods per Oferta, Anual steered to Pix) and ADR-0006; wording is a placeholder the owner confirms before launch.'
);

/** Shown inside `<noscript>`: the page reads the browser's cart, so it needs JavaScript. */
export const noscriptMessage = 'Ative o JavaScript do navegador para ver e editar o seu carrinho.';
export const linesLabel = 'Itens do carrinho';
