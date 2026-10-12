# 05: Admin CRUD for Robôs and Ofertas

**What to build:** `/admin/robos` (list), `/admin/robos/new`, `/admin/robos/<slug>` (edit) and the POST handlers, on `modules/catalog/admin.ts` (the write side, same module as the read side from 02).

- List: every status with a badge, sort order, link to edit, link to the public page when published.
- Form: name, slug (create only), short and long description, strategy type, market (comma-separated → array), perfil, supported Corretoras, status, sort order, and one row per Oferta (Compra, Anual; no Mensal) with a price in reais (comma or dot, converted to integer cents; blank = not offered). Server validates everything; the client never decides.
- Rules: slug kebab-case and unique; **immutable once any `purchases.robot_id` references it**; price ≥ 0 and a sane upper bound; an `available` Robô must have at least one Oferta; `coming-soon` and `draft` may have none; **no hard delete**, only `archived` (reversible), because purchases and `robots/<slug>/` in R2 reference the slug. Changing a price never touches existing `purchases.amount_cents`.
- Publish flow: new Robôs start `draft`; admins see drafts on `/catalog` itself, marked as draft (never shown to anyone else), so "pré-visualizar" is the real card and modal.
- Writes via `assertSameOrigin` (04). Redirect-after-POST with a flash message; validation errors re-render the form with the values kept.
- Admin copy in `src/content/admin.ts`. Style with the existing tokens and form patterns of `/login` and `/conta`.

**Blocked by:** 02, 04.

**Status:** done

TDD seam: `modules/catalog/admin.ts` (create, update, status transitions, slug immutability after a purchase, price parsing, validation errors, archive). Pages checked in the browser.

- [x] Create, edit, publish, unpublish and archive a Robô end to end; the public `/catalog` reflects it
- [x] Slug cannot change once a purchase references it; the form shows it read-only then
- [x] A price edit changes checkout's price but not existing purchases' `amount_cents`
- [x] Invalid input returns field errors and keeps what was typed
- [x] Non-admin POST gets 404, cross-origin POST 403
- [x] Typecheck and the full test suite pass

## Comments

Decisions (implementation: `src/modules/catalog/admin.ts`, `src/pages/admin/robos/`,
`src/components/admin-robot-form.astro`, copy in `src/content/admin.ts`).

- **Pages post to themselves.** `new.astro` and `[slug].astro` handle GET and POST: on an error the
  same response re-renders the form with the typed values (422); on success it is a 303 to the edit
  page with `?ok=created|saved`. The list's status buttons POST to `[slug]/status.ts` and land on
  `/admin/robos?ok=status-<status>` or `?error=<code>`. Flash is a query key looked up in
  `content/admin.ts`, so nothing is stored and arbitrary text can never be reflected.
- **Check order on every POST: not admin is an empty 404, then a foreign `Origin` is 403.** Checked
  against the built app: anonymous and non-admin POSTs 404, cross-origin admin POSTs 403 (create, edit,
  status).
- **The module returns codes, not copy.** `FieldErrorCode`s are worded in `content/admin.ts`.
- **Slug.** Editable while no `purchases.robot_id` (any status) names it, read-only with an
  explanation afterwards. The rename is also guarded in SQL (`NOT EXISTS` on purchases) inside one
  D1 batch, and `robot_offers` follow it. `new` is reserved (it is the create page). Renaming does not
  move `robots/<slug>/` in R2; the form says so.
- **Offers are stored as entered, whatever the status** (a draft keeps its prices; the public reads
  still only show them for `available`), so a draft can be previewed with its prices and publishing is
  one click. `available` needs at least one Oferta both in the form and in `setRobotStatus`.
- **Price parsing.** A lone comma is the decimal mark; a lone dot is decimal unless exactly three
  digits follow ("1.997" is 1997 reais); at most two decimals; 0 is allowed; max R$ 100.000,00.
- **Draft preview.** `listPublishedWithOffers(env, { includeDrafts })`; `/catalog` passes it when
  `requireAdmin` succeeds (and then sends `Cache-Control: private, no-store`). The card gets a
  "Rascunho" badge via `CatalogCard.draft`. A draft's buy link still fails at checkout
  (`unknown_robot`), by design: the preview is for looking, not buying.
- **Status moves** (list buttons): draft to Publicar or Arquivar; available to Despublicar (back to
  draft) or Arquivar; coming-soon to Publicar, Despublicar or Arquivar; archived to Restaurar (draft).
  The edit form's status select reaches every status too. No migration was needed.
