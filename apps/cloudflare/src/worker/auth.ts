const encoder = new TextEncoder();

async function digest(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encoder.encode(text));
}

/** Compares two secrets in constant time; hashing first hides the length of either. */
export async function secretsEqual(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

function bearerToken(request: Request): string | null {
  const match = /^Bearer (\S+)$/.exec(request.headers.get("Authorization") ?? "");
  return match?.[1] ?? null;
}

/**
 * Device handshake check (docs/spec/03 §2). The token is checked before `car_id`, and both
 * failures give the same answer, so the response does not reveal which car ids exist.
 */
export async function isAuthorizedDevice(
  request: Request,
  carId: string,
  env: Env,
): Promise<boolean> {
  const token = bearerToken(request);
  const tokenOk = token !== null && (await secretsEqual(token, env.DEVICE_TOKEN));
  return tokenOk && carId === env.CAR_ID;
}
