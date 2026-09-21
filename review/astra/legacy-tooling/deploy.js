/**
 * Object Digital Passport — Deploy Script
 * Author: Andrei Chernikov
 * Hardhat + ethers.js
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network amoy     ← testnet (free)
 *   npx hardhat run scripts/deploy.js --network polygon  ← mainnet
 *
 * After deploy:
 *   1. Copy contract address into frontend/creator.html, frontend/passport.html, frontend/verify.html
 *   2. Copy ABI from artifacts/ into chain/tools/abi.json
 *   3. Upload §15 `.odpass` ZIP bundles to your dataUrl (not bare passport.json)
 */

import hre from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const { ethers } = await hre.network.connect({
    network: hre.globalOptions.network,
  });
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) {
    console.error(
      "  Error: no deployer account. Set PRIVATE_KEY in chain/deploy/user-setup/private.local.env (64 hex chars, no 0x prefix). See chain/deploy/user-setup/README.md."
    );
    process.exit(1);
  }
  const network = await ethers.provider.getNetwork();

  console.log("\n  Object Digital Passport — Deploy");
  console.log("  ─────────────────────────────────────────");
  console.log(`  Network:  ${network.name} (chain ID ${network.chainId})`);
  console.log(`  Deployer: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`  Balance:  ${ethers.formatEther(balance)} POL`);
  console.log();

  // ── Deploy (library first — EIP-170 bytecode split) ─────────────────────────
  console.log("  Deploying ODPPassportLib...");
  const LibFactory = await ethers.getContractFactory("ODPPassportLib");
  const passportLib = await LibFactory.deploy();
  await passportLib.waitForDeployment();
  const passportLibAddress = await passportLib.getAddress();
  console.log(`  ✅ ODPPassportLib: ${passportLibAddress}`);

  console.log("  Deploying ObjectDigitalPassport (linked)...");
  const Factory = await ethers.getContractFactory("ObjectDigitalPassport", {
    libraries: {
      "project/contracts/ODPPassportLib.sol:ODPPassportLib": passportLibAddress,
    },
  });
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`  ✅ Deployed: ${address}`);

  let walletDocumentAnchorAddress = null;
  try {
    console.log("\n  Deploying ODPWalletDocumentAnchor (optional satellite for file SHA-256 anchors)...");
    const AnchorFactory = await ethers.getContractFactory("ODPWalletDocumentAnchor");
    const anchor = await AnchorFactory.deploy(address);
    await anchor.waitForDeployment();
    walletDocumentAnchorAddress = await anchor.getAddress();
    console.log(`  ✅ Wallet document anchor: ${walletDocumentAnchorAddress}`);
    console.log(`     Set NET.docAnchor in verify.html to this address for v0.3+ on-chain file attest.`);
  } catch (e) {
    console.log(`  ⚠️  ODPWalletDocumentAnchor deploy skipped: ${e && e.message ? e.message : e}`);
  }

  let counterfeitConcernAddress = null;
  try {
    console.log("\n  Deploying ODPCounterfeitConcern (satellite: P/M institutional authenticity concern)...");
    const CfFactory = await ethers.getContractFactory("ODPCounterfeitConcern");
    const cf = await CfFactory.deploy(address);
    await cf.waitForDeployment();
    counterfeitConcernAddress = await cf.getAddress();
    console.log(`  ✅ Counterfeit concern satellite: ${counterfeitConcernAddress}`);
    console.log(`     Set NET.counterfeitConcern in verify.html / passport.html to this address (paired with this registry).`);
  } catch (e) {
    console.log(`  ⚠️  ODPCounterfeitConcern deploy skipped: ${e && e.message ? e.message : e}`);
  }

  let relationsAddress = null;
  try {
    console.log("\n  Deploying ODPRegistryRelations (satellite: affiliations + delegations)...");
    const RelationsFactory = await ethers.getContractFactory("ODPRegistryRelations");
    const relations = await RelationsFactory.deploy(address);
    await relations.waitForDeployment();
    relationsAddress = await relations.getAddress();
    console.log(`  ✅ Relations satellite: ${relationsAddress}`);
    console.log("     Wiring main registry → setRelationsSatellite(...)");
    const tx = await contract.setRelationsSatellite(relationsAddress);
    await tx.wait();
  } catch (e) {
    console.log(`  ⚠️  ODPRegistryRelations deploy skipped: ${e && e.message ? e.message : e}`);
  }

  let proofRegistryAddress = null;
  try {
    console.log("\n  Deploying ODPPassportProofRegistry (satellite: institutional proofs)...");
    const ProofFactory = await ethers.getContractFactory("ODPPassportProofRegistry", {
      libraries: {
        "project/contracts/ODPPassportLib.sol:ODPPassportLib": passportLibAddress,
      },
    });
    const proofs = await ProofFactory.deploy(address);
    await proofs.waitForDeployment();
    proofRegistryAddress = await proofs.getAddress();
    console.log(`  ✅ Proof registry satellite: ${proofRegistryAddress}`);
  } catch (e) {
    console.log(`  ⚠️  ODPPassportProofRegistry deploy skipped: ${e && e.message ? e.message : e}`);
  }

  let extensionRouterAddress = null;
  try {
    console.log("\n  Deploying ODPExtensionMintRouter (satellite: extension mint routing)...");
    const RouterFactory = await ethers.getContractFactory("ODPExtensionMintRouter", {
      libraries: {
        "project/contracts/ODPPassportLib.sol:ODPPassportLib": passportLibAddress,
      },
    });
    const router = await RouterFactory.deploy(address);
    await router.waitForDeployment();
    extensionRouterAddress = await router.getAddress();
    console.log(`  ✅ Extension mint router: ${extensionRouterAddress}`);
    console.log("     Wiring main registry → setExtensionRouter(...)");
    const tx = await contract.setExtensionRouter(extensionRouterAddress);
    await tx.wait();
  } catch (e) {
    console.log(`  ⚠️  ODPExtensionMintRouter deploy skipped: ${e && e.message ? e.message : e}`);
  }

  let editionUnitsAddress = null;
  try {
    console.log("\n  Deploying ODPEditionUnits (satellite: SPEC 0.7 §20 edition unit keys + activation)...");
    const UnitsFactory = await ethers.getContractFactory("ODPEditionUnits");
    const units = await UnitsFactory.deploy(address);
    await units.waitForDeployment();
    editionUnitsAddress = await units.getAddress();
    console.log(`  ✅ Edition units satellite: ${editionUnitsAddress}`);
    console.log("     Wiring main registry → setEditionUnits(...)");
    const tx = await contract.setEditionUnits(editionUnitsAddress);
    await tx.wait();
  } catch (e) {
    console.log(`  ⚠️  ODPEditionUnits deploy skipped: ${e && e.message ? e.message : e}`);
  }

  const deployedVersion = await contract.CONTRACT_VERSION();
  const dv = BigInt(deployedVersion.toString());
  const specMajor = dv / 16n;
  const specMinor = dv % 16n;
  console.log(`  SPEC_MAJOR: ${specMajor}  SPEC_MINOR: ${specMinor}  CONTRACT_VERSION (packed): ${deployedVersion}`);

  // ── Smoke test (testnet only) ──────────────────────────────────────────────
  if (network.chainId === 80002n) {
    console.log("\n  Running smoke test on testnet...");

    console.log(`  Packed byte: ${deployedVersion} (v0.7 = 7: v0.6 model + edition unit keys, activation, initialOwner)`);

    // 1. Register as Creator type C (bytes1 "C" = 0x43)
    console.log("\n  1. Registering profile (type C)...");
    const regTx = await contract.registerCreator(
      ethers.hexlify(ethers.toUtf8Bytes("C")) // bytes1 "C"
    );
    await regTx.wait();
    const creatorId = await contract.getCreatorByWallet(deployer.address);
    console.log(`     ✅ Profile ID: ${creatorId}`);

    // 2. Mint a digital passport (v0.7 unified inputs; the file hash is the binding).
    //    For a digital object the anchor minimum is the exact file hash → mask bit 32.
    console.log("\n  2. Minting digital passport...");
    const nz = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
    const ANCHOR_FILE_HASH = 32; // ODPAnchorBits.file_hash
    const now = new Date();

    const mintTx = await contract.mintDigital(
      {
        core: {
          year: now.getUTCFullYear(),
          month: now.getUTCMonth() + 1,
          title: "Deployment smoke test",
          authorName: "ODP deploy",
          shortDescription: "Digital smoke-test object",
          domain: "software",
          contentClass: 6,
          lifecycleStatus: 2,
          aiStatus: 1,
          verificationMethod: 1,
          editionModel: 1,
        },
        dataHash: nz("smoke-passport-json"),
        dataUrl: "https://example.com/passport.odpass",
        imageHash: ethers.ZeroHash,
        imageUrl: "",
        fileHash: nz("smoke-original-file"),
        anchorsHash: nz("smoke-anchors"),
        anchorTypesMask: ANCHOR_FILE_HASH,
      },
      false,
      ""
    );
    const mintReceipt = await mintTx.wait();

    // Parse passportId from PassportMinted event
    let passportId = null;
    for (const log of mintReceipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed && parsed.name === "PassportMinted") {
          passportId = parsed.args.passportId;
          break;
        }
      } catch {}
    }
    console.log(`     ✅ Passport ID: ${passportId}`);

    // 3. Read back header + creator + proofs (v0.7 split views)
    console.log("\n  3. Resolving passport (multi-call)...");
    const header = await contract.getPassportHeader(passportId);
    await contract.getCreator(header.creatorId);
    const proofCount = proofRegistryAddress
      ? (await (await ethers.getContractAt("ODPPassportProofRegistry", proofRegistryAddress)).getProofsForPassport(passportId)).length
      : 0;
    console.log(`     ✅ contractVersion: ${await contract.CONTRACT_VERSION()}`);
    console.log(`     ✅ objectType:      ${header.objectType}`);
    console.log(`     ✅ creatorId:       ${header.creatorId}`);
    console.log(`     ✅ title (card):    ${header.title}`);
    console.log(`     ✅ proofCount:      ${proofCount}`);

    console.log("\n  ✅ Smoke test passed");
  }

  // ── Save deployment info ───────────────────────────────────────────────────
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  const networkName = network.chainId === 80002n ? "amoy" : "polygon";
  const deploymentPath = path.join(deploymentsDir, `${networkName}.json`);

  const deployment = {
    network:                  networkName,
    chainId:                  Number(network.chainId),
    passportLibAddress:       passportLibAddress,
    contractAddress:          address,
    walletDocumentAnchorAddress,
    counterfeitConcernAddress,
    relationsAddress,
    proofRegistryAddress,
    extensionRouterAddress,
    editionUnitsAddress,
    contractVersion:  Number(deployedVersion),
    deployedBy:       deployer.address,
    deployedAt:       new Date().toISOString(),
    txHash:           contract.deploymentTransaction()?.hash || null,
  };

  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log(`\n  ✅ Saved: deployments/${networkName}.json`);

  // ── Also save ABI for use in chain/tools/ and web/ ──────────────────────────────
  const artifactPath = path.join(
    __dirname, "..", "..", "artifacts", "contracts",
    "ObjectDigitalPassport.sol", "ObjectDigitalPassport.json"
  );

  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const abiPath  = path.join(deploymentsDir, "abi.json");
    fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));
    console.log(`  ✅ Saved: deployments/abi.json`);
    console.log(`\n  📋 Copy contract address to frontend/creator.html, frontend/passport.html, frontend/verify.html`);
    console.log(`     (in the website repository: object-digital-passport/object-digital-passport.github.io)`);
    console.log(`     Look for: contract: "",  // ← paste after deploy`);
  }

  console.log("\n  ─────────────────────────────────────────");
  console.log(`  Contract: ${address}`);
  const explorer = network.chainId === 80002n
    ? `https://amoy.polygonscan.com/address/${address}`
    : `https://polygonscan.com/address/${address}`;
  console.log(`  Explorer: ${explorer}`);
  console.log();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
