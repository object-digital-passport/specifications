# Object Digital Passport — specification 0.7

**Redesigned generation `0.7-redesign-8`. Local contract candidate for independent audit; no deployed, approved production generation.**
The earlier `0.7-redesign-7` snapshot and its approved release bundle are history; they do not describe the current sources.

This document is normative for the sources in `chain/contracts/`. MUST, MUST NOT and SHOULD express
requirements. The previous 0.7 ABI is incompatible. Its specification is preserved for audit in
[BASELINE_SPEC_5d1db8f.md](review/astra/BASELINE_SPEC_5d1db8f.md), not as an alternative implementation target.
The older audit/design documents describe inputs to this implementation; [ODP_ASTRA_REVIEW.md](ODP_ASTRA_REVIEW.md)
records which claims survived independent reproduction. Deployment and client integration status live in
[ODP_07_IMPLEMENTATION.md](ODP_07_IMPLEMENTATION.md).
This English file is the only normative text. Translations under `docs/<language>/` are informative and may
contain mistakes; see [docs/TRANSLATIONS.md](docs/TRANSLATIONS.md).

## 1. Overview

ODP records an issuer's immutable description and hash commitments. It establishes that a wallet registered
those commitments in a particular block. It does not establish physical possession, ownership, authenticity,
legal title, or the real-world identity of a self-registered issuer. A displayed author name is a declaration.

The core has no administrator, owner, proxy, privileged deployer, freeze, mutable implementation, or satellite
callback. Its internal library is compiled into its bytecode. Satellites read a constructor-pinned core;
the core does not know their addresses. There is no protocol fee. Transactions incur network fees.
Reads and offline checks require no transaction, but RPC and data providers can charge or become unavailable.
Long-term verification requires the original chain state and document bytes to remain accessible.
Verification is offline-capable, not offline-complete: a bundle can be checked against itself without a
network, but confirming that it is the registered document needs the chain (§15.3). No images or files are
stored on chain; the core holds a short card and hash commitments.

ODP complements human expertise and other standards; it does not replace them (§18). Spam and indexing noise
are only partly limited (mint caps, independent directories). Visual design of apps, labels and websites is
not specified here.

### 1.1 Terminology

| Term | Meaning in this specification |
|---|---|
| Passport ID | The `ODP-…` identifier assigned by the core at mint (§2). The hashed `passport.json` carries `passportId: null`; the assigned ID lives in the receipt (§15) and on chain. |
| Profile ID | The issuer identifier `C-…`, `B-…`, `P-…` or `M-…` (§3); `creatorId` on chain. A document MAY name profiles in `authorship` persons; such a value is a declaration. |
| Registration | `registerCreator(type)`: binds the calling wallet to one permanent profile ID. Network fee only. |
| Mint | A transaction to `mintPhysical`, `mintDigital` or `mintMixed` that creates one immutable passport record: card, classification and hash commitments (§8). It uploads no document or file. |
| Generation | One deployed set of a core and its satellites, identified by chain ID, addresses and ABI generation (§7). Profiles and passports belong to exactly one generation. |
| Passport | The on-chain record plus, when available, the `passport.json` bytes and original files whose hashes it commits. |
| `passport.json` | The canonical off-chain document (§9, §10); its SHA-256 is `dataHash`. |
| `.odpass` | The ZIP bundle carrying `passport.json`, its original files and the service files that tie it to a generation (§15). It is the primary copy; network locations are conveniences (§19). |
| Gas | The network fee in POL on Polygon. ODP charges no protocol fee. |
| Verification | Read-only checks of chain records and locally available bytes (§11). It never needs a signature (CA-12.4) and yields per-part results, not one verdict (§22.16). |
| Revocation window | The period after mint in which the original issuer may revoke: 72 hours for `C`, 24 hours for `B`/`P`/`M`, closed earlier by print finalization (§8). |
| Print finalization | The irreversible `finalizePassportForPrint` mark that closes revocation before labels are printed (§8, CA-2). |
| Edition passport | One `B` passport registering a production run, carrying a `unit_key_set` anchor (§20). Its anchors describe the run, not one item. |
| Unit | One physical item of an edition, identified by its index. A unit has no passport of its own. |
| Unit key | The key pair of one unit (§20.5). Its seed is the code printed under the concealment layer. |
| Activation | The one-time public record that a unit key signed for its slot (§20.8–20.9). It is not a mint, not a verification and not ownership (CA-4). |
| Relayer | Anyone who submits someone else's signed activation. It gains no rights over the unit (§19). |

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

| Part | Meaning | Example |
|---|---|---|
| `ODP` | Fixed prefix | `ODP` |
| `YYYY` | UTC year of the mint block | `2026` |
| `MM` | UTC month (01–12) of the mint block | `03` |
| `NNNNNNNNN` | Nine decimal digits, zero-padded | `004829301` |

The reference core computes, with `abi.encodePacked`:
`key = year*100 + month`;
`n = uint32(keccak256(block.timestamp, block.prevrandao, msg.sender, nonce+i, key, gasleft())) % 1e9`
for `i = 0…24`, taking the first `n` not yet used in that `key`; otherwise it reverts `EC(61)`. The number
carries no order or count of registrations. The ID is assigned by the contract, never chosen by the issuer,
and never changes. `YYYY-MM` states when the record was mined, not when the object was made; historical dates
belong in `creationDate` or `objectYear` (§9). The chain enforces only consistency with the block time.

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

### Type prefixes and format

| Prefix | Intended use | Contract-enforced differences |
|---|---|---|
| `C` | Individual creator: artist, photographer, maker | 1000 mints per bucket; unique passports only; 72-hour revocation window |
| `B` | Brand, company, studio, label | 100000 mints per bucket; the only type that may issue editions (§8, §20) |
| `P` | Expert, auction house, certification body | No mint cap; institutional proofs and concerns (§4, §13) |
| `M` | Museum or collection, including holdings by deceased authors | Same as `P` |

Museums and large inventories SHOULD register as `M`, not `B` or `C`. Only these four prefixes exist.
`registerCreator` rejects any other byte (`EC(54)`) and a second registration of the same wallet (`EC(53)`).
A new prefix requires a specification update and a new registry.

`NNN-NNN-NNN-NNN` is a twelve-digit number in four groups, for example `C-482-930-174-005`,
`B-029-384-751-224`, `P-001-293-847-119`, `M-204-839-112-441`. The core computes
`n = uint64(keccak256(block.timestamp, block.prevrandao, msg.sender, nonce+i, gasleft())) % 1e12`
for `i = 0…24` and takes the first unused `n`; otherwise it reverts `EC(62)`. The number carries no meaning.

### Public identity

A profile has a short form, the profile ID, and a full form, the complete 42-character wallet address that
the registry binds to it. A name is an off-chain label only; the registry stores no names. Profile IDs and
wallets are public by design. Every issuer MUST publish both forms on at least one channel it controls
(website, shop, packaging, documents handed over with the object), and organizations (`B`, `P`, `M`) MUST
also serve `/.well-known/odp.json` (§22.10). The registry cannot enforce this; a conforming issuer follows it.
Anyone can register, so a profile whose ID cannot be found in its claimed owner's own channels is unidentified. Clients show the full profile ID and ask the user to compare it (CA-16.5).
A passport ID and profile ID printed together on packaging are a convenience, not an identity proof (§5).

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
A statement does not modify the passport; statements accumulate beside it and stay readable after withdrawal.

`getProof(proofId)` returns `ProofRecord(proofId, contractVersion, prover, passportId, documentHash,
documentUrl, timestamp)`: `prover` is the submitting profile ID, `documentHash` is the SHA-256 of the
institution's document or zero, `documentUrl` is empty when the hash is zero, and `timestamp` is the block time.
`contractVersion` is 7 and MUST equal the core's `CONTRACT_VERSION`; the satellite derives it from the same
`SPEC_MAJOR`/`SPEC_MINOR` rule (§14). The proof number is
`uint32(keccak256(block.timestamp, block.prevrandao, msg.sender, nonce+i, key, keccak256(passportId),
gasleft())) % 1e8` with `key = year*100 + month`, first unused of 25 candidates, otherwise `EC(60)`.
Lists are read with `getProofsForPassportPaged` and `getProofsByInstitutionPaged` (§13). Submission costs
only the network fee.

