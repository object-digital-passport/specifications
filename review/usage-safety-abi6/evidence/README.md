# Evidence and reproduction

These are local usage-safety checks, not a new EVM/security audit run.

- `scope.json`: archive digest, manifest result and hashes of reviewed source files.
- `source-index.txt`: function locations in the exact extracted SOURCE snapshot.
- `abi-functions.txt`: callable function names extracted from that snapshot's ABIs.
- `reference-tools.log`: current run of all 17 reference tool tests, 17 passed.
- `usage-experiments.mjs` / `.log`: three additional offline checks using synthetic secrets and synthetic chain views.
- `dependencies.json`: versions of the pre-existing dependencies used in the disposable copy. Node v22.23.2. No clean installation was claimed.

To reproduce, validate and extract the supplied ZIP to a fresh location, then copy its SOURCE to a separate disposable directory. Supply locally available ethers 6.17.0 and ajv 8.20.0 dependencies; do not fetch dependencies or load wallet environment files. From the disposable SOURCE/chain directory:

```sh
node --test tools/test/*.test.mjs
```

Copy `usage-experiments.mjs` into that disposable SOURCE/chain directory, then run:

```sh
node usage-experiments.mjs
```

The experiments import only offline tools and ethers cryptographic helpers. They create no provider, submit no transaction and connect to no network. E1 verifies a signature from a copied code; it does not simulate mining/front-running. E2 checks the reference address-list validator, not the UI. E3 deliberately supplies synthetic chain views, demonstrating the API's limited claim, not an exploit of an authenticated reader.

Package contract tests were read but not rerun. No current app binary, ZIP envelope importer, physical label or real-user usability results were supplied. Their acceptance tests in the report remain gates, not passes.
