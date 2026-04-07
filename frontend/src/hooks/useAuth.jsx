import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { auth, firebaseConfigError } from '../utils/firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!firebaseConfigError);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return () => {};
    }

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      configError: firebaseConfigError,
      login: (email, password) => {
        if (!auth) {
          throw new Error(firebaseConfigError || 'Firebase auth is unavailable.');
        }
        return signInWithEmailAndPassword(auth, email, password);
      },
      signup: (email, password) => {
        if (!auth) {
          throw new Error(firebaseConfigError || 'Firebase auth is unavailable.');
        }
        return createUserWithEmailAndPassword(auth, email, password);
      },
      logout: () => {
        if (!auth) {
          return Promise.resolve();
        }
        return signOut(auth);
      }
    }),
    [loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
