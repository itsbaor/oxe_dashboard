"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/firebase";

export default function FirebaseInit() {
  useEffect(() => {
    initAnalytics();
  }, []);
  return null;
}
