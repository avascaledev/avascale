/*
  Warning! Harmony Mainnet!
  OneUsdOracle deployed to: 0x12f9c4b725457c48a3aD761530D8a7e5282E57E7
  AvascaleUsdOracle deployed to: 0xDeEB347937E280F459Ea6999b5a5C17684c16096
  AvascaleNFT deployed to: 0x1053BD2F2B33C1aCad927bb1FCC9ef9df404b4af
  Avascale Treasury 0x85576752da7cf103ecd297cc873a222dd727b470
*/

/* 
  verify command: npx hardhat verify --network harmonyMain 0x12f9c4b725457c48a3aD761530D8a7e5282E57E7 --contract contracts/OneUsdOracleMainnet.sol:OneUsdOracleMainnet
*/

async function main() {
  const [owner] = await ethers.getSigners();

  const avascaleTreasury = "0x85576752da7cf103ecd297cc873a222dd727b470";
  const oneAddress = "0xcF664087a5bB0237a0BAd6742852ec6c8d69A27a";
  const avascaleAddress = "0x4a986Bb7909D361F3191Ea08d0C4B328295841A4";
  const avascaleOnePairAddress = "0x36a7e3028277899f18d595933316510b94acac3a";

  const OneUsdOracle = await (
    await ethers.getContractFactory("OneUsdOracleMainnet")
  ).deploy();

  const AvascaleUsdOracle = await (
    await ethers.getContractFactory("AvascaleUsdOracle")
  ).deploy(avascaleOnePairAddress, oneAddress, avascaleAddress, OneUsdOracle.address);

  const AvascaleNFT = await (
    await ethers.getContractFactory("AvascaleNFT")
  ).deploy(
    avascaleAddress,
    OneUsdOracle.address,
    AvascaleUsdOracle.address,
    avascaleTreasury
  );

  console.log("OneUsdOracle deployed to:", OneUsdOracle.address);
  console.log("AvascaleUsdOracle deployed to:", AvascaleUsdOracle.address);
  console.log("AvascaleNFT deployed to:", AvascaleNFT.address);
  console.log("Avascale Treasury", avascaleTreasury);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
