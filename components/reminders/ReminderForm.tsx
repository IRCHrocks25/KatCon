"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import {
  Calendar,
  X,
  User,
  Users,
  ChevronDown,
  Check,
  Loader2,
} from "lucide-react";
import type { Reminder } from "@/lib/supabase/reminders";
import { getAllUsers, type UserWithTeam } from "@/lib/supabase/users";
import type { AccountType } from "@/lib/supabase/auth";

interface ReminderFormProps {
  initialData?: Reminder;
  onSubmit: (data: {
    title: string;
    description: string;
    dueDate: string;
    assignedTo: string[];
  }) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function ReminderForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
}: ReminderFormProps) {
  const [title, setTitle] = useState(initialData?.title || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [dueDate, setDueDate] = useState(
    initialData?.dueDate
      ? new Date(initialData.dueDate).toISOString().slice(0, 16)
      : ""
  );
  const [assignedTo, setAssignedTo] = useState<string[]>(
    initialData?.assignedTo || []
  );

  const [allUsers, setAllUsers] = useState<UserWithTeam[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isEditing = !!initialData;

  // Fetch users on mount
  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoadingUsers(true);
      try {
        const users = await getAllUsers();
        setAllUsers(users);
      } catch (error) {
        console.error("Error fetching users:", error);
      } finally {
        setIsLoadingUsers(false);
      }
    };
    fetchUsers();
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdown]);

  // Group users by team
  const usersByTeam = allUsers.reduce((acc, user) => {
    if (!acc[user.accountType]) {
      acc[user.accountType] = [];
    }
    acc[user.accountType].push(user);
    return acc;
  }, {} as Record<AccountType, UserWithTeam[]>);

  const teamOptions = Object.keys(usersByTeam) as AccountType[];

  // Filter based on search
  const filteredUsers = allUsers.filter((user) => {
    const query = searchQuery.toLowerCase();
    return (
      user.email.toLowerCase().includes(query) ||
      user.fullname?.toLowerCase().includes(query) ||
      user.accountType.toLowerCase().includes(query)
    );
  });

  const filteredTeams = teamOptions.filter((team) =>
    team.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleAssignment = (assignment: string) => {
    if (assignedTo.includes(assignment)) {
      setAssignedTo(assignedTo.filter((a) => a !== assignment));
    } else {
      setAssignedTo([...assignedTo, assignment]);
    }
  };

  const handleRemoveAssignment = (assignment: string) => {
    setAssignedTo(assignedTo.filter((a) => a !== assignment));
  };

  const getAssignmentDisplay = (assignment: string) => {
    if (assignment.startsWith("team:")) {
      return { display: `${assignment.replace("team:", "")} Team`, isTeam: true };
    }
    return { display: assignment, isTeam: false };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    await onSubmit({
      title: title.trim(),
      description: description.trim(),
      dueDate,
      assignedTo,
    });
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      onSubmit={handleSubmit}
      className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-4"
    >
      {/* Title */}
      <div>
        <input
          type="text"
          placeholder="Task title *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          autoFocus
          required
        />
      </div>

      {/* Description */}
      <div>
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
        />
      </div>

      {/* Due Date */}
      <div className="relative">
        <input
          type="datetime-local"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full px-4 py-3 pr-12 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          style={{ colorScheme: "dark" }}
        />
        <Calendar
          size={18}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
      </div>

      {/* Assignees */}
      <div className="space-y-2 relative" ref={dropdownRef}>
        <label className="text-sm text-gray-400 flex items-center gap-2">
          <Users size={14} />
          Assign to (optional)
        </label>

        {/* Dropdown Trigger */}
        <button
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={isLoadingUsers}
          className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-left flex items-center justify-between hover:border-gray-500 transition disabled:opacity-50"
        >
          <span className="text-gray-400">
            {assignedTo.length > 0
              ? `${assignedTo.length} selected`
              : "Select users or teams"}
          </span>
          <ChevronDown
            size={18}
            className={`text-gray-400 transition-transform ${
              showDropdown ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* Dropdown Menu */}
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute z-[100] w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl max-h-64 overflow-hidden flex flex-col"
          >
            {/* Search */}
            <div className="p-2 border-b border-gray-700">
              <input
                type="text"
                placeholder="Search users or teams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900/50 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                autoFocus
              />
            </div>

            {/* Options */}
            <div className="overflow-y-auto flex-1 custom-scrollbar">
              {isLoadingUsers ? (
                <div className="p-4 text-center text-gray-400">
                  <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                  <span className="text-sm">Loading...</span>
                </div>
              ) : (
                <>
                  {/* Teams */}
                  {filteredTeams.length > 0 && (
                    <div className="p-2">
                      <div className="text-xs text-gray-500 font-medium px-2 py-1 uppercase tracking-wider">
                        Teams
                      </div>
                      {filteredTeams.map((team) => {
                        const teamAssignment = `team:${team}`;
                        const isSelected = assignedTo.includes(teamAssignment);
                        const memberCount = usersByTeam[team]?.length || 0;

                        return (
                          <button
                            key={team}
                            type="button"
                            onClick={() => handleToggleAssignment(teamAssignment)}
                            className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-700/50 rounded transition"
                          >
                            <div
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                isSelected
                                  ? "bg-purple-600 border-purple-600"
                                  : "border-gray-600"
                              }`}
                            >
                              {isSelected && <Check size={12} className="text-white" />}
                            </div>
                            <Users size={16} className="text-purple-400" />
                            <div className="flex-1 text-left">
                              <div className="text-sm text-white font-medium">
                                {team} Team
                              </div>
                              <div className="text-xs text-gray-500">
                                {memberCount} members
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Individual Users */}
                  {filteredUsers.length > 0 && (
                    <div className="p-2">
                      {filteredTeams.length > 0 && (
                        <div className="text-xs text-gray-500 font-medium px-2 py-1 uppercase tracking-wider">
                          Users
                        </div>
                      )}
                      {filteredUsers.map((user) => {
                        const isSelected = assignedTo.includes(user.email);

                        return (
                          <button
                            key={user.email}
                            type="button"
                            onClick={() => handleToggleAssignment(user.email)}
                            className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-700/50 rounded transition"
                          >
                            <div
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                isSelected
                                  ? "bg-purple-600 border-purple-600"
                                  : "border-gray-600"
                              }`}
                            >
                              {isSelected && <Check size={12} className="text-white" />}
                            </div>
                            <User size={16} className="text-gray-400" />
                            <div className="flex-1 text-left min-w-0">
                              <div className="text-sm text-white truncate">
                                {user.fullname || user.email}
                              </div>
                              <div className="text-xs text-gray-500 truncate">
                                {user.fullname ? user.email : user.accountType}
                              </div>
                            </div>
                            <span className="text-xs text-gray-600 bg-gray-700/50 px-2 py-0.5 rounded">
                              {user.accountType}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {filteredTeams.length === 0 && filteredUsers.length === 0 && (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      No users or teams found
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* Selected Chips */}
        {assignedTo.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {assignedTo.map((assignment) => {
              const { display, isTeam } = getAssignmentDisplay(assignment);
              return (
                <div
                  key={assignment}
                  className="flex items-center gap-1.5 px-2 py-1 bg-purple-600/20 text-purple-300 rounded-full text-xs"
                >
                  {isTeam ? <Users size={12} /> : <User size={12} />}
                  <span>{display}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAssignment(assignment)}
                    className="hover:text-white transition"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting || !title.trim()}
          className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              {isEditing ? "Saving..." : "Creating..."}
            </>
          ) : isEditing ? (
            "Save Changes"
          ) : (
            "Create Task"
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </motion.form>
  );
}

