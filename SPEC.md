# Object Digital Passport — specification 0.7

**Redesigned generation `0.7-redesign-7`. Local contract candidate for independent audit; no deployed, approved production generation.**

This document is normative for the sources in `chain/contracts/`. MUST, MUST NOT and SHOULD express
requirements. The previous 0.7 ABI is incompatible. Its specification is preserved for audit in
[BASELINE_SPEC_5d1db8f.md](review/astra/BASELINE_SPEC_5d1db8f.md), not as an alternative implementation target.
The older audit/design documents describe inputs to this implementation; [ODP_ASTRA_REVIEW.md](ODP_ASTRA_REVIEW.md)
records which claims survived independent reproduction. Deployment and client integration status live in
[ODP_07_IMPLEMENTATION.md](ODP_07_IMPLEMENTATION.md).

## 1. Overview

ODP records an issuer's immutable description and hash commitments. It establishes that a wallet registered
those commitments in a particular block. It does not establish physical possession, ownership, authenticity,
legal title, or the real-world identity of a self-registered issuer. A displayed author name is a declaration.

The core has no administrator, owner, proxy, privileged deployer, freeze, mutable implementation, or satellite
callback. Its internal library is compiled into its bytecode. Satellites read a constructor-pinned core;
the core does not know their addresses. There is no protocol fee. Transactions incur network fees.
Reads and offline checks require no transaction, but RPC and data providers can charge or become unavailable.
Long-term verification requires the original chain state and document bytes to remain accessible.

## 2. Passport ID

`ODP-YYYY-MM-NNNNNNNNN`: Gregorian UTC mint year/month and a nine-digit number unique within that month
in this registry. It is not a secret or globally unique across chains/registries. Full identity is
`(chainId, registryAddress, passportId)`. The contract selects at most 25 candidates from a hash of block
inputs, sender, nonce, bucket and gas. These are identifiers, not security randomness. No useful fairness
or unpredictability claim is made. Exhaustion reverts atomically.

The client supplies the actual current Gregorian UTC year/month. A transaction mined in a different month
reverts. Reprepare the document and its hashes after a month boundary; do not silently patch hashed bytes.
The supported calendar is 1970 through 2570. A conforming client obtains the assigned ID from the non-indexed
`passportIdText` in `PassportMinted` and checks the emitting registry and successful receipt.

## 3. Profile ID

A wallet registers exactly once as `C`, `B`, `P`, or `M`. The ID is `T-NNN-NNN-NNN-NNN` and remains fixed.
Types are self-selected: they are not accreditation. `getCreator` returns one tuple with exactly four components:
`(string creatorId, address wallet, bytes1 typePrefix, uint256 timestamp)`. Profile registration is permanent.
There is no `revokeCreator`, `CreatorRevoked`, profile `revokedAt`, profile-stop rejection, hidden admin pause, wallet rotation or recovery authority. Passport `revokedAt` remains a separate field. Losing the key can permanently prevent new issuer actions.

C has 1000 mints and B has 100000 mints per **approximate quota bucket**; P/M have no mint cap.
These are per issuing wallet, not Sybil resistance. Bucket calculation is exactly
`year = 1970 + floor(timestamp/31556952)` and
`month = min(12, floor((timestamp % 31556952)/2629746)+1)`. This deliberately retained rule differs from
Gregorian months (measured discrepancies in the audit). Clients MUST NOT label its reset as a Gregorian
calendar promise. Passport IDs still use the real UTC calendar.

### Direct issuance and repeat protection

`mintPhysical/mintDigital/mintMixed(m, operationId)` always register the caller's own registered profile.
There is no principal selector, mint-agent role, grant or `tx.origin` path. Issuance delegation is deferred.
Contract wallets may issue as themselves if registered; forwarding a call does not impersonate another wallet.
Publishing-location delegation remains a separate satellite permission and confers no mint rights.

`operationId` is a nonzero bytes32 identifier created and durably saved by the client BEFORE submission.
Retries MUST reuse the same ID and exact mint parameters. Do not generate a fresh ID on a transport timeout.
The core stores `(digest, passportId)` per `(msg.sender, operationId)` on successful mint only. Digest is
`keccak256(abi.encode("ODP-MINT-OPERATION-0.7", block.chainid, address(this), msg.sender, objectType, m))`,
where objectType is the entrypoint's physical/digital/mixed string and m is the entire PassportMintInputs tuple.

An exact replay reverts with `AlreadyCommitted(operationId, passportId)`; changed parameters or entrypoint
revert with `MintOperationConflict(operationId)`. Neither creates another record or consumes quota. Failed
initial mints reserve nothing. `getMintOperation(issuer, operationId)` returns the committed result, or a zero
digest and empty passportId if absent. Recovery also works after passport revocation or a month
boundary; these do not authorize a new mint. A new operation ID denotes a new operation: this is not global
uniqueness of documents or physical objects. Reads/receipts still require the client's chain finality policy.

## 4. Institutional statements and affiliation

`ODPPassportProofRegistry` accepts statements from registered P/M profiles about an existing nonrevoked passport.
A document hash is optional; a URL requires a nonzero hash. URLs are at most 512 UTF-8 bytes. The statement
payload is immutable. Its submitting wallet can call `withdrawProof(proofId, reasonHash)` once, including after passport revocation; a nonzero SHA-256 reason is required. Readers MUST read `proofWithdrawnAt` and `proofWithdrawalReason` alongside `getProof`; an existing record does not imply a current endorsement. IDs are `PRF-YYYY-MM-NNNNNNNN`; the current UTC month is checked. The contract does not assert
that an examination occurred. Clients MUST establish the institution's identity independently.

`ODPRegistryRelations` stores display-only affiliation for B/P/M. A child proposes; the parent confirms.
Both profiles must be registered B/P/M when creating a relation. There is at most one active parent per child,
100 active children per parent and 100 pending parents per child. Confirmation rechecks cycles, walking
at most eight ancestors and rejecting when no root is reached in that bound. This bound is a per-operation
walk bound, not a global maximum tree height. Parent detach and child leave/cancel are cleanup operations
available to their original participants. No rights, quota or trust are inherited. Children lists use swap-and-pop on detach;
read multiple pages at the same block. Private Solidity storage is publicly observable.

## 5. Verification label

An optional label carries a readable passport ID and a QR locator. It is a convenience, not identity proof.
An issuer profile printed on packaging is not an independent trust source. Copying a valid label is possible.
A client SHOULD show issuer identity, integrity, revocation and individual statements separately.
It MUST NOT transform a concern count or first activation into a verdict about the physical object.

## 6. Physical seal

NFC transport and NFC hardware verification are deferred and are not part of the current 0.7 release work.
The following describes optional anchor semantics, not a shipped NFC feature.

Physical binding is an identification problem outside the core. Optional `nfc`, `numbered_seal`,
`fingerprint` or `dna` anchors commit identification data. A seal can add evidence, not ownership rights.
Cryptographic NFC checks depend on the specific tag protocol and provisioning. A public symmetric read key
is not a public-key signature and does not make all observed NFC responses unforgeable. Master/write keys
MUST NOT appear in the public document. Passive UID matching alone is not cryptographic authentication.
Readers MUST distinguish a live verified response, a reported seal state, and an unavailable check.
Detailed legacy hardware guides are informative and require separate implementation/hardware validation.

## 7. Networks and generations

