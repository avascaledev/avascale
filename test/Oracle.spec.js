const { expect, assert } = require("chai");
const { BigNumber } = require("ethers");
const { parseUnits, formatUnits } = require("ethers/lib/utils");

const { ethers } = require("hardhat");

const INFINITE_APPROVE = BigNumber.from("2").pow("256").sub("1").toString();

const getDeadlineInTimestamp = (delayInMinutes = 10) => {
  return Math.floor(
    new Date().getTime() / 1000 + delayInMinutes * 60
  ).toString();
};

describe("AvascaleOracle", function () {
  let [owner, account1] = Array(2);
  let contracts;
  let addresses;

  before(async () => {
    [owner, account1] = await ethers.getSigners();

    const WETH = await (await ethers.getContractFactory("WETH9")).deploy();
    const USDC = await (
      await ethers.getContractFactory("GenericERC20")
    ).deploy("USDC", "USDC", 6);
    const AVASCALE = await (
      await ethers.getContractFactory("GenericERC20")
    ).deploy("Avascale", "Avascale", 18);

    const UniswapV2Factory = await (
      await ethers.getContractFactory("UniswapV2Factory")
    ).deploy(owner.address);

    const UniswapV2Router02 = await (
      await ethers.getContractFactory("UniswapV2Router02")
    ).deploy(UniswapV2Factory.address, WETH.address);

    await WETH.deposit({
      value: parseUnits("2"),
    });

    await WETH.approve(UniswapV2Router02.address, INFINITE_APPROVE);
    await USDC.approve(UniswapV2Router02.address, INFINITE_APPROVE);
    await AVASCALE.approve(UniswapV2Router02.address, INFINITE_APPROVE);

    // 0.02 USDC / 0.0001 WETH = 200 USDC per WETH
    await UniswapV2Router02.addLiquidity(
      WETH.address,
      USDC.address,
      parseUnits("0.0001", 18),
      parseUnits("0.02", 6),
      0,
      0,
      owner.address,
      getDeadlineInTimestamp()
    );

    // 0.5 WETH / 250 AVASCALE = 0.002 WETH per AVASCALE
    await UniswapV2Router02.addLiquidity(
      WETH.address,
      AVASCALE.address,
      parseUnits("0.5", 18),
      parseUnits("250", 18),
      0,
      0,
      owner.address,
      getDeadlineInTimestamp()
    );

    const usdcWethPairAddress = await UniswapV2Factory.getPair(
      USDC.address,
      WETH.address
    );

    const avascaleWethPairAddress = await UniswapV2Factory.getPair(
      AVASCALE.address,
      WETH.address
    );

    const OneUsdOracle = await (
      await ethers.getContractFactory("OneUsdOracleLocal")
    ).deploy(usdcWethPairAddress, USDC.address, WETH.address);

    const AvascaleUsdOracle = await (
      await ethers.getContractFactory("AvascaleUsdOracle")
    ).deploy(
      avascaleWethPairAddress,
      WETH.address,
      AVASCALE.address,
      OneUsdOracle.address
    );

    addresses = {
      usdcWethPairAddress,
      avascaleWethPairAddress,
    };

    contracts = {
      OneUsdOracle,
      AvascaleUsdOracle,
      WETH,
      USDC,
      AVASCALE,
      UniswapV2Factory,
      UniswapV2Router02,
    };
  });

  it("Should get correct one usd price", async () => {
    const { OneUsdOracle } = contracts;

    const oneUsd = await OneUsdOracle.getPrice();

    assert.equal(formatUnits(oneUsd, 8), "200.0", "incorrect one usd price");
  });

  it("Should get correct avascale usd price", async () => {
    const { AvascaleUsdOracle } = contracts;

    const avascaleUsd = await AvascaleUsdOracle.getPrice();

    assert.equal(formatUnits(avascaleUsd, 8), "0.4", "incorrect avascale usd price");
  });
});
