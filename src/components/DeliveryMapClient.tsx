"use client";

// Client-Wrapper: `ssr: false` ist in Next 16 nur innerhalb von Client Components erlaubt.
// Server-Seiten (Checkout, Bestell-Tracking) nutzen diesen Wrapper.

import dynamic from "next/dynamic";
import type { DeliveryMapProps } from "@/components/DeliveryMap";

const DeliveryMap = dynamic(() => import("@/components/DeliveryMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] w-full rounded-xl border border-[#e5e5e8] bg-[#f4f4f5] flex items-center justify-center text-sm text-[#6b6b76]">
      Karte wird geladen …
    </div>
  ),
});

export default function DeliveryMapClient(props: DeliveryMapProps) {
  return <DeliveryMap {...props} />;
}
