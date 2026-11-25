// Error codes double as i18n keys under `errors.*`.
export type ErrorCode =
  | "not_found" // also used for "not a member" so group IDs can't be probed
  | "invalid_input"
  | "invalid_credentials"
  | "email_taken"
  | "rate_limited"
  | "reset_invalid" // unknown, expired or already used reset link
  | "google_failed"
  | "last_member"
  | "invite_invalid" // generic: unknown, expired, revoked or used up
  | "invite_email_mismatch"
  | "already_member"
  | "restore_expired"
  | "invalid_photo"
  | "invalid_file"
  | "invalid_assignee" // referenced user is not a member of the group
  | "invalid_dose" // not a scheduled dose of the plan, or too far in the future
  | "already_administered"
  | "invalid_occurrence"
  | "task_closed"
  | "has_history" // plan with recorded doses: end it instead of deleting
  | "invalid_reference" // linked item/plan/order is not in this group
  | "invalid_occurrence_log" // not a scheduled activity, or too far back/ahead
  | "routine_has_history"
  | "past_reminder" // custom reminder time already passed
  | "invalid_snooze"; // in the past or more than 30 days ahead

export class AppError extends Error {
  constructor(public code: ErrorCode) {
    super(code);
  }
}

/** True for SQLite UNIQUE/PK violations, including when wrapped by Drizzle (`cause` chain). */
export function isUniqueViolation(e: unknown): boolean {
  for (let x: unknown = e, i = 0; x && i < 5; x = (x as { cause?: unknown }).cause, i++) {
    if (/UNIQUE constraint failed|SQLITE_CONSTRAINT_(UNIQUE|PRIMARYKEY)/.test(String((x as Error).message ?? x))) return true;
  }
  return false;
}
