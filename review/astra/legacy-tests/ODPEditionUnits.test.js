import { expect } from "chai";
import { network } from "hardhat";
import crypto from "node:crypto";

const { ethers } = await network.connect();

const TYPE_C = "0x43";
const TYPE_B = "0x42";
const MINT_SELF = "";
const EVENT_EDITION_NOTICE = 8;

const PHYS_MIN = 1 | 2 | 4 | 8; // photo + dimensions + materials + distinguishing features
const ANCHOR_UNIT_KEY_SET = 4096;

function seededHash(prefix, n) {
  return ethers.keccak256(ethers.toUtf8Bytes(`${prefix}:${n}`));
}

async function mintYm() {
  const block = await ethers.provider.getBlock("latest");
  const d = new Date(block.timestamp * 1000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

async function physicalInputs(n, overrides = {}) {
  const { year, month } = await mintYm();
  return {
    core: {
      year,
      month,
      title: `Edition ${n}`,
      authorName: "Studio",
      shortDescription: "A production run",
      domain: "",
      contentClass: 1,
      lifecycleStatus: 3,
      aiStatus: 1,
      verificationMethod: 1,
      editionModel: 2,
    },
    dataHash: seededHash("data", n),
    dataUrl: "",
    imageHash: seededHash("image", n),
    imageUrl: "",
    fileHash: ethers.ZeroHash,
    anchorsHash: seededHash("anchors", n),
    anchorTypesMask: PHYS_MIN | ANCHOR_UNIT_KEY_SET,
    initialOwner: ethers.ZeroAddress,
    ...overrides,
  };
}

// ─── Merkle tree, mirroring SPEC §20.3 and ODPEditionUnits._proves ──────────

function sha256(...parts) {
  const h = crypto.createHash("sha256");
  for (const p of parts) h.update(Buffer.from(ethers.getBytes(p)));
  return "0x" + h.digest("hex");
}

function unitLeaf(index, address) {
  const idx = ethers.zeroPadValue(ethers.toBeHex(index), 4);
  return sha256(idx, address);
}

/** Positional binary tree; the last node is duplicated on an odd level. */
function buildTree(leaves) {
  const levels = [leaves];
  let level = leaves;
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(sha256(left, right));
    }
    levels.push(next);
    level = next;
  }
  return { root: level[0], levels };
}

function proofFor(levels, index) {
  const proof = [];
  let idx = index;
  for (let d = 0; d < levels.length - 1; d++) {
    const level = levels[d];
    const sibling = (idx & 1) === 0 ? Math.min(idx + 1, level.length - 1) : idx - 1;
    proof.push(level[sibling]);
    idx >>= 1;
  }
  return proof;
}

function makeEdition(wallets) {
  const leaves = wallets.map((w, i) => unitLeaf(i, w.address));
  const { root, levels } = buildTree(leaves);
  return { root, levels, unitCount: wallets.length };
}