There is no approved deployment produced by this change. Never substitute a 0.6 address or infer an address
from the version byte. The selected target is Polygon mainnet (chainId 137), with fixed registry/satellite addresses after a separately authorized deployment. A preliminary Amoy deployment is not required. The current instruction prohibits wallet connection, public-network access, deployment and publication; a target network is not authorization.
Its deployment manifest MUST bind the generation identifier to chain ID, registry address, deployed runtime
hashes, ABI identities, deployment blocks and source/build identity. A generation identifier MUST NOT later
be reassigned to different addresses. Clients may embed the authenticated fixed manifest; an online mutable
generation directory is not required for this model. The current sources identify as 0.7-redesign-7;
this does not claim that the release is already deployed. Document version 0.7 alone does not identify an ABI.

Every issued .odpass MUST carry its generation and full contract addresses as specified in §15. An embedded
manifest is an identification artifact, not its own trust root: clients MUST authenticate the deployment
identity independently before reporting chain authenticity. A replacement satellite is a different namespace;
it cannot silently replace the one committed by an existing edition. Historical records and activation state
remain associated with their original addresses, regardless of later client software or hosting changes.

## 8. Immutable on-chain record

Three mint entrypoints take the same `PassportMintInputs` plus a nonzero bytes32 operationId:

- `core`: year, month, title, authorName, shortDescription, domain, contentClass, lifecycleStatus,
  aiStatus, verificationMethod, editionModel.
- `dataHash`, `imageHash`, `fileHash`, `anchorsHash`: bytes32; SHA-256 commitments supplied by the issuer.
- `anchorTypesMask`: uint32.
- `editionCommitment`: bytes32; mandatory nonzero for unit_key_set, zero otherwise. It binds the typed
  edition parameters defined in §20; unit_key_set requires editionModel limited(2) or open(3).

Title/authorName are 1–128 UTF-8 bytes, description 1–256, domain 0–128. The contract bounds bytes;
it cannot verify correspondence with an off-chain JSON file. Clients MUST check all commitments and fields.
Core classification encodings are the one-based positions in these lists:

| Field | Values in numeric order |
|---|---|
| contentClass | static, time_based, spatial, textual, composite, executable |
| lifecycleStatus | concept, prototype, produced_object, archived |
| aiStatus | none, assisted, generated |
| verificationMethod | self_asserted, institutional, nfc, c2pa, hybrid |
| editionModel | unique, limited, open, dynamic |

`dataHash` and `anchorsHash` must be nonzero. Physical requires nonzero imageHash, zero fileHash and mask15.
Digital requires nonzero fileHash and mask bit32; imageHash is optional. Mixed requires both hashes and all
bits in mask47. The mask checks presence of required bits, not truth of the anchors. Edition anchor bits
4096/8192 and every non-unique editionModel (limited/open/dynamic), even without unit anchors, require a B issuer. C/P/M may mint unique passports only. The immutable `creator`, `creatorId`, card, hashes and classifications never change.

`revokePassport(id, reasonHash)` is available only to the original issuer, at or before
`mintTimestamp + 259200` for C or `mintTimestamp + 86400` for B/P/M, and only while print finalization is absent. Reason is nonzero keccak256 of an external UTF-8 explanation. It is one-shot.
The revocation flag/time/reason change once and cannot be undone; immutable payload/card and prior history remain. Solidity enforces only a nonzero reason hash, not availability or truth of its preimage.
There is no administrator revocation, transfer, replacement link, unit-passport mint, general event-history API,
mutable `lifecycleStatus` classification, URL field or activation-triggered revocation lock in the core. After the deadline,
a correction uses a new passport and an external explanatory statement. Earlier passports remain addressable.

`finalizePassportForPrint(id)` is an original-issuer-only, irreversible per-passport operation.
It rejects missing/revoked passports, records the first block timestamp and emits `PassportFinalizedForPrint`.
A same-issuer retry is a no-op and preserves that timestamp. There is no undo, including after failed printing.
`getPassportReleaseState(id)` returns `(revocationDeadline, printFinalizedAt)` and rejects missing IDs.
Finalization and revocation exclude each other according to chain order. Finalization is allowed after the
window as well, applies to unique passports, and does not stop a profile or block author/expert withdrawals.
Core does not observe printers or openEdition. The application MUST withhold final print export until
confirmed finalization, nonrevoked status and, for unit editions, matching confirmed open/commitment;
it must first durably preserve the exact job, archive and secrets. External printing cannot be prevented.
Readers MUST pin the generation and current evidence before claiming that revocation is closed.

`getPassportHeader`, `getPassportClassification`, `getPassportMedia`, `getPassportReleaseState` are defined by `IODPRegistry.sol`.
Dynamic indexed strings in events are hashes; events also carry readable non-indexed IDs. No caller should
recover an ID by treating an indexed string topic as text.

## 9. Passport JSON

[schema/passport-0.7.schema.json](schema/passport-0.7.schema.json) defines the document shape. The canonical
hashed document ALWAYS has `passportId: null`; the assigned ID is in an external receipt (§15).
Card fields MUST match the normalized mint strings byte for byte. `status` is the state at registration.
`idGranularity` is `model`, `batch` or `item`; it is independent of edition size.

For compatibility the field `registeredAt` retains its name but means **document preparation time**.
It MUST agree with `registration.utcIso8601` and `registration.localIso8601` (UTC with +00:00), and
`ianaTimeZone` MUST be UTC. It is NOT a claim about the future mining timestamp. The actual registration
moment comes only from the chain. UTC year/month of preparation and mint must agree; see §2 for rollover.

Identification facts belong in `anchors[]`. Physical/mixed need photo, dimensions, materials and
`distinguishing_features`. Dimensions use one unit (`MMT`, `CMT`, `MTR`, `INH`, `FOT`) and at least one
positive width/height/depth/diameter. Materials/features must describe the object, not merely exist as empty
placeholders. Digital/mixed need exactly one original `file_hash` matching `digital.fileHash`.
The photo selected as primary MUST be unambiguous: one photo or exactly one `data.role == "primary"`.
Photo/file hashes refer to original bytes, not URLs. Metadata-only examples are not evidence of file possession.

| Anchor type | Mask bit |
|---|---:|
| photo | 1 |
| dimensions | 2 |
| materials | 4 |
| distinguishing_features | 8 |
| marks | 16 |
| file_hash | 32 |
| perceptual_hash | 64 |
| c2pa | 128 |
| nfc | 256 |
| numbered_seal | 512 |
| fingerprint | 1024 |
| dna | 2048 |
| unit_key_set | 4096 |
| unit_variant_commit | 8192 |
| custom / unknown type | 2147483648 |

Bits14–30 are reserved. The reference tool assigns unknown types the unsigned custom bit (bit31), including names such as `constructor`, `__proto__`, `toString` and `hasOwnProperty`, using own-property lookup; it must not silently invent
meaning for reserved bits. Array order is significant. Unit-key anchors additionally follow §20.
Additional namespaces are allowed but participate in canonical hashing. Descriptions of custody, sales and
restoration are issuer statements; no core transaction establishes that the real-world event occurred.

## 10. Hashing (normative)

`chain/tools/canonical.mjs` and `schema/vectors/` provide conformance vectors.

1. Decode input bytes with fatal UTF-8 validation and reject BOM (including service JSON and statement payloads). Parse strict JSON. Reject duplicate keys, including duplicates created by NFC normalization.
   Reject unpaired UTF-16 surrogates, NaN, Infinity and non-JSON values. Do not silently replace characters.
2. Normalize every string value and object key to Unicode NFC. Do not otherwise trim or case-fold text.
3. Sort normalized object keys lexicographically by UTF-16 code units at every level. Emit keys directly
   in that order; constructing a JS object and calling JSON.stringify can reorder integer-like keys.
4. Preserve array order. Use ECMAScript JSON string escapes and finite binary64 number serialization:
   negative zero is `0`, `1e21` is `1e+21`, `1e-7` is `1e-7`. Arbitrary precision values must use strings.
