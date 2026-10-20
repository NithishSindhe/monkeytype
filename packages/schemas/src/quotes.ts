import { z } from "zod";
import { LanguageSchema } from "./languages";

export const QuoteIdSchema = z
  .number()
  .int()
  .nonnegative()
  .or(z.string().regex(/^\d+$/).transform(Number));
export type QuoteId = z.infer<typeof QuoteIdSchema>;

export const QuoteDataQuoteSchema = z
  .object({
    id: z.number(),
    text: z.string(),
    britishText: z.string().optional(),
    source: z.string(),
    length: z.number(),
    approvedBy: z.string().optional(),
  })
  .strict();
export type QuoteDataQuote = z.infer<typeof QuoteDataQuoteSchema>;

export const QuoteDataSchema = z
  .object({
    language: LanguageSchema,
    groups: z.array(z.tuple([z.number(), z.number()])).length(4),
    quotes: z.array(QuoteDataQuoteSchema),
  })
  .strict();

export type QuoteData = z.infer<typeof QuoteDataSchema>;
