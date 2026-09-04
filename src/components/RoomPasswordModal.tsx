import React, { useState } from 'react';
import { X, Lock, KeyRound, AlertCircle, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { hashPassword } from '../utils/security';
import { ChatRoom } from '../types';

interface RoomPasswordModalProps {
  room: ChatRoom;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const RoomPasswordModal: React.FC<RoomPasswordModalProps> = ({
  room,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!room.passwordHash || !room.salt) {
        // Not actually protected or bad state
        onSuccess();
        return;
      }

      const candidateHash = await hashPassword(password, room.salt);
      if (candidateHash === room.passwordHash) {
        onSuccess();
        onClose();
      } else {
        setError('Incorrect room password. Access denied.');
      }
    } catch (err: any) {
      console.error('Password verification error:', err);
      setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="room-password-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#070A12]/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-sm bg-[#070A12] border border-[#FBBF24]/20 rounded-2xl p-6 shadow-2xl shadow-black/80 relative overflow-hidden"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-12 h-12 rounded-2xl bg-[#111827] border border-[#FBBF24]/30 flex items-center justify-center text-[#FBBF24] mb-3 shadow-lg shadow-[#FBBF24]/10">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Protected Room</h3>
          <p className="text-xs text-gray-400 mt-1">
            <span className="text-[#FBBF24] font-semibold">#{room.name || 'Room'}</span> requires access authentication
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Enter Room Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                id="room-verify-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Access key"
                required
                autoFocus
                className="w-full pl-9 pr-3 py-2.5 bg-[#111827] border border-white/10 focus:border-[#FBBF24] rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-[#FBBF24]/50"
              />
            </div>
          </div>

          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 bg-[#111827] hover:bg-white/10 text-gray-300 rounded-xl text-sm font-medium border border-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              id="room-verify-submit-btn"
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 px-4 bg-[#FBBF24] hover:bg-[#fcd34d] text-[#070A12] font-bold rounded-xl text-sm shadow-lg shadow-[#FBBF24]/10 flex items-center justify-center space-x-1.5 transition-all disabled:opacity-50"
            >
              <span>Unlock</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
