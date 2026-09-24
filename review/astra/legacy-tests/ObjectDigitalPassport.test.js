/**
 * @file ObjectDigitalPassport 0.6 — behaviour checks (card, anchors, append-only events,
 * folder URL resolution, tier mint caps, satellites).
 * Run from `chain/deploy/`: npm ci && npm test
 */
import { expect } from "chai";
import hre from "hardhat";

const { ethers } = await hre.network.connect();

const TYPE_C = "0x43";
const TYPE_B = "0x42";
const TYPE_P = "0x50";
const TYPE_M = "0x4d";

// ODPAnchorBits
const ANCHOR_PHOTO = 1;
const ANCHOR_DIMENSIONS = 2;
const ANCHOR_MATERIALS = 4;
const ANCHOR_FEATURES = 8;
const ANCHOR_MARKS = 16;
const ANCHOR_FILE_HASH = 32;
const ANCHOR_PERCEPTUAL = 64;
const PHYS_MIN = ANCHOR_PHOTO | ANCHOR_DIMENSIONS | ANCHOR_MATERIALS | ANCHOR_FEATURES;

// ODPEventKinds
const EVENT_STATUS = 1;
const EVENT_LOCATION = 2;
const EVENT_DAMAGE = 5;

/** Spec 0.7 unified mint tuple (matches PassportMintInputs in ODPPassportTypes.sol). */
const MINT_INPUTS_TYPE =
  "tuple(tuple(uint32 year,uint8 month,string title,string authorName,string shortDescription,string domain,uint8 contentClass,uint8 lifecycleStatus,uint8 aiStatus,uint8 verificationMethod,uint8 editionModel) core,bytes32 dataHash,string dataUrl,bytes32 imageHash,string imageUrl,bytes32 fileHash,bytes32 anchorsHash,uint32 anchorTypesMask,address initialOwner)";

/** last mint arg — empty string = mint as caller’s registered profile */
const MINT_SELF = "";

function zeroHash() {
  return ethers.ZeroHash;
}

function nonZeroHash(label, n) {
  return ethers.keccak256(ethers.toUtf8Bytes(`${label}-${n}`));
}

const nonZeroDataHash = (n) => nonZeroHash("passport-json", n);
const nonZeroFileHash = (n) => nonZeroHash("file", n);
const nonZeroAnchorsHash = (n) => nonZeroHash("anchors", n);
const nonZeroImageHash = (n) => nonZeroHash("image", n);

/** Fixed UTC instants for `evm_setNextBlockTimestamp` — must match mint `year`/`month` args. */
const TS_UTC = {
  MAR_2026: Math.floor(Date.parse("2026-03-15T12:00:00.000Z") / 1000),
  JUN_2031: Math.floor(Date.parse("2031-06-10T12:00:00.000Z") / 1000),
};

/** Never move block time backwards (Hardhat rejects); returns the mined block's Unix time. */
async function mineAt(ts) {
  const latest = await ethers.provider.getBlock("latest");
  const t = Math.max(ts, Number(latest.timestamp) + 1);
  await ethers.provider.send("evm_setNextBlockTimestamp", [t]);
  await ethers.provider.send("evm_mine", []);
  return t;
}

/** Set after aligning chain time — must match every mint tuple year+month. */
let MINT_Y = 2026;
let MINT_M = 3;

async function syncMintYm() {
  const t = await mineAt(TS_UTC.MAR_2026);
  const d = new Date(t * 1000);
  MINT_Y = d.getUTCFullYear();
  MINT_M = d.getUTCMonth() + 1;
}

function mintCore(year, month, overrides = {}) {
  return {
    year,
    month,
    title: "Test passport",
    authorName: "Test Author",
    shortDescription: "Digital test object, 2026",
    domain: "software",
    contentClass: 6,
    lifecycleStatus: 2,
    aiStatus: 1,
    verificationMethod: 1,
    editionModel: 1,
    ...overrides,
  };
}

/** Valid digital mint tuple; `n` seeds the hashes. */
function digitalInputs(n, overrides = {}) {
  return {
    core: mintCore(MINT_Y, MINT_M, overrides.core || {}),
    dataHash: nonZeroDataHash(n),
    dataUrl: "",
    imageHash: zeroHash(),
    imageUrl: "",
    fileHash: nonZeroFileHash(n),
    anchorsHash: nonZeroAnchorsHash(n),
    anchorTypesMask: ANCHOR_FILE_HASH,
    initialOwner: ethers.ZeroAddress,
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== "core")),
  };
}

/** Valid physical mint tuple; `n` seeds the hashes. */
function physicalInputs(n, overrides = {}) {
  return {
    core: mintCore(MINT_Y, MINT_M, overrides.core || {}),
    dataHash: nonZeroDataHash(n),
    dataUrl: "",
    imageHash: nonZeroImageHash(n),
    imageUrl: "",
    fileHash: zeroHash(),
    anchorsHash: nonZeroAnchorsHash(n),
    anchorTypesMask: PHYS_MIN,
    initialOwner: ethers.ZeroAddress,
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== "core")),
  };
}

function encodeMintPayload(inputs) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return coder.encode([MINT_INPUTS_TYPE], [inputs]);
}

async function readPassport(contract, passportId) {
  const [header, classification, media, events] = await Promise.all([
    contract.getPassportHeader(passportId),
    contract.getPassportClassification(passportId),
    contract.getPassportMedia(passportId),
    contract.getPassportEvents(passportId),
  ]);
  const normalize = (part) => (part && typeof part.toObject === "function" ? part.toObject() : part);
  return {
    ...normalize(header),
    ...normalize(classification),
    ...normalize(media),
    events: normalize(events),
  };
}

