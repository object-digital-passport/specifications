/**
 * Deploy only ODPAuthorAttestation (satellite) against an existing ObjectDigitalPassport registry.
 * Use to add EIP-712 author attestation to a registry that is already live — the main registry
 * bytecode is untouched, so the canonical registry address does not change.
 *
 * Usage:
 *   ODP_REGISTRY_ADDRESS=0x... npx hardhat run scripts/deploy-author-attestation-only.js --network polygon
 *   npx hardhat run scripts/deploy-author-attestation-only.js --network amoy -- --registry 0x...
 *
 * After deploy: set NET.authorAttestation in frontend/verify.html to the printed address.
 *
 * Author: Andrei Chernikov
 */

import hre from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseRegistryArg() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--registry");
  if (i >= 0 && argv[i + 1]) return argv[i + 1].trim();
  return (process.env.ODP_REGISTRY_ADDRESS || "").trim();
}

async function main() {
  const { ethers } = await hre.network.connect({
    network: hre.globalOptions.network,
  });
  const registry = parseRegistryArg();
  if (!registry || !/^0x[a-fA-F0-9]{40}$/.test(registry)) {
    console.error(
      "  Error: set ODP_REGISTRY_ADDRESS or pass --registry 0x… (existing ObjectDigitalPassport address)."
    );
    process.exit(1);
  }

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) {
    console.error(
      "  Error: no deployer account. Set PRIVATE_KEY in chain/deploy/user-setup/private.local.env (64 hex chars, no 0x prefix). See chain/deploy/user-setup/README.md."
    );
    process.exit(1);
  }
  const network = await ethers.provider.getNetwork();

  console.log("\n  ODP — Deploy ODPAuthorAttestation only");
  console.log("  ──────────────────────────────────────");
  console.log(`  Network:   ${network.name} (chain ID ${network.chainId})`);
  console.log(`  Deployer:  ${deployer.address}`);
  console.log(`  Registry:  ${registry}`);
  console.log();

  const code = await ethers.provider.getCode(registry);
  if (!code || code === "0x") {
    console.error("  Error: no contract bytecode at registry address.");
    process.exit(1);
  }

  console.log("  Deploying ODPAuthorAttestation...");
  const AuthorFactory = await ethers.getContractFactory("ODPAuthorAttestation");
  const attestation = await AuthorFactory.deploy(registry);
  await attestation.waitForDeployment();
  const attestationAddress = await attestation.getAddress();
  console.log(`  ✅ ODPAuthorAttestation: ${attestationAddress}`);

  // The EIP-712 domain binds to this satellite address — signatures are not replayable
  // against a different anchor contract, so surface it for client wiring.
  const domain = await attestation.domainSeparator();
  console.log(`  EIP-712 domainSeparator: ${domain}`);
  console.log();
  console.log("  Next steps:");
  console.log(`    1. Set NET.authorAttestation: "${attestationAddress}" in frontend/verify.html.`);
  console.log("    2. Signing clients use domain { name: \"Object Digital Passport\", version: \"1\",");
  console.log(`       chainId: ${network.chainId}, verifyingContract: "${attestationAddress}" }.`);
  console.log("    3. Redeploy static site or bump cache so clients load the new config.");
  console.log();

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  const networkName = network.chainId === 80002n ? "amoy" : "polygon";
  const deploymentPath = path.join(deploymentsDir, `${networkName}.json`);

  let prev = {};
  if (fs.existsSync(deploymentPath)) {
    try {
      prev = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    } catch {
      prev = {};
    }
  }

  const merged = {
    ...prev,
    network: networkName,
    chainId: Number(network.chainId),
    contractAddress: prev.contractAddress || registry,
    authorAttestationAddress: attestationAddress,
    authorAttestationDeployedAt: new Date().toISOString(),
    authorAttestationDeployedBy: deployer.address,
  };

  fs.writeFileSync(deploymentPath, JSON.stringify(merged, null, 2));
  console.log(`  ✅ Updated: deployments/${networkName}.json (authorAttestationAddress)`);
  console.log();

  const explorer =
    network.chainId === 80002n
      ? `https://amoy.polygonscan.com/address/${attestationAddress}`
      : `https://polygonscan.com/address/${attestationAddress}`;
  console.log(`  Explorer: ${explorer}`);
  console.log();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
