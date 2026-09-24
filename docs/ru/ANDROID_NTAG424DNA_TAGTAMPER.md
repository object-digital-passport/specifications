> **Исторический материал, заменён для ABI `0.7-redesign-8`.** NFC hardware/transport отложен; старое руководство не подтверждает реализованную или физически проверенную поддержку. Нормативна [английская SPEC](../../SPEC.md); см. [app handoff](../../ODP_07_APP_HANDOFF.md), [глоссарий](GLOSSARY.md), [дельту](../../ODP_07_ABI6_DOCUMENTATION_DELTA.md). Эта страница не разрешает кошелёк или внешнюю сеть.

# Android-гайд: NTAG 424 DNA TagTamper с ODP

Этот гайд описывает практический стек `ODP + NTAG 424 DNA TagTamper`, когда одного браузера уже недостаточно.

Коротко:

- `ODP web` нужен для выпуска паспорта, публикации `nfcPublicKey`, сборки `.odpass`, сборки `odpOffline` и якорения `ndppCommitmentHash`.
- `NXP TagWriter` нужен для записи tap carrier.
- `Tag TrustLink Android` (или другое совместимое приложение для NTAG 424 DNA) нужен для аутентификации чипа и чтения статуса TagTamper.

Это разные шаги доверия:

1. открытие carrier не равно аутентификации чипа,
2. аутентификация чипа ещё не означает привязку chip-to-passport,
3. привязка chip-to-passport делается сравнением результата чипа с on-chain `nfcPublicKey`,
4. проверка ODP `.odpass` / `dataHash` снова отдельна.

ODP остаётся слоем реестра и проверки хэшей. Android-приложение — это NFC runtime.

## Что делает каждый инструмент

### ODP web

Через ODP web вы:

- минтите паспорт
- записываете `sealType`, `nfcModel` и `nfcPublicKey`
- собираете `.odpass`
- генерируете компактный `odpOffline v0.1`
- экспортируете NFC carrier file
- при желании якорите отпечаток NDPP / offline payload on-chain
- проверяете запись в реестре, issuer и хэши файлов

Важно: `ndppCommitmentHash` якорит только **raw-байты offline / NDPP payload**. Он не хэширует весь NFC carrier целиком.

### NXP TagWriter

TagWriter нужен, когда вам надо записать carrier, который удобно открывается телефоном по тапу.

Типовой сценарий:

- записать стандартную URL / URI запись, ведущую на ODP Verify
- или записать экспортированный из [`frontend/passport.html`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/frontend/passport.html) (репозиторий сайта) файл `.ndef`

TagWriter пишет только carrier / entry layer. Он **не** аутентифицирует чип, **не** читает TagTamper status и **не** проверяет `.odpass` / `dataHash`.

### Tag TrustLink Android

Tag TrustLink нужен для операций уровня NTAG 424 DNA / TagTamper:

- валидация чипа
- secure URL / secure message flow
- чтение статуса TagTamper
- проверка через NXP-side project или validation endpoint

Tag TrustLink — это шаг аутентификации чипа. Сам по себе он **не** проверяет весь ODP-паспорт.

## Железо и софт

Минимально рекомендуемый набор:

- Android-телефон с включённым NFC
- реальный `NTAG424DNA_TAGTAMPER`
- ODP-паспорт, выпущенный как `physical` или `mixed`
- `nfcModel = NTAG424DNA_TAGTAMPER`
- `nfcPublicKey` реального чипа, записанный в ODP-паспорт

Для первого практического прототипа Android сейчас оптимален. iPhone может быть полезен через native app, но не через один только браузер.

## Рекомендуемый issuer flow

### 1. Подготовьте чип

Сначала провижньте физическую метку в своей NFC toolchain.

Минимально вам нужны:

- реальный чип
- публичный ключ или другой публичный verification material, который вы хотите опубликовать через ODP
- tamper-aware установка чипа на объект

### 2. Выпустите ODP-паспорт

В [`frontend/passport.html`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/frontend/passport.html) (репозиторий сайта):

1. выберите `physical` или `mixed`
2. выберите NFC seal (`sealType = 1` или `3`)
3. задайте `NFC model = NTAG424DNA_TAGTAMPER`
4. вставьте публичный ключ чипа в NFC-секцию
5. завершите минт как обычно

Так создаётся публичная ODP-запись, которая потом связывает результат проверки чипа с паспортом.

