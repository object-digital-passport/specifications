import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const deployDir = path.join(__dirname, "deploy");
const userSetupEnvPath = path.join(deployDir, "user-setup", "private.local.env");
// Tests/compile never load a real wallet. Deployment requires an explicit opt-in.
if (process.env.ODP_ENABLE_DEPLOY === "1") {
  dotenv.config({ path: path.join(deployDir, ".env") });
  dotenv.config({ path: userSetupEnvPath, override: true });
}

const PRIVATE_KEY = process.env.ODP_ENABLE_DEPLOY === "1" ? (process.env.PRIVATE_KEY || "").trim() : "";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || "";
const POLYGON_RPC_URL =
  process.env.ODP_POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com";
const AMOY_RPC_URL =
  process.env.ODP_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  paths: {
    sources: "contracts",
    tests: {
      mocha: "deploy/test",
    },
  },
  solidity: {
    // solc-js avoids a Rosetta/native-binary dependency on Apple Silicon.
    preferWasm: true,
    version: "0.8.20",
    // Optional pre-verified local soljson, allowing fully offline builds.
    ...(process.env.ODP_SOLC_JS ? { path: path.resolve(process.env.ODP_SOLC_JS) } : {}),
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,
      },
      viaIR: true,
      evmVersion: "shanghai",
      metadata: {
        bytecodeHash: "none",
      },
    },
  },

  networks: {
    // Hardhat 3 default test network is `default`, not `hardhat`.
    default: {
      type: "edr-simulated",
      allowUnlimitedContractSize: false,
    },
    amoy: {
      type: "http",
      url: AMOY_RPC_URL,
      chainId: 80002,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    polygon: {
      type: "http",
      url: POLYGON_RPC_URL,
      chainId: 137,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },

  verify: {
    etherscan: {
      apiKey: POLYGONSCAN_API_KEY,
    },
  },

  chainDescriptors: {
    80002: {
      name: "polygon-amoy",
      blockExplorers: {
        etherscan: {
          name: "PolygonScan",
          url: "https://amoy.polygonscan.com",
          apiUrl: "https://api-amoy.polygonscan.com/api",
        },
      },
    },
    137: {
      name: "polygon-mainnet",
      blockExplorers: {
        etherscan: {
          name: "PolygonScan",
          url: "https://polygonscan.com",
          apiUrl: "https://api.polygonscan.com/api",
        },
      },
    },
  },
});
