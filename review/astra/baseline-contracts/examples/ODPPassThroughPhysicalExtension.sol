// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IODPExtension } from "../IODPExtension.sol";
import { PassportMintInputs } from "../ODPPassportTypes.sol";

/// @dev Test / reference `IODPExtension`: `payload` is already `abi.encode` of the v2
///      `PassportMintInputs` tuple expected by `mintPhysicalViaExtension` after `normalize`.
contract ODPPassThroughPhysicalExtension is IODPExtension {
    error InvalidPayload();

    function validate(bytes calldata payload) external pure {
        if (payload.length == 0) revert InvalidPayload();
        abi.decode(payload, (PassportMintInputs));
    }

    function normalize(bytes calldata payload) external pure returns (bytes memory) {
        return bytes(payload);
    }
}
