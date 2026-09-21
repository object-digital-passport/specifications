# ODP Security Model · v0.7 reference line

> **Which line this describes.** The properties below are those of the **v0.7**
> contract in this repository. They are unchanged from v0.6, which is the line
> **deployed on Polygon mainnet** and the one every existing passport was minted
> under — where a statement is about a deployment rather than about the code, it
> says v0.6 and means it.

*Author: Andrei Chernikov*

Object Digital Passport is a **registry of claims**, not a guarantee of physical authenticity.

This document describes the threat model, known limitations, and recommendations for the **reference line on `main`**: **`ObjectDigitalPassport`** with packed **`CONTRACT_VERSION` = 6** — the on-chain **card**, the **`anchors[]`** identification block committed as `anchorsHash`, and **append-only** passport events — together with the paired satellites (`ODPPassportLib`, `ODPWalletDocumentAnchor`, `ODPCounterfeitConcern`, `ODPRegistryRelations`, `ODPPassportProofRegistry`, `ODPExtensionMintRouter`) and the static web pages wired via **`NET.*`**. Earlier lines (**v0.5** and before) are **different registries** (address + ABI) and do not migrate. Normative field names, rules, and the canonical registry addresses: **[`SPEC.md`](../SPEC.md)**.

---

## What the protocol guarantees

- A passport or profile record exists on-chain at a specific timestamp (within the chosen deployment).
- **Integrity anchors:** `dataHash`, `anchorsHash`, `imageHash`, and `fileHash` recorded at mint are **immutable** on-chain.
- **Card immutability (v0.7):** `title`, `authorName`, `shortDescription`, and `domain` are written once at mint and have **no edit path** — a typo means revoke and re-issue. A verifier that finds any byte of difference against `passport.json` MUST report the passport as tampered, not merely "changed".
- **Identification minimum enforced at mint (v0.7):** a physical object cannot be minted without `photo` + `dimensions` + `materials` + `distinguishing_features` anchors; a digital object cannot be minted without an exact `fileHash`. This is a **contract-level** check, not a UI convention.
- **Append-only history (v0.7):** status, location, rights, condition, damage, and restoration are recorded as events that can be added but **never rewritten**; the current value of any aspect is the latest event of that kind.
- The profile ID (`creatorId`) is tied to the **registered wallet** for that profile at registration time.
- **No one** — including the deployer — can delete or rewrite immutable fields on existing passports.
- **Contract version:** deployments expose `CONTRACT_VERSION` / generation; verifiers should confirm they read the intended registry (address + chain).
- **UTC-aligned prefixes:** `mintDigital` / `mintPhysical` / `mintMixed` and `submitProof` **year** / **month** must match **Gregorian UTC** from `block.timestamp`. This **reduces abuse** of human-readable `ODP-YYYY-MM-…` / `PRF-YYYY-MM-…` prefixes; it is **not** a claim about physical objects.

## Registry versions: v0.6 vs older 0.x and future v1

- **No backward compatibility** between reference **v0.6** and the earlier **v0.5 / v0.4 / v0.3 / v0.2 / v0.1** lines: each is a different deployment (bytecode + ABI). The same wallet may have different `creatorId` values on different lines; passport IDs and records do not auto-migrate.
- **Canonical vs other registries:** the addresses in **[`SPEC.md`](../SPEC.md)** §7 are the **canonical** v0.6 registry. Deployments of this source elsewhere are valid instances but **non-canonical** — a client resolving against one MUST say so, otherwise it misleads the user about which registry a record came from.
- **Forward alignment:** the specification is written so a future **stable v1** can define migration or dual-verification paths using stable identifiers and `contractVersion` on records — see **[`SPEC.md`](../SPEC.md)** (*IMPORTANT: registry versions…*). Until v1 is published, treat this as **design intent**, not a guarantee of upgrade for any live registry.

## What the protocol does NOT guarantee

