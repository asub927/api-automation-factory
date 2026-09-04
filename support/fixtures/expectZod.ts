import { expect } from "@playwright/test";
import type { z } from "zod";

export type FailureClass = "contract" | "auth" | "transport" | "setup";

export function expectZod(schema: z.ZodType, body: unknown): void {
  const result = schema.safeParse(body);
  if (!result.success) {
    const err = Object.assign(
      new Error(`contract: zod validation failed: ${result.error.message}`),
      { failureClass: "contract" as FailureClass },
    );
    expect(result.success, err.message).toBe(true);
  }
}
