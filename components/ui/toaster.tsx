"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      richColors
      closeButton
      toastOptions={{
        style: {
          background: "#1f2937",
          border: "1px solid #374151",
          color: "#f3f4f6",
        },
        className: "toast",
      }}
    />
  );
}