5. Emit compact UTF-8 with no BOM, spaces outside strings, or trailing newline.
6. `dataHash = SHA256(canonical(passport.json))`; `passportId` MUST already be null. Do not replace a
   supplied assigned ID silently. `anchorsHash = SHA256(canonical(passport.json.anchors))` independently.

The receipt, generation manifest, ZIP container and external transport paths/URLs are not included in
`dataHash`. Any path or URL inside passport.json IS included in its canonical hash. Original image/file bytes
have their own SHA-256. A reader MUST recompute hashes from the available bytes; trusting a declared hash
alone is not a file integrity check. Pretty-print changes can canonicalize identically; semantic changes
produce a different commitment. The protocol is not RFC8785 verbatim because it additionally requires NFC.

## 11. Verification algorithm

1. Select an approved generation using chain, registry and ABI/runtime pins; never passportId alone.
2. Read the immutable card/classification/media. A missing record, unavailable chain and revoked record
   are different results. Read a consistent block, handle reorgs/finality, and display observation time.
3. Parse/validate/canonicalize the document. Check dataHash, anchorsHash, mask, all card fields, object type,
   UTC month and numeric classifications. Check original file bytes where available. Report missing files.
4. Compare receipt identity with the selected registry and on-chain ID; receipt is a locator, not authority.
5. Establish issuer identity from independently trusted public sources. Profile type, name, domain declaration,
   authorSigner and affiliation are not sufficient alone. Check passport revocation and each statement lifecycle separately.
6. For statements, read bounded pages at a fixed block and show institution, document hash, date and withdrawal.
   Verify documents when available. A count is not a vote, ranking or automatic decision.
7. For editions, verify §20 anchor/openEdition equality and pinned namespace, then proof/signature/activation.
   Offline checks cannot assert the latest online activation state; label cached state with its block/time.

If a reader cannot perform a declared verification method or interpret an anchor type, it MUST explicitly
report that check as `unsupported` (user-facing example: “Не умею выполнять эту проверку”). It MAY still
show readable data and independently verified integrity results. It MUST NOT label an unperformed check
as passed or turn partial integrity success into a complete verification claim. Unsupported is distinct
from failed, missing evidence, and a counterfeit verdict.

`verifyPassport` in `chain/tools/passport.mjs` checks document integrity/card against supplied chain views.
It deliberately does not authenticate the RPC/generation, fetch files or decide identity/trust.
A client must implement the remaining steps. Hosting unavailability must not invalidate a locally held bundle.

## 12. Locators and QR

`odp://ODP-YYYY-MM-NNNNNNNNN` is the QR payload; its generation context is the single embedded deployment (§22.12, §22.14).
A resolver MUST NOT silently select a registry when several match. The portable receipt explicitly carries
`chainId`, `registry`, `passportId`, transaction hash and block number. HTTPS resolvers are optional carriers
and not authorities. A QR can be photocopied; possession of the locator gives no record rights.
Unit labels additionally carry the edition index and sufficient generation/satellite context (§20).
Never put the concealed activation code in a public QR, URL query, analytics log or public address list.

## 13. SDK and satellite requirements

Use the compiled ABI for `0.7-redesign-7`, not the historical version-byte-only ABI. Build mint inputs from
the same canonical document that will be distributed. Independently decode receipts and verify them.
Page reads are capped at100 and tolerate arbitrary offset/limit without overflow. Zero limit gives an empty
page and total. Unbounded core/proof/concern list reads are absent. The affiliation full list is bounded100.

### Hosting

`ODPHosting` stores mutable data/image locations up to512 bytes each. Only the original issuer or its own
unexpired publishing agent may update. Expiry is exclusive (`now < expiresAt`). Publishing grants do not grant mint authority; issuers can revoke them, at any time. URLs can be cleared and can be
updated for a revoked passport to keep explanations accessible, without changing issuer rights. Hashes never change.
A new hosting satellite does not have authority over old hashes. Treat URLs as untrusted transport input.

### Profile directory

`ODPProfileDirectory` lets registered B/P/M declare or clear a lower-case ASCII DNS name (IDNs use A-labels).
No scheme/path, empty labels, leading/trailing hyphens, >63-byte labels or >253-byte names.
The contract verifies syntax, not DNS/HTTPS control. Names/descriptions stay off-chain. A client trust directory
is separate and cannot delegate rights in the core.

### Concerns

`ODPPassportConcerns` allows registered P/M to raise a nonzero SHA-256 reason document hash and optional URL
up to512 bytes for any existing passport, including revoked ones. One active record per passport/raiser.
Only that raiser may withdraw and later raise a new episode. Active counts track unwithdrawn episodes;
clients MUST surface statement lifecycle independently from identity. There is no profile-wide concern.
Re-raising after withdrawal reuses the pair, never duplicates either index, and increments the active counter
once. State is latest episode; full episode history is in readable event logs. Missing state is detected by
empty `raisedBy`, not `withdrawnAt == 0` alone. Core has no dependency on concerns or their availability.

### Author and wallet attestations

`ODPAuthorAttestation` is one-shot per passport, submitted only by its original issuer for a nonrevoked
passport. The EIP712 message binds passportId, dataHash, creatorId and authorSigner; domain is name
`Object Digital Passport`, version`1`, chainId, satellite address. Low-s ECDSA signatures are required.
A known author key gives an independent signal; an arbitrary freshly declared key proves no human identity.
The signature path accepts EOA ECDSA keys; ERC1271 off-chain signature execution is not implemented. The authorSigner can independently call `withdrawAuthorAttestation` once with a nonzero SHA-256 reason, even after passport revocation. `getAuthorAttestation().attested` means historically published; readers MUST additionally check `authorWithdrawalAt` and `authorWithdrawalReason`. Issuer cannot withdraw another signer's consent. Independent author publication, including by contract-wallet transaction callers, uses the journal below.
`ODPWalletDocumentAnchor` allows any registered profile to anchor nonzero SHA-256 bytes once per
(wallet, hash), with a <=512-byte URI. It is not a passport-specific institutional proof.

### Statement journal (normative lifecycle)

`ODPStatementJournal` is an immutable satellite pinned to one core; generation role `statement-journal`.
It has no owner, upgrade, forwarding signatures, core write access or deletion. All publication is directly
transaction-authorized by a registered profile (contract-wallet callers can register and call).
A payload is a canonical JSON document following `schema/statement-0.7.schema.json`; `payloadHash` is its
SHA-256. Solidity commits the hash and typed envelope; clients MUST check that envelope against the full
payload. It cannot verify JSON availability, semantic truth or human identity.

`publishStatement(passportId, kind, payloadHash, previousId, operationId)` returns a local sequential statement ID.
Journal and institutional-proof appends require a nonzero bytes32 `operationId`, persisted before submission.
`submitProof(passportId, documentHash, documentUrl, year, month, operationId)` uses the same retry model.
The public `statementOperations(author, operationId)` / `proofOperations(author, operationId)` getters
return digest and original ID (zero/empty when absent). Exact replay reverts `StatementAlreadyCommitted`
or `ProofAlreadyCommitted`; changed inputs revert `StatementOperationConflict` or `ProofOperationConflict`.
Replay/conflict is checked before registration, subject lifecycle and calendar validation. Failed calls reserve
nothing. A new ID deliberately permits independent repeated evidence. Successful calls emit
`StatementOperationCommitted` / `ProofOperationCommitted` in addition to their existing publication events.

Digests use `keccak256(abi.encode(...))` with these ordered fields and types:

