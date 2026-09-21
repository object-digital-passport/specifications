# ODP 0.7 release and deployment (ABI 0.7-redesign-7)

**Current restriction: do not connect a wallet, access public networks, deploy or publish.** The future commands below require new explicit authorization, including the read-only RPC preflight. No public generation is approved. Compile/test/packaging do not load keys. A local EVM test deploys all
ten factories and checks complete runtime, including registry and EIP-712 immutable values.

## Offline release preparation

From `chain/`, run `npm ci`, `npx hardhat compile --force`, `npm run compile`, `npm run vectors`,
`npm run test:tools`, `npx hardhat test --no-compile`. Preserve full build-info input and output.

Run `node deploy/scripts/release.mjs BUILD_INFO SOLJSON NEW_RELEASE_FILE`. The packager requires the exact
current recursive Solidity source roster/content, recompiles the standard-json input twice with the supplied
compiler, and requires exact equality to recorded build output. The release includes source content,
settings, full output, compiler-file hash, lockfile hash, build-info hash, all ten ABI/creation/runtime
artifacts and named immutable offsets. It prints the SHA256 of the canonical release bundle.
The source commit is provenance only: dirty source content is embedded, so HEAD is not the release identity.
Review and preserve the bundle and its hash independently; the packager does not approve a compiler or release.

## Future separately authorized deployment

The user selected direct Polygon mainnet deployment, conditional on successful release verification. No Amoy deployment is required. A configured deployment signer and these inputs remain mandatory:

- `ODP_ENABLE_DEPLOY=1`, explicit `--network`, and matching `ODP_DEPLOY_CHAIN_ID`.
- `ODP_RELEASE_BUNDLE` and independently approved `ODP_RELEASE_HASH` from offline preparation.
- `ODP_GENERATION_ID` and `ODP_DEPLOY_MANIFEST` for that generation.
- `ODP_DEPLOY_CONFIRMATIONS`, a positive integer selected for the network finality policy.
- From `chain/`, use `npm run deploy:mainnet` only after authorization; it disables compilation. `deploy:testnet` remains an optional separately authorized Amoy path, not a prerequisite.

Factories use only pinned bundle bytes, never ambient Hardhat artifacts. The manifest writes predicted
address, nonce, constructor arguments and complete creation transaction data before broadcast, then tx hash
and status. File writes are flushed before rename. A lock refuses concurrent runs against the same path.
For each receipt, the script verifies sender, nonce, chain, zero value, contract creation, exact data,
contract address, canonical receipt block and exact runtime. Immutable bytes are computed and compared,
not masked. Any mismatch interrupts the run. Public finality policy and independent RPC/source verification
are still required before approving a generation.

## Interrupted runs

`ODP_RESUME=1` permits an existing manifest with the same release, chain, deployer and generation ID.
Every existing transaction is reverified before any new broadcast. Unknown/pending or missing transaction
hash stops the run. A crash before saving the hash requires read-only nonce/transaction reconciliation. Supply a JSON contract-name → transaction-hash map via
`ODP_RECOVERY_TRANSACTIONS`; every supplied transaction is verified against the planned sender, nonce,
constructor, release bytes and runtime before any further broadcast. This map cannot replace an already
recorded hash. If no transaction was broadcast, the unresolved plan stays blocked;
do not delete the planned entry or choose a new manifest to bypass it. A stale `.lock` after process death
requires confirming the original process is gone before manually removing the lock. This is deliberately
fail-closed; automatic block-history transaction discovery is not implemented.

A complete run writes `MANIFEST.generation.json`, with all nine satellite roles, runtime hashes, deployment
blocks, source/build/compiler provenance and ABI generation. It is a candidate, not automatic publication
or client approval. `chain/generations.json` remains empty. No smoke mints, freeze, links or user operations
are performed. Repeated successful resume compares the existing candidate and does not deploy again. A later chain reorg
must be reconciled before the candidate is accepted by clients. Checkpoint tests cover failure at planned,
broadcast, pending and verified stages, along with changed release/identity and tampered output.


## Mainnet finality

