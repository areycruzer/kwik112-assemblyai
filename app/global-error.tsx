'use client';

/** Last-resort boundary: even a root-level failure renders branded recovery. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#171717', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420 }}>
            <h2 style={{ fontSize: 18, margin: 0 }}>Kwik 112 hit an unexpected error</h2>
            <p style={{ color: '#c3cbc7', fontSize: 14, lineHeight: 1.5, marginTop: 8 }}>
              Independent synthetic demonstration; not an official 112 service. Reload to
              retry the console. Unsaved work may be lost.
            </p>
            {error.digest ? <p style={{ color: '#98a29d', fontSize: 11 }}>digest: {error.digest}</p> : null}
            <button type="button" onClick={reset} style={{ marginTop: 16, height: 36, padding: '0 16px', background: '#087b91', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
