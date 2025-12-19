"use client";

import { useState } from "react";

interface AvatarProps {
  readonly src?: string | null;
  readonly name?: string;
  readonly email?: string;
  readonly size?: "sm" | "md" | "lg";
  readonly className?: string;
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
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

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
    </div>
  );
}
