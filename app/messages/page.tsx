"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setStorageItem } from "@/lib/utils/storage";

export default function MessagesPage() {
  const router = useRouter();

  useEffect(() => {
    // Set active tab to messages and redirect to main page
    setStorageItem("activeTab", "messages");
    router.replace("/");
  }, [router]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
    </div>
  );
}
