async function main() {
  const avascaleTreasury = "0x85576752da7cf103ecd297cc873a222dd727b470";
  const avascaleAddress = "0x4a986Bb7909D361F3191Ea08d0C4B328295841A4";

  console.log(
    "Avascale NFT Constructor",
    avascaleAddress,
    "0x12f9c4b725457c48a3aD761530D8a7e5282E57E7",
    "0xDeEB347937E280F459Ea6999b5a5C17684c16096",
    avascaleTreasury
  );

  const AvascaleNFT = await (
    await ethers.getContractFactory("AvascaleNFT")
  ).deploy(
    avascaleAddress,
    "0x12f9c4b725457c48a3aD761530D8a7e5282E57E7",
    "0xDeEB347937E280F459Ea6999b5a5C17684c16096",
    avascaleTreasury
  );

  console.log("AvascaleNFT deployed to:", AvascaleNFT.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
