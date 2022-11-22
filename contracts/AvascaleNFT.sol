// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "./interfaces/IOracle.sol";
import "./libraries/Decimals.sol";

contract AvascaleNFT is ERC721, ERC721Enumerable, Ownable {
    using Counters for Counters.Counter;
    using SafeERC20 for IERC20;

    /*********************
     ** Enums & Structs **
     *********************/

    enum Tier {
        _30,
        _90,
        _360,
        _diamond
    }

    struct NFTDetails {
        Tier tier;
        uint256 expirationTimestamp;
    }

    /*************
     ** Storage **
     *************/

    Counters.Counter private _tokenIdCounter;

    address feeCollector;

    uint256 SECONDS_PER_DAY = 86400;

    IERC20 AVASCALE;
    uint8 AVASCALE_DECIMALS;

    IOracle AVASCALE_ORACLE;
    IOracle ONE_ORACLE;

    mapping(uint256 => NFTDetails) public nftDetails;

    /*****************
     ** Constructor **
     *****************/

    constructor(
        IERC20 _avascale,
        IOracle _oneOracle,
        IOracle _avascaleOracle,
        address _feeCollector
    ) ERC721("Avascale Pass", "AVASCALEASS") {
        AVASCALE = _avascale;
        AVASCALE_DECIMALS = IERC20Metadata(address(_avascale)).decimals();

        ONE_ORACLE = _oneOracle;
        AVASCALE_ORACLE = _avascaleOracle;

        feeCollector = _feeCollector;
    }

    /*************
     ** Ownable **
     *************/

    function setFeeCollector(address _newFeeCollector) external onlyOwner {
        feeCollector = _newFeeCollector;
    }

    function setOneOracle(IOracle _newOneOracle) external onlyOwner {
        ONE_ORACLE = _newOneOracle;
    }

    function setAvascaleOracle(IOracle _newAvascaleOracle) external onlyOwner {
        AVASCALE_ORACLE = _newAvascaleOracle;
    }

    function batchGift(address[] memory tos, Tier tier) public onlyOwner {
        for (uint256 i = 0; i < tos.length; i++) {
            gift(tos[i], tier);
        }
    }

    function gift(address to, Tier tier) public onlyOwner {
        uint256 tokenId = _tokenIdCounter.current();

        nftDetails[tokenId] = NFTDetails(tier, _getExpirationTimestamp(tier));

        _safeMint(to, tokenId);
        _tokenIdCounter.increment();
    }

    /************
     ** Public **
     ************/

    function buy(address to, Tier tier) public payable {
        uint256 tokenId = _tokenIdCounter.current();

        (uint256 _avascaleAmount, uint256 _oneAmount, ) = getTierCost(tier);

        require(tier != Tier._diamond, "AvascaleNFT: =diamond");
        require(msg.value == _oneAmount, "AvascaleNFT: !amount");

        AVASCALE.safeTransferFrom(msg.sender, feeCollector, _avascaleAmount);
        payable(feeCollector).transfer(_oneAmount);

        // refund remaining ONE in case ONE becomes more valueable
        // after tx confirmation
        payable(msg.sender).transfer(address(this).balance);

        nftDetails[tokenId] = NFTDetails(tier, _getExpirationTimestamp(tier));

        _safeMint(to, tokenId);
        _tokenIdCounter.increment();
    }

    function getTierCost(Tier _tier)
        public
        view
        returns (
            uint256 _avascaleAmount,
            uint256 _oneAmount,
            uint256 _usdAmount
        )
    {
        if (_tier == Tier._30) {
            _usdAmount = 15 * 10**18;
            _avascaleAmount = _getAvascaleAmount(_usdAmount);
            _oneAmount = _getOneAmount(_usdAmount);
        } else if (_tier == Tier._90) {
            _usdAmount = 35 * 10**18;
            _avascaleAmount = _getAvascaleAmount(_usdAmount);
            _oneAmount = _getOneAmount(_usdAmount);
        } else if (_tier == Tier._diamond) {
            _usdAmount = 0;
            _avascaleAmount = 0;
            _oneAmount = 0;
        } else {
            _usdAmount = 125 * 10**18;
            _avascaleAmount = _getAvascaleAmount(_usdAmount);
            _oneAmount = _getOneAmount(_usdAmount);
        }

        _usdAmount = _usdAmount * 2;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function baseURI() public pure returns (string memory) {
        return _baseURI();
    }

    function tokenURI(uint256 tokenId)
        public
        view
        virtual
        override
        returns (string memory)
    {
        NFTDetails memory details = nftDetails[tokenId];
        require(details.expirationTimestamp != 0, "AvascaleNFT: !tokenId");
        return
            bytes(_baseURI()).length > 0
                ? string(
                    abi.encodePacked(_baseURI(), "/", _getJSON(details.tier))
                )
                : "";
    }

    /**************
     ** Internal **
     **************/

    function _baseURI() internal pure override returns (string memory) {
        return "ipfs://QmRzEgZUFCtwSgk7KsRBACSvWtLQnvN2EFU7uxuj9YSHkW";
    }

    function _getJSON(Tier _tier) internal pure returns (string memory) {
        if (_tier == Tier._30) {
            return "30.json";
        } else if (_tier == Tier._90) {
            return "90.json";
        } else if (_tier == Tier._diamond) {
            return "diamond.json";
        } else {
            return "360.json";
        }
    }

    function _getOneAmount(uint256 _usdAmount) internal view returns (uint256) {
        uint256 _oneUsdPrice = ONE_ORACLE.getPrice();

        (
            uint256 _oneUsdPriceFormatted,
            uint256 _usdAmountFormatted,

        ) = Decimals.formatToBiggerDecimals(8, 18, _oneUsdPrice, _usdAmount);

        uint256 _avascaleAmountFormatted = Decimals.divWithPrecision(
            _usdAmountFormatted,
            _oneUsdPriceFormatted,
            12
        );
        return
            Decimals.formatFromToDecimals(
                12,
                AVASCALE_DECIMALS,
                _avascaleAmountFormatted
            );
    }

    function _getAvascaleAmount(uint256 _usdAmount)
        internal
        view
        returns (uint256)
    {
        uint256 _avascaleUsdPrice = AVASCALE_ORACLE.getPrice();

        (
            uint256 _avascaleUsdPriceFormatted,
            uint256 _usdAmountFormatted,

        ) = Decimals.formatToBiggerDecimals(8, 18, _avascaleUsdPrice, _usdAmount);

        uint256 _avascaleAmountFormatted = Decimals.divWithPrecision(
            _usdAmountFormatted,
            _avascaleUsdPriceFormatted,
            12
        );
        return
            Decimals.formatFromToDecimals(
                12,
                AVASCALE_DECIMALS,
                _avascaleAmountFormatted
            );
    }

    function _getExpirationTimestamp(Tier _tier)
        internal
        view
        returns (uint256)
    {
        if (_tier == Tier._30) {
            return block.timestamp + SECONDS_PER_DAY * 30;
        } else if (_tier == Tier._90) {
            return block.timestamp + SECONDS_PER_DAY * 90;
        } else {
            return block.timestamp + SECONDS_PER_DAY * 360;
        }
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, tokenId);
    }
}
