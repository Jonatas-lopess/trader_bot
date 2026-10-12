# 05: Admin CRUD for Robôs and Ofertas

**What to build:** `/admin/robos` (list), `/admin/robos/new`, `/admin/robos/<slug>` (edit) and the POST handlers, on `modules/catalog/admin.ts` (the write side, same module as the read side from 02).

- List: every status with a badge, sort order, link to edit, link to the public page when published.
- Form: name, slug (create only), short and long description, strategy type, market (comma-separated → array), perfil, supported Corretoras, status, sort order, and one row per Oferta (Compra, Anual; no Mensal) with a price in reais (comma or dot, converted to integer cents; blank = not offered). Server validates everything; the client never decides.
- Rules: slug kebab-case and unique; **immutable once any `purchases.robot_id` references it**; price ≥ 0 and a sane upper bound; an `available` Robô must have at least one Oferta; `coming-soon` and `draft` may have none; **no hard delete**, only `archived` (reversible), because purchases and `robots/<slug>/` in R2 reference the slug. Changing a price never touches existing `purchases.amount_cents`.
- Publish flow: new Robôs start `draft`; admins see drafts on `/catalog` itself, marked as draft (never shown to anyone else), so "pré-visualizar" is the real card and modal.
- Writes via `assertSameOrigin` (04). Redirect-after-POST with a flash message; validation errors re-render the form with the values kept.
- Admin copy in `src/content/admin.ts`. Style with the existing tokens and form patterns of `/login` and `/conta`.

**Blocked by:** 02, 04.

**Status:** ready-for-agent

TDD seam: `modules/catalog/admin.ts` (create, update, status transitions, slug immutability after a purchase, price parsing, validation errors, archive). Pages checked in the browser.

- [ ] Create, edit, publish, unpublish and archive a Robô end to end; the public `/catalog` reflects it
- [ ] Slug cannot change once a purchase references it; the form shows it read-only then
- [ ] A price edit changes checkout's price but not existing purchases' `amount_cents`
- [ ] Invalid input returns field errors and keeps what was typed
- [ ] Non-admin POST gets 404, cross-origin POST 403
- [ ] Typecheck and the full test suite pass
