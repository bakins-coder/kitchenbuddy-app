/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile } from './types';
import { ErrorBoundary } from './lib/utils';
import Layout from './components/Layout';
import Inventory from './components/Inventory';
import ShoppingList from './components/ShoppingList';
import Recipes from './components/Recipes';
import Community from './components/Community';
import Analytics from './components/Analytics';
import Auth from './components/Auth';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Ensure default household exists
        const householdRef = doc(db, 'households', 'default-household');
        const householdDoc = await getDoc(householdRef);
        if (!householdDoc.exists()) {
          await setDoc(householdRef, {
            name: 'Default Household',
            adminId: firebaseUser.uid,
            members: [firebaseUser.uid],
          });
        }

        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data() as UserProfile;
          if (!data.householdId) {
            await setDoc(doc(db, 'users', firebaseUser.uid), { ...data, householdId: 'default-household' }, { merge: true });
            setProfile({ ...data, householdId: 'default-household' });
          } else {
            setProfile(data);
          }
        } else {
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName || 'User',
            email: firebaseUser.email || '',
            photoURL: firebaseUser.photoURL || '',
            role: 'admin',
            dietaryPreferences: [],
            householdId: 'default-household',
          };
          await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-orange-50">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <Router>
      <AnimatePresence mode="wait">
        {!user ? (
          <Auth key="auth" />
        ) : (
          <Layout key="layout" user={user} profile={profile}>
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Inventory />} />
                <Route path="/shopping" element={<ShoppingList />} />
                <Route path="/recipes" element={<Recipes />} />
                <Route path="/community" element={<Community />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </ErrorBoundary>
          </Layout>
        )}
      </AnimatePresence>
    </Router>
  );
}