`ODPRegistryRelations` stores display-only affiliation for B/P/M. A child proposes; the parent confirms.
Both profiles must be registered B/P/M when creating a relation. There is at most one active parent per child,
100 active children per parent and 100 pending parents per child. Confirmation rechecks cycles, walking
at most eight ancestors and rejecting when no root is reached in that bound. This bound is a per-operation
walk bound, not a global maximum tree height. Parent detach and child leave/cancel are cleanup operations
available to their original participants. No rights, quota or trust are inherited. Children lists use swap-and-pop on detach;
read multiple pages at the same block. Private Solidity storage is publicly observable.

A link that would close a cycle reverts `EC(67)`; an ancestor walk that reaches no root within eight hops
reverts `EC(69)`. `C` profiles cannot take part on either side (`EC(71)`). Affiliation records that two
profiles agreed to be linked and in which direction, nothing more: a parent confirms belonging, not quality.
A verifier MUST NOT present a child as endorsed, certified or vouched for by its parent, and MUST NOT invent a
relationship type (subsidiary, member, franchise) that the contract does not store. It SHOULD show only the
immediate parent by default and MAY show the full chain on request. A parent can detach a child at any time.

## 5. Verification label

An optional label carries a readable passport ID and a QR locator. It is a convenience, not identity proof.
An issuer profile printed on packaging is not an independent trust source. Copying a valid label is possible.
A client SHOULD show issuer identity, integrity, revocation and individual statements separately.
It MUST NOT transform a concern count or first activation into a verdict about the physical object.

If a label is used, it MUST carry:

| Element | Rule |
|---|---|
| QR code | One of the payloads of §12 and CA-14.6, error correction level Q or higher |
| Passport ID | The full `ODP-…` identifier as readable text, so the passport stays checkable without the QR or a website |
| Protocol mark | `ODP` or `Object Digital Passport` |

A label MAY add the profile ID, title, author name, year, edition number, a logo, an NFC tag or a seal
number; none of these is a trust anchor. If a numbered seal is used, the label SHOULD overlap it so that
removing the label removes the seal. Size, shape, colour, material, typography, layout and manufacturer are
implementation decisions. Edition unit labels follow §20.7 and §22.14; a print-ready file follows CA-2.2.

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

A seal is optional. The identification minimum of a physical or mixed object is `photo`, `dimensions`,
`materials` and `distinguishing_features` (§8, §9); a seal anchor adds evidence on top of it. Digital objects
use no seal; the file hash is their binding. Seal anchors have no dedicated on-chain fields: they are bound by
`dataHash` and `anchorsHash` and visible as mask bits 256 (`nfc`) and 512 (`numbered_seal`).

### `numbered_seal` anchor

A printed-number seal (holographic sticker, wax or lead seal, tamper-evident label) gives a physical
reference, not cryptographic proof. `data` carries `number` (exactly as printed) and `type` (for example
`holographic sticker`), and MAY carry `color`, `size` and `notes`. A verifier shows the committed number for a
person to compare with the object; the check cannot be automated. The issuer chooses a seal that cannot be
removed without visible damage.

### `nfc` anchor (informative until NFC verification ships)

The data shape below appears in the conformance vectors, so its field names are fixed:
`uid` (7-byte chip UID, lower-case hex), `publicKey`, `model` (`NTAG424DNA` or `NTAG424DNA_TAGTAMPER`),
`installedAt` (ISO 8601 date) and optional `notes` (installation method and location). Generic Type 2 tags
such as NTAG 213 are not a conforming `nfc` anchor. For NTAG 424 DNA, `publicKey` holds a 16-byte AES
application key for EV2 mutual authentication (profile `odp-ntag424-ev2-symmetric-cr-v1`); the name is kept
for future asymmetric ICs. Consequences:

- It is a shared secret. Anyone who reads the published anchor can compute the tag's answers and program a
  second tag that answers identically. Publishing the bundle publishes the key; an issuer of a high-value
  object MUST be told that this is a per-passport security decision.
- It MUST be a non-master application key (`01h`–`04h`). Key `00h` authorizes `ChangeKey` for every key and
  MUST NOT be published.
- Before mint the issuer SHOULD confirm on the live tag the UID, that the key authenticates and, for
  TagTamper, that the tamper loop reads intact. The carrier written to the tag after mint is the `odp://` URI
  of §12, and its file SHOULD then be write-protected.

An NFC-capable verifier obtains the anchor, checks it against `dataHash` or `anchorsHash`, and runs
`AuthenticateEV2First` with that key. Success shows only that the chip holds the committed key. For
`NTAG424DNA_TAGTAMPER` a high-assurance result additionally requires an authenticated tamper state of intact
and a live UID equal to `data.uid`. `Read_Sig` shows manufacturer originality, not binding to a passport.
A web verifier cannot perform this check and MUST report it as unsupported (§11, CA-16.3). Other tag
technologies need their own specified model string and verification recipe before they can be claimed.

## 7. Networks and generations

There is no approved deployment produced by this change. Never substitute a 0.6 address or infer an address
from the version byte. The selected target is Polygon mainnet (chainId 137), with fixed registry/satellite addresses after a separately authorized deployment. Polygon Amoy is not used, neither as a preliminary deployment nor for testing (owner decision 2026-09-24). No deployment has been performed and no addresses exist; deployment requires its own explicit authorization. The current instruction prohibits wallet connection, public-network access, deployment and publication; a target network is not authorization.
Its deployment manifest MUST bind the generation identifier to chain ID, registry address, deployed runtime
hashes, ABI identities, deployment blocks and source/build identity. A generation identifier MUST NOT later
be reassigned to different addresses. Clients may embed the authenticated fixed manifest; an online mutable
generation directory is not required for this model. The current sources identify as 0.7-redesign-8;
this does not claim that the release is already deployed. Document version 0.7 alone does not identify an ABI.

Every issued .odpass MUST carry its generation and full contract addresses as specified in §15. An embedded
manifest is an identification artifact, not its own trust root: clients MUST authenticate the deployment
identity independently before reporting chain authenticity. A replacement satellite is a different namespace;
it cannot silently replace the one committed by an existing edition. Historical records and activation state
remain associated with their original addresses, regardless of later client software or hosting changes.

Profile IDs and passports belong to the generation that created them. A new generation does not carry them
over: the same wallet registers again and receives a different profile ID. Every verification path ends at a
read from this one chain; §15.3 states what remains possible without it.

### Superseded lines (informative)

Earlier lines are separate registries with incompatible ABIs; their records do not migrate and are not ODP
0.7 passports. They remain readable on Polygon PoS (chain ID 137), and a document issued under them still
verifies against their own on-chain hashes. They are listed only so that historical records can be read.
A 0.7 client MUST NOT use them for issuance, MUST NOT substitute them for a 0.7 address and, under CA-12.1,
does not report their records as verified 0.7 passports. The 0.7 audit findings were not rechecked against
these deployments.

| Line | Contract | Address |
|---|---|---|
| v0.6, deployed 2026-07-24, `CONTRACT_VERSION` 6 | `ObjectDigitalPassport` | `0x012aC6393464A73EC16131D701ff2e000695b91b` |
| | `ODPPassportLib` | `0xB7D7B8485eeb385c375ABd91035F5a6914171ccE` |
| | `ODPWalletDocumentAnchor` | `0x35df3773919D9F10e5F8838abaa453DE120e6Cb4` |
| | `ODPCounterfeitConcern` | `0x692935d6c1532b47cE0459bF1E9549991d0eD2C9` |
| | `ODPRegistryRelations` | `0x2ea6f05a050973afa14E61b1Ea19De92621e3661` |
| | `ODPPassportProofRegistry` | `0x990FCc2E587d9f2cDb9c73083E9f90793CeF7F49` |
| | `ODPExtensionMintRouter` | `0x3fa8f213399a2A9f7Da4bF7D8a9D7D42E8AEF822` |
| | `ODPAuthorAttestation` | `0x1972E68D0A5B19C5ee2af54F8b792c426985F7d7` |
| v0.5 and earlier | `ObjectDigitalPassport` | `0x413aEeBB2ac437483Bc68791EaAab492C2a4B346` |

Release notes of these lines are kept as written: [docs/RELEASE_v0.6.md](docs/RELEASE_v0.6.md),
[docs/V0.6.md](docs/V0.6.md).

## 8. Immutable on-chain record

Three mint entrypoints take the same `PassportMintInputs` plus a nonzero bytes32 operationId:

- `core`: year, month, title, authorName, shortDescription, domain, contentClass, lifecycleStatus,
  aiStatus, verificationMethod, editionModel.
- `dataHash`, `imageHash`, `previewHash`, `fileHash`, `anchorsHash`: bytes32; SHA-256 commitments supplied by the
  issuer. The tuple order is `core, dataHash, imageHash, previewHash, fileHash, anchorsHash, anchorTypesMask,
  editionCommitment`.
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

