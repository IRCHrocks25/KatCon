"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Search,
  Download,
  FileText,
  Image as ImageIcon,
  Archive,
  File,
  SortAsc,
  SortDesc,
  Loader2,
} from "lucide-react";
import { formatFileSize, isImageFile } from "@/lib/supabase/file-upload";
import { supabase } from "@/lib/supabase/client";
import { robustFetch } from "@/lib/utils/fetch";

interface FileItem {
  id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
  uploaded_by: {
    id: string;
    email: string;
    fullname: string | null;
  };
  created_at: string;
}

interface FilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  conversationName: string;
}

type FilterType = "all" | "images" | "documents" | "other";

async function getAuthHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  return headers;
}

export function FilesModal({
  isOpen,
  onClose,
  conversationId,
  conversationName,
}: FilesModalProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    if (!conversationId) return;

    try {
      setIsLoading(true);
      const headers = await getAuthHeaders();
      
      const params = new URLSearchParams();
      if (filterType !== "all") params.set("type", filterType);
      if (searchQuery) params.set("search", searchQuery);
      params.set("sort", sortOrder);

      const url = `/api/messaging/files/${conversationId}?${params.toString()}`;
      
      const response = await robustFetch(url, {
        method: "GET",
        headers,
        retries: 2,
        timeout: 10000,
      });

      if (response.ok) {
        const data = await response.json();
        setFiles(data.files || []);
      } else {
        console.error("Failed to fetch files");
        setFiles([]);
      }
    } catch (error) {
      console.error("Error fetching files:", error);
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, filterType, searchQuery, sortOrder]);

  useEffect(() => {
    if (isOpen) {
      fetchFiles();
    }
  }, [isOpen, fetchFiles]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    
    const timer = setTimeout(() => {
      fetchFiles();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <ImageIcon size={24} className="text-blue-400" />;
    if (mimeType.includes("pdf") || mimeType.includes("word") || mimeType.includes("text"))
      return <FileText size={24} className="text-orange-400" />;
    if (mimeType.includes("zip") || mimeType.includes("rar") || mimeType.includes("7z"))
      return <Archive size={24} className="text-yellow-400" />;
    return <File size={24} className="text-gray-400" />;
  };

  const formatRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  };

  const getUploaderName = (uploadedBy: FileItem["uploaded_by"]) => {
    return uploadedBy.fullname || uploadedBy.email.split("@")[0];
  };

  if (!isOpen) return null;

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
            className="fixed inset-4 md:inset-10 lg:inset-20 bg-gray-900 rounded-xl border border-gray-800 z-50 flex flex-col overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
              <h2 className="text-xl font-semibold text-white">
                Files in {conversationName}
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-800 rounded-lg transition text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Controls */}
            <div className="p-4 border-b border-gray-800 space-y-3 flex-shrink-0">
              {/* Search */}
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 transition"
                />
              </div>

              {/* Filter and Sort Row */}
              <div className="flex items-center justify-between gap-4">
                {/* Filter Tabs */}
                <div className="flex gap-2">
                  {(["all", "images", "documents", "other"] as FilterType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setFilterType(type)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        filterType === type
                          ? "bg-purple-600 text-white"
                          : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
                      }`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Sort Toggle */}
                <button
                  onClick={() => setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition text-sm"
                >
                  {sortOrder === "desc" ? (
                    <>
                      <SortDesc size={16} />
                      Newest
                    </>
                  ) : (
                    <>
                      <SortAsc size={16} />
                      Oldest
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Files Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 size={32} className="text-purple-500 animate-spin" />
                </div>
              ) : files.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <File size={48} className="mb-4 opacity-50" />
                  <p className="text-lg mb-1">No files found</p>
                  <p className="text-sm">
                    {searchQuery
                      ? "Try adjusting your search"
                      : filterType !== "all"
                      ? "No files match this filter"
                      : "Files shared in this conversation will appear here"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="group bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden hover:border-purple-500/50 transition"
                    >
                      {/* Preview */}
                      <div className="aspect-square relative bg-gray-800 flex items-center justify-center">
                        {isImageFile(file.file_type) ? (
                          <img
                            src={file.file_url}
                            alt={file.file_name}
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => setSelectedImage(file.file_url)}
                          />
                        ) : (
                          <div className="p-4">{getFileIcon(file.file_type)}</div>
                        )}
                        
                        {/* Download overlay */}
                        <a
                          href={file.file_url}
                          download={file.file_name}
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download size={24} className="text-white" />
                        </a>
                      </div>

                      {/* Info */}
                      <div className="p-2">
                        <p className="text-white text-xs font-medium truncate" title={file.file_name}>
                          {file.file_name}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-gray-500 text-[10px]">
                            {formatFileSize(file.file_size)}
                          </span>
                          <span className="text-gray-500 text-[10px]">
                            {formatRelativeDate(file.created_at)}
                          </span>
                        </div>
                        <p className="text-gray-400 text-[10px] truncate mt-0.5">
                          @{getUploaderName(file.uploaded_by)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          {/* Image Lightbox */}
          <AnimatePresence>
            {selectedImage && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4"
                onClick={() => setSelectedImage(null)}
              >
                <button
                  onClick={() => setSelectedImage(null)}
                  className="absolute top-4 right-4 p-2 bg-gray-800 rounded-full text-white hover:bg-gray-700 transition"
                >
                  <X size={24} />
                </button>
                <img
                  src={selectedImage}
                  alt="Preview"
                  className="max-w-full max-h-full object-contain rounded-lg"
                  onClick={(e) => e.stopPropagation()}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}

