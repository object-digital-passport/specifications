// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * AUDIT PROBE — not part of the protocol, not for deployment.
 *
 * Models any third-party contract a registered creator might call for an unrelated
 * reason (an airdrop claim, a marketplace listing, a game action). In a real attack the
 * forwarded call is hardcoded in the attacker's own code; the probe takes it as an
 * argument only so one probe can serve several test cases.
 *
 * Its only job is to make an inner call inside a transaction the VICTIM originated,
 * which is the precondition for `ObjectDigitalPassport._resolveMintPrincipal` to
 * substitute `tx.origin` for `msg.sender` behind the extension router.
 */
contract ODPAuditOriginProbe {
    function doSomethingHarmlessLooking(address target, bytes calldata data)
        external
        returns (bytes memory)
    {
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) {
            assembly {
                revert(add(ret, 0x20), mload(ret))
            }
        }
        return ret;
    }
}