`previewHash` is the SHA-256 of the exact bytes of a lighter public copy of the primary photo (§9, §22.19),
a JPEG of at most 1,048,576 bytes without GPS or other location metadata. Zero means that no such copy exists.
A nonzero `previewHash` requires a nonzero `imageHash` (`EC(142)`) and MUST differ from it (`EC(143)`). The
contract checks only these two relations; it cannot check size, format, metadata or that the copy shows the
same picture. `previewHash` is immutable like the other hashes and is covered by the mint-operation digest (§3)
as part of `m`. `PassportMinted` is unchanged; readers obtain the value from `getPassportMedia`, whose
`PassportMediaView` places `previewHash` directly after `imageHash`.

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

The stored record adds to the mint inputs: `passportId`, `contractVersion` (7), `creator` (the issuing
wallet), `creatorId`, `objectType` (`physical`, `digital` or `mixed`, set by the entrypoint), `timestamp` (the
mint block time, the only proof of the registration moment), and `revoked`, `revokedAt`,
`revocationReasonHash` (zero until revocation). Block times are UTC; there is no stored time-zone field.
`lifecycleStatus` is the state at registration and never changes.

`getPassportHeader`, `getPassportClassification`, `getPassportMedia`, `getPassportReleaseState` are defined by `IODPRegistry.sol`.
Dynamic indexed strings in events are hashes; events also carry readable non-indexed IDs. No caller should
recover an ID by treating an indexed string topic as text.

## 9. Passport JSON

[schema/passport-0.7.schema.json](schema/passport-0.7.schema.json) defines the document shape. The canonical
hashed document ALWAYS has `passportId: null`; the assigned ID is in an external receipt (§15).
Card fields MUST match the normalized mint strings byte for byte. `status` is the state at registration.
`idGranularity` is `model`, `batch` or `item`; it is independent of edition size.
Canonical examples: [physical](schema/examples/0.7/physical.json), [physical with a public photo
copy](schema/examples/0.7/physical-preview.json), [digital](schema/examples/0.7/digital.json),
[mixed](schema/examples/0.7/mixed.json) and [edition](schema/examples/0.7/edition.json); their exact canonical
bytes and hashes are in `schema/vectors/`. The document follows the Object ID identification principle: object
type, materials and technique, measurements, inscriptions and markings, distinguishing features, title, subject,
date or period, maker and photographs are first-class fields and anchors, not an external mapping.

| Field | Required | Rule |
|---|---|---|
| `version` | yes | `"0.7"` |
| `passportId` | yes | `null` in the hashed document |
| `title`, `authorName`, `shortDescription`, `domain` | yes, yes, yes, no | Card fields, equal to the mint strings; `domain` MAY be empty |
| `description` | no | Full description, unbounded |
| `subject` | no | What is depicted or what the object is about |
| `creationDate` | no | Date or period of the object's creation, not the mint date |
| `objectYear` | no | Integer historical year when it differs from the mint `year` |
| `authorship` | no | `author` and optional `coAuthors` (each `name`, optional full `wallet` and `creatorId`) and `team`; declarations (CA-3) |
| `anchors` | yes | Identification anchors, below |
| `objectType` | yes | `physical`, `digital` or `mixed`, equal to the mint entrypoint |
| `status`, `contentClass`, `aiStatus`, `verificationMethod` | yes | Controlled values of §8 |
| `edition` | yes | `model` (§8 values), optional `number` ≤ `total` |
| `idGranularity` | yes | What the passport identifies |
| `translations` | no | Language-keyed `title`, `shortDescription`, `description`; the card stays in the original language |
| `year`, `month` | yes | UTC year and month of preparation, equal to the mint inputs |
| `registeredAt`, `registration` | yes | Preparation time, below |
| `refinementTags` | no | Free labels; not a replacement for the controlled values |
| `physical` | no; yes for `mixed` | Descriptive facts such as `category`, `medium`, `weight`. Identification facts belong in `anchors[]` |
| `digital` | yes for `digital` and `mixed` | `fileHash` (required), `subtype`, `format`, `fileSize`, optional `c2pa` |
| `additionalMetadata` | no | String-keyed string values not modelled elsewhere |

`physical.category` and `digital.subtype` are secondary descriptors; classification comes from `domain`,
`objectType`, `status`, `contentClass` and `refinementTags`. A `mixed` passport MUST contain both `physical`
and `digital` blocks: it has a physical layer bound by its anchors and a digital layer bound by `fileHash`.
`mixed` is not a fallback for uncertain classification.

`contentClass` describes the content, not a file format: `static` fixed still output, `time_based` fixed
sequence over time, `spatial` 3D structure or geometry, `textual` symbolic content, `composite` structured
multi-file bundle, `executable` logic that runs and produces output.

`idGranularity` says what the record points at: `model` any unit of a design, `batch` one production run,
`item` one physical object. A verifier comparing an object with a `model` or `batch` passport matches the
class, not the individual, and MUST NOT present the result as identifying that specific object.

Pre-registration history (previous owners, exhibitions, publications) is not a structured part of this
standard; the protocol cannot check it. It MAY appear in `description` as issuer text. Optional fields and
`additionalMetadata` are issuer statements: a price or similar value is not an offer.

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

The lighter public copy of the primary photo (§8 `previewHash`) is described by at most one anchor
`{"type": "photo", "data": {"role": "preview"}, "hash": "sha256:<hex>"}`. It is allowed only when a `photo`
anchor with `data.role == "primary"` exists, and it is never a primary candidate. The anchor is present if and
only if `previewHash` is nonzero, and its hash MUST equal `previewHash`. It uses the existing photo bit; no mask
bit is added. The copy is derived from the primary photo but is a separate file with its own hash; the primary
photo and `imageHash` keep referring to the original bytes.

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

An anchor is `{"type", "data"?, "hash"?, "verification"?}`: `type` is required, `hash` is `sha256:` plus 64
lower-case hex digits of the committed bytes, and `verification` is free text or a profile ID saying how to
check it. Type-specific content:

| Type | Content |
|---|---|
| `photo` | `hash` of the image file (required); `data.role` `primary`, `preview` (§8) or another descriptive role such as `detail` |
| `dimensions` | `data.unit` and measures, below |
| `materials` | `data.list`, at least one non-empty material or technique |
| `distinguishing_features` | `data.text`: defects, craquelure, repairs, what a copy would not reproduce |
| `marks` | Signatures, stamps, serial numbers and where they are |
| `file_hash` | `hash` of the digital original (required), equal to `digital.fileHash` and on-chain `fileHash` |
| `perceptual_hash` | `data.algorithm` (for example `phash-dct-64`, `pdq`) and `data.value`; supplementary only |
| `c2pa` | `hash` of a C2PA manifest, optional `data.activeManifest`; supplementary only |
| `nfc`, `numbered_seal` | Seal data (§6) |
| `fingerprint` | Measurable object fingerprint: method, hash of the measurement, methodology reference |
| `dna` | Synthetic DNA tag or microdot marking |
| `unit_key_set`, `unit_variant_commit` | Edition commitments (§20); `B` only |
| `custom` or any other name | Outside the registry; a `custom` anchor SHOULD name its type in `data.customType` |

Supplementary anchors never satisfy the identification minimum, and neither do the edition anchors: an edition
passport still describes the run with photo, dimensions, materials and distinguishing features.

Dimensions carry a UN/CEFACT Recommendation 20 code in `data.unit` (`MMT` millimetre, `CMT` centimetre, `MTR`
metre, `INH` inch, `FOT` foot); every measure in the anchor uses it. Free text such as `"cm"` is not conforming.
Optional `upperTolerance` and `lowerTolerance`, in the same unit, state how far a measured object may exceed or
fall short of the figures and still match. Without them a verifier applies its own judgement and MUST NOT
treat a small discrepancy alone as a failed check. A client SHOULD display the unit in the reader's language
(`60 × 40 cm`, not `60 × 40 CMT`); the code is what the document carries.

If any card field, object type or UTC month in `passport.json` differs from the chain record, a verifier MUST
report the integrity check as failed, not as a warning (§11).

C2PA: when a file carries an embedded C2PA manifest, `fileHash` or `imageHash` over the unmodified bytes
covers content and manifest together. An issuer MAY also commit the manifest separately in
`digital.c2pa.manifestHash` or a `c2pa` anchor, so that a C2PA-capable verifier can show that provenance beside
ODP results. Presence of C2PA data SHOULD be determined by a C2PA parser, not by byte signatures; without it,
`digital.c2pa` is omitted. `verificationMethod: "c2pa"` is an issuer declaration (CA-16.3). ODP defines no
C2PA assertion of its own.

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

