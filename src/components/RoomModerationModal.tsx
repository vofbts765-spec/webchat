import React, { useState } from 'react';
import { Shield, X, UserX, Trash2, KeyRound, Ban, Check, AlertTriangle, Users, Volume2 } from 'lucide-react';
import { motion } from 'motion/react';
import { database } from '../firebase/config';
import { ref, update, remove, set } from 'firebase/database';
import { ChatRoom, UserProfile, UserPresence } from '../types';
import { generateSalt, hashPassword, sanitizeInput } from '../utils/security';

interface RoomModerationModalProps {
  room: ChatRoom;
  currentUser: UserProfile;
  activeUsers: UserPresence[];
  isOpen: boolean;
  onClose: () => void;
  onRoomUpdated?: (updatedRoom: ChatRoom) => void;
}

export const RoomModerationModal: React.FC<RoomModerationModalProps> = ({
  room,
  currentUser,
  activeUsers,
  isOpen,
  onClose,
  onRoomUpdated,
}) => {
  const [description, setDescription] = useState(room.description || '');
  const [newPassword, setNewPassword] = useState('');
  const [isProtected, setIsProtected] = useState(room.isProtected);
  const [bannedList, setBannedList] = useState<string[]>(Object.keys(room.bannedUsers || {}));
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [confirmDeleteMessages, setConfirmDeleteMessages] = useState(false);

  if (!isOpen) return null;

  const isCreator = room.createdBy === currentUser.username;
  const isMod = isCreator || Boolean(room.moderators?.[currentUser.username]);

  const handleUpdateRoomSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMod) return;
    setLoading(true);
    setStatusMsg(null);

    try {
      const updates: any = {
        description: sanitizeInput(description),
      };

      if (isProtected) {
        updates.isProtected = true;
        if (newPassword && newPassword.length >= 4) {
          const salt = generateSalt();
          const pHash = await hashPassword(newPassword, salt);
          updates.passwordHash = pHash;
          updates.salt = salt;
        }
      } else {
        updates.isProtected = false;
        updates.passwordHash = null;
        updates.salt = null;
      }

      await update(ref(database, `rooms/${room.id}`), updates);
      setStatusMsg('Room settings updated successfully.');
      if (onRoomUpdated) {
        onRoomUpdated({ ...room, ...updates });
      }
    } catch (err: any) {
      console.error('Error updating room:', err);
      setStatusMsg(err.message || 'Failed to update room.');
    } finally {
      setLoading(false);
    }
  };

  const handleKickUser = async (targetUsername: string) => {
    if (!isMod) return;
    try {
      // Set an eviction notice in Firebase RTDB for this user in this room
      await set(ref(database, `evictions/${room.id}/${targetUsername}`), {
        kickedAt: Date.now(),
        by: currentUser.username,
        type: 'kick',
      });
      // Remove presence from room
      await remove(ref(database, `presence/${room.id}/${targetUsername}`));
      setStatusMsg(`Kicked @${targetUsername} from the room.`);
    } catch (err: any) {
      console.error('Kick user error:', err);
    }
  };

  const handleBanUser = async (targetUsername: string) => {
    if (!isMod) return;
    try {
      await update(ref(database, `rooms/${room.id}/bannedUsers`), {
        [targetUsername]: true,
      });
      // Evict immediately
      await set(ref(database, `evictions/${room.id}/${targetUsername}`), {
        kickedAt: Date.now(),
        by: currentUser.username,
        type: 'ban',
      });
      await remove(ref(database, `presence/${room.id}/${targetUsername}`));

      setBannedList((prev) => [...prev.filter((u) => u !== targetUsername), targetUsername]);
      setStatusMsg(`Banned @${targetUsername} from this room.`);
    } catch (err: any) {
      console.error('Ban user error:', err);
    }
  };

  const handleUnbanUser = async (targetUsername: string) => {
    if (!isMod) return;
    try {
      await remove(ref(database, `rooms/${room.id}/bannedUsers/${targetUsername}`));
      await remove(ref(database, `evictions/${room.id}/${targetUsername}`));
      setBannedList((prev) => prev.filter((u) => u !== targetUsername));
      setStatusMsg(`Unbanned @${targetUsername}.`);
    } catch (err: any) {
      console.error('Unban user error:', err);
    }
  };

  const handleClearAllMessages = async () => {
    if (!isMod) return;
    setLoading(true);
    try {
      await remove(ref(database, `messages/${room.id}`));
      setConfirmDeleteMessages(false);
      setStatusMsg('All room messages have been cleared.');
    } catch (err: any) {
      console.error('Error clearing messages:', err);
      setStatusMsg('Failed to clear messages.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="room-moderation-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#070A12]/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg bg-[#070A12] border border-[#FBBF24]/20 rounded-2xl p-6 shadow-2xl shadow-black/80 relative max-h-[90vh] overflow-y-auto"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#111827] border border-[#FBBF24]/30 flex items-center justify-center text-[#FBBF24] shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Room Moderation & Controls</h3>
            <p className="text-xs text-gray-400">Manage security, members, and rules for #{room.name || 'Room'}</p>
          </div>
        </div>

        {statusMsg && (
          <div className="mb-4 p-3 rounded-xl bg-[#FBBF24]/10 border border-[#FBBF24]/30 text-[#FBBF24] text-xs flex items-center space-x-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Section 1: Settings */}
        <form onSubmit={handleUpdateRoomSecurity} className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Room Description / Topic
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Room topic"
              maxLength={100}
              className="w-full px-3 py-2 bg-[#111827] border border-white/10 rounded-xl text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#FBBF24]"
            />
          </div>

          <div className="p-3.5 bg-[#111827] border border-white/5 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-white">Password Protection</p>
                <p className="text-[11px] text-gray-500">Require an entry key for new members</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isProtected}
                  onChange={(e) => setIsProtected(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#FBBF24]"></div>
              </label>
            </div>

            {isProtected && (
              <div className="mt-3 pt-3 border-t border-white/5">
                <label className="block text-[11px] font-medium text-gray-300 mb-1">
                  Change / Set Password (leave blank to keep current)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-500">
                    <KeyRound className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    className="w-full pl-8 pr-3 py-1.5 bg-[#070A12] border border-white/10 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#FBBF24]"
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-3 bg-[#FBBF24] hover:bg-[#fcd34d] text-[#070A12] rounded-xl text-xs font-bold transition-all shadow-md shadow-[#FBBF24]/10 flex items-center justify-center space-x-1.5 disabled:opacity-50"
          >
            <span>Save Room Settings</span>
          </button>
        </form>

        {/* Section 2: Active Users Moderation */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center space-x-1.5">
              <Users className="w-3.5 h-3.5 text-[#FBBF24]" />
              <span>Current Active Users ({activeUsers.length})</span>
            </h4>
          </div>

          <div className="space-y-1.5 max-h-36 overflow-y-auto bg-[#111827] border border-white/5 rounded-xl p-2">
            {activeUsers.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-2">No other active users in room</p>
            ) : (
              activeUsers.map((user) => {
                const isSelf = user.username === currentUser.username;
                const isUserMod = Boolean(room.moderators?.[user.username]) || user.username === room.createdBy;

                return (
                  <div
                    key={user.username}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#070A12]/60 border border-white/5 text-xs"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-500/20" />
                      <span className="text-white font-medium">@{user.username}</span>
                      {isUserMod && (
                        <span className="px-1.5 py-0.2 bg-[#FBBF24]/10 text-[#FBBF24] border border-[#FBBF24]/30 text-[10px] rounded font-semibold">
                          {user.username === room.createdBy ? 'Owner' : 'Mod'}
                        </span>
                      )}
                      {isSelf && (
                        <span className="text-gray-500 text-[10px]">(You)</span>
                      )}
                    </div>

                    {!isSelf && !isUserMod && isMod && (
                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => handleKickUser(user.username)}
                          title="Kick user from room"
                          className="px-2 py-1 bg-[#111827] hover:bg-white/10 text-gray-300 rounded text-[11px] flex items-center space-x-1 transition-colors border border-white/5"
                        >
                          <UserX className="w-3 h-3 text-[#FBBF24]" />
                          <span>Kick</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBanUser(user.username)}
                          title="Ban user from room"
                          className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 rounded text-[11px] flex items-center space-x-1 transition-colors"
                        >
                          <Ban className="w-3 h-3 text-red-400" />
                          <span>Ban</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Section 3: Banned Users */}
        {bannedList.length > 0 && (
          <div className="mb-6">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center space-x-1.5">
              <Ban className="w-3.5 h-3.5 text-red-400" />
              <span>Banned Users ({bannedList.length})</span>
            </h4>
            <div className="space-y-1.5 max-h-28 overflow-y-auto bg-[#111827] border border-white/5 rounded-xl p-2">
              {bannedList.map((uname) => (
                <div
                  key={uname}
                  className="flex items-center justify-between p-2 rounded-lg bg-red-500/5 border border-red-500/20 text-xs"
                >
                  <span className="text-red-300 font-medium">@{uname}</span>
                  <button
                    type="button"
                    onClick={() => handleUnbanUser(uname)}
                    className="px-2 py-0.5 bg-[#070A12] hover:bg-white/10 text-gray-200 rounded text-[11px] border border-white/5"
                  >
                    Unban
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Danger zone */}
        {isMod && (
          <div className="pt-4 border-t border-white/5">
            <div className="p-3.5 bg-red-950/20 border border-red-900/30 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-red-300">Wipe Chat History</p>
                  <p className="text-[11px] text-gray-400">Permanently delete all messages in this room</p>
                </div>
                {confirmDeleteMessages ? (
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteMessages(false)}
                      className="px-2.5 py-1 rounded-lg bg-[#111827] text-gray-300 text-xs border border-white/5"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllMessages}
                      className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md shadow-red-900/50"
                    >
                      Confirm Wipe
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteMessages(true)}
                    className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Room</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
