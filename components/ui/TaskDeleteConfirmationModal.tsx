"use client";

import { motion, AnimatePresence } from "motion/react";
import { Trash2, AlertTriangle} from "lucide-react";

interface TaskDeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  taskTitle?: string;
  isDeleting?: boolean;
}

export function TaskDeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  taskTitle,
  isDeleting = false,
}: TaskDeleteConfirmationModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-sm sm:max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl z-60 overflow-hidden"
            style={{ maxWidth: 'min(28rem, calc(100vw - 2rem))' }}
          >
            {/* Header */}
            <div className="px-4 sm:px-6 py-4 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-600/20 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={20} className="text-red-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-white">
                    Delete Task
                  </h2>
                  <p className="text-sm text-gray-400">
                    This action cannot be undone
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-4 sm:px-6 py-4">
              <p className="text-sm text-gray-400 mb-3">
                Are you sure you want to delete this task?
              </p>
              {taskTitle && (
                <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                  <p className="text-sm text-white font-medium truncate">
                    &ldquo;{taskTitle}&rdquo;
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-4 sm:px-6 py-4 border-t border-gray-700 flex flex-col sm:flex-row gap-3">
              <button
                onClick={onClose}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed order-2 sm:order-1"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 order-1 sm:order-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Delete Task
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