Two failures seen in practice: a serializer that escapes `/` (Foundation `JSONSerialization` writes `\/`) cannot
reproduce the hash of a title such as `Портрет 1/25`, and one that prints 17 significant digits renders `0.1` as
`0.10000000000000001`. Compare canonical bytes with the vectors before comparing hashes; a byte diff locates
the fault.

`fileHash`, `imageHash` and `previewHash` are the SHA-256 of the exact file bytes. Do not recompress, resize,
strip or otherwise modify a file before hashing it; the preview copy is a separate file with its own hash
(§22.19). In `passport.json` a hash is written `sha256:` plus lower-case hex; on chain it is the raw `bytes32`.
`anchorsHash` lets a verifier check the identification block alone, for example a compact payload delivered by
a low-bandwidth carrier, without the full document; `dataHash` still requires the whole canonical document.

## 11. Verification algorithm

1. Select an approved generation using chain, registry and ABI/runtime pins; never passportId alone.
2. Read the immutable card/classification/media. A missing record, unavailable chain and revoked record
   are different results. Read a consistent block, handle reorgs/finality, and display observation time.
3. Parse/validate/canonicalize the document. Check dataHash, anchorsHash, mask, all card fields, object type,
   UTC month and numeric classifications. Check `previewHash` against the preview anchor (§9); they are either both
   absent or both present and equal. Check original file bytes where available. Report missing files.
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

### Checks against the object

Chain and hash checks establish what was registered. Whether the object in front of the reader is the one
described is a human comparison, and a client MUST ask for it (CA-16.2):

- Physical anchors: compare photos, measured dimensions (within declared tolerances), materials, marks and
  distinguishing features with the object. This is the core check for an object without a seal.
- Numbered seal: compare the committed number with the seal on the object (§6).
- Digital original: hash the file the reader holds and compare with `fileHash`; a match shows these are the
  registered bytes, a mismatch that they are not.
- Photos: a photo file matches when its SHA-256 equals `imageHash`, `previewHash` or its anchor hash. A zero
  `imageHash` means no primary photo was committed (possible only for digital objects).
- NFC seal: only in an NFC-capable verifier (§6); otherwise `unsupported`.

On-chain `creator`, `creatorId` and hashes show which wallet registered which bytes under which generation.
They are not copyright, moral rights or title to an object (§16).

### Creator wallet proof (optional, off-chain)

An issuer MAY prove control of the issuing wallet without a transaction by signing, with EIP-191
`personal_sign`, the UTF-8 text:

```
Object Digital Passport — creator wallet proof (EIP-191) v1

passportId: <Passport ID>
chainId: <decimal chain ID>
contract: <registry address>
nonce: <random unique string>
```

The verifier recovers the address, compares it with `creator` from `getPassportHeader`, and checks that
`passportId`, `chainId` and `contract` match what it is verifying and that the nonce is fresh. A match proves
key control, not authorship. For an issuer registered to a contract wallet such as a Safe, the verifier MUST
instead call `isValidSignature(bytes32 hash, bytes signature)` (ERC-1271) on `creator`, with `hash` the same
EIP-191 message hash, and accept only the return value `0x1626ba7e`. The answer reflects the wallet's current
owners and threshold at the block read, not those at mint time; the verifier MUST record that block. It is a request to the issuer; a verifier MUST NOT ask the
person checking a passport to sign anything (CA-12.4).

### Wallet document anchor

`ODPWalletDocumentAnchor.attestExternalDocument(documentHash, documentUri)` lets any registered profile commit
the SHA-256 of any file (for example a contract PDF) once per `(wallet, documentHash)`, with an optional URI of
at most 512 bytes (`EC(50)` zero hash, `EC(51)` long URI, `EC(52)` repeat). `getExternalDocumentAttestation(wallet,
documentHash)` returns `(attested, creatorId, timestamp, documentUri)`. `ExternalDocumentAttested` indexes
`documentHash`, so a verifier can find attestations of a locally computed hash in the logs. A match means that
wallet recorded that hash at that time; it is not a qualified electronic signature. A document about a specific
passport belongs in an institutional proof (§4) or a journal statement (§13).

## 12. Locators and QR

`odp://ODP-YYYY-MM-NNNNNNNNN` is the preferred QR payload. An issuer MAY instead print its own `https://` link that
carries the same ID in exactly one `odp` query parameter (§22.14). Either way the generation context is the single
embedded deployment (§22.12); the link's website is never a verification authority.
A resolver MUST NOT silently select a registry when several match. The portable receipt explicitly carries
`chainId`, `registry`, `passportId`, transaction hash and block number. HTTPS resolvers are optional carriers
and not authorities. A QR can be photocopied; possession of the locator gives no record rights.
Unit labels additionally carry the edition index and sufficient generation/satellite context (§20).
Never put the concealed activation code in a public QR, URL query, analytics log or public address list.

The `odp` scheme has one unencoded authority token: a Passport ID (§2), for example
`odp://ODP-2026-03-004829301`, or a Profile ID (§3), for example `odp://P-482-930-174-005`. A client tells
them apart by prefix (`ODP-` versus `C-`, `B-`, `P-`, `M-`). Other paths and query keys are reserved, except the
unit-label form still to be fixed (§22.14); implementations MUST NOT rely on them. A printed QR uses UTF-8 and
error correction level Q or higher. The `odp` URI names a record; resolving it always uses the embedded
generation (§22.12). There is no on-chain index from a file hash to a passport; such a lookup needs an off-chain
indexer and is not part of conformance.

## 13. SDK and satellite requirements

Use the compiled ABI for `0.7-redesign-8`, not an earlier redesign or the historical version-byte-only ABI. Build mint inputs from
the same canonical document that will be distributed. Independently decode receipts and verify them.
Page reads are capped at100 and tolerate arbitrary offset/limit without overflow. Zero limit gives an empty
page and total. Unbounded core/proof/concern list reads are absent. The affiliation full list is bounded100.

Principal reads, all without a transaction:

| Contract | Reads |
|---|---|
| Core | `getCreator(creatorId)`, `getCreatorByWallet(wallet)`, `passportExists(id)`, `getPassportHeader`, `getPassportClassification`, `getPassportMedia`, `getPassportReleaseState`, `getMintOperation(issuer, operationId)`, `getPassportsByCreatorPaged(wallet, offset, limit)`, `CONTRACT_VERSION` |
| `ODPPassportProofRegistry` | `getProof`, `getProofsForPassportPaged`, `getProofsByInstitutionPaged`, `proofWithdrawnAt`, `proofWithdrawalReason`, `proofOperations` |
| `ODPPassportConcerns` | `getConcern(passportId, raisedBy)`, `activeConcernCount`, `getConcernRaisersPaged`, `getConcernsByRaiserPaged` |
| `ODPStatementJournal` | `getStatement`, `getStatementsForPassportPaged`, `getStatementsByAuthorPaged`, `statementOperations` |
| `ODPAuthorAttestation` | `getAuthorAttestation`, `authorWithdrawalAt`, `authorWithdrawalReason`, `hashAuthorAttestation`, `domainSeparator` |
| `ODPHosting` | `getLocations`, `getPublishingDelegation` |
| `ODPProfileDirectory` | `getDomain` |
| `ODPRegistryRelations` | `getAffiliatedParent`, `getAffiliatedChildrenPaged`, `getAffiliationAudit`, `isAffiliationPending` |
| `ODPWalletDocumentAnchor` | `getExternalDocumentAttestation` |
| `ODPEditionUnits` | `getEdition`, `getActivation`, `isActivated`, `commitmentFor`, `editionPassportByNonce`, `unitLeaf`, `labelPayloadHash`, `activationPayloadHash` |

The exact signatures are those of the compiled ABI; this table is a guide, not a replacement for it.

### Hosting

`ODPHosting` stores mutable data/image locations up to512 bytes each. Only the original issuer or its own
unexpired publishing agent may update. Expiry is exclusive (`now < expiresAt`). Publishing grants do not grant mint authority; issuers can revoke them, at any time. URLs can be cleared and can be
updated for a revoked passport to keep explanations accessible, without changing issuer rights. Hashes never change.
A new hosting satellite does not have authority over old hashes. Treat URLs as untrusted transport input.
The contract does not parse the strings. By convention (§22.19, CA-19.6) each field MAY hold several
`ipfs://`, `ar://` or `https://` addresses of the same bytes, separated by single spaces, within the 512-byte limit.

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
The satellite reads `dataHash` and `creatorId` from the core rather than from calldata, so a signature cannot
be pointed at other bytes. The attestation is optional: its absence is not a negative signal.
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
Derive major as `CONTRACT_VERSION >> 4` and minor as `CONTRACT_VERSION & 0x0f`; the core exposes no separate
getters for them or for the mint caps of §3. Satellites that record a version byte (§4) MUST report the same
byte as the core they are pinned to. Every `passport.json` carries `version`; a breaking change to the document
shape changes it. The stable line will be 1.0, which will define any migration or dual reading explicitly.
Profile type prefixes change only through a specification update (§3).

