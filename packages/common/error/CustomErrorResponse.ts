enum ErrorCodes {
  INCORRECT_PASSWORD = "INCORRECT_PASSWORD",
  USER_NOT_FOUND = "USER_NOT_FOUND",
  OAUTH_TOKEN_EXCHANGE_FAILED = "OAUTH_TOKEN_EXCHANGE_FAILED",
  VALIDATION_FAILED = "VALIDATION_FAILED",
  INVALID_SESSION = "INVALID_SESSION",
  INVALID_VERSION = "INVALID_VERSION",

  PAYMENT_CANCEL_ALREADY_SUCCEEDED = "PAYMENT_CANCEL_ALREADY_SUCCEEDED",
  PAYMENT_CANCEL_ALREADY_CANCELED = "PAYMENT_CANCEL_ALREADY_CANCELED",
  PAYMENT_CANCEL_ALREADY_EXPIRED = "PAYMENT_CANCEL_ALREADY_EXPIRED",

  PAYMENT_CANCELLATION_FAILED = "PAYMENT_CANCELLATION_FAILED",
}

type Code = ErrorCodes | (string & Record<never, never>);

class CustomErrorResponse extends Response {
  constructor(data: { message: string; code?: Code }) {
    super(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });

    Object.setPrototypeOf(this, CustomErrorResponse.prototype);
  }
}

export { CustomErrorResponse, ErrorCodes };
