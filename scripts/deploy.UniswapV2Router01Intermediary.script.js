/*
  Warning! Harmony Mainnet!
  UniswapV2Router01Intermediary 0xB79359D8b28097DFb864116a3647874346997BB6
*/

async function main() {
  const avascaleTreasury = "0x85576752da7cf103ecd297cc873a222dd727b470";

  console.log('Deploying contract...');
  const UniswapV2Router01Intermediary = await (
    await ethers.getContractFactory("UniswapV2Router01Intermediary")
  ).deploy(avascaleTreasury);

  console.log("Change Ownership To 0x2291b0cB5d8542CF0B3C7FA2B130a1Cee1A99345");
  await UniswapV2Router01Intermediary.transferOwnership(
    "0x2291b0cB5d8542CF0B3C7FA2B130a1Cee1A99345"
  );

  console.log(
    "UniswapV2Router01Intermediary deployed to:",
    UniswapV2Router01Intermediary.address
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