## 15. `.odpass` bundle

### 15.1 Format

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

### 15.2 Verification rules

A receipt MUST contain matching `generationId`, `chainId`, `registry`, assigned `passportId`, the successful nonzero `operationId`, `transactionHash`,
`blockNumber` and `blockHash`, with `format: "odp-bundle-receipt-0.7"`. Readers MUST reject conflicting identities between receipt, generation manifest, selected
chain record and any hash-bound satellite references such as `unit_key_set.data.satellite`. They MUST NOT
repair conflicts by substituting their current default contracts. Unknown generation/ABI means unsupported
or unauthenticated, not permission to guess. A copied manifest or receipt alone is not proof of chain state.

The full original photo/files MUST be available within a complete bundle; reading that local bundle does not
require fetching a separate photo URL. When `previewHash` is nonzero, the lighter public copy (§9) is a required
payload as well, so a complete bundle holds both the original primary photo and its copy. Mirrors may distribute the same document/files or a repackaged bundle,
but MUST NOT change the committed content. Receipt, generation manifest, external transport locations and ZIP
metadata are outside dataHash; every field inside passport.json remains subject to canonical hashing (§10).

`manifest.json` uses `format: "odp-bundle-manifest-0.7"` and lists payload paths, SHA-256 hashes and byte
lengths. Payload path is `files/` followed by its 64 lowercase SHA-256 hex digits. Readers MUST validate
file bytes and required payload completeness independently of the editable manifest.
Required payloads follow from `passport.json`, never from a manifest flag: the file of every `photo` and
`file_hash` anchor, `digital.fileHash` and, for an edition, the address list named by
`unit_key_set.data.addressListHash`. The address list is public and secret-free; it MUST travel in the
edition's `.odpass`, because without it no verifier can rebuild the tree and no unit can be activated.
`addressListUrl` is a mirror, never the source of truth.

Harden archive extraction against traversal, duplicate paths and oversized payloads. Machine-readable
service-file schemas are supplied in schema/bundle-0.7. `chain/tools/bundle.mjs` implements validation of
already extracted entries: strict JSON, canonical passport, cross-file identity, role/address completeness,
payload hashes/lengths and required originals, full edition address-list tree, and optional exact comparison
with an independently trusted generation manifest. It does not parse ZIP or authenticate chain evidence.
The safe ZIP importer/exporter and client integration remain required before claiming complete bundle conformance.
Storage, publication and retrieval follow §22.19; the format does not mandate a hosting service or provider.

### 15.3 Trust model and limitations

A bundle is untrusted input and is treated as data only (CA-13). It does not replace chain state: verification
rests on the on-chain commitments. Every path ends at a read from one chain, and this is stated here rather
than left for an implementer to discover.

With no chain access a verifier can still open the bundle and check its structure, recompute the hashes of
`passport.json`, its anchors and every payload, and check them against each other, that is, confirm that the
bundle is internally consistent. It can show those hashes for comparison with a value obtained elsewhere, or
compare them with chain data it authenticated earlier (§19). It cannot establish that the document was
registered, by whom or when, or whether the passport was later revoked or finalized for print. A forger can
build an internally consistent bundle. Such a result MUST be shown as unconfirmed, with the time of any cached
chain data (CA-11.4, CA-17.1), and MUST NOT be worded so that it reads as a positive verdict (CA-16.1).

A verifier MUST NOT depend on a single RPC endpoint. It MUST be able to try more than one and SHOULD let the
user supply their own; a self-hosted node depends on nobody. "Could not reach the registry" is an ordinary
event and MUST NOT be shown as "invalid" or as "not an ODP passport". If Polygon PoS itself stopped, records
would remain in its history but live verification would stop for everyone; this line has no fallback anchor.

## 16. Limits and external statements

The protocol does not adjudicate provenance, intellectual property, authenticity, ownership, or disputes.
Issuer corrections after the applicable window or print finalization can be published through the journal (§13), committing an external payload
with explicit original/new passport references, or distributed off-chain. Independent P/M proof documents
can add assessments. The core has no general issuer-event history API or on-chain replacement pointer;
the journal provides its own history and never changes core content or extends the revocation window.
Public data is permanent: clients SHOULD avoid personal information that should later be erased.

This specification also does not define: who stores or hosts `.odpass` files and originals (§16.1, §22.19);
the visual design of clients and labels (§5); pricing, sales or marketplace mechanics; networks other than
the single deployment of §22.12; human-readable names for profiles; which seal product to use (§6); or C2PA
integration beyond hash commitments (§9).

### 16.1 Durable hosting (normative SHOULD)

Not choosing a host is not the same as having no view on how. An issuer or holder that publishes
`passport.json`, the photo copy or an `.odpass` SHOULD use locations that are:

- content-addressed or otherwise integrity-bound, so the bytes at an address cannot silently change (an IPFS
  CID derived from the committed hash, CA-19.5, or an Arweave transaction);
- independent of any single operator's goodwill, including the issuer's own domain, which will lapse;
- retrievable without an account, key or paid plan, through more than one route (CA-19.6, CA-19.7).

A personal file-sharing link meets none of these. When every online copy is gone, the on-chain card (title,
author name, short description, domain), the classification and the hashes remain readable. What is lost is the
identification evidence in `anchors[]` and the originals, unless someone holds the `.odpass`. That is a
degradation, not a revocation, and a client MUST present it as such (CA-9.1, CA-19.7).

## 17. Wallet and key management

Keep real issuer/master keys outside public documents, logs, tests and the repository. An issuer who has lost their key
has no administrator recovery path. Separate author keys have only their explicitly assigned attestation role; mint delegation is absent. Compromise of an issuer can mint misleading descriptions and revoke its recent
passports within the role-specific window unless finalized for print. It cannot edit immutable older records. Permissionless registration enables impersonation
and Sybil flooding: independent identity and client filtering remain necessary.

The protocol requires only an Ethereum-compatible account that can send transactions; how its key is made
and kept is the holder's choice and responsibility. A key MUST be generated on the holder's own device or
hardware and MUST NOT be sent to ODP, a client vendor or any server; release clients hold no keys (CA-20.1).
An issuer SHOULD use a wallet dedicated to ODP, not one used for balances, trading or daily payments. Common
arrangements, all compatible: a software wallet backed by a seed phrase kept offline on paper in more than one
place; a hardware device, also backed by a seed phrase; seed-less hardware, which needs a second device bought
before registration because losing all devices loses the profile; and, for `B`, `P` and `M`, a multisig
account (CA-5.6, CA-5.7). No wallet brand is normative.

If an issuer loses its key: its profile ID and every passport it issued stay on chain and remain verifiable;
it can no longer mint, revoke within a window, finalize for print, open an edition, raise or withdraw its own
statements, or declare a domain under that profile. A new wallet is a new profile (CA-1.4).

## 18. Interoperability

Hashes, full IDs, generation context and algorithm versions are required at integration boundaries.
All original data and historical addresses must remain exportable. Public statements may be independently
indexed, but an indexer omission is not evidence of absence. The core supports Ethereum-style ABI readers;
client SDKs, NFC hardware, DID methods and legal attestations require their own conformance work.

ODP is meant as a verifiable registry beside, not instead of, regulatory Digital Product Passports, GS1
identifiers, IIIF manifests, C2PA content credentials and institutional catalogues.

### 18.0 Position relative to the EU DPP (ESPR)

The regulatory DPP is the one established by Regulation (EU) 2024/1781 (Ecodesign for Sustainable Products
Regulation, ESPR), Chapter III. An ODP passport is not an ESPR DPP. It is no conformity route, product-group
delegated acts do not apply to it, it has no unique identifier registered with the Commission, it is not
connected to the DPP registry (Art. 13) or the web portal (Art. 14), and it makes no claim about the
sustainability information ESPR requires. Nothing here helps an economic operator meet an ESPR obligation, and
an implementation MUST NOT present an ODP passport as satisfying one.

