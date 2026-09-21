> Current ABI is `0.7-redesign-7`: [post-audit-package delta](ODP_07_ABI6_DOCUMENTATION_DELTA.md) (Russian), [documentation index](docs/README.md), [glossary](docs/GLOSSARY.md). The sealed audit handoff describes the earlier `0.7-redesign-6` and does not certify this ABI. Target: Polygon mainnet (137), no mandatory Amoy. Current authorization prohibits wallet connection, external-network access, deployment and publication.

# Object Digital Passport

An open registry of issuer statements and immutable document commitments for physical, digital and mixed
objects. ODP records which wallet registered which commitments and when. Identity, physical matching and institutional
assessments are verified separately; the registry does not adjudicate ownership or authenticity.

## Redesigned 0.7

**Local contract candidate for independent audit. No deployed, approved production generation is produced by this work.**
The ABI is `0.7-redesign-7`, incompatible with the earlier 0.7 code even though the packed version byte is7.

- [Normative specification](SPEC.md)
- [Implementation, tests and remaining release boundaries](ODP_07_IMPLEMENTATION.md) (Russian)
- [Independent critique of the previous audit/design](ODP_ASTRA_REVIEW.md) (Russian)
- [Schema and examples](schema/passport-0.7.schema.json), [conformance vectors](schema/vectors/README.md)
- [Offline preparation tools](chain/tools/README.md)
- [Deployment manifest procedure](chain/deploy/README.md)
- [Security model](docs/SECURITY.md)
- [Русский](README.ru.md)

## Build locally

Requires Node22.10+ and npm. From the repository:

```sh
cd chain
npm ci
npx hardhat clean
npm run check
```

This compiles with Solidity0.8.20, enforces the EIP-170 size limit, checks conformance vectors and runs local
EDR tests. Compilation/tests do not load real wallet files. Generated TypeChain files under `chain/types/`
correspond to the current sources; CI checks that compilation does not change them.

## Contract boundaries

The core has immutable cards/hashes, permanent profile registration, caller-only issuance and issuer-only
revocation within72h (C) or24h (B/P/M), only before irreversible print finalization. It has no administrator, freeze, owner/transfer, mutable lifecycleStatus classification, general event-history API,
URL storage, extension router or unit-passport mint. Internal validation is inlined, not externally linked.

Nine independent satellites cover concerns, hosting, domain declarations, institutional proofs, author
signatures, wallet document anchors, affiliations, statement journal and edition activation. They cannot mutate the core.
Edition preparation uses a preselected nonce; the completed root is committed before an ID is assigned.
Clients must retain the activation satellite pinned in the edition document across future upgrades.

## Audit history

The original150 tests reproduced old behavior; independent counterexamples brought that baseline to165.
They are archived with exact baseline contracts in `review/astra/`. Current tests exercise the new behavior;
the totals are not a before/after defect count. Audit documents and legacy guides are historical inputs.
Where they conflict, this generation's SPEC and ABI apply. Historical releases/demos are not a deployed
instance of this rewrite. Apple/Android clients require a separate integration and release cycle.

MIT license. No protocol fees; chain transactions cost gas. Availability depends on chain and file retention.

## Integration handoff

- [Task for the application session (Russian)](ODP_07_APP_HANDOFF.md)
- [Sealed `0.7-redesign-6` audit package](review/audit-handoff-abi6/README.md) — a snapshot, not a review of the current sources
- [What changed after that package](ODP_07_ABI6_DOCUMENTATION_DELTA.md) (Russian), including the open conflicts that block a release bundle

Historical prelaunch verification: [clean build, deployment rehearsal and remaining wallet binding](review/v07-prelaunch/README.md).
