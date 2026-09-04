import React, { useState } from 'react';
import {
  Globe,
  Plus,
  Lock,
  Hash,
  Search,
  LogOut,
  Shield,
  Users,
  ChevronRight,
  Sparkles,
  X,
  MessageSquare
} from 'lucide-react';
import { ChatRoom, UserProfile, UserPresence } from '../types';

interface SidebarProps {
  currentUser: UserProfile;
  rooms: ChatRoom[];
  activeRoomId: string;
  onSelectRoom: (roomId: string) => void;
  onCreateRoomClick: () => void;
  onLogout: () => void;
  onlineCount: number;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  activeUsers?: UserPresence[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  rooms,
  activeRoomId,
  onSelectRoom,
  onCreateRoomClick,
  onLogout,
  onlineCount,
  isOpenMobile,
  onCloseMobile,
  activeUsers = [],
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRooms = rooms.filter((r) => {
    if (!r || r.id === 'global') return false; // Handled separately
    const roomName = r.name || '';
    const roomDesc = r.description || '';
    const query = (searchQuery || '').toLowerCase();
    return (
      roomName.toLowerCase().includes(query) ||
      roomDesc.toLowerCase().includes(query)
    );
  });

  const isGlobalActive = activeRoomId === 'global';

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-40 w-[280px] bg-[#0b0f1a] border-r border-[#FBBF24]/10 flex flex-col transition-transform duration-300 ease-in-out select-none shrink-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="p-6 border-b border-[#FBBF24]/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FBBF24] rounded-lg flex items-center justify-center text-[#070A12] shadow-md shadow-[#FBBF24]/20">
              <MessageSquare className="w-6 h-6 fill-current" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">
              GOLDEN<span className="text-[#FBBF24]">CHAT</span>
            </span>
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Channels & Members Content Area */}
        <div className="flex-1 p-4 space-y-6 overflow-y-auto">
          {/* Channels Section */}
          <div>
            <div className="flex items-center justify-between px-2 mb-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                Channels
              </h3>
              <span className="text-[10px] font-mono text-gray-500">
                {rooms.length} total
              </span>
            </div>

            {/* Room Search */}
            <div className="mb-2 relative px-1">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find room..."
                className="w-full pl-8 pr-2 py-1.5 bg-[#111827] border border-white/5 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FBBF24]/40"
              />
            </div>

            <div className="space-y-1">
              {/* Global World Chat Button */}
              <button
                type="button"
                id="global-room-btn"
                onClick={() => {
                  onSelectRoom('global');
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
                  isGlobalActive
                    ? 'bg-[#FBBF24]/10 border border-[#FBBF24]/20 text-[#FBBF24]'
                    : 'hover:bg-white/5 text-gray-400'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg font-bold">#</span>
                  <span className="font-medium text-sm truncate">Global World Chat</span>
                </div>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/5 text-gray-400">
                  Open
                </span>
              </button>

              {/* Custom Rooms */}
              {filteredRooms.map((room) => {
                const isActive = activeRoomId === room.id;
                const isMod =
                  room.createdBy === currentUser.username ||
                  Boolean(room.moderators?.[currentUser.username]);

                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => {
                      onSelectRoom(room.id);
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-[#FBBF24]/10 border border-[#FBBF24]/20 text-[#FBBF24]'
                        : 'hover:bg-white/5 text-gray-400'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-lg font-bold">#</span>
                      <span className="font-medium text-sm truncate">{room.name || 'Unnamed Channel'}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {room.isProtected && (
                        <Lock className="w-3.5 h-3.5 text-[#FBBF24]/80" />
                      )}
                      {isMod && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-[#FBBF24]/20 text-[#FBBF24] font-bold uppercase">
                          Mod
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}

              {filteredRooms.length === 0 && searchQuery && (
                <p className="px-3 py-2 text-xs text-gray-500">No rooms match &quot;{searchQuery}&quot;</p>
              )}
            </div>
          </div>

          {/* Active Members Section */}
          <div>
            <div className="flex items-center justify-between px-2 mb-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                Active Members
              </h3>
              <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-1.5 py-0.5 rounded font-mono font-medium">
                {onlineCount} online
              </span>
            </div>

            <div className="space-y-2.5 px-2">
              {/* Current user pinned first */}
              <div className="flex items-center gap-3">
                <div className="relative w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center border border-[#FBBF24]/40 shrink-0">
                  <span className="text-xs font-bold text-[#FBBF24]">
                    {currentUser.displayName.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 rounded-full border-2 border-[#0b0f1a]" />
                </div>
                <div className="min-w-0 flex-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-white truncate">
                    {currentUser.displayName}
                  </span>
                  <span className="text-[10px] text-[#FBBF24] font-bold">You</span>
                </div>
              </div>

              {/* Other active room members */}
              {activeUsers
                .filter((u) => u.username !== currentUser.username)
                .slice(0, 8)
                .map((user) => (
                  <div key={user.username} className="flex items-center gap-3">
                    <div className="relative w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center border border-white/10 shrink-0">
                      <span className="text-xs font-bold text-gray-300">
                        {user.username.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 rounded-full border-2 border-[#0b0f1a]" />
                    </div>
                    <span className="text-sm font-medium text-gray-300 truncate">
                      {user.displayName || user.username}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Footer with Create Room button and User session */}
        <div className="p-4 border-t border-[#FBBF24]/10 bg-[#070A12]/50 space-y-3">
          <button
            type="button"
            id="create-room-sidebar-btn"
            onClick={onCreateRoomClick}
            className="w-full py-2.5 bg-[#FBBF24] text-[#070A12] rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-[#fcd34d] transition-colors shadow-lg shadow-[#FBBF24]/10 active:scale-[0.99]"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Create New Room</span>
          </button>

          {/* Current user session row */}
          <div className="flex items-center justify-between pt-1 px-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-xs text-gray-400 truncate">
                @{currentUser.username}
              </span>
            </div>

            <button
              type="button"
              id="logout-btn"
              onClick={onLogout}
              title="Sign Out"
              className="text-xs text-gray-500 hover:text-red-400 transition-colors flex items-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Exit</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
