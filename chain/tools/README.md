# ODP 0.7 offline tools

Run `npm ci` from `chain/`. These modules do not load keys or send transactions.

- `node tools/passport.mjs prepare ../schema/examples/0.7/physical.json 0x1111111111111111111111111111111111111111 B` validates schema and semantic
  constraints, normalizes NFC, and prints exact canonical bytes plus the redesigned mint tuple.
- `canonical.mjs`: strict duplicate-detecting JSON parser, canonical serializer and SHA-256.
- `edition.mjs`: v2 nonce-based context, HKDF, printed-code validation, scalar derivation, Merkle tree/proofs, sealed variant commitments.
- `node tools/edition_vectors.mjs`: public test vectors; never production randomness.
- `verifyPassport(document,header,media,classification)`: integrity/card comparison only; callers must
  authenticate the generation, fetch/check file bytes and establish real-world identity separately.
- `verifyEditionAnchor(anchor,context,record)`: checks pinned namespace, root/count/nonce and label signer.

`mint.py` deliberately fails: its historical ABI is retired. Use the prepared tuple with the current ABI
and a separately authorized wallet flow. Obtain the assigned passport ID from receipt `passportIdText`,
create a separate receipt.json, and leave passport.json unchanged. No real wallet integration or ZIP parser
is claimed by these offline modules. See SPEC.md for the client obligations and deployment generation pins.

## Mint operation identity (ABI 0.7-redesign-8)

The second core mint argument is a nonzero bytes32 operationId, not a principal string. Persist an operation
ID, exact prepared inputs and chain/registry/issuer before sending. Retry that same operation; query
getMintOperation after a timeout. AlreadyCommitted identifies a previous result; MintOperationConflict means
the saved payload differs. Never silently choose a new ID on retry. preparePassport only prepares document
inputs; durable wallet submission/replacement/reorg handling remains client integration work.

## Edition preparation

`preparePassport(document, {issuerType})` optionally takes the registered profile type (`C`/`B`/`P`/`M`). When supplied, a non-unique edition model or unit anchors from a non-B profile are rejected with `Only B profiles may issue editions`, matching core `EC(121)`. Verifiers omit it. `prepareIssuance` always requires it.

Edition documents require the issuer wallet address before preparation: `preparePassport(document, {issuer})`
or `node tools/passport.mjs prepare passport.json 0xFULL_ISSUER_ADDRESS`. `edition-commitment.mjs` encodes
the exact core-to-satellite commitment. `verifyPassport` recomputes it using the supplied chain header's issuer;
callers still authenticate that header and the chain/registry/satellite context separately.

For an edition, the CLI requires the complete public address-list file after the issuer:

```sh
# From chain/; local files only, example issuer must be replaced with the intended issuer.
node tools/passport.mjs prepare ../schema/examples/0.7/edition.json 0x1111111111111111111111111111111111111111 /path/to/address-list.txt
```

The list must match that document; this placeholder command is not a production-ready fixture.
Use `prepareIssuance(document, {issuer, addressListBytes})` for issuance. `preparePassport` remains a
shape/hash helper for readers; it cannot validate list bytes it has not received. The list must contain
exactly unitCount lower-case addresses, one per LF-terminated line, and match both addressListHash and
recomputed Merkle root. Recovery of an unopened edition requires its original issuer key; there is no profile stop. Do not print production codes before the
namespace, derivation vectors, backup and activation round-trip are independently verified.

## Statements, proofs and verification capabilities

`operations.mjs` exports `mintDigest`, `statementDigest`, `proofDigest`, matching ABI-encoded on-chain
operation digests. Journal/proof methods now require a final nonzero bytes32 operationId (ABI redesign-7).
Persist exact namespace, caller, operation ID and all inputs before wallet submission; retain the same
operation through a timeout, replacement and reconciliation. Query the appropriate operation getter;
verify its digest and original receipt rather than submitting a fresh ID. This repository does not yet
implement durable application jobs or reorg-aware wallet recovery.

`statement.mjs` checks canonical bytes, schema and every envelope field against an independently obtained
record. It reports identity, truth and lifecycle separately. `bundle.mjs` validates public address-list trees
and exposes per-anchor and verification-method capability statuses; it does not verify private-code
possession, ZIP envelopes, current chain status, identity or physical authenticity.


`publishStatement(string,uint8,bytes32,uint256,bytes32)` and
`submitProof(string,bytes32,string,uint32,uint8,bytes32)` are the signatures of this generation. Operation scope is caller
within the selected satellite. Lookup occurs before lifecycle/calendar validation; exact replay returns the
original ID through a custom error after withdrawal/supersession/revocation or month rollover and never
reactivates evidence. Journal has no calendar input. The ID is not part of the digest.
Full digest types/domains and errors: [SPEC §13 and §21](../../SPEC.md).
`schema/vectors/operations-redesign-8.json` is the current operation-digest fixture: ABI redesign-8 added
`previewHash` to the mint tuple, so the mint digest changed (`mint` with a zero copy, `mintPreview` with one).
Statement/proof entries are byte-identical to the retained historical `operations-redesign-5.json`.

Run the already installed local dependencies with `node tools/check-vectors.mjs` and
`node --test tools/test/*.test.mjs` from `chain/`. Installing dependencies needs network access and is not
part of the currently authorized offline documentation task.

## Public preview copy (ABI 0.7-redesign-8)

The mint tuple is `core, dataHash, imageHash, previewHash, fileHash, anchorsHash, anchorTypesMask, editionCommitment`.
`previewHash` is SHA-256 of the exact bytes of the public lightweight copy of the primary photo (JPEG, at most
1048576 bytes, no GPS or other location metadata), stored as an ordinary `.odpass` payload `files/<sha256hex>`.
In passport.json it is the anchor `{"type":"photo","data":{"role":"preview"},"hash":"sha256:…"}`: at most one,
only next to a `photo` with `role: "primary"`, and different from the primary hash. `preparePassport` returns
`previewHash` (zero without the anchor) and rejects violations; core mirrors them with `EC(142)` (copy without
`imageHash`) and `EC(143)` (copy equal to `imageHash`). `verifyPassport` compares `previewHash` with
`getPassportMedia`, so a copy present on only one side fails. The copy uses no extra anchor bit (PHOTO covers it).
`validateBundleEntries` requires the copy payload and rejects it above 1048576 bytes; it does not decode JPEG
or inspect metadata. `schema/examples/0.7/physical-preview.json` and `schema/vectors/physical-preview.*` are the reference case.

## ABI7 issuance roles and print finalization

`prepareIssuance(document,{issuer,issuerType,addressListBytes})` requires a C/B/P/M issuer type read from the pinned registry. Non-unique models and unit anchor bits require B. The helper validates supplied context; only the contract authenticates the caller. `preparePassport` remains a generic integrity/serialization helper, not a complete issuance preflight. The CLI accepts `prepare FILE ISSUER ISSUER_TYPE [ADDRESS_LIST]`.

After mint/open and durable archive/secret preservation, an authorized issuer calls `finalizePassportForPrint(id)`. Check confirmed `getPassportReleaseState(id).printFinalizedAt`, nonrevoked status and exact edition state before final print export. Offline integrity alone cannot authorize printing or establish fresh revocation status. No application or printer integration is implemented by these tools.
