# Changelog

All notable changes to this project will be documented in this file. Russian translation: [`docs/ru/CHANGELOG.md`](docs/ru/CHANGELOG.md).

The format is based on [Keep a Changelog 2.0.0](https://keepachangelog.com/en/2.0.0/) — the six change types only, with the optional per-release summary that 2.0.0 introduced. Versioning here follows the project's own model rather than plain SemVer: each `v0.x` is a **separate on-chain registry generation** (packed `CONTRACT_VERSION`), not backward compatible with the previous one. **The versioned interface is the registry ABI plus the `passport.json` schema** — a new `v0.x` may change either, and passports do not migrate between generations. **Dates are the day a version became usable**: the mainnet deployment date for a protocol line, the GitHub Release date for a tooling-only patch — see [`docs/VERSIONING_AND_RELEASES.md`](docs/VERSIONING_AND_RELEASES.md) and `SPEC.md`. Patch tags (e.g. `v0.4.1`) are reserved for tooling/docs-only fixes that do not change the deployed registry.

This file is drafted from commit history and existing release notes; entries are curated, not auto-generated — corrections welcome.

Entries up to and including 0.6 cover the protocol **and** the reference website, which shared
one repository until the 0.7 line. The website now has [its own
repository](https://github.com/object-digital-passport/object-digital-passport.github.io) and
its own history; what is recorded here from now on is the protocol.

## [Unreleased]

## [0.7] - 2026-09-25

**The 0.7 line, redesigned before its first deployment and deployed on Polygon mainnet on 2026-09-25.** The registry published as the 0.7 pre-release is replaced by a core that records registration facts and nothing else, plus nine satellites; the ABI generation is `0.7-redesign-8`. It was deployed from the release bundle the project owner approved on 2026-09-24 (`sha256:7392c821…a414d7`), and the generation `odp-0.7-redesign-8-polygon-20260925` was approved on the day of deployment; the registry is [`0x3281492981DCD492cc2F7c17398134e1D3B5CA1F`](https://polygonscan.com/address/0x3281492981DCD492cc2F7c17398134e1D3B5CA1F), and all ten addresses are in [`SPEC.md` §7](SPEC.md). No independent audit covers `0.7-redesign-8`: the sealed audit package describes `0.7-redesign-6` and certifies neither later generation.

### Added

- **The specification is fully translated into Russian.** [`docs/ru/SPEC.md`](docs/ru/SPEC.md) was a pointer to the English text; it is now a section-by-section translation of `SPEC.md`, with the same section numbers, CA identifiers, tables and error codes, and a key that maps MUST/SHOULD/MAY to their Russian equivalents. The English text stays normative. Four other Russian guides caught up with their originals.

- **`finalizePassportForPrint(id)`: an irreversible mark that closes the revocation window before a label is printed.** Only the original issuer can set it. It refuses missing and revoked passports, a repeat call is a no-op that keeps the first time, and it emits `PassportFinalizedForPrint`. `getPassportReleaseState(id)` returns `(revocationDeadline, printFinalizedAt)`. A client must withhold the final print export until finalization is confirmed on chain (CA-2), so that a printed label never points at a passport its issuer can still revoke. The mark does not observe printers and cannot stop anyone printing elsewhere. It does not protect against key theft either, because the same key can finalize and so close its own window.
- **A lighter public copy of the primary photo, committed on chain (`previewHash`, ABI `0.7-redesign-8`).** `previewHash` is the SHA-256 of a JPEG of at most 1 MiB with no GPS or other location metadata, made from the primary photo. The copy travels in the `.odpass` next to the untouched original and is described by one `photo` anchor with `data.role: "preview"`, whose hash must equal `previewHash`. Zero means there is no copy. A client creates one only when the user chooses to publish the photo, and that choice is fixed at mint. A nonzero value requires a nonzero `imageHash` (`EC(142)`) and must differ from it (`EC(143)`); the contract cannot check size, format, metadata or that both files show the same picture, so the client checks those. The original can be large and can reveal where it was taken, which makes it a poor thing to publish. With its own commitment, the copy can be published and still checked byte for byte against the chain, while `imageHash` keeps referring to the original (SPEC §8, §9, §22.19).
- **SPEC §22, "Client application requirements": CA-1 to CA-17.** The decisions of the usage-safety review (D1–D4, A1–A12, R1–R3) are now normative for every client, not only the project's own app. They cover the print gate before label export; no claim of ownership or of a verified human author; recovery of an interrupted issuance; edition secrets only in a separate password-encrypted `.odpsecret` file; institution identity only from independent directories and `/.well-known/odp.json`; one embedded network and registry; `odp://` QR payloads; limits on importing untrusted bundles; privacy of permanent public fields; and no single overall "authentic" verdict. The rules for multisignature issuers include the UTC month boundary. A mint or proof proposal can execute only in the month it names, and when it goes stale, Safe v1.4.1 reverts the whole transaction without consuming its nonce, which blocks every later proposal of that Safe. A client must show the deadline and warn when it is close, show a stale proposal as unexecutable, and offer a rejection transaction with the same nonce and a re-preparation under the same `operationId`. A Safe revocation proposal is treated the same way once its window has ended (CA-5.8–5.10, CA-6.6).
- **SPEC §22.18: mandatory warnings before irreversible actions** (CA-18.1–18.7). The actions are profile registration, mint, print finalization, revocation and edition opening. Each gets its own confirmation screen that says in plain words what cannot be undone, cannot be dismissed by tapping outside it, has a button named after the action and has no "do not show again". ODP has no support desk that could reverse any of these, so, as with a crypto wallet, the client is the only place a person learns that in time.
- **Rules for storing and publishing photos, and for who pays** (SPEC §19, §22.19, CA-19.1–19.11). The owner's `.odpass` is the primary copy of every file, and any network location is a replaceable convenience that is checked by hash. Public copies go to IPFS or Arweave, where publication is permanent in practice. By default only the lighter copy is published, and only after the user has seen it and agreed; its IPFS address is derived from `previewHash` itself. Publication is free where an upload service accepts small files at no charge. Otherwise the user pays in POL from their own wallet, for example by topping up the Turbo upload service, or a sponsor pays through a delegation held by that service. The client sells no storage or credits and holds no service or sponsor key. A fetched file counts only if its bytes match the committed hash, and finding no online copy is never reported as a change to the chain record.
- **A sponsor pays gas only by topping up POL, and a client may offer "Request POL"** (SPEC §22.20, CA-20.1–20.6). A sponsor such as a university funds a user's wallet by sending it POL. It cannot act for that wallet, and all it can do is stop funding. The request goes to an intake address the sponsor owns and runs, since ODP runs no server. It carries only the sponsor's address, the user's wallet address and a `personal_sign` signature over a text naming the wallet, the sponsor, chain ID 137 and the time. A release client creates and stores no wallet keys and connects wallets only through WalletConnect. Signed actions submitted by a third-party relayer are left to a later generation, which will need its own audit.
- **A Safe multisig works as a `B`, `P` or `M` issuer**, shown by a local test against the canonical Safe v1.4.1 bytecode (`chain/deploy/test/ODP07Safe.test.js`). Every issuer action needs two of three owners, and one owner key alone does nothing. The test does not cover live wallets or public networks.
- **Reference tools that prepare and check passports offline** against the redesigned contracts. They provide strict canonical JSON, full edition address-list and Merkle-tree checks, reference digests for mint, journal and proof operations, statement validation against `schema/statement-0.7.schema.json`, and checks of an extracted `.odpass` bundle.
- **§15.3 says what an offline check actually establishes, and §1 stops overselling it.** "Authenticity can be verified without internet using only hashes" was not true: a bundle is checked against the **on-chain** `dataHash`, so with no chain a verifier can confirm that a bundle is internally consistent and nothing more — not that the document was registered, by whom, or whether the passport was later revoked or finalized for print. A forger can produce an internally consistent bundle. Such a result MUST be shown as unconfirmed and MUST NOT read as a positive verdict (CA-16). The same section makes two more things normative: no verifier may rest on a single RPC endpoint, and *could not reach the registry* must never be displayed as *invalid*. §7 points to this dependency where the single network is declared, and §15.3 states plainly that if Polygon PoS ends, live verification ends with it — there is no fallback anchor in this line.
- **`idGranularity` — what a passport identifies.** A required top-level field: `model` (a design, any unit of it), `batch` (one production run), or `item` (one physical object). ODP had folded this into `edition.model`, which answers a different question — how large the run is, not what the record points at — and then needed the distinction anyway in §20, where it was encoded implicitly through the presence of a `unit_key_set` anchor. §9 also states the consequence a verifier must respect: matching an object against a `model` or `batch` passport matches the class, not the individual, and must not be presented as identifying that specific object.
- **Measurement units are a code list.** The `dimensions` anchor now requires `data.unit`, and the value must be a UN/CEFACT Rec 20 common code — `MMT`, `CMT`, `MTR`, `INH`, `FOT`. It was free text, so `"cm"` and `"centimetres"` were equally valid and neither was comparable by software; a measure software cannot compare cannot identify an object. Optional `upperTolerance` / `lowerTolerance` state how far a measured object may fall outside the figures and still match. The code is what the document carries — §9 says a client SHOULD render the unit in the reader's language, because `60 × 40 CMT` is a machine's sentence.
- **[`SPEC.md` §16.1](SPEC.md) — durable hosting for published copies, a normative SHOULD.** Three properties: content-addressed or otherwise integrity-bound, independent of any single operator including the issuer, and retrievable without an account or key through more than one route (§22.19). The section also bounds what losing every online copy costs: the on-chain card outlives any host, and what goes is the identification evidence in `anchors[]` unless someone holds the `.odpass` — a degradation to be shown as such, not a revocation.
- [`docs/ORG_NAMING_AND_SITE.md`](docs/ORG_NAMING_AND_SITE.md) — a proposal, applied nowhere: repository names in the c2pa-org style, what each rename would break, and why `odp.github.io` cannot be obtained.

### Changed

- **The mainnet preflight accepts a fee cap between the current gas price and twice the base fee.** It used to require `maxFeePerGas` of at least twice the base fee plus the priority fee, so the balance had to cover the whole deployment at that price even when the current price was far lower. Now it fails only when the cap is below the current price, and reports a warning when the cap is below the conservative value, because a creation may then wait for the price to fall. The deployment script and the approved release bundle are unchanged.
- **Every issuer must publish its profile ID, and the multisig month warning has a number.** Publishing the profile ID and the full wallet address on a channel the issuer controls was a recommendation; it is now required of every issuer, and organizations (`B`, `P`, `M`) must also serve `/.well-known/odp.json` ([`SPEC.md` §3](SPEC.md)). The registry cannot enforce it, so an unpublished profile is simply unidentified. A client warns when a Safe mint or proof proposal is created less than 24 hours before the end of the UTC month (CA-5.8). The example deployment spend policy again carries a 25 % margin over the measured `0.7-redesign-8` deployment gas: 3 500 000 for the core and 1 780 000 for the statement journal.

- **Contract-wallet issuers can prove their wallet, and the identity file names its format and wallet.** The off-chain creator wallet proof now accepts ERC-1271 `isValidSignature` for issuers registered to a Safe or another contract wallet, with the block of the check recorded ([`SPEC.md` §11](SPEC.md)). `/.well-known/odp.json` carries `"odp": 1` and an optional full `wallet` per profile, matching the [ODP Profile Directory format](https://github.com/object-digital-passport/odp-profile-directory); a listed wallet that differs from the registry does not count. Edition master seeds MAY also be backed up on paper as SLIP-39 shares next to the `.odpsecret` file (CA-7.7), and large print runs SHOULD use an ISO 14298 printer (CA-7.8). The ESPR article references in §18.0 were checked against the Official Journal text.

- **Breaking: the 0.7 registry is a different contract set from the 0.7 pre-release** (ABI `0.7-redesign-7`, and now `0.7-redesign-8`). The core, `ObjectDigitalPassport`, registers profiles, mints, revokes within a short window and finalizes for print; it has no administrator, owner, proxy, pause or callback. The nine satellites read a core pinned in their constructor, and the core knows none of their addresses: `ODPEditionUnits`, `ODPStatementJournal`, `ODPPassportProofRegistry`, `ODPPassportConcerns`, `ODPHosting`, `ODPProfileDirectory`, `ODPRegistryRelations`, `ODPAuthorAttestation` and `ODPWalletDocumentAnchor`. A replaced satellite is a new namespace, and records stay with the address that made them. Sixteen of the audit's thirty-six findings, all four critical ones among them, were closed by removing the code they were in. The packed `CONTRACT_VERSION` stays 7 for every 0.7 generation, so it does not tell them apart: a client selects the decoder by an independently authenticated chain, address and ABI generation identifier (SPEC §7, §14).
- **Breaking: `PassportMintInputs` and `PassportMediaView` gain `previewHash` (ABI `0.7-redesign-8`).** It is a `bytes32` placed directly after `imageHash` in both tuples; see Added for what it commits to. Any client that encodes a mint or decodes `getPassportMedia` against `0.7-redesign-7` produces the wrong tuple, so it must move to the new ABI. Earlier 0.7 ABIs are not compatible with it.
- **Breaking: revocation is a short correction window, not an eraser.** Only the original issuer may call `revokePassport`, with a nonzero reason hash: up to 72 hours after mint for a personal `C` profile, and up to 24 hours for `B`, `P` and `M`. Both bounds are inclusive, and the call is refused after print finalization (`PassportPrintFinalized`) or after the window (`EC(132)`). After that, a correction is a new passport plus a public statement explaining it. The window replaces the pre-release's activation lock: a clock closes it, so no satellite needs authority over the core (usage-safety D2).
- **Breaking: only a `B` profile can issue anything other than a unique object.** Every non-unique `editionModel` (`limited`, `open`, `dynamic`) now requires `B` even without unit anchors, alongside anchor bits 4096 and 8192, and is otherwise refused with `EC(121)`. The pre-release restricted only the two unit bits, so a personal profile could declare a run of thousands with nothing behind it. The `physical` and `mixed` examples and vectors now declare `unique`. `preparePassport` enforces the same rule when it is given the issuer type.
- **Concerns are recorded per raiser** (`ODPPassportConcerns`). One slot per passport let an impostor take it first and silence the museum that would have answered. Now any number of profiles can each hold their own concern about the same record. Profile-wide concerns were considered and left out, because flagging a whole issuer in one transaction would make a weapon.
- **An issuer may print its own `https://` link that carries the passport ID** in exactly one `odp` query parameter, for example `https://issuer.example/p?odp=ODP-2026-09-123456789`, as an alternative to `odp://<id>` (owner decision 2026-09-24; SPEC §12, CA-14.6–14.8). This relaxes the pre-release rule that no website address is printed on an object. The phone's camera opens the issuer's site or app, while an ODP scanner takes only the ID from the link and checks it against the registry without the site. The rules are strict: `https` only, no user-info, exactly one `odp` parameter, and a value in the exact Passport ID format; anything else is "not an ODP label". The link's host is shown as context and compared with the domain the issuer declared, and a match is never presented as proof that the object is genuine. The earlier plan to use GS1 Digital Link is withdrawn.
- **The target network is Polygon mainnet (chain ID 137) alone.** Polygon Amoy is used neither for a preliminary deployment nor for testing (owner decision 2026-09-24). The logic recheck of 2026-09-24 had recommended a separate test generation, because anything testers create in the production generation stays public permanently; that recommendation was considered and not taken. A client embeds one network and one registry (CA-12).
- **Deployment uses only a pinned, approved release bundle and checks every contract twice.** `chain/deploy/scripts/deploy-generation.mjs` reads bytecode from a fixed bundle, never from the build output in the working tree. It writes the plan before each broadcast, resumes without redeploying, caps nonce and spend, and on Polygon confirms receipts, runtime code and finality through two separate RPC providers before it emits a generation manifest. None of this has been run against a public network.
- **`ODPPassportProofRegistry` derives its packed version instead of hard-coding it.** The satellite carried a written-out `CONTRACT_VERSION = 6` beside a registry computing 7; it now derives `SPEC_MAJOR * 16 + SPEC_MINOR` the way the main registry does, and `SPEC.md` §4 and §14 state that a satellite and the registry it is wired to must report the same byte. 109 Hardhat tests pass unchanged.
- **`tools/build-spec.mjs`** points at `schema/passport-0.7.schema.json`; it referenced the removed 0.6 file and would have failed the spec-site build.
- **The canonicalization vectors are on the 0.7 line.** `schema/vectors/physical.*` carried `"version": "0.6"`, so the project's only known-answer vectors fixed the canonical bytes of a superseded line. Regenerated from the document rather than edited by hand: `dataHash` becomes `0xf605c10cdd02f0a349480726733cd65696ea95e94e8c75069b64cafaf3e30140`, `anchorsHash` is unchanged at `0x24ade00dc43b64a86c7f59d7e996035d59654d302fda07e7011cdada5513925f` because `version` is not part of the `anchors` array.
- **The permanence sentence in the README** now says what it covers: a deployed registry answers for as long as the chain does, which is not a promise that one address serves every generation.
- The **organization profile README** is rewritten against the repository as it is, and its repository-relative links are checked by CI — it described the pre-0.7 layout, listed two of four repositories, and linked a file that does not exist.
- **Branch protection is committed configuration** rather than a description of what to click: two importable rulesets under [`.github/rulesets/`](.github/rulesets/).
- CI checkouts no longer persist the job token into `.git/config`.
- **The canonicalization vectors have moved several times in this section; the current values are in `schema/vectors/*.expected.json`.** Each move came from a change to the hashed document, and each set of vectors was regenerated from the document, not edited by hand. `version` became `"0.7"`, which changed `dataHash` only. `idGranularity` joined the document and the `dimensions` unit joined the `anchors` array, which changed both hashes. The `physical` and `mixed` examples then became `unique` under the B-only edition rule, which changed `dataHash` again (physical: `0xcecd76bcae2375d051f35da7226742bdeffca38f6289081e75b86530ca9f10d7`), and `anchorsHash` stayed at `0xa0be7545063f44f42ee6b759d432fc8e9155c81e48dc31e539c6248e47aa267b`. This work is being done now because it cannot be done later: the canonical bytes freeze at the first mint, and no passport has been issued on any 0.7 generation.

### Removed

- **Profile stop.** `revokeCreator()`, `CreatorRevoked`, the profile `revokedAt` and `EC(131)` are gone, and this entry replaces the one that announced them earlier in this section. The contract audit showed the stop did not do what it promised: a stolen key could still revoke the issuer's whole recent catalogue, and and a thief could stop the profile as easily as its owner could. A profile is now permanent, and ODP has no rotation, recovery or blocking of a key (SPEC §3, §17, CA-1.1). Keeping the key and its backup safe is the issuer's responsibility. A compromise is announced outside the registry, through a new profile and the issuer's own channels, and ODP never presents that announcement as an on-chain fact. The `compromised` statement in `/.well-known/odp.json` described in the same earlier entry is not part of the current specification either.
- **Ownership and everything built on it:** `transferPassport`, the owner field and the mint-time `initialOwner`. The chain never knew who physically held an object, so a field that named an owner claimed something the registry cannot check. Activating an edition unit records the first proof of access to that unit's key; it does not name an owner (D4, SPEC CA-4, CA-17.3).
- **`tx.origin` and every form of delegated issuance:** `ODPExtensionMintRouter`, `IODPExtension`, the example pass-through extensions and the mint-agent role. The audit's first critical finding was that the registry substituted `tx.origin` behind the router, so any contract a registered issuer called could mint in their name. A mint now always registers the caller's own profile. A contract wallet such as a Safe issues as itself; forwarding a call impersonates nobody.
- **Unit passports and the edition revocation lock:** `mintUnitPassport`, the unit-key-signed mint path, `lockEditionRevocation` and `isRevocationLocked`. The unit-key signature did not cover the passport card, so a key holder could publish arbitrary text under the brand's name. The lock is replaced by a clock: the revocation window closes by itself (see Changed).
- **Governance, `freeze()` and the deployer role:** `transferGovernance`, `setEditionUnits`, `setExtensionRouter`, `setRelationsSatellite` and `freeze()`. Whatever address governance named as `editionUnits` could mint under any profile and strip any passport of its revocation remedy. The constructor is now empty, and after deployment no address can do anything special to the registry. `freeze()` was marked deprecated in 0.6 for removal in v1; it goes one line early.
- **The core's event history and URL fields:** `recordPassportEvent`, `getPassportEvents` and `updatePassportUrls`. Statements now live in `ODPStatementJournal`, and mutable locations in `ODPHosting`.
- **`ODPCounterfeitConcern`**, replaced by `ODPPassportConcerns` (see Changed).
- **Verification vocabulary and rules that contradict the redesigned model:** the assurance tiers (Base, Sealed, Attested) and the `AUTHENTIC` / `TAMPERED` state names, replaced by per-part results (CA-16); "the first registrant of a file hash is its author of record", which contradicts D3 (CA-3); the `originals/` bundle layout and the rule that `dataUrl` serves only an `.odpass` (§15, CA-19.6); GS1 Digital Link pairing and a resolver discovery file that listed a testnet (§22.12, §22.14); unit-label web parameters (`unit`, `u`, `lsig`); and ERC-4337 paymaster sponsorship of activations (§22.20).
- **`schema/passport-0.6.schema.json` and `schema/examples/{physical,digital,mixed}.json`**, together with the CI job that validated one against the other. The 0.6 line is superseded; its release notes stay as written, and a passport issued under it still verifies against its on-chain hashes, which do not depend on the schema file. The 0.7 corpus gains `physical`, `digital` and `mixed` alongside the existing `edition`.
- **`schema/passport-0.5.schema.json`**, for the same reason and on the same terms: 0.5 is superseded exactly as 0.6 is, and leaving one dead line in `schema/` while removing the other only invites the question of which of them is live. Its one dependant was [`docs/OBJECTID_PROFILE.md`](docs/OBJECTID_PROFILE.md), which cited the file as the machine-readable check for its `objectId` block. That block belongs to the v0.5 document shape; the v0.7 line has no `objectId` at all, because the Object ID identification categories became first-class fields and anchors of `passport.json` itself (§9). Both language versions of the profile now open by naming the line they describe and point at `schema/passport-0.7.schema.json` for validation on the current one.

### Fixed

- **An edition address list that repeats a unit address is now rejected** by the reference `verifyAddressList`. A consistent Merkle root proves only that the public list was not altered, not that every unit has its own key; one address at two indexes is a provisioning error that gives two items the same key (usage-safety A3, SPEC CA-7.3).
- **Three defects in the reference preparation tools, each found by the contract audit and each now covered by a test.** An anchor type named after an `Object.prototype` member (`constructor`, `__proto__`, `toString`, `hasOwnProperty`) produced the wrong `anchorTypesMask`, because the bit table was read through inherited properties; lookup is now own-property only, and an unknown type gets the custom bit 31. Malformed UTF-8 was silently replaced instead of rejected before canonical hashing; decoding is now fatal on every preparation path. A zero edition root was accepted; it is now refused, and the root, count and full address list are rebuilt and compared before a mint is prepared.
- **`npm run check` no longer breaks the CI step that compares generated TypeChain with the commit.** The final test run recompiled and rewrote `chain/types/` in a different export order; it now reuses the compiled artifacts.
- **The 0.7 line is now stated consistently across the specification, the schema and the contracts.** `SPEC.md` required `version: "0.6"` in §9 while §14 and `schema/passport-0.7.schema.json` required `"0.7"`, and §8 described the `Passport` struct as packing `contractVersion` **6** while `ObjectDigitalPassport.sol` compiles `SPEC_MAJOR = 0`, `SPEC_MINOR = 7` — an implementer following one section produced a document the other rejects. Every version claim in `SPEC.md`, `docs/ru/SPEC.md` and the canonical examples now reads 0.7. Nothing caught this because the 0.7 example corpus held a single file; it now holds four.
- **`did:odp` no longer reads as DID support** ([`SPEC.md` §18.2](SPEC.md)). `odp` is not a registered DID method — no method specification, no resolver, no entry in the W3C DID Specification Registries — so software requiring a resolvable DID cannot consume the string. The section now says so first and describes the strings as a naming convention, which is what they are.
- **§7 no longer presents v0.6 addresses as this line's canonical registry.** The v0.6 and v0.5 addresses are listed as *Superseded lines*, for reading historical records only: a 0.7 client must not issue against them, substitute them for a 0.7 address or report their records as verified 0.7 passports (CA-12.1). Where the pre-release sent a client without context to "the canonical registry of §7", a client now resolves only against the single generation it embeds (§12, §22.12); no 0.7 address exists before deployment.
- The **advanced CodeQL workflow is removed again**. It has failed on every run since it was added — GitHub rejects the upload when Default code scanning is enabled, so the job ran the full analysis and produced no alerts, on `main` as well as on pull requests. The same workflow was removed for the same reason in v0.4.1; the `paths-ignore` that justified reintroducing it pointed at a bundle that left with the website. Code scanning runs from Default setup, which covers JavaScript/TypeScript, Python **and** GitHub Actions. Recorded in [`docs/SECURITY.md`](docs/SECURITY.md#code-scanning-codeql) so it does not return a third time.
- **The spec site builds again, and CI now proves it.** `tools/build-spec.mjs` crashed on every run: `marked` v16 replaced the positional `link(href, title, text)` renderer signature with a single token argument, so `href` arrived as an object and `href.split("#")` threw `TypeError`. The renderer now takes `{ href, title, tokens }` and renders the link text through `this.parser.parseInline`; link rewriting is unchanged — `LOCAL_TARGETS` entries resolve to local pages, everything else to GitHub blob URLs. Nothing ran this script on a pull request. `pages.yml` invokes it only on push to `main`, where a total failure showed up as a failed deploy rather than a red check, so `/spec/` had not published for several merges. A `spec-site` job in `ci.yml` now renders the site, and asserts every page and the 0.7 schema landed, on every pull request.
- **§18 names the regulation it positions against.** The section opened by gesturing at "regulatory Digital Product Passport (DPP) initiatives" without a regulation number, which reads to anyone working with the EU DPP as though it had not been looked at. A new §18.0 names **Regulation (EU) 2024/1781** (ESPR) Chapter III, states outright that an ODP passport is not an ESPR DPP and must not be presented as satisfying an ESPR obligation, and then names the only two substantive overlaps: Art. 11(e), a passport remaining available after insolvency, liquidation or cessation of activity — which an on-chain record has by construction, though the bundle behind `dataUrl` does not — and Art. 11(g), authentication, reliability and integrity of the data, which is what `dataHash` / `anchorsHash` and the card check are for. Existing subsection numbers are untouched, so every cross-reference to §18.1 and §18.2 still resolves.
- **Specification text lost in the 0.7 rewrite is back, restated against the current contracts.** Compressing `SPEC.md` for ABI `0.7-redesign-7` also dropped rules that were still true. They return inside the existing sections, with no renumbering: terminology (§1.1); how Passport, Profile and proof IDs are generated and what the profile types are for (§2–§4); display rules for affiliation (§4); label elements (§5); the `numbered_seal` and `nfc` anchor data, NFC still informative (§6); the superseded v0.6 and v0.5 addresses (§7); the stored record (§8); the document's fields, anchor contents, content classes, mixed objects and C2PA (§9); hashing pitfalls (§10); checks against the object, the creator wallet proof and the wallet document anchor (§11); the `odp://` grammar and QR error correction (§12); the read surface (§13); §15.3; §16.1; key management (§17); §18.0–§18.3; and the edition rules on index shuffling, variant salts, carriers, activation and stated limits (§20.2–§20.14). Every old section is mapped in `review/spec-restoration-0.7/REPORT.ru.md`.

### Security

- **The 0.7 registry was audited before it could ship, and every finding is backed by a test.** The audit made 36 findings, 4 of them critical: `tx.origin` substitution behind the extension router; a unit-key signature that did not cover the card; a governance-named `editionUnits` address that could mint under any profile and remove any passport's revocation remedy; and a relations satellite that, by simply lying, granted mint-agent and publishing rights. Each finding has an executable proof of concept. All four critical findings were closed by removing the code that contained them, and the rest were answered by satellite, specification and client work. Reports and evidence are under `review/`.
- **A usage-safety review of how people will actually hold keys, print labels and hand objects over.** Each of its 19 items has a decision recorded in `review/usage-safety-abi6/CLOSURE.md`, including the 2026-09-24 revision, and the decisions are normative in SPEC §22. None of this is implemented or accepted in a client application yet.
- **A logic recheck of `0.7-redesign-7` (2026-09-24) found no defect in the contracts** and matched them against SPEC §2–§8, §13 and §20. Its main operational finding, the UTC month boundary for multisignature proposals, is now a client rule (CA-5.8–5.10). Two lower findings remain notes for client work: pending affiliation requests never expire, and self-declared `P`/`M` profiles have no issuance limit. Slither was not run on the redesigned contracts.
- **What is not covered yet:** no independent audit of `0.7-redesign-8`; the sealed audit package describes `0.7-redesign-6` only; the contracts are deployed, and all ten are source-verified on Polygonscan from the pinned compiler input (`chain/deploy/scripts/verify-polygonscan.mjs`).

## [0.7-preview] - 2026-08-22 — pre-release

**Not deployed.** No v0.7 registry exists on any network, so nothing can be registered against this line yet; the date is the pre-release tag, not a deployment. Edition passports and per-unit activation keys: one passport for a production run, with a key under a scratch layer on each item. Contracts and tests are done, no issuer tooling or activation page exists. Rationale in [`docs/EDITION_UNIT_KEYS.md`](docs/EDITION_UNIT_KEYS.md) and eleven records under [`docs/adr/`](docs/adr/).

### Added

- **Edition passports** (`B` profiles only): one passport per production run carrying a Merkle root over every unit's key, so 100 000 units cost 32 bytes on-chain.
- **`ODPEditionUnits` satellite**: `openEdition`, permissionless `activate` authenticated by a unit-key signature rather than `msg.sender`, and `mintUnitPassport` for a lazily minted per-unit passport.
- **Four core hooks**: explicit `initialOwner` at mint, a one-way revocation lock the satellite sets on first activation, event kind 8 (edition notice), and a mint path authorised by a unit-key signature.
- **Optional signed outer labels** with the signer key published on-chain, verifiable offline.
- **Known-answer vectors** (`schema/vectors/edition-units.json`) asserted against Solidity, plus `schema/passport-0.7.schema.json`.

### Changed

- **Breaking:** packed `CONTRACT_VERSION` = **7**. A separate registry from v0.6; passports do not migrate. `PassportMintInputs` gains `initialOwner`.
- **Breaking:** the reference website moved to [its own repository](https://github.com/object-digital-passport/object-digital-passport.github.io) and now publishes at <https://object-digital-passport.github.io/>. Every previous address redirects, query string intact. This repository is the protocol: specification, contracts, schema, vectors.
- No hostname is printed on an object (§12.2). The QR carries the `odp://` URI and the readable Passport ID; a website address is one implementation's convenience and was removed from the normative minimum.
- Code entropy floor is per-target: `≥ 80 + ceil(log2(unitCount))` bits, since a forger needs any valid code at any index and the address list is public.
- The unit address list must travel in the `.odpass` bundle, not only at a URL — a proof, and therefore activation itself, is impossible without it.
- Russian translations moved from the website's tree to [`docs/ru/`](docs/ru/); a translation of the standard belongs with the standard.
- `CHANGELOG.md` and every release note were rewritten: one template, one home under [`docs/releases/`](docs/releases/), and a linter that enforces the jargon rules.

### Fixed

- 27 dead relative links across the documentation, and a `dependabot.yml` that watched three directories containing no manifest — which is why npm version updates had never run.
- Both JSON Schema `$id`s pointed at a URL that had never resolved; they now match where the schema is published.
- The published specification site shipped the 0.5 schema under a page titled v0.5 while CI validated 0.6.

### Security

- Cleared the alert backlog: `axios` to ≥1.18.0 and `js-yaml` to ≥4.3.1 through `overrides`, with `elliptic` dismissed as no patch exists. Nothing vulnerable ever shipped — `axios` is absent from the built bundle — but the noise was hiding real findings.
- CodeQL runs from a checked-in configuration that excludes the generated WalletConnect bundle, so thirteen unfixable alerts against third-party build output stop recurring.

## [0.6] - 2026-07-24

On-chain generation 6, deployed to Polygon mainnet. The storage-model redesign. Friendly summary: [release note](docs/releases/v0.6.md).

### Added

- **v0.6 on-chain card**: `title`, `authorName`, `shortDescription`, `domain` written once at mint, immutable, checked byte-for-byte against `passport.json` (SPEC §8, §9).
- **v0.6 identification anchors**: a single extensible `anchors[]` array in `passport.json` (`photo`, `dimensions`, `materials`, `distinguishing_features`, `marks`, `file_hash`, `perceptual_hash`, `c2pa`, `nfc`, `numbered_seal`, `fingerprint`, `dna`, …), committed on-chain via `anchorsHash` + `anchorTypesMask`. A hard identification minimum is enforced at mint per `objectType` (docs/V0.6.md).
- **v0.6 append-only passport events** (`recordPassportEvent`): status, location, rights, condition, damage, restoration, or a custom note — each optionally anchoring a signed document by hash.
- **`freeze()` restored** (deployer-only, irreversible write-stop safety hatch). It existed through v0.4 and was dropped in the v0.5 line to fit the EIP-170 bytecode budget, leaving that registry with no on-chain way to stop writes.
- **`ODPAuthorAttestation` satellite**: optional EIP-712 author attestation binding a separate author key to a passport's `dataHash` and `creatorId`, independent of the minting wallet. Ships as a satellite so the main registry bytecode is untouched. Deployed on Polygon mainnet at `0x1972E68D0A5B19C5ee2af54F8b792c426985F7d7`; the canonical registry address did not change.
- **Assurance tiers** (Base / Sealed / Attested): a display-layer summary of SPEC §11 verification checks, computed at view time from current on-chain state — never stored on-chain, encoded into an ID, or printed on an object (SPEC §11).
- **Canonical registry** (SPEC §7, §12.3, §19.2): the deployed v0.6 registry is now the normative default target for unqualified `odp://` references; other deployments must self-identify.
- **`schema/passport-0.6.schema.json`**: JSON Schema for the v0.6 `passport.json` shape, with `allOf`/`contains` rules enforcing the hard identification minimum; examples rewritten to match (`schema/examples/*.json`).

### Changed

- **Breaking:** packed `CONTRACT_VERSION` = **6**. A separate registry from v0.5 — passports do not migrate, and both the ABI and the `passport.json` schema changed.
- **`documentHash` / `documentUrl`** field naming on Proof records (was `noteHash` / `noteUrl` in v0.5).
- **`docs/SECURITY.md`** (and the Russian mirror) rewritten for the v0.6 threat model, including a static-analysis (Slither) findings triage table.
- **Russian `SPEC.md` translation** (`docs/ru/SPEC.md`) fully retranslated section-by-section to track the v0.6 English `SPEC.md` (was stuck at the v0.5 shape).

### Deprecated

- **`freeze()`** — kept in this line as an alpha-era safety hatch and **planned for removal in stable v1**, where a registry must live without any privileged switch.

### Removed

- **Breaking:** v0.5 `sealType` / `sealHash` / `nfcPublicKey` / `nfcModel` on-chain fields → `nfc` / `numbered_seal` anchors.
- v0.5 `imageHash2` / `imageHash3`, `imageUrl2` / `imageUrl3` → `photo` anchors (no fixed limit).
- v0.5 `currentState.*` and its overwriting setters → append-only `recordPassportEvent`.
- v0.5 `auxCommitment*` → attestation `documentHash`, or a document anchor.
- v0.5 `ndppCommitment*` / the compact `odpOffline` payload → offline carriers now verify directly against `dataHash` / `anchorsHash`.

## [0.5] - 2026-05-12

Deployed to Polygon mainnet and **never tagged** — the mutable current-state model it introduced was already scheduled for removal, and 0.6 replaced it with append-only events. Registry [`0x413aEeBB…2a4B346`](https://polygonscan.com/address/0x413aEeBB2ac437483Bc68791EaAab492C2a4B346); the date is when that address was first recorded here, as the deployment itself is undated. Why it was not released: [the v0.5 note](docs/releases/v0.5.md).

### Added

- Mutable on-chain current-state fields — status, location, rights note, condition note, damage-history pointer — updatable after mint without re-minting.
- Object model built around `physical` / `digital` / `mixed`, with `objectType`, `contentClass`, and refinement tags.
- Compact offline payload (`ndppCommitment*`, `odpOffline`) for printed and NFC carriers.

### Changed

- **Breaking:** packed `CONTRACT_VERSION` = **5**. A separate registry from v0.4; passports do not migrate.

### Removed

- **Breaking:** **`freeze()`**, the deployer-only irreversible write-stop, dropped to fit the registry inside the EIP-170 bytecode limit after the surfaces were split. It existed through v0.4 and is restored in v0.6, so the v0.5 registry is the only line with no on-chain way to stop writes.

## [0.4.1] - 2026-04-05

Patch release: tooling and community-workflow fixes, no protocol change (still packed `CONTRACT_VERSION = 4`). Full notes: [GitHub Release](https://github.com/object-digital-passport/specifications/releases/tag/v0.4.1).

### Added

- New **Standard gap** issue template — propose what is missing or unclear in `SPEC.md`.

### Changed

- Root `package.json`: Hardhat 3.x, `@nomicfoundation/hardhat-toolbox-mocha-ethers`, dotenv 17.x.
- `chain/types/ethers-contracts/`: committed generated TypeScript typings and factories.

### Removed

- Extra advanced CodeQL workflow (conflicted with GitHub default Code scanning's SARIF upload).

### Security

- **Subresource Integrity (SRI)** on third-party CDN scripts (`ethers`, QR libraries, `html2canvas`, `jszip`, `jsQR`) on the creator, passport, and verify pages — a tampered CDN copy is now refused by the browser instead of executed.
- On-chain error text rendered via `textContent` rather than concatenated into `innerHTML`, closing a cross-site scripting path from contract-supplied strings.
- npm `overrides` pinning known transitive advisories out of the dependency tree.

Static-analysis findings inside the generated WalletConnect bundle (`web/backend/js/odp-wallet-wc.bundle.js`) were triaged as won't-fix — build output from npm dependencies, not hand-maintained source. That is a triage decision, not a change; it is recorded here because the scan report is public.

## [0.4] - 2026-04-05

On-chain generation 4. Full notes: [GitHub Release](https://github.com/object-digital-passport/specifications/releases/tag/v0.4).

### Added

- Optional **`ODPCounterfeitConcern`** satellite (P/M profiles only): `raiseCounterfeitConcern`, `clearCounterfeitConcern`, `getCounterfeitConcern`.
- `ODPPassportLib.utcYearMonthFromTimestamp` — the shared helper the registry and `submitProof` use to derive the UTC calendar month (the enforcement it enables is under Fixed).
- WalletConnect v2 session restore on Profile / Passport pages.
- Verify: P-affiliation on-chain audit (read-only parent + join/detach timestamps).

### Changed

- **Breaking:** packed `CONTRACT_VERSION` = **4**. A separate registry from v0.3; passports do not migrate.

### Fixed

- **Registry correction**: an earlier v0.4 build only range-checked `year`/`month` on mint, allowing an arbitrary calendar pair in the human-readable prefix regardless of the actual mint month. That early deployment was frozen before being treated as stable; the fix landed before the line shipped for production use, so the protocol line stayed `v0.4` rather than bumping to `v0.5` solely for this fix.

## [0.3] - 2026-03-29

On-chain generation 3. Full notes: [GitHub Release](https://github.com/object-digital-passport/specifications/releases/tag/v0.3).

### Added

- Passport ownership and transfer (`transferPassport`).
- Account-scoped publishing agent (`delegateCreatorPublishing` / `revokeCreatorPublishing`).
- Irreversible passport revocation (`revokePassport`).
- Single-address governance (`transferGovernance`).
- Up to three on-chain image hashes; optional `auxCommitmentHash` / `auxCommitmentUri`.
- Extension mints (`mintDigitalViaExtension`, `mintPhysicalViaExtension`) with `ExtensionMintUsed`.
- P-affiliation lifecycle (detach on passport UI; propose/confirm on profile).
- Optional DID document export.
- Separate `ODPWalletDocumentAnchor` contract for wallet-level file SHA-256 anchoring (deployed after the main registry).

### Changed

- **Breaking:** packed `CONTRACT_VERSION` = **3**. A separate registry from v0.2; passports do not migrate.
- Heavy `pure` validation logic moved to a linked library, `ODPPassportLib`, so the registry stays under the EIP-170 24 KiB creation limit.

### Removed

- `resolvePassport`, `getProofsForPassportPaged`, `attestExternalDocument` / `getExternalDocumentAttestation` on the main contract (moved to satellites), the on-chain counterfeit-concern registry (removed pending a future replacement), and long `P`-type `require` strings (replaced by `EC(71)`).

## [0.2] - 2026-03-27

On-chain generation 2. Full notes: [GitHub Release](https://github.com/object-digital-passport/specifications/releases/tag/v0.2).

### Added

- `updatePassportUrls` — set, change, or clear the public `dataUrl` after mint without changing `dataHash`.
- Monthly mint caps (anti-spam, gas-only): `C` ≈ 1,000, `B` ≈ 100,000, `P` unlimited per calendar month per wallet.

### Changed

- **Breaking:** packed `CONTRACT_VERSION` = **2**. A separate registry from v0.1; passports do not migrate.
- Register/mint/proof are gas-only — no separate protocol fee.
- `dataUrl` is optional at mint.
- Passport JSON ID field renamed to `passportId` (contract ABI wire name remained `humanId` for compatibility).

## [0.1] - 2026-03-22

First tagged release of the reference implementation: specification, Solidity contract, static web UI, and helper tooling. Full notes: [GitHub Release](https://github.com/object-digital-passport/specifications/releases/tag/v0.1).

### Added

- Initial `ObjectDigitalPassport.sol` contract deployed on Polygon PoS mainnet.
- Static web UI: `creator.html`, `passport.html`, `verify.html`.
- Hardhat deploy scripts and CLI minting tool.

[Unreleased]: https://github.com/object-digital-passport/specifications/compare/v0.7...HEAD
[0.7]: https://github.com/object-digital-passport/specifications/compare/v0.6...v0.7
[0.7-preview]: https://github.com/object-digital-passport/specifications/releases/tag/v.0.7.0
[0.6]: https://github.com/object-digital-passport/specifications/compare/v0.5...v0.6
[0.5]: https://github.com/object-digital-passport/specifications/compare/v0.4.1...v0.5
[0.4.1]: https://github.com/object-digital-passport/specifications/compare/v0.4...v0.4.1
[0.4]: https://github.com/object-digital-passport/specifications/compare/v0.3...v0.4
[0.3]: https://github.com/object-digital-passport/specifications/compare/v0.2...v0.3
[0.2]: https://github.com/object-digital-passport/specifications/compare/v0.1...v0.2
[0.1]: https://github.com/object-digital-passport/specifications/releases/tag/v0.1
