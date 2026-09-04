export type FailureClass = "contract" | "auth" | "transport" | "setup";

export function classifyError(err: unknown): FailureClass {
  if (err && typeof err === "object" && "failureClass" in err) {
    const fc = (err as { failureClass: string }).failureClass;
    if (fc === "contract" || fc === "auth" || fc === "transport" || fc === "setup") {
      return fc;
    }
  }
  if (err instanceof Error) {
    if (/ECONNREFUSED|ENOTFOUND|fetch failed|socket/i.test(err.message)) return "transport";
    if (/secret|auth|401|403/i.test(err.message)) return "auth";
  }
  return "setup";
}
