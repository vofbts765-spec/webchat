import React, { useState } from 'react';
import { Shield, Lock, User, Eye, EyeOff, Sparkles, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { database } from '../firebase/config';
import { ref, get, set } from 'firebase/database';
import { sanitizeUsername, hashPassword, generateSalt, getAvatarColor } from '../utils/security';
import { UserProfile } from '../types';

interface AuthModalProps {
  onSuccess: (user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess }) => {
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    const rawUsername = usernameInput.trim();
    if (!rawUsername || rawUsername.length < 3) {
      setError('Username must be at least 3 characters long.');
      return;
    }
    if (rawUsername.length > 20) {
      setError('Username cannot exceed 20 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(rawUsername)) {
      setError('Username can only contain alphanumeric characters and underscores.');
      return;
    }

    if (!passwordInput || passwordInput.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }

    setLoading(true);
    const sanitized = sanitizeUsername(rawUsername);

    try {
      const userRef = ref(database, `users/${sanitized}`);
      const snapshot = await get(userRef);

      if (snapshot.exists()) {
        // User exists: validate password
        const userData = snapshot.val() as UserProfile;
        const candidateHash = await hashPassword(passwordInput, userData.salt);

        if (candidateHash === userData.passwordHash) {
          // Success
          const updatedUser: UserProfile = {
            ...userData,
            lastActive: Date.now(),
          };
          await set(ref(database, `users/${sanitized}/lastActive`), Date.now());
          onSuccess(updatedUser);
        } else {
          setError('Invalid password for this existing username.');
        }
      } else {
        // User does not exist: auto-register with provided password
        const salt = generateSalt();
        const passwordHash = await hashPassword(passwordInput, salt);
        const avatarBg = getAvatarColor(sanitized);

        const newUser: UserProfile = {
          id: sanitized,
          username: sanitized,
          displayName: rawUsername,
          passwordHash,
          salt,
          avatarBg,
          createdAt: Date.now(),
          lastActive: Date.now(),
        };

        await set(userRef, newUser);
        setInfoMessage('Account registered automatically. Logging you in...');
        setTimeout(() => {
          onSuccess(newUser);
        }, 500);
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err?.message || 'Authentication error. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#070A12]/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="w-full max-w-md bg-[#070A12] border border-[#FBBF24]/20 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/80 relative overflow-hidden"
      >
        {/* Glow ambient background elements */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#FBBF24]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-[#FBBF24]/5 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-[#111827] border border-[#FBBF24]/30 flex items-center justify-center text-[#FBBF24] shadow-lg shadow-[#FBBF24]/10 shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-bold text-white tracking-wide">Terminal Access</h2>
              <span className="bg-[#FBBF24]/10 text-[#FBBF24] text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-tighter border border-[#FBBF24]/20">
                Encrypted
              </span>
            </div>
            <p className="text-xs text-gray-500">Live Real-Time Network Hub</p>
          </div>
        </div>

        {/* Feature info callout */}
        <div className="bg-[#111827] border border-white/5 rounded-xl p-3.5 mb-6 text-xs text-gray-300 flex items-start space-x-2.5 shadow-inner">
          <Sparkles className="w-4 h-4 text-[#FBBF24] shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Enter your credentials. New usernames register automatically; existing usernames validate your credentials.
          </p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2"
          >
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}

        {infoMessage && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{infoMessage}</span>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                <User className="w-4 h-4" />
              </div>
              <input
                id="auth-username-input"
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="e.g. shadow_rider"
                maxLength={20}
                required
                autoComplete="username"
                className="w-full pl-9 pr-3 py-2.5 bg-[#111827] border border-white/10 focus:border-[#FBBF24] rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-[#FBBF24]/50 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="auth-password-input"
                type={showPassword ? 'text' : 'password'}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter account password"
                required
                autoComplete="current-password"
                className="w-full pl-9 pr-10 py-2.5 bg-[#111827] border border-white/10 focus:border-[#FBBF24] rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-[#FBBF24]/50 transition-colors"
              />
              <button
                type="button"
                id="auth-toggle-password-btn"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-gray-500 flex items-center gap-1">
              <Shield className="w-3 h-3 text-[#FBBF24]" /> Client-side SHA-256 salted encryption
            </p>
          </div>

          <button
            id="auth-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 bg-[#FBBF24] hover:bg-[#fcd34d] text-[#070A12] font-bold rounded-xl text-sm flex items-center justify-center space-x-2 shadow-lg shadow-[#FBBF24]/10 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-[#070A12] border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Enter Chatroom</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
};
