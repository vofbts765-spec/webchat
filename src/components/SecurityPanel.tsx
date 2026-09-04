import React from 'react';
import { Shield, Lock, Unlock, Users, Trash2, Sliders, CheckCircle2 } from 'lucide-react';
import { ChatRoom, UserProfile, UserPresence } from '../types';

interface SecurityPanelProps {
  room: ChatRoom;
  currentUser: UserProfile;
  activeUsers: UserPresence[];
  onOpenModeration: () => void;
}

export const SecurityPanel: React.FC<SecurityPanelProps> = ({
  room,
  currentUser,
  activeUsers,
  onOpenModeration,
}) => {
  const isMod =
    room.createdBy === currentUser.username || Boolean(room.moderators?.[currentUser.username]);

  return (
    <aside className="w-[240px] bg-[#0b0f1a] border-l border-[#FBBF24]/10 hidden xl:flex flex-col shrink-0 select-none">
      {/* Top Security Status */}
      <div className="p-5 border-b border-[#FBBF24]/10">
        <div className="flex items-center space-x-2 mb-4">
          <Shield className="w-4 h-4 text-[#FBBF24]" />
          <h3 className="text-sm font-bold text-white tracking-tight">Security Panel</h3>
        </div>

        <div className="space-y-3">
          <div className="bg-[#111827] rounded-lg p-3 border border-white/5 shadow-md">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
              Last Auth Log
            </span>
            <div className="text-xs text-emerald-400 font-mono flex items-center space-x-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Verified Session</span>
            </div>
          </div>

          <div className="bg-[#111827] rounded-lg p-3 border border-white/5 shadow-md">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
              Room Barriers
            </span>
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  room.isProtected ? 'bg-[#FBBF24] animate-pulse' : 'bg-emerald-500'
                }`}
              />
              <span className="text-xs text-gray-300 italic">
                {room.isProtected ? 'Active & Locked' : 'Open Channel'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Moderator Tools Section */}
      <div className="flex-1 p-5 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            Moderator Tools
          </h3>
          {isMod && (
            <span className="px-1.5 py-0.5 bg-[#FBBF24]/10 text-[#FBBF24] text-[9px] font-semibold rounded border border-[#FBBF24]/20">
              Admin
            </span>
          )}
        </div>

        {isMod && room.id !== 'global' ? (
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={onOpenModeration}
              className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-[#FBBF24] hover:bg-white/5 rounded-lg transition-all flex items-center justify-between group"
            >
              <span>Room Settings</span>
              <Sliders className="w-3.5 h-3.5 text-gray-500 group-hover:text-[#FBBF24]" />
            </button>
            <button
              type="button"
              onClick={onOpenModeration}
              className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all flex items-center justify-between group"
            >
              <span>Manage Members ({activeUsers.length})</span>
              <Users className="w-3.5 h-3.5 text-gray-500 group-hover:text-white" />
            </button>
            <button
              type="button"
              onClick={onOpenModeration}
              className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-red-400 hover:bg-red-400/5 rounded-lg transition-all flex items-center justify-between group"
            >
              <span>Purge History</span>
              <Trash2 className="w-3.5 h-3.5 text-gray-500 group-hover:text-red-400" />
            </button>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-[#111827]/60 border border-white/5 text-[11px] text-gray-400 leading-relaxed">
            {room.id === 'global' ? (
              <p>Global World Chat is maintained by the automated moderation system.</p>
            ) : (
              <p>Room creator privileges are required to modify channel barriers.</p>
            )}
          </div>
        )}
      </div>

      {/* Pro Access Badge Card at bottom */}
      <div className="p-4 mt-auto">
        <div className="bg-gradient-to-br from-[#111827] to-[#070A12] border border-[#FBBF24]/20 rounded-xl p-4 text-center shadow-lg shadow-black/40">
          <div className="text-[#FBBF24] font-bold text-lg mb-1 tracking-tight">Pro Access</div>
          <p className="text-[10px] text-gray-500 leading-tight">
            Enterprise-grade chat security enabled by default.
          </p>
        </div>
      </div>
    </aside>
  );
};
