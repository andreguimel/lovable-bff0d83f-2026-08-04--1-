import { z } from "zod";

export const UUID = z.string().uuid();
export const NonEmptyString = z.string().min(1).max(500);
export const Email = z.string().email().max(255);
export const Phone = z.string().regex(/^\+?[0-9\s\-()]{6,20}$/);

export const Pagination = z.object({
  page: z.number().int().positive().default(1),
  perPage: z.number().int().min(1).max(100).default(20),
});

export const CorrelationHeader = z.object({
  correlationId: UUID.optional(),
});
