'use client';

/** Client error boundary: a throw during a live demo degrades to a calm
 *  recovery panel instead of a raw Next.js error string on the projector. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#171717] p-6 text-white">
      <div className="max-w-md rounded border border-[#363c39] bg-[#202422] p-6">
        <h2 className="text-lg font-bold">Something interrupted the console</h2>
        <p className="mt-2 text-sm leading-6 text-[#c3cbc7]">
          The dispatcher console hit an unexpected error. Saved browser-local records may
          be recoverable; an unfinished call or unsaved changes may be lost. Reload the
          console, or continue with a scripted demo call. This is an independent synthetic
          demonstration, not an official 112 service.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-2xs text-[#98a29d]">digest: {error.digest}</p>
        ) : null}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={reset}
            className="h-9 rounded-[6px] bg-[#087b91] px-4 text-sm font-bold text-white hover:bg-[#06626f]"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="inline-flex h-9 items-center rounded-[6px] border border-[#4a514d] px-4 text-sm font-semibold hover:bg-black/30"
          >
            Reload console
          </a>
        </div>
      </div>
    </div>
  );
}
