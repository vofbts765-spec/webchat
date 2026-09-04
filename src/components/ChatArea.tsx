import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Camera,
  Image as ImageIcon,
  Mic,
  Smile,
  MoreVertical,
  Shield,
  Trash2,
  Pin,
  PinOff,
  CornerDownRight,
  X,
  Menu,
  Lock,
  Globe,
  Hash,
  Users,
  Search,
  ArrowDown,
  Volume2,
  StopCircle,
  Phone,
  Video
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { database } from '../firebase/config';
import { ref, push, set, remove, update, onValue } from 'firebase/database';
import { ChatRoom, ChatMessage, UserProfile, UserPresence } from '../types';
import { AudioMessage } from './AudioMessage';
import { compressImage, blobToDataUrl, formatMessageTime, formatDuration } from '../utils/media';
import { sanitizeInput } from '../utils/security';

const QUICK_REACTIONS = ['👍', '❤️', '🔥', '😂', '👏', '⚡'];
const EMOJI_LIST = ['😀', '😂', '🔥', '❤️', '👍', '🎉', '🚀', '💯', '✨', '⚡', '🙌', '😎', '💡', '🛡️', '👑', '🤝', '🥳', '👀'];

interface ChatAreaProps {
  room: ChatRoom;
  currentUser: UserProfile;
  activeUsers: UserPresence[];
  onOpenMobileMenu: () => void;
  onOpenModeration: () => void;
  onOpenCamera: () => void;
  onImageClick: (imageUrl: string) => void;
  onStartCall: (type: 'voice' | 'video') => void;
  isCallActiveInRoom?: boolean;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  room,
  currentUser,
  activeUsers,
  onOpenMobileMenu,
  onOpenModeration,
  onOpenCamera,
  onImageClick,
  onStartCall,
  isCallActiveInRoom,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [textInput, setTextInput] = useState('');
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [searchInChat, setSearchInChat] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [activeTypers, setActiveTypers] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isMod = room.createdBy === currentUser.username || Boolean(room.moderators?.[currentUser.username]);

