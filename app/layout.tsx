import type { Metadata, Viewport } from "next";
import { Playfair_Display, DM_Sans } from "next/font/google";
import PinGate from "@/components/PinGate";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["700"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Enoteca Nocchia",
  description: "Il tuo sommelier AI tascabile",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Enoteca Nocchia",
  },
};

export const viewport: Viewport = {
  themeColor: "#8B1A1A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${playfair.variable} ${dmSans.variable}`}>
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="min-h-dvh bg-[var(--color-bg)] text-[var(--color-text)] font-[var(--font-dm-sans)] antialiased">
        <noscript>
          <div style={{textAlign:"center",padding:"60px 20px",fontFamily:"Georgia,serif"}}>
            <h1 style={{color:"#785E14",fontSize:"28px"}}>Enoteca Nocchia</h1>
            <p style={{color:"#6B6860",marginTop:"16px"}}>Questo dispositivo non supporta l&apos;app. Aggiorna iOS o usa un dispositivo recente.</p>
          </div>
        </noscript>
        <script dangerouslySetInnerHTML={{ __html: `
          try { eval("const a = 1; const b = a?.toString(); Promise.resolve()"); }
          catch(e) {
            document.body.innerHTML = '<div style="text-align:center;padding:60px 20px;font-family:Georgia,serif">' +
              '<h1 style="color:#785E14;font-size:28px">Enoteca Nocchia</h1>' +
              '<p style="color:#6B6860;margin-top:16px;font-size:16px">Questo dispositivo non \\u00e8 compatibile con l\\u0027app.</p>' +
              '<p style="color:#6B6860;margin-top:8px;font-size:14px">Aggiorna iOS dalle Impostazioni oppure usa un dispositivo pi\\u00f9 recente.</p></div>';
          }
        `}} />
        <PinGate>{children}</PinGate>
      </body>
    </html>
  );
}