- Statement: string `ODP-STATEMENT-OPERATION-0.7`, uint256 chainId, address registry, address journal,
  address author, string passportId, uint8 kind, bytes32 payloadHash, uint256 previousId.
- Proof: string `ODP-PROOF-OPERATION-0.7`, uint256 chainId, address registry, address proofRegistry,
  address author, string passportId, bytes32 documentHash, string documentUrl, uint32 year, uint8 month.

Scope is the caller within this deployed satellite (and thus this chain/registry namespace); the same ID in another satellite or wallet is a different operation. Exact replay still identifies the original record after proof withdrawal, statement retraction/supersession, passport revocation or proof calendar rollover. It never republishes or reactivates the record. The journal has no calendar input/check. These checks apply to ABI-decodable calls; invalid enum encoding can fail before function execution.

The operation ID is the lookup key, not a digest field. Clients must authenticate the selected satellite,
compare the full digest, and reconcile receipts at their required finality before treating a replay as success.

Global identity is `(chainId, registry, journal, statementId)`; IDs from different journals never alias.
Kinds: 1 issuer correction, 2 author declaration, 3 institutional assessment. Kind 0/unknown and zero
payloadHash are invalid. The record snapshots caller wallet, profile ID and immutable core dataHash.

- Issuer correction: original issuer only; allowed on an old or revoked passport while the issuer controls its key.
  It explains or links a new passport in the payload; it never alters old content or extends core revocation.
- Author declaration: any registered caller declares *their own* authorship about a nonrevoked
  passport. Issuer approval is unnecessary. Many independent claims may coexist; there is no global
  first-claim slot. A declared key/profile is not proof of the named human's identity.
- Institutional assessment: registered P/M only, nonrevoked passport; self-selected P/M is not accreditation.

`previousId=0` creates a new independent claim. A nonzero previousId must be an Active statement of the
same wallet, kind and passport in this journal. Publication atomically marks that predecessor Superseded
and records both directions of the link. Competing replacements of one predecessor are serialized: the
first succeeds, the stale second reverts `StatementNotActive`. No timestamp-based branch resolution or
implicit selection among independent claims is permitted. Retracting a successor does not reactivate its
predecessor. Revisions of withdrawn claims start a new independent chain; clients retain all history.

`retractStatement(id, reasonHash)` is allowed only to its original caller, with a nonzero SHA-256 reason,
for an Active statement, including after passport revocation. A terminal statement cannot be
retracted/replaced again. Status: Missing=0, Active=1, Retracted=2, Superseded=3. `getStatement` rejects a
missing ID and returns immutable Statement plus Lifecycle; lifecycle time is block inclusion time, not
an assertion of when a real-world event occurred. Pagination by passport/wallet caps results at 100 and
includes terminal records. Read all pages and events at a fixed independently verified block.

Existing proof/concern/one-shot author satellites remain separate namespaces. Their own withdrawal
APIs change only their own lifecycle; a journal declaration never silently retracts another namespace.
The client must report the namespace and completeness of history. Full reason/payload bytes require
separate availability; on-chain hashes do not restore missing documents.

## 14. Versioning

`CONTRACT_VERSION` is the historical packed nibble `major*16+minor`, currently7. Values are only meaningful
when both components are <16. It is not a general semantic version and cannot identify a build or ABI.
The redesigned core and retired core both report7; their authenticated generation manifests MUST distinguish them.
New document/satellite versions may coexist when old interpretations and namespaces remain available.
Changing immutable core semantics requires a new registry. There is no upgrade promise or record migration.

## 15. `.odpass` bundle

An issued `.odpass` MUST be a ZIP container with exactly named root JSON files `passport.json`,
`generation.json`, `receipt.json`, and `manifest.json`; original referenced files reside in `files/`.
JSON encoding MUST be UTF-8 without BOM and duplicate keys MUST be rejected. Names are case-sensitive.
The external archive filename is not authoritative. [Bundle 0.7 format](schema/bundle-0.7/README.md) defines
the directory layout and semantic checks; its JSON Schemas define the exact service-file templates.
`passport.json` MUST follow the existing passport schema and canonical encoding (§10). A pre-mint draft is not an issued passport bundle. Prepare/hash the document
before mint; after a successful mint add receipt/manifest WITHOUT changing passport.json or original files.

`generation.json` MUST include:

- `format`: `odp-bundle-generation-0.7`, and `odpVersion`: `0.7`.
- `generationId`: the unambiguous immutable ODP deployment generation identifier, distinct from document
  schema version and the packed contract version byte. It MUST NOT be inferred from a URL or passportId.
- `chainId`: the deployment network ID as a decimal string.
- `registry`: the complete nonzero registry address (`0x` followed by exactly 40 lowercase hexadecimal digits).
- `abiGeneration`: the exact registry ABI generation identifier.
- `satellites`: the complete list of satellites defined by that generation, including those not used by this
  particular passport. Each entry MUST have a stable `role`, complete nonzero `address`, and `abiGeneration`.
  An intentionally absent role MUST be explicitly listed in `absentSatelliteRoles`; omission MUST NOT mean
  “use the client's latest default”. Short names, domains, shortened addresses and URLs do not replace addresses.

The manifest MUST reproduce the authenticated fixed deployment identities of §7; runtime hashes, deployment
blocks and source/build identity MUST also be retained from that deployment manifest. These are actual deployed
identities, not unlinked bytecode templates or placeholders. No such addresses are approved by this document.

A receipt MUST contain matching `generationId`, `chainId`, `registry`, assigned `passportId`, the successful nonzero `operationId`, `transactionHash`,
`blockNumber` and `blockHash`, with `format: "odp-bundle-receipt-0.7"`. Readers MUST reject conflicting identities between receipt, generation manifest, selected
chain record and any hash-bound satellite references such as `unit_key_set.data.satellite`. They MUST NOT
repair conflicts by substituting their current default contracts. Unknown generation/ABI means unsupported
or unauthenticated, not permission to guess. A copied manifest or receipt alone is not proof of chain state.

The full original photo/files MUST be available within a complete bundle; reading that local bundle does not
require fetching a separate photo URL. Mirrors may distribute the same document/files or a repackaged bundle,
but MUST NOT change the committed content. Receipt, generation manifest, external transport locations and ZIP
metadata are outside dataHash; every field inside passport.json remains subject to canonical hashing (§10).

`manifest.json` uses `format: "odp-bundle-manifest-0.7"` and lists payload paths, SHA-256 hashes and byte
lengths. Payload path is `files/` followed by its 64 lowercase SHA-256 hex digits. Readers MUST validate
file bytes and required payload completeness independently of the editable manifest.

Harden archive extraction against traversal, duplicate paths and oversized payloads. Machine-readable
service-file schemas are supplied in schema/bundle-0.7. `chain/tools/bundle.mjs` implements validation of
already extracted entries: strict JSON, canonical passport, cross-file identity, role/address completeness,
payload hashes/lengths and required originals, full edition address-list tree, and optional exact comparison
with an independently trusted generation manifest. It does not parse ZIP or authenticate chain evidence.
The safe ZIP importer/exporter and client integration remain required before claiming complete bundle conformance.
Storage providers and distribution policy remain undecided; the format does not mandate a hosting service.

## 16. Limits and external statements

The protocol does not adjudicate provenance, intellectual property, authenticity, ownership, or disputes.
Issuer corrections after the applicable window or print finalization can be published through the journal (§13), committing an external payload
with explicit original/new passport references, or distributed off-chain. Independent P/M proof documents
can add assessments. The core has no general issuer-event history API or on-chain replacement pointer;
the journal provides its own history and never changes core content or extends the revocation window.
Public data is permanent: clients SHOULD avoid personal information that should later be erased.

