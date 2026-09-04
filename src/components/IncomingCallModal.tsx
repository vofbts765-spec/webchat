import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PhoneCall, PhoneOff, Video, PhoneIncoming, Shield } from 'lucide-react';
import { CallSession } from '../types';
import { callSounds } from '../utils/callSounds';

interface IncomingCallModalProps {
  call: CallSession;
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  call,
  isOpen,
  onAccept,
  onDecline,
}) => {
  useEffect(() => {
    if (isOpen) {
      callSounds.playIncoming();
    }
    return () => {
      callSounds.stop();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isVideo = call.type === 'video';

  return (
    <AnimatePresence>
      <div
        id="incoming-call-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#070A12]/85 backdrop-blur-md"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="w-full max-w-sm bg-[#070A12] border border-[#FBBF24]/30 rounded-3xl p-6 shadow-2xl shadow-black/90 relative overflow-hidden text-center"
        >
          {/* Subtle gold background glow */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#FBBF24]/10 rounded-full blur-3xl pointer-events-none" />

          {/* Top Tag */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#111827] border border-[#FBBF24]/20 text-[#FBBF24] text-xs font-semibold uppercase tracking-wider mb-6 shadow-sm">
            {isVideo ? <Video className="w-3.5 h-3.5" /> : <PhoneIncoming className="w-3.5 h-3.5" />}
            <span>Incoming {isVideo ? 'Video' : 'Voice'} Call</span>
          </div>

          {/* Caller Avatar with Pulsing Rings */}
          <div className="relative mx-auto w-24 h-24 mb-5 flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.25, 1], opacity: [0.35, 0, 0.35] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              className="absolute inset-0 rounded-full bg-[#FBBF24]/30"
            />
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.1, 0.6] }}
              transition={{ repeat: Infinity, duration: 2, delay: 0.3, ease: 'easeInOut' }}
              className="absolute inset-1 rounded-full bg-[#FBBF24]/20"
            />
            <div
              className={`w-20 h-20 rounded-full ${call.caller.avatarBg || 'bg-amber-600'} border-2 border-[#FBBF24] flex items-center justify-center text-white text-2xl font-bold shadow-xl shadow-[#FBBF24]/10 relative z-10`}
            >
              {call.caller.username.slice(0, 2).toUpperCase()}
            </div>
          </div>

          {/* Caller Details */}
          <h3 className="text-xl font-bold text-white tracking-tight mb-1">
            {call.caller.displayName || call.caller.username}
          </h3>
          <p className="text-xs text-gray-400 mb-2">
            Calling you in <span className="text-[#FBBF24] font-semibold">#{call.roomName}</span>
          </p>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-500 mb-8 font-mono">
            <Shield className="w-3 h-3 text-emerald-400" />
            <span>P2P Encrypted • WebRTC Tunnel</span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-6">
            {/* Decline Button */}
            <button
              type="button"
              id="decline-call-btn"
              onClick={() => {
                callSounds.stop();
                callSounds.playHangup();
                onDecline();
              }}
              className="flex flex-col items-center gap-2 group cursor-pointer"
            >
              <div className="w-14 h-14 rounded-full bg-red-600/20 group-hover:bg-red-600 border border-red-500/40 group-hover:border-red-500 flex items-center justify-center text-red-400 group-hover:text-white transition-all shadow-lg shadow-red-950/40">
                <PhoneOff className="w-6 h-6" />
              </div>
              <span className="text-xs font-semibold text-gray-400 group-hover:text-red-400 transition-colors">
                Decline
              </span>
            </button>

            {/* Accept Button */}
            <button
              type="button"
              id="accept-call-btn"
              onClick={() => {
                callSounds.stop();
                callSounds.playConnected();
                onAccept();
              }}
              className="flex flex-col items-center gap-2 group cursor-pointer"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-600 group-hover:bg-emerald-500 text-white flex items-center justify-center transition-all shadow-lg shadow-emerald-950/60 ring-4 ring-emerald-500/20 group-hover:scale-105">
                {isVideo ? <Video className="w-6 h-6" /> : <PhoneCall className="w-6 h-6" />}
              </div>
              <span className="text-xs font-bold text-[#FBBF24] group-hover:text-emerald-400 transition-colors">
                Accept {isVideo ? 'Video' : 'Voice'}
              </span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
