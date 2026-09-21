/**
 * @file ODPPassportLib — UTC calendar from Unix timestamp (Gregorian, UTC).
 */
import { expect } from "chai";
import hre from "hardhat";

const { ethers } = await hre.network.connect();

describe("ODPPassportLib.utcYearMonthFromTimestamp", function () {
  let lib;

  before(async function () {
    const LibFactory = await ethers.getContractFactory("ODPPassportLib");
    lib = await LibFactory.deploy();
    await lib.waitForDeployment();
  });

  async function ym(ts) {
    return lib.utcYearMonthFromTimestamp(ts);
  }

  it("1970-01-01 00:00:00 UTC → 1970-01", async function () {
    const r = await ym(0n);
    expect(r.year).to.equal(1970n);
    expect(r.month).to.equal(1n);
  });

  it("1970-01-01 23:59:59 UTC → 1970-01", async function () {
    const r = await ym(86399n);
    expect(r.year).to.equal(1970n);
    expect(r.month).to.equal(1n);
  });

  it("1970-01-02 00:00:00 UTC → 1970-01 day 2 (still January)", async function () {
    const r = await ym(86400n);
    expect(r.year).to.equal(1970n);
    expect(r.month).to.equal(1n);
  });

  it("1971-01-01 00:00:00 UTC → 1971-01", async function () {
    const ts = BigInt(Math.floor(Date.parse("1971-01-01T00:00:00.000Z") / 1000));
    const r = await ym(ts);
    expect(r.year).to.equal(1971n);
    expect(r.month).to.equal(1n);
  });

  it("2000-02-29 UTC → 2000-02 (leap day)", async function () {
    const ts = BigInt(Math.floor(Date.parse("2000-02-29T12:00:00.000Z") / 1000));
    const r = await ym(ts);
    expect(r.year).to.equal(2000n);
    expect(r.month).to.equal(2n);
  });

  it("2001-02-28 UTC → 2001-02 (non-leap)", async function () {
    const ts = BigInt(Math.floor(Date.parse("2001-02-28T23:59:59.000Z") / 1000));
    const r = await ym(ts);
    expect(r.year).to.equal(2001n);
    expect(r.month).to.equal(2n);
  });

  it("2026-03-15 UTC → 2026-03", async function () {
    const ts = BigInt(Math.floor(Date.parse("2026-03-15T12:00:00.000Z") / 1000));
    const r = await ym(ts);
    expect(r.year).to.equal(2026n);
    expect(r.month).to.equal(3n);
  });

  it("last second of year → December", async function () {
    const ts = BigInt(Math.floor(Date.parse("2024-12-31T23:59:59.000Z") / 1000));
    const r = await ym(ts);
    expect(r.year).to.equal(2024n);
    expect(r.month).to.equal(12n);
  });
});
