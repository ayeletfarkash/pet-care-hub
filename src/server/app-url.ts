/** Absolute URL for emailed links and Google redirects. Never built from the Host header: a forged one could leak reset tokens. */
export const appUrl = (path: string) => new URL(path, process.env.APP_URL || "http://localhost:3000").toString();