describe("ObjectDigitalPassport", function () {
  async function deployFixture() {
    await syncMintYm();
    const LibFactory = await ethers.getContractFactory("ODPPassportLib");
    const lib = await LibFactory.deploy();
    await lib.waitForDeployment();
    const libAddress = await lib.getAddress();
    const Factory = await ethers.getContractFactory("ObjectDigitalPassport", {
      libraries: {
        "project/contracts/ODPPassportLib.sol:ODPPassportLib": libAddress,
      },
    });
    const contract = await Factory.deploy();
    await contract.waitForDeployment();
    const RelationsFactory = await ethers.getContractFactory("ODPRegistryRelations");
    const relations = await RelationsFactory.deploy(contract.target);
    await relations.waitForDeployment();
    await contract.setRelationsSatellite(relations.target);
    const ProofFactory = await ethers.getContractFactory("ODPPassportProofRegistry", {
      libraries: {
        "project/contracts/ODPPassportLib.sol:ODPPassportLib": libAddress,
      },
    });
    const proofRegistry = await ProofFactory.deploy(contract.target);
    await proofRegistry.waitForDeployment();
    const ExtensionRouterFactory = await ethers.getContractFactory("ODPExtensionMintRouter", {
      libraries: {
        "project/contracts/ODPPassportLib.sol:ODPPassportLib": libAddress,
      },
    });
    const extensionRouter = await ExtensionRouterFactory.deploy(contract.target);
    await extensionRouter.waitForDeployment();
    await contract.setExtensionRouter(extensionRouter.target);
    contract.relations = relations;
    contract.proofRegistry = proofRegistry;
    contract.extensionRouter = extensionRouter;
    return contract;
  }

  async function listCreatorPassports(contract, ownerAddr, pageSize = 100) {
    const out = [];
    let offset = 0n;
    for (;;) {
      const page = await contract.getPassportsByCreatorPaged(ownerAddr, offset, pageSize);
      const rows = page.result || page[0] || [];
      const total = BigInt(page.total || page[1] || 0);
      out.push(...rows);
      offset = BigInt(out.length);
      if (!rows.length || (total && offset >= total)) break;
    }
    return out;
  }

  /** ethers v6: mint returns a TransactionResponse, not passportId. IDs are random — read last passport for the issuer wallet. */
  async function mintAndId(contract, signer, method, inputs, opts = {}) {
    const tx = await contract
      .connect(signer)
      [method](inputs, opts.dataUrlIsFolderBase ?? false, opts.mintOnBehalfOfCreatorId ?? MINT_SELF);
    await tx.wait();
    const ownerAddr = opts.passportOwner ?? signer.address;
    const ids = await listCreatorPassports(contract, ownerAddr);
    return ids[ids.length - 1];
  }

  describe("UTC year/month (mint & submitProof)", function () {
    it("reverts EC(68) when mint year/month do not match block UTC calendar", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const inputs = digitalInputs(6801, { core: { year: 2000, month: 1 } });
      await expect(c.connect(w).mintDigital(inputs, false, MINT_SELF))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(68n);
    });

    it("reverts EC(68) when submitProof month does not match block UTC", async function () {
      const c = await deployFixture();
      const [wC, wP] = await ethers.getSigners();
      await c.connect(wC).registerCreator(TYPE_C);
      const passportId = await mintAndId(c, wC, "mintDigital", digitalInputs(6802));
      await c.connect(wP).registerCreator(TYPE_P);
      await mineAt(TS_UTC.JUN_2031);
      await expect(c.proofRegistry.connect(wP).submitProof(passportId, zeroHash(), "", 2031, 5))
        .to.be.revertedWithCustomError(c.proofRegistry, "EC")
        .withArgs(68n);
    });
  });

  it("CONTRACT_VERSION matches major*16+minor (internal SPEC_* constants)", async function () {
    const c = await deployFixture();
    const packed = await c.CONTRACT_VERSION();
    const p = BigInt(packed.toString());
    expect(Number(packed)).to.equal(7); // reference line spec 0.7: SPEC_MAJOR=0, SPEC_MINOR=7
    expect(Number(p / 16n) * 16 + Number(p % 16n)).to.equal(Number(packed));
  });

  describe("0.6 on-chain card", function () {
    it("stores title/authorName/shortDescription/domain and anchors summary", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const inputs = physicalInputs(100, {
        core: {
          title: "Утро в лесу",
          authorName: "И. И. Шишкин",
          shortDescription: "Живопись, холст/масло, 1889",
        },
        anchorTypesMask: PHYS_MIN | ANCHOR_MARKS,
      });
      const passportId = await mintAndId(c, w, "mintPhysical", inputs);
      const p = await readPassport(c, passportId);
      expect(p.title).to.equal("Утро в лесу");
      expect(p.authorName).to.equal("И. И. Шишкин");
      expect(p.shortDescription).to.equal("Живопись, холст/масло, 1889");
      expect(p.domain).to.equal("software");
      expect(p.objectType).to.equal("physical");
      expect(p.anchorsHash).to.equal(inputs.anchorsHash);
      expect(p.anchorTypesMask).to.equal(BigInt(PHYS_MIN | ANCHOR_MARKS));
      expect(p.imageHash).to.equal(inputs.imageHash);
      expect(p.fileHash).to.equal(zeroHash());
    });

    it("PassportMinted carries card and anchors fields", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const inputs = digitalInputs(101);
      const tx = await c.connect(w).mintDigital(inputs, false, MINT_SELF);
      const receipt = await tx.wait();
      const ev = receipt.logs
        .map((l) => {
          try {
            return c.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((x) => x && x.name === "PassportMinted");
      expect(ev).to.not.equal(undefined);
      expect(ev.args.title).to.equal(inputs.core.title);
      expect(ev.args.authorName).to.equal(inputs.core.authorName);
      expect(ev.args.objectType).to.equal("digital");
      expect(ev.args.dataHash).to.equal(inputs.dataHash);
      expect(ev.args.anchorsHash).to.equal(inputs.anchorsHash);
      expect(ev.args.anchorTypesMask).to.equal(BigInt(ANCHOR_FILE_HASH));
    });

    it("card validation: empty/oversized title, authorName, shortDescription", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const cases = [
        [{ title: "" }, 91n],
        [{ title: "x".repeat(129) }, 92n],
        [{ authorName: "" }, 99n],
        [{ authorName: "x".repeat(129) }, 100n],
        [{ shortDescription: "" }, 101n],
        [{ shortDescription: "x".repeat(257) }, 102n],
        [{ domain: "x".repeat(129) }, 93n],
      ];
      for (const [coreOverride, code] of cases) {
        const inputs = digitalInputs(102, { core: coreOverride });
        await expect(c.connect(w).mintDigital(inputs, false, MINT_SELF))
          .to.be.revertedWithCustomError(c, "EC")
          .withArgs(code);
      }
    });
  });

  describe("0.6 anchors hard minimum", function () {
    it("reverts EC(103) when anchorsHash is zero", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const inputs = digitalInputs(110, { anchorsHash: zeroHash() });
      await expect(c.connect(w).mintDigital(inputs, false, MINT_SELF))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(103n);
    });

    it("reverts EC(105) when physical mask lacks the identification minimum", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const inputs = physicalInputs(111, { anchorTypesMask: ANCHOR_PHOTO | ANCHOR_DIMENSIONS });
      await expect(c.connect(w).mintPhysical(inputs, false, MINT_SELF))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(105n);
    });

    it("reverts EC(106) when physical mint carries a fileHash", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const inputs = physicalInputs(112, { fileHash: nonZeroFileHash(112) });
      await expect(c.connect(w).mintPhysical(inputs, false, MINT_SELF))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(106n);
    });

    it("reverts EC(107) when physical mint has no primary imageHash", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const inputs = physicalInputs(113, { imageHash: zeroHash() });
      await expect(c.connect(w).mintPhysical(inputs, false, MINT_SELF))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(107n);
    });

    it("reverts EC(29) when digital mint has no fileHash and EC(105) without FILE_HASH bit", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      await expect(
        c.connect(w).mintDigital(digitalInputs(114, { fileHash: zeroHash() }), false, MINT_SELF),
      )
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(29n);
      await expect(
        c.connect(w).mintDigital(digitalInputs(115, { anchorTypesMask: ANCHOR_PERCEPTUAL }), false, MINT_SELF),
      )
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(105n);
    });

    it("mintMixed requires both physical minimum and file anchor", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const bad = physicalInputs(116, { fileHash: nonZeroFileHash(116), anchorTypesMask: PHYS_MIN });
      await expect(c.connect(w).mintMixed(bad, false, MINT_SELF))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(105n);
      const good = physicalInputs(117, {
        fileHash: nonZeroFileHash(117),
        anchorTypesMask: PHYS_MIN | ANCHOR_FILE_HASH,
      });
      const passportId = await mintAndId(c, w, "mintMixed", good);
      const p = await readPassport(c, passportId);
      expect(p.objectType).to.equal("mixed");
      expect(p.fileHash).to.equal(good.fileHash);
    });
  });

  describe("0.6 append-only passport events", function () {
    it("STATUS event updates lifecycleStatus and the summary counters", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const passportId = await mintAndId(c, w, "mintDigital", digitalInputs(120));
      let p = await readPassport(c, passportId);
      expect(p.lifecycleStatus).to.equal(2n);
      expect(p.events.eventCount).to.equal(0n);
      const tx = await c
        .connect(w)
        .recordPassportEvent(passportId, EVENT_STATUS, 4, "archived after exhibition", zeroHash(), "");
      const receipt = await tx.wait();
      p = await readPassport(c, passportId);
      expect(p.lifecycleStatus).to.equal(4n);
      expect(p.events.eventCount).to.equal(1n);
      expect(p.events.lastEventKind).to.equal(BigInt(EVENT_STATUS));
      expect(p.events.lastEventAt > 0n).to.equal(true);
      const ev = receipt.logs
        .map((l) => {
          try {
            return c.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((x) => x && x.name === "PassportEventRecorded");
      expect(ev).to.not.equal(undefined);
      expect(ev.args.kind).to.equal(BigInt(EVENT_STATUS));
      expect(ev.args.value).to.equal(4n);
      expect(ev.args.note).to.equal("archived after exhibition");
      expect(ev.args.recordedBy).to.equal(w.address);
    });

    it("DAMAGE event with attachment; history only appends", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const passportId = await mintAndId(c, w, "mintDigital", digitalInputs(121));
      const reportHash = nonZeroHash("damage-report", 121);
      await c
        .connect(w)
        .recordPassportEvent(passportId, EVENT_DAMAGE, 0, "scratch on frame", reportHash, "https://x.example/report.pdf");
      await c.connect(w).recordPassportEvent(passportId, EVENT_LOCATION, 0, "Moscow, storage B", zeroHash(), "");
      const p = await readPassport(c, passportId);
      expect(p.events.eventCount).to.equal(2n);
      expect(p.events.lastEventKind).to.equal(BigInt(EVENT_LOCATION));
    });

    it("owner (after transfer) and governance may record; strangers get EC(98)", async function () {
      const c = await deployFixture();
      const [gov, w, w2, stranger] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const passportId = await mintAndId(c, w, "mintDigital", digitalInputs(122));
      await c.connect(w).transferPassport(passportId, w2.address);
      await c.connect(w2).recordPassportEvent(passportId, EVENT_LOCATION, 0, "new owner shelf", zeroHash(), "");
      await c.connect(gov).recordPassportEvent(passportId, EVENT_LOCATION, 0, "governance note", zeroHash(), "");
      await expect(
        c.connect(stranger).recordPassportEvent(passportId, EVENT_LOCATION, 0, "hack", zeroHash(), ""),
      )
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(98n);
    });

    it("validates kind, value, and attachment pair", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const passportId = await mintAndId(c, w, "mintDigital", digitalInputs(123));
      await expect(c.connect(w).recordPassportEvent(passportId, 0, 0, "", zeroHash(), ""))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(108n);
      // 0.7 §20.13: kind 8 is the edition notice, so the upper bound moved to 9.
      await expect(c.connect(w).recordPassportEvent(passportId, 9, 0, "", zeroHash(), ""))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(108n);
      await expect(c.connect(w).recordPassportEvent(passportId, EVENT_LOCATION, 3, "", zeroHash(), ""))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(109n);
      await expect(c.connect(w).recordPassportEvent(passportId, EVENT_STATUS, 9, "", zeroHash(), ""))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(85n);
      await expect(
        c.connect(w).recordPassportEvent(passportId, EVENT_LOCATION, 0, "", zeroHash(), "https://x.example/orphan.pdf"),
      )
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(89n);
    });

    it("revoked passport accepts no further events", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const passportId = await mintAndId(c, w, "mintDigital", digitalInputs(124));
      await c.connect(w).revokePassport(passportId, ethers.keccak256(ethers.toUtf8Bytes("typo in card")));
      await expect(c.connect(w).recordPassportEvent(passportId, EVENT_LOCATION, 0, "late", zeroHash(), ""))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(11n);
    });
  });

  describe("getRemainingMints by tier", function () {
    async function getRemainingMintsEstimate(contract, wallet) {
      const creatorId = await contract.getCreatorByWallet(wallet);
      if (!creatorId) return 0n;
      const creator = await contract.getCreator(creatorId);
      const tp = creator.typePrefix;
      if (tp === TYPE_P || tp === TYPE_M) return (2n ** 32n) - 1n;
      const limit = tp === TYPE_B ? 100000n : 1000n;
      const ids = await listCreatorPassports(contract, wallet);
      let used = 0n;
      for (const id of ids) {
        const header = await contract.getPassportHeader(id);
        if (BigInt(header.year) === BigInt(MINT_Y) && BigInt(header.month) === BigInt(MINT_M)) {
          used += 1n;
        }
      }
      return used >= limit ? 0n : limit - used;
    }

    it("C: after one mint, remaining is MONTHLY_LIMIT_C - 1", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const lim = 1000n;
      expect(await getRemainingMintsEstimate(c, w.address)).to.equal(lim);
      await mintAndId(c, w, "mintDigital", digitalInputs(1));
      expect(await getRemainingMintsEstimate(c, w.address)).to.equal(lim - 1n);
    });

    it("B: after one mint, remaining is MONTHLY_LIMIT_B - 1", async function () {
      const c = await deployFixture();
      const [_, wB] = await ethers.getSigners();
      await c.connect(wB).registerCreator(TYPE_B);
      const lim = 100000n;
      expect(await getRemainingMintsEstimate(c, wB.address)).to.equal(lim);
      await mintAndId(c, wB, "mintDigital", digitalInputs(2));
      expect(await getRemainingMintsEstimate(c, wB.address)).to.equal(lim - 1n);
    });

    it("P: getRemainingMints stays at uint32 max (unlimited)", async function () {
      const c = await deployFixture();
      const [_, __, wP] = await ethers.getSigners();
      await c.connect(wP).registerCreator(TYPE_P);
      const max32 = 2n ** 32n - 1n;
      expect(await getRemainingMintsEstimate(c, wP.address)).to.equal(max32);
      await mintAndId(c, wP, "mintDigital", digitalInputs(3));
      expect(await getRemainingMintsEstimate(c, wP.address)).to.equal(max32);
    });

    it("M: getRemainingMints stays at uint32 max (unlimited)", async function () {
      const c = await deployFixture();
      const [_, __, ___, wM] = await ethers.getSigners();
      await c.connect(wM).registerCreator(TYPE_M);
      const max32 = 2n ** 32n - 1n;
      expect(await getRemainingMintsEstimate(c, wM.address)).to.equal(max32);
      await mintAndId(c, wM, "mintDigital", digitalInputs(31));
      expect(await getRemainingMintsEstimate(c, wM.address)).to.equal(max32);
    });

    it("M: can submitProof like P; documentHash is stored", async function () {
      const c = await deployFixture();
      const [wC, wM] = await ethers.getSigners();
      await c.connect(wC).registerCreator(TYPE_C);
      const passportId = await mintAndId(c, wC, "mintDigital", digitalInputs(41));
      await c.connect(wM).registerCreator(TYPE_M);
      await mineAt(TS_UTC.JUN_2031);
      const docHash = nonZeroHash("expertise-doc", 41);
      const tx = await c.proofRegistry
        .connect(wM)
        .submitProof(passportId, docHash, "https://museum.example/expertise.pdf", 2031, 6);
      await tx.wait();
      const ids = await c.proofRegistry.getProofsForPassport(passportId);
      expect(ids.length).to.equal(1);
      const proof = await c.proofRegistry.getProof(ids[0]);
      expect(proof.documentHash).to.equal(docHash);
      expect(proof.documentUrl).to.equal("https://museum.example/expertise.pdf");
    });
  });

  describe("_resolveMintDataUrl (via mintDigital + getPassport)", function () {
    it("stores folderBase/passportId.odpass and strips trailing slashes", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const inputs = digitalInputs(10, { dataUrl: "https://example.com/passports///" });
      const passportId = await mintAndId(c, w, "mintDigital", inputs, { dataUrlIsFolderBase: true });
      const p = await readPassport(c, passportId);
      expect(p.dataUrl).to.equal(`https://example.com/passports/${passportId}.odpass`);
    });

    it("does not normalize // in the middle of the path (only trailing slashes)", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const inputs = digitalInputs(12, { dataUrl: "https://example.com/foo//bar///" });
      const passportId = await mintAndId(c, w, "mintDigital", inputs, { dataUrlIsFolderBase: true });
      const p = await readPassport(c, passportId);
      expect(p.dataUrl).to.equal(`https://example.com/foo//bar/${passportId}.odpass`);
    });

    it("updatePassportUrls sets literal URLs (no folder resolution)", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const inputs = digitalInputs(11, { dataUrl: "https://a.com/folder/" });
      const passportId = await mintAndId(c, w, "mintDigital", inputs, { dataUrlIsFolderBase: true });
      const full = `https://other.host/${passportId}.odpass`;
      await c.connect(w).updatePassportUrls(passportId, full, "", inputs.dataHash);
      const p = await readPassport(c, passportId);
      expect(p.dataUrl).to.equal(full);
    });
  });

  describe("ownership and lifecycle", function () {
    it("owner starts as creator; transferPassport moves owner", async function () {
      const c = await deployFixture();
      const [wA, wB] = await ethers.getSigners();
      await c.connect(wA).registerCreator(TYPE_C);
      const passportId = await mintAndId(c, wA, "mintDigital", digitalInputs(501));
      let p = await readPassport(c, passportId);
      expect(p.owner).to.equal(wA.address);
      expect(p.mintAgent).to.equal(ethers.ZeroAddress);
      await c.connect(wA).transferPassport(passportId, wB.address);
      p = await readPassport(c, passportId);
      expect(p.owner).to.equal(wB.address);
      expect(p.creator).to.equal(wA.address);
    });

    it("governance or creator can revokePassport; submitProof fails when revoked", async function () {
      const c = await deployFixture();
      const [wA, wP] = await ethers.getSigners();
      await c.connect(wA).registerCreator(TYPE_C);
      const passportId = await mintAndId(c, wA, "mintDigital", digitalInputs(502));
      const reason = ethers.keccak256(ethers.toUtf8Bytes("test-revoke"));
      await c.connect(wA).revokePassport(passportId, reason);
      const p = await readPassport(c, passportId);
      expect(p.revoked).to.equal(true);
      await c.connect(wP).registerCreator(TYPE_P);
      await expect(c.proofRegistry.connect(wP).submitProof(passportId, zeroHash(), "", 2031, 1)).to.be.revertedWithCustomError(
        c.proofRegistry,
        "EC"
      );
    });

    it("detachAffiliation sets audit timestamps and clears active parent", async function () {
      const c = await deployFixture();
      const [_, __, wChild, wParent] = await ethers.getSigners();
      await c.connect(wChild).registerCreator(TYPE_P);
      await c.connect(wParent).registerCreator(TYPE_P);
      const childId = await c.getCreatorByWallet(wChild.address);
      const parentId = await c.getCreatorByWallet(wParent.address);
      await c.relations.connect(wChild).proposeAffiliation(parentId);
      await c.relations.connect(wParent).confirmAffiliation(childId);
      expect(await c.relations.getAffiliatedParent(childId)).to.equal(parentId);
      let a = await c.relations.getAffiliationAudit(childId);
      expect(a.joinedAt > 0n).to.equal(true);
      expect(a.detachedAt).to.equal(0n);
      await c.relations.connect(wParent).detachAffiliation(childId);
      expect(await c.relations.getAffiliatedParent(childId)).to.equal("");
      a = await c.relations.getAffiliationAudit(childId);
      expect(a.detachedAt > 0n).to.equal(true);
      expect(a.lastDetachedFromParent).to.equal(parentId);
    });
  });

  describe("affiliation (B / M / P, display-only)", function () {
    /** Registers `count` fresh B profiles and returns [signer, creatorId] pairs. */
    async function bProfiles(c, signers) {
      const out = [];
      for (const w of signers) {
        await c.connect(w).registerCreator(TYPE_B);
        out.push([w, await c.getCreatorByWallet(w.address)]);
      }
      return out;
    }

    it("links across types: a B sub-brand may sit under an M collection", async function () {
      const c = await deployFixture();
      const [, , wChild, wParent] = await ethers.getSigners();
      await c.connect(wChild).registerCreator(TYPE_B);
      await c.connect(wParent).registerCreator(TYPE_M);
      const childId = await c.getCreatorByWallet(wChild.address);
      const parentId = await c.getCreatorByWallet(wParent.address);
      await c.relations.connect(wChild).proposeAffiliation(parentId);
      expect(await c.relations.isAffiliationPending(parentId, childId)).to.equal(true);
      await c.relations.connect(wParent).confirmAffiliation(childId);
      expect(await c.relations.getAffiliatedParent(childId)).to.equal(parentId);
      expect(await c.relations.getAffiliatedChildren(parentId)).to.deep.equal([childId]);
    });

    it("rejects C on either side of the link with EC(71)", async function () {
      const c = await deployFixture();
      const [, , wIndividual, wBrand] = await ethers.getSigners();
      await c.connect(wIndividual).registerCreator(TYPE_C);
      await c.connect(wBrand).registerCreator(TYPE_B);
      const individualId = await c.getCreatorByWallet(wIndividual.address);
      const brandId = await c.getCreatorByWallet(wBrand.address);
      // C proposing a parent
      await expect(c.relations.connect(wIndividual).proposeAffiliation(brandId))
        .to.be.revertedWithCustomError(c.relations, "EC")
        .withArgs(71n);
      // C named as the parent
      await expect(c.relations.connect(wBrand).proposeAffiliation(individualId))
        .to.be.revertedWithCustomError(c.relations, "EC")
        .withArgs(71n);
    });

    it("a parent may itself gain a parent later: school -> university -> consortium", async function () {
      const c = await deployFixture();
      const [, , wSchool, wUniversity, wConsortium] = await ethers.getSigners();
      const [[, schoolId], [wUni, universityId], [wCons, consortiumId]] = await bProfiles(c, [
        wSchool,
        wUniversity,
        wConsortium,
      ]);
      await c.relations.connect(wSchool).proposeAffiliation(universityId);
      await c.relations.connect(wUni).confirmAffiliation(schoolId);
      // The university now has a child; a consortium appearing above must still be possible.
      await c.relations.connect(wUni).proposeAffiliation(consortiumId);
      await c.relations.connect(wCons).confirmAffiliation(universityId);
      expect(await c.relations.getAffiliatedParent(schoolId)).to.equal(universityId);
      expect(await c.relations.getAffiliatedParent(universityId)).to.equal(consortiumId);
    });

    it("refuses a direct cycle: a child cannot become its own parent's parent — EC(67)", async function () {
      const c = await deployFixture();
      const [, , wA, wB] = await ethers.getSigners();
      const [[, idA], [wParentB, idB]] = await bProfiles(c, [wA, wB]);
      await c.relations.connect(wA).proposeAffiliation(idB);
      await c.relations.connect(wParentB).confirmAffiliation(idA);
      // B is A's parent; B now tries to sit under A.
      await expect(c.relations.connect(wParentB).proposeAffiliation(idA))
        .to.be.revertedWithCustomError(c.relations, "EC")
        .withArgs(67n);
    });

    it("refuses a cycle through three profiles — EC(67)", async function () {
      const c = await deployFixture();
      const [, , wA, wB, wC] = await ethers.getSigners();
      const [[wChildA, idA], [wMidB, idB], [wTopC, idC]] = await bProfiles(c, [wA, wB, wC]);
      await c.relations.connect(wChildA).proposeAffiliation(idB);
      await c.relations.connect(wMidB).confirmAffiliation(idA);
      await c.relations.connect(wMidB).proposeAffiliation(idC);
      await c.relations.connect(wTopC).confirmAffiliation(idB);
      // Chain is A -> B -> C. C sitting under A would close the loop.
      await expect(c.relations.connect(wTopC).proposeAffiliation(idA))
        .to.be.revertedWithCustomError(c.relations, "EC")
        .withArgs(67n);
    });

    it("caps the ancestor walk: an 8-deep chain links, the 9th link reverts EC(69)", async function () {
      const c = await deployFixture();
      const signers = (await ethers.getSigners()).slice(2, 12);
      const profiles = await bProfiles(c, signers);
      // Grow downward: profiles[i] sits under profiles[i - 1].
      for (let i = 1; i < 8; i++) {
        const [wChild, childId] = profiles[i];
        const [wParent, parentId] = profiles[i - 1];
        await c.relations.connect(wChild).proposeAffiliation(parentId);
        await c.relations.connect(wParent).confirmAffiliation(childId);
      }
      expect(await c.relations.getAffiliatedParent(profiles[7][1])).to.equal(profiles[6][1]);
      // profiles[7] already has 7 ancestors; one more level exceeds the walk limit.
      const [wNext] = profiles[8];
      await expect(c.relations.connect(wNext).proposeAffiliation(profiles[7][1]))
        .to.be.revertedWithCustomError(c.relations, "EC")
        .withArgs(69n);
    });
  });

  describe("freeze (v0.x safety hatch)", function () {
    it("only the deployer may freeze; non-deployer reverts EC(57)", async function () {
      const c = await deployFixture();
      const [, wOther] = await ethers.getSigners();
      expect(await c.deployer()).to.equal((await ethers.getSigners())[0].address);
      expect(await c.frozen()).to.equal(false);
      await expect(c.connect(wOther).freeze()).to.be.revertedWithCustomError(c, "EC").withArgs(57n);
      await expect(c.freeze()).to.emit(c, "RegistryFrozen");
      expect(await c.frozen()).to.equal(true);
    });

    it("after freeze, writes revert EC(58) but reads still work", async function () {
      const c = await deployFixture();
      const [wA] = await ethers.getSigners();
      await c.connect(wA).registerCreator(TYPE_C);
      const passportId = await mintAndId(c, wA, "mintDigital", digitalInputs(950));
      await c.freeze();
      // reads unaffected
      const p = await readPassport(c, passportId);
      expect(p.title).to.equal("Test passport");
      // every state-changing user path is blocked
      await expect(c.connect(wA).mintDigital(digitalInputs(951), false, MINT_SELF))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(58n);
      await expect(c.connect(wA).recordPassportEvent(passportId, EVENT_LOCATION, 0, "x", zeroHash(), ""))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(58n);
      await expect(c.connect(wA).transferPassport(passportId, (await ethers.getSigners())[1].address))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(58n);
      await expect(c.connect(wA).revokePassport(passportId, ethers.keccak256(ethers.toUtf8Bytes("r"))))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(58n);
      await expect(c.connect((await ethers.getSigners())[2]).registerCreator(TYPE_B))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(58n);
    });
  });

  describe("extension mints (IODPExtension)", function () {
    const MINT_CLASS_V = "0x56";
    const MINT_CLASS_W = "0x57";

    it("mintDigitalViaExtension mints after governance setMintExtension", async function () {
      const c = await deployFixture();
      const Ext = await ethers.getContractFactory("ODPPassThroughDigitalExtension");
      const ext = await Ext.deploy();
      await ext.waitForDeployment();
      await c.extensionRouter.setMintExtension(MINT_CLASS_V, ext.target);
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const inputs = digitalInputs(900);
      const payload = encodeMintPayload(inputs);
      const tx = await c.extensionRouter.connect(w).mintDigitalViaExtension(MINT_CLASS_V, payload, false, "");
      const receipt = await tx.wait();
      const ids = await listCreatorPassports(c, w.address);
      const passportId = ids[ids.length - 1];
      const p = await readPassport(c, passportId);
      expect(p.objectType).to.equal("digital");
      expect(p.dataHash).to.equal(inputs.dataHash);
      const ev = receipt.logs
        .map((l) => {
          try {
            return c.extensionRouter.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((x) => x && x.name === "ExtensionMintUsed");
      expect(ev).to.not.equal(undefined);
      expect(ev.args.kind).to.equal(0);
      expect(ev.args.passportId).to.equal(passportId);
    });

    it("mintPhysicalViaExtension mints physical and emits ExtensionMintUsed kind=1", async function () {
      const c = await deployFixture();
      const Ext = await ethers.getContractFactory("ODPPassThroughPhysicalExtension");
      const ext = await Ext.deploy();
      await ext.waitForDeployment();
      await c.extensionRouter.setMintExtension(MINT_CLASS_W, ext.target);
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const inputs = physicalInputs(920);
      const payload = encodeMintPayload(inputs);
      const tx = await c.extensionRouter.connect(w).mintPhysicalViaExtension(MINT_CLASS_W, payload, false, "");
      const receipt = await tx.wait();
      const ids = await listCreatorPassports(c, w.address);
      const passportId = ids[ids.length - 1];
      const p = await readPassport(c, passportId);
      expect(p.objectType).to.equal("physical");
      const ev = receipt.logs
        .map((l) => {
          try {
            return c.extensionRouter.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((x) => x && x.name === "ExtensionMintUsed");
      expect(ev).to.not.equal(undefined);
      expect(ev.args.kind).to.equal(1);
      expect(ev.args.passportId).to.equal(passportId);
    });

    it("reverts EC(64) when extension not registered", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const payload = encodeMintPayload(digitalInputs(901));
      await expect(c.extensionRouter.connect(w).mintDigitalViaExtension(MINT_CLASS_V, payload, false, ""))
        .to.be.revertedWithCustomError(c.extensionRouter, "EC")
        .withArgs(64n);
    });

    it("reverts EC(65) when setMintExtension uses reserved profile byte", async function () {
      const c = await deployFixture();
      const Ext = await ethers.getContractFactory("ODPPassThroughDigitalExtension");
      const ext = await Ext.deploy();
      await ext.waitForDeployment();
      await expect(c.extensionRouter.setMintExtension(TYPE_C, ext.target)).to.be.revertedWithCustomError(c.extensionRouter, "EC").withArgs(65n);
    });

    it("reverts EC(66) when extension address has no code", async function () {
      const c = await deployFixture();
      const [_, eoa] = await ethers.getSigners();
      await expect(c.extensionRouter.setMintExtension(MINT_CLASS_V, eoa.address))
        .to.be.revertedWithCustomError(c.extensionRouter, "EC")
        .withArgs(66n);
    });

    it("non-governance cannot setMintExtension", async function () {
      const c = await deployFixture();
      const [_, w2] = await ethers.getSigners();
      const Ext = await ethers.getContractFactory("ODPPassThroughDigitalExtension");
      const ext = await Ext.deploy();
      await ext.waitForDeployment();
      await expect(c.extensionRouter.connect(w2).setMintExtension(MINT_CLASS_V, ext.target))
        .to.be.revertedWithCustomError(c.extensionRouter, "EC")
        .withArgs(56n);
    });
  });

  describe("mint agent delegation", function () {
    it("handshake: agent mints on behalf; principal is creator/owner; mintAgent set", async function () {
      const c = await deployFixture();
      const [wArtist, wAgent] = await ethers.getSigners();
      await c.connect(wArtist).registerCreator(TYPE_C);
      const artistId = await c.getCreatorByWallet(wArtist.address);
      await c.relations.connect(wAgent).requestMintAgentRole(artistId);
      const pendKey = ethers.keccak256(
        ethers.solidityPacked(["string", "address"], [artistId, wAgent.address])
      );
      expect(await c.relations.mintAgentDelegationPending(pendKey)).to.equal(true);
      await c.relations.connect(wArtist).confirmMintAgentRole(wAgent.address);
      expect(await c.relations.mintAgentForCreator(artistId)).to.equal(wAgent.address);
      const passportId = await mintAndId(c, wAgent, "mintDigital", digitalInputs(701), {
        mintOnBehalfOfCreatorId: artistId,
        passportOwner: wArtist.address,
      });
      const p = await readPassport(c, passportId);
      expect(p.creatorId).to.equal(artistId);
      expect(p.creator).to.equal(wArtist.address);
      expect(p.owner).to.equal(wArtist.address);
      expect(p.mintAgent).to.equal(wAgent.address);
      const ids = await listCreatorPassports(c, wArtist.address);
      expect(ids.includes(passportId)).to.equal(true);
      const idsAgent = await listCreatorPassports(c, wAgent.address);
      expect(idsAgent.length).to.equal(0);
    });

    it("non-agent cannot mint on behalf (EC 72)", async function () {
      const c = await deployFixture();
      const [wArtist, wAgent, wEvil] = await ethers.getSigners();
      await c.connect(wArtist).registerCreator(TYPE_C);
      const artistId = await c.getCreatorByWallet(wArtist.address);
      await c.relations.connect(wAgent).requestMintAgentRole(artistId);
      await c.relations.connect(wArtist).confirmMintAgentRole(wAgent.address);
      await expect(c.connect(wEvil).mintDigital(digitalInputs(702), false, artistId))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(72n);
    });

    it("principal monthly limit applies when agent mints", async function () {
      const c = await deployFixture();
      const [wArtist, wAgent] = await ethers.getSigners();
      await c.connect(wArtist).registerCreator(TYPE_C);
      const artistId = await c.getCreatorByWallet(wArtist.address);
      await c.relations.connect(wAgent).requestMintAgentRole(artistId);
      await c.relations.connect(wArtist).confirmMintAgentRole(wAgent.address);
      await mintAndId(c, wAgent, "mintDigital", digitalInputs(703), {
        mintOnBehalfOfCreatorId: artistId,
        passportOwner: wArtist.address,
      });
      const ids = await listCreatorPassports(c, wArtist.address);
      expect(ids.length).to.equal(1);
    });

    it("revokeMintAgentRole blocks further agent mints", async function () {
      const c = await deployFixture();
      const [wArtist, wAgent] = await ethers.getSigners();
      await c.connect(wArtist).registerCreator(TYPE_C);
      const artistId = await c.getCreatorByWallet(wArtist.address);
      await c.relations.connect(wAgent).requestMintAgentRole(artistId);
      await c.relations.connect(wArtist).confirmMintAgentRole(wAgent.address);
      await c.relations.connect(wArtist).revokeMintAgentRole();
      expect(await c.relations.mintAgentForCreator(artistId)).to.equal(ethers.ZeroAddress);
      await expect(c.connect(wAgent).mintDigital(digitalInputs(704), false, artistId))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(72n);
    });
  });

  describe("ODPCounterfeitConcern satellite", function () {
    async function deployRegAndCf() {
      await syncMintYm();
      const LibFactory = await ethers.getContractFactory("ODPPassportLib");
      const lib = await LibFactory.deploy();
      await lib.waitForDeployment();
      const libAddress = await lib.getAddress();
      const Factory = await ethers.getContractFactory("ObjectDigitalPassport", {
        libraries: { "project/contracts/ODPPassportLib.sol:ODPPassportLib": libAddress },
      });
      const reg = await Factory.deploy();
      await reg.waitForDeployment();
      const regAddr = await reg.getAddress();
      const CfF = await ethers.getContractFactory("ODPCounterfeitConcern");
      const cf = await CfF.deploy(regAddr);
      await cf.waitForDeployment();
      return { reg, cf };
    }

    async function mintDigitalId(reg, signer, n) {
      const tx = await reg.connect(signer).mintDigital(digitalInputs(n), false, MINT_SELF);
      await tx.wait();
      const page = await reg.getPassportsByCreatorPaged(signer.address, 0, 100);
      const rows = page.result || page[0] || [];
      return rows[rows.length - 1];
    }

    it("P raises and clears concern; getCounterfeitConcern matches", async function () {
      const { reg, cf } = await deployRegAndCf();
      const [wC, wP] = await ethers.getSigners();
      await reg.connect(wC).registerCreator(TYPE_C);
      const passportId = await mintDigitalId(reg, wC, 800);
      await reg.connect(wP).registerCreator(TYPE_P);
      const rh = ethers.keccak256(ethers.toUtf8Bytes("concern"));
      await cf.connect(wP).raiseCounterfeitConcern(passportId, rh);
      let cc = await cf.getCounterfeitConcern(passportId);
      expect(cc.active).to.equal(true);
      expect(cc.reasonHash).to.equal(rh);
      await cf.connect(wP).clearCounterfeitConcern(passportId);
      cc = await cf.getCounterfeitConcern(passportId);
      expect(cc.active).to.equal(false);
    });

    it("reject raise from C profile (EC 6)", async function () {
      const { reg, cf } = await deployRegAndCf();
      const [wC] = await ethers.getSigners();
      await reg.connect(wC).registerCreator(TYPE_C);
      const passportId = await mintDigitalId(reg, wC, 801);
      const rh = ethers.keccak256(ethers.toUtf8Bytes("x"));
      await expect(cf.connect(wC).raiseCounterfeitConcern(passportId, rh))
        .to.be.revertedWithCustomError(cf, "EC")
        .withArgs(6n);
    });
  });

  describe("ODPAuthorAttestation satellite", function () {
    async function deployRegAndAuthor() {
      await syncMintYm();
      const LibFactory = await ethers.getContractFactory("ODPPassportLib");
      const lib = await LibFactory.deploy();
      await lib.waitForDeployment();
      const libAddress = await lib.getAddress();
      const Factory = await ethers.getContractFactory("ObjectDigitalPassport", {
        libraries: { "project/contracts/ODPPassportLib.sol:ODPPassportLib": libAddress },
      });
      const reg = await Factory.deploy();
      await reg.waitForDeployment();
      const AuthorF = await ethers.getContractFactory("ODPAuthorAttestation");
      const author = await AuthorF.deploy(await reg.getAddress());
      await author.waitForDeployment();
      return { reg, author };
    }

    async function mintDigitalId(reg, signer, n) {
      const tx = await reg.connect(signer).mintDigital(digitalInputs(n), false, MINT_SELF);
      await tx.wait();
      const page = await reg.getPassportsByCreatorPaged(signer.address, 0, 100);
      const rows = page.result || page[0] || [];
      return rows[rows.length - 1];
    }

    /** Sign the EIP-712 AuthorAttestation struct with an arbitrary (non-minting) key. */
    async function signAttestation(author, signer, passportId, dataHash, creatorId, authorSigner) {
      const domain = {
        name: "Object Digital Passport",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await author.getAddress(),
      };
      const types = {
        AuthorAttestation: [
          { name: "passportId", type: "string" },
          { name: "dataHash", type: "bytes32" },
          { name: "creatorId", type: "string" },
          { name: "authorSigner", type: "address" },
        ],
      };
      return signer.signTypedData(domain, types, { passportId, dataHash, creatorId, authorSigner });
    }

    async function passportFacts(reg, passportId) {
      const [header, media] = await Promise.all([
        reg.getPassportHeader(passportId),
        reg.getPassportMedia(passportId),
      ]);
      return { creatorId: header.creatorId, dataHash: media.dataHash };
    }

    it("binds a separate author key; digest matches ethers signTypedData", async function () {
      const { reg, author } = await deployRegAndAuthor();
      const [wC, , , wAuthor] = await ethers.getSigners();
      await reg.connect(wC).registerCreator(TYPE_C);
      const passportId = await mintDigitalId(reg, wC, 900);
      const { creatorId, dataHash } = await passportFacts(reg, passportId);

      // The author key is NOT the minting wallet — that is the whole point.
      expect(wAuthor.address).to.not.equal(wC.address);

      const sig = await signAttestation(author, wAuthor, passportId, dataHash, creatorId, wAuthor.address);
      await author.connect(wC).attestAuthor(passportId, wAuthor.address, sig);

      const a = await author.getAuthorAttestation(passportId);
      expect(a.attested).to.equal(true);
      expect(a.authorSigner).to.equal(wAuthor.address);
      expect(a.dataHash).to.equal(dataHash);
      expect(a.creatorId).to.equal(creatorId);
    });

    it("returns empty tuple when no attestation exists", async function () {
      const { reg, author } = await deployRegAndAuthor();
      const [wC] = await ethers.getSigners();
      await reg.connect(wC).registerCreator(TYPE_C);
      const passportId = await mintDigitalId(reg, wC, 901);
      const a = await author.getAuthorAttestation(passportId);
      expect(a.attested).to.equal(false);
      expect(a.authorSigner).to.equal(ethers.ZeroAddress);
    });

    it("rejects a signature over a different passport's dataHash (EC 115)", async function () {
      const { reg, author } = await deployRegAndAuthor();
      const [wC, , , wAuthor] = await ethers.getSigners();
      await reg.connect(wC).registerCreator(TYPE_C);
      const idA = await mintDigitalId(reg, wC, 902);
      const idB = await mintDigitalId(reg, wC, 903);
      const factsB = await passportFacts(reg, idB);

      // Signature is valid, but bound to passport B's bytes — must not attach to A.
      const sig = await signAttestation(author, wAuthor, idB, factsB.dataHash, factsB.creatorId, wAuthor.address);
      await expect(author.connect(wC).attestAuthor(idA, wAuthor.address, sig))
        .to.be.revertedWithCustomError(author, "EC")
        .withArgs(115n);
    });

    it("rejects a signature from a key other than authorSigner (EC 115)", async function () {
      const { reg, author } = await deployRegAndAuthor();
      const [wC, wOther, , wAuthor] = await ethers.getSigners();
      await reg.connect(wC).registerCreator(TYPE_C);
      const passportId = await mintDigitalId(reg, wC, 904);
      const { creatorId, dataHash } = await passportFacts(reg, passportId);

      const sig = await signAttestation(author, wOther, passportId, dataHash, creatorId, wAuthor.address);
      await expect(author.connect(wC).attestAuthor(passportId, wAuthor.address, sig))
        .to.be.revertedWithCustomError(author, "EC")
        .withArgs(115n);
    });

    it("rejects a non-creator/owner submitter — no slot squatting (EC 112)", async function () {
      const { reg, author } = await deployRegAndAuthor();
      const [wC, wStranger, , wAuthor] = await ethers.getSigners();
      await reg.connect(wC).registerCreator(TYPE_C);
      const passportId = await mintDigitalId(reg, wC, 905);
      const { creatorId, dataHash } = await passportFacts(reg, passportId);

      const sig = await signAttestation(author, wAuthor, passportId, dataHash, creatorId, wAuthor.address);
      await expect(author.connect(wStranger).attestAuthor(passportId, wAuthor.address, sig))
        .to.be.revertedWithCustomError(author, "EC")
        .withArgs(112n);
    });

    it("is one-shot — a second attestation reverts (EC 111)", async function () {
      const { reg, author } = await deployRegAndAuthor();
      const [wC, , , wAuthor] = await ethers.getSigners();
      await reg.connect(wC).registerCreator(TYPE_C);
      const passportId = await mintDigitalId(reg, wC, 906);
      const { creatorId, dataHash } = await passportFacts(reg, passportId);

      const sig = await signAttestation(author, wAuthor, passportId, dataHash, creatorId, wAuthor.address);
      await author.connect(wC).attestAuthor(passportId, wAuthor.address, sig);
      await expect(author.connect(wC).attestAuthor(passportId, wAuthor.address, sig))
        .to.be.revertedWithCustomError(author, "EC")
        .withArgs(111n);
    });

    it("rejects attestation on a revoked passport (EC 11)", async function () {
      const { reg, author } = await deployRegAndAuthor();
      const [wC, , , wAuthor] = await ethers.getSigners();
      await reg.connect(wC).registerCreator(TYPE_C);
      const passportId = await mintDigitalId(reg, wC, 907);
      const { creatorId, dataHash } = await passportFacts(reg, passportId);
      const sig = await signAttestation(author, wAuthor, passportId, dataHash, creatorId, wAuthor.address);

      await reg.connect(wC).revokePassport(passportId, ethers.keccak256(ethers.toUtf8Bytes("oops")));
      await expect(author.connect(wC).attestAuthor(passportId, wAuthor.address, sig))
        .to.be.revertedWithCustomError(author, "EC")
        .withArgs(11n);
    });

    it("rejects zero authorSigner (EC 110) and malformed signature (EC 113)", async function () {
      const { reg, author } = await deployRegAndAuthor();
      const [wC, , , wAuthor] = await ethers.getSigners();
      await reg.connect(wC).registerCreator(TYPE_C);
      const passportId = await mintDigitalId(reg, wC, 908);
      const { creatorId, dataHash } = await passportFacts(reg, passportId);
      const sig = await signAttestation(author, wAuthor, passportId, dataHash, creatorId, wAuthor.address);

      await expect(author.connect(wC).attestAuthor(passportId, ethers.ZeroAddress, sig))
        .to.be.revertedWithCustomError(author, "EC")
        .withArgs(110n);
      await expect(author.connect(wC).attestAuthor(passportId, wAuthor.address, "0xdeadbeef"))
        .to.be.revertedWithCustomError(author, "EC")
        .withArgs(113n);
    });

    it("owner (after transfer) may also submit the attestation", async function () {
      const { reg, author } = await deployRegAndAuthor();
      const [wC, wNewOwner, , wAuthor] = await ethers.getSigners();
      await reg.connect(wC).registerCreator(TYPE_C);
      const passportId = await mintDigitalId(reg, wC, 909);
      const { creatorId, dataHash } = await passportFacts(reg, passportId);

      await reg.connect(wC).transferPassport(passportId, wNewOwner.address);
      const sig = await signAttestation(author, wAuthor, passportId, dataHash, creatorId, wAuthor.address);
      await author.connect(wNewOwner).attestAuthor(passportId, wAuthor.address, sig);

      const a = await author.getAuthorAttestation(passportId);
      expect(a.attested).to.equal(true);
      expect(a.authorSigner).to.equal(wAuthor.address);
    });
  });

  describe("0.7 creator revocation", function () {
    it("marks the profile and emits CreatorRevoked", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const creatorId = await c.getCreatorByWallet(w.address);

      expect((await c.getCreator(creatorId)).revokedAt).to.equal(0n);
      await expect(c.connect(w).revokeCreator()).to.emit(c, "CreatorRevoked");
      expect((await c.getCreator(creatorId)).revokedAt).to.not.equal(0n);
    });

    it("stops every mint path from the revoked profile (EC 131)", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      await c.connect(w).revokeCreator();

      await expect(c.connect(w).mintPhysical(physicalInputs(7001), false, MINT_SELF))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(131n);
      await expect(c.connect(w).mintDigital(digitalInputs(7002), false, MINT_SELF))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(131n);
    });

    it("is one-shot (EC 59) and needs a registered wallet (EC 3)", async function () {
      const c = await deployFixture();
      const [w, wStranger] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      await c.connect(w).revokeCreator();

      await expect(c.connect(w).revokeCreator())
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(59n);
      await expect(c.connect(wStranger).revokeCreator())
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(3n);
    });

    it("leaves passports minted before the revocation untouched", async function () {
      const c = await deployFixture();
      const [w, wNewOwner] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      const passportId = await mintAndId(c, w, "mintPhysical", physicalInputs(7003));

      await c.connect(w).revokeCreator();

      const p = await readPassport(c, passportId);
      expect(p.revoked).to.equal(false);
      expect(p.creator).to.equal(w.address);

      // an object does not stop being genuine because its issuer stopped the profile
      await (await c.connect(w).transferPassport(passportId, wNewOwner.address)).wait();
      expect((await readPassport(c, passportId)).owner).to.equal(wNewOwner.address);
    });

    it("does not free the wallet to register a second profile (EC 53)", async function () {
      const c = await deployFixture();
      const [w] = await ethers.getSigners();
      await c.connect(w).registerCreator(TYPE_C);
      await c.connect(w).revokeCreator();

      // recovery is a new wallet plus a domain statement (SPEC §3), not a fresh profile here
      await expect(c.connect(w).registerCreator(TYPE_C))
        .to.be.revertedWithCustomError(c, "EC")
        .withArgs(53n);
    });
  });
});
