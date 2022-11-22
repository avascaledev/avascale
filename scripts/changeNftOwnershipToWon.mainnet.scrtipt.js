async function main() {
  const NftContract = await ethers.getContractFactory("AvascaleNFT");

  const nftContract = await NftContract.attach(
    "0x1053bd2f2b33c1acad927bb1fcc9ef9df404b4af"
  );

  await nftContract.transferOwnership(
    "0x2291b0cB5d8542CF0B3C7FA2B130a1Cee1A99345"
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
