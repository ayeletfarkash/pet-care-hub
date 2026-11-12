// Error codes double as i18n keys under `errors.*`.
export type ErrorCode =
  | "not_found" // also used for "not a member" so group IDs can't be probed
  | "forbidden"
  | "invalid_input"
  | "invalid_credentials"
  | "email_taken"
  | "rate_limited"
  | "last_admin"
  | "invite_invalid" // generic: unknown, expired, revoked or used up
  | "invite_email_mismatch"
  | "already_member"
  | "restore_expired"
  | "invalid_photo";

export class AppError extends Error {
  constructor(public code: ErrorCode) {
    super(code);
  }
}
