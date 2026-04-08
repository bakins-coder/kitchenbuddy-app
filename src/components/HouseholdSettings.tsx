import { useState } from 'react';
import { doc, updateDoc, arrayUnion, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useHousehold } from '../contexts/HouseholdContext';
import { motion } from 'motion/react';
import { Home, Users, Copy, Check, LogIn, Plus, Shield, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';

export default function HouseholdSettings() {
  const { user, profile, household } = useHousehold();
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copyToClipboard = () => {
    if (household?.id) {
      navigator.clipboard.writeText(household.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleJoinHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !joinCode.trim()) return;

    setIsJoining(true);
    setError(null);

    try {
      const householdRef = doc(db, 'households', joinCode.trim());
      const householdSnap = await getDoc(householdRef);

      if (!householdSnap.exists()) {
        setError('Household not found. Please check the code.');
        setIsJoining(false);
        return;
      }

      // Add user to household members
      await updateDoc(householdRef, {
        members: arrayUnion(user.uid)
      });

      // Update user's householdId
      await updateDoc(doc(db, 'users', user.uid), {
        householdId: joinCode.trim(),
        role: 'member'
      });

      setJoinCode('');
      alert('Successfully joined the household!');
    } catch (err) {
      console.error(err);
      setError('Failed to join household. You might not have permission.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleCreateNewHousehold = async () => {
    if (!user) return;
    const name = prompt('Enter a name for your new household:');
    if (!name) return;

    try {
      const newId = `household_${Date.now()}_${user.uid}`;
      await setDoc(doc(db, 'households', newId), {
        name,
        adminId: user.uid,
        members: [user.uid]
      });

      await updateDoc(doc(db, 'users', user.uid), {
        householdId: newId,
        role: 'admin'
      });
      
      alert('New household created!');
    } catch (err) {
      console.error(err);
      alert('Failed to create household.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-black text-orange-900 uppercase tracking-tight">Household Settings</h2>
        <p className="text-gray-500 font-medium">Manage your kitchen and invite family members.</p>
      </div>

      {/* Current Household Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] p-8 shadow-xl border-4 border-orange-50 relative overflow-hidden"
      >
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center text-3xl shadow-inner">
              🏠
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-900">{household?.name || 'Loading...'}</h3>
              <p className="text-xs font-bold text-orange-500 uppercase tracking-widest mt-1">Current Instance</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-orange-50 rounded-2xl p-4 border-2 border-orange-100/50">
              <label className="text-[10px] font-black text-orange-400 uppercase tracking-widest block mb-2">Invite Code (Household ID)</label>
              <div className="flex gap-2">
                <code className="flex-1 bg-white px-4 py-2 rounded-xl font-mono text-sm text-orange-900 border border-orange-100 flex items-center overflow-x-auto">
                  {household?.id}
                </code>
                <button
                  onClick={copyToClipboard}
                  className="bg-white p-2 rounded-xl border border-orange-100 text-orange-500 hover:bg-orange-100 transition-colors"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-2 font-medium italic">Share this code with family members to let them join your kitchen.</p>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-gray-400" />
                <span className="text-sm font-bold text-gray-700">{household?.members.length} Members</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-orange-400" />
                <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">
                  {profile?.role === 'admin' ? 'You are Admin' : 'You are Member'}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-orange-50 rounded-full blur-3xl opacity-50" />
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Join Household */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-[2.5rem] p-8 shadow-xl border-4 border-blue-50"
        >
          <div className="flex items-center gap-3 mb-6">
            <LogIn className="w-6 h-6 text-blue-500" />
            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Join Family</h3>
          </div>
          <form onSubmit={handleJoinHousehold} className="space-y-4">
            <input
              type="text"
              placeholder="Enter Invite Code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              className="w-full bg-gray-50 border-2 border-blue-50 rounded-2xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors text-sm"
            />
            {error && <p className="text-[10px] text-red-500 font-bold">{error}</p>}
            <button
              type="submit"
              disabled={isJoining || !joinCode.trim()}
              className="w-full bg-blue-500 text-white font-bold py-3 rounded-2xl hover:bg-blue-600 transition-all shadow-lg shadow-blue-100 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isJoining ? 'Joining...' : 'Join Household'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </motion.div>

        {/* Create New Household */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-[2.5rem] p-8 shadow-xl border-4 border-green-50 flex flex-col"
        >
          <div className="flex items-center gap-3 mb-6">
            <Plus className="w-6 h-6 text-green-500" />
            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">New Instance</h3>
          </div>
          <p className="text-xs text-gray-500 mb-6 flex-1">
            Want to start a separate kitchen for your office or vacation home? Create a brand new instance.
          </p>
          <button
            onClick={handleCreateNewHousehold}
            className="w-full bg-green-500 text-white font-bold py-3 rounded-2xl hover:bg-green-600 transition-all shadow-lg shadow-green-100 flex items-center justify-center gap-2"
          >
            Create New
            <Plus className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    </div>
  );
}