  // Listen to messages in this room
  useEffect(() => {
    const messagesRef = ref(database, `messages/${room.id}`);
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const loaded: ChatMessage[] = Object.keys(data).map((key) => ({
          ...data[key],
          id: key,
        }));
        loaded.sort((a, b) => a.timestamp - b.timestamp);
        setMessages(loaded);
      } else {
        setMessages([]);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [room.id]);

  // Listen to typing indicators in this room
  useEffect(() => {
    const typingRef = ref(database, `typing/${room.id}`);
    const unsubscribe = onValue(typingRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        const typers = Object.keys(val).filter((u) => u !== currentUser.username);
        setActiveTypers(typers);
      } else {
        setActiveTypers([]);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [room.id, currentUser.username]);

  // Auto-scroll on messages change if near bottom
  useEffect(() => {
    if (!showScrollBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showScrollBottom]);

  const handleScroll = () => {
    const container = chatScrollContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    setShowScrollBottom(!isNearBottom);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
  };

  // Broadcast typing state
  const handleInputChange = (val: string) => {
    setTextInput(val);

    if (val.trim().length > 0) {
      set(ref(database, `typing/${room.id}/${currentUser.username}`), true);

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        remove(ref(database, `typing/${room.id}/${currentUser.username}`));
      }, 2500);
    } else {
      remove(ref(database, `typing/${room.id}/${currentUser.username}`));
    }
  };

  // Send Text Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanText = sanitizeInput(textInput);
    if (!cleanText) return;

    setTextInput('');
    setShowEmojiPicker(false);
    remove(ref(database, `typing/${room.id}/${currentUser.username}`));

    const messageData: Partial<ChatMessage> = {
      roomId: room.id,
      senderId: currentUser.username,
      senderName: currentUser.displayName,
      senderAvatarBg: currentUser.avatarBg,
      type: 'text',
      text: cleanText,
      timestamp: Date.now(),
    };

    if (replyTarget) {
      messageData.replyTo = {
        id: replyTarget.id,
        senderName: replyTarget.senderName || replyTarget.senderId || 'User',
        text: replyTarget.text ? replyTarget.text.slice(0, 75) : `[${replyTarget.type} message]`,
      };
      setReplyTarget(null);
    }

    try {
      const payload = Object.fromEntries(
        Object.entries(messageData).filter(([_, val]) => val !== undefined)
      );
      const newMsgRef = push(ref(database, `messages/${room.id}`));
      await set(newMsgRef, payload);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  // Handle File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressedDataUrl = await compressImage(file, 1024, 0.75);
      const newMsgRef = push(ref(database, `messages/${room.id}`));
      await set(newMsgRef, {
        roomId: room.id,
        senderId: currentUser.username,
        senderName: currentUser.displayName,
        senderAvatarBg: currentUser.avatarBg,
        type: 'image',
        mediaUrl: compressedDataUrl,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('Failed to upload image:', err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Audio Voice Note Recording
  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecordingAudio(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Audio recording failed to start:', err);
    }
  };

  const cancelAudioRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecordingAudio(false);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
  };

  const stopAndSendAudioRecording = () => {
    if (!mediaRecorderRef.current) return;

    mediaRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());

      try {
        const audioDataUrl = await blobToDataUrl(audioBlob);
        const newMsgRef = push(ref(database, `messages/${room.id}`));
        await set(newMsgRef, {
          roomId: room.id,
          senderId: currentUser.username,
          senderName: currentUser.displayName,
          senderAvatarBg: currentUser.avatarBg,
          type: 'audio',
          mediaUrl: audioDataUrl,
          audioDuration: recordingSeconds || 1,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error('Failed to send voice note:', err);
      }
    };

    mediaRecorderRef.current.stop();
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecordingAudio(false);
    setRecordingSeconds(0);
  };

  // Delete message
  const handleDeleteMessage = async (msgId: string) => {
    try {
      await remove(ref(database, `messages/${room.id}/${msgId}`));
    } catch (err) {
      console.error('Delete message error:', err);
    }
  };

  // Add/Remove Reaction
  const handleToggleReaction = async (msg: ChatMessage, emoji: string) => {
    const currentList = msg.reactions?.[emoji] || [];
    const hasReacted = currentList.includes(currentUser.username);

    let updatedList: string[];
    if (hasReacted) {
      updatedList = currentList.filter((u) => u !== currentUser.username);
    } else {
      updatedList = [...currentList, currentUser.username];
    }

    try {
      if (updatedList.length === 0) {
        await remove(ref(database, `messages/${room.id}/${msg.id}/reactions/${emoji}`));
      } else {
        await set(ref(database, `messages/${room.id}/${msg.id}/reactions/${emoji}`), updatedList);
      }
    } catch (err) {
      console.error('Reaction error:', err);
    }
  };

  // Pin message
  const handleTogglePin = async (msg: ChatMessage) => {
    if (!isMod) return;
    try {
      if (room.pinnedMessageId === msg.id) {
        await update(ref(database, `rooms/${room.id}`), {
          pinnedMessageId: null,
          pinnedMessageText: null,
        });
      } else {
        await update(ref(database, `rooms/${room.id}`), {
          pinnedMessageId: msg.id,
          pinnedMessageText: msg.text || `[${msg.type} attachment]`,
        });
      }
    } catch (err) {
      console.error('Pin message error:', err);
    }
  };

  const filteredMessages = messages.filter((m) => {
    if (!searchInChat) return true;
    const query = searchInChat.toLowerCase();
    const textMatch = Boolean(m.text && m.text.toLowerCase().includes(query));
    const sender = m.senderName || m.senderId || '';
    const senderMatch = sender.toLowerCase().includes(query);
    return textMatch || senderMatch;
  });

  return (
    <main className="flex-1 flex flex-col h-full bg-[#070A12] relative overflow-hidden">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Sleek Top Header */}
      <header className="h-16 px-6 flex items-center justify-between border-b border-[#FBBF24]/10 bg-[#070A12] z-20 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden p-2 rounded-lg bg-[#111827] border border-white/5 text-gray-400 hover:text-white"
          >
            <Menu className="w-4 h-4" />
          </button>

          <div className="flex flex-col min-w-0">
            <h2 className="font-bold text-white leading-tight flex items-center gap-2 text-base">
              <span className="truncate"># {room.name || 'Channel'}</span>
              <span className="bg-[#FBBF24]/10 text-[#FBBF24] text-[10px] uppercase font-black px-1.5 py-0.5 rounded tracking-tighter shrink-0 border border-[#FBBF24]/20">
                {room.isProtected ? 'Protected' : 'Verified'}
              </span>
            </h2>
            <span className="text-xs text-gray-500 truncate max-w-xs sm:max-w-md">
              {room.description || 'The main community hub for all users'}
            </span>
          </div>
        </div>

        {/* Right Header Controls */}
        <div className="flex items-center gap-4">
          {/* Active members preview avatars */}
          <div className="hidden lg:flex items-center -space-x-2">
            {activeUsers.slice(0, 3).map((u) => (
              <div
                key={u.username}
                title={u.displayName || u.username}
                className="w-7 h-7 rounded-full border-2 border-[#070A12] bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-300 shadow"
              >
                {u.username.slice(0, 2).toUpperCase()}
              </div>
            ))}
            {activeUsers.length > 3 && (
              <div className="w-7 h-7 rounded-full border-2 border-[#070A12] bg-[#111827] flex items-center justify-center text-[10px] font-bold text-gray-400">
                +{activeUsers.length - 3}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* P2P Voice Call Button */}
            <button
              type="button"
              id="header-voice-call-btn"
              onClick={() => onStartCall('voice')}
              title="Start P2P Voice Call"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111827] hover:bg-[#FBBF24]/10 border border-white/5 hover:border-[#FBBF24]/30 text-gray-300 hover:text-[#FBBF24] text-xs font-semibold transition-all shadow-sm cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5 text-[#FBBF24]" />
              <span className="hidden sm:inline">Voice Call</span>
            </button>

            {/* P2P Video Call Button */}
            <button
              type="button"
              id="header-video-call-btn"
              onClick={() => onStartCall('video')}
              title="Start P2P Video Call"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111827] hover:bg-[#FBBF24]/10 border border-white/5 hover:border-[#FBBF24]/30 text-gray-300 hover:text-[#FBBF24] text-xs font-semibold transition-all shadow-sm cursor-pointer"
            >
              <Video className="w-3.5 h-3.5 text-[#FBBF24]" />
              <span className="hidden sm:inline">Video Call</span>
            </button>

            {/* Search in chat toggle */}
            <button
              type="button"
              onClick={() => setIsSearching(!isSearching)}
              title="Search in messages"
              className={`p-2 rounded-lg transition-colors ${
                isSearching
                  ? 'bg-[#FBBF24]/10 text-[#FBBF24] border border-[#FBBF24]/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Room Moderation settings */}
            {isMod && room.id !== 'global' && (
              <button
                type="button"
                id="room-moderation-btn"
                onClick={onOpenModeration}
                title="Moderation Tools"
                className="p-2 rounded-lg text-gray-400 hover:text-[#FBBF24] transition-colors"
              >
                <Shield className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Optional Search bar in chat */}
      <AnimatePresence>
        {isSearching && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 py-2 bg-[#0B111E] border-b border-slate-800 flex items-center space-x-2"
          >
            <Search className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <input
              type="text"
              value={searchInChat}
              onChange={(e) => setSearchInChat(e.target.value)}
              placeholder="Filter messages in this room..."
              autoFocus
              className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
            />
            {searchInChat && (
              <button
                type="button"
                onClick={() => setSearchInChat('')}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pinned Message Banner */}
      {room.pinnedMessageText && (
        <div className="px-4 py-2 bg-gradient-to-r from-amber-500/10 via-[#0B111E] to-transparent border-b border-amber-500/20 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 truncate">
            <Pin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider shrink-0">
              Pinned:
            </span>
            <span className="text-slate-200 truncate">{room.pinnedMessageText}</span>
          </div>
          {isMod && (
            <button
              type="button"
              onClick={() => handleTogglePin({ id: room.pinnedMessageId || '' } as any)}
              title="Unpin message"
              className="text-slate-400 hover:text-amber-400 p-1"
            >
              <PinOff className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Message List */}
      <div
        ref={chatScrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-6 space-y-6"
      >
        {filteredMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500">
            <div className="w-14 h-14 rounded-2xl bg-[#111827] border border-white/5 flex items-center justify-center text-[#FBBF24] mb-3 shadow-inner">
              <Globe className="w-7 h-7 opacity-80" />
            </div>
            <h3 className="text-base font-bold text-gray-200 mb-1">
              Welcome to #{room.name || 'Channel'}
            </h3>
            <p className="text-xs text-gray-500 max-w-sm">
              This channel is active and secure. Send a message, capture live camera, or drop a voice note!
            </p>
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const isOwn = msg.senderId === currentUser.username;
            const canDelete = isOwn || isMod;
            const isPinned = room.pinnedMessageId === msg.id;

            return (
              <div
                key={msg.id}
                className={`flex items-start gap-4 group ${isOwn ? 'justify-end' : ''}`}
              >
                {/* Other sender Avatar */}
                {!isOwn && (
                  <div
                    className={`w-9 h-9 rounded-full shrink-0 shadow-lg flex items-center justify-center font-bold text-xs text-white ${
                      msg.senderAvatarBg || 'bg-indigo-600'
                    }`}
                  >
                    {(msg.senderName || msg.senderId).slice(0, 2).toUpperCase()}
                  </div>
                )}

                {/* Message Content Container */}
                <div className={`flex flex-col max-w-[80%] sm:max-w-md ${isOwn ? 'items-end' : ''}`}>
                  {/* Sender Details Header */}
                  <div className="flex items-center gap-2 mb-1 px-1">
                    {isOwn ? (
                      <>
                        <span className="text-[10px] text-gray-500 uppercase">
                          {formatMessageTime(msg.timestamp)}
                        </span>
                        <span className="text-sm font-bold text-[#FBBF24] text-right">You</span>
                      </>
                    ) : (
                      <>
                        <span className="text-sm font-bold text-white">
                          {msg.senderName || msg.senderId}
                        </span>
                        <span className="text-[10px] text-gray-500 uppercase">
                          {formatMessageTime(msg.timestamp)}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Reply preview if replying */}
                  {msg.replyTo && (
                    <div
                      className={`text-[11px] mb-1.5 px-3 py-1 rounded-lg border flex items-center space-x-1.5 max-w-xs ${
                        isOwn
                          ? 'bg-[#FBBF24]/10 border-[#FBBF24]/30 text-[#FBBF24]'
                          : 'bg-[#111827] border-white/5 text-gray-400'
                      }`}
                    >
                      <CornerDownRight className="w-3 h-3 shrink-0 opacity-70" />
                      <span className="font-semibold truncate">@{msg.replyTo.senderName}:</span>
                      <span className="truncate">{msg.replyTo.text}</span>
                    </div>
                  )}

                  {/* Message Bubble + Action Buttons */}
                  <div
                    className={`flex items-end gap-1.5 ${
                      isOwn ? 'flex-row-reverse' : 'flex-row'
                    }`}
                  >
                    {/* Bubble */}
                    <div
                      className={`relative p-4 rounded-2xl transition-all shadow-xl leading-relaxed ${
                        isOwn
                          ? 'bg-[#FBBF24] rounded-tr-none text-[#070A12] font-medium shadow-[#FBBF24]/10'
                          : 'bg-[#111827] border border-white/5 rounded-tl-none text-gray-300'
                      } ${isPinned ? 'ring-1 ring-[#FBBF24]' : ''}`}
                    >
                      {/* Text */}
                      {msg.type === 'text' && (
                        <p className="text-xs sm:text-sm whitespace-pre-wrap break-words select-text">
                          {msg.text}
                        </p>
                      )}

                      {/* Image / Camera Photo */}
                      {(msg.type === 'image' || msg.type === 'camera') && msg.mediaUrl && (
                        <div className="rounded-xl overflow-hidden cursor-pointer group/media">
                          <img
                            src={msg.mediaUrl}
                            alt="Shared media"
                            onClick={() => onImageClick(msg.mediaUrl!)}
                            className="max-h-72 w-full object-cover rounded-xl transition-transform duration-200 group-hover/media:scale-[1.02]"
                          />
                          <div
                            className={`flex items-center justify-between pt-1.5 text-[10px] ${
                              isOwn ? 'text-[#070A12]/80' : 'text-gray-400'
                            }`}
                          >
                            <span className="flex items-center gap-1 font-semibold">
                              <Camera className="w-3 h-3" />
                              {msg.type === 'camera' ? 'Live Camera' : 'Photo'}
                            </span>
                            <span>Click to expand</span>
                          </div>
                        </div>
                      )}

                      {/* Audio Note */}
                      {msg.type === 'audio' && msg.mediaUrl && (
                        <AudioMessage
                          audioUrl={msg.mediaUrl}
                          duration={msg.audioDuration}
                          isOwn={isOwn}
                        />
                      )}
                    </div>

                    {/* Hover actions */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 pb-1">
                      <button
                        type="button"
                        onClick={() => setReplyTarget(msg)}
                        title="Reply"
                        className="p-1 rounded bg-[#111827] hover:bg-white/10 text-gray-400 hover:text-white border border-white/5 text-xs"
                      >
                        <CornerDownRight className="w-3 h-3" />
                      </button>

                      {/* Quick Reaction toggle */}
                      <div className="relative group/react">
                        <button
                          type="button"
                          className="p-1 rounded bg-[#111827] hover:bg-white/10 text-gray-400 hover:text-[#FBBF24] border border-white/5 text-xs"
                        >
                          <Smile className="w-3 h-3" />
                        </button>
                        <div className="hidden group-hover/react:flex absolute bottom-full mb-1 left-0 z-30 bg-[#0b0f1a] border border-[#FBBF24]/20 p-1 rounded-xl shadow-xl space-x-1">
                          {QUICK_REACTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => handleToggleReaction(msg, emoji)}
                              className="hover:scale-125 transition-transform p-1 text-sm"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>

                      {isMod && (
                        <button
                          type="button"
                          onClick={() => handleTogglePin(msg)}
                          title={isPinned ? 'Unpin message' : 'Pin message'}
                          className={`p-1 rounded bg-[#111827] hover:bg-white/10 border border-white/5 text-xs ${
                            isPinned ? 'text-[#FBBF24]' : 'text-gray-400 hover:text-[#FBBF24]'
                          }`}
                        >
                          <Pin className="w-3 h-3" />
                        </button>
                      )}

                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDeleteMessage(msg.id)}
                          title="Delete message"
                          className="p-1 rounded bg-[#111827] hover:bg-red-500/20 text-gray-400 hover:text-red-400 border border-white/5 text-xs"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Reaction list pills */}
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {Object.entries(msg.reactions).map(([emoji, rawList]) => {
                        const usersList = Array.isArray(rawList) ? (rawList as string[]) : [];
                        if (usersList.length === 0) return null;
                        const hasMyReaction = usersList.includes(currentUser.username);

                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleToggleReaction(msg, emoji)}
                            className={`px-2 py-0.5 rounded-full text-xs flex items-center space-x-1 border transition-all ${
                              hasMyReaction
                                ? 'bg-[#FBBF24]/20 border-[#FBBF24]/50 text-[#FBBF24] font-semibold'
                                : 'bg-[#111827] border-white/5 text-gray-400 hover:border-white/20'
                            }`}
                          >
                            <span>{emoji}</span>
                            <span className="text-[10px]">{usersList.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Self sender Avatar */}
                {isOwn && (
                  <div className="w-9 h-9 rounded-full bg-gray-700 shrink-0 border border-[#FBBF24]/40 overflow-hidden flex items-center justify-center font-bold text-xs text-[#FBBF24]">
                    {currentUser.displayName.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Scroll To Bottom Button */}
      {showScrollBottom && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          type="button"
          onClick={scrollToBottom}
          className="absolute right-6 bottom-24 z-20 px-3 py-1.5 rounded-full bg-[#111827] border border-[#FBBF24]/50 text-[#FBBF24] hover:text-white shadow-xl shadow-black/80 flex items-center space-x-1.5 text-xs font-semibold"
        >
          <ArrowDown className="w-3.5 h-3.5 animate-bounce" />
          <span>Latest messages</span>
        </motion.button>
      )}

      {/* Active typers notice */}
      {activeTypers.length > 0 && (
        <div className="px-6 py-1 text-[11px] text-[#FBBF24]/80 flex items-center space-x-1.5 bg-[#070A12]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FBBF24] animate-ping" />
          <span>
            {activeTypers.join(', ')} {activeTypers.length === 1 ? 'is' : 'are'} typing...
          </span>
        </div>
      )}

      {/* Reply-to floating pill */}
      {replyTarget && (
        <div className="px-6 py-2 bg-[#111827] border-t border-white/5 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 truncate">
            <CornerDownRight className="w-3.5 h-3.5 text-[#FBBF24] shrink-0" />
            <span className="text-gray-400">Replying to</span>
            <span className="font-bold text-[#FBBF24]">@{replyTarget.senderName}:</span>
            <span className="text-gray-300 truncate">{replyTarget.text || `[${replyTarget.type}]`}</span>
          </div>
          <button
            type="button"
            onClick={() => setReplyTarget(null)}
            className="p-1 text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sleek Input Footer */}
      <footer className="p-4 border-t border-[#FBBF24]/10 bg-[#070A12]">
        {/* Emoji picker popup */}
        {showEmojiPicker && (
          <div className="max-w-4xl mx-auto mb-2 p-2 rounded-xl bg-[#0b0f1a] border border-[#FBBF24]/20 shadow-2xl flex flex-wrap gap-1">
            {EMOJI_LIST.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setTextInput((prev) => prev + emoji);
                }}
                className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center text-lg hover:scale-110 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {isRecordingAudio ? (
          /* Voice Note Recording Bar */
          <div className="max-w-4xl mx-auto flex items-center justify-between p-3 rounded-xl bg-red-950/20 border border-red-500/40">
            <div className="flex items-center space-x-3">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
              <div className="flex items-center space-x-1.5 text-xs text-red-300 font-mono font-semibold">
                <Mic className="w-4 h-4 text-red-400" />
                <span>Recording voice note: {formatDuration(recordingSeconds)}</span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={cancelAudioRecording}
                className="px-3 py-1.5 rounded-lg bg-[#111827] hover:bg-white/10 text-gray-300 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={stopAndSendAudioRecording}
                className="px-4 py-1.5 rounded-lg bg-[#FBBF24] hover:bg-[#fcd34d] text-[#070A12] text-xs font-bold shadow-md shadow-[#FBBF24]/10 flex items-center space-x-1.5 transition-all"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Note</span>
              </button>
            </div>
          </div>
        ) : (
          /* Sleek Normal Input Bar */
          <form
            onSubmit={handleSendMessage}
            className="max-w-4xl mx-auto flex items-center gap-2 bg-[#111827] border border-white/5 rounded-xl p-2 px-4 shadow-inner"
          >
            {/* Action buttons */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                id="open-camera-btn"
                onClick={onOpenCamera}
                title="Live Camera Snapshot"
                className="p-2 text-gray-500 hover:text-[#FBBF24] transition-colors rounded-lg"
              >
                <Camera className="w-4 h-4" />
              </button>

              <button
                type="button"
                id="upload-image-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Attach Photo"
                className="p-2 text-gray-500 hover:text-[#FBBF24] transition-colors rounded-lg"
              >
                <ImageIcon className="w-4 h-4" />
              </button>

              <button
                type="button"
                id="record-audio-btn"
                onClick={startAudioRecording}
                title="Record Voice Note"
                className="p-2 text-gray-500 hover:text-[#FBBF24] transition-colors rounded-lg"
              >
                <Mic className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                title="Insert Emoji"
                className={`p-2 transition-colors rounded-lg ${
                  showEmojiPicker ? 'text-[#FBBF24]' : 'text-gray-500 hover:text-[#FBBF24]'
                }`}
              >
                <Smile className="w-4 h-4" />
              </button>

              <button
                type="button"
                id="toolbar-voice-call-btn"
                onClick={() => onStartCall('voice')}
                title="Start Voice Call"
                className="p-2 text-gray-500 hover:text-[#FBBF24] transition-colors rounded-lg hidden sm:inline-flex"
              >
                <Phone className="w-4 h-4" />
              </button>

              <button
                type="button"
                id="toolbar-video-call-btn"
                onClick={() => onStartCall('video')}
                title="Start Video Call"
                className="p-2 text-gray-500 hover:text-[#FBBF24] transition-colors rounded-lg hidden sm:inline-flex"
              >
                <Video className="w-4 h-4" />
              </button>
            </div>

            {/* Divider */}
            <div className="h-6 w-[1px] bg-white/10 mx-1 hidden sm:block" />

            {/* Text Input */}
            <input
              id="chat-message-input"
              type="text"
              value={textInput}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="Type a message securely..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-white placeholder-gray-600 py-2 focus:outline-none"
            />

            {/* Send button */}
            <button
              id="chat-send-btn"
              type="submit"
              disabled={!textInput.trim()}
              className="p-2.5 bg-[#FBBF24] text-[#070A12] rounded-lg shadow-lg shadow-[#FBBF24]/10 hover:bg-[#fcd34d] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 font-bold"
            >
              <Send className="w-4 h-4 fill-current" />
            </button>
          </form>
        )}

        {/* Encrypted Tunnel Caption */}
        <div className="text-[10px] text-center mt-2 text-gray-600 uppercase tracking-widest font-medium">
          End-to-End Encrypted Tunnel Active • Session:{' '}
          <span className="text-gray-400 font-mono">#{(room.name || 'CHAT').toUpperCase().replace(/\s+/g, '-')}-SEC-01</span>
        </div>
      </footer>
    </main>
  );
};