## 17. Wallet and key management

Keep real issuer/master keys outside public documents, logs, tests and the repository. An issuer who has lost their key
has no administrator recovery path. Separate author keys have only their explicitly assigned attestation role; mint delegation is absent. Compromise of an issuer can mint misleading descriptions and revoke its recent
passports within the role-specific window unless finalized for print. It cannot edit immutable older records. Permissionless registration enables impersonation
and Sybil flooding: independent identity and client filtering remain necessary.

## 18. Interoperability

Hashes, full IDs, generation context and algorithm versions are required at integration boundaries.
All original data and historical addresses must remain exportable. Public statements may be independently
indexed, but an indexer omission is not evidence of absence. The core supports Ethereum-style ABI readers;
client SDKs, NFC hardware, DID methods and legal attestations require their own conformance work.

## 19. Availability and client policy

Offline integrity verification uses locally held bytes and previously authenticated chain data. Fresh chain
status needs a node/RPC and finality policy. Institutions, domain registries, hosting providers, label printers
and relayers are separate trust surfaces. Relayers cannot forge a unit signature, but can delay/censor submission,
observe a submitted activation or consume its one-shot record earlier than another courier. Submission time is
not acquisition time. A paid relay is optional: any caller can submit a valid signed activation.

## 20. Edition keys and activation

### 20.1 Scope

The original registered B issuer may open an existing nonrevoked passport with editionModel limited(2) or open(3),
unit_key_set bit4096, nonzero root and nonce, and unitCount1..1048576. Opening is issuer-only and write-once
per satellite/passport. It does not create unit passports, assign ownership or alter the core.

Every additional production run/reprint MUST be a new edition with a new passport and a fresh editionNonce
and key set. The original edition's count, root, description and original files MUST NOT be extended or
rewritten. An `open` classification does not authorize appending units to an existing passport. Each issued
key set is finite and immutable; any later run is independently identified and verified. A new edition MUST
NOT inherit activation state from an earlier edition. No mutable umbrella-series contract is required.

### 20.2 Prepare before mint

Choose a cryptographically random32-byte master seed and independent nonzero32-byte `editionNonce`.
Select the registry and permanent activation satellite BEFORE deriving keys. Commit these in `unit_key_set.data`:
`editionNonce`, `chainId` (decimal string), `registry`, `satellite`, `keyDerivation: "odp-unit-v2"`,
merkleRoot, unitCount, hashAlg, leafFormat, addressListHash and optional labelSignerKey/addressListUrl.
The root exists before passportId; mint hashes the completed document. Before mint, also compute:
`editionCommitment = keccak256(abi.encode("ODP-EDITION-COMMITMENT-0.7", uint256(chainId), address(registry),
address(issuer), address(satellite), bytes32(editionNonce), bytes32(merkleRoot), uint32(unitCount),
address(labelSigner)))`. An omitted labelSigner is address(0). The domain fixes the algorithms of §20.3/20.5;
changing those requires a new commitment format. This commitment is persisted in the core and included in
operation replay protection. `commitmentFor` on the satellite and tools/edition-commitment.mjs expose it.

After mint, the original registered issuer calls `openEdition`. The satellite MUST reject any disclosure whose computed
commitment differs from the core, including another issuer or satellite. A `(issuer, editionNonce)` can open
only once in that satellite, even after revocation; `editionPassportByNonce` identifies its original passport.
This uniqueness does not extend across different satellites or registries. Invalid openings reserve nothing.

Verifiers MUST still compare ALL parameters against the hash-bound JSON anchor and selected namespace.
The contract does not parse JSON: it enforces core-to-satellite equality, not semantic truth of the document.
Clients MUST complete mint → confirmed open → anchor/commitment equality checks before distributing final
edition labels. No profile stop can strand opening; key loss, passport revocation and invalid commitments
can still prevent completion.

### 20.3 Merkle tree

Index is zero-based uint32 big-endian. Leaf = SHA256(index4 || unitAddress20). Internal node = SHA256(left32 ||
right32). Duplicate the last node at each odd level. Proof siblings are ordered bottom-up; index bits select
left/right. The canonical proof has ceil(log2(unitCount)) levels. The contract caps proof length32, while the
count cap needs at most20 levels. Clients MUST construct/check the canonical count/tree. Root is a commitment,
not an encrypted address list. An optional published address list is lower-case full addresses in index order,
one per line with LF including final LF; its SHA256 is addressListHash. It MUST NOT contain codes/private keys.

### 20.4 Optional variant commitment

A concealed variant can use a separate Merkle root over
SHA256(index4 || byteLength(variant)2 || NFC_UTF8(variant) || randomSalt32), using the same tree rules.
Salt remains inside the package, not the public document. No on-chain variant evaluation is implemented.
The variant unitCount MUST agree with the edition total (if present) and its unit_key_set count (if present).
A reader checks the disclosed variant/proof against its separate hash-bound anchor. Distinct root domains and
leaf formats MUST NOT be interchanged.

### 20.5 Key derivation v2

All concatenations below are byte concatenation. `chainId32` is unsigned big-endian; registry is20 bytes.
`context = ASCII("ODP-EDITION-v2") || chainId32 || registry20 || editionNonce32`.
`secret_i = HKDF-SHA256(masterSeed32, emptySalt, context || uint32be(i), 32)`.
Take the first100 bits: first12 bytes and high4 bits of byte12; low4 bits of byte12 are zero. This is seed13.
For counter0,1,... derive `h = SHA256(ASCII("ODP-UNIT-KEY-v2") || seed13 || context || uint32be(counter))`.
Use the first scalar with `0 < uint256(h) < secp256k1_order`; otherwise retry. Derive its EVM address normally.
This is intentionally incompatible with the circular passportId-based v1 derivation. Do not mix label batches.
At N=2^20, generic any-of-N search on100-bit secrets is about2^80; larger unit sets require a new format.

### 20.6 Printed code

Encode exactly100 bits MSB-first as20 Crockford Base32 characters using
`0123456789ABCDEFGHJKMNPQRSTVWXYZ`. Append5 checksum characters encoding the first25 bits of
SHA256(ASCII(payload20)). Print five groups of five. Reader uppercases, removes spaces/hyphens, maps I/L→1
and O→0, checks length/alphabet/checksum, and reconstructs seed13. Checksum is typo detection, not authentication.
Keep the code under tamper-evident concealment; whoever learns it can sign. Store the master securely and do
not reuse context/master combinations across distinct production runs.

### 20.7 Outer labels

Optional label signature uses personal_sign over the32-byte keccak256 of
`ASCII("ODP-UNIT-LABEL-v1") || chainId32 || satellite20 || UTF8(passportId) || index4 || merkleRoot32`.
The expected labelSigner is the one committed before mint and registered at open; zero means plain labels.
Readers can verify labels offline with an authenticated edition bundle. A genuine signature can be copied.
It proves only that the specified key signed that label, not that the attached object matches the description.

### 20.8–20.9 Activation

Unit key signs personal_sign over keccak256 of
`ASCII("ODP-UNIT-ACTIVATE-v1") || chainId32 || satellite20 || UTF8(passportId) || index4`.
Any courier may call `activate(id,index,proof,signature)`. Low-s ECDSA and valid-v are required; index must be
in range, root proof valid, and slot unused. First valid submission stores unitAddress and block timestamp.
Duplicate attempts revert. This is not replay-proof physical ownership: leaked/cloned keys permit early use.

### 20.10–20.13 Lifecycle and removal of unit passports

