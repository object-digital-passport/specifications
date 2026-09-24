// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Interface for mint-class extension contracts used by the extension mint router.
 * The `mintClass` byte is not the creator profile prefix (C/B/P/M).
 */
interface IODPExtension {
    function validate(bytes calldata data) external view;
    function normalize(bytes calldata data) external view returns (bytes memory);
}
