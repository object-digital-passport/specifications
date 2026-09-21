// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./IODPRegistry.sol";
import "./ODPErrors.sol";
abstract contract ODPSatellite {
    IODPRegistry public immutable odpRegistry;
    constructor(address registry) {
        if (registry.code.length == 0) revert EC(140);
        odpRegistry = IODPRegistry(registry);
    }
    function _registered() internal view returns (string memory id) {
        id = odpRegistry.getCreatorByWallet(msg.sender);
        if (bytes(id).length == 0) revert EC(3);
    }
    function _institution() internal view returns (string memory id) {
        id = _registered();
        bytes1 t = odpRegistry.getCreator(id).typePrefix;
        if (t != "P" && t != "M") revert EC(6);
    }
    function _page(string[] storage a, uint256 offset, uint256 limit)
        internal view returns (string[] memory out, uint256 total) {
        total = a.length;
        uint256 n = offset >= total ? 0 : total - offset;
        if (n > limit) n = limit;
        if (n > 100) n = 100;
        out = new string[](n);
        for (uint256 i; i < n; ++i) out[i] = a[offset+i];
    }
}
