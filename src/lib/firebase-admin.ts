import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function getPrivateKey(): string | undefined {
  const key = process.env.FIREBASE_PRIVATE_KEY;
  if (!key) return undefined;
  return key
    .replace(/^"(.*)"$/, "$1")
    .replace(/\\n/g, "\n");
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: getPrivateKey(),
    }),
  });
}

const adminDb = getFirestore();
const adminAuth = getAuth();

export { adminDb, adminAuth };
