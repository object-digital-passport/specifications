# Security model — redesigned 0.7, ABI `0.7-redesign-8`

Normative behavior: [SPEC](../SPEC.md). Terms: [glossary](GLOSSARY.md). Release evidence: [sealed `0.7-redesign-6` checks](../review/audit-handoff-abi6/TESTS_AND_ANALYSIS.md), which do not cover the current sources, and [the delta after that package](../ODP_07_ABI6_DOCUMENTATION_DELTA.md) (Russian).
The earlier security guide is archived under `review/astra/legacy-docs/docs/SECURITY.md`.

| Surface | Enforced | Not established |
|---|---|---|
| Core | Direct issuer, immutable fields, operation replay/conflict checks, 72h/24h revocation before print finalization | Truth, title, authenticity, recovery after lost key |
| P/M registration | Permanent wallet/type registration | Accreditation; registration is permissionless |
| Concerns | One active episode per pair, own withdrawal, stable indexes | Consensus or verdict; self-selected institution profiles are not accreditation |
| Hosting | Separate expiring publishing grant | URL safety, remote availability or content correctness |
| Author signature | EIP712 bytes/domain and signer possession | Identity of an arbitrary authorSigner |
| Edition activation | Core-bound parameters, issuer nonce uniqueness, root membership, signature, one-shot local slot | Physical possession, purchase time, clone detection certainty |
| Statement journal | Own lifecycle, typed role checks, atomic predecessor replacement, author-only withdrawal | Truth, human identity, complete off-chain payload availability |
| Directory | Syntax of a self-declared DNS name | Domain control or institution identity |
| Client generation pins | External policy | No administrator in the core enforces this policy |

Contracts cannot inspect canonical JSON or retrieve SHA-256 preimages. Clients verify fields, hashes,
files, edition root/nonce/namespace and identity independently. A successful transaction is not a verification
verdict. Offline integrity checks cannot establish current revocation/activation state.

The core calls no external code. Satellites pin a core and cannot grant themselves rights in it. Replacing
a satellite creates a new history namespace; readers retain the address committed by each edition.
No single registry version byte establishes ABI identity. Pin chain/address/runtime/ABI and a consistent block.

The test suite contains negative access cases, exact72h/24h boundaries, 1000 direct issuer mints,
250 seeded concern transitions, Merkle mutations, domain replay checks, canonicalization edge cases and
four full document-to-EVM roundtrips. Tests and static analysis bound known risks; they are not a proof that
all vulnerabilities are absent. Do not deploy from a claim of “ideal” or from a test count alone.

This generation removes profile stop entirely. Compromised keys retain issuer rights; no admin recovery or
wallet rotation exists. Passport revocation and statement withdrawal remain separate.

Print finalization is irreversible and closes the revocation window early. It is a registry flag only: the
core observes no printer, cannot prevent external printing, and the application-side print gate is not
implemented in this repository. A compromised key can finalize a passport and thereby close the legitimate
issuer's own correction window.

`previewHash`, added in `0.7-redesign-8`, commits a lighter public copy of the primary photo. The core checks
only that a nonzero value comes with a nonzero `imageHash` and differs from it; it cannot check size, metadata
or that the copy shows the same picture. Upload services, pinning services, gateways and sponsors are
replaceable conveniences, and every fetched file is accepted by hash only (SPEC §22.19). A gas sponsor in 0.7
only sends POL to a user's address; it sees that address and its public actions and gets no wallet access
(SPEC §22.20). A Safe proposal for mint or `submitProof` that crosses a UTC month boundary cannot execute and
blocks later proposals of that Safe until a rejection transaction uses its nonce (SPEC CA-5.8 to CA-5.10).


Payload hashes/cards and past events remain immutable; passport revocation, statement lifecycle and hosting
locations have their own mutable state. Revocation is one-shot at or before mint+259200 seconds for C or mint+86400 seconds for B/P/M, only before print finalization, with a
nonzero reason, by the original issuer. It neither erases history nor establishes counterfeiting. No recovery
of lost keys, concealed codes or original files from hashes is possible. Withdrawal does not free the one-shot
author slot; an issuer-chosen key can occupy it permanently. Journal claims are an independent namespace.

Operation IDs are scoped to caller/contract; compare full namespace and digest before interpreting a custom
AlreadyCommitted error. Exact replay survives later lifecycle/calendar changes and does not reactivate data.
Strict UTF-8, custom bit31 and full list/tree validation are implemented in reference tools; safe ZIP,
URL fetch/redirect/private-IP limits, client finality and identity UI remain separate open work.

Polygon mainnet is the only network; Amoy is not used. The approved generation was deployed there on 2026-09-25 (SPEC §7, `chain/generations.json`).
Pinned release, verified resume, nonce/spend limits and two-RPC finality reduce deployment mistakes; they do
not prove RPC honesty or constitute permission to deploy. Current work forbids wallet/network access.
