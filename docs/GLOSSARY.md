# Glossary — ODP 0.7, ABI `0.7-redesign-8`

Informative. [SPEC.md](../SPEC.md) is normative; where this page and SPEC disagree, SPEC wins.
Terms from v0.6 guides and from the sealed ABI6 audit package are marked where they no longer apply.
Nothing here asserts that a generation is deployed or that any check is implemented in a client.

## Identity and generations

**Passport ID** — `ODP-YYYY-MM-NNNNNNNNN`, assigned by the registry at mint from the Gregorian UTC mint
month. Unique inside one registry and month, not globally. Full identity is `(chainId, registryAddress,
passportId)`. It is not a secret and confers no rights on whoever holds it.

**Profile ID** — `T-NNN-NNN-NNN-NNN`, where `T` is `C`, `B`, `P` or `M`. A wallet registers exactly once and
permanently. `getCreator` returns exactly four components: `(creatorId, wallet, typePrefix, timestamp)`.

**Profile type** — self-selected, never accreditation. `C` personal, `B` business/edition issuer,
`P`/`M` institutional. Only `B` may mint a non-unique edition model or use unit anchors. `P`/`M` may publish
institutional proofs, concerns and institutional assessments. Nothing verifies that the wallet behind a
`P` profile is the organization it names.

**Generation** — one deployed set of ten contracts, identified by an immutable generation identifier bound
to chain ID, registry address, satellite addresses, deployed runtime hashes, ABI identity, deployment blocks
and source/build identity. A generation identifier is never reassigned.

**ABI generation** — the exact interface identifier of the registry code, currently `0.7-redesign-8`.
The earlier `0.7-redesign-7` (approved release bundle), `0.7-redesign-6` (the sealed audit package) and the
original 0.7 line are **incompatible**.

**Packed version byte / `CONTRACT_VERSION`** — `major*16 + minor`, currently `7`. It does **not** identify an
ABI, a build or a generation. Never select a contract or a decoder from it.

**`approvedGenerations`** — the list in `chain/generations.json`. It is deliberately empty: no deployment
produced by this work is approved.

## Core registry

**Core** — `ObjectDigitalPassport`. Holds profiles, passports and mint-operation records. It has no
administrator, owner, proxy, freeze, pause, upgrade path or satellite callback, and charges no protocol fee.

**Immutable card** — the on-chain strings and classifications captured at mint: title, author name, short
description, domain, object type, contentClass, lifecycleStatus, aiStatus, verificationMethod, editionModel.
They are readable without the bundle and can never be edited. A typo is corrected by a new passport plus an
external explanation, not by an edit.

**`dataHash` / `anchorsHash` / `imageHash` / `fileHash`** — SHA-256 commitments supplied by the issuer.
The contract stores them; it cannot open a hash, read JSON or recover any original bytes.

**`previewHash`** — SHA-256 of a lighter public copy of the primary photo, a JPEG of at most 1,048,576 bytes
without location metadata, made only when the user chooses to publish the photo. Zero means no copy. A nonzero
value needs a nonzero `imageHash` (`EC(142)`) and must differ from it (`EC(143)`). In `passport.json` it is the
single `photo` anchor with `data.role: "preview"`; the `.odpass` holds both the original and the copy. Its IPFS
address is derived from the hash (SPEC §22.19).

**`anchorTypesMask`** — a uint32 OR of anchor-type bits. It records which anchor kinds are *present*,
not that any anchor is true. Bits 14–30 are reserved; bit 31 marks a custom or unknown anchor type.

**`editionCommitment`** — a typed keccak256 commitment to the edition parameters, fixed before mint and
stored in the core. Non-zero exactly when the `unit_key_set` bit (4096) is set.

**`operationId`** — a non-zero bytes32 the client generates and durably saves **before** sending a mint,
journal or proof transaction. Retries reuse the same ID and the same parameters. Scope is
`(caller, contract)` on that chain. It protects against duplicate submission of one job; it is not global
uniqueness of a document or an object.

**`AlreadyCommitted` / `StatementAlreadyCommitted` / `ProofAlreadyCommitted`** — exact replay of a committed
operation. The custom error returns the original record's identity; it never republishes or reactivates it.

