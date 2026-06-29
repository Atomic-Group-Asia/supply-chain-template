import type { Metadata } from "next";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import Sidebar from "@/components/Sidebar";
import { SidebarProvider, MobileTopBar, MobileBackdrop, LayoutGrid, DesktopSidebarShowButton } from "@/components/SidebarMobile";
import { PriceVisibilityProvider, EyeToggle } from "@/components/PriceVisibility";
import { HeaderLogoutButton } from "@/components/HeaderLogoutButton";
import { CurrentUserProvider } from "@/components/CurrentUserContext";
import "./globals.css";

// Headings only: Fraunces (serif) — h1/h2/h3 via CSS selector.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Everything else: JetBrains Mono.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Supply Chain Template",
  description: "Hybrid agent-first supply chain operations — fork-ready demo",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Role injected by middleware via x-user-role header. Sidebar hides
  // nav items based on this; pages enforce server-side via headers().
  const h = await headers()
  const role = (h.get('x-user-role') === 'viewer' ? 'viewer' : 'admin') as 'admin' | 'viewer'
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${jetbrainsMono.variable} antialiased`}>
        <CurrentUserProvider>
          <PriceVisibilityProvider>
            <SidebarProvider>
              <EyeToggle />
              <HeaderLogoutButton />
              <MobileTopBar />
              <MobileBackdrop />
              <DesktopSidebarShowButton />
              <LayoutGrid>
                <Sidebar role={role} />
                <main className="overflow-auto min-w-0">{children}</main>
              </LayoutGrid>
            </SidebarProvider>
          </PriceVisibilityProvider>
        </CurrentUserProvider>
      </body>
    </html>
  );
}