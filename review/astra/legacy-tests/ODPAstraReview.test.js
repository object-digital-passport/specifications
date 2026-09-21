/** Independent counterexamples on unchanged 5d1db8f contracts. Local EDR only.
 * Positive tests document existing behaviour, not correctness of the proposed rewrite.
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

describe("Astra independent counterexamples", function () {
  it("R01: wiring the router alone does not enable the A1 exploit", async function () {
    const {reg, libAddress} = await deployRegistry();
    const [, victim] = await ethers.getSigners();
    const router = await (await ethers.getContractFactory("ODPExtensionMintRouter", {libraries:{[LIB_KEY]:libAddress}})).deploy(reg.target);
    await reg.setExtensionRouter(router.target);
    await reg.connect(victim).registerCreator(TYPE_C);
    const probe = await (await ethers.getContractFactory("ODPAuditOriginProbe")).deploy();
    const payload = ethers.AbiCoder.defaultAbiCoder().encode([MINT_INPUTS_TYPE], [await digitalInputs(1)]);
    const data = router.interface.encodeFunctionData("mintDigitalViaExtension", ["0x58", payload, false, ""]);
    await expect(probe.connect(victim).doSomethingHarmlessLooking(router.target, data)).to.be.revertedWithCustomError(router,"EC").withArgs(64n);
  });
  it("R02: after H1 the holder can sign for a fresh owner and then transfer to the original buyer", async function () {
    const {reg, units, brand, editionId, keys, levels} = await deployEditionWorld(2);
    const [, , buyer, attacker, fresh] = await ethers.getSigners();
    const proof = proofFor(levels,0), key = keys[0];
    await units.activate(editionId,0,proof,await key.signMessage(ethers.getBytes(await units.activationPayloadHash(editionId,0))));
    const sig = await key.signMessage(ethers.getBytes(await units.mintPayloadHash(editionId,0,buyer.address)));
    await units.connect(attacker).mintUnitPassport(editionId,0,buyer.address,proof,sig,await physicalInputs(2),false);
    await expect(units.connect(buyer).mintUnitPassport(editionId,0,buyer.address,proof,sig,await physicalInputs(3),false)).to.be.revertedWithCustomError(units,"EC").withArgs(129n);
    const freshSig=await key.signMessage(ethers.getBytes(await units.mintPayloadHash(editionId,0,fresh.address)));
    await units.connect(buyer).mintUnitPassport(editionId,0,fresh.address,proof,freshSig,await physicalInputs(4),false);
    const id=(await units.getUnitPassports(editionId,0))[1];
    await reg.connect(fresh).transferPassport(id,buyer.address);
    expect((await reg.getPassportHeader(id)).owner).eq(buyer.address);
  });
  it("R03: D1 omitted the second institution; it really is blocked, but proofs remain available", async function () {
    const {reg,libAddress}=await deployRegistry();
    const cf=await (await ethers.getContractFactory("ODPCounterfeitConcern")).deploy(reg.target);
    const proofs=await (await ethers.getContractFactory("ODPPassportProofRegistry",{libraries:{[LIB_KEY]:libAddress}})).deploy(reg.target);
    const [, artist, a, b]=await ethers.getSigners();
    await reg.connect(artist).registerCreator(TYPE_C);
    await reg.connect(artist).mintPhysical(await physicalInputs(1),false,"");
    const id=await lastPassportOf(reg,artist.address);
    for(const w of [a,b]) await reg.connect(w).registerCreator(TYPE_P);
    await cf.connect(a).raiseCounterfeitConcern(id,h("r",1));
    await expect(cf.connect(b).raiseCounterfeitConcern(id,h("r",2))).to.be.revertedWithCustomError(cf,"EC").withArgs(80n);
    const {year,month}=await ym();
    await proofs.connect(b).submitProof(id,h("proof",1),"",year,month);
    expect((await proofs.getProofsForPassport(id)).length).eq(1);
  });
  it("R04: edition opening and activation accept a revoked passport; arbitrary roots are not checked against anchors", async function () {
    const {reg}=await deployRegistry(); const [,brand]=await ethers.getSigners();
    await reg.connect(brand).registerCreator(TYPE_B);
    await reg.connect(brand).mintPhysical(await physicalInputs(1),false,"");
    const id=await lastPassportOf(reg,brand.address);
    await reg.connect(brand).revokePassport(id,h("r",1));
    const units=await (await ethers.getContractFactory("ODPEditionUnits")).deploy(reg.target);
    await reg.setEditionUnits(units.target);
    const key=unitWallets(1)[0];
    await units.connect(brand).openEdition(id,unitLeaf(0,key.address),1,ethers.ZeroAddress);
    await units.activate(id,0,[],await key.signMessage(ethers.getBytes(await units.activationPayloadHash(id,0))));
    expect(await units.isActivated(id,0)).eq(true);
    expect((await reg.getPassportClassification(id)).revoked).eq(true);
  });
  it("R05: activation content is sender independent, but timestamp is not delay independent", async function () {
    const {units,editionId,keys,levels}=await deployEditionWorld(2);
    const [, , a,b]=await ethers.getSigners();
    const sig=await keys[0].signMessage(ethers.getBytes(await units.activationPayloadHash(editionId,0)));
    const proof=proofFor(levels,0), snap=await ethers.provider.send("evm_snapshot",[]);
    await units.connect(a).activate(editionId,0,proof,sig);
    const first=await units.getActivation(editionId,0);
    await ethers.provider.send("evm_revert",[snap]);
    await ethers.provider.send("evm_increaseTime",[3600]);
    await units.connect(b).activate(editionId,0,proof,sig);
    const second=await units.getActivation(editionId,0);
    expect(second.unitAddress).eq(first.unitAddress);
    expect(second.timestamp).greaterThan(first.timestamp);
  });
  it("R06: this all-pure library runtime equals the artifact (self-address hypothesis rejected)", async function () {
    const {libAddress}=await deployRegistry();
    const {artifacts}=await import("hardhat");
    const artifact=await artifacts.readArtifact("ODPPassportLib");
    const code=await ethers.provider.getCode(libAddress);
    expect(code).eq(artifact.deployedBytecode);
  });
  it("R07: decoding a four-field CreatorRecord as five does not safely default revokedAt to zero", async function () {
    const coder=ethers.AbiCoder.defaultAbiCoder();
    const raw=coder.encode(["tuple(string,address,bytes1,uint256)"],[["C-482-930-174-005",ethers.ZeroAddress,"0x43",123]]);
    const decoded=coder.decode(["tuple(string,address,bytes1,uint256,uint256)"],raw)[0];
    expect(decoded[4]).eq(17n); // reads the string length as the fifth field
  });
  it("R08: stopped profile still writes wallet anchors and self-chosen author attestations", async function () {
    const {reg}=await deployRegistry(); const [,artist]=await ethers.getSigners();
    await reg.connect(artist).registerCreator(TYPE_C);
    await reg.connect(artist).mintPhysical(await physicalInputs(1),false,"");
    const id=await lastPassportOf(reg,artist.address);
    await reg.connect(artist).revokeCreator();
    const a=await (await ethers.getContractFactory("ODPWalletDocumentAnchor")).deploy(reg.target);
    await a.connect(artist).attestExternalDocument(h("doc",1),"");
    const author=await (await ethers.getContractFactory("ODPAuthorAttestation")).deploy(reg.target);
    const key=unitWallets(1)[0], cid=await reg.getCreatorByWallet(artist.address);
    const dh=(await reg.getPassportMedia(id)).dataHash;
    const sig=key.signingKey.sign(await author.hashAuthorAttestation(id,dh,cid,key.address)).serialized;
    await author.connect(artist).attestAuthor(id,key.address,sig);
    expect((await author.getAuthorAttestation(id)).attested).eq(true);
  });
  it("R09: existing pagination gas depends on page size, not total; huge limit can overflow", async function () {
    const {reg}=await deployRegistry(); const [,artist]=await ethers.getSigners();
    await reg.connect(artist).registerCreator(TYPE_C);
    for(let i=0;i<3;i++) await reg.connect(artist).mintPhysical(await physicalInputs(i),false,"");
    await expect(reg.getPassportsByCreatorPaged(artist.address,1,ethers.MaxUint256)).to.be.revertedWithPanic(0x11);
    // Synthetic stress fixture: mapping(address=>string[]) is storage slot 6.
    // Change only array length; page 0 still contains real entries.
    const slot=ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address","uint256"],[artist.address,6]));
    expect(BigInt(await ethers.provider.getStorage(reg.target,slot))).eq(3n);
    const before=await reg.getPassportsByCreatorPaged.estimateGas(artist.address,0,2);
    await ethers.provider.send("hardhat_setStorageAt",[reg.target,slot,ethers.toBeHex(1_000_000,32)]);
    const after=await reg.getPassportsByCreatorPaged.estimateGas(artist.address,0,2);
    expect(after).eq(before);
    console.log("ASTRA page(2) gas total=3 and synthetic total=1000000:",String(before));
  });
  it("R10: gas receipts for the old code (not the unimplemented concerns design)", async function () {
    const {reg, units,brand,editionId,keys,levels}=await deployEditionWorld(2);
    const [, , inst]=await ethers.getSigners();
    const registration=await (await reg.connect(inst).registerCreator(TYPE_P)).wait();
    const mint=await (await reg.connect(brand).mintPhysical(await physicalInputs(77),false,"")).wait();
    const cf=await (await ethers.getContractFactory("ODPCounterfeitConcern")).deploy(reg.target);
    const concern=await (await cf.connect(inst).raiseCounterfeitConcern(editionId,h("r",1))).wait();
    const gas=[];
    for(let i=0;i<2;i++) gas.push((await (await units.activate(editionId,i,proofFor(levels,i),await keys[i].signMessage(ethers.getBytes(await units.activationPayloadHash(editionId,i))))).wait()).gasUsed.toString());
    await reg.connect(brand).mintPhysical(await physicalInputs(78),false,"");
    const id5000=await lastPassportOf(reg,brand.address);
    const addresses=Array.from({length:5000},(_,i)=>i<2?keys[i].address:ethers.getAddress("0x"+h("public-address",i).slice(-40)));
    const tree5000=buildTree(addresses.map((a,i)=>unitLeaf(i,a)));
    const opened5000=await (await units.connect(brand).openEdition(id5000,tree5000.root,5000,ethers.ZeroAddress)).wait();
    const gas5000=[];
    for(let i=0;i<2;i++) gas5000.push((await (await units.activate(id5000,i,proofFor(tree5000.levels,i),await keys[i].signMessage(ethers.getBytes(await units.activationPayloadHash(id5000,i))))).wait()).gasUsed.toString());
    console.log("ASTRA gas", JSON.stringify({registration:registration.gasUsed.toString(),mint:mint.gasUsed.toString(),oldConcern:concern.gasUsed.toString(),activationFirst:gas[0],activationNext:gas[1],open5000:opened5000.gasUsed.toString(),activation5000First:gas5000[0],activation5000Next:gas5000[1],proof5000Length:proofFor(tree5000.levels,0).length}));
  });
  it("R11: property samples reject wrong Merkle indices, addresses and siblings including odd trees", async function () {
    let rejected=0;
    for(const count of [1,2,3,5,9,17]) {
      const {units,editionId,keys,levels}=await deployEditionWorld(count);
      for(let i=0;i<count;i++) {
        const snapshot=await ethers.provider.send("evm_snapshot",[]);
        const proof=proofFor(levels,i);
        const wrongKey=new ethers.Wallet(h("wrong",i));
        const badSig=await wrongKey.signMessage(ethers.getBytes(await units.activationPayloadHash(editionId,i)));
        await expect(units.activate(editionId,i,proof,badSig)).to.be.revertedWithCustomError(units,"EC").withArgs(123n); rejected++;
        const sig=await keys[i].signMessage(ethers.getBytes(await units.activationPayloadHash(editionId,i)));
        if(proof.length) {const changed=[h("sibling",i),...proof.slice(1)];await expect(units.activate(editionId,i,changed,sig)).to.be.revertedWithCustomError(units,"EC").withArgs(123n);rejected++;}
        if(count>1) {const j=(i+1)%count;const swapped=await keys[i].signMessage(ethers.getBytes(await units.activationPayloadHash(editionId,j)));await expect(units.activate(editionId,j,proof,swapped)).to.be.revertedWithCustomError(units,"EC").withArgs(123n);rejected++;}
        await units.activate(editionId,i,proof,sig);
        await ethers.provider.send("evm_revert",[snapshot]);
      }
    }
    console.log("ASTRA Merkle rejected mutations",rejected);
  });
  it("R12: edition derivation depends on the future ID even when top-level passportId is nulled", async function () {
    function rootFor(id) {
      const ctx=Buffer.concat([Buffer.from("31337"),Buffer.from([0]),Buffer.from(id)]);
      const info=Buffer.concat([ctx,Buffer.alloc(4)]);
      const secret=Buffer.from(crypto.hkdfSync("sha256",Buffer.alloc(32,42),Buffer.alloc(0),info,32));
      const seed=Buffer.from(secret.subarray(0,13));seed[12]&=0xf0;
      const key=sha256(Buffer.from("ODP-UNIT-KEY-v1"),seed,ctx);
      return unitLeaf(0,new ethers.Wallet(key).address);
    }
    const {reg}=await deployRegistry();const [,brand]=await ethers.getSigners();
    await reg.connect(brand).registerCreator(TYPE_B);
    const {year,month}=await ym();const assumed=`ODP-${year}-${String(month).padStart(2,"0")}-000000000`;
    const rootBefore=rootFor(assumed), anchors=[{type:"unit_key_set",data:{merkleRoot:rootBefore,unitCount:1}}];
    const ah=sha256(Buffer.from(JSON.stringify(anchors)));
    await reg.connect(brand).mintPhysical(await physicalInputs(1,{anchorsHash:ah}),false,"");
    const actual=await lastPassportOf(reg,brand.address);
    expect(actual).not.eq(assumed);
    const rootAfter=rootFor(actual);
    expect(rootAfter).not.eq(rootBefore);
    const corrected=sha256(Buffer.from(JSON.stringify([{type:"unit_key_set",data:{merkleRoot:rootAfter,unitCount:1}}])));
    expect(corrected).not.eq((await reg.getPassportMedia(actual)).anchorsHash);
  });
  it("R13: private satellite addresses remain observable through storage", async function () {
    const {reg}=await deployRegistry();const [,a]=await ethers.getSigners();
    await reg.setRelationsSatellite(a.address);
    expect(await ethers.provider.getStorage(reg.target,12)).eq(ethers.zeroPadValue(a.address,32).toLowerCase());
  });

  it("R14: a second edition satellite has fresh activation state and a different signature domain", async function () {
    const {reg,units,brand,editionId,keys,levels}=await deployEditionWorld(2);
    const proof=proofFor(levels,0),sig=await keys[0].signMessage(ethers.getBytes(await units.activationPayloadHash(editionId,0)));
    await units.activate(editionId,0,proof,sig);
    const next=await (await ethers.getContractFactory("ODPEditionUnits")).deploy(reg.target);
    await next.connect(brand).openEdition(editionId,levels.at(-1)[0],2,ethers.ZeroAddress);
    expect(await next.isActivated(editionId,0)).eq(false);
    await expect(next.activate(editionId,0,proof,sig)).to.be.revertedWithCustomError(next,"EC").withArgs(123n);
    await reg.setEditionUnits(next.target); // required only by the old callback, removed in design
    await next.activate(editionId,0,proof,await keys[0].signMessage(ethers.getBytes(await next.activationPayloadHash(editionId,0))));
    expect(await units.isActivated(editionId,0)).eq(true);
    expect(await next.isActivated(editionId,0)).eq(true);
  });
  it("R15: direct mint still executes external DELEGATECALLs to the linked library", async function () {
    const {reg}=await deployRegistry();const [,w]=await ethers.getSigners();await reg.connect(w).registerCreator(TYPE_C);
    const tx=await reg.connect(w).mintPhysical(await physicalInputs(1),false,"");await tx.wait();
    const trace=await ethers.provider.send("debug_traceTransaction",[tx.hash,{disableMemory:true,disableStack:true,disableStorage:true}]);
    const calls=trace.structLogs.filter(x=>['CALL','STATICCALL','DELEGATECALL','CALLCODE'].includes(x.op));
    expect(calls.some(x=>x.op==='DELEGATECALL')).eq(true);
    console.log("ASTRA direct mint external opcodes",JSON.stringify(calls.map(x=>x.op)));
    const receipt=await tx.wait();
    const e=receipt.logs.map(l=>{try{return reg.interface.parseLog(l);}catch{return null;}}).find(x=>x?.name==='PassportMinted');
    expect(()=>reg.interface.encodeFunctionData('getPassportHeader',[e.args.passportId])).to.throw();
  });

});
