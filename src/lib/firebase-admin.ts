import { cert, getApps, initializeApp, App } from "firebase-admin/app";
import { getAuth, Auth } from "firebase-admin/auth";

let _auth: Auth | null = null;

function getFirebaseAdmin(): Auth {
  if (_auth) return _auth;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin env vars are not set. Add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY to your .env file."
    );
  }

  const app: App =
    getApps().length === 0
      ? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
      : getApps()[0];

  _auth = getAuth(app);
  return _auth;
}

export const firebaseAdmin = {
  verifyIdToken: (token: string) => getFirebaseAdmin().verifyIdToken(token),
};
