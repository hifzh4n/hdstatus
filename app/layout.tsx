import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StatusHD Lab",
  description: "Evidence-first MP4 display metadata experiments",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
