import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, getDocFromServer, doc } from 'firebase/firestore';

// Import the Firebase configuration from the provisioned file
import firebaseAppletConfig from '../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: firebaseAppletConfig.apiKey || import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: firebaseAppletConfig.authDomain || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: firebaseAppletConfig.projectId || import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: firebaseAppletConfig.storageBucket || import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: firebaseAppletConfig.messagingSenderId || import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: firebaseAppletConfig.appId || import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: firebaseAppletConfig.measurementId || import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
};

const firestoreDatabaseId = firebaseAppletConfig.firestoreDatabaseId || import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID;

// Check if we have a valid API key before initializing
const isFirebaseConfigured = firebaseConfig.apiKey && 
                            firebaseConfig.apiKey !== 'YOUR_API_KEY' && 
                            firebaseConfig.apiKey !== '';

let app: any;
let db: any;
let auth: any;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    // Respect the named database if it's provided in the config
    db = getFirestore(app, firestoreDatabaseId);
    auth = getAuth(app);

    // Validate Connection to Firestore
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        }
        // Skip logging for other errors, as this is simply a connection test.
      }
    };
    testConnection();
  } catch (error) {
    console.error('Firebase initialization failed:', error);
  }
} else {
  console.warn('Firebase is not configured. Please set up Firebase in the settings or via environment variables.');
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData.map((provider: any) => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export { db, auth, isFirebaseConfigured };
export default app;
