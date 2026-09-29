-- Tightens download_tokens.license_id to NOT NULL now that minting is per-Licença
-- (.scratch/catalog-pivot/issues/08-per-license-delivery.md, ADR-0006). 0008 left it
-- nullable only until this ticket. Existing rows cannot be backfilled (they carry no
-- Licença) and no production data exists, so the table is dropped and recreated.
DROP TABLE download_tokens;

CREATE TABLE download_tokens (
	token TEXT PRIMARY KEY,
	customer_id TEXT NOT NULL,
	license_id TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	used_at TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_download_tokens_customer_id ON download_tokens (customer_id);
CREATE INDEX idx_download_tokens_license_id ON download_tokens (license_id);
