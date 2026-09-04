import React, { useState } from 'react';
import { X, Lock, Hash, Shield, AlertCircle, KeyRound, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { database } from '../firebase/config';
import { ref, set } from 'firebase/database';
import { generateUniqueId, generateSalt, hashPassword, sanitizeInput } from '../utils/security';
import { ChatRoom, UserProfile } from '../types';

interface CreateRoomModalProps {
  currentUser: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (room: ChatRoom) => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  currentUser,
  isOpen,
  onClose,
  onCreated,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isProtected, setIsProtected] = useState(false);
  const [roomPassword, setRoomPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = sanitizeInput(name);
    if (!cleanName || cleanName.length < 3) {
      setError('Room name must be at least 3 characters.');
      return;
    }
    if (cleanName.length > 30) {
      setError('Room name cannot exceed 30 characters.');
      return;
    }

    if (isProtected) {
      if (!roomPassword || roomPassword.length < 4) {
        setError('Room password must be at least 4 characters.');
        return;
      }
      if (roomPassword !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);
    try {
      const roomId = generateUniqueId('room');

      const newRoom: ChatRoom = {
        id: roomId,
        name: cleanName,
        description: sanitizeInput(description) || 'Public discussion & media channel',
        isProtected,
        createdBy: currentUser.username,
        createdAt: Date.now(),
        moderators: {
          [currentUser.username]: true,
        },
      };

      if (isProtected) {
        const salt = generateSalt();
        const passwordHash = await hashPassword(roomPassword, salt);
        newRoom.salt = salt;
        newRoom.passwordHash = passwordHash;
      }

      // Strip any potential undefined values to ensure Firebase Realtime Database compatibility
      const roomPayload = Object.fromEntries(
        Object.entries(newRoom).filter(([_, val]) => val !== undefined)
      );

      await set(ref(database, `rooms/${roomId}`), roomPayload);
      onCreated(newRoom);
      onClose();
    } catch (err: any) {
      console.error('Error creating room:', err);
      setError(err?.message || 'Failed to create room. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="create-room-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#070A12]/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md bg-[#070A12] border border-[#FBBF24]/20 rounded-2xl p-6 shadow-2xl shadow-black/80 relative overflow-hidden"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#111827] border border-[#FBBF24]/30 flex items-center justify-center text-[#FBBF24] shrink-0">
            <Hash className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Create New Room</h3>
            <p className="text-xs text-gray-500">Launch a public or secure password-protected space</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Room Name
            </label>
            <input
              id="new-room-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cyber Squad, Alpha Lounge"
              maxLength={30}
              required
              className="w-full px-3.5 py-2.5 bg-[#111827] border border-white/10 focus:border-[#FBBF24] rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-[#FBBF24]/50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Description / Topic (Optional)
            </label>
            <input
              id="new-room-desc-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this channel about?"
              maxLength={80}
              className="w-full px-3.5 py-2.5 bg-[#111827] border border-white/10 focus:border-[#FBBF24] rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-[#FBBF24]/50"
            />
          </div>

          {/* Security switch */}
          <div className="pt-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#111827] border border-white/5">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${isProtected ? 'bg-[#FBBF24]/20 text-[#FBBF24]' : 'bg-[#070A12] text-gray-500'}`}>
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Password Protected</p>
                  <p className="text-[11px] text-gray-500">Require credentials for users to enter</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  id="new-room-protected-toggle"
                  type="checkbox"
                  checked={isProtected}
                  onChange={(e) => setIsProtected(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#FBBF24]"></div>
              </label>
            </div>
          </div>

          {isProtected && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-3 pt-1"
            >
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Room Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    id="new-room-password-input"
                    type="password"
                    value={roomPassword}
                    onChange={(e) => setRoomPassword(e.target.value)}
                    placeholder="Set entry password"
                    required={isProtected}
                    className="w-full pl-9 pr-3 py-2 bg-[#111827] border border-white/10 focus:border-[#FBBF24] rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    id="new-room-confirm-password-input"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat entry password"
                    required={isProtected}
                    className="w-full pl-9 pr-3 py-2 bg-[#111827] border border-white/10 focus:border-[#FBBF24] rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none"
                  />
                </div>
              </div>
            </motion.div>
          )}

          <div className="pt-3 flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 bg-[#111827] hover:bg-white/10 text-gray-300 rounded-xl text-sm font-medium border border-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              id="new-room-submit-btn"
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 px-4 bg-[#FBBF24] hover:bg-[#fcd34d] text-[#070A12] font-bold rounded-xl text-sm shadow-lg shadow-[#FBBF24]/10 transition-all disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Room'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
