/**
 * Asserts schema/vectors/edition-units.json against Solidity.
 *
 * The vectors exist so a second implementation can prove it agrees before printing labels.
 * That only works if the vectors themselves are proven — so every value the contract can
 * recompute is checked here, and the derived unit key is used to drive a real activation.
 */
import { expect } from "chai";
import { network } from "hardhat";
import fs from "node:fs";
import crypto from "node:crypto";

const { ethers } = await network.connect();
const V = JSON.parse(fs.readFileSync(new URL("../../../schema/vectors/edition-units.json", import.meta.url)));

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Reader side of SPEC §20.6: printed text back to the 13-byte seed. */
function decodePrintedCode(printed) {
  const norm = String(printed).toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
  const payload = norm.slice(0, 20);
  const check = norm.slice(20);
  const h = crypto.createHash("sha256").update(Buffer.from(payload, "ascii")).digest();
  let cbits = "";
  for (const b of h.subarray(0, 4)) cbits += b.toString(2).padStart(8, "0");
  let expected = "";
  for (let i = 0; i < 25; i += 5) expected += CROCKFORD[parseInt(cbits.slice(i, i + 5), 2)];
  if (check !== expected) throw new Error("checksum mismatch");
  let bits = "";
  for (const ch of payload) bits += CROCKFORD.indexOf(ch).toString(2).padStart(5, "0");
  const seed = Buffer.alloc(13);
  for (let i = 0; i < 13; i++) seed[i] = parseInt(bits.slice(i * 8, i * 8 + 8).padEnd(8, "0"), 2);
  return seed;
}

function walletFromPrintedCode(printed) {
  const ctx = Buffer.from(V.inputs.editionContextHex.slice(2), "hex");
  const h = crypto
    .createHash("sha256")
    .update(Buffer.concat([Buffer.from("ODP-UNIT-KEY-v1", "utf8"), decodePrintedCode(printed), ctx]))
    .digest();
  return new ethers.Wallet("0x" + h.toString("hex"));
}

describe("SPEC 0.7 §20 known-answer vectors", function () {
  async function deployUnits() {
    const Lib = await ethers.getContractFactory("ODPPassportLib");
    const lib = await Lib.deploy();
    await lib.waitForDeployment();
    const Reg = await ethers.getContractFactory("ObjectDigitalPassport", {
      libraries: { "project/contracts/ODPPassportLib.sol:ODPPassportLib": await lib.getAddress() },
    });
    const reg = await Reg.deploy();
    await reg.waitForDeployment();
    const Units = await ethers.getContractFactory("ODPEditionUnits");
    const units = await Units.deploy(reg.target);
    await units.waitForDeployment();
    await (await reg.setEditionUnits(units.target)).wait();
    return { reg, units };
  }

  it("the printed code round-trips to the vector's unit address", function () {
    for (const u of V.units) {
      expect(walletFromPrintedCode(u.printedCode).address).to.equal(u.unitAddress);
    }
  });

  it("a corrupted code is caught by the check characters", function () {
    const good = V.units[0].printedCode;
    const bad = good.slice(0, -1) + (good.slice(-1) === "2" ? "3" : "2");
    expect(() => decodePrintedCode(bad)).to.throw(/checksum/);
  });

  it("Solidity computes the same leaves", async function () {
    const { units } = await deployUnits();
    for (const u of V.units) {
      expect(await units.unitLeaf(u.unitIndex, u.unitAddress)).to.equal(u.leaf);
    }
  });

  it("the vector proofs verify against the vector root, in Solidity", async function () {
    const { reg, units } = await deployUnits();
    const [brand] = await ethers.getSigners();
    await (await reg.connect(brand).registerCreator("0x42")).wait(); // B

    const block = await ethers.provider.getBlock("latest");
    const d = new Date(block.timestamp * 1000);
    const inputs = {
      core: {
        year: d.getUTCFullYear(), month: d.getUTCMonth() + 1,
        title: "Vector edition", authorName: "Vectors", shortDescription: "known answers", domain: "",
        contentClass: 1, lifecycleStatus: 3, aiStatus: 1, verificationMethod: 1, editionModel: 2,
      },
      dataHash: ethers.keccak256(ethers.toUtf8Bytes("d")),
      dataUrl: "", imageHash: ethers.keccak256(ethers.toUtf8Bytes("i")), imageUrl: "",
      fileHash: ethers.ZeroHash, anchorsHash: ethers.keccak256(ethers.toUtf8Bytes("a")),
      anchorTypesMask: 1 | 2 | 4 | 8 | 4096, initialOwner: ethers.ZeroAddress,
    };
    await (await reg.connect(brand).mintPhysical(inputs, false, "")).wait();
    const [ids] = await reg.getPassportsByCreatorPaged(brand.address, 0, 10);
    const editionId = ids[ids.length - 1];

    await (await units.connect(brand).openEdition(editionId, V.merkleRoot, V.inputs.unitCount, V.label.signerAddress)).wait();

    // every unit activates with the key recovered from its printed code alone
    for (const u of V.units) {
      const w = walletFromPrintedCode(u.printedCode);
      const payload = await units.activationPayloadHash(editionId, u.unitIndex);
      const sig = await w.signMessage(ethers.getBytes(payload));
      await (await units.activate(editionId, u.unitIndex, V.proofs[String(u.unitIndex)], sig)).wait();
      const [, who] = await units.getActivation(editionId, u.unitIndex);
      expect(who).to.equal(u.unitAddress);
    }
  });

  it("the vector root matches the tree rebuilt from the leaves", function () {
    const sha = (a, b) =>
      "0x" + crypto.createHash("sha256")
        .update(Buffer.concat([Buffer.from(a.slice(2), "hex"), Buffer.from(b.slice(2), "hex")]))
        .digest("hex");
    let level = V.units.map((u) => u.leaf);
    while (level.length > 1) {
      const next = [];
      for (let i = 0; i < level.length; i += 2) next.push(sha(level[i], i + 1 < level.length ? level[i + 1] : level[i]));
      level = next;
    }
    expect(level[0]).to.equal(V.merkleRoot);
  });
});
