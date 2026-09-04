import React, { useState, useEffect, useRef } from 'react';
import { database, ensureAuthSession } from './firebase/config';
import { ref, onValue, set, remove, onDisconnect, update, push } from 'firebase/database';
import { UserProfile, ChatRoom, UserPresence, CallSession, CallType } from './types';
import { AuthModal } from './components/AuthModal';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { CreateRoomModal } from './components/CreateRoomModal';
import { RoomPasswordModal } from './components/RoomPasswordModal';
import { RoomModerationModal } from './components/RoomModerationModal';
import { CameraModal } from './components/CameraModal';
import { ImageLightboxModal } from './components/ImageLightboxModal';
import { SecurityPanel } from './components/SecurityPanel';
import { CallOverlay } from './components/CallOverlay';
import { IncomingCallModal } from './components/IncomingCallModal';
import { AlertCircle } from 'lucide-react';

const GLOBAL_ROOM: ChatRoom = {
  id: 'global',
  name: 'World Chat',
  description: 'Global public chat room for all connected members',
  isProtected: false,
  createdBy: 'system',
  createdAt: 1700000000000,
  moderators: { system: true },
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('darkchat_session_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [rooms, setRooms] = useState<ChatRoom[]>([GLOBAL_ROOM]);
  const [activeRoomId, setActiveRoomId] = useState<string>('global');
  const [unlockedRooms, setUnlockedRooms] = useState<Record<string, boolean>>({ global: true });
  const [activeUsersInRoom, setActiveUsersInRoom] = useState<UserPresence[]>([]);
  const [totalOnlineCount, setTotalOnlineCount] = useState(1);

  // Modals
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [pendingProtectedRoom, setPendingProtectedRoom] = useState<ChatRoom | null>(null);
  const [showModeration, setShowModeration] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [evictionNotice, setEvictionNotice] = useState<string | null>(null);

  // WebRTC Calling State
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [isCallInitiator, setIsCallInitiator] = useState(false);
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);

  // Ensure Firebase connection & default room
  useEffect(() => {
    ensureAuthSession();

    // Listen to rooms in RTDB
    const roomsRef = ref(database, 'rooms');
    const unsubscribeRooms = onValue(roomsRef, (snapshot) => {
      const roomList: ChatRoom[] = [GLOBAL_ROOM];
      if (snapshot.exists()) {
        const data = snapshot.val();
        if (data && typeof data === 'object') {
          Object.keys(data).forEach((id) => {
            if (id !== 'global' && data[id] && typeof data[id] === 'object') {
              const rData = data[id];
              roomList.push({
                id,
                name: rData.name || id,
                description: rData.description || '',
                createdBy: rData.createdBy || 'system',
                createdAt: rData.createdAt || Date.now(),
                isProtected: Boolean(rData.isProtected),
                passwordHash: rData.passwordHash,
                moderators: rData.moderators || {},
                bannedUsers: rData.bannedUsers || {},
              });
            }
          });
        }
      }
      setRooms(roomList);
    });

    return () => {
      unsubscribeRooms();
    };
  }, []);

  // Presence & Active Users tracking for current user
  useEffect(() => {
    if (!currentUser) return;

    const connectedRef = ref(database, '.info/connected');
    const userPresenceRef = ref(database, `presence/${activeRoomId}/${currentUser.username}`);
    const globalOnlineRef = ref(database, `online_users/${currentUser.username}`);

    const unsubscribeConnected = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        // Set presence in current room
        const presenceData: UserPresence = {
          username: currentUser.username,
          displayName: currentUser.displayName,
          avatarBg: currentUser.avatarBg,
          isOnline: true,
          lastSeen: Date.now(),
          currentRoom: activeRoomId,
        };

        set(userPresenceRef, presenceData);
        set(globalOnlineRef, true);

        // Remove on disconnect
        onDisconnect(userPresenceRef).remove();
        onDisconnect(globalOnlineRef).remove();
      }
    });

    // Listen to active users in current room
    const roomPresenceRef = ref(database, `presence/${activeRoomId}`);
    const unsubscribeRoomPresence = onValue(roomPresenceRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        const users: UserPresence[] = Object.values(val);
        setActiveUsersInRoom(users);
      } else {
        setActiveUsersInRoom([]);
      }
    });

    // Listen to total online users
    const allOnlineRef = ref(database, 'online_users');
    const unsubscribeAllOnline = onValue(allOnlineRef, (snap) => {
      if (snap.exists()) {
        setTotalOnlineCount(Object.keys(snap.val()).length);
      } else {
        setTotalOnlineCount(1);
      }
    });

    return () => {
      unsubscribeConnected();
      unsubscribeRoomPresence();
      unsubscribeAllOnline();
      // Cleanup room presence when switching rooms
      remove(userPresenceRef);
    };
  }, [currentUser, activeRoomId]);

  // Eviction listener (kick/ban enforcement)
  useEffect(() => {
    if (!currentUser || activeRoomId === 'global') return;

    const evictionRef = ref(database, `evictions/${activeRoomId}/${currentUser.username}`);
    const unsubscribe = onValue(evictionRef, (snap) => {
      if (snap.exists()) {
        const info = snap.val();
        setEvictionNotice(
          info.type === 'ban'
            ? 'You have been banned from this room by the moderator.'
            : 'You were kicked from this room by the moderator.'
        );
        // Evict to global
        setActiveRoomId('global');
        setTimeout(() => {
          setEvictionNotice(null);
        }, 5000);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentUser, activeRoomId]);

  // Real-time WebRTC Call listener for the active room
  useEffect(() => {
    if (!currentUser) return;

    const callRef = ref(database, `calls/${activeRoomId}`);
    const unsubscribe = onValue(callRef, (snap) => {
      if (snap.exists()) {
        const callData: CallSession = snap.val();
        if (callData.status === 'ringing') {
          // If we are not the caller and not in an active call, show incoming call
          if (callData.caller.username !== currentUser.username && !activeCall) {
            // Check if call was created recently (within 2 minutes)
            if (Date.now() - callData.startedAt < 120000) {
              setIncomingCall(callData);
            }
          }
        } else if (callData.status === 'ended' || callData.status === 'rejected') {
          setIncomingCall(null);
        }
      } else {
        setIncomingCall(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentUser, activeRoomId, activeCall]);

  const handleAuthSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    localStorage.setItem('darkchat_session_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    if (currentUser) {
      remove(ref(database, `presence/${activeRoomId}/${currentUser.username}`));
      remove(ref(database, `online_users/${currentUser.username}`));
    }
    localStorage.removeItem('darkchat_session_user');
    setCurrentUser(null);
    setActiveRoomId('global');
  };

  const handleSelectRoom = (roomId: string) => {
    if (roomId === activeRoomId) return;

    const targetRoom = rooms.find((r) => r.id === roomId);
    if (!targetRoom) return;

    // Check if banned
    if (currentUser && targetRoom.bannedUsers?.[currentUser.username]) {
      setEvictionNotice(`You are banned from joining #${targetRoom.name || 'channel'}.`);
      setTimeout(() => setEvictionNotice(null), 4000);
      return;
    }

    // Check if password protected and not unlocked yet
    const isMod = currentUser && (targetRoom.createdBy === currentUser.username || Boolean(targetRoom.moderators?.[currentUser.username]));
    if (targetRoom.isProtected && !unlockedRooms[roomId] && !isMod) {
      setPendingProtectedRoom(targetRoom);
      return;
    }

    setActiveRoomId(roomId);
  };

  const handleUnlockProtectedRoom = () => {
    if (pendingProtectedRoom) {
      setUnlockedRooms((prev) => ({ ...prev, [pendingProtectedRoom.id]: true }));
      setActiveRoomId(pendingProtectedRoom.id);
      setPendingProtectedRoom(null);
    }
  };

  const handleRoomCreated = (newRoom: ChatRoom) => {
    setUnlockedRooms((prev) => ({ ...prev, [newRoom.id]: true }));
    setActiveRoomId(newRoom.id);
  };

  // Handle Camera Snapshot Direct Send
  const handleCameraSnapshot = async (dataUrl: string) => {
    if (!currentUser) return;
    try {
      const newMsgRef = push(ref(database, `messages/${activeRoomId}`));
      await set(newMsgRef, {
        roomId: activeRoomId,
        senderId: currentUser.username,
        senderName: currentUser.displayName,
        senderAvatarBg: currentUser.avatarBg,
        type: 'camera',
        mediaUrl: dataUrl,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('Failed to send snapshot:', err);
    }
  };

  // WebRTC Call Handlers
  const handleStartCall = async (type: CallType) => {
    if (!currentUser) return;

    const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newCall: CallSession = {
      id: callId,
      roomId: activeRoomId,
      roomName: currentActiveRoom.name || 'Channel',
      type,
      status: 'ringing',
      startedAt: Date.now(),
      caller: {
        username: currentUser.username,
        displayName: currentUser.displayName,
        avatarBg: currentUser.avatarBg,
      },
    };

    try {
      const callRef = ref(database, `calls/${activeRoomId}`);
      await set(callRef, newCall);
      onDisconnect(callRef).remove();
      setIsCallInitiator(true);
      setActiveCall(newCall);
    } catch (err) {
      console.error('Failed to initiate call:', err);
    }
  };

  const handleAcceptCall = () => {
    if (!incomingCall) return;
    setIsCallInitiator(false);
    setActiveCall(incomingCall);
    setIncomingCall(null);
  };

  const handleDeclineCall = async () => {
    if (!incomingCall) return;
    try {
      await update(ref(database, `calls/${incomingCall.roomId}`), {
        status: 'rejected',
        endedReason: 'Call declined by member',
      });
    } catch (err) {
      console.error('Error declining call:', err);
    }
    setIncomingCall(null);
  };

  const handleEndActiveCall = () => {
    setActiveCall(null);
  };

  const currentActiveRoom = rooms.find((r) => r.id === activeRoomId) || GLOBAL_ROOM;

  return (
    <div className="h-screen w-screen bg-[#070A12] text-slate-100 flex flex-col overflow-hidden font-sans">
      {/* Eviction / Alert Banner */}
      {evictionNotice && (
        <div className="bg-red-500/90 text-white px-4 py-2.5 text-xs font-semibold flex items-center justify-center space-x-2 z-50 shadow-lg animate-bounce">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{evictionNotice}</span>
        </div>
      )}

      {/* Auth Screen */}
      {!currentUser && <AuthModal onSuccess={handleAuthSuccess} />}

      {/* Main App Workspace */}
      {currentUser && (
        <div className="flex-1 flex h-full overflow-hidden">
          {/* Sidebar */}
          <Sidebar
            currentUser={currentUser}
            rooms={rooms}
            activeRoomId={activeRoomId}
            onSelectRoom={handleSelectRoom}
            onCreateRoomClick={() => setShowCreateRoom(true)}
            onLogout={handleLogout}
            onlineCount={totalOnlineCount}
            isOpenMobile={mobileMenuOpen}
            onCloseMobile={() => setMobileMenuOpen(false)}
            activeUsers={activeUsersInRoom}
          />

          {/* Central Chat Workspace */}
          <ChatArea
            room={currentActiveRoom}
            currentUser={currentUser}
            activeUsers={activeUsersInRoom}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
            onOpenModeration={() => setShowModeration(true)}
            onOpenCamera={() => setShowCamera(true)}
            onImageClick={(url) => setLightboxImage(url)}
            onStartCall={handleStartCall}
            isCallActiveInRoom={Boolean(activeCall || incomingCall)}
          />

          {/* Right Security Panel */}
          <SecurityPanel
            room={currentActiveRoom}
            currentUser={currentUser}
            activeUsers={activeUsersInRoom}
            onOpenModeration={() => setShowModeration(true)}
          />
        </div>
      )}

      {/* Incoming Call Alert Modal */}
      {incomingCall && !activeCall && (
        <IncomingCallModal
          call={incomingCall}
          isOpen={Boolean(incomingCall)}
          onAccept={handleAcceptCall}
          onDecline={handleDeclineCall}
        />
      )}

      {/* Active WebRTC Call Overlay */}
      {activeCall && currentUser && (
        <CallOverlay
          call={activeCall}
          currentUser={currentUser}
          isInitiator={isCallInitiator}
          onEndCall={handleEndActiveCall}
        />
      )}

      {/* Create Room Modal */}
      {currentUser && (
        <CreateRoomModal
          currentUser={currentUser}
          isOpen={showCreateRoom}
          onClose={() => setShowCreateRoom(false)}
          onCreated={handleRoomCreated}
        />
      )}

      {/* Password Prompt Modal for Protected Rooms */}
      {pendingProtectedRoom && (
        <RoomPasswordModal
          room={pendingProtectedRoom}
          isOpen={Boolean(pendingProtectedRoom)}
          onClose={() => setPendingProtectedRoom(null)}
          onSuccess={handleUnlockProtectedRoom}
        />
      )}

      {/* Room Moderation Modal */}
      {currentUser && showModeration && currentActiveRoom.id !== 'global' && (
        <RoomModerationModal
          room={currentActiveRoom}
          currentUser={currentUser}
          activeUsers={activeUsersInRoom}
          isOpen={showModeration}
          onClose={() => setShowModeration(false)}
          onRoomUpdated={(updated) => {
            setRooms((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
          }}
        />
      )}

      {/* Live Camera Snapshot Modal */}
      <CameraModal
        isOpen={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={handleCameraSnapshot}
      />

      {/* Image Lightbox */}
      <ImageLightboxModal
        imageUrl={lightboxImage}
        onClose={() => setLightboxImage(null)}
      />
    </div>
  );
}
