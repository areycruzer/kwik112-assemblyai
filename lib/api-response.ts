/** Parse an API response without leaking JSON parser failures into the UI. */
export async function readApiJson<T>(response: Response, serviceName: string): Promise<T> {
  const raw = await response.text();
  let body: unknown;

  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(
      `${serviceName} is temporarily unavailable (${response.status}). Please try again.`,
    );
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `${serviceName} failed (${response.status}). Please try again.`;
    throw new Error(message);
  }

  if (!body || typeof body !== 'object') {
    throw new Error(`${serviceName} returned an empty response. Please try again.`);
  }

  return body as T;
}