Two points of Art. 11 describe properties ODP happens to share, and the overlap stops there:

- Art. 11(e), availability after insolvency, liquidation or cessation of activity: the on-chain record needs
  no operator (§1, §7). Off-chain copies do not survive on their own (§16.1).
- Art. 11(g), authentication, reliability and integrity of the data: this is what `dataHash`, `anchorsHash`
  and the card check provide (§10, §11).

ESPR expects service providers and a registry; ODP deliberately has neither. That is a difference in kind.

### 18.1 Optional `passport.json` content

Issuers MAY add namespaces such as `sustainability`, `compliance`, `identifiers.gtin` (a GS1 GTIN) or
`iiif.manifest`, or string values in `additionalMetadata`. Everything inside `passport.json` is part of
`dataHash` (§10) and is an issuer statement: the protocol checks that the bytes are unchanged, not that the
content is true. A GTIN or other identifier does not prove authenticity and does not replace the passport ID.
A GS1 Digital Link or other URL is not an ODP label (§22.14). Additional photos are further `photo` anchors.

### 18.2 The `did:odp` naming convention (informative)

`odp` is not a registered DID method. There is no method specification, no resolver and no entry in the W3C
DID Specification Registries. A `did:odp:…` string is a naming convention for documents produced by this
project, nothing more. Software that requires a resolvable DID (a Verifiable Credentials issuer or verifier, a
wallet, a profile that mandates `did:web` or `did:webvh`) cannot consume it, and an implementation MUST NOT
present ODP as offering DID support. Within that limit, tooling MAY use `did:odp:passport:<Passport ID>` and
`did:odp:profile:<Profile ID>` and MAY export a DID-document-shaped JSON built from public chain data at any
time, without a transaction. Such a file asserts nothing the chain record does not. Only the `odp://` scheme
(§12) carries protocol meaning.

### 18.3 Verifiable Credentials

Institutional proofs and journal statements MAY be mapped to credential-style claims in wallets or catalogues.
The on-chain records and their lifecycle (§4, §13) remain what a verifier checks.

## 19. Availability and client policy

Offline integrity verification uses locally held bytes and previously authenticated chain data. Fresh chain
status needs a node/RPC and finality policy. Institutions, domain registries, hosting providers, label printers
and relayers are separate trust surfaces. Relayers cannot forge a unit signature, but can delay/censor submission,
observe a submitted activation or consume its one-shot record earlier than another courier. Submission time is
not acquisition time. A paid relay is optional: any caller can submit a valid signed activation.

Storage networks, pinning and upload services, gateways and sponsors are replaceable conveniences, not trust
sources. The owner's `.odpass` is the primary copy; a published file is accepted only when its bytes match the
committed hash, whatever route delivered them (CA-14.4). A client MUST NOT depend on one gateway or one service,
and the loss of every online copy MUST NOT be reported as a change of the chain record (§22.19). A gas sponsor
can stop funding a wallet but cannot act for it (§22.20).

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

An edition passport carries exactly one `unit_key_set` anchor and at most one `unit_variant_commit` anchor.
When `edition.total` is present it MUST equal `unitCount`. Its identification anchors describe the run, not any
one unit. Only `B` may issue editions because the mechanism needs a controlled key process and secure printing,
and because a mis-issued edition cannot be corrected unit by unit.

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
It travels in the edition's `.odpass` (§15). The whole set costs one 32-byte root on chain, whatever its size.

Indexes MUST be assigned independently of cartons, regions, distribution batches and release waves, for
example by shuffling at labelling time. Activations are public, so indexes that follow packing order would let
anyone read regional sell-through from the chain.

Rebuilding the root from the published list checks the edition: that the list is the one committed at mint,
including against replacement by the issuer. It says nothing about the unit in front of the reader, because
every index below `unitCount` is in the tree by construction. A verifier MUST NOT present a successful
membership check as evidence that a particular object is genuine.

### 20.4 Optional variant commitment

A concealed variant can use a separate Merkle root over
SHA256(index4 || byteLength(variant)2 || NFC_UTF8(variant) || randomSalt32), using the same tree rules.
Salt remains inside the package, not the public document. No on-chain variant evaluation is implemented.
The variant unitCount MUST agree with the edition total (if present) and its unit_key_set count (if present).
A reader checks the disclosed variant/proof against its separate hash-bound anchor. Distinct root domains and
leaf formats MUST NOT be interchanged.

Each `randomSalt32` comes from a CSPRNG and is unique per unit. It MUST NOT be derivable from the unit key,
the index or anything readable without opening the sealed package: variant vocabularies are small, so whoever
holds the salt can test every candidate, and a salt derived from the outer code would let a reseller learn the
contents by scratching the label. The salt MUST be carried inside the sealed package, for example on an
enclosed card; the issuer MUST NOT publish it before the unit is opened and MAY keep copies as an optional
recovery path, never as a dependency. The length prefix and fixed salt size make the commitment open to one
variant only; a substituted salt card fails to verify rather than proving another variant.

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
The alphabet and checksum are global and MUST NOT be localized. The code length is a security parameter: an
attacker can test guesses offline against the public list and needs any valid unit, not a particular one, so
an implementation MUST NOT shorten the code for usability.

### 20.7 Outer labels

Optional label signature uses personal_sign over the32-byte keccak256 of
`ASCII("ODP-UNIT-LABEL-v1") || chainId32 || satellite20 || UTF8(passportId) || index4 || merkleRoot32`.
The expected labelSigner is the one committed before mint and registered at open; zero means plain labels.
Readers can verify labels offline with an authenticated edition bundle. A genuine signature can be copied.
It proves only that the specified key signed that label, not that the attached object matches the description.
Signing prevents fabricated labels, not copied ones. A verifier MUST NOT downgrade an edition with plain labels.

The outer carrier, readable before purchase, MUST make the edition passport ID and the unit index recoverable,
and MUST also print both as readable text, so a unit stays checkable when a symbol is damaged or its encoding
changes. It MUST NOT carry the unit code or anything derived from it. The concealed code has its own printed
form under the concealment layer; its symbol format is being fixed with print tests (`review/qr-07`). The label
MUST be applied so that removing or moving it is visibly destructive, for example across a package seam; this
is the only physical binding in the mechanism, and no cryptographic property replaces it.

### 20.8–20.9 Activation

Unit key signs personal_sign over keccak256 of
`ASCII("ODP-UNIT-ACTIVATE-v1") || chainId32 || satellite20 || UTF8(passportId) || index4`.
Any courier may call `activate(id,index,proof,signature)`. Low-s ECDSA and valid-v are required; index must be
in range, root proof valid, and slot unused. First valid submission stores unitAddress and block timestamp.
Duplicate attempts revert. This is not replay-proof physical ownership: leaked/cloned keys permit early use.
Because a duplicate reverts rather than succeeding as a no-op, a courier's dry run rejects it before any fee is
spent. The signature binds chain, satellite, edition and index, so it is valid for one slot only. A signature
MAY be produced offline and submitted later from any device, by anyone. An activation carries no verdict: an
earlier activation can mean a cloned code or a legitimate resale, and the protocol cannot tell which. A
verifier reports the facts (index, unit address, block time) and MUST NOT rank or label them as counterfeit or
stolen; no concern is raised automatically (§13).

No ODP-operated service, repository or maintainer may hold a master seed, a share of it or a unit key for any
edition. The reference tools derive keys offline and store nothing. A `P` or `M` profile MAY witness the key
process by submitting an ordinary institutional proof (§4) on the edition passport.

### 20.10–20.13 Lifecycle and removal of unit passports

There is no unit-passport mint or transfer. Edition activation remains possible for an already opened nonrevoked edition. Passport revocation blocks new activations but preserves recorded ones.
First activation does not close the B issuer 24h revocation window. Only expiry or explicit print finalization closes revocation. Display activation, revocation and print finalization independently.
Readers must retain the pinned satellite even after client defaults change. No satellite can write to the core.
A later issuer correction (§13) that points to a new edition is prose about the run. It MUST NOT be turned into
a machine-readable "superseded" or "invalid" state for the earlier edition: its units keep their committed keys
and verify as before.

### 20.14 Stated limits

A client and its marketing MUST NOT claim assurances the mechanism does not give. In particular:

1. The issuer knows every unit key when it generates them and can activate units itself; no outside party can
   verify that the master seed was destroyed.
2. The print vendor necessarily sees the codes; this is controlled physically, not cryptographically.
3. Anyone who knows the codes can activate units they do not hold, including an insider before shipping.
   Every activation has a public time; judging whether it is plausible is left to people, and an issuer can
   explain a poisoned run with a correction statement (§13).
