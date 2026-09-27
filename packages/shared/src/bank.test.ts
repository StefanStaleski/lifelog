import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BankParserSchema } from "./api";
import { parseAmount, parseBankMessage } from "./bank";

const dir = join(import.meta.dirname, "../fixtures/bank");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

describe.each(files)("bank fixture %s", (file) => {
  const fx = JSON.parse(readFileSync(join(dir, file), "utf8"));
  const parser = BankParserSchema.parse(fx.parser);

  it.each(fx.samples.map((s: { text: string; expected: unknown }) => [s.text, s.expected]))(
    "%s",
    (text, expected) => {
      expect(parseBankMessage(text as string, parser)).toEqual(expected);
    },
  );
});

describe("parseAmount", () => {
  it("handles both decimal styles and thousands separators", () => {
    expect(parseAmount("1.250,00", ",")).toBe(1250);
    expect(parseAmount("12 500,50", ",")).toBe(12500.5);
    expect(parseAmount("1,250.75", ".")).toBe(1250.75);
    expect(parseAmount("0,00", ",")).toBeNull();
    expect(parseAmount("abc", ".")).toBeNull();
  });
});
