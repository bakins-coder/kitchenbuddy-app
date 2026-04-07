import { ReactNode, useState } from 'react';
import { User } from 'firebase/auth';
import { UserProfile } from '../types';
import Navigation from './Navigation';
import Assistant from './Assistant';
import { motion } from 'motion/react';
import { Bell, Search, User as UserIcon } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  user: User;
  profile: UserProfile | null;
}

export default function Layout({ children, user, profile }: LayoutProps) {
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <div className="min-h-screen bg-orange-50 font-sans text-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-orange-100 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <motion.div
            whileHover={{ scale: 1.1, rotate: 10 }}
            className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-orange-200"
          >
            <span className="text-xl font-bold">KB</span>
          </motion.div>
          <h1 className="text-xl font-bold text-orange-900 hidden sm:block">KitchenBuddy</h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search pantry..."
              className="pl-10 pr-4 py-2 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all w-64"
            />
          </div>

          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 hover:bg-orange-100 rounded-full transition-colors relative"
          >
            <Bell className="w-6 h-6 text-gray-600" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
          </button>

          <div className="flex items-center gap-2 pl-2 border-l border-gray-200">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-orange-200" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 bg-orange-200 rounded-full flex items-center justify-center">
                <UserIcon className="w-4 h-4 text-orange-600" />
              </div>
            )}
            <div className="hidden lg:block text-left">
              <p className="text-xs font-bold text-gray-900 leading-none">{user.displayName}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">{profile?.role || 'Member'}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6 pb-24 max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {children}
        </motion.div>
      </main>

      {/* Assistant Character */}
      <Assistant />

      {/* Bottom Navigation */}
      <Navigation />
    </div>
  );
}
