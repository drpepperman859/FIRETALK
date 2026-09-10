import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, type User } from 'firebase/auth';
import { getDatabase, limitToLast, onValue, orderByChild, push, query, ref, type Unsubscribe } from 'firebase/database';

import type { ChatMessage } from './local-database';
import { firebaseConfig as defaultFirebaseConfig } from '../config/firebase-config';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || defaultFirebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || defaultFirebaseConfig.authDomain,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || defaultFirebaseConfig.databaseURL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || defaultFirebaseConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || defaultFirebaseConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || defaultFirebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || defaultFirebaseConfig.appId,
};

const isConfigured = Object.values(firebaseConfig).every(Boolean);
const app = isConfigured ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)) : undefined;
const auth = app ? getAuth(app) : undefined;
const database = app ? getDatabase(app) : undefined;
let signedInUser: Promise<User> | undefined;

export const firebaseMessagingEnabled = isConfigured;

function requireFirebase(): { auth: ReturnType<typeof getAuth>; database: ReturnType<typeof getDatabase> } {
  if (!auth || !database) {
    throw new Error('Firebase messaging is not configured. Add the VITE_FIREBASE_* variables.');
  }
  return { auth, database };
}

async function getUser(): Promise<User> {
  const { auth: firebaseAuth } = requireFirebase();
  signedInUser ??= firebaseAuth.currentUser ? Promise.resolve(firebaseAuth.currentUser) : signInAnonymously(firebaseAuth).then(({ user }) => user);
  return signedInUser;
}

export function conversationKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function subscribeToConversation(
  conversationId: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError: (error: Error) => void,
): Promise<Unsubscribe> {
  const [{ database: firebaseDatabase }, user] = await Promise.all([Promise.resolve(requireFirebase()), getUser()]);
  const messagesRef = query(ref(firebaseDatabase, `conversations/${conversationKey(conversationId)}/messages`), orderByChild('createdAt'), limitToLast(200));
  return onValue(messagesRef, (snapshot) => {
    const values = snapshot.val() as Record<string, Omit<ChatMessage, 'id' | 'own'> & { senderId: string; createdAt: number }> | null;
    const messages = Object.entries(values ?? {}).map(([id, message]) => ({
      id,
      author: message.author,
      text: message.text,
      time: message.time,
      own: message.senderId === user.uid,
    }));
    onMessages(messages);
  }, (error) => onError(error));
}

export async function sendFirebaseMessage(conversationId: string, message: Omit<ChatMessage, 'id' | 'own'>): Promise<void> {
  const [{ database: firebaseDatabase }, user] = await Promise.all([Promise.resolve(requireFirebase()), getUser()]);
  const messagesRef = ref(firebaseDatabase, `conversations/${conversationKey(conversationId)}/messages`);
  await push(messagesRef, { ...message, senderId: user.uid, createdAt: Date.now() });
}