On chain137 a separate `ODP_VERIFY_RPC_URL` is mandatory. Both RPCs must report chain137 and support
`finalized` before sending. Each deployment is checked independently through both RPCs: exact transaction,
receipt canonical block and runtime. Completion additionally requires the receipt block to be finalized
on both. Finality polling waits at most120 seconds; lag or disagreement leaves a recoverable interrupted
manifest, never a completed generation. `ODP_DEPLOY_CONFIRMATIONS=1` may be used with this mandatory
finality gate; it does not bypass it. Local EVM tests still use confirmation counting without public RPCs.

Historical read-only endpoint preflight evidence (not refreshed during documentation alignment): `review/v07-no-stop/polygon-rpc-readonly.json` at repository root.
The two selected public services are PublicNode and dRPC. A separate URL is not cryptographic proof of
independent infrastructure; these remain explicit external RPC trust assumptions.

## Final prelaunch checks

**No release bundle exists for the current sources.** The scripts above require
`abiGeneration === '0.7-redesign-7'`; the only bundle in the repository, `review/v07-no-stop/release.json`
with canonical hash `sha256:95cb88357a90ce962b1b8b710e9c57eb380fd28e74a34123c1b51365dd56322c`, is
`0.7-redesign-6` and is rejected. Its core ABI still carries `REVOCATION_WINDOW` and lacks
`finalizePassportForPrint` and `getPassportReleaseState`. Everything in this section is therefore an
unexecutable procedure until a bundle is rebuilt from the current sources with `release.mjs` and a new
`approvedHash` is independently reviewed and approved.

An **unapproved candidate** was built offline on 2026-09-21: [`review/v07-abi7-release/`](../../review/v07-abi7-release/README.md),
canonical hash `sha256:91c9ee4a9eb27f6b8ada9bf2bbcd394fafbe5d9dbfae539efa4e53ce0d5b76f7`. It is not an
`approvedHash` until the owner reviews and approves it.

Sealed `0.7-redesign-6` evidence: [audit handoff](../../review/audit-handoff-abi6/README.md); earlier rehearsal: `review/v07-prelaunch/README.md` at repository root. Code and documentation delta after that package, with the open conflicts: [report](../../ODP_07_ABI6_DOCUMENTATION_DELTA.md) (Russian).

Polygon now requires `ODP_DEPLOYER_ADDRESS` to match the signer and `ODP_SPEND_POLICY` to identify a JSON
file containing exactly ten `gasLimits`, `maxFeePerGas`, `maxPriorityFeePerGas`, and `maxTotalFeeWei`.
Amounts use decimal integer strings in gas/wei units. `mainnet-spend-policy.example.json` contains local
measurements plus a rounded 25% gas margin; its fee placeholders intentionally fail validation.
Set fee caps from fresh RPC observations and an acceptable total POL budget (1 POL = 10^18 wei).
The sum of gas limits times maxFeePerGas must fit the total budget. No synthetic test fee is a production approval.

After exporting the non-secret settings from the filled env example, from `chain/` run:

```sh
node deploy/scripts/preflight-mainnet.mjs > deploy-preflight.local.json
```

This command needs only the public address. It reads both RPCs, checks chain/finality/nonce/balance,
compares their common finalized block, reads base fee and priority fee directly from each RPC, and reports
all predicted addresses. It never loads signing keys. It estimates no satellites before the registry exists:
their constructors require deployed registry code. On Polygon, every creation is estimated immediately before sending.
Rerun immediately before `npm run deploy:mainnet` with `ODP_ENABLE_DEPLOY=1` and the authorized signer configured.
Use an account exclusively reserved for this deployment; no other program/device should send its transactions.

The manifest fixes the initial nonce and fee policy. Pending/latest nonce disagreement or outside nonce
consumption stops new creations. Every transaction explicitly sets chainId and EIP1559 fee/gas caps. Balance
and remaining worst-case cost are checked before each creation. Resume must preserve the same limits and
nonce plan. Estimate failures before broadcast create no unresolved planned entry. A write-ahead plan created
immediately before broadcast remains deliberately ambiguous after a crash until reconciled by transaction hash.

After the last creation, all ten entries are reverified through both RPCs before completion. The resulting
candidate is local evidence; explorer verification and client generation approval follow actual receipts.
Source verification can use the exact standard-json input embedded in the release. Never substitute freshly
compiled bytes or an older registry address. No automatic GitHub publication or passport mint is included.
