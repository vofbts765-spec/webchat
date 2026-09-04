import React from 'react';
import { X, Download } from 'lucide-react';
import { motion } from 'motion/react';

interface ImageLightboxModalProps {
  imageUrl: string | null;
  onClose: () => void;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;

  return (
    <div
      id="lightbox-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
      >
        <div className="absolute top-2 right-2 flex items-center space-x-2 z-10">
          <a
            href={imageUrl}
            download="chat_image.jpg"
            className="p-2 rounded-full bg-[#111827]/90 hover:bg-[#111827] text-gray-200 hover:text-[#FBBF24] border border-[#FBBF24]/30 transition-colors shadow-lg"
            title="Download image"
          >
            <Download className="w-5 h-5" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-[#111827]/90 hover:bg-[#111827] text-gray-200 hover:text-white border border-[#FBBF24]/30 transition-colors shadow-lg"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <img
          src={imageUrl}
          alt="Shared media"
          className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl border border-white/10"
        />
      </motion.div>
    </div>
  );
};