### 3. Соберите offline / NDPP payload

В модальном окне управления паспортом:

1. откройте `Manage passport`
2. перейдите в `Offline payload / NDPP`
3. сгенерируйте компактный payload
4. при необходимости включите NDPP-совместимый carrier mode
5. скачайте:
   - `CBOR` для raw payload bytes
   - `NDEF file` для Android / NFC-writing flow
6. при желании заякорите отпечаток payload в NDPP slot on-chain

Если вы используете NDPP-совместимый carrier mode:

- **первая** NDEF-запись — это Verify link
- **вторая** запись несёт детерминированный `odp:off` payload
- `ndppCommitmentHash` всё равно хэширует только raw-байты второй записи
- `ndppCommitmentUri` должен указывать на размещённую копию этих же raw public payload bytes, а не на страницу Verify

ODP web также показывает Android helper block с:

- Passport ID
- Verify link
- on-chain NFC model
- on-chain chip key

Эти значения удобно использовать при переходе в Android-инструменты.

## Flow через TagWriter

Используйте этот вариант, когда цель: "по тапу сразу открывать ODP verification".

Рекомендуемый паттерн:

1. держите стандартную URL / URI запись первой
2. ведите её на ODP Verify URL, например:

```text
https://your-site.example/verify.html?id=ODP-...
```

3. если нужен ODP offline payload на том же carrier, запишите экспортированный ODP `.ndef` файл

Практический смысл:

- URL-first — самый phone-friendly entry layer
- открытие этого URL — только шаг открытия carrier
- это ещё не аутентификация чипа и не решение о подлинности паспорта

## Flow через Tag TrustLink

Используйте этот путь, когда цель: "аутентифицировать NTAG 424 DNA TagTamper и прочитать tamper state".

Рекомендуемый операторский workflow:

1. приложите Android к объекту
2. в Tag TrustLink выполните chip-side validation / secure-message flow
3. прочитайте там же TagTamper state
4. сравните public key чипа из Android-результата с on-chain `nfcPublicKey` в ODP
5. затем используйте ODP Verify, чтобы сравнить:
   - Passport ID
   - issuer / creator
   - детали объекта
   - `.odpass` / `dataHash`
   - при необходимости image / offline payload hashes

Так вы получаете отдельные ответы на отдельные вопросы:

- "Аутентифицировался ли чип?"
- "Был ли tamper?"
- "Совпадает ли этот чип с on-chain passport binding?"
- "Совпадают ли канонические данные паспорта с реестром?"

## Workflow верификатора

Для полевого верификатора схема такая:

1. тапнуть объект
2. если тег открывает ODP Verify link, посмотреть запись паспорта
3. если нужна повышенная уверенность, использовать Tag TrustLink на Android
4. подтвердить отдельно:
   - carrier открывает ожидаемую ODP verifier entry point
   - чип аутентифицируется
   - tamper status приемлемый
   - public key чипа совпадает с on-chain `nfcPublicKey`
   - `.odpass` / `dataHash` / изображения совпадают при необходимости
   - опциональный NDPP / offline payload совпадает с `ndppCommitmentHash`, если этот слой используется

## Что web умеет и чего не умеет

Браузер уже умеет:

- показывать ODP registry record
- показывать `nfcModel` и `nfcPublicKey`
- генерировать `odpOffline`
- экспортировать NFC carrier files
- якорить NDPP / offline payload hash
- проверять `.odpass`, изображения и публичные данные из реестра

Браузер **не** умеет:

- низкоуровневый NTAG 424 DNA challenge-response
- чтение TagTamper status
- прямую secure-аутентификацию чипа

Поэтому практическая архитектура сейчас такая:

- `web` для ODP registry и payload tooling
- `Android app` для аутентификации чипа и статуса tamper

## Рекомендуемый MVP

Если нужен реалистичный первый деплой:

1. используйте ODP web для выпуска
2. используйте URL-first NFC carrier для tap entry
3. используйте Tag TrustLink Android для аутентификации чипа / статуса tamper
4. используйте ODP Verify для реестра и целостности файлов
5. сравнивайте Android-результат чипа с on-chain `nfcPublicKey`

Так вы уже сейчас получаете рабочую связку ODP + TagTamper, не дожидаясь отдельного custom native ODP verifier app.

Для объёма dedicated-app смотрите `docs/ANDROID_VERIFIER_MVP.md`.