4. Before its concealment layer is removed, a sealed counterfeit carrying a copied code looks the same as the
   real unit; the activation state is the only pre-purchase signal.
5. A unit key binds the package, not the object inside it; a variant commitment (§20.4) binds only the variant.
6. The activation log is public commercial data: with the on-chain `unitCount` anyone can reconstruct run size
   and sell-through over time. An issuer MUST be told this before it opens an edition. Index shuffling (§20.3)
   limits the leak to totals.

## 21. Pre-release validation boundaries (ABI 0.7-redesign-8)

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

The following is a focused integration table for ABI `0.7-redesign-8`, not an exhaustive list of Solidity
errors. Decode against the selected contract ABI in `chain/abi/`; the same EC number can have
context-specific uses. The earlier `0.7-redesign-7` line had no `previewHash` and emitted neither `EC(142)` nor
`EC(143)`. The `0.7-redesign-6` line before it emitted neither `PassportPrintFinalized` nor the
non-unique-edition rejection below, and used a single 72-hour window for every profile type.

| Call / condition | Result in `0.7-redesign-8` |
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
| Mint with nonzero `previewHash` and zero `imageHash` | `EC(142)` |
| Mint with nonzero `previewHash` equal to `imageHash` | `EC(143)` |
| New mint/proof in a different UTC month | `EC(68)` (committed operation lookup precedes this check) |
| Replacement of own terminal statement | `StatementNotActive()` |
| Wrong edition disclosure / reused issuer nonce | `EditionCommitmentMismatch()` / `EditionNonceAlreadyUsed(string passportId)` |
| Historical profile-stop error `EC(131)` | Not emitted by any production contract in this generation; no stopped-profile state exists |

### 21.2 Deployment evidence boundary

The ten-contract roster is the core plus concerns, hosting, profile directory, institutional proofs,
author attestation, wallet document anchor, relations, edition units and statement journal.
A release bundle pins complete compiler input/output and exact ABI/creation/runtime/immutable bindings.
The existing bundles describe earlier sources: `0.7-redesign-6` (sealed audit package) and `0.7-redesign-7`
(`review/v07-abi7-release/`, hash approved by the owner on 2026-09-21). Neither matches `0.7-redesign-8`.
Until a bundle is built and approved for the current sources, no pinned release corresponds to this
specification, and the procedure below is unexecutable. No deployment has been performed; approving a bundle
does not authorize one.
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
- CA-5.8. Mint and `submitProof` succeed only in the UTC month named in their inputs (§2, `EC(68)`). For a Safe
  proposal of either, the client MUST show the execution deadline (00:00 UTC on the first day of the next
  month, also in local time) and MUST warn when the proposal is created less than 24 hours before that deadline, because the
  last co-signer may sign too late.
- CA-5.9. A pending mint or `submitProof` proposal whose UTC month has passed MUST be shown as unexecutable,
  not as pending (this narrows CA-5.6). With `safeTxGas = 0` and `gasPrice = 0`, Safe v1.4.1 reverts the whole
  transaction (`GS013`) and does not consume the Safe nonce, so the stale proposal blocks every later proposal
  of that Safe. The client MUST offer a rejection transaction with the same Safe nonce and a re-preparation of
  the job for the new month under the same `operationId`. Before reuse, it MUST confirm through
  `getMintOperation` or `proofOperations` that the operation is not committed; the reverted proposal reserved
  nothing (§3). Re-preparation changes hashed bytes (§2) and needs a new confirmation by the co-signers (CA-5.2).
- CA-5.10. A Safe revocation proposal can execute only inside the role's window (§8; 24 hours for B/P/M). The
  client MUST show the window's end on the proposal and warn that slow co-signers can miss it. After the end the
  proposal MUST be shown as unexecutable (`EC(132)`), with the rejection transaction of CA-5.9 offered to free
  the Safe nonce. When a Safe issuer mints, the client SHOULD remind it that co-signers must be reachable during
  the revocation window.

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
- CA-6.6. An unexecutable Safe proposal (CA-5.9, CA-5.10) is a stage of its own under CA-6.2, distinct from
  "result unknown" and from failure. The saved job MUST keep the Safe address, Safe nonce and proposal hash, so
  that the rejection transaction and any re-prepared job can be matched to the original proposal.

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
- CA-7.7. In addition to the encrypted `.odpsecret` file, the client MAY offer a paper backup of the master seed
  split into shares under SLIP-39 (for example 2-of-3) kept in separate places. The shares are an extra copy:
  they MUST NOT replace the `.odpsecret` file, and the client MUST NOT print or display a share together with
  the password of the file.
- CA-7.8. An issuer printing a large edition through an external printer SHOULD use a printer with
  security-printing management certified to ISO 14298 or an equivalent scheme, and SHOULD keep the printer's
  run records with the edition. This is an issuer recommendation; clients MUST NOT treat it as verified.

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
`https://<domain>/.well-known/odp.json` as a JSON object `{"odp": 1, "chainId": <number>, "registry": "0x…",
"profiles": [{"profileId": "…", "wallet": "0x…"}]}`. `odp` is the format version and MUST be `1`; an entry MAY
override `chainId`/`registry`. Each entry SHOULD carry `wallet`, the full 42-character address bound to the
profile (§3, public identity). A profile counts as published only when `profileId`, `chainId` and `registry` all
match the generation being verified; when `wallet` is present it MUST also equal `getCreator(profileId).wallet`
(case-insensitive), otherwise the entry does not count. The file is served
over HTTPS as `application/json` from the organization's own domain, not a shared hosting or social-network
domain; a static file at this reserved path (RFC 8615) is readable without a browser engine and writable only
by whoever controls the server. The endpoint is advisory: no mint, statement or verification result depends
on it, and a missing file invalidates nothing; it only leaves the identity unconfirmed.

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
  MUST be shown as "not an ODP passport / not verified", never as verified. This includes the superseded
  lines of §7.
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

An ODP QR has one of two forms. The preferred form is `odp://<passportId>` for a passport and, for an edition
unit, the edition passport ID with the unit index in the same `odp:` form (exact unit-label encoding to be fixed
with physical print tests, `review/qr-07`). The issuer link form is the issuer's own `https://` address that
carries the same identifier in an `odp` query parameter, for example
`https://issuer.example/p?odp=ODP-2026-09-123456789`: the system camera opens the issuer's website or app,
and an ODP scanner reads the identifier and verifies it without the website. GS1 Digital Link and other
`https://` payloads without a valid `odp` parameter are not ODP labels. A counterfeit label can still carry
any URL, including a look-alike domain with a genuine passport ID, and the phone's camera, not the ODP app,
reads it; passports also contain hosting and proof URLs that their publishers can change.

- CA-14.1. Clients SHOULD register the `odp` URL scheme so the system camera offers to open the app. For both
  forms the client MUST resolve the ID itself against the embedded registry (§22.12) and MUST NOT open any
  website to verify. A scanned `https://` QR that is not a valid issuer link (CA-14.6) MUST be treated as
  "not an ODP label".
- CA-14.2. The client MUST state that checking a passport never needs a seed phrase, password or wallet
  signature. Any signing request MUST be a separate explicit action with a decoded description.
- CA-14.3. External links MUST NOT open automatically; the exact destination host MUST be shown first.
  Custom schemes other than `odp:` MUST NOT be followed.
- CA-14.4. Hosted files MUST be fetched without cookies, referrer or user identifiers and with the limits of
  CA-13.2. A fetched file whose hash does not match the chain commitment MUST NOT be shown as authentic.
- CA-14.5. The concealed activation code MUST be entered only inside the app and MUST NOT appear in any URL,
  QR, log or analytics event (§12).
- CA-14.6. An issuer link is valid only if: the scheme is `https`; the URL has no user-info part; the query
  contains exactly one parameter whose name is exactly `odp`; and its percent-decoded value is exactly an
  identifier accepted in the `odp://` form (for a passport, the Passport ID format of §2, uppercase, with no
  spaces or other characters). Anything else, including `http`, a repeated `odp` parameter or an `odp`
  value in the fragment, MUST be rejected as "not an ODP label" with the reason shown. The path, the other
  parameters and the fragment MUST NOT influence verification.
- CA-14.7. The link host is context, not trust. The client MUST show the exact host (CA-10.3) and report
  separately from the verification result: "the link leads to the issuer's domain" only if the host equals,
  or is a subdomain of, a domain the issuer declared in `ODPProfileDirectory` whose `/.well-known/odp.json`
  lists this issuer profile for this generation (§22.10); otherwise "the link leads to <host>; the issuer
  published <domain>" or "the issuer published no domain". A mismatch MUST NOT change the passport's own
  checks, and a match MUST NOT be shown as proof that the object is genuine (§22.16).
