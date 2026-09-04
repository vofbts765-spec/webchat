export interface UserProfile {
  id: string; // sanitized username as key
  username: string;
  displayName: string;
  passwordHash: string;
  salt: string;
  avatarBg: string;
  createdAt: number;
  lastActive: number;
}

export interface ChatRoom {
  id: string;
  name: string;
  description: string;
  isProtected: boolean;
  passwordHash?: string;
  salt?: string;
  createdBy: string;
  createdAt: number;
  moderators: Record<string, boolean>; // username -> true
  bannedUsers?: Record<string, boolean>; // username -> true
  pinnedMessageId?: string;
  pinnedMessageText?: string;
}

export type MessageType = 'text' | 'image' | 'audio' | 'camera';

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string; // username
  senderName: string;
  senderAvatarBg: string;
  type: MessageType;
  text?: string;
  mediaUrl?: string; // base64 or storage url
  audioDuration?: number; // in seconds
  timestamp: number;
  reactions?: Record<string, string[]>; // reactionEmoji -> array of usernames
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
  };
  deleted?: boolean;
}

export interface UserPresence {
  username: string;
  displayName: string;
  avatarBg: string;
  isOnline: boolean;
  lastSeen: number;
  currentRoom: string;
}

export type CallType = 'voice' | 'video';
export type CallStatus = 'ringing' | 'connected' | 'ended' | 'rejected' | 'busy';

export interface CallParticipant {
  username: string;
  displayName: string;
  avatarBg: string;
}

export interface CallSession {
  id: string; // callId
  roomId: string;
  roomName: string;
  type: CallType;
  status: CallStatus;
  startedAt: number;
  caller: CallParticipant;
  receiver?: CallParticipant;
  offer?: {
    type: string;
    sdp: string;
  };
  answer?: {
    type: string;
    sdp: string;
  };
  endedReason?: string;
}
