require("dotenv").config();

require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("@nomiclabs/hardhat-ethers");

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const settings = {
  optimizer: {
    enabled: true,
    runs: 1000,
  },
};

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.4.18",
        settings,
      },
      {
        version: "0.5.0",
        settings,
      },
      {
        version: "0.5.16",
        settings,
      },
      {
        version: "0.6.6",
        settings,
      },
      {
        version: "0.6.7",
        settings,
      },
      {
        version: "0.8.9",
        settings,
      },
      {
        version: "0.8.16",
        settings,
      },
    ],
  },
  networks: {
    harmonyMain: {
      url: "https://harmony-mainnet.chainstacklabs.com",
      accounts:
        process.env.HARMONY_MAIN_PRIVATE_KEY !== undefined
          ? [process.env.HARMONY_MAIN_PRIVATE_KEY]
          : [],
    },
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      accounts:
        process.env.HARMONY_MAIN_PRIVATE_KEY !== undefined
          ? [process.env.HARMONY_MAIN_PRIVATE_KEY]
          : [],
    },
    harmonyDevnet: {
      url: "https://api.s0.ps.hmny.io/",
      accounts:
        process.env.HARMONY_MAIN_PRIVATE_KEY !== undefined
          ? [process.env.HARMONY_MAIN_PRIVATE_KEY]
          : [],
    },
    harmonyTestnet: {
      url: "https://api.s0.pops.one/",
      accounts:
        process.env.HARMONY_MAIN_PRIVATE_KEY !== undefined
          ? [process.env.HARMONY_MAIN_PRIVATE_KEY]
          : [],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true" ? true : false,
    currency: "USD",
    coinmarketcap: process.env.CMC || "",
    token: "ONE",
    gasPrice: 30,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
  networks: {
    hardhat: {
      forking: {
        url: "https://rpc.ankr.com/eth",
        blockNumber: 15918290,
      },
    },
  },
};
