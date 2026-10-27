import type { Metadata } from "next";
import { Shell } from "@/components/app/shell";

export const metadata: Metadata = { title: "Clientes", robots: { index: false } };

export default function LayoutApp({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