- CA-14.8. Scanning an issuer link inside an ODP client MUST NOT open the issuer's website automatically;
  "open the issuer's site" is a separate action under CA-14.3. An issuer using this form SHOULD print the
  readable passport ID next to the QR, so the passport stays checkable if the website disappears. An issuer's
  website or app MAY show ODP data but MUST NOT be presented by ODP clients as a verification source.

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

### 22.18 Warnings before irreversible actions

ODP has no support desk that can undo an action. As with a crypto wallet, the client is the only place where
a person learns what cannot be taken back. Warnings are therefore required at a few fixed moments, not
everywhere, so that they are still read.

- CA-18.1. Before each of these actions the client MUST show a dedicated confirmation screen: profile
  registration, passport mint, print finalization, passport revocation and edition opening. The screen MUST
  say in plain words what cannot be undone, MUST NOT be dismissible by tapping outside it, and MUST require
  an explicit action whose control names the action (for example "Issue permanently"), not "OK". Nothing on
  it may be pre-selected in favour of continuing.
- CA-18.2. Registration: the screen MUST state that the profile type is permanent, that the profile is bound
  to this account forever, that ODP cannot recover, block or move it (CA-1.1), and that losing access to the
  account ends issuance under this profile ID.
- CA-18.3. Mint: the screen MUST list what becomes public permanently (CA-15.1), state that the on-chain card
  can never be edited, and show the role's revocation window with its exact end time (CA-2.1).
- CA-18.4. Print finalization: the screen MUST state that after it the passport can never be revoked, even if
  printing fails or the file is lost (CA-2.3).
- CA-18.5. Revocation: the screen MUST state that revocation cannot be undone, that the passport and its
  history stay readable, and that the reason hash becomes public.
- CA-18.6. Backup: the client holds no keys (§22.20), so it cannot check the wallet's backup. It MUST show a
  reminder on the profile screen and on every mint confirmation that recovery of the connected wallet is the
  user's own responsibility, until the user dismisses it for this profile. It MUST NOT claim that a backup is
  verified and MUST NOT ask for a seed phrase or any other secret (CA-1.2).
- CA-18.7. The warnings of CA-18.2–18.5 MUST NOT have a "do not show again" option. For a batch of passports
  prepared as one issuance job, the mint warning MAY be shown once per job. Other dialogs and promotional text
  MUST NOT imitate the style of these warnings.

### 22.19 Photo copy, storage and publication

The chain holds commitments, never files. The owner's `.odpass` is the primary copy of every file; each network
location is a replaceable convenience that is checked by hash. Publication is permanent in practice. Arweave data
cannot be deleted, and IPFS copies held by others cannot be recalled.

- CA-19.1. The issuance job MUST record whether the user wants the primary photo published. Only in that case
  does the client create the lighter public copy (§8, §9) and set `previewHash`; otherwise there is no copy and
  `previewHash` is zero. The choice is fixed at mint; a copy cannot be added to an existing passport.
- CA-19.2. The copy MUST be a JPEG of at most 1,048,576 bytes without GPS or other location metadata, and it
  MUST differ in bytes from the primary photo (`EC(143)`), even when the primary already meets these limits.
  The client SHOULD also remove device metadata. Before the user confirms publication, the client MUST show the
  copy itself, with its size and resolution, not the original; this is part of the disclosure of CA-15.1 and
  CA-18.3.
- CA-19.3. The copy is an ordinary payload `files/<sha256hex>` of the `.odpass`, listed in the manifest, so the
  bundle holds both the original and the copy (§15). The client MUST publish only the committed copy.
- CA-19.4. Without a copy the user MAY still publish the `.odpass`; readers then take the photo from the archive.
  Before that the client MUST show that the published archive contains the original photo and every other
  payload with their metadata (CA-15.1, CA-15.2).
- CA-19.5. The IPFS address of the copy is the CIDv1 derived from `previewHash` with codec raw (`0x55`),
  multihash sha2-256 (`0x12`, length 32) and one block, that is the bytes `0x01 0x55 0x12 0x20 || previewHash`
  in base32 lower case with the prefix `b`. The same derivation applies to any other committed file of at most 1,048,576
  bytes, including canonical `passport.json` by `dataHash`. A publisher that puts such a file on IPFS MUST
  publish it as a single raw block. A client SHOULD try this address before hosting URLs. That common IPFS tools
  produce the same CID for such files is derived from their published profiles and has not been tested; it MUST
  be confirmed by a test vector, including a file of exactly 1,048,576 bytes, before release.
- CA-19.6. `ODPHosting.dataUrl` and `imageUrl` MAY each hold several URIs of the same bytes, separated by single
  U+0020 spaces, within the 512-byte limit (§13). Recognized schemes are `ipfs`, `ar` and `https`; other entries
  are ignored (CA-14.3). Order is a hint, not trust. `imageUrl` addresses the copy; `dataUrl` addresses canonical
  `passport.json` or an `.odpass`, which the client tells apart by content.
- CA-19.7. Every route is untrusted. Fetched bytes are accepted only if their SHA-256 equals the committed hash
  (CA-14.4). The client MUST NOT depend on one gateway, pinning service or upload service; public gateways can
  close at short notice. It MUST try more than one source, SHOULD fetch IPFS content in verifiable form (raw
  block or CAR) and MUST let the user edit the gateway list. "No online copy found" MUST be reported as such,
  never as revocation or a change of the chain record.
- CA-19.8. The client SHOULD upload the copy and `passport.json` only after the mint is confirmed, so that a
  failed mint leaves no permanent orphan file.
- CA-19.9. The client MUST NOT sell storage, upload credits or publication, and MUST NOT hold a service key, a
  sponsor key or any other publishing secret. Publication is paid in one of three ways: (a) free, where an
  upload service accepts small files without charge (Turbo's free tier covers a typical `passport.json`, up to
  105 KiB per upload); (b) by the user from their own Polygon wallet through WalletConnect, for example by topping
  up Turbo with POL and signing each upload with `personal_sign`; (c) by a sponsor through a delegation held by
  the service, such as a Turbo Credit Share Approval, without giving the client any key. Before a payment the
  client MUST show the amount and state that it goes to the storage service, not to ODP, and MUST check the
  destination address against a value pinned in the client, not only against a service response.
- CA-19.10. Services are replaceable. A published file stays checkable by its hash after the service is gone, and
  service endpoints MUST be changeable by configuration or client update without a protocol change. Before a
  top-up the client SHOULD say that unused credits depend on that service.
- CA-19.11. Only the copy is published by default, and only after the consent of CA-19.2. The client MUST state
  that published bytes cannot be recalled (CA-15.4), that an upload signed by the user's wallet publicly links
  that address to the file, and that a sponsor's approval publicly links the sponsor to the user. These rules
  add to §22.15 and do not relax it.

### 22.20 Wallet connection and gas sponsorship

ODP runs no servers and no relayer in 0.7. A sponsor, such as a university or publisher, pays for gas only by
sending POL from its own wallet to the addresses of the people it supports.

- CA-20.1. A release client MUST NOT create, import or store wallet keys. It connects the user's wallet only
  through WalletConnect.
- CA-20.2. The contracts offer no gas payment on a user's behalf. The client MUST NOT present a sponsor as
  submitting or signing the user's transactions. Actions signed by the user and submitted by a relayer are
  deferred to a later generation and need their own audit.
- CA-20.3. The client MAY offer "Request POL". It sends to the sponsor's intake address, which the sponsor owns
  and operates, only the sponsor's address, the user's wallet address and a `personal_sign` signature by that
  wallet over a text naming the wallet address, the sponsor, chainId 137 and the time. The request carries no
  passport data and sends no transaction.
- CA-20.4. When no intake address is set or it cannot be reached, the client MUST open the system share sheet
  with the wallet address as text. There is no ODP fallback server.
- CA-20.5. Before the first request the client MUST state that the sponsor will see the wallet address and all
  its public actions, and that the sponsor gets no access to the wallet and can only stop funding it.
- CA-20.6. The client MUST show the POL balance and an approximate number of operations it covers, and MUST NOT
  make any action depend on sponsorship; the user can always fund the wallet themselves.

---

*Object Digital Passport is open source under the MIT License. Gaps and ambiguities in this specification are
reported as a [Standard gap issue](https://github.com/object-digital-passport/specifications/issues/new?template=standard_gap.md), in English.*
