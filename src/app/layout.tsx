import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "My Reading Rocket",
  description: "Track the books you read, count your words and earn reading points.",
};

export const viewport: Viewport = { themeColor: "#fff8ec" };

const links = [
  { href: "/", label: "🏠 Home" },
  { href: "/add", label: "➕ Add a book" },
  { href: "/books", label: "📚 My books" },
  { href: "/parent", label: "🔒 Grown-ups" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body className={`${nunito.variable} antialiased`}>
        <header className="sticky top-0 z-10 border-b-2 border-line bg-paper/90 backdrop-blur">
          <nav className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-3">
            <Link href="/" className="mr-auto text-xl font-black tracking-tight">
              🚀 Reading Rocket
            </Link>
            {links.slice(1).map((l) => (
              <Link key={l.href} href={l.href} className="rounded-xl px-3 py-2 font-bold text-muted hover:bg-card hover:text-ink">
                {l.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
