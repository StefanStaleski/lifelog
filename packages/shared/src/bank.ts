import type { BankParser } from "./api";

export type ParsedTransaction = {
  amount: number;
  currency: string;
  merchant: string | null;
  direction: "debit" | "credit";
};

const CURRENCY_ALIASES: Record<string, string> = { ДЕН: "MKD", DEN: "MKD", "€": "EUR" };

/** "1.250,00" with decimal "," → 1250; "12 500,50" → 12500.5; "89.90" with "." → 89.9. */
export function parseAmount(raw: string, decimal: "," | "."): number | null {
  const thousands = decimal === "," ? /[.'\s ]/g : /[,'\s ]/g;
  const n = Number(raw.trim().replace(thousands, "").replace(decimal, "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * Applies one parser to a message. Same rules as the phone's BankParserEngine (Kotlin); both are
 * tested against packages/shared/fixtures/bank.
 */
export function parseBankMessage(text: string, parser: BankParser): ParsedTransaction | null {
  const m = new RegExp(parser.pattern, "is").exec(text);
  const rawAmount = m?.groups?.amount;
  if (!m || !rawAmount) return null;
  const amount = parseAmount(rawAmount, parser.decimal);
  if (amount === null) return null;
  const cur = m.groups?.currency?.trim().toUpperCase();
  const merchant = m.groups?.merchant?.replace(/\s+/g, " ").trim().slice(0, 100) || null;
  return {
    amount,
    currency: (cur && (CURRENCY_ALIASES[cur] ?? cur)) || parser.currency,
    merchant,
    direction: parser.direction,
  };
}
