# Runtime size — redesigned 0.7

The core uses internal/inlined `ODPPassportLib` functions. There is no separately deployed library or link
reference. Satellites have independent runtime limits. `npm run compile` fails if any deployable runtime
exceeds 24576 bytes or has external library links; local EDR also enforces the limit.

The byte counts and build evidence in the [sealed audit checks](../review/audit-handoff-abi6/TESTS_AND_ANALYSIS.md) are those of ABI `0.7-redesign-6`. `0.7-redesign-7` adds code to the core and has not been remeasured or repackaged here. Earlier `review/v07/` measurements describe their own snapshot. The release roster is ten contracts (core plus nine satellites).
Never restore `allowUnlimitedContractSize: true` to hide an oversized production contract.
