/**
 * Resume deploy after ODPPassportLib succeeded but ObjectDigitalPassport failed (e.g. insufficient gas).
 * Skips a new library deploy; links ObjectDigitalPassport to the existing ODPPassportLib, then runs
 * the same optional satellites + Amoy smoke + deployments/*.json + abi.json as deploy.js.
 *
 * Usage:
 *   ODP_PASSPORT_LIB_ADDRESS=0x... npx hardhat run scripts/deploy-resume-from-lib.js --network polygon
 *   npx hardhat run scripts/deploy-resume-from-lib.js --network polygon -- --passport-lib 0x...
 *
 * Author: Andrei Chernikov
 */

import hre from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parsePassportLibArg() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--passport-lib");
  if (i >= 0 && argv[i + 1]) return argv[i + 1].trim();
  return (process.env.ODP_PASSPORT_LIB_ADDRESS || "").trim();
}

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

  const passportLibAddress = parsePassportLibArg();
  if (!passportLibAddress || !/^0x[a-fA-F0-9]{40}$/.test(passportLibAddress)) {
    console.error(
      "  Error: set ODP_PASSPORT_LIB_ADDRESS or pass --passport-lib 0x… (already deployed ODPPassportLib from the previous run)."
    );
    process.exit(1);
  }

  const libCode = await ethers.provider.getCode(passportLibAddress);
  if (!libCode || libCode === "0x") {
    console.error("  Error: no contract bytecode at ODPPassportLib address.");
    process.exit(1);
  }

  console.log("\n  Object Digital Passport — Resume from existing ODPPassportLib");
  console.log("  ─────────────────────────────────────────");
  console.log(`  Network:        ${network.name} (chain ID ${network.chainId})`);
  console.log(`  Deployer:       ${deployer.address}`);
  console.log(`  ODPPassportLib: ${passportLibAddress} (reuse, no redeploy)`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`  Balance:        ${ethers.formatEther(balance)} POL`);
  console.log();

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

  const deployedVersion = await contract.CONTRACT_VERSION();
  const dv = BigInt(deployedVersion.toString());
  const specMajor = dv / 16n;
  const specMinor = dv % 16n;
  console.log(`  SPEC_MAJOR: ${specMajor}  SPEC_MINOR: ${specMinor}  CONTRACT_VERSION (packed): ${deployedVersion}`);

  if (network.chainId === 80002n) {
    console.log("\n  Running smoke test on testnet...");

    console.log(`  Packed byte: ${deployedVersion} (v0.3 = 3: ownership, revocation, extra image hashes, P-affiliation detach)`);

    console.log("\n  1. Registering profile (type C)...");
    const regTx = await contract.registerCreator(
      ethers.hexlify(ethers.toUtf8Bytes("C"))
    );
    await regTx.wait();
    const creatorId = await contract.getCreatorByWallet(deployer.address);
    console.log(`     ✅ Profile ID: ${creatorId}`);

    console.log("\n  2. Minting digital passport...");
    const nz = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
    const ANCHOR_FILE_HASH = 32; // ODPAnchorBits.file_hash — digital object minimum
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

    console.log("\n  3. Resolving passport (multi-call)...");
    const header = await contract.getPassportHeader(passportId);
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
    contractVersion:  Number(deployedVersion),
    deployedBy:       deployer.address,
    deployedAt:       new Date().toISOString(),
    txHash:           contract.deploymentTransaction()?.hash || null,
  };

  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log(`\n  ✅ Saved: deployments/${networkName}.json`);

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