- That the physical object exists or that off-chain files at `dataUrl` are still hosted (the chain stores hashes and URL **hints**).
- That the creator or institution is who they claim to be **off-chain** (IDs are registered permissionlessly).
- That an NFC chip is genuinely NTAG 424 DNA TagTamper or that the public key matches the installed chip.
- That **P-** or **M-** type profiles represent a real museum or institution **on-chain** — the protocol stores an ID and type prefix only; names are self-declared.
- That the person holding the wallet is the original artist or rightsholder.
- **Institutional “counterfeit concern” (satellite):** if **`ODPCounterfeitConcern`** is deployed and wired, **P**/**M** profiles can record an **opaque** `reasonHash` and timestamps for a passport ID. That is an **on-chain signal** from that profile at that time — **not** a cryptographic proof that an object is fake, and **not** a substitute for physical inspection or legal process.
- **Options outside the main registry** are only security properties of *your* deployment once their bytecode is actually deployed and wired there. **Global `dataHash` uniqueness** is not implemented at all. **Author attestation (EIP-712)** is deployed as the `ODPAuthorAttestation` satellite, but the main registry performs no attestation check itself — see [Protocol options outside the main registry](#protocol-options-outside-the-main-registry) for what an attestation does and does not prove.

### URLs vs hashes (important)

- The **verifier** (or any client) that fetches bytes from `dataUrl` and compares SHA-256 to **`dataHash`** can detect content substitution.
- The chain **does not** fetch HTTPS; “the data at `dataUrl` matches the hash” is true **only after** a correct off-chain check. Treat unknown or malicious `dataUrl` as untrusted until verified.

---

## Reference line trust boundaries (v0.6)

### Governance (single on-chain address)

- **`governance`** is one `address` (constructor defaults to deployer; should be moved to a multisig/Safe via **`transferGovernance`**).
- A compromised **`governance`** can affect **policy-level** actions allowed by the contract (e.g. revoke passports alongside creator, register mint extensions, point the relations/extension satellites elsewhere). There is **no** on-chain timelock in the reference bytecode — operate multisig and procedures off-chain.
- **`deployer`** alone can **`freeze()`** (irreversible stop to new writes; reads keep working). History note: `freeze()` existed through **v0.4**, was **removed in the v0.5 line** to fit the EIP-170 bytecode limit, and is **restored in v0.6** — so the superseded v0.5 registry has no on-chain way to stop writes. **Stable v1 is planned to omit this mechanism** (see [`ru/IDEAS_V1.md`](ru/IDEAS_V1.md)).
- **Satellite pointers:** `setRelationsSatellite` / `setExtensionRouter` accept `address(0)` **by design** — that is the documented way to clear a satellite. Governance pointing them at a hostile contract is a **high-privilege** action, same class as extension registration.

### Mint agent (delegated mint)

- A **principal** profile can authorize a **mint agent** wallet (two-step handshake: **`requestMintAgentRole`** / **`confirmMintAgentRole`**).
- The agent may call mint functions with **`mintOnBehalfOfCreatorId`** set to the principal’s **`creatorId`**.
- On-chain, **`Passport.creator`** and initial **`owner`** are the **principal** wallet; **`Passport.mintAgent`** records who sent the transaction (`address(0)` if the principal minted themselves).
- **C/B** monthly mint caps count against the **principal** wallet, not the agent.
- Principals should revoke delegation (**`revokeMintAgentRole`**) when the relationship ends; agents can **`renounceMintAgentRole`**.

### Publishing agent (URLs only)

- **`delegateCreatorPublishing`** allows a separate wallet to call **`updatePassportUrls`** for passports whose **`creator`** is the delegating issuer — **only** URL fields, hashes unchanged. This is **not** mint delegation.

### Extensions (`IODPExtension`)

- Governance may register external contracts for **`mint*ViaExtension`**. A malicious or buggy extension trusted by governance can affect mint outcomes. Treat extension registration as **high privilege**.

### P- and M-type profiles (social / institutional trust)

- **Same class of risk:** verifiers see a type label (e.g. Institution / Museum) and a profile ID. **On-chain does not verify** the legal name or website of the organization.
- Confirm **`creatorId`** on the organization’s **official** channel before trusting proofs or institutional claims.

### What stays mutable in v0.6 (and what does not)

- **Immutable:** the card, every hash anchor (`dataHash`, `anchorsHash`, `imageHash`, `fileHash`), and all recorded events. The v0.5 overwritable current-state setters and the `auxCommitment*` / `ndppCommitment*` pointers **no longer exist** in this line.
- **Still mutable:** hosting URLs (`updatePassportUrls`, hashes unchanged), passport ownership (`transferPassport`), and revocation status. Everything else changes only by **appending** a new event.
- **Event payloads are public forever.** `note` and attachment fields cannot be deleted. LOCATION events MUST carry only coarse values (a city, an institution, "in storage") — never a street address, storage site, coordinates, or personal data (**SPEC** §9, normative).

### Optional satellite: `ODPCounterfeitConcern`

- Deployed **separately** from the main registry; constructor **pins one** `ObjectDigitalPassport` address. Static pages use **`NET.counterfeitConcern`** — a **wrong address** means **wrong or empty** reads.
- **Only P and M** profiles may **`raiseCounterfeitConcern`** / **`clearCounterfeitConcern`** for a given `passportId`. Only the **same prover** profile that raised a flag may clear it (see custom errors **80–82** in **[`ru/RELEASE_v0.4.md`](ru/RELEASE_v0.4.md)**).
- The chain stores **`reasonHash`** (and optional audit fields per deployment), **not** the full free-text reason. Treat as **institutional opinion** bound to that registry and timestamp, not as universal truth.

---

## Known risks and mitigations (carried forward)

### 1. Social engineering and phishing

**Risk:** Fake verifier site; fake “official” P/M institution; malicious `dataUrl` / `noteUrl`; **misleading interpretation** of a concern flag as “certified fake”.

**Mitigation:**

- Compare fetched content to on-chain hashes locally.
- Treat profile IDs as opaque strings; verify them on **official** sites.
- Do not trust `noteUrl` without domain checks.
- For **concern** flags: read **which profile** raised them and **when**; confirm policy out-of-band if decisions matter.

### 2. Stolen creator or owner wallet

**Risk:** **`updatePassportUrls`** (with `confirmedDataHash`) does not stop an attacker who can read `dataHash` from chain (stolen key).

**Mitigation:** Hardware wallet; limit exposure; **`revokePassport`** if needed (creator or governance).

### 3. Stolen mint agent wallet

**Risk:** While delegation is active, an agent can mint on behalf of the principal (within caps and rules).

**Mitigation:** Principal **`revokeMintAgentRole`** immediately; short-lived delegation; separate agent hot wallet with minimal privileges elsewhere.

### 4. Multiple wallets (anti-spam, not anti-Sybil)

**Risk:** **C** / **B** tiers have per-calendar-month caps; **P** / **M** are unlimited in the reference contract. New wallets bypass per-wallet caps.

**Accepted tradeoff:** permissionless design; off-chain reputation if needed.

### 5–8. Frontend CDN, RPC privacy, canonical JSON, NFC, numbered seals

Unchanged from earlier guidance — see **SPEC** §9–11 for JSON/NFC levels.

---

## Deployer key security

The deployer key can **`freeze()`** the registry and nothing else; it cannot alter historical records. Protect it offline, and keep it long-lived — the address is fixed at deploy time and cannot be rotated. **Stable v1 is planned to omit registry-wide `freeze()`.**

---

## Verifier checklist (for users)

When verifying an object:

- [ ] **Chain and contract:** you are connected to the intended network and registry address (or known-good deployment); if using **concern** data, **`NET.counterfeitConcern`** matches the deployment you trust.
- [ ] Passport ID matches QR / bundle (`humanId` / `passportId`).
- [ ] Passport data status shows **AUTHENTIC** (hash check succeeded).
- [ ] **v0.6 card check:** the on-chain `title` / `authorName` / `shortDescription` / `domain` match the file **byte-for-byte**, and the `anchors` array matches `anchorsHash`. Any mismatch is **TAMPERED**, not a warning.
- [ ] **Protection level** (Base / Sealed / Attested) is a summary of *evidence strength*, recomputed live — never an authenticity verdict, and never something printed on the object. Treat a passport shown as "declared" (bundle unavailable) as unverified content.
- [ ] **`creatorId`** matches what the issuer publishes on an **official** site.
- [ ] For **P** or **M** profiles — the ID is **not** proof of identity on-chain; confirm on the institution’s official channel.
- [ ] If **`mintAgent`** is shown non-zero — understand a delegate executed the mint; **`creator`** is still the issuer wallet on record.
- [ ] Proof records — find each **`creatorId`** on the institution’s site if you rely on proofs.
- [ ] NFC — challenge-response where applicable; numbered seal — visual compare.
- [ ] `dataUrl` / image URLs — legitimate domains; verify file hashes where offered.
- [ ] **Concern flag (if present):** confirm the **prover** profile ID and that your tool reads the **same** main + satellite addresses as the issuer’s deployment.

---

## Protocol options outside the main registry

Described in **[`SPEC.md`](../SPEC.md)**:

- **Global uniqueness of passport `dataHash`** — would forbid two mints with the same JSON anchor hash; product tradeoff. **Not implemented**, roadmap alignment only.
- **Optional author attestation (EIP-712)** — a separate author key attests to a passport's `dataHash` + `creatorId` binding, independent of the wallet that minted. **Deployed** as the `ODPAuthorAttestation` satellite (SPEC §7 for the address); the main registry itself performs **no** attestation checks, so this is a property of that satellite, not of the registry.

**What an author attestation does and does not prove.** It proves that whoever controls the attesting key signed *those exact bytes* for *that passport on that registry* — the EIP-712 domain binds the signature to this chain and this satellite address, so it cannot be replayed elsewhere. It does **not** prove authorship in any legal sense, and it does **not** vouch for the key holder's real-world identity: as everywhere else in ODP, an ID is only as trustworthy as the issuer's own published channels (§3).

**Reading attestations safely:** an attestation is meaningful only while its stored `dataHash` still equals the passport's current on-chain `dataHash` — verifiers MUST compare the two before showing it. Its absence is **not** a negative signal: attestation is optional and most passports will not carry one. Submission is restricted to the passport's `creator` or `owner` so a third party cannot squat the single, one-shot attestation slot with a key of their own.

---

## Static analysis in CI (Slither) — findings and triage

**Not a substitute for a professional audit.** Every push and pull request runs **Slither** over each entry contract (`.github/workflows/ci.yml`, job *Slither static analysis*) with `--fail-high --solc-args "--via-ir --optimize"`. The build fails on **high** severity.

**Current status: no high or critical findings.** The detectors that do fire are listed below with the reason each is accepted, so contributors and reviewers can see they were triaged rather than ignored. Re-check this table whenever the contracts change.

| Slither detector | Where | Verdict |
| --- | --- | --- |
| `uninitialized-local` | `ODPPassportLib.utcYearMonthFromTimestamp` — `bool found` | **Accepted.** Solidity zero-initializes the local to `false`; the loop sets it and `if (!found) revert EC(83)` immediately follows. The detector flags the declaration style, not a defect. |
| `missing-zero-check` | `setRelationsSatellite`, `setExtensionRouter` | **By design.** `address(0)` is the documented way to *clear* a satellite pointer; a zero-check would remove that capability. |
| `incorrect-equality` | profile-type comparisons (`t == TYPE_P` …), `year == cy && month == cm` | **Accepted.** These compare a `bytes1` type prefix and integer year/month — strict equality is the only correct comparison. |
| `timestamp` | several functions | **Mostly noise** (the detector taints whole functions, flagging even `bytes(x).length > 0`). The genuine uses are delegation expiry and UTC month derivation, where a miner's few-second drift is immaterial at that granularity. |
| `reentrancy-events` | `ODPExtensionMintRouter.mint*ViaExtension` | **Low.** Only event ordering: the external call targets our own registry and no state is read back afterwards. |
| `unused-return` | `getCreator`, `getPassportClassification` calls | **By design.** These are existence checks — the callee reverts when the record is absent, so the return value is intentionally discarded. |
| `solc-version` | `^0.8.20` across all files | **Known limitation — see below.** |

### Known limitation: solc 0.8.20

The deployed v0.6 bytecode was compiled with **solc 0.8.20 + `--via-ir --optimize`**. That version carries three known compiler bugs. Two are **not applicable** to this codebase — verified by inspection: `MissingSideEffectsOnSelectorAccess` needs `.selector` access (not used anywhere in `chain/contracts/`) and `VerbatimInvalidDeduplication` needs `verbatim`/inline assembly (not used). The third, `FullInlinerNonExpressionSplitArgumentEvaluationOrder`, relates to the full inliner and is therefore relevant in principle under `--via-ir`; it is fixed in **0.8.21+**.

The compiler will be raised to ≥0.8.21 when the **next registry line (v0.7)** is compiled. Recompiling now would change the bytecode without changing the already-deployed v0.6 registry, so the live deployment stays on 0.8.20 and its Polygonscan verification must use that version.

### Earlier informal review (Remix)

A pass through **Remix** (or similar IDE/static tooling) on the reference **`ObjectDigitalPassport.sol`** reported **no major on-chain issues** immediately suggesting direct theft or classic scam patterns, and noted sensible patterns: **custom errors**, **input validation**, **role checks** (`governance`, creator, owner paths), **`notFrozen`** on writes, and limited reentrancy surface on core paths.

**Scope note:** operators who deploy **`ODPCounterfeitConcern`** should include that artifact in their review process; it is a **separate** contract with its own trust boundary (paired main registry address).

**Limits of this class of tools:** they do **not** model **off-chain** trust (`dataUrl` / hosted files), **governance** policy (malicious extensions, revocation power), **economic** abuse (e.g. a **mint agent** burning a principal’s **C/B** monthly quota), or deployment/configuration mistakes. **`mint*ViaExtension`** uses **`staticcall`** into **governance-approved** extension contracts — not classic reentrancy into this registry, but a **trust boundary** on the extension’s correctness.

Treat **formal verification**, **timelocks** for governance (off-chain multisig process if bytecode stays minimal), and **event** consistency as **production hardening**, not conclusions from a single static run.

---

## Code scanning (CodeQL)

**CodeQL runs from GitHub's Default setup**, configured under *Settings → Code security → Code
scanning*. There is deliberately **no CodeQL workflow in this repository**, and one must not be
added back without first switching that setting to Advanced.

The two are mutually exclusive, and the failure is silent in the way that matters: an Advanced
workflow runs the full analysis, then GitHub rejects the upload with *"CodeQL analyses from
advanced configurations cannot be processed when the default setup is enabled."* The job burns its
runtime and produces **no alerts at all**, while looking like a configured security control.

This repository has made that mistake twice. An Advanced workflow was added, removed in **v0.4.1**
for exactly this reason, then re-added in the 0.7 line on the assumption that the UI switch would
follow. It did not, and the workflow failed on **every one of its runs** — on `main` as well as on
pull requests — for four months, unnoticed because code scanning is not a required check.

The one thing Advanced setup offered was a `paths-ignore` for the generated WalletConnect bundle,
which is the whole reason it was reintroduced. That bundle left with the reference website in the
0.7 line, so the reason went with it.

Default setup covers **JavaScript/TypeScript, Python and GitHub Actions** — more than the workflow
it replaced, which analysed only the first two. Solidity is not a CodeQL language and is covered by
Slither, above.

**If an exclusion is ever needed again**, that is the moment to switch the UI setting to Advanced
*first*, then add the workflow and its config in the same change — and to confirm the upload
succeeds, not merely that the job appears.

## Reporting security issues

Open an issue at:
[https://github.com/object-digital-passport/specifications/issues](https://github.com/object-digital-passport/specifications/issues)

For sensitive disclosures, use **[GitHub private security advisories](https://github.com/object-digital-passport/specifications/security/advisories)** for this repository.
