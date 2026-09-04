import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, RefreshCw, Send, AlertTriangle, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { captureVideoFrame } from '../utils/media';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageDataUrl: string) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isInitializing, setIsInitializing] = useState(true);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startStream = async () => {
    stopStream();
    setIsInitializing(true);
    setError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera device API is not supported in this browser environment.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Camera permission was denied. Please allow camera permissions in browser settings.');
      } else {
        setError(err.message || 'Unable to access camera device.');
      }
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    if (isOpen && !capturedImage) {
      startStream();
    }
    return () => {
      stopStream();
    };
  }, [isOpen, facingMode, capturedImage]);

  if (!isOpen) return null;

  const handleTakeSnapshot = () => {
    if (!videoRef.current) return;
    const dataUrl = captureVideoFrame(videoRef.current, 0.85);
    if (dataUrl) {
      setCapturedImage(dataUrl);
      stopStream();
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
  };

  const handleSend = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      handleClose();
    }
  };

  const handleClose = () => {
    stopStream();
    setCapturedImage(null);
    onClose();
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  return (
    <div id="camera-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#070A12]/90 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg bg-[#070A12] border border-[#FBBF24]/20 rounded-2xl overflow-hidden shadow-2xl shadow-black/80 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#070A12]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-[#111827] border border-[#FBBF24]/30 text-[#FBBF24]">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Live Camera Snapshot</h3>
              <p className="text-[11px] text-gray-500">Capture and instantly share with chat</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport */}
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          {error ? (
            <div className="p-6 text-center max-w-sm">
              <AlertTriangle className="w-10 h-10 text-[#FBBF24] mx-auto mb-3" />
              <p className="text-sm text-gray-200 font-medium mb-1">Camera Unavailable</p>
              <p className="text-xs text-gray-500 mb-4">{error}</p>
              <button
                type="button"
                onClick={startStream}
                className="px-4 py-2 bg-[#FBBF24] hover:bg-[#fcd34d] text-[#070A12] font-bold text-xs rounded-xl shadow-md transition-colors"
              >
                Retry Camera
              </button>
            </div>
          ) : capturedImage ? (
            <img
              src={capturedImage}
              alt="Snapshot preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              />
              {isInitializing && (
                <div className="absolute inset-0 bg-[#070A12]/80 flex flex-col items-center justify-center">
                  <div className="w-8 h-8 border-2 border-[#FBBF24] border-t-transparent rounded-full animate-spin mb-2" />
                  <p className="text-xs text-gray-400">Initializing camera sensor...</p>
                </div>
              )}
            </>
          )}

          {/* Quick flip button when in live camera mode */}
          {!capturedImage && !error && !isInitializing && (
            <button
              type="button"
              onClick={toggleFacingMode}
              title="Flip camera"
              className="absolute top-3 right-3 p-2.5 rounded-full bg-[#070A12]/80 text-gray-300 hover:text-[#FBBF24] border border-white/10 backdrop-blur-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Actions bar */}
        <div className="p-4 bg-[#070A12] border-t border-white/5 flex items-center justify-between">
          {capturedImage ? (
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="px-4 py-2.5 rounded-xl text-xs font-medium text-gray-300 hover:text-white bg-[#111827] hover:bg-white/10 border border-white/5 transition-colors flex items-center space-x-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retake</span>
              </button>
              <button
                type="button"
                id="camera-send-btn"
                onClick={handleSend}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[#FBBF24] hover:bg-[#fcd34d] text-[#070A12] shadow-lg shadow-[#FBBF24]/10 transition-all flex items-center space-x-2"
              >
                <span>Send Snapshot</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <div className="w-full flex items-center justify-center">
              <button
                type="button"
                id="camera-capture-btn"
                disabled={Boolean(error) || isInitializing}
                onClick={handleTakeSnapshot}
                className="w-16 h-16 rounded-full p-1 bg-[#FBBF24]/20 border-2 border-[#FBBF24] hover:border-[#fcd34d] flex items-center justify-center group transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[#FBBF24]/10"
              >
                <div className="w-12 h-12 rounded-full bg-[#FBBF24] group-hover:bg-[#fcd34d] flex items-center justify-center transition-all">
                  <Camera className="w-6 h-6 text-[#070A12]" />
                </div>
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