**`MintOperationConflict` / `StatementOperationConflict` / `ProofOperationConflict`** — the same operation ID
with different parameters. Stop; do not pick a new ID and do not silently change the data.

**Revocation window** — `revokePassport(id, reasonHash)` is available only to the original issuer wallet, at
or before `mintTimestamp + 259200` seconds for a `C` profile and `mintTimestamp + 86400` seconds for `B`,
`P` and `M`, with a non-zero reason hash, and only while print finalization is absent. It is one-shot and
irreversible. It does not erase payload, card or history, and it is not a counterfeiting verdict.

**Print finalization** — `finalizePassportForPrint(id)`, original issuer only, irreversible, idempotent on
retry. It permanently closes the revocation window for that passport and emits `PassportFinalizedForPrint`.
A later `revokePassport` reverts with `PassportPrintFinalized()`. The core does not observe a printer and
cannot prevent external printing; withholding the print export is the application's responsibility, and that
gate is **not implemented in this repository**.

**`getPassportReleaseState(id)`** — returns `(revocationDeadline, printFinalizedAt)`.

**Mint quota bucket** — an *approximate* month derived from `block.timestamp` (`year = 1970 +
floor(ts/31556952)`, `month = min(12, floor((ts % 31556952)/2629746)+1)`). It deliberately differs from the
Gregorian calendar used for passport IDs, and it is per wallet, not Sybil resistance. `C` 1000, `B` 100000,
`P`/`M` uncapped.

## Satellites

Nine contracts, each pinned to one core address in its constructor. They read the core and can never write
to it. Replacing a satellite creates a **new history namespace**; it does not inherit or supersede the old one.

**`ODPEditionUnits`** — `openEdition` by the original `B` issuer for a non-revoked passport with edition
model limited(2)/open(3), the `unit_key_set` bit, a non-zero root and nonce, and a commitment equal to the
core's. Write-once per satellite/passport; `(issuer, editionNonce)` can open only once in that satellite.
`activate` records the first valid unit signature and Merkle proof. There are no unit passports, ownership
or transfer.

**`ODPStatementJournal`** — issuer corrections, author declarations and institutional assessments, with
their own lifecycle (Active / Retracted / Superseded). A replacement atomically supersedes exactly one
active statement by the same wallet, kind and passport. It states claims; it never establishes truth.

**`ODPPassportProofRegistry`** — institutional statements from registered `P`/`M` profiles about an existing
non-revoked passport, IDs `PRF-YYYY-MM-NNNNNNNN`. The submitting wallet can call `withdrawProof` once.
An existing record does **not** imply a current endorsement: read `proofWithdrawnAt` as well.

**`ODPPassportConcerns`** — one active concern episode per (passport, raiser), raised by `P`/`M`, withdrawn
only by its raiser. The active count is a count of unwithdrawn statements, never a verdict or a vote.

**`ODPAuthorAttestation`** — a one-shot EIP-712 slot per passport, submitted by the original issuer, binding
passportId, dataHash, creatorId and an `authorSigner` key. The issuer may occupy the slot with a key of its
own; a signature alone does not establish the named human's identity. The signer can withdraw consent once;
withdrawal does not free the slot. Readers MUST check `authorWithdrawalAt`.

**`ODPHosting`** — mutable data/image URLs (≤512 bytes) writable by the original issuer or its own unexpired
publishing agent. Publishing delegation grants no mint rights. Hashes never change; URLs are untrusted
transport input. Each field may list several `ipfs://`, `ar://` or `https://` addresses of the same bytes,
separated by spaces (SPEC CA-19.6).

**`ODPProfileDirectory`** — a self-declared lower-case ASCII DNS name for `B`/`P`/`M`. Syntax only: it proves
no domain control and no institutional status.

**`ODPRegistryRelations`** — display-only parent/child affiliation for `B`/`P`/`M`, proposed by the child and
confirmed by the parent. No rights, quota or trust are inherited.

**`ODPWalletDocumentAnchor`** — a wallet-level SHA-256 anchor, once per `(wallet, hash)`. Not passport-bound
and not an institutional proof.

## Documents and bundle

**`passport.json`** — the hashed document. Its `passportId` is ALWAYS `null` in the canonical bytes; the
assigned ID lives in the receipt. Card fields must match the minted strings byte for byte.

