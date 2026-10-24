import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
} as const;
export type OperationType = (typeof OperationType)[keyof typeof OperationType];

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let connectionTested = false;
export async function testFirestoreConnection(): Promise<void> {
  if (connectionTested) return;
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

function sanitizeId(raw: string, maxLen = 128): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, maxLen);
  return cleaned || 'doc-1';
}

export async function ensureUserProfileSynced(user: User): Promise<void> {
  if (!user.uid || !user.emailVerified) return;
  const uid = sanitizeId(user.uid, 128);
  const path = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  const safeDisplayName = (user.displayName || user.email?.split('@')[0] || 'EduNexus Advisor').slice(0, 120);
  const safeEmail = (user.email || 'advisor@edunexus.ai').slice(0, 160);

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid,
        displayName: safeDisplayName,
        email: safeEmail,
        role: 'advisor',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        displayName: safeDisplayName,
        email: safeEmail,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function signInWithGooglePopup(): Promise<User> {
  const credential = await signInWithPopup(auth, googleProvider);
  await ensureUserProfileSynced(credential.user);
  return credential.user;
}

export async function signOutFromFirebase(): Promise<void> {
  await firebaseSignOut(auth);
}

export function subscribeToFirebaseAuth(callback: (user: User | null) => void): () => void {
  void testFirestoreConnection();
  return onAuthStateChanged(auth, (user) => {
    callback(user);
  });
}

export async function syncInterventionToFirestore(params: {
  id?: string;
  studentId: string;
  title: string;
  interventionType: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status?: 'planned' | 'in_progress' | 'under_review' | 'completed';
  description: string;
}): Promise<string | null> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return null;

  const docId = sanitizeId(params.id || `intv-${Date.now()}`, 128);
  const path = `interventions/${docId}`;
  const ref = doc(db, 'interventions', docId);

  const safeStudentId = sanitizeId(params.studentId || 'STU1024', 64);
  const safeTitle = (params.title || 'Academic Support Check-In').trim().slice(0, 160);
  const safeType = (params.interventionType || 'academic_tutoring').trim().slice(0, 64);
  const safePriority = ['low', 'medium', 'high', 'urgent'].includes(params.priority)
    ? params.priority
    : 'medium';
  const safeStatus =
    params.status && ['planned', 'in_progress', 'under_review', 'completed'].includes(params.status)
      ? params.status
      : 'planned';
  const safeDesc = (params.description || 'Advisor support action logged.').slice(0, 1000);

  try {
    await setDoc(ref, {
      authorUid: currentUser.uid,
      studentId: safeStudentId,
      title: safeTitle,
      interventionType: safeType,
      priority: safePriority,
      status: safeStatus,
      description: safeDesc,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function syncCopilotSessionToFirestore(params: {
  sessionId: string;
  title: string;
  modelTier: 'gemini-3.1-flash-lite' | 'gemini-3.8-flash' | 'gemini-4-argon';
  lastMessagePreview: string;
  messageCount: number;
}): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return;

  const docId = sanitizeId(params.sessionId, 128);
  const path = `copilot_sessions/${docId}`;
  const ref = doc(db, 'copilot_sessions', docId);

  const safeTitle = (params.title || 'EduNexus Copilot Session').trim().slice(0, 140) || 'Copilot Session';
  const safeModel: 'gemini-3.1-flash-lite' | 'gemini-3.8-flash' | 'gemini-4-argon' = [
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
    'gemini-4-argon',
  ].includes(params.modelTier)
    ? params.modelTier
    : 'gemini-3.8-flash';
  const safePreview = (params.lastMessagePreview || '').slice(0, 500);
  const safeCount = Math.max(0, Math.min(500, Math.floor(params.messageCount)));

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        ownerUid: currentUser.uid,
        title: safeTitle,
        modelTier: safeModel,
        lastMessagePreview: safePreview,
        messageCount: safeCount,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        title: safeTitle,
        modelTier: safeModel,
        lastMessagePreview: safePreview,
        messageCount: safeCount,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function listUserCopilotSessionsFromFirestore(): Promise<
  Array<{
    id: string;
    title: string;
    modelTier: string;
    lastMessagePreview: string;
    messageCount: number;
  }>
> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return [];

  const path = 'copilot_sessions';
  try {
    const q = query(collection(db, 'copilot_sessions'), where('ownerUid', '==', currentUser.uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        title: String(data.title || 'Copilot Thread'),
        modelTier: String(data.modelTier || 'gemini-3.8-flash'),
        lastMessagePreview: String(data.lastMessagePreview || ''),
        messageCount: Number(data.messageCount || 0),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
