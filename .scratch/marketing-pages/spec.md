# marketing-pages

Landing page and plans page, built from the Figma frames. Scope is PLANNING.md §1 "in scope for 0.1",
minus checkout, auth, customer area and legal pages.

Figma: https://www.figma.com/design/r2pQyOPGfUNV4Tsh3br2wv/Trader
— `landing-page` (`6:5`), `catalogo-planos` (`6:217`). The file defines zero variables.

Tickets in `issues/`, numbered in dependency order.

## Section map

| Frame | Node | Ticket |
| --- | --- | --- |
| header | `6:6` / `6:218` | 03 |
| hero-section | `6:18` | 04 |
| video-section | `6:38` | 05 |
| how-it-works | `6:48` | 05 |
| social-proof | `6:83` | 06 |
| quick-comparison | `6:121` | 08 |
| faq-section | `6:160` | 08 |
| footer | `6:191` / `6:344` | 03 |
| catalog-title-section | `6:230` | 07 |
| toggle-container | `6:235` | 07 |
| plan-comparison-row | `6:243` | 07 |
| regulatory-note | `6:340` | 07 |

## Carried by the tickets, not resolved by them

Each is flagged in the ticket that surfaces it, behind a launch-blocking marker in the content files.
None is the implementer's call.

- Fabricated proof: `+2.500`, `R$ 12M+`, three named testimonials. Ticket 06.
- Plan rows selling crypto markets, multi-year backtesting, a 24/7 account manager, an included VPS and custom API integration — none in any milestone (§10). Ticket 07.
- Annual pricing absent: the toggle advertises 20% off, cards show the monthly price in both states, no Pix steer (§6). Ticket 07.
- FAQ claims: "Totalmente seguro", global broker compatibility, full pt-BR tutorials. Ticket 08.
- Missing assets: hero visual (`6:36`), demo video and its "2 minutos" claim. Tickets 04, 05.
- **Chave** means the Robô's run credential in CONTEXT.md, but the frames use it for a Corretora API key. Needs a CONTEXT.md decision. Ticket 05.
- Dead links in the footer: Termos de uso, Política de privacidade, Contato, Login. Ticket 03 renders them inert.
