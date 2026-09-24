#!/usr/bin/env bash
# Verify every deployed ODP v0.6 contract on Polygonscan.
#
# Run from `chain/` (Hardhat's root — that's where hardhat.config.ts and node_modules live):
#
#   bash deploy/scripts/verify-all-polygon.sh
#
# Requires POLYGONSCAN_API_KEY in chain/deploy/user-setup/private.local.env.
# Verification is a read-only publish of source code — it does not send transactions
# and does not need PRIVATE_KEY.
#
# Already-verified contracts are reported as such and skipped rather than failing the run,
# so this is safe to re-run (e.g. after deploying ODPAuthorAttestation later).
#
# Author: Andrei Chernikov

set -uo pipefail

REGISTRY="0x012aC6393464A73EC16131D701ff2e000695b91b"
PASSPORT_LIB="0xB7D7B8485eeb385c375ABd91035F5a6914171ccE"
DOC_ANCHOR="0x35df3773919D9F10e5F8838abaa453DE120e6Cb4"
COUNTERFEIT="0x692935d6c1532b47cE0459bF1E9549991d0eD2C9"
RELATIONS="0x2ea6f05a050973afa14E61b1Ea19De92621e3661"
PROOFS="0x990FCc2E587d9f2cDb9c73083E9f90793CeF7F49"
EXT_ROUTER="0x3fa8f213399a2A9f7Da4bF7D8a9D7D42E8AEF822"

# Override only to point at a different (e.g. self-hosted) author-attestation deployment.
AUTHOR_ATTESTATION="${ODP_AUTHOR_ATTESTATION_ADDRESS:-0x1972E68D0A5B19C5ee2af54F8b792c426985F7d7}"

if [ ! -f hardhat.config.ts ]; then
  echo "  Error: run this from the chain/ directory (hardhat.config.ts not found here)."
  exit 1
fi

failed=0

verify() {
  local label="$1"
  local address="$2"
  shift 2
  echo ""
  echo "──────────────────────────────────────────────"
  echo "  $label"
  echo "  $address"
  echo "──────────────────────────────────────────────"
  if npx hardhat verify --network polygon "$address" "$@"; then
    echo "  ok: $label"
  else
    # hardhat-verify exits non-zero when a contract is already verified; that is not a failure
    # worth aborting the batch for, so record it and keep going.
    echo "  NOTE: $label did not verify cleanly (already verified, or a real error — read above)."
    failed=$((failed + 1))
  fi
}

echo "  Verifying ODP v0.6 contracts on Polygon mainnet (chain 137)."

# The linked library itself: no constructor arguments.
verify "ODPPassportLib (linked library)" "$PASSPORT_LIB"

# Main registry: constructor takes no arguments, but IS linked against ODPPassportLib,
# so Etherscan needs the library address supplied explicitly.
verify "ObjectDigitalPassport (main registry)" "$REGISTRY" \
  --libraries-path deploy/verify/libraries.polygon.js

# Satellites: each constructor takes the main registry address.
verify "ODPWalletDocumentAnchor (satellite)" "$DOC_ANCHOR" "$REGISTRY"
verify "ODPCounterfeitConcern (satellite)" "$COUNTERFEIT" "$REGISTRY"
verify "ODPRegistryRelations (satellite)" "$RELATIONS" "$REGISTRY"
verify "ODPPassportProofRegistry (satellite)" "$PROOFS" "$REGISTRY"
verify "ODPExtensionMintRouter (satellite)" "$EXT_ROUTER" "$REGISTRY"

if [ -n "$AUTHOR_ATTESTATION" ]; then
  verify "ODPAuthorAttestation (satellite)" "$AUTHOR_ATTESTATION" "$REGISTRY"
else
  echo ""
  echo "  Skipping ODPAuthorAttestation — not deployed yet."
  echo "  After deploying it, re-run with:"
  echo "    ODP_AUTHOR_ATTESTATION_ADDRESS=0x... bash deploy/scripts/verify-all-polygon.sh"
fi

echo ""
echo "──────────────────────────────────────────────"
if [ "$failed" -eq 0 ]; then
  echo "  All contracts verified."
else
  echo "  $failed contract(s) reported a problem — check the output above."
  echo "  \"Already Verified\" is fine and needs no action."
fi
echo "  Explorer: https://polygonscan.com/address/$REGISTRY#code"
