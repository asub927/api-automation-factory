/** Stable machine-readable exit codes for the factory CLI (KTD10 / KTD12). */
export const ExitCode = {
  OK: 0,
  UNKNOWN_COMMAND: 2,
  USAGE: 64,
  SETUP: 78,
  AUTH: 79,
  TRANSPORT: 80,
  CONTRACT: 81,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];
