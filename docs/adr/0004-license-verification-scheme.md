# License verification: per-license HMAC-SHA256, not RSA/Ed25519, in pure MQL5

Status: Accepted. The premise below — that `CryptEncode`/`CryptDecode` cover only DES,
AES128/256, MD5, SHA1, SHA256, Base64 and Deflate, no RSA/ECDSA/Ed25519 — was checked against
MQL5's own documentation and confirmed before acceptance.

We need the Robô (an MT5 Expert Advisor, MQL5, sold through the MetaTrader Market — which
rules out DLLs) to check in with a server we control at init and hourly, and refuse new
entries when that check fails, per the four-piece design in `.scratch/license-server/spec.md`.
The open question was which signature scheme the robot verifies client-side: full asymmetric
(Ed25519 or RSA) or a symmetric MAC.

**We reject pure asymmetric verification in MQL5.** MQL5's built-in `CryptEncode`/`CryptDecode`
support `CRYPT_HASH_SHA256`, `CRYPT_HASH_SHA1`, `CRYPT_HASH_MD5`, `CRYPT_AES128/256`,
`CRYPT_DES`/`3DES`, `CRYPT_RC4`, `CRYPT_BASE64` — no RSA, no ECDSA, no Ed25519. There is no
native primitive to build on. Verifying an Ed25519 or RSA signature would mean implementing
big-integer modular exponentiation (RSA) or Edwards-curve point arithmetic (Ed25519) from
scratch, in MQL5, as code that ships to the Market. That is exactly the kind of security-
critical, easy-to-get-subtly-wrong code this codebase's own conventions (PLANNING.md §5 —
tests at the three places a bug costs money or grants unauthorized access) argue against
writing bespoke: a broken modexp or point-add doesn't fail loud, it fails by accepting a
forged signature, and there is no test harness for MT5 EAs in this repo (or realistically
available) to catch that the way `vitest` catches a D1 query bug. The maintenance surface —
one from-scratch crypto implementation, in a language with no crypto ecosystem, that a future
MetaTrader compiler update could silently break — is disproportionate to what it buys here.

**What it would buy, if it worked:** with true asymmetric signing, the public key embedded in
every robot binary is safe to expose — extracting it doesn't let an attacker forge server
responses. That property matters when many parties hold the verifying key and none of them
should be able to impersonate the signer (TLS certs, package signing). It matters much less
here, where the class of attacker is "cracked my own copy of the binary I already paid for
(or downloaded/leaked)," not "operates a rogue CA."

**Decision: per-license, per-account HMAC-SHA256**, computed from `CryptEncode`'s native
SHA256 with a keyed construction (`HMAC(secret, msg) = SHA256((secret XOR opad) ||
SHA256((secret XOR ipad) || msg))`, built in ~30 lines of MQL5 on top of the one primitive
that already exists) — no bespoke asymmetric math, small enough surface to actually read and
test. The `secret` is **not** one global value: the server mints a distinct HMAC secret per
license (same row that carries `login`, `validade`, and the operative payload — see spec.md
§Payload), delivered once into the binary/config at issuance. Extracting the secret from one
customer's cracked copy forges valid-looking server responses only for that one license — it
does not forge a response for anyone else's, and revoking that one license (the server simply
stops issuing valid signed responses for that `login`) still fails the robot closed within its
tolerance window, same as any other license expiring.

This is deliberately the "meio-termo" from the original proposal, not a compromise made
grudgingly: this codebase's stated model already puts the real leverage in the **payload**
(PLANNING.md §8's own framing — the server is what "segura de verdade"), not in the signature
being mathematically unforgeable by a third party. A patched binary that skips the check still
lacks the payload's operative data unless it has replayed the exact bytes of a still-valid,
still-fresh response for its own `login` — the same constraint an asymmetric scheme would
give, at a fraction of the implementation risk.

## Consequences

- **Per-license secret is a new column** on the licensing schema (alongside the payload it
  authenticates) — `.scratch/license-server/issues/02` scopes this. No schema currently
  carries a key (migrations/0005 says so explicitly — "No `key` column, deliberately", true
  for 0.1's manual-issuance model, now superseded by this effort for 1.0.0).
- **PLANNING.md §8's "There is no license server and no per-customer key" and §11's "License
  model... Deferred" become stale once this is Accepted** and implementation starts; §8/§11
  need a follow-up edit recording the per-license-HMAC decision and pointing at this ADR,
  per CLAUDE.md's rule that PLANNING.md is binding until changed there. Not done as part of
  this ADR — left as an explicit step in `.scratch/license-server/spec.md` so the binding
  contract and the ADR change together, deliberately, not as a side effect.
- **Fail-closed with tolerance is the server's problem, not the crypto scheme's.** Whether
  the scheme is HMAC or Ed25519, an unreachable server or a failed check must not touch open
  positions (spec.md's rule), only gate new entries, and must tolerate a bounded outage
  window (e.g. 24h) before it starts refusing. That logic lives in the robot's check-in loop,
  independent of this decision.
- **If threat model changes** — e.g. secrets need to be safe even from someone who can read
  the binary's memory at runtime and not just its disk image, or multiple independent
  verifiers need to trust the same signer without sharing a secret — revisit toward
  asymmetric. Nothing here forecloses that; it says the cost isn't justified by today's
  threat model (a single customer's own copy of software they bought).
