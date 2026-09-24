// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ODPErrors.sol";
import {
    ODPAnchorBits,
    PassportCoreMintInputs,
    PassportMintInputs
} from "./ODPPassportTypes.sol";

/// @dev Internal-only validation and formatting: no linked deployment or external calls.
library ODPPassportLib {
    uint8 private constant CONTENT_CLASS_STATIC = 1;
    uint8 private constant CONTENT_CLASS_EXECUTABLE = 6;
    uint8 private constant STATUS_CONCEPT = 1;
    uint8 private constant STATUS_ARCHIVED = 4;
    uint8 private constant AI_STATUS_NONE = 1;
    uint8 private constant AI_STATUS_GENERATED = 3;
    uint8 private constant VERIFY_SELF = 1;
    uint8 private constant VERIFY_HYBRID = 5;
    uint8 private constant EDITION_UNIQUE = 1;
    uint8 private constant EDITION_DYNAMIC = 4;

    function validateContentClass(uint8 contentClass) internal pure {
        if (!(contentClass >= CONTENT_CLASS_STATIC && contentClass <= CONTENT_CLASS_EXECUTABLE)) revert EC(84);
    }

    function validateLifecycleStatus(uint8 lifecycleStatus) internal pure {
        if (!(lifecycleStatus >= STATUS_CONCEPT && lifecycleStatus <= STATUS_ARCHIVED)) revert EC(85);
    }

    function validateAiStatus(uint8 aiStatus) internal pure {
        if (!(aiStatus >= AI_STATUS_NONE && aiStatus <= AI_STATUS_GENERATED)) revert EC(86);
    }

    function validateVerificationMethod(uint8 verificationMethod) internal pure {
        if (!(verificationMethod >= VERIFY_SELF && verificationMethod <= VERIFY_HYBRID)) revert EC(87);
    }

    function validateEditionModel(uint8 editionModel) internal pure {
        if (!(editionModel >= EDITION_UNIQUE && editionModel <= EDITION_DYNAMIC)) revert EC(88);
    }

    /// @dev Immutable on-chain card: no edit path exists after mint (typo = revoke + re-mint).
    function validatePassportCore(PassportCoreMintInputs memory core) internal pure {
        if (!(core.year > 0)) revert EC(9);
        if (!(core.month >= 1 && core.month <= 12)) revert EC(8);
        if (!(bytes(core.title).length > 0)) revert EC(91);
        if (!(bytes(core.title).length <= 128)) revert EC(92);
        if (!(bytes(core.authorName).length > 0)) revert EC(99);
        if (!(bytes(core.authorName).length <= 128)) revert EC(100);
        if (!(bytes(core.shortDescription).length > 0)) revert EC(101);
        if (!(bytes(core.shortDescription).length <= 256)) revert EC(102);
        if (!(bytes(core.domain).length <= 128)) revert EC(93);
        validateContentClass(core.contentClass);
        validateLifecycleStatus(core.lifecycleStatus);
        validateAiStatus(core.aiStatus);
        validateVerificationMethod(core.verificationMethod);
        validateEditionModel(core.editionModel);
    }

    function validateCommonMintInputs(PassportMintInputs memory m) internal pure {
        validatePassportCore(m.core);
        if (!(m.dataHash != bytes32(0))) revert EC(30);
        if (!(m.anchorsHash != bytes32(0))) revert EC(103);
        if (!(m.anchorTypesMask != 0)) revert EC(104);
    }

    function requireAnchorBits(uint32 mask, uint32 required) internal pure {
        if (!((mask & required) == required)) revert EC(105);
    }

    /// @dev Optional public copy of the primary photo: it needs a primary photo and must be a different file.
    function validatePreviewHash(PassportMintInputs memory m) internal pure {
        if (m.previewHash == bytes32(0)) return;
        if (m.imageHash == bytes32(0)) revert EC(142);
        if (m.previewHash == m.imageHash) revert EC(143);
    }

    function validatePhysicalMintInputs(PassportMintInputs memory m) internal pure {
        validateCommonMintInputs(m);
        if (!(m.fileHash == bytes32(0))) revert EC(106);
        if (!(m.imageHash != bytes32(0))) revert EC(107);
        requireAnchorBits(m.anchorTypesMask, ODPAnchorBits.PHYSICAL_REQUIRED);
        validatePreviewHash(m);
    }

    function validateDigitalMintInputs(PassportMintInputs memory m) internal pure {
        validateCommonMintInputs(m);
        if (!(m.fileHash != bytes32(0))) revert EC(29);
        requireAnchorBits(m.anchorTypesMask, ODPAnchorBits.DIGITAL_REQUIRED);
        validatePreviewHash(m);
    }

    function validateMixedMintInputs(PassportMintInputs memory m) internal pure {
        validateCommonMintInputs(m);
        if (!(m.fileHash != bytes32(0))) revert EC(29);
        if (!(m.imageHash != bytes32(0))) revert EC(107);
        requireAnchorBits(m.anchorTypesMask, ODPAnchorBits.PHYSICAL_REQUIRED | ODPAnchorBits.DIGITAL_REQUIRED);
        validatePreviewHash(m);
    }

    // ─── UTC calendar (ODP-ID / PRF-ID must match mint/proof block month in UTC) ─

    function _isLeapYear(uint256 y) private pure returns (bool) {
        return ((y % 4 == 0) && (y % 100 != 0)) || (y % 400 == 0);
    }

    function _daysInYear(uint256 y) private pure returns (uint256) {
        return _isLeapYear(y) ? 366 : 365;
    }

    function _daysInMonth(uint256 m, uint256 y) private pure returns (uint256) {
        if (m == 1 || m == 3 || m == 5 || m == 7 || m == 8 || m == 10 || m == 12) return 31;
        if (m == 4 || m == 6 || m == 9 || m == 11) return 30;
        return _isLeapYear(y) ? 29 : 28;
    }

    /// @dev Gregorian UTC: Unix `ts` seconds since 1970-01-01 00:00:00 UTC.
    /// @notice Reverts EC(83) if `ts` is outside a supported range (internal calendar loop bound).
    function utcYearMonthFromTimestamp(uint256 ts) internal pure returns (uint32 year, uint8 month) {
        uint256 dayCount = ts / 86400;
        uint256 y = 1970;
        for (uint256 i = 0; i < 600; i++) {
            uint256 diy = _daysInYear(y);
            if (dayCount < diy) {
                break;
            }
            dayCount -= diy;
            y++;
        }
        if (dayCount >= _daysInYear(y)) revert EC(83);

        uint256 m = 1;
        uint256 rem = dayCount;
        bool found = false;
        for (uint256 mi = 1; mi <= 12; mi++) {
            uint256 dim = _daysInMonth(mi, y);
            if (rem < dim) {
                m = mi;
                found = true;
                break;
            }
            rem -= dim;
        }
        if (!found) revert EC(83);

        year = uint32(y);
        month = uint8(m);
    }

    // ─── Internal string formatters ─

    function yearToString(uint32 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint32 temp = v;
        uint256 len = 0;
        while (temp > 0) {
            len++;
            temp /= 10;
        }
        bytes memory b = new bytes(len);
        for (uint256 i = len; i > 0; i--) {
            b[i - 1] = bytes1(uint8(48 + v % 10));
            v /= 10;
        }
        return string(b);
    }

    function monthToString(uint8 v) internal pure returns (string memory) {
        bytes memory b = new bytes(2);
        b[1] = bytes1(uint8(48 + v % 10));
        b[0] = bytes1(uint8(48 + (v / 10) % 10));
        return string(b);
    }

    function pad8(uint32 v) internal pure returns (string memory) {
        bytes memory b = new bytes(8);
        for (uint256 i = 8; i > 0; i--) {
            b[i - 1] = bytes1(uint8(48 + v % 10));
            v /= 10;
        }
        return string(b);
    }

    function formatOdpPassportId(uint32 year, uint8 month, uint32 n) internal pure returns (string memory) {
        return string(abi.encodePacked("ODP-", yearToString(year), "-", monthToString(month), "-", pad9(n)));
    }

    function formatPrfId(uint32 year, uint8 month, uint32 n) internal pure returns (string memory) {
        return string(abi.encodePacked("PRF-", yearToString(year), "-", monthToString(month), "-", pad8(n)));
    }

    function pad9(uint32 v) internal pure returns (string memory) {
        bytes memory b = new bytes(9);
        for (uint256 i = 9; i > 0; i--) {
            b[i - 1] = bytes1(uint8(48 + v % 10));
            v /= 10;
        }
        return string(b);
    }

    function pad3(uint32 v) internal pure returns (string memory) {
        bytes memory b = new bytes(3);
        b[2] = bytes1(uint8(48 + v % 10));
        b[1] = bytes1(uint8(48 + (v / 10) % 10));
        b[0] = bytes1(uint8(48 + (v / 100) % 10));
        return string(b);
    }

    /// @dev "C-482-930-174-005" style creator id body from type prefix and number.
    function buildCreatorId(bytes1 typePrefix, uint64 number) internal pure returns (string memory) {
        return string(
            abi.encodePacked(
                string(abi.encodePacked(typePrefix)),
                "-",
                pad3(uint32(number / 1_000_000_000)),
                "-",
                pad3(uint32((number / 1_000_000) % 1_000)),
                "-",
                pad3(uint32((number / 1_000) % 1_000)),
                "-",
                pad3(uint32(number % 1_000))
            )
        );
    }
}
