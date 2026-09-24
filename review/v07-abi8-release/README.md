# Release-бандл ABI `0.7-redesign-8` — кандидат, владелец его не утверждал

**Это кандидат, а не утверждённый release.** Хеш ниже не является `approvedHash`. Владелец должен
независимо проверить его и явно утвердить. До этого deployment запрещён. Утверждение хеша ABI7
(`review/v07-abi7-release/`) на этот бандл не распространяется: исходники изменились.

Дата сборки: 2026-09-24. Бандл собран офлайн: без кошелька, без сети, без deployment и без публикации.

| Что | Значение |
|---|---|
| Файл | `release.json` (3 324 554 байта) |
| Canonical release hash (его сравнивают скрипты) | `sha256:7392c8214e7f1258e3dc886ce89f5b5df30f65bca6d0ace2d1b7b3006ca414d7` |
| SHA-256 байтов файла | `48eacdcd3157f78712218fa4a36fc9e67330204b4301fe4342cf7f426a6b1e7f` |
| `abiGeneration` | `0.7-redesign-8` |
| `buildInfoHash` | `sha256:5c196725347d176f2ba68c297f0832d937546cb2043c56eb389971c135216577` |
| Компилятор | solc-js `0.8.20+commit.a1b79de6`, `compilerHash sha256:5c509f76…c657`. Это тот же файл, что закреплён в ABI6/ABI7 (`review/audit-handoff-abi6/release/soljson.cjs`) |
| `dependencyHash` | `sha256:c154e3d0…5288` (тот же `chain/package-lock.json`, что у ABI7) |
| `sourceCommit` | `feb6743…` указан только для происхождения. Изменения ABI8 не закоммичены, реальные исходники вложены в бандл |
| `CONTRACT_VERSION` | 7 (упаковочный байт спецификации 0.7 не менялся) |

## Что изменилось относительно ABI7

- `PassportMintInputs`: после `imageHash` добавлено поле `bytes32 previewHash`. Порядок полей:
  `core, dataHash, imageHash, previewHash, fileHash, anchorsHash, anchorTypesMask, editionCommitment`.
- `previewHash` — SHA-256 точных байтов облегчённой публичной копии главного фото: JPEG не больше
  1 048 576 байт, без GPS. `bytes32(0)` означает, что копии нет. Поле хранится в `Passport`, не изменяется
  после минта и отдаётся `getPassportMedia` сразу после `imageHash`. `IODPRegistry` изменён так же.
- Правила минта (`ODPPassportLib.validatePreviewHash`, во всех трёх точках входа): ноль разрешён всегда;
  копия без `imageHash` отклоняется с `EC(142)`, копия с хешем, равным `imageHash`, — с `EC(143)`. Коды 142 и 143
  до этого нигде не использовались. В physical и mixed нулевой `imageHash` по-прежнему сначала даёт `EC(107)`.
- Событие `PassportMinted` не менялось. `previewHash` входит в дайджест mint-операции, потому что
  `_mintDigest` кодирует `m` целиком. Поэтому повтор с тем же `operationId` и другой копией даёт
  `MintOperationConflict`.
- Спутники, которые читают `getPassportMedia` (`ODPEditionUnits`, `ODPStatementJournal`, `ODPAuthorAttestation`),
  пересобраны с новым интерфейсом. Их байт-код изменился, логика нет.

## Размеры runtime (EIP-170 ≤ 24 576 байт)

| Контракт | Runtime, байт | Initcode, байт | Газ деплоя (локальный EVM) |
|---|---:|---:|---:|
| ObjectDigitalPassport (ядро) | **12 693** (ABI7: 12 481, +212) | 12 720 | **2 798 153** |
| ODPEditionUnits | 6 316 | 6 536 | 1 421 327 |
| ODPAuthorAttestation | 4 629 | 5 003 | 1 060 262 |
| ODPPassportConcerns | 4 437 | 4 615 | 1 017 355 |
| ODPHosting | 3 354 | 3 531 | 783 074 |
| ODPProfileDirectory | 2 385 | 2 556 | 573 741 |
| ODPRegistryRelations | 6 955 | 7 133 | 1 561 942 |
| ODPPassportProofRegistry | 6 684 | 6 876 | 1 502 754 |
| ODPWalletDocumentAnchor | 2 216 | 2 386 | 537 084 |
| ODPStatementJournal | 6 296 | 6 502 | 1 417 704 |

