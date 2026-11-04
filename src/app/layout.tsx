import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spread: Live Market Terminal",
  description: "A live order book terminal built with Next.js, React and TypeScript.",
};

export const viewport: Viewport = {
  themeColor: "#0B0709",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
