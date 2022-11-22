// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IAvascaleOracle {
    struct Step {
        address pair;
        address numerator;
        address denominator;
    }

    function getPriceDecimals() external view returns (uint8);

    function getSteps() external view returns (Step[] memory);

    function setSteps(Step[] memory _steps) external;

    function getPriceAtEachStep() external view returns (uint256[] memory);

    function getDestPrice() external view returns (uint256);
}
