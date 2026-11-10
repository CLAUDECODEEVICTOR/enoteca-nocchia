import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import PinGate from "@/components/PinGate";
import Inattivita from "@/components/Inattivita";
import BloccaZoom from "@/components/BloccaZoom";
import "./globals.css";

// The same two typefaces as the Nocchia Wine Bar site, chosen from the logo: Gilda Display for
// titles (a close relative of the NOCCHIA lettering), Hanken Grotesk for everything else.
const titoli = localFont({
  src: "./fonts/gilda.woff2",
  variable: "--font-titoli",
  weight: "400",
  display: "swap",
});

const testo = localFont({
  src: "./fonts/hanken.woff2",
  variable: "--font-testo",
  weight: "400 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nocchia Wine Bar",
  description: "Il tuo sommelier AI tascabile",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Nocchia Wine Bar",
  },
};

export const viewport: Viewport = {
  themeColor: "#3E6B2A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${titoli.variable} ${testo.variable}`}>
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="min-h-dvh bg-[var(--color-bg)] text-[var(--color-text)] font-[var(--font-testo)] antialiased">
        <noscript>
          <div style={{textAlign:"center",padding:"60px 20px",fontFamily:"Georgia,serif"}}>
            <h1 style={{color:"#111111",fontSize:"28px"}}>Nocchia Wine Bar</h1>
            <p style={{color:"#66625D",marginTop:"16px"}}>Questo dispositivo non supporta l&apos;app. Aggiorna iOS o usa un dispositivo recente.</p>
          </div>
        </noscript>
        <script dangerouslySetInnerHTML={{ __html: `
          try { eval("const a = 1; const b = a?.toString(); Promise.resolve()"); }
          catch(e) {
            document.body.innerHTML = '<div style="text-align:center;padding:60px 20px;font-family:Georgia,serif">' +
              '<h1 style="color:#111111;font-size:28px">Nocchia Wine Bar</h1>' +
              '<p style="color:#66625D;margin-top:16px;font-size:16px">Questo dispositivo non \\u00e8 compatibile con l\\u0027app.</p>' +
              '<p style="color:#66625D;margin-top:8px;font-size:14px">Aggiorna iOS dalle Impostazioni oppure usa un dispositivo pi\\u00f9 recente.</p></div>';
          }
        `}} />
        <PinGate>{children}</PinGate>
        <Inattivita />
        <BloccaZoom />
        {/* Fuori dal PinGate: così conta anche chi si ferma alla schermata del PIN.
            Analytics di Vercel non usa cookie e non profila i singoli visitatori. */}
        <Analytics />
      </body>
    </html>
  );
}
