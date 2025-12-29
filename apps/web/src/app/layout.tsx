import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Claude Code Cloud",
  description: "Your cloud dev machine with Claude Code, accessible anywhere.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
