import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Kwik 112 — AI voice call-taker and dispatch console for 112 emergencies",
  description:
    "Kwik 112 is a multilingual AI voice call-taker and auditable decision console that assists human emergency dispatchers.",
  openGraph: {
    type: "website",
    title: "Kwik 112 — AI voice call-taker and dispatch console",
    description:
      "Multilingual voice intake, immediate safety-first triage, and an auditable console where humans make every dispatch decision.",
    url: "/",
    siteName: "Kwik 112",
    images: [
      {
        url: "/screenshots/EmergencyCall.png",
        alt: "Kwik 112 voice call station and dispatch console",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ground text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
