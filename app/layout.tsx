import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdSync - Ad-to-Landing Page Personalizer",
  description:
    "Personalize your landing pages to match your ad creatives using AI-powered CRO optimization",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
