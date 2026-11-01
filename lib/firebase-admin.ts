
import "server-only";

import {
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";

import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
  /\\n/g,
  "\n"
);

if (!projectId || !clientEmail || !privateKey) {
  throw new Error(
    "Missing Firebase Admin credentials. Check your .env.local file."
  );
}

const adminApp =
  getApps().find((app) => app.name === "cafeflow-admin") ??
  initializeApp(
    {
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    },
    "cafeflow-admin"
  );

export const adminDb = getFirestore(adminApp);
