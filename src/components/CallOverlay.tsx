import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  MonitorUp,
  Maximize2,
  Minimize2,
  Shield,
  Volume2,
  Users,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { ref, onValue, set, update, push, onChildAdded, remove } from 'firebase/database';
import { database } from '../firebase/config';
import { CallSession, UserProfile } from '../types';
import { callSounds } from '../utils/callSounds';

const STUN_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

interface CallOverlayProps {
  call: CallSession;
  currentUser: UserProfile;
  isInitiator: boolean;
  onEndCall: () => void;
}

export const CallOverlay: React.FC<CallOverlayProps> = ({
  call,
  currentUser,
  isInitiator,
  onEndCall,
}) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(call.type === 'voice');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [swapPip, setSwapPip] = useState(false);
  const [callStatus, setCallStatus] = useState<string>(call.status);
  const [duration, setDuration] = useState(0);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const overlayContainerRef = useRef<HTMLDivElement | null>(null);
  const candidatesQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const isSettingRemoteRef = useRef(false);
  const hasEndedRef = useRef(false);

  const isVideo = call.type === 'video';
  const remoteParticipant = isInitiator ? call.receiver : call.caller;

  // Format call duration MM:SS
  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Timer while connected
  useEffect(() => {
    let interval: any = null;
    if (callStatus === 'connected') {
      interval = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callStatus]);

  // Handle call audio rings
  useEffect(() => {
    if (callStatus === 'ringing' && isInitiator) {
      callSounds.playOutgoing();
    } else if (callStatus === 'connected') {
      callSounds.stop();
      callSounds.playConnected();
    } else if (callStatus === 'ended' || callStatus === 'rejected') {
      callSounds.stop();
      callSounds.playHangup();
    }
    return () => {
      callSounds.stop();
    };
  }, [callStatus, isInitiator]);

  // Main WebRTC Lifecycle
  useEffect(() => {
    let active = true;
    const callRef = ref(database, `calls/${call.roomId}`);

    const initWebRTC = async () => {
      try {
        // 1. Get user media
        const constraints: MediaStreamConstraints = {
          audio: true,
          video: isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        };

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (mediaErr) {
          console.warn('Could not get requested media, trying audio only:', mediaErr);
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          setIsVideoOff(true);
        }

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // 2. Create RTCPeerConnection
        const pc = new RTCPeerConnection(STUN_CONFIG);
        pcRef.current = pc;

        // Add local tracks to connection
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // Listen for remote tracks
        pc.ontrack = (event) => {
          if (event.streams && event.streams[0]) {
            setRemoteStream(event.streams[0]);
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = event.streams[0];
            }
            if (remoteAudioRef.current) {
              remoteAudioRef.current.srcObject = event.streams[0];
            }
          }
        };

        // ICE candidate generation
        const myCandidatesPath = isInitiator
          ? `calls/${call.roomId}/callerCandidates`
          : `calls/${call.roomId}/receiverCandidates`;
        const theirCandidatesPath = isInitiator
          ? `calls/${call.roomId}/receiverCandidates`
          : `calls/${call.roomId}/callerCandidates`;

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            push(ref(database, myCandidatesPath), event.candidate.toJSON());
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') {
            setCallStatus('connected');
          } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            handleCleanEnd('Connection dropped');
          }
        };

        // Helper to add candidate safely
        const addCandidate = async (candidateData: RTCIceCandidateInit) => {
          try {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(new RTCIceCandidate(candidateData));
            } else {
              candidatesQueueRef.current.push(candidateData);
            }
          } catch (e) {
            console.error('Error adding ICE candidate:', e);
          }
        };

        // Flush candidates queue once remote description is set
        const flushCandidateQueue = async () => {
          while (candidatesQueueRef.current.length > 0) {
            const cand = candidatesQueueRef.current.shift();
            if (cand) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (e) {
                console.error('Error adding queued candidate:', e);
              }
            }
          }
        };

        // 3. Signaling logic based on role
        if (isInitiator) {
          // Caller: Create offer
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: isVideo,
          });
          await pc.setLocalDescription(offer);

          // Save offer to Firebase
          await update(callRef, {
            offer: {
              type: offer.type,
              sdp: offer.sdp,
            },
          });

          // Listen for Answer
          const unsubscribeCall = onValue(callRef, async (snap) => {
            if (!snap.exists()) {
              handleCleanEnd('Call ended');
              return;
            }
            const data: CallSession = snap.val();
            setCallStatus(data.status);

            if (data.status === 'rejected') {
              setErrorNotice('Call was declined');
              setTimeout(() => handleCleanEnd('Declined'), 2000);
              return;
            }

            if (data.status === 'ended') {
              handleCleanEnd('Call ended');
              return;
            }

            if (data.answer && !pc.currentRemoteDescription && !isSettingRemoteRef.current) {
              isSettingRemoteRef.current = true;
              try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer as any));
                await flushCandidateQueue();
              } catch (err) {
                console.error('Failed to set remote description on caller:', err);
              } finally {
                isSettingRemoteRef.current = false;
              }
            }
          });

          // Listen for receiver's ICE candidates
          const unsubscribeCandidates = onChildAdded(ref(database, theirCandidatesPath), (snap) => {
            if (snap.exists()) {
              addCandidate(snap.val());
            }
          });

          return () => {
            unsubscribeCall();
            unsubscribeCandidates();
          };
        } else {
          // Receiver: Set remote offer and create answer
          if (call.offer) {
            isSettingRemoteRef.current = true;
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(call.offer as any));
              await flushCandidateQueue();
            } catch (err) {
              console.error('Failed to set remote description on receiver:', err);
            } finally {
              isSettingRemoteRef.current = false;
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await update(callRef, {
              status: 'connected',
              receiver: {
                username: currentUser.username,
                displayName: currentUser.displayName,
                avatarBg: currentUser.avatarBg,
              },
              answer: {
                type: answer.type,
                sdp: answer.sdp,
              },
            });
          }

          // Listen for call state updates (e.g. ended by caller)
          const unsubscribeCall = onValue(callRef, (snap) => {
            if (!snap.exists()) {
              handleCleanEnd('Call ended');
              return;
            }
            const data = snap.val();
            setCallStatus(data.status);
            if (data.status === 'ended') {
              handleCleanEnd('Call ended');
            }
          });

          // Listen for caller's ICE candidates
          const unsubscribeCandidates = onChildAdded(ref(database, theirCandidatesPath), (snap) => {
            if (snap.exists()) {
              addCandidate(snap.val());
            }
          });

          return () => {
            unsubscribeCall();
            unsubscribeCandidates();
          };
        }
      } catch (err: any) {
        console.error('WebRTC initialization failed:', err);
        setErrorNotice(err?.message || 'Could not access media devices');
      }
    };

    const cleanupPromise = initWebRTC();

    return () => {
      active = false;
      cleanupPromise.then((cleanup) => cleanup && cleanup());
    };
  }, []);

  // Sync streams to video elements when available
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, swapPip]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, swapPip]);

  // Clean end call handler
  const handleCleanEnd = async (reason?: string) => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;

    // Stop all local media tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }

    // Close peer connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    // Clean up Firebase call session
    try {
      await update(ref(database, `calls/${call.roomId}`), {
        status: 'ended',
        endedReason: reason || 'Normal completion',
      });
      // Remove candidate nodes
      remove(ref(database, `calls/${call.roomId}/callerCandidates`)).catch(() => {});
      remove(ref(database, `calls/${call.roomId}/receiverCandidates`)).catch(() => {});
    } catch {
      // Ignored
    }

    onEndCall();
  };

  // Toggle Microphone
  const toggleMute = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        const nextState = !audioTracks[0].enabled;
        audioTracks.forEach((t) => (t.enabled = nextState));
        setIsMuted(!nextState);
      }
    }
  };

  // Toggle Camera
  const toggleVideo = async () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        const nextState = !videoTracks[0].enabled;
        videoTracks.forEach((t) => (t.enabled = nextState));
        setIsVideoOff(!nextState);
      } else if (isVideoOff) {
        // Was audio only, user wants to enable camera
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          });
          const newVideoTrack = videoStream.getVideoTracks()[0];
          localStream.addTrack(newVideoTrack);
          if (pcRef.current) {
            pcRef.current.addTrack(newVideoTrack, localStream);
          }
          setIsVideoOff(false);
        } catch (err) {
          console.error('Failed to enable camera:', err);
        }
      }
    }
  };

  // Toggle Screen Sharing
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Revert to camera
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const camTrack = camStream.getVideoTracks()[0];
        replaceVideoTrack(camTrack);
        setIsScreenSharing(false);
      } catch (err) {
        console.error('Failed to restore camera:', err);
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrack.onended = () => {
          toggleScreenShare();
        };
        replaceVideoTrack(screenTrack);
        setIsScreenSharing(true);
      } catch (err) {
        console.warn('Screen share canceled or not supported:', err);
      }
    }
  };

  const replaceVideoTrack = (newTrack: MediaStreamTrack) => {
    if (!pcRef.current || !localStream) return;
    const senders = pcRef.current.getSenders();
    const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
    if (videoSender) {
      videoSender.replaceTrack(newTrack);
    }
    const oldTracks = localStream.getVideoTracks();
    oldTracks.forEach((t) => {
      localStream.removeTrack(t);
      t.stop();
    });
    localStream.addTrack(newTrack);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  };

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!overlayContainerRef.current) return;
    if (!document.fullscreenElement) {
      overlayContainerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={overlayContainerRef}
      id="active-call-overlay"
      className="fixed inset-0 z-50 flex flex-col bg-[#070A12] text-white select-none overflow-hidden"
    >
      {/* Hidden audio element ensuring remote audio plays reliably */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Top Status Header */}
      <header className="h-16 px-6 flex items-center justify-between border-b border-white/5 bg-[#070A12]/90 backdrop-blur-md z-30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#111827] border border-[#FBBF24]/30 flex items-center justify-center text-[#FBBF24] shadow-sm">
            {isVideo ? <Video className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-white">
                #{call.roomName} • {isVideo ? 'Video Call' : 'Voice Call'}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono flex items-center gap-1 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                STUN Direct P2P
              </span>
            </div>
            <p className="text-xs text-gray-400">
              {callStatus === 'connected' ? (
                <span className="text-[#FBBF24] font-mono font-bold tracking-wider">
                  {formatDuration(duration)}
                </span>
              ) : callStatus === 'ringing' ? (
                <span className="text-amber-400/90 animate-pulse">Ringing #{call.roomName}...</span>
              ) : (
                <span className="text-gray-400 capitalize">{callStatus}</span>
              )}
            </p>
          </div>
        </div>

        {/* Security & Controls Info */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#111827] border border-white/5 text-[11px] text-gray-400 font-mono">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>End-to-End Encrypted</span>
          </div>
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="p-2 rounded-xl bg-[#111827] hover:bg-white/10 text-gray-400 hover:text-white border border-white/5 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main View Area */}
      <div className="flex-1 relative flex items-center justify-center bg-black/40 overflow-hidden">
        {/* Error Notice */}
        {errorNotice && (
          <div className="absolute top-6 z-40 px-4 py-2 rounded-xl bg-red-600/90 text-white text-xs font-semibold shadow-xl shadow-red-950/60 animate-bounce">
            {errorNotice}
          </div>
        )}

        {/* Ringing State */}
        {callStatus === 'ringing' && (
          <div className="flex flex-col items-center justify-center p-8 text-center z-20">
            <div className="relative w-32 h-32 mb-6 flex items-center justify-center">
              <motion.div
                animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                className="absolute inset-0 rounded-full bg-[#FBBF24]/25"
              />
              <motion.div
                animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0.1, 0.6] }}
                transition={{ repeat: Infinity, duration: 2.2, delay: 0.3, ease: 'easeInOut' }}
                className="absolute inset-2 rounded-full bg-[#FBBF24]/15"
              />
              <div className="w-24 h-24 rounded-full bg-[#111827] border-2 border-[#FBBF24] flex items-center justify-center text-[#FBBF24] text-3xl font-bold shadow-2xl relative z-10">
                {remoteParticipant
                  ? remoteParticipant.username.slice(0, 2).toUpperCase()
                  : call.roomName.slice(0, 2).toUpperCase()}
              </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-1">
              Calling #{call.roomName}...
            </h3>
            <p className="text-xs text-gray-400 max-w-sm mb-4">
              Waiting for channel members to accept the peer-to-peer stream
            </p>
            <div className="flex items-center gap-2 text-xs text-[#FBBF24] font-medium font-mono">
              <span className="w-2 h-2 rounded-full bg-[#FBBF24] animate-ping" />
              <span>Broadcasting SDP Offer via Firebase RTDB</span>
            </div>
          </div>
        )}

        {/* Video Mode: Remote Stream & PiP Local Stream */}
        {isVideo && callStatus === 'connected' && (
          <div className="w-full h-full relative flex items-center justify-center bg-[#070A12]">
            {/* Primary Display (Remote or Local if swapped) */}
            <div className="w-full h-full flex items-center justify-center relative">
              <video
                ref={swapPip ? localVideoRef : remoteVideoRef}
                autoPlay
                playsInline
                muted={swapPip}
                className="w-full h-full object-contain bg-black"
              />

              {/* If remote stream has no video track active, display avatar card */}
              {(!remoteStream || remoteStream.getVideoTracks().length === 0) && !swapPip && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#070A12]/90 backdrop-blur-sm z-10">
                  <div className="w-28 h-28 rounded-full bg-[#111827] border-2 border-[#FBBF24]/40 flex items-center justify-center text-white text-3xl font-bold shadow-2xl mb-4">
                    {remoteParticipant
                      ? remoteParticipant.username.slice(0, 2).toUpperCase()
                      : 'PEER'}
                  </div>
                  <h4 className="text-base font-bold text-white mb-1">
                    {remoteParticipant?.displayName || remoteParticipant?.username || 'Peer Participant'}
                  </h4>
                  <span className="text-xs text-gray-500 font-mono">Camera paused / Audio active</span>
                </div>
              )}
            </div>

            {/* Picture-in-Picture Stream (Local Camera) */}
            <motion.div
              drag
              dragConstraints={{ left: -300, right: 300, top: -300, bottom: 300 }}
              onClick={() => setSwapPip(!swapPip)}
              title="Click to swap view or drag around"
              className="absolute bottom-6 right-6 w-44 sm:w-56 aspect-video rounded-2xl overflow-hidden border-2 border-[#FBBF24]/50 shadow-2xl shadow-black/80 cursor-pointer z-30 bg-[#111827] group"
            >
              <video
                ref={swapPip ? remoteVideoRef : localVideoRef}
                autoPlay
                playsInline
                muted={!swapPip}
                className="w-full h-full object-cover transform -scale-x-100"
              />
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-semibold text-white backdrop-blur-sm">
                {swapPip ? 'Remote' : 'You (Local)'}
              </div>
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <RefreshCw className="w-5 h-5 text-[#FBBF24]" />
              </div>
            </motion.div>
          </div>
        )}

        {/* Voice Mode: Sleek Audio Room Grid */}
        {!isVideo && callStatus === 'connected' && (
          <div className="w-full max-w-2xl px-6 py-12 flex flex-col items-center justify-center text-center z-20">
            <div className="grid grid-cols-2 gap-8 sm:gap-16 mb-8 w-full max-w-md">
              {/* Local User Badge */}
              <div className="flex flex-col items-center">
                <div className="relative mb-3">
                  <div className="w-24 h-24 rounded-full bg-[#111827] border-2 border-white/20 flex items-center justify-center text-white text-2xl font-bold shadow-xl">
                    {currentUser.username.slice(0, 2).toUpperCase()}
                  </div>
                  {isMuted && (
                    <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-red-600 text-white shadow">
                      <MicOff className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
                <span className="text-sm font-bold text-white">{currentUser.displayName}</span>
                <span className="text-xs text-gray-500">(You)</span>
              </div>

              {/* Remote User Badge */}
              <div className="flex flex-col items-center">
                <div className="relative mb-3">
                  <motion.div
                    animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 1.8 }}
                    className="absolute -inset-2 rounded-full bg-[#FBBF24]/20"
                  />
                  <div className="w-24 h-24 rounded-full bg-[#111827] border-2 border-[#FBBF24] flex items-center justify-center text-[#FBBF24] text-2xl font-bold shadow-2xl relative z-10">
                    {remoteParticipant
                      ? remoteParticipant.username.slice(0, 2).toUpperCase()
                      : 'PEER'}
                  </div>
                </div>
                <span className="text-sm font-bold text-white">
                  {remoteParticipant?.displayName || remoteParticipant?.username || 'Peer User'}
                </span>
                <span className="text-xs text-[#FBBF24] font-semibold">Active Speaker</span>
              </div>
            </div>

            {/* Audio Wave Visualizer Simulation */}
            <div className="flex items-center gap-1 h-8 mb-4">
              {[...Array(16)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ height: [8, Math.random() * 28 + 8, 8] }}
                  transition={{ repeat: Infinity, duration: 0.6 + (i % 4) * 0.2, ease: 'easeInOut' }}
                  className="w-1 bg-[#FBBF24] rounded-full"
                />
              ))}
            </div>

            <p className="text-xs text-gray-400 font-mono">
              Opus High-Fidelity Audio • 48 kHz Stereo Stream
            </p>
          </div>
        )}
      </div>

      {/* Sleek Floating Control Bar */}
      <footer className="h-24 px-6 flex items-center justify-center border-t border-white/5 bg-[#070A12] z-30 shrink-0">
        <div className="flex items-center gap-3 sm:gap-4 p-2 rounded-2xl bg-[#111827]/90 border border-white/10 shadow-2xl">
          {/* Mute Microphone */}
          <button
            type="button"
            id="call-toggle-mic-btn"
            onClick={toggleMute}
            title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            className={`p-3.5 rounded-xl transition-all ${
              isMuted
                ? 'bg-red-600/20 text-red-400 border border-red-500/40 hover:bg-red-600/30'
                : 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/5'
            }`}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Toggle Video */}
          <button
            type="button"
            id="call-toggle-video-btn"
            onClick={toggleVideo}
            title={isVideoOff ? 'Turn on Camera' : 'Turn off Camera'}
            className={`p-3.5 rounded-xl transition-all ${
              isVideoOff
                ? 'bg-red-600/20 text-red-400 border border-red-500/40 hover:bg-red-600/30'
                : 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/5'
            }`}
          >
            {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>

          {/* Screen Share (Desktop only) */}
          <button
            type="button"
            id="call-toggle-screen-btn"
            onClick={toggleScreenShare}
            title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
            className={`hidden sm:flex p-3.5 rounded-xl transition-all ${
              isScreenSharing
                ? 'bg-[#FBBF24]/20 text-[#FBBF24] border border-[#FBBF24]/40 hover:bg-[#FBBF24]/30'
                : 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/5'
            }`}
          >
            <MonitorUp className="w-5 h-5" />
          </button>

          {/* End Call Button */}
          <button
            type="button"
            id="call-hangup-btn"
            onClick={() => handleCleanEnd('User initiated hangup')}
            title="End Call"
            className="px-6 py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold flex items-center gap-2 shadow-lg shadow-red-950/60 transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            <PhoneOff className="w-5 h-5" />
            <span className="text-sm font-semibold">End Call</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
