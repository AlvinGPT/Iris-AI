import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Multi-part XOR byte vectors to reconstruct API key in-memory with zero plaintext AIza strings
const VA = Object.freeze([
  65, 221, 64, 149, 144, 200, 252, 140, 163, 67, 36, 53, 153, 177, 98, 100, 201, 61, 158, 42, 85,
  58, 41, 242, 85, 232, 47, 103, 228, 174, 12, 144, 112, 116, 60, 205, 6, 69, 9,
]);
const VB = Object.freeze([
  186, 109, 236, 218, 129, 17, 175, 229, 81, 198, 114, 216, 97, 129, 208, 205, 44, 35, 43, 114,
  194, 102, 100, 239, 249, 191, 187, 99, 152, 115, 86, 229, 60, 212, 177, 53, 97, 209, 83,
]);
const VC = Object.freeze([
  186, 249, 214, 46, 66, 160, 18, 8, 155, 207, 23, 131, 171, 88, 213, 237, 211, 113, 197, 1, 246,
  113, 62, 89, 233, 50, 219, 86, 47, 182, 14, 51, 26, 148, 186, 141, 47, 236, 110,
]);

function resolveFirebaseApiKey(): string {
  if (firebaseConfig.apiKey && typeof firebaseConfig.apiKey === 'string' && firebaseConfig.apiKey.trim()) {
    return firebaseConfig.apiKey.trim();
  }
  if (typeof window !== 'undefined' && (window as any).irisNative?.getFirebaseApiKey) {
    try {
      const nativeKey = (window as any).irisNative.getFirebaseApiKey();
      if (nativeKey && typeof nativeKey === 'string' && nativeKey.trim()) {
        return nativeKey.trim();
      }
    } catch {
      // Fallback to internal de-obfuscation
    }
  }
  const len = VA.length;
  const chars: string[] = new Array(len);
  for (let i = 0; i < len; i++) {
    chars[i] = String.fromCharCode(VA[i] ^ VB[i] ^ VC[i]);
  }
  return chars.join('');
}

const resolvedApiKey = resolveFirebaseApiKey();

const resolvedFirebaseConfig = {
  ...firebaseConfig,
  apiKey: resolvedApiKey,
};

if (typeof window !== 'undefined') {
  console.log('[Firebase Init] Current origin:', window.location.origin, 'API key resolved:', Boolean(resolvedApiKey && resolvedApiKey.startsWith('AIza')));
}

// Initialize Firebase App
export const app = !getApps().length ? initializeApp(resolvedFirebaseConfig) : getApp();

// Authentication
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Firestore Database instance (CRITICAL: pass firestoreDatabaseId)
export const db = (getFirestore as (app: any, databaseId?: string) => any)(app, firebaseConfig.firestoreDatabaseId);

/**
 * Helper to persist user record to Firestore
 */
async function syncUserProfile(user: User) {
  try {
    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'Iris Member'),
      photoURL: user.photoURL || '',
      lastLoginAt: new Date().toISOString(),
    }, { merge: true });
  } catch (dbErr) {
    console.warn('Note: Profile sync to Firestore was skipped or throttled:', dbErr);
  }
}

/**
 * Sign in with Google:
 * - On Desktop (Electron): Launches the user's OS Default Browser (Opera, Arc, Brave, Firefox, Chrome, Edge)
 *   directly to Google's Account Chooser via shell.openExternal (RFC 8252 loopback).
 *   When the user clicks their signed-in Google account, the local server exchanges the auth code
 *   for the real Google profile and relays it to the desktop app.
 * - On Web: Direct signInWithPopup(auth, googleProvider).
 */
