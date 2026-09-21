/**
 * Deploy selected optional satellites against an existing ObjectDigitalPassport registry:
 *   1) ODPWalletDocumentAnchor — wallet-level file SHA-256 attestation
 *   2) ODPCounterfeitConcern — P/M institutional authenticity concern
 *
 * This helper intentionally does NOT deploy the v0.5 split-line proof / relations / extension satellites;
 * use the full deploy flow for those, because they require additional wiring.
 *
 * Usage:
 *   ODP_REGISTRY_ADDRESS=0x... npx hardhat run scripts/deploy-satellites-only.js --network polygon
 *   npx hardhat run scripts/deploy-satellites-only.js --network amoy -- --registry 0x...
 *
 * After deploy: set NET.docAnchor and NET.counterfeitConcern in web/ (see console output).
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

  console.log("\n  ODP — Deploy both satellites (anchor + counterfeit concern)");
  console.log("  ─────────────────────────────────────────");
  console.log(`  Network:   ${network.name} (chain ID ${network.chainId})`);
  console.log(`  Deployer:  ${deployer.address}`);
  console.log(`  Registry:  ${registry}`);
  console.log();

  const code = await ethers.provider.getCode(registry);
  if (!code || code === "0x") {
    console.error("  Error: no contract bytecode at registry address.");
    process.exit(1);
  }

  let walletDocumentAnchorAddress = null;
  try {
    console.log("  Deploying ODPWalletDocumentAnchor...");
    const AnchorFactory = await ethers.getContractFactory("ODPWalletDocumentAnchor");
    const anchor = await AnchorFactory.deploy(registry);
    await anchor.waitForDeployment();
    walletDocumentAnchorAddress = await anchor.getAddress();
    console.log(`  ✅ ODPWalletDocumentAnchor: ${walletDocumentAnchorAddress}`);
  } catch (e) {
    console.log(`  ⚠️  ODPWalletDocumentAnchor failed: ${e && e.message ? e.message : e}`);
  }

  let counterfeitConcernAddress = null;
  try {
    console.log("\n  Deploying ODPCounterfeitConcern...");
    const CfFactory = await ethers.getContractFactory("ODPCounterfeitConcern");
    const cf = await CfFactory.deploy(registry);
    await cf.waitForDeployment();
    counterfeitConcernAddress = await cf.getAddress();
    console.log(`  ✅ ODPCounterfeitConcern: ${counterfeitConcernAddress}`);
  } catch (e) {
    console.log(`  ⚠️  ODPCounterfeitConcern failed: ${e && e.message ? e.message : e}`);
  }

  console.log();
  console.log("  Next steps:");
  if (walletDocumentAnchorAddress) {
    console.log(`    NET.docAnchor: "${walletDocumentAnchorAddress}"  → frontend/verify.html`);
  }
  if (counterfeitConcernAddress) {
    console.log(`    NET.counterfeitConcern: "${counterfeitConcernAddress}"  → frontend/passport.html, frontend/verify.html`);
  }
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
    ...(walletDocumentAnchorAddress
      ? {
          walletDocumentAnchorAddress,
          walletDocumentAnchorDeployedAt: new Date().toISOString(),
          walletDocumentAnchorDeployedBy: deployer.address,
        }
      : {}),
    ...(counterfeitConcernAddress
      ? {
          counterfeitConcernAddress,
          counterfeitConcernDeployedAt: new Date().toISOString(),
          counterfeitConcernDeployedBy: deployer.address,
        }
      : {}),
  };

  fs.writeFileSync(deploymentPath, JSON.stringify(merged, null, 2));
  console.log(`  ✅ Updated: deployments/${networkName}.json`);
  console.log();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