There is no unit-passport mint or transfer. Edition activation remains possible for an already opened nonrevoked edition. Passport revocation blocks new activations but preserves recorded ones.
First activation does not close the B issuer 24h revocation window. Only expiry or explicit print finalization closes revocation. Display activation, revocation and print finalization independently.
Readers must retain the pinned satellite even after client defaults change. No satellite can write to the core.

## 21. Pre-release validation boundaries (ABI 0.7-redesign-7)

JSON input bytes MUST be decoded with fatal UTF-8 validation; replacement decoding and BOM are forbidden.
An edition Merkle root MUST be nonzero. Issuance preflight MUST obtain the complete address-list bytes (from local storage or an independently permitted transport),
check exact lower-case address lines with a final LF, declared count and SHA256, and rebuild the positional
tree (including odd-node duplication) before minting. A syntactically valid typed commitment is insufficient.
`preparePassport` checks shape and commitments; `prepareIssuance` additionally requires the edition list.
Bundle integrity includes this tree check but does not prove possession, activation, authenticity or identity.
Unsupported verification methods/anchors MUST remain explicitly unsupported in the per-capability report.


### 21.1 Reference statement validation and ABI errors

`verifyStatement(bytes, {chainId, registry, journal}, record)` in `chain/tools/statement.mjs`
requires strict UTF-8, schema-valid canonical bytes, and equality of namespace, passportId, subject dataHash,
author wallet, kind, previousId and payloadHash. The supplied record/context must be authenticated separately.
Its successful report verifies content integrity only; author identity/lifecycle remain unverified and truth unsupported.
Schema validation alone is insufficient for these semantic checks or for edition/address-list validation.

The following is a focused integration table for ABI `0.7-redesign-7`, not an exhaustive list of Solidity
errors. Decode against the selected contract ABI in `chain/abi/`; the same EC number can have
context-specific uses. The earlier `0.7-redesign-6` line emitted neither `PassportPrintFinalized` nor the
non-unique-edition rejection below, and used a single 72-hour window for every profile type.

| Call / condition | Result in `0.7-redesign-7` |
|---|---|
| Zero operationId: mint / journal / proof | `InvalidOperationId()` / `InvalidStatementOperation()` / `InvalidProofOperation()` |
| Exact committed mint | `AlreadyCommitted(bytes32 operationId,string passportId)` |
| Exact committed journal / proof | `StatementAlreadyCommitted(bytes32 operationId,uint256 statementId)` / `ProofAlreadyCommitted(bytes32 operationId,string proofId)` |
| Changed digest under committed ID | `MintOperationConflict(bytes32)` / `StatementOperationConflict(bytes32)` / `ProofOperationConflict(bytes32)` |
| revokePassport: missing / already revoked / wrong caller / expired / zero reason | `EC(12)` / `EC(18)` / `EC(17)` / `EC(132)` / `EC(16)` respectively |
| revokePassport after print finalization | `PassportPrintFinalized()`, checked before the deadline test |
| finalizePassportForPrint: missing / wrong caller / revoked | `EC(12)` / `EC(17)` / `EC(18)`; a repeat on an already finalized passport succeeds as a no-op |
| getPassportReleaseState on a missing passport | `EC(12)` |
| Non-unique editionModel (limited/open/dynamic) or bits 4096/8192 from a non-B profile | `EC(121)` |
| New mint/proof in a different UTC month | `EC(68)` (committed operation lookup precedes this check) |
| Replacement of own terminal statement | `StatementNotActive()` |
| Wrong edition disclosure / reused issuer nonce | `EditionCommitmentMismatch()` / `EditionNonceAlreadyUsed(string passportId)` |
| Historical profile-stop error `EC(131)` | Not emitted by any production contract in this generation; no stopped-profile state exists |

### 21.2 Deployment evidence boundary

The ten-contract roster is the core plus concerns, hosting, profile directory, institutional proofs,
author attestation, wallet document anchor, relations, edition units and statement journal.
A release bundle pins complete compiler input/output and exact ABI/creation/runtime/immutable bindings.
The only bundle that exists is the earlier `0.7-redesign-6` one; the deployment scripts require a
`0.7-redesign-7` bundle and reject it. Until a bundle is rebuilt and independently approved for the current
sources, no pinned release corresponds to this specification, and the procedure below is unexecutable.
Deployment uses pinned release bytes with compilation disabled, a checked manifest/resume identity,
write-ahead transaction plans, exclusive manifest lock, nonce sequence and explicit gas/fee/total spend caps.
On Polygon, two separate RPC services verify transactions, canonical receipts, runtime and finalized blocks;
all ten contracts are rechecked before a generation candidate is emitted. Unknown submissions must be
reconciled, never blindly redeployed. Two RPCs remain a trust assumption, not a light-client proof.
See [deployment procedure](chain/deploy/README.md). A local candidate is not production approval.

## 22. Client application requirements (normative)

Contracts cannot see screens, printers or people. These requirements bind any application that issues, prints
or verifies ODP 0.7 passports; a client that breaks one of them is non-conformant even if every transaction is
valid. Rationale and acceptance scenarios:
[usage-safety audit](review/usage-safety-abi6/REPORT.ru.md), decisions: [closure log](review/usage-safety-abi6/CLOSURE.md).

### 22.1 Issuer keys and recovery (D1)

- CA-1.1. The client MUST state before the first mint that ODP cannot recover, block or move an issuer
  profile, and that backup of the wallet is the issuer's responsibility (§17).
- CA-1.2. The client MUST NOT ask for a seed phrase to "prove" a backup and MUST NOT mark a backup as verified.
- CA-1.3. Issuer keys, master/unit secrets and seeds MUST NOT appear in `.odpass`, logs, crash reports,
  analytics or exported previews.
- CA-1.4. A new address MUST NOT be presented as the recovered old profile.

### 22.2 Revocation window and print finalization (D2)

- CA-2.1. The client MUST show the remaining revocation window of the issuer's role (C 72h, B/P/M 24h, §8).
- CA-2.2. A print-ready label file MUST be produced only after `finalizePassportForPrint` is confirmed on
  chain, the passport is nonrevoked and, for editions, the edition is open. Earlier previews MUST be visibly
  unusable as final labels.
- CA-2.3. A printer error, cancelled job or lost file MUST NOT be presented as undoing finalization.
- CA-2.4. A revoked passport MUST NOT be offered for issuance, printing or as a valid passport; its history
  stays readable and its QR MUST show the revocation on a fresh check.

### 22.3 Authorship (D3)

- CA-3.1. `authorName` MUST be shown as a name declared by the issuer, not as an established author.
- CA-3.2. An author attestation MUST be shown as "key X signed; issuer Y published". The client MUST NOT
  show a verified-author badge from the attestation alone, and MUST NOT treat issuer = signer as independent.
- CA-3.3. A withdrawn attestation MUST be shown as withdrawn next to the historical signature
  (`attested` stays true on chain).
- CA-3.4. Independent author declarations from the statement journal MUST be shown alongside the slot,
  with sources and lifecycle; the client MUST NOT pick a "true" author automatically.

### 22.4 Activation and handover (D4)

- CA-4.1. Activation MUST be described as "first proof of access to the unit key N in block B; buyer not
  recorded". The client MUST NOT name the sender or the unit-key address as owner.
- CA-4.2. Wording such as "your item", "ownership transferred" or "registered to you" MUST NOT be used.
  Revealing the scratch code MUST NOT be described as acquiring rights.
- CA-4.3. The client MUST NOT offer transfer of issuer or master keys as a way to hand over an item.

### 22.5 Issuance job integrity (A1)

- CA-5.1. Preview, hashing, signing and export MUST be built from one immutable issuance job.
- CA-5.2. Changing any significant field (object, media, files, `authorName`, edition count, wallet, network)
  MUST invalidate the job and its confirmation; the client MUST NOT silently recompute hashes.
