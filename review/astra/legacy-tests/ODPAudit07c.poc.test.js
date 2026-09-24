/**
 * @file ODP 0.7 pre-release audit — proofs of concept, part 3:
 *       the relations satellite as a trust boundary, and the client-side failure modes.
 *
 * Run:  cd chain && npx hardhat test deploy/test/ODPAudit07c.poc.test.js
 */
import { expect } from "chai";
import { network } from "hardhat";
import crypto from "node:crypto";

const { ethers } = await network.connect();

const TYPE_C = "0x43";
const MINT_SELF = "";
const PHYS_MIN = 1 | 2 | 4 | 8;
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

describe("ODP 0.7 audit PoC (part 3)", function () {
  // ── K. The relations satellite is an unbounded trust boundary ──────────────
  it("K1: a relations satellite that simply lies lets an attacker mint under any profile", async function () {
    const reg = await deployRegistry();
    const [gov, artist, attacker] = await ethers.getSigners();

    await (await reg.connect(artist).registerCreator(TYPE_C)).wait();
    const artistCreatorId = await reg.getCreatorByWallet(artist.address);

    // One governance transaction. No code check, no interface check, no event.
    const evil = await (await ethers.getContractFactory("ODPAuditEvilRelations")).deploy(attacker.address);
    await evil.waitForDeployment();
    await (await reg.connect(gov).setRelationsSatellite(evil.target)).wait();

    // The attacker was never confirmed as anyone's agent. The registry asks the satellite
    // and believes the answer: ObjectDigitalPassport.sol:854-857.
    await (await reg.connect(attacker).mintPhysical(
      await physicalInputs(1, { core: { title: "Attributed to the artist" } }),
      false, artistCreatorId)).wait();

    const planted = await lastPassportOf(reg, artist.address);
    const header = await reg.getPassportHeader(planted);
    expect(header.creator).to.equal(artist.address);
    expect(header.creatorId).to.equal(artistCreatorId);
    expect(header.title).to.equal("Attributed to the artist");

    // It is at least visible: mintAgent records the attacker, so this is a loud forgery.
    expect((await reg.getPassportClassification(planted)).mintAgent).to.equal(attacker.address);

    // But it burns the artist's own monthly quota — the counter is on the principal.
    // ObjectDigitalPassport.sol:894.
  });

  it("K2: the same lying satellite re-points the URLs of a passport it has nothing to do with", async function () {
    const reg = await deployRegistry();
    const [gov, artist, buyer, attacker] = await ethers.getSigners();

    await (await reg.connect(artist).registerCreator(TYPE_C)).wait();
    await (await reg.connect(artist).mintPhysical(
      await physicalInputs(2, { dataUrl: "https://artist.example/p.odpass" }), false, MINT_SELF)).wait();
    const id = await lastPassportOf(reg, artist.address);
    await (await reg.connect(artist).transferPassport(id, buyer.address)).wait();

    const evil = await (await ethers.getContractFactory("ODPAuditEvilRelations")).deploy(attacker.address);
    await evil.waitForDeployment();
    await (await reg.connect(gov).setRelationsSatellite(evil.target)).wait();

    // dataHash is public on chain, so the EC(25) "confirm you know the content" check
    // is no obstacle at all — ObjectDigitalPassport.sol:637-639 says so itself.
    const dataHash = (await reg.getPassportMedia(id)).dataHash;
    await (await reg.connect(attacker).updatePassportUrls(id, "https://attacker.example/x", "", dataHash)).wait();
    expect((await reg.getPassportMedia(id)).dataUrl).to.equal("https://attacker.example/x");
    // Neither the artist nor the buyer authorized anything, and the event does not
    // record who did it (see J2).
  });

  // ── L. What a client must handle ───────────────────────────────────────────
  it("L1: the passport ID is not a function of the transaction — a re-broadcast yields a different ID", async function () {
    const reg = await deployRegistry();
    const [, w] = await ethers.getSigners();
    await (await reg.connect(w).registerCreator(TYPE_C)).wait();

    // Same signer, same inputs, two different blocks.
    const inputs = await physicalInputs(3);
    const id1 = await reg.connect(w).mintPhysical.staticCall(inputs, false, MINT_SELF);
    await ethers.provider.send("evm_mine", []);
    await ethers.provider.send("evm_mine", []);
    const id2 = await reg.connect(w).mintPhysical.staticCall(inputs, false, MINT_SELF);

    // _generatePassportId mixes block.timestamp and block.prevrandao
    // (ObjectDigitalPassport.sol:958-965), so the ID a client "expects" is unknowable
    // before inclusion and changes if the transaction is replaced or re-mined.
    expect(id1).to.not.equal(id2);
  });

  it("L2: re-sending the same mint creates a second passport — there is no idempotency key", async function () {
    const reg = await deployRegistry();
    const [, w] = await ethers.getSigners();
    await (await reg.connect(w).registerCreator(TYPE_C)).wait();

    const inputs = await physicalInputs(4);
    await (await reg.connect(w).mintPhysical(inputs, false, MINT_SELF)).wait();
    await (await reg.connect(w).mintPhysical(inputs, false, MINT_SELF)).wait();

    const [ids, total] = await reg.getPassportsByCreatorPaged(w.address, 0, 50);
    expect(total).to.equal(2n);
    const a = await reg.getPassportMedia(ids[0]);
    const b = await reg.getPassportMedia(ids[1]);
    expect(a.dataHash).to.equal(b.dataHash);
    expect(ids[0]).to.not.equal(ids[1]);
    // Preventing this is entirely the client journal's job.
  });

  it("L3: crossing the UTC month boundary invalidates the prepared document, not just the arguments", async function () {
    const reg = await deployRegistry();
    const [, w] = await ethers.getSigners();
    await (await reg.connect(w).registerCreator(TYPE_C)).wait();

    const { year, month } = await ym();
    const stale = await physicalInputs(5, { core: { year, month: month === 1 ? 12 : month - 1 } });
    await expect(reg.connect(w).mintPhysical(stale, false, MINT_SELF))
      .to.be.revertedWithCustomError(reg, "EC").withArgs(68n);

    // `year` and `month` are also top-level fields of passport.json (see
    // schema/vectors/physical.passport.json), so re-preparing changes the canonical
    // bytes and therefore dataHash — the whole bundle must be rebuilt and re-uploaded.
    const canon = (doc) => {
      const nfc = (o) => typeof o === "string" ? o.normalize("NFC")
        : Array.isArray(o) ? o.map(nfc)
        : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, nfc(v)])) : o;
      const sorted = (o) => Array.isArray(o) ? o.map(sorted)
        : o && typeof o === "object" ? Object.keys(o).sort().reduce((a, k) => (a[k] = sorted(o[k]), a), {}) : o;
      return JSON.stringify(sorted(nfc({ ...doc, passportId: null })));
    };
    const sha = (s) => "0x" + crypto.createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");
    const doc = { version: "0.7", passportId: "ODP-2026-09-000000001", title: "X", year: 2026, month: 9 };
    const rolled = { ...doc, month: 10 };
    expect(sha(canon(doc))).to.not.equal(sha(canon(rolled)));
  });

  it("L4: a folder-base dataUrl cannot be uploaded before the mint — the path contains the unknown ID", async function () {
    const reg = await deployRegistry();
    const [, w] = await ethers.getSigners();
    await (await reg.connect(w).registerCreator(TYPE_C)).wait();

    await (await reg.connect(w).mintPhysical(
      await physicalInputs(6, { dataUrl: "https://host.example/bundles/" }), true, MINT_SELF)).wait();
    const id = await lastPassportOf(reg, w.address);
    const stored = (await reg.getPassportMedia(id)).dataUrl;

    expect(stored).to.equal(`https://host.example/bundles/${id}.odpass`);
    // The ID is assigned by the contract, so the file name is unknown until the mint
    // lands. The bundle can only be uploaded AFTER the transaction is mined, which means
    // there is a window where the on-chain record points at a 404.
  });

  it("L5: nothing validates the URL scheme — a passport may carry javascript: in a field clients render", async function () {
    const reg = await deployRegistry();
    const [, w] = await ethers.getSigners();
    await (await reg.connect(w).registerCreator(TYPE_C)).wait();

    const nasty = "javascript:alert(document.domain)";
    await (await reg.connect(w).mintPhysical(
      await physicalInputs(7, { dataUrl: nasty, imageUrl: "data:text/html;base64,PHNjcmlwdD4x" }),
      false, MINT_SELF)).wait();
    const id = await lastPassportOf(reg, w.address);
    const media = await reg.getPassportMedia(id);

    expect(media.dataUrl).to.equal(nasty);
    expect(media.imageUrl.startsWith("data:")).to.equal(true);
    // Only length is checked (<=512 bytes). Scheme filtering is entirely the client's job.
  });

  it("L6: the same passport ID string can exist in two different registries", async function () {
    // Identity is (chainId, registry address, generation, passportId) — never the ID alone.
    const a = await deployRegistry();
    const b = await deployRegistry();
    expect(a.target).to.not.equal(b.target);
    expect(await a.CONTRACT_VERSION()).to.equal(await b.CONTRACT_VERSION());

    const [, w1, w2] = await ethers.getSigners();
    await (await a.connect(w1).registerCreator(TYPE_C)).wait();
    await (await b.connect(w2).registerCreator(TYPE_C)).wait();
    await (await a.connect(w1).mintPhysical(await physicalInputs(8), false, MINT_SELF)).wait();
    const idA = await lastPassportOf(a, w1.address);

    // Registry B has no record under that ID, and says so with the same EC(12) a client
    // would also see from a typo — so "not found" never means "does not exist anywhere".
    await expect(b.getPassportHeader(idA)).to.be.revertedWithCustomError(b, "EC").withArgs(12n);
    // Both registries report CONTRACT_VERSION 7, so the version byte alone cannot tell them apart.
  });
});
