/**
 * Call `freeze()` on an already-deployed ObjectDigitalPassport registry (same deployer key as original).
 *
 * Usage:
 *   ODP_FREEZE_CONTRACT=0x… npx hardhat run scripts/freeze-registry.js --network polygon
 *
 * After freeze, the contract rejects new writes; reads stay available. Deploy the next-line stack to a new address.
 * (Present again from v0.6; the v0.5 line omitted `freeze()` for the EIP-170 bytecode budget.)
 *
 * Note: Hardhat’s JSON-RPC provider keeps sockets open; we call `process.exit(0)` so the shell returns to the prompt.
 */
import hre from "hardhat";

/** Avoid “hangs forever” when the RPC never answers (wrong URL, firewall, rate limit). */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise(function (_, reject) {
      setTimeout(function () {
        reject(
          new Error(
            `${label} timed out after ${ms / 1000}s. Check network, or set ODP_POLYGON_RPC_URL to another Polygon HTTPS endpoint in chain/deploy/.env.`
          )
        );
      }, ms);
    }),
  ]);
}

async function main() {
  const { ethers } = await hre.network.connect({
    network: hre.globalOptions.network,
  });
  const target = (process.env.ODP_FREEZE_CONTRACT || "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(target)) {
    console.error("Set ODP_FREEZE_CONTRACT=0x… (40 hex chars) to the registry to freeze.");
    process.exit(1);
  }

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) {
    console.error("No deployer account (PRIVATE_KEY in chain/deploy/user-setup/private.local.env).");
    process.exit(1);
  }

  const net = await ethers.provider.getNetwork();
  console.log(`Network chainId: ${net.chainId}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Registry: ${target}`);

  const abi = [
    "function deployer() view returns (address)",
    "function frozen() view returns (bool)",
    "function freeze() external",
  ];
  const c = new ethers.Contract(target, abi, deployer);

  const RPC_CALL_MS = Number(process.env.ODP_RPC_CALL_TIMEOUT_MS || 120000);
  const TX_WAIT_MS = Number(process.env.ODP_TX_WAIT_TIMEOUT_MS || 600000);

  console.log("Checking RPC (eth_blockNumber)…");
  const bn = await withTimeout(ethers.provider.getBlockNumber(), RPC_CALL_MS, "eth_blockNumber");
  console.log(`  latest block: ${bn}`);

  console.log("Reading contract.deployer()…");
  const d = await withTimeout(c.deployer(), RPC_CALL_MS, "deployer()");
  const dStr = typeof d === "string" ? d : String(d);
  console.log(`  contract.deployer = ${dStr}`);
  if (dStr.toLowerCase() !== deployer.address.toLowerCase()) {
    console.error(`Deployer mismatch: contract.deployer=${dStr}, signer=${deployer.address}`);
    process.exit(1);
  }

  console.log("Reading contract.frozen()…");
  const already = await withTimeout(c.frozen(), RPC_CALL_MS, "frozen()");
  if (already) {
    console.log("Already frozen.");
    process.exit(0);
  }

  console.log("Sending freeze() transaction…");
  const tx = await withTimeout(c.freeze(), RPC_CALL_MS, "freeze() broadcast");
  console.log(`freeze tx: ${tx.hash}`);
  console.log("Waiting for confirmation (Polygon can take 1–2 minutes when congested)…");
  const rc = await withTimeout(tx.wait(), TX_WAIT_MS, "transaction confirmation");
  const fr = await withTimeout(c.frozen(), RPC_CALL_MS, "frozen() after tx");
  console.log(`Done in block ${rc.blockNumber}. frozen=${fr}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