describe("ODPEditionUnits — SPEC 0.7 §20", function () {
  async function deployAll() {
    const LibFactory = await ethers.getContractFactory("ODPPassportLib");
    const lib = await LibFactory.deploy();
    await lib.waitForDeployment();

    const Registry = await ethers.getContractFactory("ObjectDigitalPassport", {
      libraries: {
        "project/contracts/ODPPassportLib.sol:ODPPassportLib": await lib.getAddress(),
      },
    });
    const reg = await Registry.deploy();
    await reg.waitForDeployment();

    const Units = await ethers.getContractFactory("ODPEditionUnits");
    const units = await Units.deploy(reg.target);
    await units.waitForDeployment();

    await (await reg.setEditionUnits(units.target)).wait();
    return { reg, units };
  }

  async function mintEdition(reg, signer, n) {
    await (await reg.connect(signer).mintPhysical(await physicalInputs(n), false, MINT_SELF)).wait();
    const [ids] = await reg.getPassportsByCreatorPaged(signer.address, 0, 50);
    return ids[ids.length - 1];
  }

  /** A wallet whose key is the "printed" unit secret; it never needs funds. */
  function unitWallets(count) {
    return Array.from({ length: count }, (_, i) =>
      new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes(`unit-key-${i}`))),
    );
  }

  async function sign(units, wallet, editionId, index) {
    const payload = await units.activationPayloadHash(editionId, index);
    return wallet.signMessage(ethers.getBytes(payload));
  }

  async function openedEdition(count = 5) {
    const { reg, units } = await deployAll();
    const [brand, stranger, sponsor] = await ethers.getSigners();
    const labelSigner = new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes("label-signer")));
    await (await reg.connect(brand).registerCreator(TYPE_B)).wait();
    const editionId = await mintEdition(reg, brand, 1);
    const wallets = unitWallets(count);
    const ed = makeEdition(wallets);
    await (await units.connect(brand).openEdition(editionId, ed.root, ed.unitCount, labelSigner.address)).wait();
    return { reg, units, brand, stranger, sponsor, editionId, wallets, ed, labelSigner };
  }

  describe("opening an edition (§20.1, §20.3)", function () {
    it("a B profile opens its own edition and the root is readable", async function () {
      const { units, editionId, ed } = await openedEdition(4);
      const view = await units.getEdition(editionId);
      expect(view[0]).to.equal(ed.root);
      expect(view[1]).to.equal(4n);
      expect(view[2]).to.equal(true);
      expect(view[3]).to.equal(false);
    });

    it("rejects a C profile — B only (EC 121)", async function () {
      const { reg, units } = await deployAll();
      const [creator] = await ethers.getSigners();
      await (await reg.connect(creator).registerCreator(TYPE_C)).wait();
      const id = await mintEdition(reg, creator, 2);
      const ed = makeEdition(unitWallets(2));
      await expect(units.connect(creator).openEdition(id, ed.root, 2, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(units, "EC")
        .withArgs(121n);
    });

    it("rejects anyone but the edition's own creator (EC 120)", async function () {
      const { units, stranger, editionId, ed } = await openedEdition(2);
      await expect(units.connect(stranger).openEdition(editionId, ed.root, 2, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(units, "EC")
        .withArgs(119n); // already open — checked before authorship
      const { reg: reg2, units: units2 } = await deployAll();
      const [brand, other] = await ethers.getSigners();
      await (await reg2.connect(brand).registerCreator(TYPE_B)).wait();
      const id2 = await mintEdition(reg2, brand, 3);
      await expect(units2.connect(other).openEdition(id2, ed.root, 2, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(units2, "EC")
        .withArgs(120n);
    });

    it("is write-once — a second run needs its own edition passport (EC 119)", async function () {
      const { units, brand, editionId, ed } = await openedEdition(2);
      await expect(units.connect(brand).openEdition(editionId, ed.root, 2, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(units, "EC")
        .withArgs(119n);
    });
  });

  describe("signed outer labels (§20.7)", function () {
    it("publishes the label signer with the edition", async function () {
      const { units, editionId, labelSigner } = await openedEdition(3);
      const view = await units.getEdition(editionId);
      expect(view[4]).to.equal(labelSigner.address);
    });

    it("a label signature verifies offline against the published key", async function () {
      const { units, editionId, labelSigner } = await openedEdition(3);
      const payload = await units.labelPayloadHash(editionId, 2);
      const sig = await labelSigner.signMessage(ethers.getBytes(payload));
      // exactly what a shop-floor reader does: recover, compare with the on-chain key
      const recovered = ethers.verifyMessage(ethers.getBytes(payload), sig);
      expect(recovered).to.equal((await units.getEdition(editionId))[4]);
    });

    it("a fabricated label fails — a forger has no signer key", async function () {
      const { units, editionId, labelSigner } = await openedEdition(3);
      const forger = new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes("counterfeit-printer")));
      const payload = await units.labelPayloadHash(editionId, 2);
      const sig = await forger.signMessage(ethers.getBytes(payload));
      expect(ethers.verifyMessage(ethers.getBytes(payload), sig)).to.not.equal(labelSigner.address);
    });

    it("a label cannot be moved to another unit — the index is signed", async function () {
      const { units, editionId, labelSigner } = await openedEdition(4);
      const sig = await labelSigner.signMessage(ethers.getBytes(await units.labelPayloadHash(editionId, 1)));
      const otherPayload = await units.labelPayloadHash(editionId, 2);
      expect(ethers.verifyMessage(ethers.getBytes(otherPayload), sig)).to.not.equal(labelSigner.address);
    });

    it("an edition may print plain labels — signer is optional", async function () {
      const { reg, units } = await deployAll();
      const [brand] = await ethers.getSigners();
      await (await reg.connect(brand).registerCreator(TYPE_B)).wait();
      const id = await mintEdition(reg, brand, 90);
      const ed = makeEdition(unitWallets(2));
      await (await units.connect(brand).openEdition(id, ed.root, 2, ethers.ZeroAddress)).wait();
      expect((await units.getEdition(id))[4]).to.equal(ethers.ZeroAddress);
    });
  });

  describe("activation (§20.9)", function () {
    it("records once, from any sender, and reports the timestamp", async function () {
      const { units, sponsor, editionId, wallets, ed } = await openedEdition(5);
      const idx = 3;
      const sig = await sign(units, wallets[idx], editionId, idx);
      const proof = proofFor(ed.levels, idx);

      expect(await units.isActivated(editionId, idx)).to.equal(false);
      await expect(units.connect(sponsor).activate(editionId, idx, proof, sig))
        .to.emit(units, "UnitActivated")
        .withArgs(editionId, idx, wallets[idx].address, (t) => t > 0n);

      const [at, who] = await units.getActivation(editionId, idx);
      expect(at).to.be.greaterThan(0n);
      expect(who).to.equal(wallets[idx].address);
      expect(await units.isActivated(editionId, idx)).to.equal(true);
    });

    it("the submitter gains nothing — a sponsor is a courier", async function () {
      const { reg, units, sponsor, editionId, wallets, ed } = await openedEdition(3);
      const sig = await sign(units, wallets[0], editionId, 0);
      await (await units.connect(sponsor).activate(editionId, 0, proofFor(ed.levels, 0), sig)).wait();
      const [, who] = await units.getActivation(editionId, 0);
      expect(who).to.equal(wallets[0].address);
      expect(who).to.not.equal(sponsor.address);
      // and nothing about the edition passport's ownership changed
      const header = await reg.getPassportHeader(editionId);
      expect(header.owner).to.not.equal(sponsor.address);
    });

    it("a duplicate reverts rather than costing a sponsor a second fee (EC 124)", async function () {
      const { units, sponsor, editionId, wallets, ed } = await openedEdition(3);
      const sig = await sign(units, wallets[1], editionId, 1);
      const proof = proofFor(ed.levels, 1);
      await (await units.connect(sponsor).activate(editionId, 1, proof, sig)).wait();
      await expect(units.connect(sponsor).activate(editionId, 1, proof, sig))
        .to.be.revertedWithCustomError(units, "EC")
        .withArgs(124n);
    });

    it("a key outside the run fails the proof (EC 123)", async function () {
      const { units, editionId, ed } = await openedEdition(4);
      const outsider = new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes("not-in-this-edition")));
      const sig = await sign(units, outsider, editionId, 2);
      await expect(units.activate(editionId, 2, proofFor(ed.levels, 2), sig))
        .to.be.revertedWithCustomError(units, "EC")
        .withArgs(123n);
    });

    it("a genuine key cannot be replayed at another index (EC 123)", async function () {
      const { units, editionId, wallets, ed } = await openedEdition(4);
      const sig = await sign(units, wallets[0], editionId, 0);
      await expect(units.activate(editionId, 1, proofFor(ed.levels, 1), sig))
        .to.be.revertedWithCustomError(units, "EC")
        .withArgs(123n);
    });

    it("rejects an out-of-range index (EC 122) and an unknown edition (EC 118)", async function () {
      const { units, editionId, wallets, ed } = await openedEdition(3);
      const sig = await sign(units, wallets[0], editionId, 0);
      await expect(units.activate(editionId, 3, proofFor(ed.levels, 0), sig))
        .to.be.revertedWithCustomError(units, "EC")
        .withArgs(122n);
      await expect(units.activate("ODP-2026-01-000000000", 0, [], sig))
        .to.be.revertedWithCustomError(units, "EC")
        .withArgs(118n);
    });

    it("rejects a malformed signature (EC 125)", async function () {
      const { units, editionId, ed } = await openedEdition(2);
      await expect(units.activate(editionId, 0, proofFor(ed.levels, 0), "0x1234"))
        .to.be.revertedWithCustomError(units, "EC")
        .withArgs(125n);
    });

    it("a signature made offline verifies later from any sender", async function () {
      const { units, stranger, editionId, wallets, ed } = await openedEdition(2);
      const sig = await sign(units, wallets[0], editionId, 0);
      await ethers.provider.send("evm_mine", []);
      await ethers.provider.send("evm_mine", []);
      await (await units.connect(stranger).activate(editionId, 0, proofFor(ed.levels, 0), sig)).wait();
      expect(await units.isActivated(editionId, 0)).to.equal(true);
    });
  });

  describe("the revocation window (§20.13)", function () {
    it("the issuer may revoke before any activation", async function () {
      const { reg, brand, editionId } = await openedEdition(2);
      expect(await reg.isRevocationLocked(editionId)).to.equal(false);
      await (await reg.connect(brand).revokePassport(editionId, seededHash("reason", 1))).wait();
      const cls = await reg.getPassportClassification(editionId);
      expect(cls.revoked).to.equal(true);
    });

    it("the first activation closes the window permanently (EC 116)", async function () {
      const { reg, units, brand, editionId, wallets, ed } = await openedEdition(3);
      const sig = await sign(units, wallets[0], editionId, 0);
      await (await units.activate(editionId, 0, proofFor(ed.levels, 0), sig)).wait();

      expect(await reg.isRevocationLocked(editionId)).to.equal(true);
      expect((await units.getEdition(editionId))[3]).to.equal(true);

      await expect(reg.connect(brand).revokePassport(editionId, seededHash("reason", 2)))
        .to.be.revertedWithCustomError(reg, "EC")
        .withArgs(116n);
    });

    it("governance cannot revoke either once the window has closed", async function () {
      const { reg, units, editionId, wallets, ed } = await openedEdition(3);
      const [governance] = await ethers.getSigners(); // deployer is governance
      const sig = await sign(units, wallets[2], editionId, 2);
      await (await units.activate(editionId, 2, proofFor(ed.levels, 2), sig)).wait();
      await expect(reg.connect(governance).revokePassport(editionId, seededHash("reason", 3)))
        .to.be.revertedWithCustomError(reg, "EC")
        .withArgs(116n);
    });

    it("only the paired satellite may set the lock (EC 117)", async function () {
      const { reg, brand, editionId } = await openedEdition(2);
      await expect(reg.connect(brand).lockEditionRevocation(editionId))
        .to.be.revertedWithCustomError(reg, "EC")
        .withArgs(117n);
    });

    it("only governance may pair the satellite (EC 56)", async function () {
      const { reg, stranger, units } = await openedEdition(2);
      await expect(reg.connect(stranger).setEditionUnits(units.target))
        .to.be.revertedWithCustomError(reg, "EC")
        .withArgs(56n);
    });
  });

  describe("core hooks (§20.10, §20.13)", function () {
    it("initialOwner names the owner; zero still means the minting principal", async function () {
      const { reg } = await deployAll();
      const [brand, buyer] = await ethers.getSigners();
      await (await reg.connect(brand).registerCreator(TYPE_B)).wait();

      await (await reg.connect(brand).mintPhysical(await physicalInputs(10), false, MINT_SELF)).wait();
      const [selfIds] = await reg.getPassportsByCreatorPaged(brand.address, 0, 50);
      const selfHeader = await reg.getPassportHeader(selfIds[selfIds.length - 1]);
      expect(selfHeader.owner).to.equal(brand.address);

      const inputs = await physicalInputs(11, { initialOwner: buyer.address });
      await (await reg.connect(brand).mintPhysical(inputs, false, MINT_SELF)).wait();
      const [ids] = await reg.getPassportsByCreatorPaged(brand.address, 0, 50);
      const header = await reg.getPassportHeader(ids[ids.length - 1]);
      expect(header.creator).to.equal(brand.address);
      expect(header.owner).to.equal(buyer.address);
    });

    it("edition notice (kind 8) is accepted and appends", async function () {
      const { reg, brand, editionId } = await openedEdition(2);
      await expect(
        reg
          .connect(brand)
          .recordPassportEvent(editionId, EVENT_EDITION_NOTICE, 0, "key set compromised", ethers.ZeroHash, ""),
      ).to.emit(reg, "PassportEventRecorded");
      const ev = await reg.getPassportEvents(editionId);
      expect(ev[0]).to.equal(1n);
      expect(ev[1]).to.equal(BigInt(EVENT_EDITION_NOTICE));
    });

    it("CONTRACT_VERSION is the 0.7 line", async function () {
      const { reg } = await deployAll();
      expect(Number(await reg.CONTRACT_VERSION())).to.equal(7);
    });
  });

  describe("unit passports (§20.10)", function () {
    async function activatedUnit(index = 0, count = 4) {
      const ctx = await openedEdition(count);
      const sig = await sign(ctx.units, ctx.wallets[index], ctx.editionId, index);
      await (await ctx.units.activate(ctx.editionId, index, proofFor(ctx.ed.levels, index), sig)).wait();
      return ctx;
    }

    async function signMint(units, wallet, editionId, index, owner) {
      const payload = await units.mintPayloadHash(editionId, index, owner);
      return wallet.signMessage(ethers.getBytes(payload));
    }

    async function mintFor(ctx, index, owner, payer, n = 50) {
      const sig = await signMint(ctx.units, ctx.wallets[index], ctx.editionId, index, owner);
      const tx = await ctx.units
        .connect(payer)
        .mintUnitPassport(
          ctx.editionId,
          index,
          owner,
          proofFor(ctx.ed.levels, index),
          sig,
          await physicalInputs(n),
          false,
        );
      await tx.wait();
      const ids = await ctx.units.getUnitPassports(ctx.editionId, index);
      return ids[ids.length - 1];
    }

    it("the key names the owner and anyone may pay", async function () {
      const ctx = await activatedUnit(0);
      const buyer = ctx.stranger;
      const id = await mintFor(ctx, 0, buyer.address, ctx.sponsor);

      const header = await ctx.reg.getPassportHeader(id);
      expect(header.owner).to.equal(buyer.address);        // named in the signature
      expect(header.creator).to.equal(ctx.brand.address);  // the edition's issuer
      expect(header.owner).to.not.equal(ctx.sponsor.address); // the payer got nothing
    });

    it("a holder with no wallet can name the unit address itself (bearer path)", async function () {
      const ctx = await activatedUnit(1);
      const id = await mintFor(ctx, 1, ctx.wallets[1].address, ctx.sponsor);
      const header = await ctx.reg.getPassportHeader(id);
      expect(header.owner).to.equal(ctx.wallets[1].address);
    });

    it("rejects a unit that was never activated (EC 128)", async function () {
      const ctx = await openedEdition(3);
      const sig = await signMint(ctx.units, ctx.wallets[2], ctx.editionId, 2, ctx.stranger.address);
      await expect(
        ctx.units.mintUnitPassport(
          ctx.editionId, 2, ctx.stranger.address, proofFor(ctx.ed.levels, 2), sig, await physicalInputs(60), false,
        ),
      )
        .to.be.revertedWithCustomError(ctx.units, "EC")
        .withArgs(128n);
    });

    it("blocks a repeat for the same owner (EC 129) but allows a competing one", async function () {
      const ctx = await activatedUnit(0);
      const first = await mintFor(ctx, 0, ctx.stranger.address, ctx.sponsor, 61);

      const sig = await signMint(ctx.units, ctx.wallets[0], ctx.editionId, 0, ctx.stranger.address);
      await expect(
        ctx.units.mintUnitPassport(
          ctx.editionId, 0, ctx.stranger.address, proofFor(ctx.ed.levels, 0), sig, await physicalInputs(62), false,
        ),
      )
        .to.be.revertedWithCustomError(ctx.units, "EC")
        .withArgs(129n);

      // ADR-0003: a second owner is allowed — no lock-out of the genuine holder.
      const second = await mintFor(ctx, 0, ctx.sponsor.address, ctx.sponsor, 63);
      expect(second).to.not.equal(first);
      const all = await ctx.units.getUnitPassports(ctx.editionId, 0);
      expect(all.length).to.equal(2);
      expect(await ctx.units.hasUnitPassportFor(ctx.editionId, 0, ctx.stranger.address)).to.equal(true);
    });

    it("a signature for one owner cannot mint to another (EC 123)", async function () {
      const ctx = await activatedUnit(0);
      const sig = await signMint(ctx.units, ctx.wallets[0], ctx.editionId, 0, ctx.stranger.address);
      await expect(
        ctx.units.mintUnitPassport(
          ctx.editionId, 0, ctx.sponsor.address, proofFor(ctx.ed.levels, 0), sig, await physicalInputs(64), false,
        ),
      )
        .to.be.revertedWithCustomError(ctx.units, "EC")
        .withArgs(123n);
    });

    it("rejects a key outside the run (EC 123) and a zero owner (EC 130)", async function () {
      const ctx = await activatedUnit(0);
      const outsider = new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes("outsider-mint")));
      const badSig = await signMint(ctx.units, outsider, ctx.editionId, 0, ctx.stranger.address);
      await expect(
        ctx.units.mintUnitPassport(
          ctx.editionId, 0, ctx.stranger.address, proofFor(ctx.ed.levels, 0), badSig, await physicalInputs(65), false,
        ),
      )
        .to.be.revertedWithCustomError(ctx.units, "EC")
        .withArgs(123n);

      const zeroSig = await signMint(ctx.units, ctx.wallets[0], ctx.editionId, 0, ethers.ZeroAddress);
      await expect(
        ctx.units.mintUnitPassport(
          ctx.editionId, 0, ethers.ZeroAddress, proofFor(ctx.ed.levels, 0), zeroSig, await physicalInputs(66), false,
        ),
      )
        .to.be.revertedWithCustomError(ctx.units, "EC")
        .withArgs(130n);
    });

    it("only the paired satellite may reach the core mint (EC 117)", async function () {
      const ctx = await activatedUnit(0);
      await expect(
        ctx.reg
          .connect(ctx.brand)
          .mintUnitPassport(await physicalInputs(67), ctx.editionId, ctx.stranger.address, false),
      )
        .to.be.revertedWithCustomError(ctx.reg, "EC")
        .withArgs(117n);
    });

    it("the unit passport carries the minter's own anchors, not the edition's", async function () {
      const ctx = await activatedUnit(0);
      const own = await physicalInputs(68, { anchorsHash: seededHash("my-own-unit", 1) });
      const sig = await signMint(ctx.units, ctx.wallets[0], ctx.editionId, 0, ctx.stranger.address);
      await (
        await ctx.units.mintUnitPassport(
          ctx.editionId, 0, ctx.stranger.address, proofFor(ctx.ed.levels, 0), sig, own, false,
        )
      ).wait();
      const ids = await ctx.units.getUnitPassports(ctx.editionId, 0);
      const media = await ctx.reg.getPassportMedia(ids[0]);
      expect(media.anchorsHash).to.equal(seededHash("my-own-unit", 1));
      const editionMedia = await ctx.reg.getPassportMedia(ctx.editionId);
      expect(media.anchorsHash).to.not.equal(editionMedia.anchorsHash);
    });
  });

  describe("the tree itself", function () {
    it("the contract's leaf matches the off-chain construction", async function () {
      const { units, wallets } = await openedEdition(2);
      expect(await units.unitLeaf(1, wallets[1].address)).to.equal(unitLeaf(1, wallets[1].address));
    });

    it("verifies every unit of an odd-sized run", async function () {
      const { units, editionId, wallets, ed } = await openedEdition(7);
      for (let i = 0; i < 7; i++) {
        const sig = await sign(units, wallets[i], editionId, i);
        await (await units.activate(editionId, i, proofFor(ed.levels, i), sig)).wait();
        expect(await units.isActivated(editionId, i)).to.equal(true);
      }
    });
  });
});