- CA-5.3. Immediately before signing, the client MUST decode the calldata and compare it, the connected
  address and the chain ID with the job. A mismatch MUST block submission; a warning alone is not enough.
- CA-5.4. The final confirmation screen MUST show the exact media, the author as an issuer declaration,
  the edition count, the issuer profile, the network and the generation.
- CA-5.5. For editions the client SHOULD offer an independent check on a second device: both devices show
  the same job fingerprint and summary, and the fingerprint is entered before submission. The client MUST
  state that this check does not prove that a second person took part.
- CA-5.6. An issuer MAY register its profile to a multisig smart account (one issuer profile = one Safe
  address with an M-of-N owner policy). A client MUST treat a multisig proposal awaiting co-signers as
  pending, not as failed or stuck, and MUST NOT resubmit the job under a new `operationId` while it is pending.
  Checked locally with canonical Safe v1.4.1, 2-of-3 (`chain/deploy/test/ODP07Safe.test.js`): registration,
  mint and print finalization (B, P, M), revocation and `openEdition` (B), `submitProof`, `withdrawProof` and
  `setDomain` (P, M) need two owners; one owner key alone does nothing.
  Live wallets (hardware, Tangem via WalletConnect) and public networks are not yet verified.
- CA-5.7. Clients MUST support Safe-registered B, P and M profiles for every action of that role. When a B, P
  or M profile is being registered, the client SHOULD recommend a Safe with at least two owners on separate
  (preferably hardware) devices, and explain that one stolen key then cannot act and that ODP still cannot
  recover or move the profile (CA-1.1). A plain wallet remains allowed; the contract cannot tell a multisig
  from a single key. C profiles are personal: the client MUST NOT register a C profile to a Safe or other
  multisig account and MUST refuse to act as a C issuer for one. This is a client rule only; the contract
  does not enforce it, so a reader MUST NOT infer anything from a C profile's wallet type.

### 22.6 Interrupted issuance and recovery (A2)

- CA-6.1. Before opening the wallet, the client MUST durably save the whole job: canonical bytes, media and
  files, `operationId`, and for editions the seed/unit secrets and commitment inputs. The saved job MUST be
  included in a backup that can be restored on another device (§3 retry rules apply).
- CA-6.2. The client MUST track and show each stage separately: result unknown, passport minted, edition not
  opened, archive not saved, not delivered. A single generic "error" state is non-conformant.
- CA-6.3. "Retry" MUST continue the same job with the same `operationId` and exact parameters, after checking
  `getMintOperation` and any pending transaction. A new passport MUST be a separate, explicit user action.
- CA-6.4. `AlreadyCommitted` for the saved job MUST be shown as success ("passport already created") after
  verifying the returned passport; for `openEdition`, which has no `operationId`, the client MUST compare
  `getEdition` with the job instead of treating a revert as failure.
- CA-6.5. A print-ready label file MUST NOT be released until mint, edition open (if any), and a verified
  archive export are all confirmed (see also CA-2.2).

### 22.7 Edition secrets and the `.odpsecret` file (A3)

A valid Merkle root proves that the public address list was not altered. It does not prove that the secrets
were kept, that every key is distinct, or that the right code was printed on the right label.

- CA-7.1. Edition secrets (master seed, derivation context, label-signer key, unfinished jobs from CA-6.1) MUST
  be stored only in a separate `.odpsecret` file, never inside `.odpass`. A `.odpsecret` file MUST always be
  password-encrypted; the client MUST NOT write it unencrypted.
- CA-7.2. Before mint, the client MUST restore the `.odpsecret` backup and check that it reproduces every
  index→address pair of the list.
- CA-7.3. A list with the same unit address on two indexes MUST block issuance; the reference
  `verifyAddressList` rejects it (`Duplicate unit address`).
- CA-7.4. The client MUST show separate states: list verified, secrets saved and restored, codes matched to
  indexes, print checked. "List verified" MUST NOT be presented as edition readiness.
- CA-7.5. The client MUST NOT open a `.odpsecret` file as a passport and MUST warn, before any share or
  export, that it contains keys, not a passport. Secrets MUST NOT reach print spools, logs or analytics.
- CA-7.6. Before hand-out, the issuer SHOULD scan a sample of the real printed batch; a screen preview is not
  a print check. Rejected labels SHOULD be destroyed.

### 22.8 Hand-out before print finalization (A4)

With CA-2.2 a conforming issuer cannot hand out edition labels while the passport is still revocable. The
remaining gap is labels printed outside a conforming client.

- CA-8.1. The issuer client MUST NOT let items be marked as handed out or sold until the passport is finalized
  for print.
- CA-8.2. For edition passports (B) that are not finalized and still inside the revocation window, a verifier
  client SHOULD show a neutral "recently issued" mark on the main screen and, in details only, "The issuer
  may still correct this passport until <date/time>". It SHOULD NOT use alarming wording such as "may be
  revoked" on the main screen. For single passports (C, P, M) no such notice is required.

### 22.9 What each recovery path restores (A5)

The chain holds the card and commitments, not the originals. A QR restores the chain card; an issuer key
decrypts nothing and restores no files; only byte-identical copies restore the originals.

- CA-9.1. The client MUST state what is actually present, e.g. "chain card available; photo missing" or "local
  files intact; current status not checked". A partial set MUST NOT be called a restored passport.
- CA-9.2. A bundle missing a required original or a manifest-listed payload MUST be reported as incomplete.
- CA-9.3. On hand-out, the issuer client MUST give the recipient a copy of `.odpass` and SHOULD prompt the
  issuer to keep its own copy in separate storage.
- CA-9.4. The client SHOULD add the texts of corrections, revocation reasons and statements it knows about as
  listed payloads under `files/<sha256>` (§15; `passport.json` unchanged). Readers match them to on-chain
  keccak256 reason/payload hashes and MUST show a missing text as missing, not as absent history.
- CA-9.5. Verification of a bundle MUST work without the issuer's site or an ODP account, using open tools
  (`chain/tools/bundle.mjs` or an equivalent).

### 22.10 Institution identity and independent directories (A6)

