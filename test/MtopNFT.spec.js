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

describe("AvascaleNFT", function () {
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

    const AvascaleNFT = await (
      await ethers.getContractFactory("AvascaleNFT")
    ).deploy(
      AVASCALE.address,
      OneUsdOracle.address,
      AvascaleUsdOracle.address,
      account1.address
    );

    await USDC.approve(AvascaleNFT.address, INFINITE_APPROVE);
    await AVASCALE.approve(AvascaleNFT.address, INFINITE_APPROVE);

    addresses = {
      usdcWethPairAddress,
      avascaleWethPairAddress,
    };

    contracts = {
      AvascaleNFT,
      OneUsdOracle,
      AvascaleUsdOracle,
      WETH,
      USDC,
      AVASCALE,
      UniswapV2Factory,
      UniswapV2Router02,
    };
  });

  it("Should get the tier prices accurately", async () => {
    const { AvascaleNFT } = contracts;

    {
      const { _avascaleAmount, _oneAmount, _usdAmount } = await AvascaleNFT.getTierCost(
        3
      );

      assert.equal(formatUnits(_avascaleAmount, 18), "0.0");
      assert.equal(formatUnits(_oneAmount, 18), "0.0");
      assert.equal(formatUnits(_usdAmount, 18), "0.0");
    }

    {
      const { _avascaleAmount, _oneAmount, _usdAmount } = await AvascaleNFT.getTierCost(
        0
      );

      assert.equal(formatUnits(_avascaleAmount, 18), "3.75");
      assert.equal(formatUnits(_oneAmount, 18), "0.0075");
      assert.equal(formatUnits(_usdAmount, 18), "30.0");
    }

    {
      const { _avascaleAmount, _oneAmount, _usdAmount } = await AvascaleNFT.getTierCost(
        1
      );

      assert.equal(formatUnits(_avascaleAmount, 18), "8.75");
      assert.equal(formatUnits(_oneAmount, 18), "0.0175");
      assert.equal(formatUnits(_usdAmount, 18), "70.0");
    }

    {
      const { _avascaleAmount, _oneAmount, _usdAmount } = await AvascaleNFT.getTierCost(
        2
      );

      assert.equal(formatUnits(_avascaleAmount, 18), "31.25");
      assert.equal(formatUnits(_oneAmount, 18), "0.0625");
      assert.equal(formatUnits(_usdAmount, 18), "250.0");
    }

    await expect(AvascaleNFT.getTierCost(4)).to.be.reverted;
  });

  it("Should be able to buy all three tiers & send funds to collector", async () => {
    const { AvascaleNFT, AVASCALE } = contracts;

    const {
      _avascaleAmount: _avascaleAmount0,
      _oneAmount: _oneAmount0,
      _usdAmount: _usdAmount0,
    } = await AvascaleNFT.getTierCost(0);

    const {
      _avascaleAmount: _avascaleAmount1,
      _oneAmount: _oneAmount1,
      _usdAmount: _usdAmount1,
    } = await AvascaleNFT.getTierCost(1);

    const {
      _avascaleAmount: _avascaleAmount2,
      _oneAmount: _oneAmount2,
      _usdAmount: _usdAmount2,
    } = await AvascaleNFT.getTierCost(2);

    await expect(AvascaleNFT.buy(owner.address, 1)).to.be.revertedWith(
      "AvascaleNFT: !amount"
    );

    const collectorAvascaleBalanceBeforeMintings = await AVASCALE.balanceOf(
      account1.address
    );
    const collectorOneBalanceBeforeBeforeMintings = await account1.getBalance();

    await expect(
      AvascaleNFT.buy(owner.address, 3, { value: 0 })
    ).to.be.revertedWith("AvascaleNFT: =diamond");

    await AvascaleNFT.buy(owner.address, 0, { value: _oneAmount0 });
    await AvascaleNFT.buy(owner.address, 1, { value: _oneAmount1 });
    await AvascaleNFT.buy(owner.address, 2, { value: _oneAmount2 });

    const collectorAvascaleBalanceAfterMintings = await AVASCALE.balanceOf(
      account1.address
    );
    const collectorOneBalanceBeforeAfterMintings = await account1.getBalance();

    const collectorAvascaleGainExpected = _avascaleAmount0
      .add(_avascaleAmount1)
      .add(_avascaleAmount2);

    const collectorOneGainExpected = _oneAmount0
      .add(_oneAmount1)
      .add(_oneAmount2);

    const collectorAvascaleGain = collectorAvascaleBalanceAfterMintings.sub(
      collectorAvascaleBalanceBeforeMintings
    );
    const collectorOneGain = collectorOneBalanceBeforeAfterMintings.sub(
      collectorOneBalanceBeforeBeforeMintings
    );

    assert.equal(
      collectorAvascaleGain.toString(),
      collectorAvascaleGainExpected.toString(),
      "avascale collector gain not as expected"
    );
    assert.equal(
      collectorOneGain.toString(),
      collectorOneGainExpected.toString(),
      "one collector gain not as expected"
    );
    assert.equal(
      (await AvascaleNFT.balanceOf(owner.address)).toString(),
      "3",
      "didn't mint 3 nfts"
    );
  });

  it("Should get correct correct uri for nft", async () => {
    const { AvascaleNFT } = contracts;

    const balance = (await AvascaleNFT.balanceOf(owner.address)).toNumber();

    const tokenIds = [];

    for (let i = 0; i < balance; i++) {
      const tokenId = await AvascaleNFT.tokenOfOwnerByIndex(owner.address, i);
      tokenIds.push(tokenId.toString());
    }

    const baseURI = await AvascaleNFT.baseURI();

    const tokenUri0 = await AvascaleNFT.tokenURI(tokenIds[0]);
    const tokenUri1 = await AvascaleNFT.tokenURI(tokenIds[1]);
    const tokenUri2 = await AvascaleNFT.tokenURI(tokenIds[2]);

    assert.equal(tokenUri0, baseURI + "/30.json", "30 tier incorrect uri");

    assert.equal(tokenUri1, baseURI + "/90.json", "90 tier incorrect uri");

    assert.equal(tokenUri2, baseURI + "/360.json", "360 tier incorrect uri");
  });

  it("Owner should be able to gift one NFT", async () => {
    const { AvascaleNFT } = contracts;

    await AvascaleNFT.gift(account1.address, 1);

    await expect(
      AvascaleNFT.connect(account1).gift(account1.address, 2)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    const nftDetails = await AvascaleNFT.nftDetails(3);

    const balance = (await AvascaleNFT.balanceOf(account1.address)).toNumber();

    assert.equal(nftDetails.tier, 1);
    assert.equal(balance, 1);
  });

  it("Owner should be able to batch gift many NFTs", async () => {
    const { AvascaleNFT } = contracts;

    await expect(
      AvascaleNFT.connect(account1).batchGift([account1.address], 2)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    const receivers = [
      "0x8BF64AC20F6f6a06FbB3847324E3dE1569C07170",
      "0x29a20C0503ed7688Af4229004a2F79f727cA4AFE",
      "0xe335378B8B421712b27E9C0B37FAeA7a5faF9Ad8",
      "0x4Dff1b03Ea6678fFB303c300d964a3d90c18Ae66",
      "0xAb985B21A2f595aD7ee014D20636e3c726e1b692",
      "0xeB2629a2734e272Bcc07BDA959863f316F4bD4Cf",
    ];

    await AvascaleNFT.batchGift(receivers, 2);

    for (let i = 0; i < receivers.length; i++) {
      const nftDetails = await AvascaleNFT.nftDetails(4 + i);
      const receiver = receivers[i];
      const balance = (await AvascaleNFT.balanceOf(receiver)).toNumber();

      assert.equal(nftDetails.tier, 2);
      assert.equal(balance, 1);
    }
  });

  it("Owner should be able to gift diamond NFT & diamond NFT should have correct URI", async () => {
    const { AvascaleNFT } = contracts;

    await AvascaleNFT.gift(account1.address, 3);

    const totalSupply = await AvascaleNFT.totalSupply();

    const nftDetails = await AvascaleNFT.nftDetails(totalSupply - 1);

    const baseURI = await AvascaleNFT.baseURI();
    const tokenUri = await AvascaleNFT.tokenURI(totalSupply - 1);

    expect(nftDetails.tier).to.be.equal(3);

    assert.equal(
      tokenUri,
      baseURI + "/diamond.json",
      "diamond tier incorrect uri"
    );
  });
});
