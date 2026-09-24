# Object Digital Passport

### Specification v0.7 — DRAFT

*Author: Andrei Chernikov*

> An open standard for physical and digital object authentication
> via blockchain and human-readable identifiers.

## Languages and translations


|                            |                                                          |
| -------------------------- | -------------------------------------------------------- |
| 🇬🇧 **English**           | You are reading the normative specification (`SPEC.md`). |
| 🇷🇺 **Russian / Русский** | [docs/ru/SPEC.md](docs/ru/SPEC.md)       |


**We welcome specification translations in any language.** Add files under `docs/<language-code>/` (see the [docs/ru/](docs/ru/) layout — translations of the specification live with the specification, not with the reference website). Open a **[Pull Request](https://github.com/object-digital-passport/specifications/pulls)** or an **[Issue](https://github.com/object-digital-passport/specifications/issues)** — maintainers will review. Guidelines: **[CONTRIBUTING.md](docs/CONTRIBUTING.md)**. **Community discussion on GitHub (issues and PRs) is in English** so all participants can follow the same threads.

**Normative source:** English `SPEC.md` (this file) is the only normative specification in this repository. Translations are provided for convenience and can contain mistakes; treat them as **informational only**.

## Table of Contents

- [Languages and translations](#languages-and-translations)
- [IMPORTANT: 0.x deployments, the reference v0.7 line, and alignment toward v1](#important-0x-deployments-the-reference-v07-line-and-alignment-toward-v1)
- [1. Overview](#1-overview)
- [2. Passport ID](#2-passport-id)
- [3. Profile ID](#3-profile-id)
- [4. Proof Institution](#4-proof-institution)
- [5. Verification Label](#5-verification-label)
- [6. Physical Seal](#6-physical-seal)
- [7. Network](#7-network)
- [8. On-Chain Record](#8-on-chain-record)
- [9. Passport JSON](#9-passport-json)
- [10. Hashing](#10-hashing)
- [11. Verification Algorithm](#11-verification-algorithm)
- [12. QR Code and protocol URI schemes](#12-qr-code-and-protocol-uri-schemes)
- [13. SDK Requirements](#13-sdk-requirements)
- [14. Versioning](#14-versioning)
- [15. `.odpass` bundle (offline container)](#15-odpass-bundle-offline-container)
- [16. What this protocol does NOT define](#16-what-this-protocol-does-not-define)
- [17. Wallet & Key Management](#17-wallet--key-management)
- [18. Interop, positioning, and DID (informative)](#18-interop-positioning-and-did-informative)
- [19. URI scheme and optional resolvers (informative)](#19-uri-scheme-and-optional-resolvers-informative)
- [20. Edition passports and unit activation keys (v0.7 line, B profile only)](#20-edition-passports-and-unit-activation-keys-v07-line-b-profile-only)

## IMPORTANT: 0.x deployments, the reference v0.7 line, and alignment toward v1

This repository documents a **v0.X** protocol line. During **0.X**, contract rules may still change.

> **Where v0.7 stands (as of this revision).** Sections 1–19 describe the **v0.7**
> contract that ships in this repository — `SPEC_MAJOR.SPEC_MINOR` = 0.7, packed
> `CONTRACT_VERSION` = 7. **No v0.7 registry is deployed on any network.** The
> canonical addresses in §8 are the **v0.6** registry, which is what every client
> resolves against today and what every existing passport was minted under.
> Generations do not migrate: a passport registered under v0.6 stays under v0.6.
> Reading this specification tells you how to implement against the v0.7 contract;
> it does not tell you that a v0.7 registry exists, because none does.

In plain terms:

- A **deployment** means one specific contract address (**one registry instance**).
- Your `creatorId` and passport records belong to **that** deployment only.
- Launching another deployment — even for a newer 0.X line — does **not** move existing records; the same wallet may receive a **different** `creatorId` in the new registry.
- **This specification describes the reference v0.7 *branch*** in this repository (storage-model redesign — see `docs/ru/REQUIREMENTS_FIELDS_V0.6.md`): on-chain packed `**CONTRACT_VERSION` = 7** (EIP-170 split: linked `**ODPPassportLib`**, optional satellites — see §14). The 0.6 model stores an **immutable on-chain card** (`title`, `authorName`, `shortDescription`, `domain`), anchors the identification block via `**anchorsHash`** + `**anchorTypesMask`**, and replaces all overwritable current-state fields with **append-only passport events**. Other addresses = separate registries; pair **chain + contract + ABI** + `**CONTRACT_VERSION`**.

If your goal is **one wallet + one long-lived `creatorId`** as canonical storage across protocol generations, wait for stable **v1**, which may define migration or dual-read explicitly.

### Multi-contract architecture (normative summary)

The reference stack is intentionally split:

- `**ObjectDigitalPassport.sol`** — the **main registry** (passports, profiles, proofs, governance surface in the ABI).
- `**ODPPassportLib.sol`** — a **separately deployed, linked library** holding heavy **pure** validation / formatting logic so the registry contract stays under the **24 KiB EIP-170** creation limit (shared `**error EC`** with the registry).
- `**ODPWalletDocumentAnchor.sol`** (optional **satellite**) — **wallet-level** `attestExternalDocument` / `getExternalDocumentAttestation` moved out of the main registry bytecode (**EIP-170**); the satellite’s constructor takes the main registry address and reuses its creator registry for access control.
- `**ODPCounterfeitConcern.sol`** (optional **satellite**) — `**raiseCounterfeitConcern` / `clearCounterfeitConcern` / `getCounterfeitConcern`** for profiles `**P`** and `**M`** only; constructor pins one main registry; storage is **not** on the monolith so EIP-170 headroom is preserved.

Deploy **library first**, then **registry** (with linker metadata), then **document anchor** / **counterfeit satellite** if used — see repository deploy scripts.

### Forward alignment: reference line → stable v1 (design intent)

The **v0.7** reference implementation in this repository and this specification are written so that a future **stable v1** can define a clear **forward** path without pretending 0.x registries silently interoperate:

- On-chain records carry packed `**contractVersion`** at mint (`SPEC_MAJOR * 16 + SPEC_MINOR`, each **< 16**). **This branch’s reference mints byte `7`.** Older 0.x deployments at other addresses are **not** interchangeable; **peripheral** contracts (satellites) are wired by configuration.
- `**passportId`** (Passport ID string; legacy ABIs may use `**humanId`** for the same field), `**creatorId`**, and `**passport.json**` versioning rules aim to stay stable enough that **v1** can specify **migration or dual-read** (e.g. tooling that verifies old deployments alongside a v1 registry) rather than ad-hoc field drift.
- **v1** is not specified here; when it ships, it will define any **migration**, **bridging**, or **freeze** of v0.x registries explicitly. Until then, this paragraph states **engineering intent**, not a promise of in-place upgrade for any particular deployment.

### On-chain capabilities of the reference (v0.7)

The following describes the **reference stack in this repository (v0.7)**. At mint, `**CONTRACT_VERSION` = 7** (byte `**7`**). The `Passport` struct table in §8 is normative for this deployment line.

**Normative features** (same registry family; **v0.7** mints byte **7**):

- `**owner`** (starts as `creator`) and `**transferPassport`**; optional `**delegateCreatorPublishing`** / `**revokeCreatorPublishing**` (account-scoped publishing agent for `**updatePassportUrls**`)
- **Mint agent (delegated mint):** agent calls `**requestMintAgentRole(principalCreatorId)`**, principal calls `**confirmMintAgentRole(agent)`**; then `**mintDigital` / `mintPhysical` / `mint*ViaExtension**` accept trailing `**mintOnBehalfOfCreatorId**` (principal’s profile id, or `**""**` for self-mint). On-chain `**Passport.creator**` and `**owner**` are the principal wallet; `**Passport.mintAgent**` is `**address(0)**` if the principal minted, else the **delegate** wallet. Monthly mint caps (**C** / **B**) count against the **principal** wallet. Pending state: `**mintAgentDelegationPending(keccak256(abi.encodePacked(principalCreatorId, agent)))`**; active delegate: `**mintAgentForCreator(creatorId)`**. Lifecycle: `**MintAgentUpdate**` (`kind`: 0=request, 1=cancel, 2=activated, 3=removed). `**revokeMintAgentRole**` (principal), `**renounceMintAgentRole(principalCreatorId)**` (agent), `**cancelMintAgentRequest(principalCreatorId)**` (agent, pending only).
- `**revokePassport**` (creator or `**governance**` address) with `**revocationReasonHash**`
- **On-chain card** at mint: `**title`**, `**authorName`**, `**shortDescription`**, `**domain`** — immutable, no edit path (typo = revoke + re-mint), MUST equal the same `passport.json` fields byte-for-byte
- **Identification anchors**: on-chain `**anchorsHash`** (SHA-256 of the canonical `anchors` array in `passport.json`) + `**anchorTypesMask`** (bit set of anchor types, §9); one primary `**imageHash`** / `**imageUrl`** on-chain — additional photos are `photo` anchors inside `anchors[]`
- **Append-only events**: `**recordPassportEvent(passportId, kind, value, note, attachmentHash, attachmentUrl)`** (status / location / rights / condition / damage / restoration / custom) — replaces the v0.5 overwritable current-state setters and aux/NDPP commitment updaters
- **Affiliation audit**: `**getAffiliationAudit`**, `**detachAffiliation`** (active parent); timestamps for join / detach
- **Compact reverts**: failures use `**error EC(uint16 code)`** — decode against the deployed contract source (string messages were removed to save bytecode). The reference `**ObjectDigitalPassport`** is deployed **with a linked library** `**ODPPassportLib`** (shared `**error EC`**) so the registry creation bytecode stays within the 24 KiB (EIP-170) limit; deploy library first, then the registry (see repository deploy scripts). Local Hardhat tests may use `**allowUnlimitedContractSize`**; verify `**[ODP] EIP-170:`** output after compile before mainnet deploy.

**Counterfeit / institutional authenticity concern (v0.4):** `**ODPCounterfeitConcern`** (**satellite**) — not on the main registry bytecode. Semantics and `**NET.counterfeitConcern`** are in this SPEC and the v0.4 pointer **[`docs/V0.4.md`](docs/V0.4.md)** / **[`docs/ru/RELEASE_v0.4.md`](docs/ru/RELEASE_v0.4.md)**. `**P`** and `**M`** wallets may `**raiseCounterfeitConcern(passportId, reasonHash)`** (`reasonHash` must be non-zero); only the **same** `proverCreatorId` may `**clearCounterfeitConcern`**. `**getCounterfeitConcern`** returns `**(active, proverCreatorId, reasonHash, timestamp)**` (inactive → `active == false`, other fields zero/`""`). Verifiers and Passport UI SHOULD call the satellite when `**NET.counterfeitConcern**` is configured for the **same** main registry address.

> **Deployable v0.7 split-line note:** the deployable reference line in this repository keeps the **main registry** focused on creator records, the immutable passport core (card + hashes), minting, transfer, revocation, and append-only passport events. To stay within `EIP-170`, several optional surfaces are served by **paired satellites** instead of the main registry ABI:
> - `**ODPRegistryRelations`** — affiliation (`B` / `M` / `P`), mint-agent delegation, creator publishing delegation
> - `**ODPPassportProofRegistry`** — `**submitProof`** and proof reads. Like the main registry, it packs `**CONTRACT_VERSION` = 7** on this line; a satellite and the registry it is wired to **MUST** report the same packed byte.
> - `**ODPExtensionMintRouter`** — `**setMintExtension`** and `**mint*ViaExtension`**
> - optional `**ODPWalletDocumentAnchor`** and `**ODPCounterfeitConcern`**
>
> Integrators MUST NOT assume those methods exist on the deployable `**ObjectDigitalPassport`** ABI itself. They SHOULD route them to the configured satellite for the same registry address (`**NET.relations`**, `**NET.proofRegistry`**, etc.). The deployable split line also omits the convenience `**getRemainingMints()`** getter on the main registry.

**Type-definition governance with on-chain timelock** is not stored in the reference bytecode; operate governance (multisig / DAO) off-chain and document hashes in releases if needed.

**Portable bundle (normative extension):** `**.odpass`** (ZIP). **Reference verifiers and interoperability examples in this repository use `.odpass` only.** **Public `dataUrl` MUST serve a `.odpass` ZIP** — not raw `passport.json` (§9).

---

## 1. Overview

Object Digital Passport (ODP) is an open standard that allows anyone to register a
physical or digital object on a public blockchain and verify its authenticity — without
any centralized platform, subscription, or third-party dependency.

**Core principles:**

- **Open** — anyone can implement the protocol in any language or platform
- **Decentralized** — no single company controls the registry
- **Offline-capable, not offline-complete** — a bundle can be opened and checked against itself with no internet, but confirming that the document is the registered one needs the on-chain hash. What survives a lost connection, and what does not, is stated in §15.3
- **Free to read** — verification never costs anything
- **Minimal on-chain** — no images or large data stored on blockchain

**Positioning (informative):** ODP is not a complete answer to authenticity or compliance by itself. It is meant to **complement** manual expertise and parallel standards such as **DPP**, **GS1**, **IIIF**, and **C2PA** (see §18). A useful mental model is a **verifiable registry**: verification shows which deployment anchored which hashes, alongside checks on hosted or bundled files. **Spam and indexing noise** are only partially addressed (e.g. monthly mint caps, optional off-chain allowlists); expect further design work before a stable product line. **Visual design** of apps, labels, or marketing sites is **not** normatively specified here and may be discussed with the community toward stability.

### 1.1 Terminology

This specification uses the following terms in a precise sense:


| Term                             | Definition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Passport ID**                  | The `ODP-…` object identifier (§2). In `passport.json` use `**passportId`**. The reference `Passport` / `ProofRecord` structs and ABI use the Solidity field name `**passportId`** for that string (JSON-RPC, events). Older deployments or drafts may still show `**humanId**` in the ABI for the **same** value — pair **bytecode + ABI** to your registry.                                                                                                                                                                                                                                                                                                                                                                               |
| **Profile ID**                   | The issuer’s `C-…` / `B-…` / `P-…` / `M-…` identifier (§3). In `passport.json` it appears as `**creator.creatorId`**; on-chain event and function payloads use the string `**creatorId`**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Mint**, **minting**            | Submitting an Ethereum transaction that **creates** a new on-chain passport record via the contract’s `mintPhysical` or `mintDigital` (or equivalent). The contract assigns the **Passport ID**, records **hashes**, optional **URLs**, and seal metadata. The **reference implementation (v0.7)** charges **network fees only** (no separate ODP protocol fee on mint). Minting does **not** upload `passport.json` to the blockchain; if `dataUrl` is set, the creator **must** host the **§15 `.odpass`** ZIP there — **not** bare `passport.json` (see §8–§9). If `dataUrl` is empty, public web verification cannot fetch a bundle — only a holder of the canonical `**.odpass`** or **passport.json** bytes can verify against `dataHash`. |
| **Register (`registerCreator`)** | Submitting `registerCreator` (or equivalent) so the wallet receives a permanent **profile ID** before any mint or proof. **Reference (v0.7):** network fees only (no separate **REGISTER_FEE**).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Deployment**                   | One specific smart-contract instance at one address (one registry). Profile IDs and passport records are tied to that deployment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Passport**                     | The on-chain **Passport** record plus, when applicable, **passport.json** bytes matching `dataHash` (from a **§15 `.odpass`** at `dataUrl` when set — verifiers extract `passport.json` from the ZIP; see §9).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `**passport.json`**              | The normative off-chain JSON document (§9).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `**.odpass`** (ODP bundle)       | Normative **ZIP** file using the `.odpass` extension: portable offline container for a passport (§15). **Required** entries: `passport.json`, `manifest.json` (UX metadata, not a trust anchor); optional `originals/` paths for sidecar bytes. The bundle does **not** replace on-chain truth — verifiers still compare hashes to `**dataHash`** (and optional image/file hashes) from the registry. **Public `dataUrl` MUST serve this ZIP only** — not raw `passport.json` (§9). The same bytes may be passed offline as a file.                                                                                                                                                                                                              |
| `**dataUrl`**                    | Optional HTTPS URL where the **§15 `.odpass`** ZIP is served (**only** — bare `.json` at this URL is **not** allowed; §8–§9). May be empty on-chain; if empty, verifiers relying on HTTP **cannot** obtain the bundle unless the user provides it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Gas**                          | Native-token cost (POL on Polygon PoS) paid to the network for transaction execution. The **reference (v0.7)** has no additional ODP protocol fee on register/mint.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Verification**                 | The read-only process (§11) that retrieves on-chain data and, when `dataUrl` is set, fetches the `**.odpass`**, extracts `passport.json`, and checks consistency with `dataHash` and other fields. If `dataUrl` is empty, file-based verification still applies when the verifier has a `**.odpass`** or `passport.json`.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Edition Passport** *(v0.7)* | The single passport registering a **production run** as a whole, carrying a `unit_key_set` anchor (§20.2). Its identification anchors describe the run, not any one item. *Avoid:* "series passport", "batch passport", "master passport". |
| **Unit** *(v0.7)* | One physical item of an edition, identified by its **unit index** within that edition. A unit is not a passport and has no Passport ID unless a **Unit Passport** is minted for it. *Avoid:* "copy", "item", "box", "serial". |
| **Unit Key** *(v0.7)* | The keypair bound to one unit (§20.5). Its **seed** is the value printed under the tamper-evident layer; the public address is committed in the edition's Merkle root. *Avoid:* "claim code", "secret code", "the object's private key" — those name the carrier or overstate the scope. |
| **Activation** *(v0.7)* | The one-time public record that a given unit key was used for the first time (§20.9). It is **not** a mint, **not** a verification, and **not** a claim of ownership; it writes one record against an existing edition passport and carries no verdict about the unit. *Avoid:* "claim", "registration", "authentication". |
| **Unit Passport** *(v0.7)* | An ordinary passport minted for one individual unit, parented to its edition and proven by Merkle proof (§20.10). Always an ordinary **paid** mint, borne by the minter. *Avoid:* "child passport", "sub-passport", "free passport". |
| **Relayer** *(v0.7)* | Any party that carries someone else's signed activation to the chain. A courier: it gains no rights over the unit and needs no agreement with the issuer or with ODP. Who *pays* is the **sponsor** — an on-chain paymaster, not a server policy (§20.9). *Avoid:* "activation server", "gateway", "provider" — all imply a privileged role that does not exist. |
| **Revocation window** *(v0.7)* | The period in which an edition passport may still be revoked: before any unit of it has been activated (§20.13). It closes permanently for every caller, `governance` included. *Avoid:* "grace period", "recall window". |
| **Edition notice** *(v0.7)* | An append-only statement by the issuer that something is wrong with an edition — superseded, key set compromised, safety recall (`recordPassportEvent` kind 8). It destroys nothing and is never a verdict on an individual unit. *Avoid:* "recall", "revocation", "invalidation". |


---

## 2. Passport ID

Every registered object receives a globally unique Passport ID (human-readable `ODP-…` string).

> **Wire names:** in the reference contract, the struct field is `**passportId`** (`Passport`, `ProofRecord`, and function parameters such as `submitProof`). In `passport.json`, use `**passportId`**. *Passport ID* is the specification’s name for the same string. Legacy ABIs may use `**humanId`** for the identical field.

### Format

```
ODP-YYYY-MM-NNNNNNNNN
```


| Part        | Description                                                                                               | Example     |
| ----------- | --------------------------------------------------------------------------------------------------------- | ----------- |
| `ODP`       | Protocol prefix, fixed                                                                                    | `ODP`       |
| `YYYY`      | **UTC** calendar year of the **mint** transaction (`block.timestamp`), not an arbitrary “object era” year | `2026`      |
| `MM`        | **UTC** calendar month (01–12) of the **mint** transaction                                                | `03`        |
| `NNNNNNNNN` | 9-digit random number, unique within the year and month                                                   | `004829301` |


### Examples

```
ODP-2026-03-004829301   ← object registered in March 2026
ODP-2026-03-000193847   ← another object in the same month
ODP-2026-04-007392018   ← object registered in April 2026
ODP-2027-01-002048391   ← object registered in January 2027
```

The number does not indicate the order or total count of registered objects.
This is intentional.

### Generation algorithm

Reference `**ObjectDigitalPassport`** (v0.7) uses (Solidity `abi.encodePacked`):

```
key     = uint32(year) * 100 + uint32(month)
entropy = keccak256(block.timestamp, block.prevrandao, msg.sender, nonce, key, gasleft())
number  = uint32(uint256(entropy)) % 1_000_000_000   // 000000000–999999999
if number already taken for this year+month:
    nonce++, retry (bounded attempts)
passportId = "ODP-" + decimal(year) + "-" + two_digit(month) + "-" + zero_pad(number, 9)
```

**One billion** possible values per month. Uniqueness is guaranteed by the contract
through collision checking with bounded retries.

### Rules

- The number is generated by the contract — the creator does not choose it
- The number is unique within a year+month combination
- Two simultaneous mint transactions are ordered by the blockchain — duplicates are impossible
- Passport ID is immutable after minting
- Passport ID is the canonical identifier for all lookups

**UTC mint month (reference v0.4+):** On-chain, the `YYYY` and `MM` segments are **not** a free choice: the caller’s `year` and `month` arguments to `mintDigital` / `mintPhysical` (and extension mints) **must** match the **Gregorian UTC** calendar month of `block.timestamp`. The same rule applies to `submitProof` for the `PRF-YYYY-MM-…` prefix. This guarantees the human-readable prefix tracks **when the transaction was mined in UTC**, not a historical creation date of the object. For museum or provenance semantics, use `passport.json` fields such as `creationDate`, provenance, or optional `objectYear` (see §9). **Only new deployments** pick up this rule; existing frozen registries are unchanged.

**Limitation:** The chain only enforces **consistency with `block.timestamp` in UTC** — it does not certify the “true” calendar date of a physical object or file.

---

## 3. Profile ID

Every creator, brand, or institution must register on-chain before minting a passport
or submitting a proof. Registration assigns a permanent globally unique profile ID.

> **Wire names:** the short identifier is carried as string `**creatorId`** in contract payloads and as `**creator.creatorId`** inside `passport.json`.

**A registered profile ID is mandatory.** The contract rejects any mint or proof transaction
from an unregistered wallet.

### Format

```
T-NNN-NNN-NNN-NNN
```


| Part              | Description                                                            | Example           |
| ----------------- | ---------------------------------------------------------------------- | ----------------- |
| `T`               | Type prefix (see below)                                                | `C`               |
| `NNN-NNN-NNN-NNN` | 12-digit random number split into **four** groups of 3 for readability | `482-930-174-005` |


### Type prefixes


| Prefix | Meaning           | Who uses it                                                                                                                                                 |
| ------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `C`    | Creator           | Individual artist, photographer, maker                                                                                                                      |
| `B`    | Brand             | Company, studio, label                                                                                                                                      |
| `P`    | Proof Institution | Expert, auction house, certification body — attestations (`submitProof`) on any passport                                                                    |
| `M`    | Museum            | Registered museum or collection — **unlimited** passport mints for institutional holdings (e.g. works by deceased artists); may also `submitProof` like `P` |


### Monthly mint caps (reference contract)

The reference `ObjectDigitalPassport` deployment (**v0.7**) limits **new passport mints** per wallet, per **calendar month** (anti-spam sketch; network fees only — no protocol fee). Caps depend on the registered **Creator type**:


| Type | Approximate cap                                                                 |
| ---- | ------------------------------------------------------------------------------- |
| `C`  | 1,000 mints / month                                                             |
| `B`  | 100,000 mints / month                                                           |
| `P`  | No limit (`getRemainingMints` returns `2^32−1` in the reference implementation) |
| `M`  | No limit (same as `P`)                                                          |


**Profile-gated features.** Some protocol surfaces are restricted to one profile type by the contract, not by convention. In the **v0.7** line, **edition passports and unit activation keys (§20) are available to `B` profiles only** — a `C`, `P`, or `M` wallet cannot mint an edition passport or open a unit-key set. The rationale and the full model are in §20.1.

**Museums and large inventories** digitizing collection holdings should register as `**M`** (museum/collection), **not `B` and not `C`**. The `**P**` prefix is for institutions whose **primary** role in the protocol is cross-cutting **proof** attestations; `**M`** signals custodial / collection issuance. Very large throughput may still use **multiple wallets** if policy allows.

**Type prefixes are governed exclusively by this specification.**
No individual, company, or implementation may introduce custom prefixes.
New prefixes are added only through an official update to this specification,
at which point the smart contract is redeployed with the updated allowlist.
The contract enforces this — any registration attempt with an unrecognized
prefix is rejected at the contract level.

### Examples

```
C-482-930-174-005   ← individual creator
B-029-384-751-224   ← brand or company
P-001-293-847-119   ← proof institution
M-204-839-112-441   ← museum or collection
```

### Generation algorithm

Reference contract (v0.7) uses (packed encoding, same style as Passport ID):

```
entropy  = keccak256(block.timestamp, block.prevrandao, msg.sender, nonce, gasleft())
number   = uint64(uint256(entropy)) % 1_000_000_000_000   // 12 decimal digits space
if number already exists: nonce++, retry (bounded attempts)
group_1  = number / 1_000_000_000
group_2  = (number / 1_000_000) % 1_000
group_3  = (number / 1_000) % 1_000
group_4  = number % 1_000
creatorId = type + "-" + pad3(group_1) + "-" + pad3(group_2) + "-" + pad3(group_3) + "-" + pad3(group_4)
```

1 trillion possible values. Uniqueness guaranteed by the contract.

### Full public identity

Every participant has two identity formats:

```
Short:  C-482-930-174-005
Full:   0x742d35Cc…4438f44e
```

In public-facing materials, **Short** is the profile ID and **Full** is the **wallet address only** (EIP-55 checksum recommended when printed). An optional human-readable **name** label may appear **before** or **after** the address in marketing copy, but it is **not** part of the canonical ID string and is **not** verified on-chain.

The full identity includes:

- Short profile ID (**required**)
- Full wallet address (0x… — 42 characters, **required**)
- Name or organization name (**optional**, off-chain label only)

The full wallet address is the cryptographic anchor of identity and uniqueness.
The name is only a human-readable label. The wallet address is the unforgeable proof.

### Public identity requirement

**All participants — creators (C), brands (B), proof institutions and related types (P), and museums or collections (M) —
must publish the short profile ID together with the full wallet address publicly.**

This is a fundamental requirement of the protocol, not merely a recommendation.
The system works only when anyone can verify who stands behind every object
and every attestation.

Participants should publish their identity transparently, with priority on places a regular user checks first:

- On their official website — prominently, not buried in menus
- In public social media profiles and bios
- On physical objects, packaging, and certificates when applicable
- In any other public channels they control where verification context is expected

**Both formats must be easy to find:**

```
Creator on example.com:
  Short:  C-482-930-174-005
  Full:   0x742d35Cc…4438f44e

Museum on museum.com:
  Short:  M-204-839-112-441
  Full:   0xB3F924ee…1823A3c8A
```

**Important:** Institution names are not stored in the protocol and are not shown
by verifiers. Only the profile ID is on-chain. Verifiers display only the ID —
users must find it on the institution's official website to confirm identity.
This prevents anyone from registering as any institution name and gaining undeserved trust.

This is how the protocol works without a central registry: the participant's
existing public reputation becomes the proof of their identity. Anyone can
register — but only legitimate participants will have their ID findable
on a trusted public website.

### Machine-readable identity endpoint (`.well-known/odp.json`)

Publishing the ID on a human-readable page is the requirement above. This endpoint is how
software checks that publication without guessing where to look.

Organizations registered as `B`, `M`, or `P` **MUST** serve, on the same domain as their official
website:

```
https://<domain>/.well-known/odp.json
```

```json
{
  "odp": 1,
  "chainId": 137,
  "registry": "0x012aC6393464A73EC16131D701ff2e000695b91b",
  "profiles": [
    { "profileId": "B-029-384-751-224", "wallet": "0x742d35Cc…4438f44e" }
  ]
}
```

Rules:

- HTTPS only, `Content-Type: application/json`, served from the organization's **own** domain — not a hosting provider's shared domain, and not a social network.
- `odp` is the format version (`1`). `chainId` and `registry` name the deployment the listed profiles belong to (§7, §8) — a profile ID means nothing without the registry it was issued by. An entry in `profiles` **MAY** carry its own `chainId` and `registry` to override the top-level pair, which is how one organization lists profiles across registry generations.
- `profiles` **MUST** contain only IDs the organization controls. An entry whose `wallet` does not match the registry's record for that `profileId` is invalid and **MUST** be ignored by whoever reads it.
- The endpoint is **advisory for the protocol**. No mint, proof, transfer, or verification result depends on it, and a missing file invalidates nothing — it only means the organization's identity cannot be confirmed automatically.
- `C` profiles **SHOULD** serve the same file where they control a domain. Where they do not, a public social profile carrying the ID remains valid evidence under the requirement above — it simply cannot be machine-checked.

Why a fixed path instead of "somewhere on the site": a page rendered by JavaScript hides the ID
from any non-browser checker, and a page anyone can post to — a forum, a community section — puts
an attacker's text on an official domain. A static file at a reserved path (RFC 8615) is readable
without a browser engine and writable only by whoever controls the server.

### 3.1 Stopping a profile, and saying when it went wrong

A profile ID is bound to one wallet for the life of the registry: there is no function that moves it to another address, and every passport records the issuing wallet and profile ID immutably at mint. Losing that key, or having it stolen, is therefore not recoverable inside the registry. The protocol splits the response in two, and the split is the point.

**On-chain: `revokeCreator()` — a stop, and nothing else.** The wallet that owns a profile may stop it. Irreversible: there is no un-revoke, because a thief holding the key would call it first. The record gains `revokedAt`, the block time of the call. Afterwards that profile mints nothing by any path — direct, mint agent, or extension router — and the wallet cannot register a replacement profile either, since one wallet holds at most one.

The call takes **no arguments**, and this is deliberate rather than minimal. Whoever holds the key can make it, including a thief: the key does not distinguish an owner from someone who copied it. So the only safe power to grant is one that reaches forward. If the caller could name a date and have the registry treat earlier passports as suspect, a thief would name the profile's registration date and discredit the issuer's entire history with one transaction. A stop costs the thief the ability to keep minting; it cannot cost the owner their past.

**Off-chain: the compromise statement, where a key alone cannot speak.** A thief holds the key. They do not hold the domain. Dating a compromise therefore belongs in `/.well-known/odp.json`, alongside the profile listing that already establishes identity:

```json
{
  "odp": 1,
  "chainId": 137,
  "registry": "0x012aC6393464A73EC16131D701ff2e000695b91b",
  "profiles": [
    { "profileId": "B-193-002-847-551", "wallet": "0x9f2b41Dc…07ae3c14" }
  ],
  "compromised": [
    {
      "profileId": "B-029-384-751-224",
      "since": "2026-09-03T00:00:00Z",
      "replacedBy": "B-193-002-847-551",
      "note": "Signing wallet compromised; passports issued after this date are not ours."
    }
  ]
}
```

Rules for `compromised`:

- Each entry **MUST** carry `profileId` and `since` (RFC 3339, UTC). `replacedBy` and `note` are optional; `replacedBy` **SHOULD** name a profile listed in `profiles` on the same file, which is what makes the succession checkable.
- A statement is **the domain owner's claim, not a fact the protocol verifies.** `since` can be wrong, or late, or self-serving. Its weight comes from where it is published: an attacker with the private key cannot put it there, and an attacker who can put it there did not need the key.
- An entry for a profile the domain does not control is **not** authority over someone else's profile. A reader **MUST** treat `compromised` as a statement about the publisher's own identity and ignore claims about profiles listed nowhere in that publisher's `profiles`, current or superseded.
- The statement **does not** revoke anything. On-chain revocation happens on-chain, and passports are revoked one by one with `revokePassport` (§8). This entry only dates a period a reader should treat with suspicion.

**Where this leaves a `C` profile with no domain.** Publishing the statement on a social account carrying the profile ID is the same trade the identity rule already makes: not machine-checkable, but outside the thief's reach. An issuer with neither a domain nor a public account has nowhere to date a compromise, and only the on-chain stop remains — which tells a reader the profile ended, but not when it stopped being trustworthy.

**Already-issued passports are untouched by any of this.** An object does not stop being genuine because its issuer lost a wallet. What changes is the reader's judgement about records made after the loss, and that judgement is the reader's to make (§11).

### On packaging and physical objects

```
ODP-2026-03-004829301
C-482-930-174-005
```

The short format is intentionally compact — easy to type, read aloud, or print.

### Mint agent delegation (reference v0.7)

The reference contract supports a **mint agent**: another wallet that may **submit mint transactions** on behalf of a profile owner (**principal**), after a **two-step handshake** — the agent calls `**requestMintAgentRole(principalCreatorId)`**, then the principal (the wallet that owns that profile) calls `**confirmMintAgentRole(agent)`**. Pending requests, replacement of an existing agent, and revocation are defined on-chain (see §8).

This is **not** the same as **publishing delegation** (`**delegateCreatorPublishing`**), which only lets a wallet call `**updatePassportUrls`** to change hosted links for passports the principal already issued.

**Semantics for passports:** When an agent mints for a principal, the passport is still **issued under the principal’s profile**. On-chain `**Passport.creator`** and `**owner`** are the **principal’s wallet**; `**creatorId`** is the **principal’s profile ID**. The `**mintAgent`** field records the agent’s address if they executed the mint transaction, or `**address(0)`** if the principal minted without an agent. Verification and public messaging should attribute the object to the **principal**; the agent is only the transaction sender. Monthly **C** / **B** mint caps count against the **principal** wallet.

**Typical use:** a brand, studio, or museum authorizes a contractor or operations wallet to mint operationally, while trust and registry lookups remain tied to the organization’s registered **profile ID** and principal wallet.

---

## 4. Proof Institution

Any museum, gallery, auction house, expert, or certification body can register
as a Proof Institution using the `P` type prefix. Registration is open to anyone
worldwide — no approval required.

### What a Proof Institution does

A registered Proof Institution can attach an on-chain **Proof record** to any
registered passport. This is an immutable public statement:
*"We examined this object and confirm its authenticity."*

Proof records do not modify the original passport. They accumulate alongside it.
The full proof history is permanently visible on-chain.

**The protocol does not verify whether a profile ID actually belongs to a claimed institution.**
Only the act of publicly publishing the profile ID on a real website — combined with the
institution's existing real-world reputation — provides the basis for trust.
Verifiers display only the profile ID, never a self-declared name.

### Institutional authenticity concern (“counterfeit flag”)

**On-chain:** `**ODPCounterfeitConcern`** exposes `**raiseCounterfeitConcern`**, `**clearCounterfeitConcern`**, `**getCounterfeitConcern**`. Only registered profiles `**P**` or `**M**` may raise; only the raising profile may clear. The flag is an institutional opinion, not a court finding. `**reasonHash**` is `**keccak256(UTF-8)`** of an optional off-chain statement (mirrors verifiers that hash a reason string).

**Off-chain / proof metadata:** disputes, methodology, and reports remain appropriate in `**passport.json`**, linked documents, and `**submitProof`** (`documentHash` / `documentUrl`).

### Public directory of profile IDs (off-chain, informative)

Implementers of verifiers, marketplaces, or institutional UIs **may** maintain an **off-chain** directory of profile IDs they choose to **highlight** or **show by default**, as a spam-reduction or UX convenience. This is **not** enforced by the smart contract and **does not** change open registration on-chain: anyone may register, and absence from any directory means nothing.

**Normative guidance for any published directory marketed as trustworthy:** each listed profile ID **must** be accompanied by at least one **HTTPS URL** on the **organization's own official website** — specifically a page (or stable section) where that **same** profile ID is visibly published, so end users can confirm the mapping without relying solely on the directory operator. Directories that list IDs **without** such verifiable on-site links **must not** be presented as authoritative; they are at best informal curation.

A directory operator **must not** present curation as protocol truth. Any published directory **must** state plainly that its rows are selected by its operator, that absence from the list carries no meaning, and that presence in it is not a guarantee.

**Reference format.** A CSV interchange format for such directories, with an example file and the re-checking tooling, is published separately at [`object-digital-passport/odp-profile-directory`](https://github.com/object-digital-passport/odp-profile-directory). It is **informative**: nothing here requires a directory to exist, or to use that format.

**Status semantics any consuming application MUST honour** — whatever directory format it reads:


| Directory state                                                                   | What the application shows                                                                          |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Evidence checked and present                                                      | The organization's identity may be displayed                                                        |
| Evidence unreachable (network error, 5xx, 404)                                    | **No owner identity at all** — no name, and no warning either. Missing data is not an accusation    |
| Evidence page loads, but the ID is **gone or changed** where it was present before | A prominent warning on the entry                                                                    |
| Never machine-checkable (social profile, client-rendered page)                     | Display together with the date a human last checked it                                              |


The difference between rows two and three is the whole point. A site that fails to load says nothing about the organization; an ID deliberately removed from a page that still loads is a deliberate act. Collapsing the first into the second publicly accuses honest organizations of forgery over a weekend of downtime.

A warning **must never** be raised for evidence that was never machine-readable in the first place. Absence of a finding is not a finding.

### Optional affiliation (one parent per child)

When two organization profiles should appear linked in a hierarchy — a head office and a unit, a
university and its schools, an umbrella body and a member, a brand and a sub-brand — the protocol
allows an optional **affiliation** between profiles of type `B`, `M`, and `P`, in any combination:

- Child proposes a parent
- Parent confirms on-chain
- A child has **at most one active parent**

`C` profiles cannot take part on either side. An individual has no divisions, and a `C → C` link
would be nothing but a way to attach oneself to a better-known name.

**Multi-level, but never circular.** A profile that already has children may still gain a parent
later: schools sit under a university, and a consortium can appear above that university a year
later without any restructuring below it. The contract refuses any link that would close a loop —
it walks upward from the proposed parent and rejects the proposal if the child is already an
ancestor (`EC(67)`). The walk is bounded: an ancestor chain that does not reach a root within
**8** hops is rejected rather than traversed (`EC(69)`), which also caps how deep a chain can be
grown downward.

**Affiliation grants nothing.** It is a display relation and only that:

- **No mint allowance is inherited.** Monthly caps (§3) always count against the wallet that mints.
- **No proof authority is inherited.** A child's `submitProof` is the child's statement, never the parent's.
- **No trust is inherited.** Verifiers **MUST NOT** present a child as endorsed, certified, or vouched for by its parent.

A parent confirms **belonging**, not **quality**. If a sub-brand starts issuing worthless passports,
its parent must be able to detach it (`detachAffiliation`) without having already lent it a
reputation it never granted.

**What verifiers display.** A verifier **SHOULD** show only the **immediate** parent of a profile by
default; the full chain **MAY** be shown on explicit request. Rendering "school → university →
consortium" as one line reads as inherited standing, which this relation does not carry.

The real-world meaning of a link — subsidiary, department, member, franchise — is **off-chain
convention**. The protocol records only that two profiles agreed to be linked, and in which
direction. Verifiers **MUST NOT** invent or display a relationship type the contract does not store.

The two-step handshake reduces spam and prevents unilateral trust claims.

```
ODP-2026-03-004829301  (original passport, 2026)
  └── Proof from P-029-384-751-224  04-2031
  └── Proof from P-482-930-174-005  09-2038
  └── Proof from P-001-293-847-119  01-2044
  └── Proof from P-774-002-391-888  12-2051
```

### Proof ID format

```
PRF-YYYY-MM-NNNNNNNN
```

Suffix is a **fixed-width decimal** string (eight digits in the reference implementation). Reference (v0.7):

```
key           = uint32(year) * 100 + uint32(month)          // proof event year/month from tx args
passportIdHash = keccak256(utf8(passportId))               // same Passport ID string as in `Passport.passportId` / `submitProof`
entropy       = keccak256(block.timestamp, block.prevrandao, msg.sender, nonce, key, passportIdHash, gasleft())
number     = uint32(uint256(entropy)) % 100_000_000      // 00000000–99999999
if number already exists for this year+month: nonce++, retry (bounded attempts)
proofId    = "PRF-" + decimal(year) + "-" + two_digit(month) + "-" + zero_pad(number, 8)
```

Example: `PRF-2031-03-07392018`

### Proof record fields


| Field             | Type      | Required | Description                                                                                                                  |
| ----------------- | --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `proofId`         | `string`  | yes      | Auto-generated: `PRF-YYYY-MM-` + fixed-width numeric suffix (see algorithm above)                                            |
| `contractVersion` | `uint8`   | yes      | Packed spec line at submission (must match registry; reference deployment → **7**)                                           |
| `prover`          | `string`  | yes      | profile ID of the institution (e.g. `P-029-384-751-224`)                                                                     |
| `passportId`      | `string`  | yes      | Passport ID of the attested object (same string as `Passport.passportId`; ABI field name `passportId` in the reference ABI) |
| `documentHash`    | `bytes32` | no       | SHA-256 of the signed expertise document. `bytes32(0)` if none                                                               |
| `documentUrl`     | `string`  | no       | URL of the expertise document (max 512 chars; empty when hash is 0)                                                          |
| `timestamp`       | `uint256` | yes      | Set by the contract                                                                                                          |


### Cost

Submitting a Proof record costs gas only (~$0.01 POL on Polygon).
No fees to the protocol.

### Public identity requirement for institutions

The public identity requirement from section 3 applies fully to Proof Institutions.
A Proof from an institution whose ID cannot be found on their official website
carries no verifiable value.

---

## 5. Verification Label

The verification label is an **optional** convenience layer.
Primary trust comes from on-chain records plus the seal state (NFC/numbered seal).
If used, the label helps end users verify faster.

### If a label is used: required elements


| Element                    | Description                                                                                            | Example                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| QR code                    | Encodes `odp://ODP-YYYY-MM-NNNNNNNNN`. Error correction level Q (25%) minimum. URI semantics: §12, §19 | `odp://ODP-2026-03-004829301`      |
| Passport ID (`passportId`) | Full object identifier in human-readable text                                                          | `ODP-2026-03-004829301`            |
| Protocol mark              | Protocol name or abbreviation                                                                          | `ODP` or `Object Digital Passport` |


### Optional elements

Implementations may add any of the following — the protocol does not restrict them:

- profile ID in text (informational only; do not treat as trust anchor)
- Object title
- Creator name
- Year of creation
- Edition number
- Creator logo or visual identifier
- NFC chip (embedded in or under the label)
- Seal number (printed on the label or on a separate element)

**Trust note (normative):** profile ID printed on packaging/labels is **not** a trusted source by itself and is **not required** on the label. Verifiers should obtain profile ID from verified public sources (official website and public social profiles), then compare with on-chain data.

### If a label is used: seal retention requirement

The label should physically cover or retain the seal:

- If an NFC crypto chip (NTAG 424 DNA TagTamper) is used — it should be positioned
under or within the label. The TagTamper chip permanently records removal electronically.
Physical placement under the label adds an additional visual tamper indicator,
but cryptographic tamper detection is provided by the chip itself, not the label.
- If a numbered seal is used — the label must overlap the seal so that
removing the label requires removing the seal

### What this specification does NOT define for the label

- Size, shape, color, material
- Typography and visual design
- Layout of elements
- Manufacturer

These are implementation decisions. The specification defines only
what must be present, not how it must look.

---

## 6. Physical Seal

A physical seal binds the digital passport to the specific physical object.

**v0.7 model:** seals are **identification anchors** — entries of type `**nfc`** or `**numbered_seal`** inside the `passport.json` `**anchors[]`** block (§9). Their bytes are integrity-anchored on-chain via `**dataHash`** and `**anchorsHash`** and flagged in `**anchorTypesMask`**; there are **no** dedicated on-chain seal fields (`sealType`, `sealHash`, `nfcPublicKey`, `nfcModel` were removed from the registry in the v0.7 line).

A seal is **optional**: the mandatory identification minimum for a physical object is the anchor set `photo` + `dimensions` + `materials` + `distinguishing_features` (§9). A seal anchor adds a stronger, machine-verifiable binding on top of that minimum and is recommended for high-value objects.

Digital object passports (type `digital`) do not use a physical seal.
The file hash serves as the cryptographic binding.

### Method A — NFC crypto seal (NTAG 424 DNA TagTamper)

A cryptographic NFC chip embedded in or attached to the object.
Recommended for high-value objects, artwork, and collectibles.

**Model strings in the `nfc` anchor:** `**NTAG424DNA`** or `**NTAG424DNA_TAGTAMPER`**. Generic Type 2 tags (e.g. NTAG 213) are **not** a conforming `nfc` anchor. In the v0.7 line the model string lives in the anchor's `data.model` (SPEC-governed vocabulary), not in an on-chain allowlist.

**How it works in the current ODP v0.7 deployment (NTAG 424 DNA):**

```
Registration (required order for issuers):
  1. Provision the tag so that the key you will publish is a NON-MASTER
     application key — 01h..04h, configured as the SDMFileReadKey used for
     verification. Key 00h is the AppMasterKey: a successful authentication
     with it authorises ChangeKey over all five keys. Publishing 00h
     therefore lets anyone who reads the passport re-key a genuine tag,
     rewrite its carrier, and lock its holder out of their own seal
     permanently. Key 00h MUST be retained by the issuer and MUST NOT be
     written into the nfc anchor
  2. Before minting, confirm against the live tag: its UID, that the EV2
     application key from step 1 authenticates, and — for TagTamper models —
     that the tamper state reads INTACT. A passport whose nfc anchor was
     never checked against the chip it names is not a seal, only a claim.
     How the issuing tool performs this check, and how the result reaches
     the tool that mints, are not specified here
  3. Record chip UID, model, key, and deployment notes in the `nfc`
     anchor inside passport.json anchors[]
  4. Passport is hashed and registered on-chain as usual — the anchor
     bytes are bound by dataHash and anchorsHash, and the nfc bit is
     set in anchorTypesMask
  5. Write the carrier after the passport ID exists. What goes on the
     tag is the odp:// URI of §12 — no hostname is printed (§12.2)
  6. Restrict the carrier file against further writes: set its Write and
     ReadWrite access conditions to Fh (no access). Leave the Change
     condition under key 00h while the carrier layer is still settling,
     or set it to Fh to freeze the tag permanently — the second is
     irreversible and forecloses adding a record later

Verification (primary profile: odp-ntag424-ev2-symmetric-cr-v1):
  1. Verifier obtains the nfc anchor from passport.json and confirms
     the JSON integrity against on-chain dataHash (or the anchors
     array alone against anchorsHash)
  2. Phone runs AuthenticateEV2First using the anchor's 16-byte value
     as the EV2 AES application key
  3. Chip and phone complete mutual challenge-response (RndA/RndB)
  4. Match    → SEAL_NFC_AUTHENTIC under EV2 symmetric challenge-response
     No match → wrong chip, wrong key, or wrong provisioning
```

**Honest trust note for this spec version:** NTAG 424 DNA does **not** expose a passport-specific ECC private key that signs an arbitrary verifier challenge verifiable with a public key on-chain. Its native challenge-response is **symmetric EV2 mutual authentication**. In the ODP v0.7 line, publishing the 16-byte EV2 application key inside the integrity-anchored `nfc` anchor is the primary public verification model. `Read_Sig` remains adjacent manufacturer evidence only.

**TagTamper behavior:**

Adds a tamper-detection antenna loop. Physical removal permanently registers as a tamper event.

```
Seal intact   → chip reports: INTACT
Seal removed  → chip reports: TAMPERED (permanent, cannot be reset)
```

**High-assurance TagTamper profile:**

For `NTAG424DNA_TAGTAMPER`, a verifier treats a scan as **high assurance** only when all of the following hold:

1. **EV2 symmetric challenge-response** against the integrity-anchored key from the `nfc` anchor (16-byte EV2 application key) → `chipKeyMatch = PASS`
2. **Authenticated TagTamper** after EV2 → `tamperState = INTACT`
3. **Chip UID match** when `passport.json` / handoff supplies the `nfc` anchor's `data.uid` → authenticated live UID equals expected UID

A verifier reports this outcome as `highAssuranceSeal`. It is **not** checked for plain `NTAG424DNA` passports.

**Publishing the bundle publishes the key (normative consequence).** The
verification key lives in the `nfc` anchor inside `passport.json`, not on-chain;
the registry holds only `dataHash` and `anchorsHash`. Hosting the bundle at
`dataUrl` therefore makes that key readable by everyone, which is what allows a
reader of the passport to program a second tag that answers identically. An
issuer who does not host the bundle keeps the key among the parties holding the
file, at the cost that a verifier without the file cannot complete the seal
check at all. **This is a security decision made per passport, and an issuer
of a high-value object should be told it is one.**

**Honest limits:** No verifier can be perfectly uncheatable. A thief with the original tag and key, a dishonest provisioning step, or a leaked EV2 key still defeats trust. This profile **does** block common cheats: URL-only fake tags, wrong chips with another key, and physically opened TagTamper seals (visible as `TAMPERED`).

**Physical installation:**
The chip must be embedded or encapsulated so that removal causes
visible destruction. Installation method is described in the anchor's `data.notes`.

**`nfc` anchor `data` fields in `passport.json` `anchors[]`:**


| Field         | Required | Description                                           |
| ------------- | -------- | ----------------------------------------------------- |
| `uid`         | yes      | 7-byte chip UID, lowercase hex                        |
| `publicKey`   | yes      | For NTAG 424 DNA: 16-byte EV2 AES application key (hex). For other future NFC ICs: deployment-specific public verification material |
| `model`       | yes      | `NTAG424DNA` or `NTAG424DNA_TAGTAMPER` (SPEC vocabulary) |
| `installedAt` | yes      | ISO 8601 installation date (e.g. `2026-03-15`)        |
| `notes`       | no       | Installation method, location, encapsulation material |

**The field is named `publicKey`, and for NTAG 424 DNA it holds a symmetric
key.** That is not a contradiction to be read past: the AES application key is
symmetric, and it is called `publicKey` because the field carries whatever
material a verifier needs in public, whatever its shape — for an asymmetric IC
it will hold an actual public key, and the name is chosen for that future. Two
consequences follow for NTAG 424 DNA and only for it, and an implementation
that misses them is unsafe:

- **Anyone who can read this value can compute the tag's answers.** It is the
  shared secret of a symmetric protocol, not a public half that gives nothing
  away. See the publication note in §6.
- **It must never be key `00h`** (§6, registration step 1). The field name
  invites the assumption that publishing it is harmless. For the AppMasterKey
  it is not.

The field name is fixed: it appears in the conformance vectors whose hashes are
asserted against the contract, so renaming it would change canonical bytes.


### Method B — Numbered Physical Seal

A physical seal with a unique printed number.
Examples: holographic sticker, wax seal, lead seal, tamper-evident label.

The creator is responsible for using a seal that cannot be removed without visible damage.
This method provides physical reference, not cryptographic proof.

**`numbered_seal` anchor `data` fields in `passport.json` `anchors[]`:**


| Field    | Required | Description                                           |
| -------- | -------- | ----------------------------------------------------- |
| `number` | yes      | Seal number exactly as printed                        |
| `type`   | yes      | Type of seal (e.g. `holographic sticker`, `wax seal`) |
| `color`  | no       | Color                                                 |
| `size`   | no       | Dimensions (e.g. `30x30mm`)                           |
| `notes`  | no       | Additional description                                |


### Seal rule (v0.7)


| Condition                                                 | Valid?                     |
| --------------------------------------------------------- | -------------------------- |
| NFC crypto anchor (NTAG 424 DNA / TagTamper, `NTAG424DNA` or `NTAG424DNA_TAGTAMPER`) | ✅ |
| Numbered seal anchor only                                 | ✅                          |
| Both seal anchors                                         | ✅                          |
| Standard NFC tag (NTAG213 etc.)                           | ❌ Not a conforming `nfc` anchor |
| No seal, physical object with the anchor minimum (photo + dimensions + materials + distinguishing features) | ✅ Seal is optional in v0.7 |
| Physical object without the anchor minimum                | ❌ Contract rejects (`anchorTypesMask` check) |
| No seal (digital object)                                  | ✅ File hash is the binding |


### On-chain binding of seal anchors

Seal anchors have no dedicated on-chain fields. Their integrity is bound by `**dataHash`** (whole document) and `**anchorsHash`** (the `anchors` array alone), and their presence is visible in `**anchorTypesMask`** (bits `nfc` = 256, `numbered_seal` = 512 — §9).

### Seals at production scale (pointer)

Both methods above are priced and shaped for **one object at a time**. A mass-produced edition — thousands to hundreds of thousands of identical units — cannot carry a per-unit chip, and its identification anchors are identical across the whole run, so a per-unit passport carries no per-unit information. The **v0.7** line addresses that case with a separate mechanism: one **edition passport** plus a per-unit keypair printed under a scratch layer, with a public one-time activation record. See **§20**. It is a `B`-profile feature and does not change §6 for `C` / `P` / `M`.


### Informative — other NFC / tag technologies

- **HF/UHF RFID** or **QR-only** labels: fine for logistics or UX, but they are **not** drop-in replacements for **Level 2A** NFC crypto verification unless a future SPEC defines a binding with a normative verify recipe.
- **Other authenticated NFC ICs** (vendor secure-element tags with documented challenge–response and exportable public keys): MAY be added in a later SPEC revision by extending the `nfc` anchor `data.model` vocabulary and **Level 2A** — generic static NDEF/UID tags remain a poor fit for the same security story as the current NTAG 424 DNA family.
- **Bleeding-edge demos** (e.g. auxiliary blockchain-coupled tag stacks): out of scope for the reference vocabulary; integrations should not imply protocol support without a spec'd model string.

---

## 7. Network

ODP v0.x is deployed exclusively on **Polygon PoS**.


| Property                         | Value                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Network                          | Polygon PoS (mainnet)                                                                                         |
| Chain ID                         | 137                                                                                                           |
| Canonical registry               | Source in-repo; packed `**CONTRACT_VERSION` 7** at mint; main registry + optional satellites (§4, `chain/deploy/`). **Not yet deployed — see the address table below.** |
| Other Polygon addresses          | Separate, **non-canonical** registries — **bytecode / ABI** may differ; always pair **address + ABI + `CONTRACT_VERSION`**, and name the registry when presenting their records. |
| Testnet                          | Polygon Amoy (chain ID 80002)                                                                                 |
| Gas token                        | POL (ex-POL)                                                                                                  |
| Avg. mint cost                   | ~$0.01                                                                                                        |
| Avg. registration cost           | ~$0.01                                                                                                        |


A single canonical network eliminates ambiguity in verification.
Multi-network support is reserved for a future version.

It also concentrates a dependency: every verification path in this specification ends at a read from this one chain, and the offline bundle of §15 is no exception. §15.3 states normatively what a verifier may still do when it cannot reach the chain, why *could not reach the registry* must never be shown as *invalid*, and why no verifier may rest on a single RPC endpoint.

### Canonical registry addresses (normative)

**No v0.7 registry is deployed on any network.** This specification describes the v0.7
line, and the canonical address table for that line is therefore empty:

| Contract                             | Address (Polygon PoS, chain ID 137)          |
| ------------------------------------ | -------------------------------------------- |
| `ObjectDigitalPassport` (main)       | *TBD — not deployed*                         |
| `ODPPassportLib` (linked library)    | *TBD — not deployed*                         |
| `ODPWalletDocumentAnchor` (§11 L1C)  | *TBD — not deployed*                         |
| `ODPCounterfeitConcern` (§4)         | *TBD — not deployed*                         |
| `ODPRegistryRelations` (§3, §4)      | *TBD — not deployed*                         |
| `ODPPassportProofRegistry` (§4)      | *TBD — not deployed*                         |
| `ODPExtensionMintRouter` (§8)        | *TBD — not deployed*                         |
| `ODPAuthorAttestation` (§8 B)        | *TBD — not deployed*                         |

When a v0.7 registry is deployed, its addresses land in this table and become
**normative**: an object described as holding "an ODP passport", or an identifier
presented as an ODP **Passport ID** (§2) or **Profile ID** (§3) without further
qualification, will refer to a record in **that** registry.

Until then:

- **There is no canonical registry to resolve against.** A client **MUST** be given an explicit registry context (chain ID + address + ABI) and **MUST** name that registry alongside any result it presents. §12.3 and §19.2's fallback to "the canonical registry of §7" has no target on this line.
- Deployments of this source to any address remain **valid instances of the protocol** — the source is MIT-licensed and self-hosting is expressly supported — but none of them is canonical, and anything presenting their records as ODP passports **MUST** identify the registry.
- Correct decoding still requires pairing **chain + contract address + ABI + `CONTRACT_VERSION`** (§8); canonicity settles *which* registry is meant by default, not how to read it.

### Superseded lines (informative)

Each earlier line was canonical for itself and remains a **separate registry** with an
incompatible ABI; records do not migrate between deployments. Superseded registries stay
readable, so passports issued under them continue to verify against them.

| Line | Registry | Address (Polygon PoS, chain ID 137) |
| --- | --- | --- |
| **v0.6** — deployed 2026-07-24, packed `CONTRACT_VERSION` **6** | `ObjectDigitalPassport` (main) | `0x012aC6393464A73EC16131D701ff2e000695b91b` |
| | `ODPPassportLib` (linked library) | `0xB7D7B8485eeb385c375ABd91035F5a6914171ccE` |
| | `ODPWalletDocumentAnchor` | `0x35df3773919D9F10e5F8838abaa453DE120e6Cb4` |
| | `ODPCounterfeitConcern` | `0x692935d6c1532b47cE0459bF1E9549991d0eD2C9` |
| | `ODPRegistryRelations` | `0x2ea6f05a050973afa14E61b1Ea19De92621e3661` |
| | `ODPPassportProofRegistry` | `0x990FCc2E587d9f2cDb9c73083E9f90793CeF7F49` |
| | `ODPExtensionMintRouter` | `0x3fa8f213399a2A9f7Da4bF7D8a9D7D42E8AEF822` |
| | `ODPAuthorAttestation` | `0x1972E68D0A5B19C5ee2af54F8b792c426985F7d7` |
| **v0.5** and before | `ObjectDigitalPassport` (main) | `0x413aEeBB2ac437483Bc68791EaAab492C2a4B346` |

Release notes for the superseded lines are kept as written: [`docs/RELEASE_v0.6.md`](docs/RELEASE_v0.6.md), [`docs/V0.6.md`](docs/V0.6.md). Their `passport.json` schema and examples were removed when this line became the only one; a document issued under a superseded line still verifies against its on-chain hashes, which do not depend on the schema file.

**Registry context for links:** Human-readable protocol links (`odp://…`; see §12 and §19) **do not** encode which **chain ID** or **registry contract** produced a record. Clients **MUST** pair **chain + contract address + ABI** as elsewhere in this specification; absent an explicit context there is **no** default on this line, because no v0.7 registry is deployed (table above); a client **MUST** obtain a registry context rather than guess, and **MUST** name the registry it used. When a v0.7 registry exists, the default becomes that registry. See §12.3 and §19.

---

## 8. On-Chain Record

This section matches the reference `**ObjectDigitalPassport`** `Passport` struct (packed `**contractVersion` = 7** at mint in this line). ABI tuple order may differ from this table; field **names** are normative. See `docs/ru/REQUIREMENTS_FIELDS_V0.6.md` for the design rationale (storage layers A/B/C).


| Field                  | Type      | Required | Description                                                                                                                                                                                                         |
| ---------------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `passportId`           | `string`  | yes      | Passport ID, e.g. `ODP-2026-03-004829301` (legacy `humanId` in some older ABIs)                                                                                                                                     |
| `contractVersion`      | `uint8`   | yes      | Packed at mint: `SPEC_MAJOR * 16 + SPEC_MINOR` (reference line in this repo → **7**)                                                                                                                                |
| `creator`              | `address` | yes      | **Immutable** issuer wallet (**principal** profile wallet; same when minting via agent)                                                                                                                             |
| `owner`                | `address` | yes      | Current holder; **starts as `creator`** (principal); changes only via `**transferPassport**`                                                                                                                        |
| `creatorId`            | `string`  | yes      | Profile ID (wallet must be registered before mint)                                                                                                                                                                  |
| `year`                 | `uint32`  | yes      | **UTC** calendar year of the mint transaction (must match `mint*` args and `passport.json` `year` used in `dataHash`)                                                                                               |
| `month`                | `uint8`   | yes      | **UTC** calendar month (1–12) of the mint transaction (same alignment as `year`)                                                                                                                                    |
| `title`                | `string`  | yes      | **On-chain card.** 1–128 bytes. MUST equal `passport.json` `title` byte-for-byte (after NFC normalization). Immutable — no edit path                                                                                |
| `authorName`           | `string`  | yes      | **On-chain card.** 1–128 bytes; human-readable author / brand name. MUST equal `passport.json` `authorName` byte-for-byte. Immutable                                                                                |
| `shortDescription`     | `string`  | yes      | **On-chain card.** 1–256 bytes; one-line annotation (object kind, technique, creation year). MUST equal `passport.json` `shortDescription` byte-for-byte. Immutable                                                 |
| `domain`               | `string`  | no       | **On-chain card.** ≤128 bytes; area / field (e.g. `contemporary_art`, `software`). MUST equal `passport.json` `domain` byte-for-byte                                                                                |
| `objectType`           | `string`  | yes      | `physical`, `digital`, or `mixed`                                                                                                                                                                                   |
| `contentClass`, `lifecycleStatus`, `aiStatus`, `verificationMethod`, `editionModel` | `uint8` | yes | Controlled-vocabulary codes (§9). `lifecycleStatus` changes only via **STATUS events** (append-only)                                                                                |
| `dataHash`             | `bytes32` | yes      | SHA-256 of minified `passport.json`                                                                                                                                                                                 |
| `anchorsHash`          | `bytes32` | yes      | SHA-256 of the canonical **minified `anchors` array** from `passport.json` (§9, §10) — lets verifiers check the identification block in isolation                                                                   |
| `anchorTypesMask`      | `uint32`  | yes      | OR of anchor-type bits present in `anchors[]` (§9). Mint enforces the hard identification minimum per `objectType`                                                                                                  |
| `imageHash`            | `bytes32` | phys/mixed: yes | Primary photo SHA-256; **required non-zero** for `physical` / `mixed`; optional for `digital`. Additional photos are `photo` anchors                                                                          |
| `fileHash`             | `bytes32` | digital/mixed: yes | Digital original SHA-256; **required non-zero** if `objectType` is `digital` / `mixed`; MUST be zero for `physical`                                                                                          |
| `dataUrl`              | `string`  | no       | HTTPS URL of the **§15 `.odpass`** bundle (max **512** chars). May be `**""`** — then HTTP verifiers cannot fetch. May be folder-resolved at mint (see below). **MUST NOT** point at bare `.json` — only `.odpass`. |
| `imageUrl`             | `string`  | no       | Primary image URL hint (max **512** chars)                                                                                                                                                                          |
| `timestamp`            | `uint256` | yes      | Mint block time — the primary proof of the registration moment                                                                                                                                                      |
| `revoked`              | `bool`    | yes      | **Irreversible** revocation flag                                                                                                                                                                                    |
| `revokedAt`            | `uint256` | yes      | Unix seconds when revoked; **0** if not revoked                                                                                                                                                                     |
| `revocationReasonHash` | `bytes32` | no       | `**keccak256(UTF-8 reason)`**; **0** if not revoked                                                                                                                                                                 |
| `mintAgent`            | `address` | yes      | Wallet that executed the mint tx; `**address(0)`** if the principal minted themselves                                                                                                                               |
| `eventCount`           | `uint32`  | yes      | Append-only event counter (`recordPassportEvent`); full history lives in the event log                                                                                                                              |
| `lastEventKind`        | `uint8`   | yes      | Kind of the most recent passport event; **0** if none                                                                                                                                                               |
| `lastEventAt`          | `uint256` | yes      | Block time of the most recent passport event; **0** if none                                                                                                                                                          |


**Removed relative to v0.5** (see the migration table in `docs/ru/REQUIREMENTS_FIELDS_V0.6.md`): `sealType` / `sealHash` / `nfcPublicKey` / `nfcModel` (→ `nfc` / `numbered_seal` anchors), `imageHash2/3` + `imageUrl2/3` (→ `photo` anchors), `currentLocation` / `rightsNote` / `conditionNote` / `damageHistoryHash` / `damageHistoryUrl` (→ append-only events), `auxCommitment*` (→ attestation `documentHash` or a document anchor), `ndppCommitment*` (offline carriers verify against `dataHash` / `anchorsHash` directly).

**Derived:** chain time is interpreted in **UTC** for off-chain display; no separate `timestampTimeZone` field.

**Immutability after mint:** the card (`title`, `authorName`, `shortDescription`, `domain`) and all hashes (`dataHash`, `anchorsHash`, `imageHash`, `fileHash`) **never change on-chain**. There is deliberately **no** card-edit function: a typo or renaming requires `**revokePassport`** + a new mint. Only `dataUrl` / `imageUrl` (hosting hints), `owner` (transfer), the append-only event summary, and revocation state can change.

**Folder-base `dataUrl` at mint:** If `dataUrlIsFolderBase` is true, the caller passes an HTTPS **folder root** only; the contract stores `stripTrailingSlash(folder) + "/" + passportId + ".odpass"` after the Passport ID is known (§15 bundle filename). `**updatePassportUrls`** always sets **literal** strings (no folder resolution).

### Reference contract — mint (v0.7)

- `**mintPhysical(m, dataUrlIsFolderBase, mintOnBehalfOfCreatorId)`** / `**mintDigital(...)**` / `**mintMixed(...)**` — `**m**` is the unified `PassportMintInputs` tuple: `core` (card + classification), `dataHash`, `dataUrl`, `imageHash`, `imageUrl`, `fileHash`, `anchorsHash`, `anchorTypesMask`, `initialOwner`. Per-type rules: `physical` → `fileHash == 0`, `imageHash != 0`, mask ⊇ `photo|dimensions|materials|distinguishing_features`; `digital` → `fileHash != 0`, mask ⊇ `file_hash`; `mixed` → both sets.

  **`initialOwner` (v0.7).** The last member of the tuple, and the one an
  implementation written against the v0.6 line will be missing. `address(0)`
  means the minting principal becomes the owner, which is what every v0.6 mint
  did implicitly; any other address becomes the initial `owner` instead. It
  exists so that a unit passport can be minted for a holder who is not the
  submitter (§20.10), and it applies to every mint path, not only that one.
- `**mintDigitalViaExtension(mintClass, payload, dataUrlIsFolderBase, mintOnBehalfOfCreatorId)`** / `**mintPhysicalViaExtension(...)**` — governance-registered `**IODPExtension**`; `**normalize**` returns ABI encoding of the `PassportMintInputs` tuple. On success the router emits `**ExtensionMintUsed(mintClass, kind, passportId)`** with `**kind`**: `0` = digital, `1` = physical, in addition to `**PassportMinted`** (which includes the card and anchors fields plus `**mintAgent**`).

### Reference contract — events, ownership, URLs, revocation (v0.7)

- `**recordPassportEvent(passportId, kind, value, note, attachmentHash, attachmentUrl)`** — append-only layer-B record; callable by `**creator`**, `**owner`**, or `**governance`**; revoked passports rejected. `kind`: `1` = status (`value` = new `lifecycleStatus` 1–4, updates the stored summary field), `2` = location, `3` = rights, `4` = condition, `5` = damage, `6` = restoration, `7` = custom (`value` MUST be 0 for kinds 2–7). `note` ≤256 bytes; optional attachment = SHA-256 + HTTPS hint (≤512; URL empty when hash is 0). Emits `**PassportEventRecorded`**; on-chain storage keeps only `eventCount` / `lastEventKind` / `lastEventAt` — history is read from the log. **The current value of any mutable aspect is the latest event of that kind.**


| Function                                                                     | Who may call                                                              | Notes                                                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `updatePassportUrls(passportId, newDataUrl, newImageUrl, confirmedDataHash)` | `**creator` or `owner**`, or the **issuer’s active publishing agent**     | Requires `confirmedDataHash == dataHash`; revoked passports rejected                                                      |
| `recordPassportEvent(passportId, kind, value, note, attachmentHash, attachmentUrl)` | `**creator`, `owner`, or `governance`**                            | Append-only; see above                                                                                                    |
| `transferPassport(passportId, newOwner)`                                     | `**owner`**                                                               | `newOwner != address(0)`                                                                                                  |
| `delegateCreatorPublishing(agent, expiresAt)`                                | **Registered profile** (`msg.sender`); stored per `**msg.sender`** wallet | Single active agent per issuer wallet; `expiresAt > block.timestamp`                                                      |
| `revokeCreatorPublishing()`                                                  | **Registered profile** (clears own slot)                                  |                                                                                                                           |
| `getCreatorPublishingDelegation(creatorWallet)`                              | any                                                                       | Returns `(agent, expiresAt)` for that **issuer** wallet                                                                   |
| `requestMintAgentRole(principalCreatorId)`                                   | any wallet except principal’s                                             | Creates pending slot; emits `**MintAgentUpdate`** `kind=0`                                                                |
| `confirmMintAgentRole(agent)`                                                | **Registered principal** (`msg.sender` wallet owns profile)               | Consumes pending; sets `**mintAgentForCreator`**; `**MintAgentUpdate`** `kind=2` (and `kind=3` for replaced agent if any) |
| `cancelMintAgentRequest(principalCreatorId)`                                 | **Agent** (own pending only)                                              | `**MintAgentUpdate`** `kind=1`                                                                                            |
| `revokeMintAgentRole()`                                                      | **Registered principal**                                                  | Clears active agent; `**MintAgentUpdate`** `kind=3`                                                                       |
| `renounceMintAgentRole(principalCreatorId)`                                  | **Active agent**                                                          | `**MintAgentUpdate`** `kind=3`                                                                                            |
| `mintAgentForCreator(creatorId)`                                             | any                                                                       | `view` — public mapping getter                                                                                            |
| `mintAgentDelegationPending(bytes32)`                                        | any                                                                       | `view` — `keccak256(abi.encodePacked(principalCreatorId, agent))`                                                         |
| `revokePassport(passportId, reasonHash)`                                     | `**creator` or `governance`**                                             | `reasonHash != 0`; `**submitProof` reverts** while revoked                                                                |


**Counterfeit concern:** on the reference stack, `**ODPCounterfeitConcern`** (satellite) — see §4 and §13.

### Reference contract — deploy, freeze, governance (v0.7)

- `**deployer`**: `immutable`, set in the constructor to the deploying address; the **only** wallet allowed to `freeze()`.
- `**governance`**: `address`; **constructor sets `governance = msg.sender`**. Use `**transferGovernance(newAddr)**` (caller must be current `governance`) to point at a multisig/DAO.
- Governance wires satellites: `**setRelationsSatellite(addr)`**, `**setExtensionRouter(addr)`**.
- `**freeze()**`: **only `deployer`**; **irreversible**; sets `**frozen = true`** and blocks every state-changing user path on the main registry (`registerCreator`, `mintPhysical` / `mintDigital` / `mintMixed`, `recordPassportEvent`, `updatePassportUrls`, `transferPassport`, `revokePassport`) with revert `**EC(58)`**; all **reads** stay available. This is a **v0.x safety hatch** and is **planned for removal in stable v1** (`[docs/ru/IDEAS_V1.md](docs/ru/IDEAS_V1.md)`). Freeze affects the main registry only; satellites keep their own state.

### Reverts

The reference bytecode uses `**error EC(uint16 code)`** only (no string messages), to satisfy the EIP-170 size limit. Integrators **must** decode codes against the deployed source.

### Protocol extensions beyond the main registry semantics

The following items are **not** enforced by the current reference `[ObjectDigitalPassport.sol](chain/contracts/ObjectDigitalPassport.sol)` **semantics** — they live outside the main registry, not inside it. **(A)** is a forward-looking idea with no implementation. **(B)** ships as an optional **satellite**; a v0.6 instance is deployed on Polygon mainnet (superseded-lines table in §7), and a v0.7 instance is not yet deployed; it is enforced by that satellite, never by the main registry. *(The EIP-170 split — linked `**ODPPassportLib`** and satellites — is **already shipped** in the reference stack; see §11 Level 1C and deploy docs.)* See `**[docs/PROTOCOL_TRACKS.md](docs/PROTOCOL_TRACKS.md)`** and `**[docs/EIP170_STRATEGY.md](docs/EIP170_STRATEGY.md)`** before scheduling further on-chain work.

#### A) Global uniqueness of passport `dataHash` (planned)

**Intent (product option):** reject a new mint if the canonical `passport.json` `**dataHash`** was already used for **any** passport in that registry, so one hash anchors at most one `passportId` over the lifetime of the deployment.

**Current behavior:** the reference contract allows multiple passports with the same `dataHash` (distinct `passportId`). Changing to global uniqueness is a **breaking semantic** for issuers who reuse identical JSON across objects.

**If implemented:** enforce in the shared mint commit path (all `mintDigital` / `mintPhysical` / `mint*ViaExtension` routes). **Do not** apply this rule to `**attestExternalDocument`** / wallet document anchors — those commitments use a **different** on-chain meaning (file hash attestation, not `Passport.dataHash`). **Recommended:** after `revokePassport`, the hash remains **consumed** (slot never freed) so the same JSON anchor cannot get a “second life”.

#### B) Optional author attestation (EIP-712) — satellite `ODPAuthorAttestation`

**Intent:** allow an **optional** cryptographic binding between a **separate author key** and the integrity anchor (`dataHash`) and issuer profile, without replacing trust in the registered minter when the feature is unused. It gives verifiers two independent signals — *this wallet minted it* and *this author key signed exactly these bytes* — so a compromised minting wallet cannot forge the second.

**Status:** implemented as the optional satellite `**ODPAuthorAttestation`** (`chain/contracts/ODPAuthorAttestation.sol`); the v0.6 instance is at `**0x1972E68D0A5B19C5ee2af54F8b792c426985F7d7`** on Polygon mainnet (superseded-lines table in §7) and no v0.7 instance is deployed. The main registry bytecode is **unchanged** — adopting this feature did **not** re-deploy or move the registry. Attestation remains **optional**: a passport without one is not deficient, and the absence of an attestation is **not** a negative signal (see the verifier rule below).

**Normative shape (reference implementation):**

1. **Satellite, not mint calldata.** The main registry mint entrypoints are unchanged; attestation is a **separate transaction after mint**, like `submitProof` (§4) and `attestExternalDocument` (§11, Level 1C). The satellite constructor pins one `ObjectDigitalPassport` address and reads `getPassportHeader` / `getPassportMedia` / `getPassportClassification` from it.
2. **Digest — EIP-712 typed data.** Domain: `name` `"Object Digital Passport"`, `version` `"1"`, `chainId`, and `verifyingContract` = **the satellite address** (so a signature is not replayable against a different anchor contract). Struct:
   `AuthorAttestation(string passportId,bytes32 dataHash,string creatorId,address authorSigner)`.
   The `dataHash` and `creatorId` signed MUST be the passport’s **current on-chain** values — the contract reads them from the registry rather than accepting them as calldata, so a signature cannot be pointed at other bytes.
3. **Mint agent interaction:** the binding uses on-chain `**creator`** / `**creatorId`** — i.e. the **principal** profile, never the delegate agent address (§8, mint agent).
4. **Who may submit:** the passport’s `**creator`** or `**owner`**. The signature alone authorizes the *key*, but gating the transaction prevents a third party from squatting the single attestation slot with a key of their own.
5. **One-shot and immutable:** at most one attestation per passport; there is no overwrite or clear path, matching the immutability class of the on-chain card. A wrong binding is corrected by `revokePassport` + re-mint. Attestation on a **revoked** passport reverts (`EC(11)`), consistent with `submitProof` / `recordPassportEvent`.
6. **Signature hygiene:** 65-byte ECDSA with EIP-2 low-`s` and `v ∈ {27,28}` enforced, so a malleable second signature cannot be presented as a distinct one.

**Read surface:** `getAuthorAttestation(passportId) -> (attested, authorSigner, dataHash, creatorId, timestamp)`; `hashAuthorAttestation(...)` and `domainSeparator()` expose the digest for clients that want to cross-check what they are signing. Event: `**AuthorAttested`** with indexed `passportId`, `authorSigner`, `creatorId`.

**Verifier rule (normative when the satellite is configured):** an attestation is meaningful **only** if its stored `dataHash` still equals the passport’s current on-chain `dataHash`. Verifiers MUST compare the two and MUST NOT present an author attestation as a verdict on authorship in a legal sense (§11, *Authorship and legal rights*) — it proves control of a key over specific bytes, nothing more. Absence of an attestation is **not** a negative signal: the feature is optional and most passports will not use it.

---

## 9. Passport JSON

Normative off-chain document: `**passport.json`** (UTF-8 JSON, one object). Its minified bytes anchor `**dataHash`** on-chain (§8, §10). For **public hosting** and **portable distribution**, those bytes **must** live inside a `**.odpass`** file (§15 ZIP) — **not** as the sole HTTP body at `dataUrl` (see below).

### `.odpass` hierarchy (normative)

The portable artifact is one file whose name **ends with** the extension `**.odpass`** (example: `ODP-2026-03-004829301.odpass`). It is a **ZIP** archive; entry names use UTF-8. **Normative tree:**

```
<passportId>.odpass          ← outer file; literal extension .odpass
├── passport.json            ← required: canonical document (this §9); anchors dataHash
├── manifest.json            ← required: bundle UX metadata (not a trust anchor)
└── originals/               ← optional (reference bundle layout; see §15 `bundleVersion`)
    └── <role>__<basename>   ← sidecar bytes (e.g. roles digital, image, image2, image3)
```

- `**passport.json**` — defined by the field tables and rules in **§9**; hash rules in **§10**.
- `**manifest.json`** — `**manifest.originals`** maps logical keys (`fileHash`, `imageHash`, …) to paths under `originals/` when sidecars are included (**§15.1.1**).
- **Sidecar layout:** On-chain-anchored files MUST appear only under `**originals/`**, with paths recorded in `**manifest.originals`** (**§15.1**). Legacy top-level folders (`original/*`, `image/*`, `image2/*`, `image3/*`) MUST **not** be used in normative `.odpass` bundles; verifiers MUST **not** search those paths as fallbacks (**§15.1**).

Authoritative ZIP rules, manifest shape, and offline verification are in **§15**.

### Hosting `dataUrl` (third-party sites)

`dataUrl` points to a `**.odpass`** file (the **§15** ZIP) on a public HTTPS host (object storage, CDN, static site, Git forge, etc.). **Bare `passport.json` at this URL is not allowed** — the HTTP response body MUST be that `**.odpass`** file; verifiers extract `passport.json` from the ZIP. The last path segment SHOULD be `<passportId>.odpass` using the **exact** Passport ID string from the contract (same value as field `passportId` in the reference ABI; legacy `humanId` in older ABIs; e.g. `ODP-2026-03-004829301.odpass` — same casing as on-chain). Implementations that fetch the file MUST satisfy:

1. **HTTPS** — The URL uses TLS; the server returns HTTP **200** with a response body that is a `**.odpass`** file (§15 ZIP; local header `PK\x03\x04`; not an HTML page, login prompt, or repository browser UI). The verifier MUST extract `**passport.json`** and canonicalize per §10.
2. **Raw file on Git forges** — For GitHub, GitLab, and similar hosts, use the **raw** file URL to the `**.odpass`** file (e.g. `raw.githubusercontent.com/.../ODP-....odpass`), not the HTML blob page.
3. **CORS (browser verifiers)** — Web-based verifiers run `fetch()` from their origin; the host SHOULD allow cross-origin **GET** for `dataUrl` so the browser can read the body (many static hosts and GitHub Raw do; a misconfigured private server may block verification).
4. **Integrity** — After extracting and canonicalizing `passport.json` from the bundle, the bytes MUST match `dataHash` on chain (see §10). Any byte change (including whitespace) changes the hash.

#### Creator responsibility for `passport.json` after mint (normative)

The protocol does **not** store the full passport JSON on-chain — only `dataHash` and related fields (see §8). The creator **must** retain the **canonical minified** `passport.json` octets (inside the `**.odpass`** they publish). `**dataUrl`** may be empty at mint; if set, the creator **must** host the `**.odpass`** file at `dataUrl` for public web verification.

1. If `dataUrl` is **non-empty** but there is **no** HTTP **200** whose body is a valid `**.odpass`** file (§15 ZIP) containing `passport.json` that matches `dataHash` after canonicalization, verifiers **must** treat web-based verification as **failed** (e.g. **UNVERIFIABLE** / hash mismatch per §11 — exact state names are implementation-defined).
2. If `dataUrl` is **empty**, HTTP fetch cannot apply; only parties with the `**.odpass`** or `**passport.json`** file can verify against `dataHash` (implementation-defined UX SHOULD warn the creator at mint time).
3. The `**creator` or `owner`** **may** update `dataUrl` (and primary `imageUrl`) later via `**updatePassportUrls`** in the reference contract **without** reminting, as long as the hosted `**.odpass`** still contains matching `passport.json` bytes for `dataHash` and the passport is not revoked.
4. **Reference and compatible UIs** SHOULD require **explicit user acknowledgement** immediately before submitting a mint transaction: that publishing the `**.odpass`** is the creator’s responsibility; that public verification depends on that `**.odpass`** file being reachable at the registered URL when `dataUrl` is set; and that the user should download or copy the bundle before closing the success screen when the implementation provides that action.

### Canonical v0.7 passport schema (normative)

The canonical `passport.json` for the current line is the **v0.7 shape** used by the reference contract and tooling. The schema is built on the **Object ID identification principle** (object type, materials & technique, measurements, inscriptions & markings, distinguishing features, title, subject, date/period, maker + photographs + short description): the identification categories are first-class fields and anchors, not an external mapping. The required classification axis is:

- `domain`
- `objectType`
- `status`
- `contentClass`
- optional `refinementTags`

#### Required top-level field groups

| Field / group | Required | Type | Notes |
| --- | --- | --- | --- |
| `version` | yes | `string` | MUST be `"0.7"` for this line. |
| `passportId` | yes | `string` | MUST equal the on-chain Passport ID. |
| `title` | yes | `string` | 1–128 bytes. **On-chain card field** — MUST equal the on-chain `title` byte-for-byte. |
| `authorName` | yes | `string` | 1–128 bytes. **On-chain card field** — human-readable author / brand name; MUST equal on-chain byte-for-byte. |
| `shortDescription` | yes | `string` | 1–256 bytes. **On-chain card field** — one-line annotation (object kind, technique, creation year); MUST equal on-chain byte-for-byte. |
| `domain` | no | `string` | ≤128 bytes. **On-chain card field** — MUST equal on-chain byte-for-byte (including the empty string). |
| `description` | recommended | `string` | Full description; unbounded. Free-text pre-registration history MAY live here (informative only — see the provenance rule below). |
| `subject` | optional | `string` | What is depicted / what the object is about (Object ID "subject"). |
| `creationDate` | recommended | `string` | Object creation date or creation-period anchor (Object ID "date or period"); SHOULD be ISO-like and unambiguous. |
| `authorship` | optional | `object` | Structured authorship detail: `author` object (name SHOULD repeat `authorName`), optional `coAuthors`, optional `team`. |
| `anchors` | yes | `array` | **Identification anchors** — see below. Bound on-chain by `anchorsHash` + `anchorTypesMask`. |
| `objectType` | yes | `string` | One of `physical`, `digital`, `mixed`. |
| `status` | yes | `string` | Lifecycle state **at registration**; the current state afterwards is the latest on-chain STATUS event. |
| `contentClass` | yes | `string` | One of the controlled values below. |
| `aiStatus` | yes | `string` | One of the controlled values below. |
| `verificationMethod` | yes | `string` | One of the controlled values below. |
| `edition` | yes | `object` | MUST contain `model`; MAY include `number` and `total` when meaningful. |
| `idGranularity` | yes | `string` | One of `model`, `batch`, `item` — **what this passport identifies**: a design (any unit of it), one production run, or one physical object. Independent of `edition`, which says how large the run is, not what the record points at: an `item` passport may describe unit 1 of 3, and a `batch` passport may cover a run of 100 000. A verifier comparing an object against a `model` or `batch` passport is matching the class, not the individual, and **MUST NOT** present the result as identifying that specific object. |
| `translations` | optional | `object` | Language-keyed translations / transliterations of `title`, `shortDescription`, `description` (e.g. `{"en": {"title": "…"}}`). The on-chain card stays in the author's original language. |
| `year`, `month` | yes | integer | UTC mint year/month; MUST match on-chain mint inputs. |
| `registeredAt`, `registration` | yes | number / object | UTC-only registration instant representation; see below. |

#### Identification anchors (`anchors[]`) — normative

An **anchor** is a verifiable property that binds the passport to the specific object — the thing that stops a genuine passport from being attached to a forgery. Each entry:

```json
{
  "type": "photo",
  "data": { "...type-specific fields..." },
  "hash": "sha256:...",
  "verification": "how to check (free text or a profile id)"
}
```

`type` is required; `data`, `hash`, `verification` are per-type. Anchor type registry and `anchorTypesMask` bits:

| Bit | `type` | Object ID category | `data` / `hash` content |
| --- | --- | --- | --- |
| 1 | `photo` | Photographs | reference to the shot (e.g. `role`: `primary` / `detail`); `hash` = SHA-256 of the image file |
| 2 | `dimensions` | Measurements | measures (`width`, `height`, `depth`, `diameter`) plus a required `unit`, and optional `upperTolerance` / `lowerTolerance` — see the unit rule below |
| 4 | `materials` | Materials & techniques | materials list / technique |
| 8 | `distinguishing_features` | Distinguishing features | defects, craquelure, repairs — what a copy would not reproduce |
| 16 | `marks` | Inscriptions & markings | signatures, stamps, serials + where they are |
| 32 | `file_hash` | — | exact SHA-256 of the digital original (`hash`; equals on-chain `fileHash`) |
| 64 | `perceptual_hash` | — | perceptual hash with required `data.algorithm` (recommended: `phash-dct-64`, `pdq`); **supplementary only** |
| 128 | `c2pa` | — | hash of the C2PA manifest; **supplementary only** |
| 256 | `nfc` | — | NFC crypto seal (§6): `uid`, `publicKey`, `model`, `installedAt`, optional `notes` |
| 512 | `numbered_seal` | — | numbered seal (§6): `number`, `type`, optional `color` / `size` / `notes` |
| 1024 | `fingerprint` | — | measurable object fingerprint: `method` + `dataHash` + methodology reference |
| 2048 | `dna` | — | synthetic DNA tag / microdot marking |
| 4096 | `unit_key_set` | — | **v0.7, `B` only** — Merkle root over the unit keys of a production edition (§20.3) |
| 8192 | `unit_variant_commit` | — | **v0.7, `B` only** — Merkle root over per-unit variant commitments for blind-box products (§20.4) |
| 2^31 | `custom` | — | anchor outside the registry; actual type in `data.customType` |

Bits 14–30 are **reserved** for future SPEC revisions; new types are added by a SPEC update without changing the schema shape.

**Measurement units (normative).** The `dimensions` anchor **MUST** carry `data.unit`, and its value **MUST** be a **UN/CEFACT Recommendation 20** common code — `MMT` (millimetre), `CMT` (centimetre), `MTR` (metre), `INH` (inch), `FOT` (foot). Every measure in that anchor is expressed in that one unit. Free text such as `"cm"` or `"centimetres"` is **not** conforming: measures that software cannot compare are measures that cannot identify an object, and the canonical bytes are frozen at mint, so the unit cannot be tightened afterwards.

The code is what the document carries; it is not what a person should be shown. A client displaying a `dimensions` anchor **SHOULD** render the unit in the reader's language — `60 × 40 CMT` is a machine's sentence, `60 × 40 cm` is a human's. Optional `upperTolerance` and `lowerTolerance` are expressed in the same unit and state how far a measured object may fall outside the stated figures and still match; absent them, a verifier applies its own judgement and **MUST NOT** treat a small discrepancy as a failed check on its own (§11).

`unit_key_set` and `unit_variant_commit` are **not** part of the hard identification minimum and never substitute for it: an edition passport MUST still carry `photo` + `dimensions` + `materials` + `distinguishing_features` describing the edition.

**Hard identification minimum (enforced by the contract via `anchorTypesMask`):**

- `physical` and `mixed`: anchors MUST include `photo` (≥1) + `dimensions` + `materials` + `distinguishing_features` (mask ⊇ 15), and on-chain `imageHash` MUST be non-zero;
- `digital` and `mixed`: anchors MUST include `file_hash` (mask ⊇ 32), and on-chain `fileHash` MUST be non-zero.

A passport without this minimum does not mint: a passport without photos and measurements proves nothing about the object in front of you.

**Provenance rule (normative):** pre-registration history (previous owners, exhibitions, publications) is **not** a structured part of this standard — it is unverifiable by the protocol and would suggest false assurance. Protocol-level provenance starts at mint: `PassportMinted` → `PassportTransferred` chain → passport events → attestations.

#### Controlled values

| Field | Allowed values |
| --- | --- |
| `status` | `concept`, `prototype`, `produced_object`, `archived` |
| `contentClass` | `static`, `time_based`, `spatial`, `textual`, `composite`, `executable` |
| `aiStatus` | `none`, `assisted`, `generated` |
| `verificationMethod` | `self_asserted`, `institutional`, `nfc`, `c2pa`, `hybrid` |
| `edition.model` | `unique`, `limited`, `open`, `dynamic` |

#### Object-specific blocks

| Block | Required when | Notes |
| --- | --- | --- |
| `physical` | optional for `physical` / `mixed` | Descriptive physical facts such as `category`, `medium`, `weight`. Identification facts (dimensions, materials, marks, features, seals, photos) belong in `anchors[]`, not here. |
| `digital` | `objectType = digital` or `mixed` | Structured digital facts such as `subtype`, `format`, `fileHash`, `fileSize`, optional `c2pa`. |
| `refinementTags` | optional | Free-form refinement labels; not a replacement for the controlled taxonomy. |
| `additionalMetadata` | optional | Stable string-keyed metadata not modeled elsewhere (including former draft namespaces such as `identifiers.gtin` / `iiif` until separately specified). |

Removed relative to v0.5: `currentState` (→ on-chain append-only events), `physical.seal` (→ `nfc` / `numbered_seal` anchors), `image` / `images` (→ `photo` anchors; sidecar bytes still live under `originals/` in the bundle, §15).

#### Mixed object semantics

When `objectType` is `mixed`, the canonical JSON **MUST** contain **both** `physical` and `digital` blocks. A verifier should treat the passport as one registry object with two integrity-relevant surfaces:

1. a physical layer bound by seal / NFC / numbered-mark semantics, and
2. a digital layer bound by `fileHash` and related digital descriptors.

`mixed` is **not** a fallback label for uncertain classification; it means both layers are intentionally first-class.

#### Immutable core vs append-only events (normative)

The v0.7 line has **no** overwritable state at all:

- **Immutable and hash-bound in `passport.json`:**
  everything — the entire document is bound by `dataHash`, and the `anchors` array additionally by `anchorsHash`. The card fields (`title`, `authorName`, `shortDescription`, `domain`) are duplicated on-chain and MUST match byte-for-byte.
- **Append-only on-chain events (layer B):**
  ownership (`PassportTransferred`), status / location / rights / condition / damage / restoration / custom (`PassportEventRecorded`), attestations (`ProofSubmitted` on the proof satellite), counterfeit flags, revocation. **The current value of any mutable aspect is the latest event of that kind**; history is never lost or overwritten.
- **Consistency rule after mint:**
  if the card fields in `passport.json` differ from the on-chain card in any byte, verifiers MUST report the passport as **invalid** (TAMPERED) — not as a warning. `status` in the JSON is the state *at registration*; the current lifecycle status is the on-chain value driven by STATUS events.
- **Privacy of event payloads (normative):**
  event notes and attachments are public forever and cannot be deleted. LOCATION events MUST carry only coarse, deliberately chosen values (a city, an institution name, "in storage") — never a street address, storage-site address, coordinates, or personal data. Reference UIs MUST NOT prompt for precise addresses.

### Content class taxonomy (normative for v0.7)

To avoid binding the protocol to short-lived file format labels, implementations MUST include top-level `contentClass` in `passport.json` with one of:

- `static` — fixed still output
- `time_based` — fixed sequence over time
- `spatial` — 3D structure / geometry
- `textual` — semantic symbolic content
- `composite` — multi-file structured bundle
- `executable` — logic that runs and produces output

### Calendar `year` / `month` in `passport.json` (normative, reference v0.4+)

Top-level `year` and `month` **must** match the **UTC** calendar values passed to the mint transaction and stored on-chain — they are part of the hashed document and tie the `ODP-YYYY-MM-…` Passport ID prefix to the **mint** month. They do **not** assert the historical year a physical object was made or a file was authored. When the UI collects a separate “object year” (e.g. form field `f_year`), implementations **should** emit `**objectYear`** (integer) when it differs from the mint `year`, so provenance can still record e.g. a 19th-century work minted in 2026.

### Registration instant (UTC-only clock strings) (normative)


| Field                       | Required | Type               | Description                                                                                                                                                                          |
| --------------------------- | -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `registeredAt`              | yes      | `number` (integer) | **Unix time in seconds** (UTC instant) at registration — same instant as the on-chain `timestamp` intent.                                                                            |
| `registration`              | yes      | `object`           | Same instant as `registeredAt`, represented in privacy-safe UTC-only form.                                                                                                           |
| `registration.utcIso8601`   | yes      | `string`           | Same instant as `registeredAt`, in **UTC** with `**Z`** suffix and **second** precision (e.g. `2026-03-22T18:45:30Z`). Aligns with how chain / block time is interpreted (offset 0). |
| `registration.localIso8601` | yes      | `string`           | UTC-normalized ISO 8601 with numeric offset `**+00:00`**, **second** precision (e.g. `2026-03-22T18:45:30+00:00`).                                                                   |
| `registration.ianaTimeZone` | yes      | `string`           | Always `**UTC`** in reference privacy mode (no device-local IANA zone is recorded).                                                                                                  |


Implementations MUST use the **same** UTC instant for `registeredAt`, `registration.utcIso8601`, and `registration.localIso8601`.
If local device time is shown to users, implementations MUST normalize that instant to **UTC (GMT+0)** before writing `passport.json`.

Implementations MUST **not** record the user’s **device-local IANA time zone** (e.g. `Europe/Berlin`), MUST **not** emit **non-`+00:00`** numeric offsets in `registration.localIso8601`, and MUST **not** derive `registration.*` from the device’s **local calendar wall clock**. The field name `localIso8601` is **legacy naming** only: the value must still encode the **same UTC instant** with offset `+00:00` only (see reference `chain/tools/mint.py` and web mint).

### Canonical v0.7 example — physical object

```json
{
  "version": "0.7",
  "passportId": "ODP-2026-03-004829301",
  "title": "Object Community #1",
  "authorName": "Example Holder",
  "shortDescription": "Mixed-media painting, canvas/oil, 2025",
  "description": "Signed mixed-media object with NFC-backed seal anchor.",
  "creationDate": "2025-11",
  "domain": "contemporary_art",
  "objectType": "physical",
  "status": "produced_object",
  "contentClass": "static",
  "aiStatus": "assisted",
  "verificationMethod": "nfc",
  "edition": { "model": "limited", "number": 1, "total": 3 },
  "idGranularity": "item",
  "authorship": {
    "author": {
      "name": "Example Holder",
      "wallet": "0x742d...f2c8",
      "creatorId": "C-482-930-174-005"
    },
    "team": "Studio North"
  },
  "anchors": [
    {
      "type": "photo",
      "data": { "role": "primary" },
      "hash": "sha256:abc123..."
    },
    {
      "type": "dimensions",
      "data": { "width": 60, "height": 40, "unit": "CMT", "depth": 2 }
    },
    {
      "type": "materials",
      "data": { "list": ["canvas", "oil paint"] }
    },
    {
      "type": "distinguishing_features",
      "data": { "text": "Craquelure lower-left quadrant; retouched 2 cm scratch near frame edge" }
    },
    {
      "type": "marks",
      "data": { "text": "Signed on reverse, studio stamp on stretcher" }
    },
    {
      "type": "nfc",
      "data": {
        "uid": "04a3f912cc8b4e",
        "publicKey": "b2e3f1a9c3d2...",
        "model": "NTAG424DNA_TAGTAMPER",
        "installedAt": "2026-03-15"
      }
    }
  ],
  "year": 2026,
  "month": 3,
  "registeredAt": 1748000000,
  "registration": {
    "ianaTimeZone": "UTC",
    "localIso8601": "2026-03-22T18:30:45+00:00",
    "utcIso8601": "2026-03-22T18:30:45Z"
  },
  "refinementTags": ["artwork", "mixed_media", "signed"],
  "physical": {
    "category": "artwork",
    "medium": "mixed media"
  }
}
```

On-chain for this example: `anchorTypesMask = 1|2|4|8|16|256 = 287`; `imageHash` = the primary `photo` anchor hash; `fileHash = 0`.

### Canonical v0.7 example — digital object

```json
{
  "version": "0.7",
  "passportId": "ODP-2026-03-000193847",
  "title": "Untitled #7",
  "authorName": "Example Holder",
  "shortDescription": "Generative image, TIFF original, 2026",
  "description": "Single-edition digital work with optional C2PA manifest.",
  "creationDate": "2026-02-18",
  "domain": "digital_art",
  "objectType": "digital",
  "status": "produced_object",
  "contentClass": "static",
  "aiStatus": "generated",
  "verificationMethod": "c2pa",
  "edition": { "model": "unique" },
  "idGranularity": "item",
  "anchors": [
    {
      "type": "file_hash",
      "hash": "sha256:abc123..."
    },
    {
      "type": "perceptual_hash",
      "data": { "algorithm": "pdq", "value": "f8f8..." }
    },
    {
      "type": "c2pa",
      "hash": "sha256:def456...",
      "data": { "activeManifest": "Adobe Content Credentials" }
    }
  ],
  "year": 2026,
  "month": 3,
  "registeredAt": 1748000000,
  "registration": {
    "ianaTimeZone": "UTC",
    "localIso8601": "2026-03-22T18:30:45+00:00",
    "utcIso8601": "2026-03-22T18:30:45Z"
  },
  "refinementTags": ["image", "generative"],
  "digital": {
    "subtype": "image",
    "format": "TIFF",
    "fileHash": "sha256:abc123...",
    "fileSize": 48392810,
    "c2pa": {
      "manifestHash": "sha256:def456...",
      "activeManifest": "Adobe Content Credentials"
    }
  }
}
```

On-chain for this example: `anchorTypesMask = 32|64|128 = 224`; `fileHash` = the `file_hash` anchor value; `imageHash = 0` (no preview registered).

### Canonical v0.7 example — mixed object

```json
{
  "version": "0.7",
  "passportId": "ODP-2026-03-000555120",
  "title": "Executable Sculpture #2",
  "authorName": "Example Holder",
  "shortDescription": "Sculpture with realtime software, aluminium/electronics, 2026",
  "description": "Physical sculpture paired with executable realtime software.",
  "creationDate": "2026-01-30",
  "domain": "contemporary_art",
  "objectType": "mixed",
  "status": "prototype",
  "contentClass": "composite",
  "aiStatus": "assisted",
  "verificationMethod": "hybrid",
  "edition": { "model": "dynamic" },
  "idGranularity": "item",
  "authorship": {
    "author": {
      "name": "Example Holder",
      "wallet": "0x742d...f2c8",
      "creatorId": "C-482-930-174-005"
    },
    "coAuthors": [{ "name": "Collaborator A" }]
  },
  "anchors": [
    { "type": "photo", "data": { "role": "primary" }, "hash": "sha256:1122bb..." },
    { "type": "dimensions", "data": { "width": 120, "height": 80, "depth": 40, "unit": "CMT" } },
    { "type": "materials", "data": { "list": ["aluminium", "custom electronics"] } },
    { "type": "distinguishing_features", "data": { "text": "Hand-soldered controller board, serial ES-2 engraved inside base" } },
    { "type": "marks", "data": { "text": "Internal serial ES-2" } },
    { "type": "numbered_seal", "data": { "number": "SL-00429831", "type": "holographic sticker" } },
    { "type": "file_hash", "hash": "sha256:99aa77..." }
  ],
  "year": 2026,
  "month": 3,
  "registeredAt": 1748000000,
  "registration": {
    "ianaTimeZone": "UTC",
    "localIso8601": "2026-03-22T18:30:45+00:00",
    "utcIso8601": "2026-03-22T18:30:45Z"
  },
  "refinementTags": ["installation", "software", "sensor_based"],
  "physical": {
    "category": "object"
  },
  "digital": {
    "subtype": "software",
    "format": "ZIP",
    "fileHash": "sha256:99aa77...",
    "fileSize": 148392810
  },
  "additionalMetadata": {
    "installationPower": "220V",
    "controllerVersion": "2.3.1"
  }
}
```

On-chain for this example: `anchorTypesMask = 1|2|4|8|16|512|32 = 575`; both `imageHash` and `fileHash` non-zero.

### Legacy note on old subtype/category fields

`physical.category` and `digital.subtype` MAY still be included as descriptive sub-fields, but they are **secondary descriptors** only. Primary v0.7 classification MUST come from `domain`, `objectType`, `status`, `contentClass`, and optional `refinementTags`.


### Digital authorship principle

**Register before publishing.**

The creator who registers the file hash first is the author of record.
After registration, only derivative versions (compressed, watermarked,
reduced resolution) should be published publicly. The original file must
remain with the creator as cryptographic proof of authorship.

```
DO:     Register → then publish compressed/watermarked versions
DON'T:  Publish the original file before registering its hash
```

If someone else publishes the same file, the blockchain timestamp proves
who registered first.

### C2PA compatibility

ODP is compatible with the C2PA (Coalition for Content Provenance and Authenticity)
standard at the file hash level.

**Level 1 — Hash compatibility (autopol):**
If a file already contains an embedded C2PA manifest (created by Photoshop,
Lightroom, a Leica camera, or any C2PA-compliant tool), the SHA-256 of that
file captures both the content and the manifest inseparably.
No additional steps are required.

**Level 2 — Manifest hash (optional):**
If the creator wishes to make the C2PA manifest explicitly verifiable,
they may record its hash separately in `digital.c2pa.manifestHash`.
Verifiers that support C2PA can use this to display the full C2PA
provenance chain alongside the ODP verification result.

Recommended structure:

```json
"digital": {
  "subtype": "image",
  "fileHash": "sha256:...",
  "c2pa": {
    "manifestHash": "sha256:...",
    "activeManifest": "optional label"
  }
}
```

C2PA presence should be determined by a C2PA parser/validator (active manifest or manifest store found), not by ad-hoc byte signatures.
If no C2PA metadata is found, `digital.c2pa` should be omitted.

**Level 3 — ODP profile ID as C2PA assertion (future):**
C2PA allows custom assertions inside a manifest. A future extension of
this specification may define a standard `odp:creatorId` assertion,
allowing ODP profile IDs to be embedded inside C2PA manifests.

### Serialization rules

All string values in `passport.json` **must be in Unicode NFC normalization**
before hashing. This ensures identical `dataHash` across all implementations
regardless of platform (Python, JavaScript, mobile).

```
# Python
import unicodedata
value = unicodedata.normalize("NFC", value)

// JavaScript
value = value.normalize("NFC")
```

Any implementation that computes `dataHash` must normalize all string fields
to NFC before serialization. Failure to do so will cause legitimate passports
to appear as TAMPERED on other implementations.

### Rules

- `version`, `passportId`, `title`, `authorName`, `shortDescription`, `objectType`, and `anchors` are required
- For physical / mixed objects: anchors MUST include `photo` + `dimensions` + `materials` + `distinguishing_features`
- For digital / mixed objects: anchors MUST include `file_hash` and `digital.fileHash` is required
- The card fields (`title`, `authorName`, `shortDescription`, `domain`) MUST equal the on-chain values byte-for-byte
- `passportId` in JSON must exactly match the on-chain record (legacy `humanId` accepted for older exports)
- `authorship.author.wallet`, when present, must match the registered wallet in the Creator Registry
- Encoding: UTF-8
- The file must be minified before hashing

---

## 10. Hashing

### `dataHash`

```
dataHash = SHA-256( minified passport.json bytes )
```

1. Normalize all string **values** to Unicode NFC. Keys are left as written
2. Construct `passport.json` with all fields
3. Sort all keys at every nesting level, by UTF-16 code unit
4. Minify: no whitespace outside string values
5. Serialize per the rules below
6. Encode as UTF-8 bytes
7. Compute SHA-256 → store as `bytes32`

#### Serialization rules (normative)

Steps 1–4 leave two things open that implementations do in fact disagree on:
how a string is escaped, and how a number is rendered. Both change the bytes and
therefore the hash, which is anchored on chain and immutable (§8) — so a
disagreement here produces passports another implementation can never verify,
with no way to correct them after the mint.

The rules are those of ECMAScript `JSON.stringify`, which is what the reference
verifier ([`frontend/verify.html`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/frontend/verify.html), in the website
repository) applies:

- **Strings** escape only `"`, `\` and the C0 controls — `\b` `\t` `\n` `\f`
  `\r`, and `\u00XX` for the rest. `/` is **not** escaped. Non-ASCII travels as
  literal UTF-8 and is **never** written as `\uXXXX`.
- **Numbers** use the ECMAScript `Number::toString` form: the shortest
  representation that round-trips, no trailing `.0` on an integral value, no `+`
  on a positive exponent. An integer is written as an integer.
- **Key order** is by UTF-16 code unit — the order ECMAScript
  `Array.prototype.sort` gives the key strings, not a locale-aware collation.

Two consequences worth stating outright, because both have produced
non-verifiable passports in practice:

- A title such as `Портрет 1/25` must hash with a bare `/`. Foundation's
  `JSONSerialization` writes `\/` and will not reproduce the hash.
- A dimension of `0.1` must serialize as `0.1`. A serializer that emits 17
  significant digits renders it `0.10000000000000001`.

Conformance vectors — an input document, its exact canonical bytes and the
resulting hashes — are in [`schema/vectors/`](schema/vectors/README.md). Compare
bytes before comparing hashes: a byte diff localizes the fault, a hash mismatch
only reports that there is one.

### `anchorsHash`

```
anchorsHash = SHA-256( minified canonical anchors array bytes )
```

The `anchors` array is extracted from `passport.json`, canonicalized with the **same rules** as `dataHash` (NFC normalization, keys sorted at every level, minified, UTF-8), and hashed as a standalone JSON array.
This lets a verifier check the identification block in isolation — for example against bytes delivered by an offline carrier — without possessing the full passport document. The contract also stores `anchorTypesMask`, the OR of the type bits (§9), and enforces the hard identification minimum per `objectType` at mint.

### `fileHash` (digital objects)

```
fileHash = SHA-256( raw file bytes )
```

Take the original file. Do not recompress, resize, or modify.
Compute SHA-256 of raw bytes. Store as hex string with `sha256:` prefix:

```
"sha256:abc123def456..."   ← correct format in passport.json
```

This format is used consistently in passport.json, Python CLI, and web UI.
The on-chain `fileHash` field is a raw `bytes32` (without prefix).

### `imageHash`

```
imageHash = SHA-256( raw image file bytes )
```

Do not modify the file in any way before hashing.

### NFC / QR carriers and offline payloads (informative)

The dedicated `ndppCommitmentHash` / `ndppCommitmentUri` fields of the v0.5 line are **removed** in v0.6. NFC and QR remain an **optional carrier layer** only: a passport may be delivered and verified through QR, direct `**.odpass`** hosting, a printed certificate, or manual Passport ID lookup without any NFC tag.

An offline or carrier-delivered payload is verified against the existing anchors instead of a separate commitment:

- the full canonical `passport.json` bytes → compare to `**dataHash`**;
- the canonical `anchors` array bytes alone → compare to `**anchorsHash`** (compact identification payload for low-bandwidth carriers).

DPP / sustainability disclosure remains outside the normative ODP core; implementations MAY publish such data off-chain (e.g. in `additionalMetadata` or separate documents) without protocol-level anchoring.

---

## 11. Verification Algorithm

### Level 1 — Object authenticity (always available)

```
INPUT: passportId (from QR, NFC, or manual entry)

1. Query contract read surface:
   - `getPassportHeader(passportId)`   → card (title, authorName, shortDescription, domain), IDs, owner
   - `getPassportClassification(passportId)`
   - `getPassportMedia(passportId)`    → dataHash, anchorsHash, anchorTypesMask, imageHash, fileHash, URLs
   - `getPassportEvents(passportId)`   → eventCount, lastEventKind, lastEventAt, current lifecycleStatus

2. If not found → INVALID

3. Query Creator Registry: getCreator(creatorId)
   → attach profile record to result

4. Query attestations: getProofsForPassport(passportId) on the proof
   satellite; query getCounterfeitConcern(passportId) on the concern
   satellite. Display registration timestamp, attestations, and any
   active concern flag — the duplicate-passport model is reputational
   (the protocol does not decide which of two competing passports is
   "the real one"; humans weigh these signals).

5. Fetch from `dataUrl`: HTTP **200** body MUST be a **`.odpass`** file (§15 ZIP); extract `passport.json` (ZIP local header `PK\x03\x04`; path SHOULD end with **`.odpass`**). Raw JSON at `dataUrl` is **not** allowed (§9).

6. If fetch fails → UNVERIFIABLE
   (on-chain record still proves the object was registered)

7. Minify JSON → compute SHA-256 → compare to dataHash
   Extract anchors array → canonicalize → SHA-256 → compare to anchorsHash;
   check actual anchor types against anchorTypesMask

8. Compare card fields byte-for-byte:
   JSON title / authorName / shortDescription / domain == on-chain values;
   JSON objectType / year / month == on-chain values

9. All match → AUTHENTIC
   Any mismatch in steps 7–8 → TAMPERED (not a warning)
```

### Authorship and legal rights (informative)

On-chain `**creator**`, `**creatorId**`, and content **hashes** show **who registered** the passport under **which deployment** and **which bytes** were committed. They are **not** a substitute for national **copyright**, **moral rights**, or **title** to a physical object. End users still rely on the **reputation of the issuing party**, public identity publication (§3), and cross-checks with other systems (**DPP**, **C2PA**, institutional catalogs, etc.) when those apply.

### Level 1B — Creator wallet proof (off-chain, EIP-191)

**Purpose:** Prove control of the **creator wallet** (`passport.creator`) **without** a blockchain transaction (no gas for the verifier).

**Not** proof of authorship of the artwork in a legal sense — only that the signer controls the key bound to that passport on-chain.

**Canonical message (v1)** — UTF-8 string, signed with Ethereum **EIP-191** (`personal_sign` / `eth_sign` with the standard message prefix):

```
Object Digital Passport — creator wallet proof (EIP-191) v1

passportId: <Passport ID>
chainId: <decimal chain ID>
contract: <registry contract address, EIP-55 checksum recommended>
nonce: <random unique string, e.g. 0x-prefixed hex>
```

**Verification steps:**

1. `recoveredAddress = ecrecover(EIP191(message), signature)` (as implemented by `ethers.verifyMessage` / equivalent).
2. `getPassportHeader(passportId)` on the registry for that chain → read `creator`.
3. **Match** if `recoveredAddress == creator` (compare as addresses, case-insensitive).

The verifier should confirm `chainId` and `contract` in the message match the deployment being queried. Implementations may reject messages whose `passportId` line does not match the passport being checked.

**Reference web UI:** The `verify.html` page shipped in this repository does **not** expose Level 1B. Integrators and wallets may still implement Level 1B per this section for interoperable off-chain proofs; the normative message format and verification steps above remain unchanged.

### Level 1C — External document hash (PDF, contract file)

**Purpose:** Anchor **SHA-256** of an off-chain file (e.g. PDF contract) to a **Creator wallet** on-chain so counterparties can verify the same bytes without trusting email attachments alone.

**Reference v0.7 (normative in this specification):** The main `**ObjectDigitalPassport`** contract does **not** include `attestExternalDocument` / `**getExternalDocumentAttestation`** (removed for **EIP-170**). Level 1C is implemented only by the satellite `**ODPWalletDocumentAnchor`**: deploy after the main registry and pass the registry address to its constructor. It enforces registration via the main contract’s `**getCreatorByWallet`**, exposes `**attestExternalDocument`**, `**getExternalDocumentAttestation`**, and emits `**ExternalDocumentAttested`** with `**documentHash` indexed** (plus indexed `creatorId` and `**attestor`**) so verifiers can filter logs by hash. At most one attestation per `(wallet, documentHash)` per anchor contract. The reference repo deploys the satellite from `**chain/deploy/scripts/deploy.js`**; to attach an anchor to an already deployed registry, use `**chain/deploy/scripts/deploy-doc-anchor-only.js`** (see `**chain/deploy/README.md`**). Both reference addresses are listed in §7 (Reference deployment addresses).

Older protocol lines that exposed these functions on the monolithic main registry are **out of scope** for this document — only the split (main registry + `**ODPWalletDocumentAnchor`**) is specified here.

For a **document tied to a passport** (e.g. an expertise report), use an attestation with `**documentHash`** on the proof satellite (§4, §13) — the v0.5 `auxCommitment*` fields are removed in v0.7.

**On-chain (`ODPWalletDocumentAnchor`, reference v0.7):**

- `attestExternalDocument(bytes32 documentHash, string documentUri)` — caller must be registered on the **main** registry; `documentHash` is SHA-256 of raw file bytes (same as `fileHash` encoding); `documentUri` optional HTTPS URL (max 512 chars); **at most one** attestation per `(wallet, documentHash)` in that anchor contract.
- `getExternalDocumentAttestation(address wallet, bytes32 documentHash)` — returns `attested`, `creatorId`, timestamp, and `documentUri`.

**Verification:** compute SHA-256 of the local file; query `**ODPWalletDocumentAnchor`**; **match** means the wallet recorded this hash at `timestamp`. This does **not** replace qualified e-signatures or national law — it is a **public, immutable anchor** tying a wallet to a file hash.

**Reference web UI:** `verify.html` implements Level 1C when the stack supports it (**generation ≥ 2** in `odp-contract.js`). Writes and discovery use `**NET.docAnchor`** (the deployed `**ODPWalletDocumentAnchor`**); without it, Anchor a file (wallet) stays hidden. Check file hash on-chain uses the configured anchor and `**ExternalDocumentAttested`** / `**getExternalDocumentAttestation**`.

- **Anchor (submit):** a registered wallet calls `attestExternalDocument(documentHash, documentUri)` on `**ODPWalletDocumentAnchor`**. The reference UI allows an optional HTTPS URL (max 512 chars).
- **Check (verify):** the user uploads a file; the page computes SHA-256 locally, then searches for attestations of that hash via `**ExternalDocumentAttested`** (**indexed `documentHash`**) and confirms with `**getExternalDocumentAttestation**` on the anchor. The UI performs **global** discovery and does **not** require a profile ID or wallet filter.

### Level 2A — NFC seal verification (physical objects with an `nfc` anchor)

**Primary path for NTAG 424 DNA (`odp-ntag424-ev2-symmetric-cr-v1`):**

```
1. Obtain the `nfc` anchor from passport.json and confirm its integrity
   against on-chain dataHash (or the anchors array against anchorsHash);
   read the 16-byte EV2 AES application key from the anchor
2. Run AuthenticateEV2First on the tag using that key
3. Mutual challenge-response (RndA/RndB) completes
4. Match    → SEAL_NFC_AUTHENTIC
   No match → SEAL_NFC_INVALID
```

If the anchor's `data.model` is `NTAG424DNA_TAGTAMPER`:

```
5. Read tamper status after EV2 auth
   INTACT   → SEAL_NFC_INTACT
   TAMPERED → SEAL_NFC_TAMPERED
```

`Read_Sig` proves NXP originality, not passport binding. EV2 session auth alone is necessary but, under the primary profile, `chipKeyMatch` means the mutual challenge-response succeeded with the on-chain key bytes.

### Level 2B — Numbered seal verification (physical objects with a `numbered_seal` anchor)

```
1. Read the `numbered_seal` anchor's data.number from passport.json
   (integrity-anchored via dataHash / anchorsHash)
2. User visually compares number on object to number in passport
3. Cannot be automated — requires human inspection
```

### Level 2D — Physical anchor inspection (the identification minimum)

```
1. Read the photo, dimensions, materials, distinguishing_features
   (and optional marks) anchors from passport.json
2. Compare the physical object against them: photos, measured
   dimensions, materials/technique, and the distinguishing features
   a copy would not reproduce
3. Cannot be automated — requires human inspection; this is the
   Object ID-style core check for objects without a crypto seal
```

### Level 2C — File hash verification (digital objects)

```
1. User provides the original file
2. Compute SHA-256 of raw file bytes
3. Compare with fileHash from blockchain
4. Match    → FILE_AUTHENTIC (this is the registered original)
   No match → FILE_MISMATCH (different file — not the registered original)
```

### Level 3 — Image authenticity (optional)

```
1. If imageHash == 0x000...0 → NO_IMAGE_REGISTERED, stop
2. Compute SHA-256 of raw image bytes
3. Match    → IMAGE_AUTHENTIC
   No match → IMAGE_REPLACED
```

### Verification states


| State                 | Meaning                                             |
| --------------------- | --------------------------------------------------- |
| `AUTHENTIC`           | Object registered, passport data verified           |
| `INVALID`             | passportId not found on blockchain                  |
| `UNVERIFIABLE`        | Record exists, but dataUrl is unreachable           |
| `TAMPERED`            | Hash mismatch — passport.json was modified          |
| `SEAL_NFC_AUTHENTIC`  | NFC chip signature verified                         |
| `SEAL_NFC_INVALID`    | NFC chip signature failed                           |
| `SEAL_NFC_INTACT`     | TagTamper: seal never removed                       |
| `SEAL_NFC_TAMPERED`   | TagTamper: seal was removed at some point           |
| `FILE_AUTHENTIC`      | File hash matches — this is the registered original |
| `FILE_MISMATCH`       | File hash does not match                            |
| `IMAGE_AUTHENTIC`     | Image hash matches                                  |
| `IMAGE_REPLACED`      | Image hash mismatch                                 |
| `NO_IMAGE_REGISTERED` | No image hash on record                             |
| `UNIT_IN_EDITION`     | v0.7 (§20): unit key proven to be a member of the edition's `unit_key_set` |
| `UNIT_NOT_IN_EDITION` | v0.7 (§20): Merkle proof failed — this key was not in the run at mint time |
| `UNIT_NOT_ACTIVATED`  | v0.7 (§20): member key with no activation record — the expected state of an unopened unit |
| `UNIT_ACTIVATED`      | v0.7 (§20): activation record exists; reported **with its timestamp** and **without a verdict** (§20.11) |
| `UNIT_PASSPORT_CONFLICT` | v0.7 (§20): more than one unit passport exists for the same unit; all are reported, unranked and without a verdict (§20.11) |
| `EDITION_REVOCABLE`   | v0.7 (§20.13): no unit of the edition has been activated, so the issuer's revocation right is still live — MUST be visible to a buyer |
| `EDITION_NOTICE`      | v0.7 (§20.13): the issuer recorded an append-only edition notice (superseded, compromised key set, recall); shown on the edition **and** on every unit passport under it, never as a verdict on an individual unit |


### Assurance tiers (normative)

A verifier MAY summarize the strength of the evidence bound to a passport as a single **assurance tier**. Tiers are a display-layer summary of §11 checks — they exist so a non-expert can see the degree of binding at a glance.

**Computation rule (normative):** a tier is **derived at view time** from current on-chain state (`anchorTypesMask`, proof records, counterfeit-concern flags, revocation, and the §11 hash checks). It MUST NOT be stored on-chain, encoded into a Passport ID or Profile ID, or printed on objects, certificates, or labels as a static claim — a printed "tier" is exactly the kind of stale assurance this protocol exists to prevent. The only value printed on an object is the Passport ID (§2, §5).

| Tier | Criteria (all lower tiers included) |
| --- | --- |
| — (no tier) | Passport `INVALID`, `TAMPERED`, or revoked. No tier is shown; the failure state dominates. |
| **Base** | Valid v0.7 passport: hard identification minimum present in `anchorTypesMask`, and — when the bundle is available — `dataHash`, `anchorsHash`, and the byte-for-byte card check all pass. |
| **Sealed** | Base + a seal anchor (`nfc` = bit 256 or `numbered_seal` = bit 512) present and integrity-bound. |
| **Attested** | Base + at least one institutional proof record (§4) from a P/M profile on the paired proof registry. A seal is not required for this tier. |

**Downgrade rule (normative):** an active institutional counterfeit concern (§4) does not remove a tier but MUST be displayed at least as prominently as the tier itself. A revoked passport has no tier regardless of anchors or proofs.

**No chain, no tier (normative):** a verifier that could not read the registry **MUST NOT** show a tier at all, and **MUST** say that it could not reach it. A bundle that is internally consistent is not a verified passport; see §15.3 for what an offline check does and does not establish.

**Revoked issuer (normative):** a passport whose issuing profile carries a non-zero `revokedAt` (§3.1) keeps its tier — the anchors and proofs are what they were, and the object did not change. The verifier **MUST** show that the issuing profile was stopped, and **MUST NOT** present the stop as a verdict on the object. Where the issuer publishes a `compromised` statement naming that profile (§3.1), the verifier **SHOULD** compare the passport's mint time with `since` and say plainly which side of it the record falls on; where no statement is available, it **MUST NOT** invent a date or imply the whole history is suspect. A stopped profile is a fact about an issuer, not a defect in every object that issuer ever registered.

**Verified vs declared (normative):** when the verifier could not obtain the passport bundle (`UNVERIFIABLE` / no public URL), the tier reflects **on-chain declarations only** and MUST be visually marked as such (e.g. "declared"). When the bundle checks passed, the tier MAY be marked as verified. A web verifier MUST NOT imply that a **Sealed** tier means a live chip check happened — the EV2 challenge-response (§6, Level 2A) runs only in an NFC-capable verifier, and its result is reported separately (`SEAL_NFC_*`).

**Honesty rule (normative):** the tier label MUST be presented as a measure of *binding evidence*, never as an authenticity verdict. A Base-tier passport from an honest issuer is not "worse" than a Sealed-tier passport from a fraudulent one; the human checks of §11 (issuer identity, distinguishing features) remain decisive at every tier.

---

## 12. QR Code and protocol URI schemes

### 12.1 The `odp` scheme (normative)

There is a **single** URI scheme name: `**odp`**. The **authority** (RFC 3986) is one unencoded token — either:

- a **Passport ID** as defined in §2, e.g. `odp://ODP-2026-03-004829301`, or  
- a **Profile ID** as defined in §3, e.g. `odp://P-482-930-174-005`.

Clients **MUST** distinguish passport vs profile by the grammar of the authority string: Passport IDs begin with `**ODP-`**; Profile IDs begin with `**C-`**, `**B-**`, `**P-**`, or `**M-**`. No path or query in this specification revision.

### 12.2 QR encoding (normative minimum)

Primary examples:

```
odp://ODP-2026-03-004829301
odp://P-482-930-174-005
```

- Error correction: **Q** (25%) minimum
- Encoding: UTF-8

**No hostname is printed (normative).** What goes onto an object is the `odp://` URI and the
human-readable Passport ID (§5) — never the address of a website. A printed hostname is a
promise about a server, made permanent on an object that will outlive it: the domain lapses, the
organisation is sold, the path is restructured, and the carrier now points at nothing or at
somebody else. The URI names the passport; §12.3 says how a client turns that into a registry
read. An implementation MAY offer an HTTPS page as a convenience for a phone that has no ODP
handler, but MUST NOT print or encode that address as the identifier of the object.

Hierarchical paths (`/passports`, `/proofs`) and query parameters beyond a future normative definition are **reserved / experimental** — implementations **MUST NOT** rely on them for interoperability until specified.

### 12.3 Registry context (normative)

An `odp://` URI **does not** identify **chain ID** or **registry contract address**. Any client that resolves these URIs to on-chain reads **MUST** obtain **registry context** (`chainId`, main registry `address`, ABI, optional satellite addresses) from configuration, a **trusted** deeplink, or a **trusted** resolver (§19).

**Default context:** absent an explicit registry context, a client **SHOULD** resolve the URI against the **canonical registry** of §7 (Polygon PoS, chain ID 137), and **MUST** show which registry produced the result whenever it resolves against any other. **On this line §7 has no canonical registry**, so a client without an explicit context **MUST** say it cannot resolve rather than pick one. A client that silently resolves against a non-canonical registry, without saying so, is misleading its user.

---

## 13. SDK Requirements

### Almost-ERC Read Standard (reference main registry + satellites)

This section defines the practical read/write surface integrators should align with for the reference `**ObjectDigitalPassport`** line (**v0.7**; packed byte **6** at mint).

Level 1 (core reading)

- `getPassportHeader(passportId) -> PassportHeaderView` (includes the on-chain card: `title`, `authorName`, `shortDescription`, `domain`)
- `getPassportClassification(passportId) -> PassportClassificationView`
- `getPassportMedia(passportId) -> PassportMediaView` (`dataHash`, `dataUrl`, `imageHash`, `imageUrl`, `fileHash`, `anchorsHash`, `anchorTypesMask`)
- `getPassportEvents(passportId) -> PassportEventsView` (`eventCount`, `lastEventKind`, `lastEventAt`, `lifecycleStatus`; full history via `PassportEventRecorded` logs)
- `getCreator(creatorId) -> CreatorRecord`
- `governance() -> address`

Optional — **counterfeit / authenticity concern:** `getCounterfeitConcern(passportId) -> (active, proverCreatorId, reasonHash, ts)` on `**ODPCounterfeitConcern`** (satellite); not on `**ODPWalletDocumentAnchor`**. Writes: `**raiseCounterfeitConcern(passportId, reasonHash)`**, `**clearCounterfeitConcern(passportId)**` (**P** / **M** only; clearer = raiser).

Optional — **proof satellite (`ODPPassportProofRegistry`):**

- `submitProof(passportId, documentHash, documentUrl, year, month) -> proofId` — v0.7 attestation: "this passport/object was examined" as a whole; `documentHash` optionally anchors a signed expertise document
- `getProofsForPassport(passportId) -> string[]` (proof IDs; verifiers SHOULD paginate **client-side** if the list may be large)
- `getProof(proofId) -> ProofRecord`

Optional — **relations satellite (`ODPRegistryRelations`):**

- `getCreatorPublishingDelegation(creatorWallet) -> (agent, expiresAt)`
- `getAffiliationAudit(childId) -> (activeParent, joinedAt, detachedAt, lastDetachedFromParent)`
- `delegateCreatorPublishing(agent, expiresAt)`
- `revokeCreatorPublishing()`
- `requestMintAgentRole(principalCreatorId)` / `confirmMintAgentRole(agent)` / `revokeMintAgentRole()`

Optional — **author attestation satellite (`ODPAuthorAttestation`, §8 B):**

- `attestAuthor(passportId, authorSigner, signature)` — EIP-712; caller must be the passport `creator` or `owner`; one-shot per passport
- `getAuthorAttestation(passportId) -> (attested, authorSigner, dataHash, creatorId, timestamp)` — verifiers MUST check the returned `dataHash` still equals the passport’s current on-chain `dataHash`
- `hashAuthorAttestation(passportId, dataHash, creatorId, authorSigner) -> bytes32`, `domainSeparator() -> bytes32`

Optional — **extension mint router (`ODPExtensionMintRouter`):**

- `setMintExtension(mintClass, extension)`
- `mintDigitalViaExtension(mintClass, payload, dataUrlIsFolderBase, mintOnBehalfOfCreatorId)`
- `mintPhysicalViaExtension(mintClass, payload, dataUrlIsFolderBase, mintOnBehalfOfCreatorId)`

Optional Level 1 list endpoints

- `getPassportsByCreatorPaged(creatorWallet, offset, limit) -> string[]` — bounded slice on the deployable main registry
- legacy / convenience `getPassportsByCreator(creatorWallet) -> string[]` MAY exist on older deployments, but deployable split-line integrations SHOULD NOT require it

**Composite read (replacing removed `resolvePassport`):** `getPassport*View` reads from the main registry + `getCreator(passport.creatorId)` + optional proof-satellite count + `CONTRACT_VERSION` (public constant).

Core guarantees (invariants)

- The card (`title`, `authorName`, `shortDescription`, `domain`) and all hashes (`dataHash`, `anchorsHash`, `imageHash`, `fileHash`) are immutable after mint; the card has no edit path (typo = revoke + re-mint).
- All mutable aspects are **append-only**: `recordPassportEvent` only adds records; nothing is overwritten and history is never lost.
- `updatePassportUrls()` may change **only** `dataUrl` and `**imageUrl`** (hosting hints) and requires `confirmedDataHash == on-chain dataHash`; caller must be `**creator` or `owner`**, or the **issuer’s active publishing agent** (`getCreatorPublishingDelegation(passport.creator)`).
- `**submitProof` and `recordPassportEvent` revert** if the passport is **revoked**.

Affiliation note (`B` / `M` / `P`, one parent per child)

- `getAffiliatedChildren(parentId) -> string[]` returns the full list; verifiers/frontends MUST treat the result as potentially large and apply **client-side** pagination or caps, or use `**getAffiliatedChildrenPaged(parentId, offset, limit)`** on the relations satellite.
- Hard caps: a single parent can have at most **100 active children**, and a single child at most **100 pending parent proposals**, at any moment. Cycle checking walks at most **8** ancestors; a proposal whose chain exceeds that reverts `EC(69)`.

Document anchoring

- `**getExternalDocumentAttestation(wallet, documentHash)`** on `**ODPWalletDocumentAnchor`** (reference **v0.7** — configure `**NET.docAnchor`**) returns metadata for a single `(wallet, hash)` attestation when present.
- Reference `**verify.html`**: file-hash check and wallet submit require external-doc support (generation ≥ 2) and `**NET.docAnchor`** on `**ODPWalletDocumentAnchor**` (see §Level 1C).

```
verify(passportId) → VerificationResult
  .status       // AUTHENTIC | INVALID | UNVERIFIABLE | TAMPERED
  .record       // on-chain data
  .creator      // Creator Registry record (always present)
  .proofs       // list of Proof records with institution data
  .passport     // parsed passport.json (if available)

verifyNFC(passportId, challenge, chipResponse) → NFCResult
  .status       // SEAL_NFC_AUTHENTIC | SEAL_NFC_INVALID
  .tamperStatus // SEAL_NFC_INTACT | SEAL_NFC_TAMPERED | null

verifyFile(passportId, fileBytes) → FileResult
  .status       // FILE_AUTHENTIC | FILE_MISMATCH

verifyImage(passportId, imageBytes) → ImageResult
  .status       // IMAGE_AUTHENTIC | IMAGE_REPLACED | NO_IMAGE_REGISTERED

mint(params) → passportId
  // unified PassportMintInputs tuple: card + hashes + anchorsHash
  //   + anchorTypesMask + initialOwner
  // initialOwner: address(0) = the minting principal; otherwise that address
  // physical: anchors minimum photo+dimensions+materials+distinguishing_features, imageHash != 0, fileHash == 0
  // digital: file_hash anchor, fileHash != 0
  // mixed: both rule sets
  // wallet must be registered (profile ID mandatory)

recordPassportEvent(passportId, kind, value, note, attachmentHash, attachmentUrl)
  // append-only layer B; creator / owner / governance

registerCreator(type) → creatorId
  // type: "C" | "B" | "P" | "M"

revokeCreator()
  // caller's own profile; irreversible; stops future issuance only (§3.1)

submitProof(passportId, documentHash, documentUrl, year, month) → proofId
  // caller must be registered as type P or M; year/month are proof-event calendar values for the PRF id

proposeAffiliation(parentId)
confirmAffiliation(childId)
detachAffiliation(childId)   // active parent only
cancelAffiliationRequest(parentId)
isAffiliationPending(parentId, childId) → bool
getAffiliatedParent(childId) → string
getAffiliatedChildren(parentId) → string[]

transferPassport(passportId, newOwner)
delegateCreatorPublishing(agent, expiresAt)
revokeCreatorPublishing()
revokePassport(passportId, reasonHash)
// Counterfeit concern: ODPCounterfeitConcern (satellite)
// raiseCounterfeitConcern(passportId, reasonHash)
// clearCounterfeitConcern(passportId)
transferGovernance(newGovernance)
freeze()  // deployer only; irreversible; blocks writes. v0.x safety hatch — planned removal in stable v1

getCreator(creatorId) → CreatorRecord
getProofsForPassport(passportId) → ProofRecord[]

computeDataHash(passportJson) → bytes32
computeAnchorsHash(anchorsArray) → bytes32
computeFileHash(fileBytes) → bytes32
computeImageHash(imageBytes) → bytes32
```

---

## 14. Versioning

- This specification draft line is **v0.7** in this repository branch; `passport.json` uses `version: "0.7"`.
- On-chain `**CONTRACT_VERSION`** is the packed byte (`SPEC_MAJOR * 16 + SPEC_MINOR`, each **< 16**); the reference **v0.7 branch** mints byte **7**. The bytecode **omits** public `**SPEC_MAJOR()` / `SPEC_MINOR()`** and `**MONTHLY_LIMIT_*()`** getters (EIP-170): derive **major** as `CONTRACT_VERSION >> 4`, **minor** as `CONTRACT_VERSION & 0x0f`, and use normative **C = 1000** / **B = 100_000** from `ObjectDigitalPassport.sol` when limits are not exposed.
- Breaking changes increment the minor **document** `version` inside `passport.json`.
- Stable release will be `1.0`
- All `passport.json` files include a `version` field for forward compatibility
- The contract is not upgradeable — a new protocol version deploys a new contract
- Type prefixes may only be added through an official specification update

---

## 15. `.odpass` bundle (offline container)

The **normative** portable file is `**.odpass`**: a ZIP container for distributing and backing up an ODP passport.

It is designed to enable offline verifiers to recompute hashes and validate them against on-chain records.
The on-chain fields remain the cryptographic source of truth.

### 15.1 Format

The container is a **ZIP** file **named** `**.odpass`** (entries inside use UTF-8 filenames).

Expected ZIP entries:

- Mandatory:
  - `passport.json` — the canonical ODP `passport.json` document bytes (UTF-8 text).
  - `manifest.json` — bundle metadata for UX (not a trust anchor).
- Optional (current reference bundle layout; `manifest.json` `**bundleVersion`** identifies the layout):
  - All anchored byte files live under `**originals/<role>__<filename>`** (UTF-8 path segments; `<role>` is a short ASCII token such as `digital`, `image`, `photo2` so basenames cannot collide).
  - `**manifest.originals`** — object whose values are the **exact ZIP paths** (strings) for sidecars, keyed by anchor semantics:
    - `fileHash` → path of bytes matching on-chain `fileHash` (digital original asset when present).
    - `imageHash` → path matching the on-chain primary `imageHash` when present.
    - additional `photo` anchors MAY use keys matching their anchor `hash` semantics (implementation-defined, e.g. `photo2`); the comparison target is always the `sha256:` value inside the anchor.
  - Omitted keys mean that sidecar was not included in the bundle.

**Normative rule:** sidecar bytes MUST use the `**originals/`** layout above. Separate top-level folders per sidecar (`original/*`, `image/*`) MUST **not** appear as the sole sidecar layout in a conforming bundle.

#### 15.1.1 Reference `manifest.json` shape (implementations)

Reference tooling writes `manifest.json` as UTF-8 JSON with at least — [`frontend/passport.html`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/frontend/passport.html) in the website repository, and `chain/tools/mint.py` here:

- `format`: `"odpass-bundle"` (legacy bundles MAY use `"odp-bundle"`)
- `bundleVersion`: string for the bundle layout exported by reference tooling (older manifest layout strings may still read)
- `passportId` (or legacy `humanId`), `createdAtUtc` (UTC ISO-8601, e.g. `2026-03-22T12:00:00Z`), `mode` (e.g. `"full"`)
- `onChain`: `dataHash`, `anchorsHash` (`0x` + 64 hex), `anchorTypesMask` (integer), `imageHash`, `fileHash` (`0x` + 64 hex, or all-zero), `txHash`, `chainId`, `contract` (checksummed address string where applicable)
- `originals`: map of logical keys (`fileHash`, `imageHash`, …) to **ZIP entry paths** under `originals/` (explicit strings; normative for resolving sidecar bytes in current reference bundles)
- `files`: array of `{ path, role, mime }`; sidecar entries MAY include `sizeBytes` and `sha256` (`0x` + 64 hex)

Implementations MAY add keys. Verifiers MUST NOT treat `manifest.json` as a trust anchor; on-chain hashes and `passport.json` bytes remain authoritative. Verifiers MAY use `manifest.originals` only as a **hint** for which ZIP entry to hash; the on-chain `bytes32` values remain the comparison target.

### 15.2 Verification rules

An offline verifier of an `**.odpass`** bundle MUST:

1. Extract `passport.json`.
2. Recompute `localDataHash` as SHA-256 of ODP canonical JSON (same canonicalization rules as the protocol verifier),
  using the bundle Passport ID normalization for chain-hash comparison (i.e. treat the bundle Passport ID as `passportId: null` — legacy JSON may use `humanId: null` for the same step — when recomputing the chain-hash input).
3. Compare `localDataHash` to the on-chain `dataHash` for the claimed Passport ID (`passportId`).

An offline verifier SHOULD also recompute the anchors hash: extract the `anchors` array, canonicalize (same rules), SHA-256, compare to on-chain `**anchorsHash`**, and check the actual anchor types against `**anchorTypesMask`**.

If the on-chain record contains non-zero `fileHash` and the bundle includes bytes for that commitment, a verifier SHOULD also:

- resolve the file using the path in `manifest.originals.fileHash` when present and safe (must be under `originals/`, per the rules below), recompute SHA-256, and compare to `fileHash`.

Likewise, for non-zero `imageHash` (and for any `photo` anchors with sidecar bytes in the bundle), a verifier SHOULD resolve the corresponding entry via `manifest.originals` (paths under `originals/` only), recompute SHA-256, and compare to the on-chain hash or the anchor's `sha256:` value. Verifiers MUST **not** fall back to legacy top-level `original/*` or `image*/*` folders.

Paths under `manifest.originals` MUST be rejected if they contain `..` or do not start with the `originals/` prefix (case-insensitive), to avoid zip-slip confusion; on-chain hashes still govern the outcome.

### 15.3 Trust model and limitations

- Bundles are untrusted input and MUST be treated as data only (no code execution).
- A bundle does not replace on-chain truth. Verification is anchored by on-chain hashes (`dataHash`, and optionally `fileHash` / `imageHash` / additional image hashes).

#### What a verifier can and cannot do without the chain (normative)

Every verification path in this specification — web, app, and the `.odpass` bundle of this section — ends at a read from one chain. That is a real dependency and it is stated here rather than left for an implementer to discover in the field.

With **no chain access at all**, a verifier can still:

- open the bundle and confirm it is well-formed;
- recompute the hashes of sidecar files under `originals/` and check them against the `sha256:` values inside `passport.json` — that is, confirm the bundle is **internally consistent**;
- recompute `localDataHash` and `anchorsHash` and display them for a human to compare against a value obtained some other way.

It **cannot** establish that this document was ever registered, by whom, when, whether the passport was revoked (§8) or its issuing profile stopped (§3.1), or who holds it now. A verifier in this state **MUST** present the result as *unconfirmed*, **MUST NOT** show an assurance tier (§11), and **MUST NOT** use wording that a reader could mistake for a positive verdict. An internally consistent bundle is a well-made document, and a forger can make one.

**Reading the chain (normative).** A verifier **MUST NOT** depend on a single RPC endpoint. It **MUST** be able to try more than one, and **SHOULD** let the operator supply their own — a self-hosted node is the only path that depends on nobody. A single provider being unreachable is an ordinary event, not a verification failure, and a verifier **MUST** distinguish the two in what it shows: *could not reach the registry* is not *this passport is invalid*.

**If the chain itself ends.** ODP is deployed on one network (§7) and multi-network support is reserved for a future version. Should Polygon PoS cease to operate, records already written remain in its history, but live verification stops for everyone at once. There is no fallback anchor in this line, and pretending otherwise would be worse than saying it plainly.

---

## 16. What this protocol does NOT define

- Who hosts the `**.odpass`** (and `passport.json` inside it) or digital files — the creator's responsibility
- What happens when `dataUrl` goes offline — the on-chain hash remains valid indefinitely
- UI or visual design of verifiers or labels
- Pricing or marketplace mechanics
- Further marketplace rules beyond the `transferPassport` / delegation semantics defined here (e.g. escrow) — out of scope
- Support for multiple blockchain networks (reserved for a future version)
- Human-readable names — profile ID is a number, not a name
- Which specific seal product to use — any seal meeting the requirements is valid
- Full C2PA integration beyond hash compatibility (reserved for a future extension)

### 16.1 Durable hosting for `dataUrl` (normative SHOULD)

Not defining who hosts the bundle is not the same as having no opinion about how. An issuer **SHOULD** publish the `.odpass` at a location with three properties:

- **Content-addressed or otherwise integrity-bound**, so that the bytes at the URL cannot silently change under a stable address. `dataHash` already catches a substitution, but only for a verifier who bothers to check; a content-addressed store makes the substitution impossible instead of detectable.
- **Independent of any single operator's continued goodwill**, including the issuer's own. A passport whose bundle lives only on a personal domain stops resolving when the domain lapses, which is a matter of *when*, not *if*.
- **Reachable over plain HTTPS without an account, a key, or a client-side gateway**, because §9 requires `dataUrl` to serve the ZIP to any verifier, and a verifier that must first sign up somewhere is not a verifier the protocol can rely on.

A static host serving a file that a hash names — a repository's published pages, a content-addressed store fronted by an HTTPS gateway, an institutional repository with a preservation commitment — satisfies all three. A link to a personal file-sharing account satisfies none.

**What is lost when `dataUrl` dies is bounded, and worth stating plainly:** the on-chain card (§9's card fields — title, author, short description, domain) is on-chain, in the clear, and outlives any host. What goes is the identification evidence — the photos, measurements, materials, distinguishing features carried in `anchors[]`. A passport whose bundle is gone still names its object and its issuer; it can no longer prove that the object in front of you is that one. That is a degradation, not a revocation, and a verifier **MUST** present it as such (§11).

---

## 17. Wallet & Key Management

ODP does not define how users manage their cryptographic keys.
The protocol only requires a valid Ethereum-compatible wallet address
to sign transactions. How the key is generated, stored, and secured
is entirely the user's responsibility and choice.

**What the protocol does and does not offer when a key goes wrong.** A profile ID cannot move to another wallet — there is no rotation, and adding one would hand a thief the same power it hands an owner, since the key is all the registry can see. What exists is `revokeCreator()` (§3.1): an irreversible stop on future issuance, callable only with the key, plus a dated compromise statement published on the issuer's own domain, which is the one channel a stolen key does not reach. A key that is **lost** rather than stolen cannot even be stopped: nothing in the registry answers for an address whose owner can no longer sign. Treat the ODP wallet's backup accordingly — it is the only copy of an identity that cannot be reissued.

**Operational recommendation:** use a **dedicated wallet only for ODP** — not for holding meaningful balances, DeFi, trading, or day-to-day payments. This limits blast radius if a site is malicious or compromised. ODP does **not** require a second keypair: signing uses the wallet’s Ethereum keys. **Wallet choice:** follow **vendor documentation** for your tool (e.g. [MetaMask Help Center](https://support.metamask.io/)); **no specific wallet brand is normative**. **Reference implementations** in this repository (static web UI) have been **QA’d mainly with MetaMask**; other EIP-1193 wallets are expected to work but are not guaranteed to match every edge case. Optional **DID** documents (see §18) MAY declare extra verification keys for Verifiable Credentials; that is separate from basic register/mint flows.

### Reference web UI: injected wallets and WalletConnect (informative)

The **reference static pages** in this repository (`**passport.html`**, `**creator.html`**) support:

- **Injected EIP-1193** providers (typical desktop browser extensions).
- **WalletConnect v2** via [Reown](https://docs.reown.com/)’s `**@walletconnect/ethereum-provider`**, offered as an alternative in the connect UI. The WalletConnect session still surfaces an **EIP-1193** interface (`eth_requestAccounts`, `eth_chainId`, transaction signing) to the same register/mint code paths.

WalletConnect relies on **relay** infrastructure and a wallet app (QR scan or deep link); **availability, privacy, and trust** of that channel are between the user, the wallet vendor, and WalletConnect — **not** specified here. On-chain semantics are unchanged: `**msg.sender`**, creator wallet, and `**chainId`** remain authoritative.

For **repository wiring** (Reown Cloud Project ID, lazy-loaded bundle, session restore after reload), see [`backend/config/odp-wc-config.js`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/backend/config/odp-wc-config.js) and [`backend/js/odp-wallet-wc-loader.js`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/backend/js/odp-wallet-wc-loader.js) in the website repository, and [`docs/V0.4.md`](docs/V0.4.md) here.

### Key generation principle

The private key must be generated on the user's own device.
It must never be transmitted to ODP infrastructure, any third-party server,
or any other party. The protocol has no mechanism to receive or store keys.

### Storage approaches

Three broad categories exist. The protocol is compatible with all of them:

**Category A — Software wallet (seed phrase)**
The key is derived from a 12–24 word seed phrase stored by the user.
The seed phrase is the master backup. If lost, the wallet cannot be recovered.
Users choosing this approach must:

- Write the seed phrase on paper immediately upon creation
- Verify the phrase by confirming word order as prompted
- Store the paper copy offline in a secure physical location
- Never store the seed phrase digitally (no photos, no cloud, no messaging apps)
- Keep at least one physical backup copy in a separate location

**Category B — Hardware device (seed phrase + physical security)**
The key is generated and stored inside a dedicated physical device.
Transactions are signed on the device and require physical confirmation.
A seed phrase is still generated as a backup — the same rules apply.
The physical device adds a layer of protection: even if the computer
is compromised, transactions cannot be signed without the device.

**Category C — Seed-less hardware (key in chip)**
Some physical devices generate a key inside a secure chip with no seed phrase.
The key never leaves the device in any form.
Users choosing this approach must:

- Purchase at least one additional backup device before registering
- Losing all devices means permanent loss of access to the profile ID and all passports
- There is no recovery path without a backup device

### What losing access means for ODP

If a creator loses their wallet:

- Their profile ID remains in the blockchain forever — nothing in ODP can ever be deleted
- All passports they minted remain valid and verifiable by anyone
- They can no longer mint new passports under that profile ID
- They can no longer update existing passports

Passports already minted are **not corrupted**. The blockchain record is permanent.
Only the ability to create new records under that identity is lost.

### Extensions (outside this specification)

The following are possible extensions that implementations may choose to build.
They are not part of the ODP protocol and are not standardized here:

- Encrypted key storage on a user-controlled server
- Key management integrated into a mobile application
- Multi-signature wallets (multiple keys required to sign)
- Social recovery schemes
- Any other approach compatible with Ethereum-signed transactions

---

## 18. Interop, positioning, and DID (informative)

ODP is intended as a **cryptographic trust layer** that can sit alongside — not replace — regulatory **Digital Product Passport (DPP)** initiatives, **GS1** identifiers, **IIIF** manifests, **C2PA** content credentials, and other supply-chain or media standards.

### 18.0 Position relative to the EU DPP (ESPR)

The regulatory DPP referred to above is the one established by **Regulation (EU) 2024/1781** (Ecodesign for Sustainable Products Regulation, "ESPR"), Chapter III.

> **An ODP passport is not an ESPR DPP.** ODP is not a conformity route, product-group delegated acts do not apply to it, it carries no unique identifier registered with the Commission, it is not connected to the DPP registry (Art. 13) or the web portal (Art. 14), and it makes no claim about the sustainability attributes ESPR mandates. Nothing in this specification helps an economic operator meet an ESPR obligation, and an implementation **MUST NOT** present an ODP passport as satisfying one.

Two points of ESPR Art. 11 (technical design and operation) describe properties ODP happens to have, and they are the only substantive overlap worth naming:

- **Art. 11(e)** — a passport remains available for the period set in the delegated act, *including after insolvency, liquidation, or the economic operator ceasing activity in the Union.* An ODP record survives its issuer by construction: the registry entry is on-chain and needs no operator to answer for it (§7, §16). What does not survive on its own is the off-chain bundle behind `dataUrl` — see §16.
- **Art. 11(g)** — authentication, reliability and integrity of the data must be ensured. This is what `dataHash` / `anchorsHash` and the byte-for-byte card check exist to do (§10, §11).

Where ESPR expects a service-provider and registry model, ODP deliberately does not have one. That is a difference in kind, not a gap to be closed later, and it is the reason the overlap stops at these two points.

### 18.1 Optional `passport.json` fields (draft)

Implementations MAY include optional namespaces (all off-chain unless hashed into `dataHash`):

- `**sustainability`**, `**compliance`** — structured disclosure helpers
- `**identifiers.gtin**` — GS1 GTIN; mappable to GS1 Digital Link URIs in tooling
- `**iiif.manifest**` — IIIF Presentation API manifest URL or embedded reference
- **Object metadata** — physical dimensions, weight, depth, `**creationDate`**, `**listingPrice`**, `**internalTag**` (inventory label; not a Passport ID)
- Additional images are `photo` anchors in `anchors[]` (no fixed limit); the primary photo aligns with on-chain `imageHash`

Verifiers MUST NOT treat optional fields as legal offers (e.g. listing price is not an on-chain binding offer).

### 18.1.1 GS1 Digital Link pairing pattern

GS1 Digital Link is **optional** and remains **external** to the ODP core protocol. A practical pattern is to use a GS1 Digital Link URI as the standards-friendly **entry URL / QR layer**, while ODP remains the **cryptographic verification** layer.

Minimal integration pattern:

1. The GS1 Digital Link identifies a **GTIN** and, if available, a **serial**.
2. A resolver page or service maps that GS1 tuple to an ODP passport and opens the relevant passport or verify page with the required registry context.
3. The verifier then checks the ODP **Passport ID** and canonical `**.odpass`** / `**passport.json`** bytes against on-chain `**dataHash`** (offline payloads verify against `**dataHash`** / `**anchorsHash`** directly).

`**identifiers.gtin`** in `**passport.json`** is a natural off-chain place to align ODP records with GS1 identifiers. GS1 Digital Link by itself does **not** prove authenticity and does **not** replace the ODP registry, Passport ID, or hash verification.

### 18.2 The `did:odp` naming convention (informative)

> **What this is not.** `odp` is **not a registered DID method**. There is no method
> specification, no resolver, and no entry in the W3C DID Specification Registries.
> A `did:odp:…` string is a **naming convention for documents produced by this
> project**, nothing more. Software that requires a resolvable DID — a Verifiable
> Credentials issuer or verifier, a wallet, the UN/CEFACT UNTP profile, anything
> mandating `did:web` or `did:webvh` — **cannot** consume a `did:odp` string, and an
> implementation **MUST NOT** present ODP as offering DID support. Registering a real
> method is a possible future work item, not a property of this specification.

Within that limit, institutions and tooling MAY expose:

- `did:odp:passport:<Passport ID>` — e.g. `did:odp:passport:ODP-2026-03-004829301`
- `did:odp:profile:<Profile ID>` — e.g. `did:odp:profile:P-482-930-174-005`

A minimal **DID-document-shaped** JSON file MAY contain `id`, `verificationMethod` pointing at the creator’s Ethereum address (or separate keys if used for VC proofs), and `alsoKnownAs` linking to `passport.json` / deployment metadata. Such a file is a convenience for catalogs that already parse that shape; it is not resolvable by a DID resolver, and its presence asserts nothing the on-chain record does not already assert. For **URI-layer** linking (`odp://`), registry context, and optional HTTP resolver profiles, see **§19** — that layer, unlike this one, is normative.

#### 18.2.1 Optional DID registration flow (informative)

Generating or publishing a DID document is **optional** and **does not** require an extra on-chain transaction. The issuer (or tooling) MAY export a DID document JSON **at any time** after mint, as long as the Passport ID and registry context are known: read `creator` / `creatorId` and optional `dataUrl` from `getPassport`, then fill §18.2. Wallets that were not connected at mint time can still build the same document from public chain data. Implementations MAY add non-normative hints (e.g. `chainId`, contract address) beside the DID document for resolver or catalog tooling.

### 18.3 Verifiable Credentials

Institutional **proof** records (`submitProof`) can be mapped to VC-style claims in wallets or catalogs; the on-chain `ProofRecord` remains authoritative for the protocol verifier.

---

## 19. URI scheme and optional resolvers (informative)

This section aligns with §12 on `**odp://` grammar** and documents **optional** off-chain helpers. Authoritative state always comes from the **registry context** you configure (**chain ID**, contract **address**, **ABI**).

### 19.1 Normative URI scheme (minimum for QR and deep links)


| Scheme | Authority (RFC 3986 *hier-part* / host-style token)                                                                  | Rule                                                              |
| ------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `odp`  | Either `<Passport ID>` per §2 (e.g. `ODP-2026-03-004829301`) **or** `<Profile ID>` per §3 (e.g. `P-482-930-174-005`) | Disambiguate by prefix (`ODP-` vs `C-`/`B-`/`P-`/`M-`); see §12.1 |


Additional path segments (`/passports`, `/proofs`, …) or query keys are **not** normative in this specification revision. Implementations **MUST NOT** depend on them for interoperability; treat as **reserved / experimental** until a future spec defines them.

### 19.2 Registry context (normative)

Resolving `odp://…` to chain state requires a **registry context**: at minimum `**chainId`**, main registry `**address`**, and the **ABI** (plus optional satellite contracts). Clients **MUST** obtain this from:

- User or integrator **configuration** (e.g. `NET.contract` in reference pages), and/or  
- A **trusted** transport that carries metadata (e.g. HTTPS page that embeds `chainId` + address), and/or  
- A **trusted** off-chain resolver response (§19.4).

An **unsourced** URI **without** registry metadata resolves against the **canonical registry** of §7 by default — and on this line that table is empty, so such a URI is unresolvable until a v0.7 registry exists. It is also not self-describing: incompatible registries may exist at other addresses, so a client resolving anywhere other than the canonical registry **MUST** say which one it used.

### 19.3 Relationship to `did:odp` (§18.2)

The `**odp://`** scheme is convenient for QR and paste targets and is **normative** (§12). `**did:odp:passport:`** / `**did:odp:profile:`** merely *look* like W3C DIDs: `odp` is not a registered DID method and nothing resolves it (§18.2). The same Passport ID / Profile ID may appear in both layers, but only the `odp://` layer carries protocol meaning.

### 19.4 Optional HTTP “resolver” profile (non-normative)

An HTTP resolver is **not** a substitute for JSON-RPC to the chain. It is an optional **cache, aggregator, or gateway** that MAY bundle read-only data for latency or UX.

**Illustrative** REST shapes (not required for compliance):

- `GET …/passport/{passportId}` → JSON combining data otherwise obtained from `getPassport`, `getCreator`, proof listings, plus explicit fields such as `chainId`, `registryAddress`, probed `CONTRACT_VERSION`, optional satellite addresses.
- `GET …/creator/{creatorId}` → Creator record plus optional hints for listing passports (may rely on `getPassportsByCreator`* or an indexer).

`**/.well-known/odp-resolver` (optional discovery):** A deployment MAY serve a small JSON document, for example:

```json
{
  "odpResolverVersion": 1,
  "baseUrl": "https://resolver.example.com",
  "supportedChains": [137, 80002],
  "description": "Illustrative — field names are not normative."
}
```

Clients MUST treat unknown keys as opaque. This extends the “implementation-specific” `.well-known` note in §18.2.

### 19.5 Content and identity helpers (informative)

- **Content path:** Fetching the **§15 `.odpass`** (or extracted `passport.json`) from `dataUrl` or via a resolver proxy **MUST** still be checked against on-chain `**dataHash`** — a resolver could serve incorrect bytes.
- **Identity path:** Off-chain catalogs mapping **Profile ID** → marketing site are **out of band** to on-chain rules.

### 19.6 Reverse lookup by file hash (non-normative)

The reference registry **does not** define a canonical on-chain index **SHA-256(file) → Passport ID**. Endpoints such as `GET …/resolve/hash/{hex}` require an **off-chain indexer** and are **not** part of core protocol compliance.

### 19.7 Trust model summary


| Approach                                                    | Role                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Direct JSON-RPC to a **known** registry + local hash checks | Strongest alignment with protocol truth                                         |
| HTTP resolver                                               | Convenience; for security-sensitive verification, **confirm** against the chain |
| Bare `odp://` link with **no** registry metadata            | **Insufficient** to identify which registry to query                            |


---

## 20. Edition passports and unit activation keys (v0.7 line, B profile only)

> **Line scope.** This section is **normative for the v0.7 registry line** and has no effect on deployed v0.6 registries. Sections 1–19 above still describe the v0.6 reference line; a v0.7 deployment mints packed `**CONTRACT_VERSION` = 7** and is a separate registry under the 0.x rules stated at the top of this document. Design rationale, threat discussion, and the decision log are in [`docs/EDITION_UNIT_KEYS.md`](docs/EDITION_UNIT_KEYS.md) (RU: [`docs/ru/EDITION_UNIT_KEYS.md`](docs/ru/EDITION_UNIT_KEYS.md)).

### 20.1 Scope and eligibility

The per-object model of §§6–9 assumes one passport per object. For a mass-produced edition — thousands to hundreds of thousands of units off one production run — that model fails in three ways: identification anchors are identical across the entire run, one mint per unit is wasteful for records nobody will read, and per-unit cryptographic seals (§6) are priced for single high-value objects.

This section defines an alternative registration unit: **one passport for the edition, plus one keypair per physical unit**, committed in bulk and activated individually.

**Eligibility (normative):**

- Only a wallet holding a registered **`B` (Brand)** profile MAY mint an edition passport carrying a `unit_key_set` anchor, or open, extend, or operate a unit-key set. The contract MUST reject the attempt from `C`, `P`, and `M` profiles and from unregistered wallets.
- A **mint agent** (§ *On-chain capabilities*) acting for a `B` principal MAY mint on the principal's behalf; the eligibility check applies to the **principal's** profile, and mint caps count against the principal wallet as elsewhere.
- Activation (§20.9) and unit-passport minting (§20.10) are **not** profile-gated: they are driven by unit keys held by buyers, who are not required to hold any ODP profile or wallet.

The restriction is deliberate. The mechanism describes industrial production runs, its safety depends on an issuer able to run a controlled key ceremony (§20.8) and secure printing, and a mis-issued edition set is not revocable per unit. `M` profiles registering collection holdings, and `C` profiles registering their own work, are covered by §§6–9 and gain nothing here.

### 20.2 The edition passport

An edition passport is an ordinary passport under §§8–9, minted by a `B` profile, with these additional rules:

- Its `anchors[]` MUST satisfy the hard identification minimum of §9 (`photo` + `dimensions` + `materials` + `distinguishing_features`). These anchors describe the **edition**, not any individual unit.
- `edition.model` in `passport.json` MUST be `limited` or `open`, and `edition.total` MUST equal `unit_key_set.unitCount` when `edition.model` is `limited`.
- It MUST carry exactly one `unit_key_set` anchor (§20.3) and MAY carry at most one `unit_variant_commit` anchor (§20.4).
- The card, hashes, and both anchors are immutable after mint, as everywhere else. A production run cannot be extended in place: a second run is a second edition passport with its own key set.

### 20.3 The `unit_key_set` anchor

```json
{
  "type": "unit_key_set",
  "data": {
    "merkleRoot": "sha256:…",
    "unitCount": 100000,
    "hashAlg": "sha256",
    "leafFormat": "sha256(uint32be(index) || address20)",
    "addressListUrl": "https://…/units.bin",
    "addressListHash": "sha256:…",
    "labelSignerKey": "0x…"
  }
}
```

| Field | Required | Rules |
| --- | --- | --- |
| `merkleRoot` | yes | Root of the Merkle tree over all unit leaves |
| `unitCount` | yes | Number of units; `1 ≤ unitCount ≤ 2^32 − 1` |
| `hashAlg` | yes | `sha256` in this revision; other values are reserved |
| `leafFormat` | yes | Identifier of the leaf construction; `sha256(uint32be(index) || address20)` in this revision |
| `addressListUrl` | recommended | Public location of the full unit-address list |
| `addressListHash` | **yes** | SHA-256 of the list bytes, whether or not a URL is given |
| `labelSignerKey` | optional | 20-byte address whose signature an offline reader checks a signed outer label against (§20.7). Absent or zero = this edition prints plain labels |

**Leaf construction (normative):**

```
leaf_i = SHA-256( uint32be(i) || unitAddress_i )        i = 0 … unitCount−1
```

`unitAddress_i` is the 20-byte address of the unit key. The index MUST be inside the leaf: this binds serial numbers to addresses before printing, so a code issued for one unit cannot later be presented as another.

**Index assignment (normative).** Indices MUST be assigned independently of cartons, regions, distribution batches, and release waves. Activations are public (§20.9), so indices that follow the packing order let anyone read regional sell-through off the chain by watching which ranges activate where. Shuffling at labelling time removes that inference and costs nothing.

**Tree construction (normative):** binary Merkle tree, interior node = `SHA-256(left || right)`. When a level has an odd number of nodes, the last node is **duplicated**. Proof verification recomputes the root from the leaf and the sibling path.

**Address list (normative).** The list of unit addresses is public and contains no secrets, and **nothing in §20 works without it**: a verifier cannot build the Merkle proof §20.11 step 2 requires, and `activate` (§20.9) cannot be called at all.

It MUST therefore be obtainable without the issuer staying online:

- the list **MUST** be carried in the edition's `.odpass` bundle (§15) — that is the copy that outlives the issuer;
- `addressListHash` **MUST** be present in this anchor, so any copy of the list can be checked against the passport;
- `addressListUrl` is RECOMMENDED as a convenience mirror, never as the source of truth.

An edition whose list exists only at a URL is one expired domain away from being unverifiable and unactivatable — which would make "the passports outlive the project" false for exactly the objects this section serves. A carrier (§20.7) still does not need to hold a proof: anyone holding the list can rebuild it.

**On-chain cost.** The whole set costs one 32-byte root regardless of `unitCount`.

### 20.4 The `unit_variant_commit` anchor (optional)

For blind-box products, the packer knows which variant went into which unit. Disclosing that at mint destroys the product; committing to it does not.

```
commitment_i = SHA-256( uint32be(i) || uint16be(len(utf8(variant_i))) || utf8(variant_i) || salt_i )
```

`salt_i` is **exactly 32 bytes**, unique per unit, from a CSPRNG. The anchor carries a second Merkle root over these commitments, with the same tree rules as §20.3.

**Why the length prefix and the fixed salt size (normative rationale).** An earlier draft concatenated a variable-length variant with a variable-length salt and hashed the result. That is not a binding commitment: the boundary between the two fields is not recoverable from the bytes, so one commitment opens to more than one variant. With `variant = "chase"` and a 16-byte salt, `variant = "chas"` with the salt `"e"` prepended hashes to exactly the same value — an issuer could commit once and later prove whichever variant suited it, which is precisely what this anchor exists to prevent. Prefixing the variant's length and fixing the salt at 32 bytes makes the encoding unambiguous, so a commitment opens to one variant and no other.

- The issuer MUST NOT publish `salt_i` before the unit is opened.
- **`salt_i` MUST NOT be derivable from the unit key, from the unit index, or from anything readable without opening the sealed package.** The variant vocabulary of a blind-box product is tiny — a dozen figures plus a chase — so the commitment is protected by the secrecy of the salt and by nothing else. Anyone holding the salt can compute the commitment for every candidate variant and learn the contents in microseconds. Since the tamper-evident layer (§20.7) sits on the *outside* of the package, deriving the salt from the unit key would let a reseller scratch the label, learn what is inside without opening the box, keep the rare units, and sell the rest as sealed.
- **`salt_i` MUST be carried inside the sealed package** — for example printed on a card enclosed with the object. The secrecy of the variant is then protected by the same physical barrier that protects the surprise itself, and the issuer is not in the reveal path at all: nothing needs to be requested from it, and rarity stays provable after the issuer is gone.
- A mismatched or substituted salt card is **fail-safe**: the commitment simply does not verify. It cannot be used to prove a variant the unit does not have, only to fail to prove the one it does — which holds only because the encoding above is unambiguous.
- An issuer MAY retain its salts as an optional recovery path for buyers who lose the card. This MUST remain optional — no part of the mechanism may depend on the issuer being reachable.
- A verifier that receives `variant_i` and `salt_i` recomputes the commitment and its Merkle proof; success proves the variant was recorded at mint, not chosen afterwards.

This makes rarity claims (chase variants, short runs) checkable by a buyer against the chain rather than against the seller's word.

### 20.5 Unit key derivation

Derivation has two halves, and the split matters: the **issuer** derives from a master seed it alone holds, while a **holder** must be able to reach the same key from the printed code alone, with no access to anything the issuer keeps.

**Issuer side — producing the printed secrets:**

```
masterSeed     = ≥ 256 bits from a CSPRNG, generated offline
editionContext = utf8(chainId) || 0x00 || utf8(editionPassportId)
unitSecret_i   = HKDF-SHA256(ikm = masterSeed, salt = "", info = editionContext || uint32be(i), L = 32)
printedSeed_i  = the leading 100 bits of unitSecret_i, as 13 bytes:
                 bytes 0..11 verbatim, byte 12 = high nibble of byte 12, low nibble zero
                                                               ← this is what gets printed (§20.6)
```

**Either side — from the printed secret to the key:**

```
unitKey_i      = secp256k1 private key from
                 SHA-256( utf8("ODP-UNIT-KEY-v1") || printedSeed_i || editionContext )
                 (on the negligible chance of a value ≥ the curve order, rehash the result)
unitAddress_i  = address of unitKey_i
```

The second step takes only the printed 100 bits plus values a verifier already has, so a buyer holding nothing but the scratched code reaches exactly the address committed in the Merkle root.

**The 13-byte form is normative.** `printedSeed_i` is hashed, and 100 bits is not a whole number of bytes, so the padding has to be pinned or two conforming implementations derive different keys from the same printed code. The rule is: take the leading 13 bytes of `unitSecret_i` and clear the low 4 bits of the last one. The 20-character encoding of §20.6 carries exactly those 100 bits, so the code text and the 13-byte form are two views of one value.

Requirements:

- `editionContext` MUST bind the derivation to one edition on one chain, so keys never collide across drops.
- The issuer MUST store the master seed only as split shares (§20.8), never as a plaintext list of unit keys or printed secrets.
- Derivation MUST happen on a machine with no network path.
- The entropy of `printedSeed_i` is the entropy of the whole scheme. It MUST satisfy the floor in §20.6.

### 20.6 Unit code encoding

The printed secret is `printedSeed_i` (§20.5), never the private key.

| Property | Rule |
| --- | --- |
| Payload | 20 characters, Crockford Base32, alphabet excluding `I`, `L`, `O`, `U` — carries the 100 bits of `printedSeed_i`, most significant bit first |
| Check characters | 5 characters, defined below |
| Grouping | 5 groups of 5, hyphen-separated, e.g. `7KM2-9XQF-3BTR-8WNP-5HJD` |
| Entropy | **MUST be ≥ `80 + ceil(log2(unitCount))` bits**, and never below 80; the encoding above carries 100 |

**Normalization (normative).** Before any use — checksum computation or verification — an implementation MUST normalize input: uppercase it, remove hyphens and whitespace, then apply the Crockford substitutions `I` → `1`, `L` → `1`, `O` → `0`. Normalization happens **before** hashing, so a reader who transcribes a `0` as `O` still produces a valid code.

**Check characters (normative).**

```
check = the leading 25 bits of SHA-256( ascii(normalized 20-character payload) ),
        rendered as 5 Crockford Base32 characters, most significant bit first
```

SHA-256 is chosen because it is already a hard dependency of this protocol (`dataHash`, `anchorsHash`, the Merkle trees of §20.3), so verifying a typed code introduces no new primitive and no lookup table. Twenty-five bits reject a mistyped code with probability about 1 in 33 million.

**One global alphabet (normative).** The alphabet and the check construction are fixed for all issuers, markets, and languages. They MUST NOT be localized. The primary carrier is the DataMatrix of §20.7 — the text form exists for damaged symbols and is the minority path — whereas a per-market alphabet would force every verifier, forever, to guess which alphabet a given string was written in, and would let one string mean different things in different places.

**Entropy floor (normative rationale).** In a server-mediated authentication system a short code is safe because the server rate-limits guessing. **ODP has no such server:** the address list is public and verification is offline and permissionless, so an attacker can test candidate codes locally, in parallel, unobserved.

The floor is **per-target**, and that is not a formality. An attacker forging a unit does not need a *particular* code — any code that verifies at any index will do. With `unitCount` valid secrets and a public address list to check guesses against, expected work is `2^entropy / unitCount`, so every doubling of the run size costs one bit. A flat 80-bit rule, read against this specification's own `unitCount` ceiling of `2^32 − 1`, leaves about 2^48 operations — hours on rented hardware. Hence `80 + ceil(log2(unitCount))`: at 100 000 units that is 97 bits, which the 20-character encoding above already exceeds.

An implementation MUST NOT reduce the code length on usability grounds; the length is a security parameter, and it cannot be changed after labels are printed.

### 20.7 Carriers

**Outer carrier (open, scannable before purchase).** This specification constrains **what must be recoverable**, not how it is encoded. The outer carrier MUST make two values available to a verifier:

1. the **edition passport ID**, and
2. the **unit index**.

Both MUST **also** be printed in human-readable text, following the §5 label rules. A carrier format is a packaging decision that will change over the life of a protocol; a printed pair of values a human can type is what guarantees a unit stays verifiable when it does.

The reference form is the §5 verification label extended with the unit index: a QR encoding the `odp://` URI (§12, §19) plus the unit index, and the same values as text.

**Reference web parameters.** A verifier page reachable from the carrier reads the unit index as `unit` (or `u`) and, for a signed label, the signature as `lsig` — 65 bytes, `0x`-prefixed hex. A malformed value MUST be treated as no value rather than as a failed check: a smudged carrier is not evidence about the object.

The outer carrier MUST NOT contain the unit seed or any value derived from it.

**Signed labels (optional, normative when used).** An outer carrier MAY additionally carry a signature over

```
"ODP-UNIT-LABEL-v1" || uint256be(chainId) || contractAddress20
                    || utf8(editionPassportId) || uint32be(unitIndex) || merkleRoot
```

made by the key published as `labelSignerKey` (§20.3). This follows the idea of **ISO/IEC 20248** — a compact signature inside the barcode, verifiable **offline** — while taking the signer's key from the edition passport rather than from a PKI or a DNS record. That is not a deviation to apologise for: 20248 explicitly leaves cryptographic and key-management methods out of scope, and an on-chain key removes the last thing in §20 that would have depended on the issuer's domain still resolving.

What it buys: a reader with the edition's `.odpass` bundle can check, **in a shop, with no network**, that a label was printed by the issuer. Without it the outer carrier is plaintext anyone can print, and a fabricated label pointing at a real edition looks correct until someone goes online.

What it does not buy, and MUST NOT be claimed: signing prevents labels being **fabricated**, not **copied**. A photograph of a genuine label reproduces a valid signature. Duplication is caught by activation (§20.9), never by the signature.

A verifier MUST NOT treat a valid label signature as an authenticity verdict about the object, and MUST NOT downgrade an edition that prints plain labels — `labelSignerKey` is optional, and most issuers will not use it.

*Informative — GS1 Digital Link.* An issuer holding a GTIN MAY encode a **GS1 Digital Link** URI instead, carrying the GTIN and unit serial with the ODP values as additional link parameters, so that one symbol serves retail scanning, ODP verification, and EU DPP resolution under ESPR. This specification does not require it and does not depend on it. Adopting it later costs nothing at the protocol level: the carrier is off-chain packaging chosen per print run, so a later run may change encoding without touching the contract, the registry, or any already-minted passport, and labels already printed keep verifying unchanged. Only verifiers need to learn the additional encoding — which is exactly what the mandatory human-readable pair above insures against.

**Inner carrier (under a tamper-evident layer).** The unit seed SHOULD be carried as a DataMatrix (ISO/IEC 16022) under a scratch-off or equivalent opaque layer, with the §20.6 text form printed alongside as a fallback for damaged symbols.

**Physical requirement (normative).** The label MUST be applied so that removing or relocating it is visibly destructive — across a package seam, or otherwise retained per §5. This is the **only** physical binding in the mechanism; every cryptographic property below sits on top of it and none of them replace it.

### 20.8 Key ceremony

The master seed MUST be split with a threshold scheme — **SLIP-39** (Shamir) in a **2-of-3** configuration is the reference profile — such that no single holder can reconstruct it and a single lost share does not lose the run. Shares SHOULD be held by three mutually independent parties (for example: issuer security, a separate issuer department, and notarial or bank escrow). This is the **split knowledge** and **dual control** pattern of NIST SP 800-57 Part 2 and PCI PIN Security.

Printing SHOULD take place at a facility operating a security-print management system (ISO 14298).

**A witness MAY attest the ceremony** using existing mechanisms: a `P` profile publishes an ordinary `submitProof` against the edition passport on the paired proof registry, describing the ceremony performed. No new contract surface is required, and the edition reaches the existing **Attested** tier (§11).

**ODP MUST NOT be a party (normative).** No ODP-operated service, repository, or maintainer may hold a master seed, a share, or a unit key for any edition. The protocol's guarantee that passports outlive the project fails the moment the project custodies third-party production secrets. ODP's role is limited to this specification, the ceremony profile document, and a reference offline tool that stores nothing.

### 20.9 Activation

Activation is a signature, not a service call.

```
message = "ODP-UNIT-ACTIVATE-v1"
        || uint256be(chainId)
        || contractAddress20
        || utf8(editionPassportId)
        || uint32be(unitIndex)
signed by unitKey_i (EIP-191 personal-sign envelope)
```

Contract rules (normative):

1. The activation function MUST be **permissionless**: it authenticates the recovered signer against the unit address proven by the Merkle proof, and MUST NOT derive any right from `msg.sender`. The submitter is a courier.
2. A valid activation MUST be recorded **once**, with the block timestamp and the recovered unit address. A later submission for the same unit MUST NOT overwrite it and MUST **revert with a distinct error code**. Reading the existing record is a `view` call, never a side effect of a write.

   This is a spam defence, not pedantry. If a duplicate submission succeeded as a no-op, anyone holding a single genuine code could replay one valid signature indefinitely and drain whoever is paying — the record would never change and the fee would be charged every time. Reverting makes the duplicate visible in a dry run, so a sponsor's simulation rejects it **before** any fee is spent, and even a naively written sponsor cannot be drained this way.
3. The submitted signature MUST be replayable only for the unit it names: the message binds chain, contract, edition, and index.
4. A rejected Merkle proof MUST produce `UNIT_NOT_IN_EDITION` (§11), not a generic failure.

#### Sponsorship belongs on-chain

A blockchain cannot broadcast its own transactions: something off-chain must sign and send. What this specification *can* constrain is where the **rules** live and who is allowed to carry the message.

- **The sponsorship rule MUST be a contract, not a server policy.** An issuer that wants to cover activation fees SHOULD do so through an on-chain paymaster (**ERC-4337**) funded by an on-chain deposit, so that who gets sponsored is public, auditable bytecode. A server-side policy is invisible: it can quietly refuse a holder, favour some units over others, or vanish, and nobody outside can tell which happened.
- **Transport SHOULD be a public permissionless network**, not one issuer's endpoint. With ERC-4337, any bundler in the public network can include the operation; the issuer funds the deposit but does not stand between the holder and the chain. An issuer-run submission endpoint is permitted but is the weaker arrangement, and MUST NOT be presented as the only route.
- **Any** party may publish regardless: the issuer, a marketplace, a collector's club, any ODP-aware application submitting from its own wallet, or the holder's own wallet. Becoming an activation point requires no agreement with the issuer or with ODP.
- A signature MAY be produced offline and published arbitrarily later, from any device.
- When a sponsor pays, the holder needs no wallet, no tokens, and no account. That is a property of a funded deposit, **not** a guarantee of this specification: when the deposit runs dry or no one will carry the message, the holder publishes from their own wallet and pays the fee. The resulting record is identical either way.

**Activation is not minting (normative).** Activation writes one record against an existing edition passport. It does not create a passport, and an implementation MUST NOT present activation and unit-passport minting (§20.10) as one action or imply that the cost properties of one apply to the other.

### 20.10 Unit passports and ownership

On or after activation, a **unit passport** MAY be minted for an individual unit. It is a normal passport with two additions: it names its edition passport as parent, and its membership is proven by the §20.3 Merkle proof at mint.

**The unit key names the initial owner (normative).** Minting is authorized by a second signed message, which carries the owner address explicitly:

```
message = "ODP-UNIT-MINT-v1"
        || uint256be(chainId)
        || contractAddress20
        || utf8(editionPassportId)
        || uint32be(unitIndex)
        || ownerAddress20
signed by unitKey_i (EIP-191 personal-sign envelope)
```

- The contract MUST set the initial owner to `ownerAddress` recovered from the signed message, and MUST NOT derive ownership from `msg.sender`. As in §20.9, the submitter is a courier: it pays the fee and gains nothing.
- The mint MUST be authorized by the unit-key signature and by a Merkle proof for the same index, exactly as activation is. The authority is possession of the printed secret, never a registered profile.
- **Monthly mint caps MUST NOT be applied to this path.** Caps exist to stop a wallet spraying arbitrary records; here every mint costs the caller a distinct printed secret from a committed set, which binds abuse more tightly, and charging a drop against its issuer's cap would let buyers exhaust the issuer's own ability to mint.
- `ownerAddress` MUST NOT be the zero address. It MAY be the unit address itself — that is the **bearer** path, for a holder who wants no wallet, and an interface SHOULD offer it as the default when no wallet is connected.
- **Uniqueness per unit MUST NOT be enforced.** More than one unit passport MAY exist for the same `(edition, unit index)`, each with its own owner and its own anchors. A verifier MUST surface every one of them (§20.11).
- **Uniqueness per `(edition, unit index, ownerAddress)` MUST be enforced.** A repeat mint naming an owner that already holds a unit passport for that unit MUST revert. This bounds re-minting without locking anyone out: the genuine holder names their own address, which no competing minter has claimed.

  This is deliberate and follows the position this specification already takes on duplicate passports. A uniqueness rule blocks only exact duplication while handing an attacker a first-to-register weapon: whoever mints first — including the holder of a cloned code — would permanently lock the holder of the genuine unit out of ever obtaining a passport for it. Surfacing a conflict is recoverable; a lock-out is not.
- A unit passport MUST NOT be minted for a unit with no activation record (§20.9). An implementation MAY perform the activation and the mint atomically in one transaction when both signatures are supplied.
- The owner MAY transfer the unit passport afterwards by the ordinary `transferPassport` path; a bearer-owned passport is transferred by signing with the unit key.
- Minting is **lazy**: a unit passport is created only when someone needs one, never pre-minted for the whole run.
- A unit passport MUST be a `physical` passport in this revision; the object it identifies is one item of a production run.

Separating payer from owner is what makes the common cases expressible in one transaction: a buyer with a wallet mints and owns directly; an issuer's service can mint **to the buyer** rather than to itself; a holder without a wallet mints to the unit address and keeps the bearer model. It also inherits the conflict semantics of §20.9 — whoever presents a valid unit-key signature first names the owner, and a cloned code produces a visible conflict that the protocol surfaces without adjudicating.
- The unit passport's own `anchors[]` are supplied by whoever mints it and describe **that unit** — the owner's own photographs, its marks, its condition. Inherited edition anchors MUST NOT be presented as unit-level identification.

**Minting a unit passport is a paid action, always borne by the minter (normative).** It is an ordinary mint under §8: a wallet, a transaction, a network fee. This specification defines **no** sponsorship mechanism — no escrow, no per-edition allowance, no expiry, no sponsor role — and an implementation MUST NOT present the unit-passport mint as free, as included with the object, or as covered by the issuer under any protocol guarantee.

An issuer that chooses to absorb the cost does so only by operating its own minting service and paying from its own wallet. That is a commercial arrangement of that issuer, revocable at its discretion, and it MUST NOT be described as a property of the protocol.

### 20.11 Verification

Added to §11 for a passport carrying a `unit_key_set` anchor:

```
Level 2D — Unit membership and activation state

1. Read unit index and edition passport ID from the carrier
2. Rebuild or fetch the Merkle proof for that index
3. Verify the proof against unit_key_set.merkleRoot
   Fail → UNIT_NOT_IN_EDITION, stop
   Pass → UNIT_IN_EDITION
4. Read the activation record for that unit
   None    → UNIT_NOT_ACTIVATED
   Present → UNIT_ACTIVATED, with its timestamp
5. Enumerate unit passports minted for that (edition, unit index)
   0        → no unit passport
   1        → report it
   2 or more→ UNIT_PASSPORT_CONFLICT — report ALL of them, each with
              its mint timestamp, owner, and minting profile if any
6. Read edition-level state from the edition passport
   No activation anywhere in the edition → EDITION_REVOCABLE
   Any kind-8 edition notice present     → EDITION_NOTICE, shown on
                                           this unit too, without a
                                           verdict about it (§20.13)
7. If a unit seed was supplied, derive the key and confirm the
   recovered address equals the proven unit address
```

Steps 1–5 require **no secret** and MUST be available before purchase, from the outer carrier alone.

**What step 2 does and does not prove (normative).** Rebuilding the root from the published address list checks the **edition**: that the list an issuer published is the one committed on-chain. It says nothing about the unit in front of the reader, because every index below `unitCount` is in the tree by construction. A verifier MUST NOT present a successful membership check as evidence that a particular object is genuine. What it catches is a replaced or doctored list — including one replaced by the issuer.

**No-verdict rule (normative).** When a unit is already activated, **or when more than one unit passport exists for it**, a verifier MUST report the facts — timestamps, owners, minting profiles — and MUST NOT characterize any of them as counterfeit, stolen, or invalid, and MUST NOT rank them by mint order. A prior activation has at least two innocent readings — a cloned code, or a legitimate second-hand purchase — and the protocol can distinguish neither. This is the same position §11 and the v0.6 duplicate-passport model already take: the protocol surfaces the record and leaves judgement to people.

`ODPCounterfeitConcern` (§4) remains a separate institutional mechanism and MUST NOT be raised automatically by an activation conflict.

### 20.12 Assurance tiers

- A `unit_key_set` anchor **does not** by itself raise an edition passport above **Base**. It is a distribution mechanism, not evidence about the object.
- A **unit passport** reaches **Sealed** only if it carries its own §6 seal anchor. Membership in an edition is reported separately (`UNIT_IN_EDITION`), never rendered as a seal.
- A verifier MUST NOT display activation state as a tier, and MUST NOT print it on any label — the §11 computation rule applies unchanged.
- An active `UNIT_PASSPORT_CONFLICT` does not remove a tier, but MUST be displayed at least as prominently as the tier itself — the same treatment §11 gives an institutional counterfeit concern.

### 20.13 Edition lifecycle: the revocation window and edition notices

An edition passport is immutable like any other (§8), and its only remedy for a wrong immutable card is `revokePassport` + re-mint. For a run of 100 000 units that remedy is also a weapon: revocation removes the assurance tier entirely and blocks `submitProof` and `recordPassportEvent`, so one transaction by the issuer — or by `governance` — would destroy the record of every honest holder. This subsection bounds the remedy in time and replaces it, afterwards, with something that only adds.

#### The revocation window

`revokePassport` on an **edition passport** MUST revert once **any unit of the edition has an activation record** (§20.9). The closure is permanent and applies to **every** caller, including `governance`: no party retains a path to revoke an edition once a holder has demonstrably appeared.

Inside the window the ordinary v0.6 rule stands: a typo caught before anything reached a buyer is fixed by revoke + re-mint, and nobody is harmed.

Until the window closes, a verifier MUST make it visible (`EDITION_REVOCABLE`, §11) — an issuer's live right to erase its buyers' records belongs in front of a buyer.

The gate is a single observable fact, deliberately. A declared shipping date cannot serve: it is fixed in an immutable anchor at mint, production schedules move, and re-minting an edition because logistics slipped is not an acceptable requirement. An issuer-declared "we have shipped" event was specified and then removed — it bought a narrower window at the cost of a second mechanism, a second event kind, and a second thing an issuer can decline to do. The residual exposure it covered is the gap between goods reaching shelves and the first buyer scratching a label, which in practice is short and closes itself.

#### Edition notice

After the window closes, the issuer's only remaining way to say that something went wrong is an **edition notice** — an append-only statement that destroys nothing.

- Recorded via `recordPassportEvent` on the edition passport with `kind = 8`; `note` carries a short human-readable reason and `attachmentHash` MAY anchor a fuller document.
- Suitable for: superseded by a corrected edition, compromised key set or leaked master seed, safety recall, discontinued line.
- A verifier MUST surface an active edition notice **on the edition passport and on every unit passport parented to that edition** (§20.11). A notice that only appears on the parent is useless to the person holding one figure.
- It does **not** remove an assurance tier, and MUST be displayed at least as prominently as the tier (§20.12) — the treatment §11 gives an institutional counterfeit concern.
- It MUST NOT be presented as a verdict on any individual unit. "This edition's key set leaked" is a statement about the run, not proof that the object in the reader's hands is fake.
- **A notice is prose, and stays prose.** Where it points at a corrected edition it does so in words. This specification defines **no** structured supersession field, and a verifier MUST NOT derive a machine-readable "superseded by" relation from a notice, mark the edition obsolete or invalid, or rank it below its successor.

**Why supersession is deliberately unstructured.** Minting a corrected edition does not rescue units already in the field: their keys are committed in the *old* edition's Merkle root, verify against it, and always will. A successor edition carries its own key set and governs later production only. So the units of a superseded edition are neither obsolete nor invalid — the object in someone's hands is genuine, its code is honest, and its verification passes. A structured "superseded by" field would be rendered by interfaces as exactly the verdict this section, §20.11, and the v0.6 duplicate model all refuse to make.

### 20.14 Stated limits (normative honesty rules)

An implementation MUST NOT claim, in interface copy or marketing, any assurance this mechanism does not provide. Specifically:

1. **The issuer knows every unit key at generation.** Unless the master seed is destroyed after printing — which no outside party can verify — the issuer can activate units itself. §20.8 constrains storage, not knowledge.
2. **The print vendor necessarily sees the codes.** Printing a code requires knowing it. This is controlled physically (§20.7, ISO 14298), never cryptographically, and seed splitting does not address it.
3. **Anyone who knows the codes can activate units they do not hold.** An insider could activate a whole run before it ships, after which honest buyers scratch their labels and find the units already activated. The protocol cannot prevent this — the codes are known inside the issuer by construction — and it does not try. Every activation carries a public timestamp; whether that timestamp is plausible for the object in someone's hands is a human judgement, and an issuer whose run was poisoned can say so with an edition notice (§20.13).
4. **An activation conflict is surfaced, not adjudicated** (§20.11).
5. **A sealed counterfeit carrying a cloned code is indistinguishable before the layer is removed.** The outer carrier's activation state is the only pre-purchase signal.
6. **A unit key binds the package, not the object inside it.** Object-level binding exists only through §20.4 and through a unit passport carrying the owner's own anchors (§20.10).
7. **The activation log is public commercial data.** `unitCount` is on-chain and every activation is a timestamped public event, so anyone — a competitor, an analyst, a marketplace — can reconstruct the run size and a live sell-through curve. This is the same data incumbent vendors sell back to brands privately; here it is free to everyone. It cannot be hidden without destroying the pre-purchase signal the mechanism exists to give a buyer, so it is stated rather than mitigated. An issuer MUST be told before it commits a drop. §20.3's index-assignment rule keeps the leak to totals rather than regions; the totals themselves are irreducible.

---

*Object Digital Passport is open source. MIT License.*
*Contributions welcome. This is a draft — feedback is the goal.*
*If something feels missing or underspecified, open a [**Standard gap** issue](https://github.com/object-digital-passport/specifications/issues/new?template=standard_gap.md) in **English** (short proposals welcome).*