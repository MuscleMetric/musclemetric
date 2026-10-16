// Validate through a service-only RPC; neither API keys nor user JWTs authorize a drain.
export async function authorizeWorker(
  token: string | null,
  verify: (token: string) => Promise<boolean>,
): Promise<boolean> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  try {
    return (await verify(token)) === true;
  } catch {
    return false;
  }
}
