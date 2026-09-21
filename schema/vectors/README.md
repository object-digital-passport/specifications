# Redesigned 0.7 conformance vectors

Each physical/digital/mixed/edition set contains `.passport.json`, exact `.canonical.json` bytes (no final
newline), `.anchors.canonical.json` and `.expected.json` SHA-256 values. Hashed passportId is always null.
Preparation timestamps are internally consistent; they do not predict a future block timestamp.

`canonical-v07.json` covers NFC, numeric-like keys, UTF-16 ordering, negative zero and exponent formatting.
`edition-units.json` is key derivation v2: preselected editionNonce + registry context, count5, odd tree,
printed codes, public TEST private keys, proof and signature payloads, plus five sealed variant fixtures. All secrets are deliberately public.
Never use these codes, addresses or seeds for a real edition. The old v1 vectors are archived under
`review/astra/baseline-schema/vectors` and are incompatible.

From `chain/`: `npm test` checks canonical and bundle roundtrips. `node tools/edition_vectors.mjs` reproduces
the edition fixture byte-for-byte. `tools/canonical.mjs` is the serializer; do not substitute sorted-object
JSON.stringify (integer-like keys reorder). SPEC.md §10 and §20 define all byte formats.


`operations-redesign-5.json` is the retained operation-digest fixture and is still current: neither the
removal of profile stop nor the `0.7-redesign-7` changes altered mint/journal/proof encoding or the
operation domains. Its filename is provenance, not an ABI selector.
`chain/tools/operations.mjs` and the tools/EVM tests check the full digests. Never update vectors merely to
make documentation agree; discrepancies require a separate reviewed protocol/tool decision.
