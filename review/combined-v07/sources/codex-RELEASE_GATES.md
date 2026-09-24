# Решения до выпуска

## Контракты и bytecode — до неизменяемого deployment

1. Закрепить reviewed source snapshot + полный standard-json input/settings + compiler hash + lockfile + ABI/creation/runtime templates. Ветка и HEAD не идентифицируют это рабочее дерево. Только clean build полного набора.
2. Закрыть IA-01 либо ввести независимый, документированный blocking контроль до broadcast и после каждого receipt. Проверка artifacts/factory/runtime обязательна; sourceDirty/complete не заменяют approved build identity.
3. Принять явное решение по IA-03: гарантированная journal idempotency требует нового контрактного API; client-only recovery можно реализовать позже, но ограничения должны быть приняты до фиксации адреса. Не считать одинаковый payload новой гарантией уникальности claim.
4. Подтвердить согласованный IA-04: stopped/lost issuer не завершит unopened edition. Если продукт требует иного, менять права до deployment и заново проверять; не обещать будущий ремонт спутника по тому же адресу.
5. Зафиксировать compiler policy по COMPILER_AND_BUILD, выбранную production chain/EVM compatibility и actual deployment manifest; сейчас approvedGenerations пуст.
6. Локальная rehearsal окончательного deployment tooling: interruption до send, после send до receipt, после receipt до сохранения; nonce competition; runtime mismatch; partial manifest. Собственный текущий audit выполнил mock happy/error paths и реальные локальные deploy/pins, но не полную end-to-end репетицию production script с настоящим signer.

Подтверждённого Critical/High исправления core по результатам этого аудита не требуется. Это не основание обходить перечисленные gates. Реальные подписи, публичные сети, freeze, publication в аудите не выполнялись.

## Приложение — до выдачи пользователям

- Исправить IA-02 (zero root preflight) и IA-05 (fatal UTF-8 CLI); это можно сделать без смены core address, но до использования tooling для реальных mint.
- Durable mint operation journal сохраняется до отправки: exact bytes, chain/registry/issuer/opID, replacements, receipt, finality. Pending/unknown/success различаются; rollover не создаёт автоматически новый ID.
- Edition workflow: сохранённая подготовка → mint → confirmed open → anchor/commitment equality → финальные labels. Полный address list и tree/count validation; скрытые master/codes отделены от публичного архива.
- Statement/proof transaction recovery, envelope/payload validation, status/history UI, duplicate reconciliation. Withdrawal во всех namespaces; не выбирать последнюю независимую запись как истину.
- ZIP importer/exporter и ресурсы: лимиты файлов/байт/глубины до allocation, duplicate paths, traversal/symlink/encrypted/nested архивы, UTF-8/NFC/duplicate keys; deterministic payload roundtrip. Текущий helper принимает уже распакованные entries и не решает эти задачи.
- Trusted generation и chain evidence: receipt operationId действительно соответствует successful mint в выбранном registry/issuer; block hash/finality/reorg; свежие stopped/revoked/withdrawn состояния; historical runtime/ABI. Самопредъявленный generation manifest не источник доверия.
- IA-06: unsupported для каждой capability; отдельные оси integrity/identity/chain/history/physical. Нет общего зелёного verdict по QR/hash/activation.
- Проверка app с текущей ABI0.7-redesign-4 и независимыми vectors. Приложение не входило в текущий код-аудит, APP_HANDOFF — требования, не evidence реализации.

## Продукт и операции — до печати/публичного запуска

- Точные wire formats компактного QR и индивидуального unit package, проверка физической печати/сканирования. Не включать concealed code в публичный URL/telemetry.
- Кому и как выдаётся полный .odpass, кто хранит дополнительные copies, сроки хранения, восстановление при смене телефона/исчезновении сайта. Без такого решения переносимость остаётся форматом, не пользовательским результатом.
- Историческая политика issuer/institution identity и evidence retention, а не доверие текущему DNS. P/M — self-selected, concerns не голосование.
- Операционный процесс компрометации/потери ключа, необратимого stop и ошибочной печати. Отдельный author key не восстановит issuer права.
- NFC исключён из текущего scope и не блокирует выпуск, если не обещан как работающая проверка.

## Что допустимо позже без смены адреса

Дополнительные зеркала неизменённых bytes, индексаторы/клиенты с сохранением старых namespaces, типизированные reader reports, ZIP implementation, исправления CLI, расширение trust evidence вне core. Для неоткрытого edition после stop, изменения immutable payload, гарантий on-chain journal idempotency, изменения finite key-set или замены закреплённого activation satellite такой гарантии нет: потребуется отдельное решение, часто новый адрес/паспорт/носитель.
