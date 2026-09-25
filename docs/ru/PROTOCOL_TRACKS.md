# Границы реализации ODP 0.7 — ABI 0.7-redesign-8

Нормативна [английская SPEC](../../SPEC.md); [английская версия](../PROTOCOL_TRACKS.md).
Прежние Track A/B заменены; снимок сохранён в [аудиторском SOURCE](../../review/audit-handoff-abi6/SOURCE/docs/ru/PROTOCOL_TRACKS.md).

| Область | Реализовано локально | Отдельная незавершённая приёмка |
|---|---|---|
| Core | Прямой mint зарегистрированного issuer, operationId, immutable карточка/hashes, отзыв issuer до 72h для C и до 24h для B/P/M и только до фиксации печати, необратимая `finalizePassportForPrint`, неуникальные модели тиража только для B, неизменяемый `previewHash` облегчённой публичной копии фото | Независимый аудит, пересобранный release-бандл для этой ABI и production generation |
| Девять satellites | Journal/proof replay, собственный withdrawal, edition commitment/activation, hosting/directory/relations/concerns/author/wallet anchors | Клиент, identity и свежесть истории |
| Tools | Canonical strict UTF-8, semantic/list/tree, custom bit31, digests, statement и распакованный bundle | Безопасный ZIP и полный путь приложения |
| Deployment | Фиксированный release, manifest/resume, spend/nonce limits, два RPC/finality, итоговая проверка десяти контрактов | Новое разрешение и реальное production evidence |

Mint-agent, profile stop, governance/pause, owner transfer, восстановление ключа и unit-passport hooks отсутствуют.
Фиксация печати — отметка в реестре: ядро не наблюдает принтер и не предотвращает внешнюю печать, а печатный
шлюз приложения здесь не реализован. Запечатанный пакет `0.7-redesign-6` и утверждённый бандл `0.7-redesign-7` эту ABI не подтверждают;
см. [дельту](../../ODP_07_ABI6_DOCUMENTATION_DELTA.md).
EIP-712 author attestation реализована отдельным спутником: one-shot слот с выбранным issuer ключом и отдельным signer withdrawal; личность человека не устанавливается. Core не вызывает спутники. EIP-170 проверяется локально: [политика размера](EIP170_STRATEGY.md). Правила хранения, публикации и оплаты — SPEC §22.19; IPFS-адрес из хеша ещё требует тестового вектора. NFC и физическая проверка QR остаются открытыми или отложенными. Сеть — Polygon mainnet, Amoy не используется; поколение развёрнуто в Polygon mainnet 2026-09-25 (реестр `0x3281492981DCD492cc2F7c17398134e1D3B5CA1F`, все адреса — SPEC §7).
