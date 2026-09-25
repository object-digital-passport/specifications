# ODP 0.7 contracts and tools

From this directory: `npm ci && npx hardhat clean && npm run check`.
See [repository README](../README.md), [SPEC](../SPEC.md), [tools](tools/README.md) and
[deployment procedure](deploy/README.md). `generations.json` holds the one approved deployment: Polygon mainnet, 2026-09-25.
`abi/` and `types/` are generated from this generation; old 0.7 clients must not reuse their former tuples.
`npm run compile` regenerates both and enforces EIP-170. Keep generated changes together with sources.
No library deployment or callback wiring is required.
