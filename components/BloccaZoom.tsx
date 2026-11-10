"use client";

import { useEffect } from "react";

// The shop iPad is a kiosk: a customer pinching the page leaves it zoomed for the next one.
// Safari ignores user-scalable=no, so the pinch is stopped here; double-tap zoom is off in globals.css.
export default function BloccaZoom() {
  useEffect(() => {
    const ferma = (e: Event) => e.preventDefault();
    const dueDita = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener("gesturestart", ferma, { passive: false });
    document.addEventListener("gesturechange", ferma, { passive: false });
    document.addEventListener("touchmove", dueDita, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", ferma);
      document.removeEventListener("gesturechange", ferma);
      document.removeEventListener("touchmove", dueDita);
    };
  }, []);
  return null;
}
