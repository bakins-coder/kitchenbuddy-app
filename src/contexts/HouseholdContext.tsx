import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile, Household } from '../types';

interface HouseholdContextType {
  user: User | null;
  profile: UserProfile | null;
  household: Household | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const HouseholdContext = createContext<HouseholdContextType | undefined>(undefined);

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (uid: string) => {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      const profileData = userDoc.data() as UserProfile;
      setProfile(profileData);
      
      if (profileData.householdId) {
        const householdDoc = await getDoc(doc(db, 'households', profileData.householdId));
        if (householdDoc.exists()) {
          setHousehold({ id: householdDoc.id, ...householdDoc.data() } as Household);
        }
      }
    }
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Listen to profile changes
        const unsubscribeProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), async (docSnap) => {
          if (docSnap.exists()) {
            const profileData = docSnap.data() as UserProfile;
            setProfile(profileData);
            
            if (profileData.householdId) {
              // Listen to household changes
              const unsubscribeHousehold = onSnapshot(doc(db, 'households', profileData.householdId), (hSnap) => {
                if (hSnap.exists()) {
                  setHousehold({ id: hSnap.id, ...hSnap.data() } as Household);
                }
              });
              return () => unsubscribeHousehold();
            }
          }
        });
        setLoading(false);
        return () => unsubscribeProfile();
      } else {
        setProfile(null);
        setHousehold(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  return (
    <HouseholdContext.Provider value={{ user, profile, household, loading, refreshProfile: () => fetchProfile(user?.uid || '') }}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  const context = useContext(HouseholdContext);
  if (context === undefined) {
    throw new Error('useHousehold must be used within a HouseholdProvider');
  }
  return context;
}
