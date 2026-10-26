import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, User, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    if (mode === 'signin') {
      const { error } = await signInWithEmail(email, password);
      if (error) setError(error);
      else onClose();
    } else {
      if (username.trim().length < 2) {
        setError('ناوی بەکارهێنەر کەمتر لە ٢ پیت نابێت');
        setLoading(false);
        return;
      }
      const { error } = await signUpWithEmail(email, password, username.trim());
      if (error) setError(error);
      else onClose();
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setGoogleError(null);
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setGoogleError(error);
      setGoogleLoading(false);
    }
    // On success, the browser redirects to Google — no need to close the modal here.
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', duration: 0.35 }}
            className="relative w-full max-w-md bg-[#0d0e12]/95 backdrop-blur-2xl rounded-3xl border shadow-2xl overflow-y-auto"
            style={{ borderColor: 'rgba(var(--accent-rgb), 0.2)' }}
          >
            {/* Header */}
            <div className="p-6 pb-0 flex items-center justify-between">
              <h2 className="text-2xl font-black text-white">
                {mode === 'signin' ? 'چوونەژوورەوە' : 'دروستکردنی هەژمار'}
              </h2>
              <button onClick={onClose} className="p-2 text-white/50 hover:text-white bg-white/5 rounded-full transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Google Sign-In — native OAuth redirect */}
              <button
                onClick={handleGoogle}
                disabled={googleLoading || loading}
                className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 font-bold py-3.5 rounded-2xl transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {googleLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )}
                {googleLoading ? 'ئامادەکردنی گووگڵ...' : 'بەردەوامبە بە گووگڵ'}
              </button>
              {googleError && (
                <p className="text-red-400 text-xs font-medium text-center -mt-2">{googleError}</p>
              )}

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10"></div>
                <span className="text-white/30 text-xs">یان</span>
                <div className="flex-1 h-px bg-white/10"></div>
              </div>

              {/* Email/Password form */}
              <form onSubmit={handleSubmit} className="space-y-3">
                {mode === 'signup' && (
                  <div className="relative">
                    <User className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                    <input
                      type="text"
                      dir="auto"
                      placeholder="ناوی بەکارهێنەر"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 text-white rounded-2xl py-3.5 pr-12 pl-4 focus:outline-none text-sm transition-colors focus:border-[color:var(--accent-base)]"
                    />
                  </div>
                )}
                <div className="relative">
                  <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                  <input
                    type="email"
                    dir="ltr"
                    placeholder="ئیمەیڵ"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-white/5 border border-white/10 text-white rounded-2xl py-3.5 pr-12 pl-4 focus:outline-none text-sm text-left transition-colors focus:border-[color:var(--accent-base)]"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                  <input
                    type="password"
                    dir="ltr"
                    placeholder="وشەی نهێنی"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full bg-white/5 border border-white/10 text-white rounded-2xl py-3.5 pr-12 pl-4 focus:outline-none text-sm text-left transition-colors focus:border-[color:var(--accent-base)]"
                  />
                </div>

                {error && <p className="text-red-400 text-xs font-medium">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-2xl text-black transition-all hover:scale-[1.02] disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, var(--accent-base), var(--accent-deep))' }}
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (mode === 'signin' ? 'چوونەژوورەوە' : 'دروستکردنی هەژمار')}
                </button>
              </form>

              <div className="text-center">
                <button
                  onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
                  className="text-white/50 hover:opacity-80 text-sm transition accent-text"
                >
                  {mode === 'signin' ? 'هەژمارت نییە؟ دروستی بکە' : 'هەژمارت هەیە؟ بچۆ ژوورەوە'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
