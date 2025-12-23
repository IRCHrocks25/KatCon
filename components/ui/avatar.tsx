"use client";

import { useState } from "react";

interface AvatarProps {
  readonly src?: string | null;
  readonly name?: string;
  readonly email?: string;
  readonly size?: "sm" | "md" | "lg";
  readonly className?: string;
  readonly statusEmoji?: string | null;
  readonly showStatusIndicator?: boolean;
}

const sizeClasses = {
  sm: "w-6 h-6 text-xs",
  md: "w-8 h-8 text-sm",
  lg: "w-12 h-12 text-base",
};

export function Avatar({
  src,
  name,
  email,
  size = "md",
  className = "",
  statusEmoji,
  showStatusIndicator = false,
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const hasStatus = showStatusIndicator && statusEmoji;

  // Get initials from name or email
  const getInitials = () => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (email) {
      return email.split("@")[0].slice(0, 2).toUpperCase();
    }
    return "?";
  };

  const sizeClass = sizeClasses[size];
  const showImage = src && !imageError;

  // Status indicator size based on avatar size
  const statusIndicatorSize = {
    sm: "w-3 h-3 text-[8px]",
    md: "w-4 h-4 text-[10px]",
    lg: "w-5 h-5 text-xs",
  }[size];

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center flex-shrink-0 relative overflow-hidden ${className}`}
    >
      {showImage ? (
        <>
          {!imageLoaded && (
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center text-white font-medium">
              {getInitials()}
            </div>
          )}
          <img
            src={src}
            alt={name || email || "Avatar"}
            className={`w-full h-full object-cover ${
              imageLoaded ? "opacity-100" : "opacity-0"
            } transition-opacity duration-200`}
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              setImageError(true);
              setImageLoaded(false);
            }}
          />
        </>
      ) : (
        <div className="w-full h-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center text-white font-medium">
          {getInitials()}
        </div>
      )}

      {/* Status Indicator */}
      {hasStatus && (
        <div
          className={`absolute bottom-0 right-0 ${statusIndicatorSize} rounded-full bg-gray-900 border-2 border-gray-800 flex items-center justify-center`}
          title={statusEmoji}
        >
          <span className="leading-none">{statusEmoji}</span>
        </div>
      )}
    </div>
  );
}
