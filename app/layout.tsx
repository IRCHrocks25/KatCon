import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ChannelsProvider } from "@/contexts/ChannelsContext";
import { ClientsProvider } from "@/contexts/ClientsContext";
import { Toaster } from "@/components/ui/toaster";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Katalyst Concierge",
  description: "AI assistant for Katalyst CRM",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ErrorBoundary>
          <AuthProvider>
            <ChannelsProvider>
              <ClientsProvider>
                {children}
                <Toaster />
              </ClientsProvider>
            </ChannelsProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
