import type { Metadata } from "next";
import { headers } from "next/headers";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";

// The only web font in the project: self-hosted at build time, no runtime
// request, and one typeface for every weight the interface needs.
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const configuredOrigin = process.env.EMBERTOP_PUBLIC_URL?.trim();
  const host = (
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000"
  )
    .split(",", 1)[0]
    .trim();
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",", 1)[0]
    .trim();
  const localHost =
    /^(?:localhost|127(?:\.\d+){3}|\[::1\])(?::\d+)?$/i.test(host);
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : localHost
        ? "http"
        : "https";
  let origin: URL;
  try {
    const candidate = new URL(
      configuredOrigin || `${protocol}://${host}`,
    );
    if (
      !["http:", "https:"].includes(candidate.protocol) ||
      candidate.username ||
      candidate.password
    ) {
      throw new Error("Invalid metadata origin");
    }
    origin = new URL(candidate.origin);
  } catch {
    origin = new URL("http://localhost:3000");
  }
  const basePath = process.env.EMBERTOP_BASE_PATH?.trim() || "";
  const socialImage = new URL(`${basePath}/og.png`, origin).toString();

  return {
    metadataBase: origin,
    title: {
      default: "Embertop — Watch your server as fire",
      template: "%s · Embertop",
    },
    description:
      "Ambient observability for people who run things. Every request is a spark, CPU lifts the flame, and memory keeps the ember bed glowing.",
    applicationName: "Embertop",
    authors: [{ name: "Sumin Lim", url: "https://limsumin.com" }],
    creator: "Sumin Lim",
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: "Embertop",
      title: "Embertop — Every request leaves a spark",
      description:
        "A campfire made of your server's traffic. No charts, no alerts — just something to glance at.",
      images: [
        {
          url: socialImage,
          width: 1200,
          height: 630,
          alt: "Embertop showing live server traffic as a glowing fire",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Embertop — Every request leaves a spark",
      description:
        "A campfire made of your server's traffic. No charts, no alerts — just something to glance at.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={instrumentSans.variable}>
      <body>{children}</body>
    </html>
  );
}
