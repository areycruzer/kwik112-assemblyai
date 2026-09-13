import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#171717] p-6 text-white">
      <div className="max-w-md text-center">
        <p className="font-mono text-xs font-bold uppercase text-[#78dcff]">404</p>
        <h1 className="mt-2 text-2xl font-bold">This line is not connected</h1>
        <p className="mt-3 text-sm leading-6 text-[#c3cbc7]">
          The page you asked for does not exist in this demonstration build.
          Independent synthetic demonstration; not an official 112 service.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className="inline-flex h-9 items-center rounded-[6px] bg-[#087b91] px-4 text-sm font-bold hover:bg-[#06626f]">Overview</Link>
          <Link href="/dashboard" className="inline-flex h-9 items-center rounded-[6px] border border-[#4a514d] px-4 text-sm font-semibold hover:bg-black/30">Console</Link>
        </div>
      </div>
    </main>
  );
}
