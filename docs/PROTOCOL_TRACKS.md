# ODP 0.7 implementation boundaries — ABI 0.7-redesign-7

Informative; [English SPEC](../SPEC.md) is normative. The older Track A/B descriptions are superseded;
their snapshot remains in [the sealed source](../review/audit-handoff-abi6/SOURCE/docs/PROTOCOL_TRACKS.md).

| Area | Current local implementation | Separate outstanding acceptance |
|---|---|---|
| Core | Direct registered issuer mint, operationId, immutable card/hashes, issuer revoke within 72h (C) or 24h (B/P/M) and only before print finalization, irreversible `finalizePassportForPrint`, B-only non-unique edition models | Independent audit, a release bundle rebuilt for this ABI, and a production generation |
| Nine satellites | Journal/proof replay, own withdrawal, edition commitment/activation, hosting/directory/relations/concerns/author/wallet anchors | Client use, identity and history freshness |
| Tools | Canonical strict UTF-8, semantic/list/tree checks, custom bit31, digests, statement and extracted bundle validation | Safe ZIP and complete app workflow |
| Deployment | Fixed release, manifest/resume, spend/nonce limits, two RPC/finality, final ten-contract verification | Fresh authorization and actual production evidence |

Mint-agent, profile stop, governance/pause, owner transfer, key recovery and unit-passport hooks are absent.
Print finalization is a registry flag: the core observes no printer and cannot prevent external printing,
and the application-side print gate is not implemented here. The sealed `0.7-redesign-6` package does not
certify this ABI; see [the delta](../ODP_07_ABI6_DOCUMENTATION_DELTA.md).
Author EIP-712 attestation exists in its satellite, with an immutable issuer-chosen one-shot slot and separate
signer withdrawal; it does not establish human identity. Core never calls a satellite. EIP-170 is enforced
locally; see [size policy](EIP170_STRATEGY.md). NFC, storage/delivery policy and physical QR validation remain
open or deferred. Polygon mainnet is selected, Amoy is not required, and current wallet/network actions are forbidden.