**Canonical form** — fatal UTF-8 decoding, BOM and duplicate keys rejected, NFC normalization of all strings
and keys, keys sorted by UTF-16 code units, array order preserved, compact UTF-8 output with no trailing
newline. Not RFC 8785 verbatim, because NFC is additionally required.

**`registeredAt`** — despite the name, the **document preparation** time. The registration moment comes only
from the chain.

**`.odpass`** — a ZIP with exactly `passport.json`, `generation.json`, `receipt.json`, `manifest.json` at the
root and payloads at `files/<sha256hex>`. `chain/tools/bundle.mjs` validates already-extracted entries; it
does not parse ZIP and does not authenticate chain evidence. A safe ZIP importer/exporter is still open work.

**Receipt** — a locator, not an authority. It carries generationId, chainId, registry, assigned passportId,
the successful operationId, transaction hash, block number and block hash. A copied receipt is not proof of
chain state.

## Editions

**Edition nonce** — a random non-zero 32-byte value chosen **before** mint. Key derivation v2 uses
`ASCII("ODP-EDITION-v2") || chainId32 || registry20 || editionNonce32` as context, deliberately breaking the
circular passportId-based v1 derivation.

**Unit leaf** — `SHA256(uint32be(index) || address20)`. Internal node `SHA256(left || right)`, last node
duplicated at each odd level.

**Address list** — lower-case full addresses in index order, one per line including a final LF; its SHA-256
is `addressListHash`. It MUST NOT contain concealed codes or private keys.

**Printed code** — 100 bits as 20 Crockford Base32 characters plus a 5-character checksum. The checksum is
typo detection, not authentication. Whoever reads the code can sign an activation.

**Activation** — the first valid signed submission for a unit index. Any courier may submit it. It is not
proof of ownership or of purchase time: a leaked or cloned key permits earlier use.

**Reprint / new production run** — always a new edition with a new passport, a fresh nonce and a fresh key
set. An `open` model does not authorize appending units to an existing passport.

## Terms that no longer apply

| Term | Status |
|---|---|
| `revokeCreator`, `CreatorRevoked`, profile `revokedAt`, `EC(131)`, "profile stop" | Removed entirely. No stopped-profile state exists; the selector is absent. Passport `revokedAt` is a different field. |
| `REVOCATION_WINDOW` (single 72-hour constant) | Replaced by `PERSONAL_REVOCATION_WINDOW` (72 h, `C`) and `ISSUER_REVOCATION_WINDOW` (24 h, `B`/`P`/`M`). |
| Mint agent, `on-behalf` issuance, `tx.origin` path, extension router | Absent. Issuance delegation is deferred, not implemented. |
| Unit passports, owner, transfer, activation-triggered revocation lock | Absent. Only expiry or explicit print finalization closes revocation. |
| `governance`, freeze, admin pause, wallet rotation, key recovery | Absent. A lost or stolen key has no recovery path. |
| Amoy testnet deployment | Not used, including for testing (owner decision 2026-09-24). Polygon mainnet (137) is the selected target; selecting a target is not authorization, and nothing is deployed. |
| v0.6 mutable status / owner model, old glossary in `GUIDE.md` | Historical. See [GUIDE.md](GUIDE.md) for the v0.6 line only. |

## Status words used in this repository

**Local candidate** — compiled and tested locally; not audited, not deployed, not approved.

**Sealed audit package** — `review/audit-handoff-abi6/`, a snapshot of ABI `0.7-redesign-6`. It does not
certify the current ABI. See [the delta](../ODP_07_ABI6_DOCUMENTATION_DELTA.md).

**Unsupported** — a reader that cannot perform a declared check MUST report it as `unsupported`, distinct
from failed, from missing evidence and from a counterfeiting verdict.

**Gas sponsor** — an organization that sends POL from its own wallet to users' addresses. It sees the address
and its public actions, gets no wallet access and cannot submit transactions for the user in 0.7 (SPEC §22.20).

**Deferred** — decided to be out of scope for this release (NFC hardware/transport, issuance delegation,
user-signed actions submitted by a relayer).
Deferred is not implemented.

Russian version: [`ru/GLOSSARY.md`](ru/GLOSSARY.md).
