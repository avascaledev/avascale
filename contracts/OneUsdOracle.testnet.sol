// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./interfaces/IOracle.sol";

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract OneUsdOracleTestnet is IOracle {
    AggregatorV3Interface public priceFeed;

    /**
     * Network: Harmony Testnet
     * Aggregator: ONE/USD
     * Address: 0xcEe686F89bc0dABAd95AEAAC980aE1d97A075FAD
     */
    constructor() {
        priceFeed = AggregatorV3Interface(
            0xcEe686F89bc0dABAd95AEAAC980aE1d97A075FAD
        );
    }

    /**
     * Returns the latest price
     */
    function getPrice() public view override returns (uint256) {
        (, int256 price, , , ) = priceFeed.latestRoundData();
        return uint256(price);
    }
}
