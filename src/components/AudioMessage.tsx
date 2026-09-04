import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';
import { formatDuration } from '../utils/media';

interface AudioMessageProps {
  audioUrl: string;
  duration?: number;
  isOwn: boolean;
}

export const AudioMessage: React.FC<AudioMessageProps> = ({ audioUrl, duration: initialDuration, isOwn }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(initialDuration || 0);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setTotalDuration(Math.round(audio.duration));
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audioRef.current = null;
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.error('Audio playback failed:', err);
      });
    }
  };

  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div
      className={`flex items-center gap-3 py-1.5 px-3 rounded-xl min-w-[210px] max-w-[280px] ${
        isOwn
          ? 'bg-[#070A12]/30 text-[#070A12]'
          : 'bg-[#111827] border border-white/5 text-gray-300'
      }`}
    >
      <button
        type="button"
        onClick={togglePlay}
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-95 shadow-md ${
          isOwn
            ? 'bg-[#070A12] text-[#FBBF24] hover:bg-black'
            : 'bg-[#FBBF24] text-[#070A12] hover:bg-[#fcd34d] shadow-[#FBBF24]/20'
        }`}
      >
        {isPlaying ? (
          <Pause className="w-3.5 h-3.5 fill-current" />
        ) : (
          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        {/* Progress track */}
        <div
          onClick={(e) => {
            if (!audioRef.current || totalDuration <= 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            audioRef.current.currentTime = pos * totalDuration;
          }}
          className={`h-1.5 rounded-full overflow-hidden relative cursor-pointer mb-1.5 ${
            isOwn ? 'bg-black/20' : 'bg-white/10'
          }`}
        >
          <div
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            className={`h-full rounded-full transition-all duration-100 ${
              isOwn ? 'bg-[#070A12]' : 'bg-[#FBBF24]'
            }`}
          />
        </div>

        <div
          className={`flex items-center justify-between text-[10px] font-mono ${
            isOwn ? 'text-[#070A12]/80' : 'text-gray-400'
          }`}
        >
          <span>{formatDuration(Math.round(currentTime))}</span>
          <span className="flex items-center gap-1">
            <Volume2 className="w-2.5 h-2.5 opacity-60" />
            {formatDuration(totalDuration)}
          </span>
        </div>
      </div>
    </div>
  );
};