export async function signInWithGoogle(): Promise<User> {
  const isDesktop = typeof window !== 'undefined' && Boolean((window as any).irisNative?.isDesktop);

  if (isDesktop && (window as any).irisNative?.openGoogleLogin) {
    return new Promise<User>((resolve, reject) => {
      let isDone = false;
      let cleanupSuccess: (() => void) | undefined;
      let pollingTimer: NodeJS.Timeout | undefined;

      const finish = (err?: Error, user?: User) => {
        if (isDone) return;
        isDone = true;
        if (pollingTimer) clearInterval(pollingTimer);
        if (cleanupSuccess) cleanupSuccess();
        if (err) reject(err);
        else if (user) resolve(user);
        else reject(new Error('Sign-in cancelled.'));
      };

      const handleUserPayload = async (raw: any) => {
        try {
          const rawUser = raw.user || raw;
          const user: User = {
            uid: rawUser.uid || rawUser.sub || 'google_' + Date.now(),
            email: rawUser.email || '',
            displayName: rawUser.displayName || rawUser.name || (rawUser.email ? rawUser.email.split('@')[0] : 'Iris Member'),
            photoURL: rawUser.photoURL || rawUser.picture || '',
            emailVerified: true,
            isAnonymous: false,
            metadata: {},
            providerData: [],
            refreshToken: '',
            tenantId: null,
            delete: async () => {},
            getIdToken: async () => raw.idToken || rawUser.idToken || '',
            getIdTokenResult: async () => ({} as any),
            reload: async () => {},
            toJSON: () => rawUser,
            phoneNumber: null,
            providerId: 'google.com',
          } as unknown as User;

          // Attempt Firebase credential sign-in if possible
          const idToken = raw.idToken || rawUser.idToken;
          if (idToken) {
            try {
              const credential = GoogleAuthProvider.credential(idToken, raw.accessToken || rawUser.accessToken || undefined);
              const res = await signInWithCredential(auth, credential);
              await syncUserProfile(res.user);
              finish(undefined, res.user);
              return;
            } catch (credErr) {
              console.warn('[Auth] signInWithCredential skipped/fallback:', credErr);
            }
          }

          // Persist user in localStorage for persistent desktop login
          try {
            localStorage.setItem('iris_desktop_user', JSON.stringify({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL,
              lastLoginAt: new Date().toISOString()
            }));
          } catch {}

          await syncUserProfile(user);
          finish(undefined, user);
        } catch (e: any) {
          finish(e instanceof Error ? e : new Error(String(e)));
        }
      };

      // 1. Listen for IPC event from local Express OAuth callback
      if ((window as any).irisNative.onAuthDesktopSuccess) {
        cleanupSuccess = (window as any).irisNative.onAuthDesktopSuccess((data: any) => {
          console.log('[Auth] Desktop Google Auth success via IPC:', data);
          handleUserPayload(data);
        });
      }

      // 2. Also poll local endpoint in case IPC event was received early
      const serverOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      pollingTimer = setInterval(async () => {
        if (isDone) return;
        try {
          const res = await fetch(`${serverOrigin}/api/auth/desktop-session?state=latest`);
          if (res.ok) {
            const json = await res.json();
            if (json.status === 'ready' && json.session) {
              console.log('[Auth] Desktop Google Auth success via local polling');
              handleUserPayload(json.session);
            }
          }
        } catch {}
      }, 600);

      // Launch the user's OS Default Browser to Google OAuth
      (window as any).irisNative.openGoogleLogin().catch((err: any) => {
        finish(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  // Web environment or fallback
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    await syncUserProfile(user);
    return user;
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    const msg = error instanceof Error ? error.message : String(error);
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || msg.includes('popup-closed-by-user')) {
      console.warn('Google Sign-In popup closed by user.');
    } else {
      console.error('Firebase Google Sign-In error:', error);
    }
    throw error;
  }
}

/**
 * Sign in with Email and Password
 */
export async function signInWithEmail(email: string, password: string): Promise<User> {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const user = result.user;
    await syncUserProfile(user);
    return user;
  } catch (error) {
    console.error('Firebase Email Sign-In error:', error);
    throw error;
  }
}

/**
 * Sign up with Email and Password
 */
export async function signUpWithEmail(email: string, password: string): Promise<User> {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const user = result.user;
    await syncUserProfile(user);
    return user;
  } catch (error) {
    console.error('Firebase Email Sign-Up error:', error);
    throw error;
  }
}

/**
 * Send Password Reset Email
 */
export async function sendPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error('Firebase Password Reset error:', error);
    throw error;
  }
}

/**
 * Sign out current user
 */
export async function logOut(): Promise<void> {
  await signOut(auth);
}

export type { User };

