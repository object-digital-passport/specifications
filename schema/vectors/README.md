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


`operations-redesign-8.json` is the current operation-digest fixture. ABI `0.7-redesign-8` inserted
`previewHash` after `imageHash` in the mint tuple, so the mint digest changed: `mint` has a zero copy,
`mintPreview` a nonzero one. Its statement/proof entries are byte-identical to `operations-redesign-5.json`,
which is retained unchanged as provenance; its mint entry encodes the redesign-7 tuple and no longer matches
current contracts. Filenames are provenance, not ABI selectors.

`physical-preview.*` (redesign-8) is the physical example plus one public preview copy anchor
`{"type":"photo","data":{"role":"preview"},"hash":…}`; its `.expected.json` also records `previewHash`.
The four original sets are unchanged and prepare with `previewHash` zero.
`chain/tools/operations.mjs` and the tools/EVM tests check the full digests. Never update vectors merely to
make documentation agree; discrepancies require a separate reviewed protocol/tool decision.