Anyone may register a P/M profile, declare any syntactically valid domain (`ODPProfileDirectory`) and publish
any number of statements. A domain check proves control of that domain only; a look-alike phishing domain
passes it too. ODP has no central trust list. Identity comes from independent, operator-run directories in the
[ODP Profile Directory format](https://github.com/object-digital-passport/odp-profile-directory), where the
operator decides which domain is the organization's real one.

Domain publication endpoint: an organization publishes its profile IDs at
`https://<domain>/.well-known/odp.json` as a JSON object `{"chainId": <number>, "registry": "0x…",
"profiles": [{"profileId": "…"}]}`; an entry MAY override `chainId`/`registry`. A profile counts as published
only when `profileId`, `chainId` and `registry` all match the generation being verified.

- CA-10.1. The client MUST show an organization name only from a directory row with status `active`, labelled
  with the directory's operator. Otherwise it shows the profile ID and "self-declared type: museum/expert";
  no verified badge from type prefix, declared domain or statement count.
- CA-10.2. The client MUST show which directories are in use and SHOULD let the user add their own. A
  directory MUST NOT be presented as protocol truth; absence from it MUST NOT be shown as a warning.
- CA-10.3. Domains MUST be shown exactly, with non-ASCII labels in punycode (A-label) form, so that
  look-alike domains are visible.
- CA-10.4. Statement counts MUST NOT be presented as a rating. A statement without a document MUST be shown as
  "no document attached". When a filter hides records, the client MUST say that not all records are shown.
- CA-10.5. Directory statuses MUST be handled as the directory format defines them; in particular
  `unreachable` MUST NOT be shown as an accusation and MUST NOT be merged with `removed`.

### 22.11 Reading lifecycle and history completely (A7)

- CA-11.1. Whenever the client shows an author attestation, institutional proof, journal statement or concern,
  it MUST read and show that record's current lifecycle (withdrawal, retraction, replacement) next to the
  historical record.
- CA-11.2. All reads for one view MUST use one block and MUST page to the end. If a page, satellite or source
  could not be read, the client MUST say "not all records loaded" instead of reporting none.
- CA-11.3. "Could not load" and "no records" MUST be distinct messages.
- CA-11.4. Cached data MUST be shown with its block/time ("as of <date>").
- CA-11.5. Retracting or withdrawing a successor MUST NOT make its predecessor current again; terminal records
  stay terminal.

### 22.12 One network, one registry (A8)

ODP 0.7 uses exactly one deployment: Polygon mainnet (chainId 137), one registry and its satellites, fixed by
the single approved entry in `chain/generations.json` once deployed (§7). There is no second network and no
alternative registry. A self-consistent `.odpass` can describe a fake deployment, so its own manifest and
receipt are never a trust root.

- CA-12.1. The client MUST embed this single generation (chainId 137, registry and satellite addresses) and
  accept only it. Addresses from a bundle, QR or URL are only compared with it; any other chain or registry
  MUST be shown as "not an ODP passport / not verified", never as verified.
- CA-12.2. The client MUST show "files intact" and "registration confirmed on the ODP registry" as separate
  results; the first alone MUST NOT be called an authentic passport.
- CA-12.3. The client MUST check the receipt itself on chain: transaction, block, and that the event was
  emitted by the embedded registry. A receipt from the bundle is never taken on trust.
- CA-12.4. Verification MUST be read-only and MUST NOT ask the user to sign or send anything.

### 22.13 Importing untrusted `.odpass` files (A9)

A matching hash proves the bytes are unchanged since issuance, not that they are safe to open.

- CA-13.1. Import MUST extract into an isolated temporary staging area; a failed or interrupted import MUST NOT
  change the user's storage. The public bundle parser MUST be separate from the key store (`.odpsecret`).
- CA-13.2. Before allocating memory or decompressing, the client MUST enforce: total uncompressed size
  ≤ 512 MiB; any single entry ≤ 256 MiB; ≤ 1,000 entries; compression ratio ≤ 100:1 per entry and overall;
  each JSON file ≤ 1 MiB with nesting depth ≤ 64. (The largest edition address list, 1,048,576 × 43 bytes,
  is about 45 MB.)
- CA-13.3. Symlinks, duplicate paths, absolute paths, `..` segments, local/central directory mismatches,
  nested ZIPs and encrypted entries MUST be rejected with a specific reason.
- CA-13.4. Payloads MUST be shown inertly (image or plain text) after content sniffing. HTML, SVG scripts,
  active PDF content and executables MUST NOT run, and previews MUST make no network requests.
- CA-13.5. Opening or importing a bundle MUST NOT trigger any wallet prompt.

### 22.14 QR payloads and external links (A10)

A genuine ODP QR carries identifiers only, never a web address: `odp://<passportId>` for a passport and, for
an edition unit, the edition passport ID with the unit index in the same `odp:` form (exact unit-label
encoding to be fixed with physical print tests, `review/qr-07`). GS1 Digital Link or other `https://` payloads
are not used. A counterfeit label can still carry any URL, and the phone's camera, not the ODP app, reads it;
passports also contain hosting and proof URLs that their publishers can change.

- CA-14.1. Clients SHOULD register the `odp` URL scheme so the system camera offers to open the app. The
  client MUST resolve the ID itself against the embedded registry (§22.12) and MUST NOT open any website to
  verify. A scanned `https://` QR MUST be treated as "not an ODP label".
- CA-14.2. The client MUST state that checking a passport never needs a seed phrase, password or wallet
  signature. Any signing request MUST be a separate explicit action with a decoded description.
- CA-14.3. External links MUST NOT open automatically; the exact destination host MUST be shown first.
  Custom schemes other than `odp:` MUST NOT be followed.
- CA-14.4. Hosted files MUST be fetched without cookies, referrer or user identifiers and with the limits of
  CA-13.2. A fetched file whose hash does not match the chain commitment MUST NOT be shown as authentic.
- CA-14.5. The concealed activation code MUST be entered only inside the app and MUST NOT appear in any URL,
  QR, log or analytics event (§12).

### 22.15 Permanent publication and privacy (A11)

Chain data, events and distributed archives cannot be erased. A hash is a commitment, not encryption; a
guessable personal value can be recovered from its hash by trying candidates.

- CA-15.1. Before mint or any publication, the client MUST show exactly what becomes public permanently:
  every field, every file and its metadata, and any URL.
- CA-15.2. The client MUST detect location and device metadata (e.g. EXIF GPS) in media and offer to strip it
  before hashing. After mint it MUST NOT silently replace an original with a cleaned copy.
- CA-15.3. The client SHOULD warn about personal-looking data in text fields (phone numbers, addresses,
  e-mail) before publication.
- CA-15.4. After delete, revoke or withdraw the client MUST say exactly what happened ("local copy on this
  device deleted"; "statement withdrawn, chain history kept") and MUST NOT use "deleted" without qualification.
- CA-15.5. Verifying a passport MUST NOT require connecting a wallet, and the client MUST NOT collect analytics
  beyond what the user enabled.

### 22.16 No overall verdict (A12)

Each check is honest on its own; merged into one success it invites the false conclusion "this object is
genuine". A real label moved onto a counterfeit passes every chain check. Classification fields such as
`verificationMethod` are issuer declarations, not performed checks.

- CA-16.1. The client MUST NOT show a single overall success or the word "authentic/genuine". Results are
  shown per part: files, registration, issuer identity, author, statements and lifecycle, activation,
  freshness.
- CA-16.2. The client MUST state that ODP does not prove this object is the one described, and ask the user to
  compare the object with the photo and description.
- CA-16.3. `verificationMethod` and similar fields MUST be shown as issuer declarations. A check the client
  cannot perform (e.g. NFC) MUST be shown as "this app cannot perform this check" — neither a green mark nor
  a counterfeit warning.
- CA-16.4. Every part MUST carry one of: confirmed, not confirmed, unknown, could not check.
- CA-16.5. The issuer's full profile ID MUST be shown on every verification, never shortened, with a prompt to
  compare it personally with the ID the issuer publishes through its own channels (website, shop, documents).
  The profile ID is public by design; this comparison is the user's own identity check and the client MUST
  NOT replace it with a name alone.
- CA-16.6. Before release, a client SHOULD run a usability test with a counterfeit object carrying a genuine
  label; participants should be able to say what was and was not established. Pass criteria are set in
  advance.

### 22.17 Accepted residual risks (R1–R3)

These risks remain by design and are accepted with the limits below.

- R1. A genuine label can be moved to another object; no signature binds it to the physical item. Covered by
  CA-16.2; independent physical inspection remains necessary for valuable transactions.
- R2. ODP as a company may disappear. CA-17.1. Offline results MUST say "checked from saved data as of
  <date>; current status unknown". CA-17.2. This specification, the fixed deployment addresses and the open
  tools in `chain/tools` MUST remain sufficient for a third party to build an independent verifier without an
  ODP account or service.
- R3. Handing over an archive and a scratch code does not make a transaction fair; ODP records no owner (D4).
  CA-17.3. On hand-over the client MUST list what was actually handed over (object, `.odpass` copy, unit
  index, scratch state) and MUST NOT state that ownership was transferred.
