# Bank parser fixtures

Each file is one parser plus sample messages and what must come out of them. The TypeScript
(`apps/web/lib/bank-parser.ts`) and Kotlin (`BankParserEngine`) implementations are both tested
against every file here, so a parser behaves the same on the server (preview) and the phone.

Only ever use anonymised samples: change amounts, card digits and merchants; keep the format.
