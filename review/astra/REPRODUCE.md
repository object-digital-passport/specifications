# Воспроизведение независимого ревью

База: `5d1db8fdd1c7bef013cdd98875671b9c9e9e4760`, ветка `audit/odp-07-review-and-redesign`.
Рабочее дерево до проверки было чистым. Пять Downloads-документов совпали с HEAD.

## Модели

Из корня checkout:

```sh
node review/astra/check-models.mjs
```

Нужен Node.js, внешних пакетов нет. Counter/72h — модели проекта, не исполнение нового Solidity.
Синтетический pagination fixture в R09 изменяет storage **только локальной EDR**.

## Полный безопасный прогон в отдельной копии

Команды создают новую временную копию и не включают неотслеживаемые секреты.
Переменные не переопределяют HOME/CODEX_HOME. Выполнять из корня checkout с добавленными файлами ревью:

```sh
ODP_REVIEW_TMP=$(mktemp -d /private/tmp/odp-astra-rerun.XXXXXX)
git archive 5d1db8fdd1c7bef013cdd98875671b9c9e9e4760 | tar -x -C "$ODP_REVIEW_TMP"
cp review/astra/legacy-tests/ODPAstraReview.test.js "$ODP_REVIEW_TMP/chain/deploy/test/"
cd "$ODP_REVIEW_TMP/chain"
npm ci
npx hardhat clean
npm run compile
npm test
npx hardhat test deploy/test/ODPAstraReview.test.js
```

Ожидается 165 passing вместе или 15 passing отдельно. Исходные PoC на HEAD дают 150 без добавленного файла.
В первом прогоне Node=22.23.2, npm=10.9.8, Hardhat=3.15.0, solc=0.8.20, Shanghai.

### Если общий compiler cache недоступен

В этой сессии общий кэш дал MultiProcessMutexTimeoutError после 60000 ms.
Временная копия config получила только эти две строки перед исходным содержимым:

```ts
import { setMockCacheDir } from "@nomicfoundation/hardhat-utils/global-dir";
setMockCacheDir("/private/tmp/odp-astra-cache");
```

В `/private/tmp/odp-astra-cache/compilers-v3/{wasm,macosx-amd64}/` скопированы
compiler files и `list.json` из `/Users/Andrei/Library/Caches/hardhat-nodejs/compilers-v3/`.
Общий кэш не очищался, lock не удалялся. После этого clean/compile/test прошли.
Это настройка расположения кэша, не изменение Solidity/compiler flags.
Не запускайте команды deploy:testnet/deploy:mainnet или verify для воспроизведения.

## Проверка базы и TypeChain

```sh
git status --short
git rev-parse HEAD
git rev-parse 'v0.7^{}'
git rev-list --count v0.7..d9e656e
git diff --stat d9e656e 5d1db8f
```

В выводе: target тега `00d08878...`, число 43. Compile временной копии пересоздаёт
`chain/types/`; в основном checkout эти файлы не менялись, откат не потребовался.
Для сравнения factory (переменная `ODP_REVIEW_TMP` из команд выше):

```sh
# Выполнить из исходного checkout:
diff chain/types/ethers-contracts/factories/ObjectDigitalPassport.sol/ObjectDigitalPassport__factory.ts \
  "$ODP_REVIEW_TMP/chain/types/ethers-contracts/factories/ObjectDigitalPassport.sol/ObjectDigitalPassport__factory.ts"
```

ABI-блок `_abi` совпадает; factory целиком — нет. Причина расхождения не установлена.

## Примечания о покрытиях

- Старые 36 PoC не означают 36 независимых findings с доказанным impact.
- R01 отрицательно проверяет предпосылку A1; R02 сужает H1; R03 дополняет D1.
- R06 проверяет гипотезу самого этого ревью: для этой all-pure библиотеки runtime
  совпадает с artifact напрямую. Гипотеза о необходимости self-address normalization отклонена.
- R11 детерминированно перебирает выбранные размеры и мутации, не случайный полный fuzz.
- R12 проверяет смену root при подстановке фактического ID; его fixture намеренно не
  является conforming edition-документом. Невозможность последовательной подготовки
  следует из зависимостей SPEC, не из отказа EVM принять произвольный hash.
- Slither/Mythril/Echidna/Forge в PATH отсутствовали и не запускались.
- Все подписи в тестах получены из публичных тестовых seed/EDR accounts.

## После реализации

Команды выше используют именно git archive старого коммита. Для текущего кода: `cd chain && npm ci && npx hardhat clean && npm run check`. Старые тесты сохранены в `review/astra/legacy-tests/`, их нельзя смешивать с новым ABI.
