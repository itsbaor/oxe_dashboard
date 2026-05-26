import type { Metadata } from "next";
import "./globals.css";
import FirebaseInit from "./FirebaseInit";

export const metadata: Metadata = {
  title: "oxe — UA dashboard",
  description: "Adjust report for the UA team",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <FirebaseInit />
      </body>
    </html>
  );
}
