// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./ODPSatellite.sol";

/// @notice Transaction-authorized claims about immutable passports, never truth verdicts.
/// @dev No owner, forwarding signatures, core writes, arbitrary calls or deletion.
contract ODPStatementJournal is ODPSatellite {
    enum Kind { None, IssuerCorrection, AuthorDeclaration, InstitutionalAssessment }
    enum Status { Missing, Active, Retracted, Superseded }
    struct Statement {
        string passportId;
        bytes32 dataHash;
        address author;
        string authorProfileId;
        Kind kind;
        bytes32 payloadHash;
        uint256 previousId;
        uint256 publishedAt;
    }
    struct Lifecycle {
        Status status;
        uint256 successorId;
        bytes32 reasonHash;
        uint256 changedAt;
    }
    struct Operation { bytes32 digest; uint256 statementId; }
    mapping(address => mapping(bytes32 => Operation)) public statementOperations;
    error InvalidStatementOperation();
    error StatementAlreadyCommitted(bytes32 operationId, uint256 statementId);
    error StatementOperationConflict(bytes32 operationId);
    event StatementOperationCommitted(address indexed author, bytes32 indexed operationId, uint256 indexed statementId, bytes32 digest);
    uint256 public statementCount;
    mapping(uint256 => Statement) private _statements;
    mapping(uint256 => Lifecycle) private _lifecycle;
    mapping(string => uint256[]) private _byPassport;
    mapping(address => uint256[]) private _byAuthor;
    error InvalidStatement();
    error NotStatementAuthor();
    error StatementNotActive();
    error StatementContextMismatch();
    event StatementPublished(uint256 indexed statementId, string indexed passportId,
        address indexed author, string passportIdText, string authorProfileId, Kind kind,
        bytes32 dataHash, bytes32 payloadHash, uint256 previousId, uint256 timestamp);
    event StatementStatusChanged(uint256 indexed statementId, Status status,
        uint256 successorId, bytes32 reasonHash, uint256 timestamp);

    constructor(address registry) ODPSatellite(registry) {}

    /// @notice A replacement atomically closes exactly one active statement by this caller.
    /// A stale concurrent replacement reverts rather than creating ambiguous branches.
    function publishStatement(string calldata passportId, Kind kind, bytes32 payloadHash,
        uint256 previousId, bytes32 operationId) external returns (uint256 id) {
        if (operationId == bytes32(0)) revert InvalidStatementOperation();
        bytes32 digest = keccak256(abi.encode("ODP-STATEMENT-OPERATION-0.7", block.chainid,
            address(odpRegistry), address(this), msg.sender, passportId, kind, payloadHash, previousId));
        Operation storage operation = statementOperations[msg.sender][operationId];
        if (operation.statementId != 0) {
            if (operation.digest != digest) revert StatementOperationConflict(operationId);
            revert StatementAlreadyCommitted(operationId, operation.statementId);
        }
        if (kind == Kind.None || payloadHash == bytes32(0)) revert InvalidStatement();
        string memory profile = _registered();
        IODPRegistry.PassportHeaderView memory h = odpRegistry.getPassportHeader(passportId);
        if (kind == Kind.IssuerCorrection) {
            if (msg.sender != h.creator) revert NotStatementAuthor();
            // Corrections can explain old or revoked passports; they do not revoke core.
        } else {
            if (odpRegistry.getPassportClassification(passportId).revoked) revert EC(11);
            if (kind == Kind.InstitutionalAssessment) _institution();
        }
        if (previousId != 0) {
            Statement storage old = _statements[previousId];
            if (old.author != msg.sender) revert NotStatementAuthor();
            if (_lifecycle[previousId].status != Status.Active) revert StatementNotActive();
            if (old.kind != kind || keccak256(bytes(old.passportId)) != keccak256(bytes(passportId))) revert StatementContextMismatch();
        }
        id = ++statementCount;
        bytes32 dataHash = odpRegistry.getPassportMedia(passportId).dataHash;
        _statements[id] = Statement(passportId, dataHash, msg.sender, profile, kind, payloadHash, previousId, block.timestamp);
        _lifecycle[id] = Lifecycle(Status.Active, 0, bytes32(0), block.timestamp);
        _byPassport[passportId].push(id);
        _byAuthor[msg.sender].push(id);
        if (previousId != 0) {
            _lifecycle[previousId] = Lifecycle(Status.Superseded, id, bytes32(0), block.timestamp);
            emit StatementStatusChanged(previousId, Status.Superseded, id, bytes32(0), block.timestamp);
        }
        operation.digest = digest;
        operation.statementId = id;
        emit StatementOperationCommitted(msg.sender, operationId, id, digest);
        emit StatementPublished(id, passportId, msg.sender, passportId, profile, kind, dataHash, payloadHash, previousId, block.timestamp);
    }

    /// @notice Own withdrawal remains possible after passport revocation.
    function retractStatement(uint256 id, bytes32 reasonHash) external {
        if (_statements[id].author != msg.sender) revert NotStatementAuthor();
        if (_lifecycle[id].status != Status.Active) revert StatementNotActive();
        if (reasonHash == bytes32(0)) revert InvalidStatement();
        _lifecycle[id] = Lifecycle(Status.Retracted, 0, reasonHash, block.timestamp);
        emit StatementStatusChanged(id, Status.Retracted, 0, reasonHash, block.timestamp);
    }
    function getStatement(uint256 id) external view returns (Statement memory, Lifecycle memory) {
        if (id == 0 || id > statementCount) revert InvalidStatement();
        return (_statements[id], _lifecycle[id]);
    }
    function getStatementsForPassportPaged(string calldata id, uint256 offset, uint256 limit)
        external view returns (uint256[] memory, uint256) { return _ids(_byPassport[id], offset, limit); }
    function getStatementsByAuthorPaged(address author, uint256 offset, uint256 limit)
        external view returns (uint256[] memory, uint256) { return _ids(_byAuthor[author], offset, limit); }
    function _ids(uint256[] storage a, uint256 offset, uint256 limit)
        private view returns (uint256[] memory out, uint256 total) {
        total = a.length;
        uint256 n = offset >= total ? 0 : total - offset;
        if (n > limit) n = limit;
        if (n > 100) n = 100;
        out = new uint256[](n);
        for (uint256 i; i < n; ++i) out[i] = a[offset + i];
    }
}
