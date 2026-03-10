export const formatErrorMessage = (message: string, traceId: string): string => {
  return `I could not complete that request. ${message}\nTrace: ${traceId}`;
};

export const permissionDeniedMessage = (): string => {
  return "Permission denied for this action. Ask an admin to update your Slack role or channel policy.";
};

export const rateLimitedMessage = (): string => {
  return "Rate limit reached. Please wait a few seconds and try again.";
};
