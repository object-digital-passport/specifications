// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
/// @dev Local test fixture only, excluded from deployment manifest/export lists.
contract ODPTestWallet {
    address private immutable owner = msg.sender;
    function execute(address target, bytes calldata data) external returns (bytes memory) {
        require(msg.sender == owner);
        (bool ok, bytes memory result) = target.call(data);
        if (!ok) assembly { revert(add(result, 32), mload(result)) }
        return result;
    }
}
