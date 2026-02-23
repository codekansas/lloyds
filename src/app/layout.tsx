import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Cormorant_Garamond, IBM_Plex_Mono } from "next/font/google";

import { auth } from "@/auth";
import { TopNav } from "@/components/top-nav";

import "./globals.css";

const mastheadFont = Bodoni_Moda({
  variable: "--font-masthead",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const bodyFont = Cormorant_Garamond({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const utilityFont = IBM_Plex_Mono({
  variable: "--font-utility",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Lloyd's Coffee House",
  description:
    "An AI-powered coffee house for high-agency thinkers: curated long-form intelligence and meaningful matching.",
};

export const viewport: Viewport = {
  themeColor: "#f3ebd8",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const user = session?.user;

  return (
    <html lang="en">
      <body
        className={`${mastheadFont.variable} ${bodyFont.variable} ${utilityFont.variable} lloyds-body`}
      >
        <TopNav
          isAuthed={Boolean(user)}
          acceptedManifesto={Boolean(user?.manifestoAcceptedAt)}
          isBanned={Boolean(user?.accountBannedAt)}
          userName={user?.name}
        />
        <main className="lloyds-main">{children}</main>
      </body>
    </html>
  );
}
