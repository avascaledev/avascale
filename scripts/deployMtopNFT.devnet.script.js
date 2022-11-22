const { BigNumber } = require("ethers");
const { parseUnits } = require("ethers/lib/utils");
const hre = require("hardhat");

const getDeadlineInTimestamp = (delayInMinutes = 3) => {
  return Math.floor(
    new Date().getTime() / 1000 + delayInMinutes * 60
  ).toString();
};

const INFINITE_APPROVE = BigNumber.from("2").pow("256").sub("1").toString();

/*
  Warning! Harmony Devnet!
  WETH deployed to: 0x2455239f76AE4883788376e12A91945661a66275
  USDC deployed to: 0xF47e2E3b1571117240C2Cccf60c0f78c91da6B73
  AVASCALE deployed to: 0x508ff54CF296FD8dFfa4295D791AB1591321b90E
  AvascaleNFT deployed to: 0x0670804c9B120fB3Bef03558fbB7E3Df1574a027
*/

async function main() {
  const [owner] = await ethers.getSigners();

  const WETH = await (await ethers.getContractFactory("WETH9")).deploy();

  const USDC = await (
    await ethers.getContractFactory("GenericERC20")
  ).deploy("USDC", "USDC", 6);

  const AVASCALE = await (
    await ethers.getContractFactory("GenericERC20")
  ).deploy("Avascale", "Avascale", 18);

  const UniswapV2Factory = await (
    await hre.ethers.getContractFactory("UniswapV2Factory")
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

  const avascaleWethPairAddress = await UniswapV2Factory.getPair(
    AVASCALE.address,
    WETH.address
  );

  const usdcWethPairAddress = await UniswapV2Factory.getPair(
    USDC.address,
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
    owner.address
  );

  console.log("Gift Diamond NFT to Deployer");
  await AvascaleNFT.gift(owner.address, 3);

  console.log("WETH deployed to:", WETH.address);
  console.log("USDC deployed to:", USDC.address);
  console.log("AVASCALE deployed to:", AVASCALE.address);
  console.log("AvascaleNFT deployed to:", AvascaleNFT.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