Газ деплоя взят из `gasUsed` манифеста локальной симуляции `ODP07MainnetPath.test.js`: chain 137 поднят
локально, это не Polygon. В `chain/deploy/mainnet-spend-policy.example.json` лимит ядра 3 220 000. Он выше
измеренного значения, но запас теперь около 15 %, а не 25 %, заявленных в файле. Пример не менялся.

## Газ минта (локальный EVM, `ODP07Gas.test.js`)

| Операция | ABI7 | ABI8 |
|---|---:|---:|
| Первый минт physical профилем C (холодные слоты профиля) | 596 582 | 598 794 |
| Следующий минт physical без копии | 545 282 | 547 494 |
| Следующий минт physical с копией (`previewHash ≠ 0`) | — | 567 829 |

Новое поле без копии стоит +2 212 газа. Копия добавляет ещё +20 335 газа: это новый слот хранения и calldata.
Цифры ABI7 получены тем же тестом на чистой выгрузке `HEAD` (`feb6743`).

## Как собран

1. Копия `chain/contracts`, `hardhat.config.ts`, `package*.json` в изолированный каталог вне репозитория
   (`node_modules` подключён ссылкой, новых пакетов нет); `npx hardhat compile --force` с `ODP_SOLC_JS`,
   указывающим на закреплённый soljson.
2. `node deploy/scripts/release.mjs BUILD_INFO SOLJSON ../review/v07-abi8-release/release.json` запущен из `chain/`.
   Упаковщик сверил список и содержимое исходников репозитория с build-info, дважды перекомпилировал
   standard-json и потребовал побайтного совпадения с записанным output.

Сборка не меняла репозиторий: хеши `chain/contracts`, `chain/abi`, `chain/types` и `schema` до и после совпадают.

## Что проверено

- ABI всех 10 контрактов в бандле побайтно совпадает с `chain/abi/*.json`. Runtime и initcode совпадают
  с артефактами обычной сборки `npm run compile` в репозитории.
- Core ABI содержит `finalizePassportForPrint`, `getPassportReleaseState`, `PERSONAL_REVOCATION_WINDOW`,
  `ISSUER_REVOCATION_WINDOW`; `REVOCATION_WINDOW` отсутствует. `getPassportMedia` возвращает
  `dataHash, imageHash, previewHash, fileHash, anchorsHash, anchorTypesMask, editionCommitment`.
- `ODP07MainnetPath.test.js` в репозитории переключён на этот бандл: **13 / 13 pass**. Тест проверяет полный
  deployment десяти контрактов через два локальных HTTP RPC, resume на всех стадиях, finality, расхождение
  runtime, nonce, бюджет, подделку плана и read-only preflight.
- Полный прогон, как в CI: `npx hardhat clean && npm run check` — EIP-170 OK, vectors OK (пять наборов),
  tools 26/26, hardhat 153/153. Тот же прогон на чистой копии `chain/` и `schema/` дал `chain/types` и
  `chain/abi`, побайтно равные рабочему дереву. Значит, шаг CI «Generated TypeChain matches sources» пройдёт,
  если эти файлы закоммитить вместе с исходниками.

## Чего этот кандидат не закрывает

- Утверждения хеша владельцем и независимого аудита. Аудит `0.7-redesign-6` не покрывает ни ABI7, ни ABI8.
- Slither не запускался: локально он не установлен.
- Реальных адресов, receipts, gas caps с живыми ценами и production generation.
