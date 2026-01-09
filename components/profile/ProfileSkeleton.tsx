"use client";

import { motion } from "motion/react";

export function ProfileSkeleton() {
  return (
    <div className="h-full w-full bg-black text-white flex flex-col overflow-hidden">
      {/* Header Skeleton */}
      <div className="flex-shrink-0 border-b border-gray-800 bg-gray-950/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4">
          <div>
            <div className="h-6 bg-gray-700 rounded animate-pulse w-48 mb-1" />
            <div className="h-4 bg-gray-600 rounded animate-pulse w-32" />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-gray-900">
        <div className="max-w-6xl mx-auto p-4 md:p-6">
          {/* Top Banner Skeleton */}
          <div className="h-32 bg-gray-700 rounded-t-lg mb-6 animate-pulse" />

          {/* Profile Summary Skeleton */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 -mt-24 mb-6">
            <div className="flex flex-col items-center gap-4">
              {/* Avatar Skeleton */}
              <div className="relative">
                <div className="w-32 h-32 rounded-full bg-gray-700 animate-pulse" />
              </div>

              {/* Name and Email Skeleton */}
              <div className="text-center space-y-2">
                <div className="h-8 bg-gray-700 rounded animate-pulse w-48" />
                <div className="h-4 bg-gray-600 rounded animate-pulse w-40" />
                {/* Status Skeleton */}
                <div className="flex items-center justify-center gap-2">
                  <div className="w-6 h-6 bg-gray-600 rounded animate-pulse" />
                  <div className="h-4 bg-gray-600 rounded animate-pulse w-24" />
                </div>
                {/* Button Skeleton */}
                <div className="h-8 bg-gray-700 rounded animate-pulse w-28" />
              </div>

              {/* Change Photo Button Skeleton */}
              <div className="h-10 bg-gray-700 rounded animate-pulse w-32" />
            </div>
          </div>

          {/* Profile Details Form Skeleton */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6 mb-6">
            <div className="h-6 bg-gray-700 rounded animate-pulse w-40 mb-4 md:mb-6" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {/* Full Name Field Skeleton */}
              <div className="space-y-4">
                <div>
                  <div className="h-4 bg-gray-600 rounded animate-pulse w-20 mb-2" />
                  <div className="h-10 bg-gray-900 border border-gray-700 rounded animate-pulse" />
                  <div className="h-3 bg-gray-500 rounded animate-pulse w-32 mt-1" />
                </div>
              </div>

              {/* Username Field Skeleton */}
              <div className="space-y-4">
                <div>
                  <div className="h-4 bg-gray-600 rounded animate-pulse w-20 mb-2" />
                  <div className="h-10 bg-gray-900 border border-gray-700 rounded animate-pulse" />
                  <div className="h-3 bg-gray-500 rounded animate-pulse w-48 mt-1" />
                </div>
              </div>
            </div>

            {/* Edit Button Skeleton */}
            <div className="flex justify-end mt-4 md:mt-6">
              <div className="h-10 bg-purple-600/50 rounded animate-pulse w-20" />
            </div>
          </div>

          {/* Email Address Section Skeleton */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6 mb-6">
            <div className="h-6 bg-gray-700 rounded animate-pulse w-40 mb-3 md:mb-4" />
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 bg-gray-600 rounded animate-pulse" />
              <div>
                <div className="h-4 bg-gray-700 rounded animate-pulse w-48 mb-1" />
                <div className="h-3 bg-gray-500 rounded animate-pulse w-32" />
              </div>
            </div>
          </div>

          {/* Change Password Section Skeleton */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6 mb-6">
            <div className="h-6 bg-gray-700 rounded animate-pulse w-36 mb-4 md:mb-6" />
            <div className="space-y-4">
              <div>
                <div className="h-4 bg-gray-600 rounded animate-pulse w-24 mb-2" />
                <div className="h-10 bg-gray-900 border border-gray-700 rounded animate-pulse" />
                <div className="h-3 bg-gray-500 rounded animate-pulse w-28 mt-1" />
              </div>

              <div>
                <div className="h-4 bg-gray-600 rounded animate-pulse w-32 mb-2" />
                <div className="h-10 bg-gray-900 border border-gray-700 rounded animate-pulse" />
              </div>

              {/* Change Password Button Skeleton */}
              <div className="flex justify-end">
                <div className="h-10 bg-purple-600/50 rounded animate-pulse w-36" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}