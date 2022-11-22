const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { parseUnits, solidityPack, formatUnits } = require("ethers/lib/utils");
const { BigNumber } = require("ethers");
const { assert, expect } = require("chai");
const BNjs = require("bignumber.js");

const getDeadlineInTimestamp = (delayInMinutes = 60) => {
  return Math.floor(
    new Date().getTime() / 1000 + delayInMinutes * 60
  ).toString();
};

const INFINITE_APPROVE = BigNumber.from("2").pow("256").sub("1").toString();

describe("UniswapV3RouterIntermediary", function () {
  const ethUsdcPoolAddress = "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640";
  const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const daiAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";

  const from = "0x55FE002aefF02F77364de339a1292923A15844B8";
  const fundReceiver = "0xe707Dae3c4153D4eddC7075d1Eb0e19A655213AA";
  const feeReceiver = "0x3c95B84eF6687e04Cb0F47EFCE6191A4400770af";

  async function getContractAt(nameOrAbi, address) {
    return hre.ethers.getContractAt(
      nameOrAbi,
      address,
      await hre.ethers.provider.getSigner(from)
    );
  }

  async function getSimulatedOutAmount(
    SwapRouter,
    path,
    amountIn,
    inIsEth = false
  ) {
    if (inIsEth) {
      const WETH = await getContractAt(
        "contracts/interfaces/IWETH.sol:IWETH",
        wethAddress
      );
      await WETH.deposit({ value: amountIn });
    }
    const outAmount = await SwapRouter.callStatic.exactInput({
      path: path,
      recipient: fundReceiver,
      deadline: getDeadlineInTimestamp(),
      amountIn: amountIn,
      amountOutMinimum: "0",
    });
    return outAmount;
  }

  async function deployUniswapV3TestingFixture() {
    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://rpc.ankr.com/eth",
            blockNumber: 15918290,
          },
        },
      ],
    });

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [from],
    });

    const owner = await hre.ethers.provider.getSigner(from);
    owner.address = from;

    const SwapRouter = await getContractAt(
      "contracts/interfaces/ISwapRouter.sol:ISwapRouter",
      "0xE592427A0AEce92De3Edee1F18E0157C05861564"
    );

    const SwapRouterIntermediary = await (
      await hre.ethers.getContractFactory("UniswapV3RouterIntermediary", owner)
    ).deploy(feeReceiver, wethAddress);

    const USDC = await getContractAt("GenericERC20", usdcAddress);
    const WETH = await getContractAt("GenericERC20", wethAddress);
    const DAI = await getContractAt("GenericERC20", daiAddress);

    await USDC.approve(SwapRouter.address, INFINITE_APPROVE);
    await WETH.approve(SwapRouter.address, INFINITE_APPROVE);
    await DAI.approve(SwapRouter.address, INFINITE_APPROVE);
    await USDC.approve(SwapRouterIntermediary.address, INFINITE_APPROVE);
    await DAI.approve(SwapRouterIntermediary.address, INFINITE_APPROVE);

    return { SwapRouter, SwapRouterIntermediary, USDC, WETH, owner };
  }

  async function performSwap(
    SwapRouter,
    SwapRouterIntermediary,
    path,
    amountIn,
    inToken,
    outToken,
    swapFunction,
    withFee = false
  ) {
    const feeDecimal = withFee
      ? (await SwapRouterIntermediary.feeBP()).toString() / 10000
      : 0;

    const ethIsOut = outToken === wethAddress;
    const ethIsIn = inToken === wethAddress;

    const expectedTreasuryGain = new BNjs(amountIn.toString())
      .multipliedBy(feeDecimal)
      .toString();

    const outTokenContract = await getContractAt("GenericERC20", outToken);
    const inTokenContract = await getContractAt("GenericERC20", inToken);

    const expectedOutAmount = await getSimulatedOutAmount(
      SwapRouter,
      path,
      new BNjs(amountIn.toString()).multipliedBy(1 - feeDecimal).toString(),
      ethIsIn
    );

    const balanceBefore = await (ethIsOut
      ? SwapRouter.provider.getBalance(fundReceiver)
      : outTokenContract.balanceOf(fundReceiver));
    const treasuryBalanceBefore = await inTokenContract.balanceOf(feeReceiver);

    const fn = `${swapFunction}${withFee ? "WithFee" : ""}`;

    const returnOutAmount = await SwapRouterIntermediary.callStatic[fn](
      SwapRouter.address,
      "exactInput",
      amountIn,
      "0",
      path,
      fundReceiver,
      getDeadlineInTimestamp(),
      { value: ethIsIn ? amountIn : 0 }
    );

    await SwapRouterIntermediary[fn](
      SwapRouter.address,
      "exactInput",
      amountIn,
      "0",
      path,
      fundReceiver,
      getDeadlineInTimestamp(),
      { value: ethIsIn ? amountIn : 0 }
    );

    const balanceAfter = await (ethIsOut
      ? SwapRouter.provider.getBalance(fundReceiver)
      : outTokenContract.balanceOf(fundReceiver));
    const treasuryBalanceAfter = await inTokenContract.balanceOf(feeReceiver);

    const actualGain = balanceAfter.sub(balanceBefore);
    const treasuryActualGain = treasuryBalanceAfter.sub(treasuryBalanceBefore);

    return {
      actualGain,
      returnOutAmount,
      expectedOutAmount,
      expectedTreasuryGain,
      treasuryActualGain,
    };
  }

  describe("Swap (without fee)", () => {
    it("USDC -> ETH", async () => {
      const { SwapRouter, SwapRouterIntermediary } = await loadFixture(
        deployUniswapV3TestingFixture
      );

      const info = await performSwap(
        SwapRouter,
        SwapRouterIntermediary,
        solidityPack(
          ["address", "uint24", "address"],
          [usdcAddress, "500", wethAddress]
        ),
        parseUnits("1", 6),
        usdcAddress,
        wethAddress,
        "swapExactTokensForETH"
      );

      expect(info.actualGain.toString())
        .to.be.equal(info.returnOutAmount.toString())
        .and.to.be.equal(info.expectedOutAmount.toString());

      expect(info.treasuryActualGain.toString()).to.be.equal(
        info.expectedTreasuryGain
      );
    });

    it("ETH -> USDC", async () => {
      const { SwapRouter, SwapRouterIntermediary } = await loadFixture(
        deployUniswapV3TestingFixture
      );

      const info = await performSwap(
        SwapRouter,
        SwapRouterIntermediary,
        solidityPack(
          ["address", "uint24", "address"],
          [wethAddress, "500", usdcAddress]
        ),
        parseUnits("0.01", 18),
        wethAddress,
        usdcAddress,
        "swapExactETHForTokens"
      );

      expect(info.actualGain.toString())
        .to.be.equal(info.returnOutAmount.toString())
        .and.to.be.equal(info.expectedOutAmount.toString());
      expect(info.treasuryActualGain.toString()).to.be.equal(
        info.expectedTreasuryGain
      );
    });

    it("USDC -> DAI", async () => {
      const { SwapRouter, SwapRouterIntermediary } = await loadFixture(
        deployUniswapV3TestingFixture
      );

      const info = await performSwap(
        SwapRouter,
        SwapRouterIntermediary,
        solidityPack(
          ["address", "uint24", "address"],
          [usdcAddress, "100", daiAddress]
        ),
        parseUnits("1", 6),
        usdcAddress,
        daiAddress,
        "swapExactTokensForTokens"
      );

      expect(info.actualGain.toString())
        .to.be.equal(info.returnOutAmount.toString())
        .and.to.be.equal(info.expectedOutAmount.toString());
      expect(info.treasuryActualGain.toString()).to.be.equal(
        info.expectedTreasuryGain
      );
    });

    it("USDC -> DAI -> ETH", async () => {
      const { SwapRouter, SwapRouterIntermediary } = await loadFixture(
        deployUniswapV3TestingFixture
      );

      const info = await performSwap(
        SwapRouter,
        SwapRouterIntermediary,
        solidityPack(
          ["address", "uint24", "address", "uint24", "address"],
          [usdcAddress, "100", daiAddress, "500", wethAddress]
        ),
        parseUnits("1", 6),
        usdcAddress,
        wethAddress,
        "swapExactTokensForETH"
      );

      expect(info.actualGain.toString())
        .to.be.equal(info.returnOutAmount.toString())
        .and.to.be.equal(info.expectedOutAmount.toString());

      expect(info.treasuryActualGain.toString()).to.be.equal(
        info.expectedTreasuryGain
      );
    });
  });

  describe("Swap (with fee) & Treasury Gain ", () => {
    it("USDC -> ETH", async () => {
      const { SwapRouter, SwapRouterIntermediary } = await loadFixture(
        deployUniswapV3TestingFixture
      );

      const info = await performSwap(
        SwapRouter,
        SwapRouterIntermediary,
        solidityPack(
          ["address", "uint24", "address"],
          [usdcAddress, "500", wethAddress]
        ),
        parseUnits("1", 6),
        usdcAddress,
        wethAddress,
        "swapExactTokensForETH",
        true
      );

      expect(info.actualGain.toString())
        .to.be.equal(info.returnOutAmount.toString())
        .and.to.be.equal(info.expectedOutAmount.toString());

      expect(info.treasuryActualGain.toString()).to.be.equal(
        info.expectedTreasuryGain
      );
    });

    it("ETH -> USDC", async () => {
      const { SwapRouter, SwapRouterIntermediary } = await loadFixture(
        deployUniswapV3TestingFixture
      );

      const info = await performSwap(
        SwapRouter,
        SwapRouterIntermediary,
        solidityPack(
          ["address", "uint24", "address"],
          [wethAddress, "500", usdcAddress]
        ),
        parseUnits("0.01", 18),
        wethAddress,
        usdcAddress,
        "swapExactETHForTokens",
        true
      );

      expect(info.actualGain.toString())
        .to.be.equal(info.returnOutAmount.toString())
        .and.to.be.equal(info.expectedOutAmount.toString());

      expect(info.treasuryActualGain.toString()).to.be.equal(
        info.expectedTreasuryGain
      );
    });

    it("USDC -> DAI", async () => {
      const { SwapRouter, SwapRouterIntermediary } = await loadFixture(
        deployUniswapV3TestingFixture
      );

      const info = await performSwap(
        SwapRouter,
        SwapRouterIntermediary,
        solidityPack(
          ["address", "uint24", "address"],
          [usdcAddress, "100", daiAddress]
        ),
        parseUnits("1", 6),
        usdcAddress,
        daiAddress,
        "swapExactTokensForTokens",
        true
      );

      expect(info.actualGain.toString())
        .to.be.equal(info.returnOutAmount.toString())
        .and.to.be.equal(info.expectedOutAmount.toString());

      expect(info.treasuryActualGain.toString()).to.be.equal(
        info.expectedTreasuryGain
      );
    });

    it("USDC -> DAI -> ETH", async () => {
      const { SwapRouter, SwapRouterIntermediary } = await loadFixture(
        deployUniswapV3TestingFixture
      );

      const info = await performSwap(
        SwapRouter,
        SwapRouterIntermediary,
        solidityPack(
          ["address", "uint24", "address", "uint24", "address"],
          [usdcAddress, "100", daiAddress, "500", wethAddress]
        ),
        parseUnits("1", 6),
        usdcAddress,
        wethAddress,
        "swapExactTokensForETH",
        true
      );

      expect(info.actualGain.toString())
        .to.be.equal(info.returnOutAmount.toString())
        .and.to.be.equal(info.expectedOutAmount.toString());

      expect(info.treasuryActualGain.toString()).to.be.equal(
        info.expectedTreasuryGain
      );
    });
  });

  describe("Admin", () => {
    it("Admin functions only callable by owner", async () => {
      const { SwapRouterIntermediary } = await loadFixture(
        deployUniswapV3TestingFixture
      );

      const [account1, account2] = await ethers.getSigners();

      await expect(
        SwapRouterIntermediary.connect(account2).setFeeBP(0)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        SwapRouterIntermediary.connect(account2).setFeeReceiver(feeReceiver)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Setting fee receiver should work", async () => {
      const { SwapRouterIntermediary } = await loadFixture(
        deployUniswapV3TestingFixture
      );

      const [account1] = await ethers.getSigners();

      await SwapRouterIntermediary.setFeeReceiver(account1.address);
      assert.equal(
        await SwapRouterIntermediary.feeReceiver(),
        account1.address
      );

      await SwapRouterIntermediary.setFeeReceiver(feeReceiver);
      assert.equal(await SwapRouterIntermediary.feeReceiver(), feeReceiver);
    });

    it("Setting fee BP should work, but not when it is being set > 1 %", async () => {
      const { SwapRouterIntermediary } = await loadFixture(
        deployUniswapV3TestingFixture
      );

      await SwapRouterIntermediary.setFeeBP("0");
      assert.equal(await SwapRouterIntermediary.feeBP(), "0");

      await SwapRouterIntermediary.setFeeBP("25");
      assert.equal(await SwapRouterIntermediary.feeBP(), "25");

      await expect(SwapRouterIntermediary.setFeeBP("101")).to.be.revertedWith(
        "UniswapV3RouterIntermediary: feeBP > MAX_FEE_BP"
      );
    });

    it("Test FeeBPChange & FeeReceiverChange events", async () => {
      const { SwapRouterIntermediary } = await loadFixture(
        deployUniswapV3TestingFixture
      );

      await expect(SwapRouterIntermediary.setFeeBP(0))
        .to.emit(SwapRouterIntermediary, "FeeBPChange")
        .withArgs(25, 0);

      await expect(SwapRouterIntermediary.setFeeBP(25))
        .to.emit(SwapRouterIntermediary, "FeeBPChange")
        .withArgs(0, 25);

      await expect(SwapRouterIntermediary.setFeeReceiver(fundReceiver))
        .to.emit(SwapRouterIntermediary, "FeeReceiverChange")
        .withArgs(feeReceiver, fundReceiver);

      await expect(SwapRouterIntermediary.setFeeReceiver(feeReceiver))
        .to.emit(SwapRouterIntermediary, "FeeReceiverChange")
        .withArgs(fundReceiver, feeReceiver);
    });
  });

  describe("Require Statements", () => {
    it("From token needs to be WETH when swapping from ETH", async () => {
      const { SwapRouterIntermediary, SwapRouter } = await loadFixture(
        deployUniswapV3TestingFixture
      );

      await expect(
        SwapRouterIntermediary.swapExactETHForTokens(
          SwapRouter.address,
          "exactInput",
          "100",
          "0",
          solidityPack(
            ["address", "uint24", "address", "uint24", "address"],
            [usdcAddress, "100", daiAddress, "500", wethAddress]
          ),
          fundReceiver,
          getDeadlineInTimestamp()
        )
      ).to.be.revertedWith("UniswapV3RouterIntermediary: fromToken != weth");
    });

    it("To token needs to be WETH when swapping to ETH", async () => {
      const { SwapRouterIntermediary, SwapRouter } = await loadFixture(
        deployUniswapV3TestingFixture
      );

      await expect(
        SwapRouterIntermediary.swapExactTokensForETH(
          SwapRouter.address,
          "exactInput",
          "100",
          "0",
          solidityPack(
            ["address", "uint24", "address", "uint24", "address"],
            [wethAddress, "100", daiAddress, "500", usdcAddress]
          ),
          fundReceiver,
          getDeadlineInTimestamp()
        )
      ).to.be.revertedWith("UniswapV3RouterIntermediary: toToken != weth");
    });

    it("Tx value needs to match in amount param", async () => {
      const { SwapRouterIntermediary, SwapRouter } = await loadFixture(
        deployUniswapV3TestingFixture
      );

      await expect(
        SwapRouterIntermediary.swapExactETHForTokens(
          SwapRouter.address,
          "exactInput",
          "100",
          "0",
          solidityPack(
            ["address", "uint24", "address", "uint24", "address"],
            [wethAddress, "100", daiAddress, "500", usdcAddress]
          ),
          fundReceiver,
          getDeadlineInTimestamp()
        )
      ).to.be.revertedWith("UniswapV3RouterIntermediary: value != amountIn");
    });
  });
});
