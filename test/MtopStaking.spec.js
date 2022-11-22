const { expect, assert } = require("chai");
const { BigNumber } = require("ethers");
const BNjs = require("bignumber.js");
const { parseUnits, formatUnits } = require("ethers/lib/utils");

const { ethers } = require("hardhat");

const INFINITE_APPROVE = BigNumber.from("2").pow("256").sub("1").toString();

const getDeadlineInTimestamp = (delayInMinutes = 10) => {
  return Math.floor(
    new Date().getTime() / 1000 + delayInMinutes * 60
  ).toString();
};

describe("AvascaleStaking", function () {
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

    // 0.2 USDC / 0.0001 WETH = 2000 USDC per WETH
    await UniswapV2Router02.addLiquidity(
      WETH.address,
      USDC.address,
      parseUnits("0.0001", 18),
      parseUnits("0.2", 6),
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

    const AvascaleWethPair = await (
      await ethers.getContractFactory("GenericERC20")
    ).attach(avascaleWethPairAddress);

    await AVASCALE.approve(UniswapV2Router02.address, INFINITE_APPROVE);

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

    const AvascaleStaking = await (
      await ethers.getContractFactory("AvascaleStaking")
    ).deploy(
      AVASCALE.address,
      avascaleWethPairAddress,
      AvascaleUsdOracle.address,
      "15778800000000000000000000",
      0
    );

    await AVASCALE.transfer(AvascaleStaking.address, parseUnits("100000", 18));

    await AvascaleWethPair.approve(AvascaleStaking.address, INFINITE_APPROVE);

    addresses = {
      usdcWethPairAddress,
      avascaleWethPairAddress,
    };

    contracts = {
      AvascaleUsdOracle,
      AvascaleWethPair,
      WETH,
      USDC,
      AVASCALE,
      UniswapV2Factory,
      UniswapV2Router02,
      AvascaleStaking,
    };
  });

  it("Should have deployed staking contract properly", async () => {
    const { AvascaleStaking, AVASCALE } = contracts;

    const avascaleDeposited = await AVASCALE.balanceOf(AvascaleStaking.address);
    const poolLength = await AvascaleStaking.poolLength();
    const usdDeposited = await AvascaleStaking.getUsdDeposited();

    assert.equal(poolLength.toString(), "1");
    assert.equal(usdDeposited.toString(), "0");
    assert.equal(formatUnits(avascaleDeposited.toString()), "100000.0");
  });

  it("Should deposit lp & get right usd total deposited", async () => {
    const { AvascaleStaking, AvascaleWethPair } = contracts;

    const balance = await AvascaleWethPair.balanceOf(owner.address);

    await AvascaleStaking.deposit("0", balance.div(2).toString());

    const usdDeposited = await AvascaleStaking.getUsdDeposited();

    assert.equal(Math.round(formatUnits(usdDeposited, 18)), "1000");
  });

  it("Should get right optimal emission rate", async () => {
    const { AvascaleStaking } = contracts;

    const optimalEmissionRate = await AvascaleStaking.getOptimalEmissionRate();

    assert.equal(
      Number(formatUnits(optimalEmissionRate, 18)).toFixed(8),
      "0.00000238"
    );
  });

  it("Should harvest the correct amount after 257 blocks", async () => {
    const { AVASCALE, AvascaleStaking } = contracts;

    await hre.network.provider.send("hardhat_mine", ["0x100"]); // jump 256 blocks

    const userAvascaleBalanceBefore = await AVASCALE.balanceOf(owner.address);
    await AvascaleStaking.deposit("0", "0"); // harvest
    const userAvascaleBalanceAfter = await AVASCALE.balanceOf(owner.address);
    const userAvascaleBalanceGain = userAvascaleBalanceAfter.sub(userAvascaleBalanceBefore);
    const avascalePerBlock = await AvascaleStaking.getAvascalePerBlock();

    const blocks = new BNjs(userAvascaleBalanceGain.toString()).dividedBy(
      avascalePerBlock.toString()
    );

    assert.equal(blocks.toFixed(0), "257");
  });

  it("Should be able to withdraw reserves as owner", async () => {
    const { AVASCALE, AvascaleStaking } = contracts;

    await hre.network.provider.send("hardhat_mine", ["0x100"]); // jump 256 blocks

    const ownerAvascaleBalanceBefore = await AVASCALE.balanceOf(owner.address);
    await AvascaleStaking.removeAvascaleReserves("10000"); // harvest
    const ownerAvascaleBalanceAfter = await AVASCALE.balanceOf(owner.address);
    const ownerAvascaleBalanceGain = ownerAvascaleBalanceAfter.sub(
      ownerAvascaleBalanceBefore
    );

    assert.equal(ownerAvascaleBalanceGain.toString(), "10000");
  });

  it("Should be able to withdraw as user", async () => {
    const { AvascaleStaking, AvascaleWethPair } = contracts;

    const userInfo = await AvascaleStaking.userInfo(0, owner.address);

    const balanceBefore = await AvascaleWethPair.balanceOf(owner.address);
    await AvascaleStaking.withdraw("0", userInfo.amount); // harvest
    const balanceAfter = await AvascaleWethPair.balanceOf(owner.address);
    const balanceGain = balanceAfter.sub(balanceBefore);

    assert.equal(balanceGain.toString(), userInfo.amount.toString());
  });
});
