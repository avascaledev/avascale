const { expect, assert } = require("chai");
const { BigNumber } = require("ethers");
const { parseUnits, formatUnits, parseEther } = require("ethers/lib/utils");

const BNjs = require("bignumber.js");

const { ethers } = require("hardhat");

const INFINITE_APPROVE = BigNumber.from("2").pow("256").sub("1").toString();

const getDeadlineInTimestamp = (delayInMinutes = 60) => {
  return Math.floor(
    new Date().getTime() / 1000 + delayInMinutes * 60
  ).toString();
};

describe("UniswapV2Router01IntermediaryV2", function () {
  const PERCENTAGE_GAIN = "0.25";

  let [owner, account1, feeReceiver] = Array(3);
  let contracts;
  let addresses;

  before(async () => {
    [owner, account1, feeReceiver] = await ethers.getSigners();

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

    const UniswapV2Router01Intermediary = await (
      await ethers.getContractFactory("UniswapV2Router01IntermediaryV2")
    ).deploy(feeReceiver.address);

    await WETH.deposit({
      value: parseUnits("4"),
    });

    await WETH.approve(UniswapV2Router01Intermediary.address, INFINITE_APPROVE);
    await USDC.approve(UniswapV2Router01Intermediary.address, INFINITE_APPROVE);
    await AVASCALE.approve(UniswapV2Router01Intermediary.address, INFINITE_APPROVE);

    await WETH.approve(UniswapV2Router02.address, INFINITE_APPROVE);
    await USDC.approve(UniswapV2Router02.address, INFINITE_APPROVE);
    await AVASCALE.approve(UniswapV2Router02.address, INFINITE_APPROVE);

    // 0.02 USDC / 0.0001 WETH = 200 USDC per WETH
    await UniswapV2Router02.addLiquidity(
      WETH.address,
      USDC.address,
      parseUnits("1", 18),
      parseUnits("200", 6),
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

    addresses = {
      usdcWethPairAddress,
      avascaleWethPairAddress,
    };

    contracts = {
      WETH,
      USDC,
      AVASCALE,
      UniswapV2Factory,
      UniswapV2Router02,
      UniswapV2Router01Intermediary,
    };
  });

  it("ETH -> Token Swap (without fee) + Swap Event", async () => {
    const { UniswapV2Router01Intermediary, UniswapV2Router02, WETH, USDC } =
      contracts;

    const path = [WETH.address, USDC.address];

    const usdcBalanceBeforeSwap = await USDC.balanceOf(owner.address);

    const ethAmount = parseUnits("0.01");

    const amountsOut = await UniswapV2Router02.getAmountsOut(ethAmount, path);

    const expectedUsdcGain = amountsOut[1];

    await expect(
      UniswapV2Router01Intermediary.swapExactETHForTokens(
        UniswapV2Router02.address,
        "swapExactETHForTokens",
        "0",
        path,
        owner.address,
        getDeadlineInTimestamp(),
        { value: ethAmount }
      )
    )
      .to.emit(UniswapV2Router01Intermediary, "Swap")
      .withArgs(UniswapV2Router02.address, path[0], path[1], ethAmount, 0);

    const usdcBalanceAfterSwap = await USDC.balanceOf(owner.address);

    const usdcGain = usdcBalanceAfterSwap.sub(usdcBalanceBeforeSwap);

    assert.equal(usdcGain.toString(), expectedUsdcGain.toString());
  });

  it("ETH -> Token Swap (with fee) + Swap Event", async () => {
    const { UniswapV2Router01Intermediary, UniswapV2Router02, WETH, USDC } =
      contracts;

    const path = [WETH.address, USDC.address];

    const usdcBalanceBeforeSwap = await USDC.balanceOf(owner.address);

    const feeReceiverEthBalanceBeforeSwap = await feeReceiver.getBalance();

    const ethAmount = parseUnits("0.1");

    const { _fee: expectedEthGainForFeeReceiver, _left: ethAmountAfterFees } =
      await UniswapV2Router01Intermediary.getFeeDetails(ethAmount);

    const amountsOut = await UniswapV2Router02.getAmountsOut(
      ethAmountAfterFees,
      path
    );

    const expectedUsdcGain = amountsOut[1];

    await expect(
      UniswapV2Router01Intermediary.swapExactETHForTokensWithFee(
        UniswapV2Router02.address,
        "swapExactETHForTokens",
        "0",
        path,
        owner.address,
        getDeadlineInTimestamp(),
        { value: ethAmount }
      )
    )
      .to.emit(UniswapV2Router01Intermediary, "Swap")
      .withArgs(
        UniswapV2Router02.address,
        path[0],
        path[1],
        ethAmount,
        expectedEthGainForFeeReceiver
      );

    const usdcBalanceAfterSwap = await USDC.balanceOf(owner.address);
    const feeReceiverEthBalanceAfterSwap = await feeReceiver.getBalance();

    const usdcGain = usdcBalanceAfterSwap.sub(usdcBalanceBeforeSwap);
    const ethGainForFeeReceiver = feeReceiverEthBalanceAfterSwap.sub(
      feeReceiverEthBalanceBeforeSwap
    );

    assert.equal(usdcGain.toString(), expectedUsdcGain.toString());
    assert.equal(
      ethGainForFeeReceiver.toString(),
      expectedEthGainForFeeReceiver.toString()
    );

    const percentageGain = new BNjs(expectedEthGainForFeeReceiver.toString())
      .dividedBy(ethAmount.toString())
      .multipliedBy(100);

    assert.equal(percentageGain, PERCENTAGE_GAIN);
  });

  it("Token -> Token Swap (without fee) + Swap Event", async () => {
    const { UniswapV2Router01Intermediary, UniswapV2Router02, WETH, USDC } =
      contracts;

    const path = [WETH.address, USDC.address];

    const usdcBalanceBeforeSwap = await USDC.balanceOf(owner.address);

    const wethAmount = parseUnits("0.01");

    const amountsOut = await UniswapV2Router02.getAmountsOut(wethAmount, path);

    const expectedUsdcGain = amountsOut[1];

    await expect(
      UniswapV2Router01Intermediary.swapExactTokensForTokens(
        UniswapV2Router02.address,
        "swapExactTokensForTokens",
        wethAmount,
        "0",
        path,
        owner.address,
        getDeadlineInTimestamp()
      )
    )
      .to.emit(UniswapV2Router01Intermediary, "Swap")
      .withArgs(UniswapV2Router02.address, path[0], path[1], wethAmount, 0);

    const usdcBalanceAfterSwap = await USDC.balanceOf(owner.address);

    const usdcGain = usdcBalanceAfterSwap.sub(usdcBalanceBeforeSwap);

    assert.equal(usdcGain.toString(), expectedUsdcGain.toString());
  });

  it("Token -> Token Swap (with fee) + Swap Event", async () => {
    const { UniswapV2Router01Intermediary, UniswapV2Router02, WETH, USDC } =
      contracts;

    const path = [WETH.address, USDC.address];

    const usdcBalanceBeforeSwap = await USDC.balanceOf(owner.address);
    const feeReceiverWethBalanceBeforeSwap = await WETH.balanceOf(
      feeReceiver.address
    );

    const wethAmount = parseUnits("0.01");

    const { _fee: expectedWethGainForFeeReceiver, _left: wethAmountAfterFees } =
      await UniswapV2Router01Intermediary.getFeeDetails(wethAmount);

    const amountsOut = await UniswapV2Router02.getAmountsOut(
      wethAmountAfterFees,
      path
    );

    const expectedUsdcGain = amountsOut[1];

    await expect(
      UniswapV2Router01Intermediary.swapExactTokensForTokensWithFee(
        UniswapV2Router02.address,
        "swapExactTokensForTokens",
        wethAmount,
        "0",
        path,
        owner.address,
        getDeadlineInTimestamp()
      )
    )
      .to.emit(UniswapV2Router01Intermediary, "Swap")
      .withArgs(
        UniswapV2Router02.address,
        path[0],
        path[1],
        wethAmount,
        expectedWethGainForFeeReceiver
      );

    const usdcBalanceAfterSwap = await USDC.balanceOf(owner.address);
    const feeReceiverWethBalanceAfterSwap = await WETH.balanceOf(
      feeReceiver.address
    );

    const usdcGain = usdcBalanceAfterSwap.sub(usdcBalanceBeforeSwap);
    const wethGainForFeeReceiver = feeReceiverWethBalanceAfterSwap.sub(
      feeReceiverWethBalanceBeforeSwap
    );

    assert.equal(usdcGain.toString(), expectedUsdcGain.toString());
    assert.equal(
      wethGainForFeeReceiver.toString(),
      expectedWethGainForFeeReceiver.toString()
    );

    const percentageGain = new BNjs(expectedWethGainForFeeReceiver.toString())
      .dividedBy(wethAmount.toString())
      .multipliedBy(100);

    assert.equal(percentageGain, PERCENTAGE_GAIN);
  });

  it("Token -> ETH Swap (without fee) + Swap Event", async () => {
    const { UniswapV2Router01Intermediary, UniswapV2Router02, WETH, USDC } =
      contracts;

    const path = [USDC.address, WETH.address];

    const ethBalanceBeforeSwap = await account1.getBalance();

    const usdcAmount = parseUnits("1", 6);

    const amountsOut = await UniswapV2Router02.getAmountsOut(usdcAmount, path);

    const expectedEthGain = amountsOut[1];

    await expect(
      UniswapV2Router01Intermediary.swapExactTokensForETH(
        UniswapV2Router02.address,
        "swapExactTokensForETH",
        usdcAmount,
        "0",
        path,
        account1.address,
        getDeadlineInTimestamp()
      )
    )
      .to.emit(UniswapV2Router01Intermediary, "Swap")
      .withArgs(UniswapV2Router02.address, path[0], path[1], usdcAmount, 0);

    const ethBalanceAfterSwap = await account1.getBalance();

    const ethGain = ethBalanceAfterSwap.sub(ethBalanceBeforeSwap);

    assert.equal(ethGain.toString(), expectedEthGain.toString());
  });

  it("Token -> ETH Swap (with fee) + Swap Event", async () => {
    const { UniswapV2Router01Intermediary, UniswapV2Router02, WETH, USDC } =
      contracts;

    const path = [USDC.address, WETH.address];

    const ethBalanceBeforeSwap = await account1.getBalance();
    const feeReceiverUsdcBalanceBeforeSwap = await USDC.balanceOf(
      feeReceiver.address
    );
    const usdcAmount = parseUnits("1", 6);

    const { _fee: expectedUsdcGainForFeeReceiver, _left: usdcAmountAfterFees } =
      await UniswapV2Router01Intermediary.getFeeDetails(usdcAmount);

    const amountsOut = await UniswapV2Router02.getAmountsOut(
      usdcAmountAfterFees,
      path
    );

    const expectedEthGain = amountsOut[1];

    await expect(
      UniswapV2Router01Intermediary.swapExactTokensForETHWithFee(
        UniswapV2Router02.address,
        "swapExactTokensForETH",
        usdcAmount,
        "0",
        path,
        account1.address,
        getDeadlineInTimestamp()
      )
    )
      .to.emit(UniswapV2Router01Intermediary, "Swap")
      .withArgs(
        UniswapV2Router02.address,
        path[0],
        path[1],
        usdcAmount,
        expectedUsdcGainForFeeReceiver
      );

    const ethBalanceAfterSwap = await account1.getBalance();
    const feeReceiverUsdcBalanceAfterSwap = await USDC.balanceOf(
      feeReceiver.address
    );

    const ethGain = ethBalanceAfterSwap.sub(ethBalanceBeforeSwap);
    const usdcGainForFeeReceiver = feeReceiverUsdcBalanceAfterSwap.sub(
      feeReceiverUsdcBalanceBeforeSwap
    );

    assert.equal(ethGain.toString(), expectedEthGain.toString());
    assert.equal(
      usdcGainForFeeReceiver.toString(),
      expectedUsdcGainForFeeReceiver.toString()
    );

    const percentageGain = new BNjs(expectedUsdcGainForFeeReceiver.toString())
      .dividedBy(usdcAmount.toString())
      .multipliedBy(100);

    assert.equal(percentageGain, PERCENTAGE_GAIN);
  });

  it("Test path length modifier", async () => {
    const { UniswapV2Router01Intermediary, UniswapV2Router02 } = contracts;

    await expect(
      UniswapV2Router01Intermediary.swapExactTokensForTokens(
        UniswapV2Router02.address,
        "swapExactTokensForTokens",
        0,
        0,
        [],
        owner.address,
        0
      )
    ).to.be.revertedWith("UniswapV2Router01IntermediaryV2: path < 2");

    await expect(
      UniswapV2Router01Intermediary.swapExactETHForTokens(
        UniswapV2Router02.address,
        "swapExactETHForTokens",
        0,
        [],
        owner.address,
        0
      )
    ).to.be.revertedWith("UniswapV2Router01IntermediaryV2: path < 2");

    await expect(
      UniswapV2Router01Intermediary.swapExactTokensForETH(
        UniswapV2Router02.address,
        "swapExactTokensForETH",
        0,
        0,
        [owner.address],
        owner.address,
        0
      )
    ).to.be.revertedWith("UniswapV2Router01IntermediaryV2: path < 2");
  });

  it("Admin functions only callable by owner", async () => {
    const { UniswapV2Router01Intermediary } = contracts;

    await expect(
      UniswapV2Router01Intermediary.connect(account1).setFeeBP(0)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      UniswapV2Router01Intermediary.connect(account1).setFeeReceiver(
        feeReceiver.address
      )
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Setting fee receiver should work", async () => {
    const { UniswapV2Router01Intermediary } = contracts;

    await UniswapV2Router01Intermediary.setFeeReceiver(account1.address);
    assert.equal(
      await UniswapV2Router01Intermediary.feeReceiver(),
      account1.address
    );

    await UniswapV2Router01Intermediary.setFeeReceiver(feeReceiver.address);
    assert.equal(
      await UniswapV2Router01Intermediary.feeReceiver(),
      feeReceiver.address
    );
  });

  it("Setting fee BP should work, but not when it is being set > 1 %", async () => {
    const { UniswapV2Router01Intermediary } = contracts;

    await UniswapV2Router01Intermediary.setFeeBP("0");
    assert.equal(await UniswapV2Router01Intermediary.feeBP(), "0");

    await UniswapV2Router01Intermediary.setFeeBP("25");
    assert.equal(await UniswapV2Router01Intermediary.feeBP(), "25");

    await expect(
      UniswapV2Router01Intermediary.setFeeBP("101")
    ).to.be.revertedWith("UniswapV2Router01IntermediaryV2: feeBP > MAX_FEE_BP");
  });

  it("Test FeeBPChange & FeeReceiverChange events", async () => {
    const { UniswapV2Router01Intermediary } = contracts;

    await expect(UniswapV2Router01Intermediary.setFeeBP(0))
      .to.emit(UniswapV2Router01Intermediary, "FeeBPChange")
      .withArgs(25, 0);

    await expect(UniswapV2Router01Intermediary.setFeeBP(25))
      .to.emit(UniswapV2Router01Intermediary, "FeeBPChange")
      .withArgs(0, 25);

    await expect(UniswapV2Router01Intermediary.setFeeReceiver(account1.address))
      .to.emit(UniswapV2Router01Intermediary, "FeeReceiverChange")
      .withArgs(feeReceiver.address, account1.address);

    await expect(
      UniswapV2Router01Intermediary.setFeeReceiver(feeReceiver.address)
    )
      .to.emit(UniswapV2Router01Intermediary, "FeeReceiverChange")
      .withArgs(account1.address, feeReceiver.address);
  });
});
