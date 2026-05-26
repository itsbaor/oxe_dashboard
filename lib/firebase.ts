"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyA84OzSKhakpGg2kLseMe2KiVJen9IOLcw",
  authDomain: "exo-dashboard-98204.firebaseapp.com",
  projectId: "exo-dashboard-98204",
  storageBucket: "exo-dashboard-98204.firebasestorage.app",
  messagingSenderId: "301588847636",
  appId: "1:301588847636:web:edb2826ac1273c2c3cdb01",
  measurementId: "G-XPEKTMHRD2",
};

let cachedApp: FirebaseApp | null = null;
let cachedAnalytics: Analytics | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  if (!cachedApp) {
    const existing = getApps();
    cachedApp = existing.length ? existing[0]! : initializeApp(firebaseConfig);
  }
  return cachedApp;
}

export async function initAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null;
  if (cachedAnalytics) return cachedAnalytics;
  try {
    const supported = await isSupported();
    if (!supported) return null;
    const app = getFirebaseApp();
    if (!app) return null;
    cachedAnalytics = getAnalytics(app);
    return cachedAnalytics;
  } catch {
    return null;
  }
}
