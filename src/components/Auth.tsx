import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { motion } from 'motion/react';
import { LogIn, ChefHat, Sparkles } from 'lucide-react';

export default function Auth() {
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-orange-50 via-white to-rose-50 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
      {/* Background Decorations */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 20, ease: 'linear' }}
        className="absolute -top-20 -left-20 w-64 h-64 bg-orange-200/40 rounded-full blur-3xl"
      />
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ repeat: Infinity, duration: 25, ease: 'linear' }}
        className="absolute -bottom-20 -right-20 w-80 h-80 bg-rose-200/40 rounded-full blur-3xl"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white/80 backdrop-blur-xl rounded-[3rem] shadow-2xl shadow-orange-200/30 p-10 max-w-md w-full relative z-10 border-4 border-white"
      >
        <div className="flex flex-col items-center gap-6">
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
            className="w-24 h-24 bg-linear-to-br from-orange-400 to-rose-400 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-orange-200/50 relative"
          >
            <ChefHat className="w-12 h-12" />
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute -top-2 -right-2 bg-yellow-400 p-2 rounded-full border-4 border-white"
            >
              <Sparkles className="w-4 h-4 text-orange-900" />
            </motion.div>
          </motion.div>

          <div className="space-y-2">
            <h1 className="text-4xl font-black text-orange-900 tracking-tight">KitchenBuddy</h1>
            <p className="text-orange-600/80 font-medium italic">Your family's smart food manager</p>
          </div>

          <p className="text-gray-500 text-sm leading-relaxed">
            Reduce food waste, save money, and share with your community. 
            All in one fun and easy-to-use app!
          </p>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleLogin}
            className="w-full bg-linear-to-r from-orange-400 to-rose-400 hover:from-orange-500 hover:to-rose-500 text-white font-bold py-4 px-8 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-orange-200/50 group border-b-4 border-rose-600/20"
          >
            <LogIn className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            Sign in with Google
          </motion.button>

          <div className="flex items-center gap-4 w-full">
            <div className="h-px bg-gray-200 flex-1"></div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Safe & Secure</span>
            <div className="h-px bg-gray-200 flex-1"></div>
          </div>

          <div className="flex gap-4">
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-xl">🍎</div>
              <span className="text-[8px] font-bold text-gray-400 uppercase">Inventory</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-xl">🥘</div>
              <span className="text-[8px] font-bold text-gray-400 uppercase">Recipes</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-xl">🤝</div>
              <span className="text-[8px] font-bold text-gray-400 uppercase">Sharing</span>
            </div>
          </div>
        </div>
      </motion.div>

      <p className="mt-8 text-[10px] text-orange-400 font-bold uppercase tracking-widest">
        Made with ❤️ for families everywhere
      </p>
    </div>
  );
}
