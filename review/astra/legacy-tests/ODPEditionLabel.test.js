/**
 * Pins the §20.7 label payload against Solidity.
 *
 * The bytes a verifier hashes and the bytes the contract publishes must be identical, or a
 * genuine label reads as forged. This used to load the reference website's own module and
 * compare the two directly; the website is a separate repository now, so instead the payload
 * is constructed here from the specification text and asserted against the contract. Any
 * implementation that produces these bytes agrees with the contract — which is the property
 * that actually matters, and it no longer requires one repository to read the other's source.
 */
import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

/** SPEC §20.7, written out field by field rather than imported from anywhere. */
function odpLabelPayloadHash(chainId, unitsAddress, editionPassportId, unitIndex, merkleRoot) {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["string", "uint256", "address", "string", "uint32", "bytes32"],
      ["ODP-UNIT-LABEL-v1", BigInt(chainId), unitsAddress, editionPassportId, unitIndex, merkleRoot],
    ),
  );
}

/** The reader side of §20.7: recover, and compare with the key the edition published. */
function odpVerifyLabelSignature(o) {
  if (!o.labelSigner) return "unsigned_edition";
  if (!o.signature) return "absent";
  if (!o.merkleRoot || o.unitIndex == null || !o.unitsAddress || o.chainId == null) return "unknown";
  try {
    const digest = odpLabelPayloadHash(o.chainId, o.unitsAddress, o.editionPassportId, o.unitIndex, o.merkleRoot);
    const recovered = ethers.verifyMessage(ethers.getBytes(digest), o.signature);
    return String(recovered).toLowerCase() === String(o.labelSigner).toLowerCase() ? "valid" : "invalid";
  } catch {
    return "invalid";
  }
}

describe("signed outer labels — payload pinned against Solidity (§20.7)", function () {
  async function openedEdition() {
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

    const [brand] = await ethers.getSigners();
    await (await reg.connect(brand).registerCreator("0x42")).wait();
    const b = await ethers.provider.getBlock("latest");
    const d = new Date(b.timestamp * 1000);
    await (
      await reg.connect(brand).mintPhysical(
        {
          core: {
            year: d.getUTCFullYear(), month: d.getUTCMonth() + 1,
            title: "Label edition", authorName: "Vectors", shortDescription: "labels", domain: "",
            contentClass: 1, lifecycleStatus: 3, aiStatus: 1, verificationMethod: 1, editionModel: 2,
          },
          dataHash: ethers.keccak256(ethers.toUtf8Bytes("d")),
          dataUrl: "", imageHash: ethers.keccak256(ethers.toUtf8Bytes("i")), imageUrl: "",
          fileHash: ethers.ZeroHash, anchorsHash: ethers.keccak256(ethers.toUtf8Bytes("a")),
          anchorTypesMask: 1 | 2 | 4 | 8 | 4096, initialOwner: ethers.ZeroAddress,
        },
        false, "",
      )
    ).wait();
    const [ids] = await reg.getPassportsByCreatorPaged(brand.address, 0, 10);
    const editionId = ids[ids.length - 1];

    const root = ethers.keccak256(ethers.toUtf8Bytes("root-for-labels"));
    const signer = new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes("label-key")));
    await (await units.connect(brand).openEdition(editionId, root, 10, signer.address)).wait();
    const { chainId } = await ethers.provider.getNetwork();
    return { units, editionId, root, signer, chainId: Number(chainId) };
  }

  it("the specified payload hash equals the contract's", async function () {
    const { units, editionId, root, chainId } = await openedEdition();
    for (const idx of [0, 1, 9]) {
      expect(odpLabelPayloadHash(chainId, units.target, editionId, idx, root))
        .to.equal(await units.labelPayloadHash(editionId, idx));
    }
  });

  it("accepts the issuer's signature and rejects a forger's", async function () {
    const { units, editionId, root, signer, chainId } = await openedEdition();
    const base = { chainId, unitsAddress: units.target, editionPassportId: editionId, unitIndex: 3, merkleRoot: root, labelSigner: signer.address };
    const digest = await units.labelPayloadHash(editionId, 3);

    expect(odpVerifyLabelSignature({ ...base, signature: await signer.signMessage(ethers.getBytes(digest)) })).to.equal("valid");

    const forger = new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes("forger")));
    expect(odpVerifyLabelSignature({ ...base, signature: await forger.signMessage(ethers.getBytes(digest)) })).to.equal("invalid");
  });

  it("a label cannot be moved to another unit", async function () {
    const { units, editionId, root, signer, chainId } = await openedEdition();
    const sig = await signer.signMessage(ethers.getBytes(await units.labelPayloadHash(editionId, 1)));
    expect(
      odpVerifyLabelSignature({
        chainId, unitsAddress: units.target, editionPassportId: editionId,
        unitIndex: 2, merkleRoot: root, labelSigner: signer.address, signature: sig,
      }),
    ).to.equal("invalid");
  });

  it("garbage in the signature slot is invalid, never a crash", async function () {
    const { units, editionId, root, signer, chainId } = await openedEdition();
    expect(
      odpVerifyLabelSignature({
        chainId, unitsAddress: units.target, editionPassportId: editionId,
        unitIndex: 0, merkleRoot: root, labelSigner: signer.address, signature: "0xdeadbeef",
      }),
    ).to.equal("invalid");
  });
});
