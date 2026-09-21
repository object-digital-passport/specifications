// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./ODPSatellite.sol";

/// @notice Independent statements, never an authenticity verdict. One active episode per pair.
contract ODPPassportConcerns is ODPSatellite {
    struct Concern {
        string raisedBy;
        bytes32 reasonHash;
        string reasonUrl;
        uint64 raisedAt;
        uint64 withdrawnAt;
    }
    mapping(bytes32 => Concern) private _concerns;
    mapping(string => string[]) private _raisersOf;
    mapping(string => string[]) private _raisedOn;
    mapping(string => uint256) public activeConcernCount;
    event ConcernRaised(string indexed passportId, string indexed raisedBy,
        string passportIdText, string raisedByText, bytes32 reasonHash, string reasonUrl, uint256 timestamp);
    event ConcernWithdrawn(string indexed passportId, string indexed raisedBy,
        string passportIdText, string raisedByText, uint256 timestamp);
    constructor(address registry) ODPSatellite(registry) {}
    function raiseConcern(string calldata passportId, bytes32 reasonHash, string calldata reasonUrl) external {
        string memory id = _institution();
        if (!odpRegistry.passportExists(passportId)) revert EC(12);
        if (reasonHash == bytes32(0)) revert EC(133);
        if (bytes(reasonUrl).length > 512) revert EC(134);
        bytes32 key = keccak256(abi.encode(passportId, id));
        Concern storage c = _concerns[key];
        bool exists = bytes(c.raisedBy).length != 0;
        if (exists && c.withdrawnAt == 0) revert EC(135);
        if (!exists) {
            _raisersOf[passportId].push(id);
            _raisedOn[id].push(passportId);
        }
        _concerns[key] = Concern(id, reasonHash, reasonUrl, uint64(block.timestamp), 0);
        activeConcernCount[passportId]++;
        emit ConcernRaised(passportId, id, passportId, id, reasonHash, reasonUrl, block.timestamp);
    }
    function withdrawConcern(string calldata passportId) external {
        // Cleanup of an existing own statement requires its original author.
        string memory id = _registered();
        Concern storage c = _concerns[keccak256(abi.encode(passportId, id))];
        if (bytes(c.raisedBy).length == 0 || c.withdrawnAt != 0) revert EC(136);
        c.withdrawnAt = uint64(block.timestamp);
        activeConcernCount[passportId]--;
        emit ConcernWithdrawn(passportId, id, passportId, id, block.timestamp);
    }
    function getConcern(string calldata passportId, string calldata raisedBy) external view returns (Concern memory) {
        return _concerns[keccak256(abi.encode(passportId, raisedBy))];
    }
    function getConcernRaisersPaged(string calldata id, uint256 offset, uint256 limit)
        external view returns (string[] memory, uint256) { return _page(_raisersOf[id], offset, limit); }
    function getConcernsByRaiserPaged(string calldata id, uint256 offset, uint256 limit)
        external view returns (string[] memory, uint256) { return _page(_raisedOn[id], offset, limit); }
}
