// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract SimpleContract {
    uint256 public number;

    constructor() {
        number = 10;
    }

    function setNumber(uint256 _number) public {
        number = _number;
    }
}
