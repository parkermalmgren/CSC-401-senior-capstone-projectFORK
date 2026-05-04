// app/layout.tsx
import "./globals.css";
import ConditionalNavbar from "@/components/ConditionalNavbar";

export const metadata = {
  title: "SmartPantry",
  description: "Track what you have. Waste less. Save more.",
  icons: {
    icon: "/Green_Basket_Icon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white antialiased">
        {/* Navbar (hidden on landing and login pages) */}
        <ConditionalNavbar />
        {/* Spacer for navbar on pages where it shows */}
<div className="pt-16 min-h-screen bg-brand-bg">{children}</div>      </body>
    </html>
  );
}