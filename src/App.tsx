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
import HouseholdSettings from './components/HouseholdSettings';
import Auth from './components/Auth';
import { motion, AnimatePresence } from 'motion/react';
import { HouseholdProvider, useHousehold } from './contexts/HouseholdContext';

function AppContent() {
  const { user, profile, loading } = useHousehold();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const init = async () => {
      if (user && !profile && !loading) {
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);
        
        if (!userDoc.exists()) {
          const householdId = `household_${user.uid}`;
          const householdRef = doc(db, 'households', householdId);
          
          await setDoc(householdRef, {
            name: `${user.displayName || 'My'}'s Kitchen`,
            adminId: user.uid,
            members: [user.uid],
          });

          const newProfile: UserProfile = {
            uid: user.uid,
            displayName: user.displayName || 'User',
            email: user.email || '',
            photoURL: user.photoURL || '',
            role: 'admin',
            dietaryPreferences: [],
            householdId: householdId,
          };
          await setDoc(userRef, newProfile);
        }
      }
      if (!loading) setIsInitializing(false);
    };
    init();
  }, [user, profile, loading]);

  if (loading || isInitializing) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-linear-to-br from-orange-50 via-white to-rose-50">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-12 h-12 border-4 border-orange-300 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
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
              <Route path="/household" element={<HouseholdSettings />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </ErrorBoundary>
        </Layout>
      )}
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <Router>
      <HouseholdProvider>
        <AppContent />
      </HouseholdProvider>
    </Router>
  );
}
