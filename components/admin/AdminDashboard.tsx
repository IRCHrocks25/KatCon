"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Loader2,
  Users,
  UserCheck,
  UserX,
  Shield,
  Plus,
  Edit,
  Trash2,
  Eye,
  Search,
} from "lucide-react";
import type { AccountType, UserRole } from "@/lib/supabase/auth";
import {
  getStorageItem,
  setStorageItem,
  removeStorageItem,
} from "@/lib/utils/storage";
import { AdminKanbanView } from "./AdminKanbanView";

interface UserProfile {
  id: string;
  email: string;
  fullname?: string;
  username?: string;
  account_type: AccountType;
  approved: boolean;
  role: UserRole;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

const CACHE_KEY = "admin_users_cache";
const CACHE_TIMESTAMP_KEY = "admin_users_cache_timestamp";
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export function AdminDashboard() {
  const { user, session, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>(() => {
    // Try to restore from cache on mount
    try {
      const cached = getStorageItem(CACHE_KEY);
      const timestamp = getStorageItem(CACHE_TIMESTAMP_KEY);
      if (cached && timestamp) {
        const age = Date.now() - Number.parseInt(timestamp, 10);
        if (age < CACHE_DURATION_MS) {
          return JSON.parse(cached);
        }
      }
    } catch {
      // Ignore cache restore errors
    }
    return [];
  });
  const [loading, setLoading] = useState(() => {
    // Only show loading if we don't have cached data
    try {
      const cached = getStorageItem(CACHE_KEY);
      const timestamp = getStorageItem(CACHE_TIMESTAMP_KEY);
      if (cached && timestamp) {
        const age = Date.now() - Number.parseInt(timestamp, 10);
        if (age < CACHE_DURATION_MS) {
          return false; // We have fresh cached data
        }
      }
    } catch {
      // Ignore errors
    }
    return true;
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);
  const isFetchingRef = useRef(false);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showKanbanView, setShowKanbanView] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [kanbanViewUser, setKanbanViewUser] = useState<{
    email: string;
    name?: string;
  } | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Form states
  const [createForm, setCreateForm] = useState({
    email: "",
    password: "",
    fullname: "",
    accountType: "OTHERS" as AccountType,
    role: "user" as UserRole,
  });
  const [editForm, setEditForm] = useState({
    email: "",
    fullname: "",
  });

  // Check if current user is admin
  const isAdmin = user?.role === "admin";

  // Clear cache when user changes or logs out
  useEffect(() => {
    if (!isAdmin || !user?.id) {
      // Clear cache if user is not admin or logged out
      removeStorageItem(CACHE_KEY);
      removeStorageItem(CACHE_TIMESTAMP_KEY);
    }
  }, [isAdmin, user?.id]);

  const fetchUsers = useCallback(
    async (forceRefresh = false) => {
      // Check cache first (unless forcing refresh)
      if (!forceRefresh) {
        try {
          const cached = getStorageItem(CACHE_KEY);
          const timestamp = getStorageItem(CACHE_TIMESTAMP_KEY);
          if (cached && timestamp) {
            const age = Date.now() - Number.parseInt(timestamp, 10);
            if (age < CACHE_DURATION_MS && users.length > 0) {
              setLoading(false);
              return; // Use cached data
            }
          }
        } catch (error) {
          // Ignore cache errors, proceed with fetch
        }
      }

      // Prevent multiple simultaneous fetches
      if (isFetchingRef.current && !forceRefresh) {
        return;
      }

      setLoading(true);
      isFetchingRef.current = true;
      hasFetchedRef.current = true;

      try {
        const response = await fetch("/api/admin/users", {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setUsers(data.users);
          // Cache the data
          try {
            setStorageItem(CACHE_KEY, JSON.stringify(data.users));
            setStorageItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
          } catch (error) {
            // Ignore cache errors
          }
        } else {
          toast.error("Failed to fetch users");
          hasFetchedRef.current = false; // Allow retry on error
        }
      } catch (error) {
        console.error("Error fetching users:", error);
        toast.error("Failed to load user data");
        hasFetchedRef.current = false; // Allow retry on error
      } finally {
        setLoading(false);
        isFetchingRef.current = false;
      }
    },
    [session?.access_token, users.length]
  );

  useEffect(() => {
    // Only fetch if admin, not already fetched, and we have a session
    if (
      isAdmin &&
      !hasFetchedRef.current &&
      !isFetchingRef.current &&
      session?.access_token
    ) {
      // Check if we need to fetch (no cached data or stale cache)
      const needsFetch =
        users.length === 0 ||
        (() => {
          try {
            const timestamp = getStorageItem(CACHE_TIMESTAMP_KEY);
            if (!timestamp) return true;
            const age = Date.now() - Number.parseInt(timestamp, 10);
            return age >= CACHE_DURATION_MS;
          } catch {
            return true;
          }
        })();

      if (needsFetch) {
        fetchUsers();
      } else {
        // We have fresh cached data, just ensure loading is false
        setLoading(false);
      }
    }
  }, [isAdmin, session?.access_token, fetchUsers, users.length]);

  const handleUserAction = async (
    userId: string,
    action: string,
    extraData?: { role?: string; accountType?: string }
  ) => {
    setActionLoading(userId);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          userId,
          action,
          ...extraData,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(data.message);

        // Update local state and cache
        setUsers((prev) => {
          const updated = prev.map((u) => (u.id === userId ? data.user : u));
          try {
            setStorageItem(CACHE_KEY, JSON.stringify(updated));
            setStorageItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
          } catch {
            // Ignore cache write errors
          }
          return updated;
        });
      } else {
        const error = await response.json();
        toast.error(error.error || "Action failed");
      }
    } catch (error) {
      console.error("Error performing action:", error);
      toast.error("Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const getPendingUsers = () => users.filter((u) => !u.approved);
  const getApprovedUsers = () => users.filter((u) => u.approved);

  // Filter users based on search query
  const filteredUsers = users.filter((user) => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    return (
      user.email.toLowerCase().includes(query) ||
      user.fullname?.toLowerCase().includes(query) ||
      user.username?.toLowerCase().includes(query) ||
      user.account_type.toLowerCase().includes(query) ||
      user.role.toLowerCase().includes(query)
    );
  });

  // CRUD handlers
  const handleCreateUser = async () => {
    setActionLoading("create");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          action: "create_user",
          email: createForm.email,
          password: createForm.password,
          fullname: createForm.fullname,
          accountType: createForm.accountType,
          role: createForm.role,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(data.message);
        setUsers((prev) => {
          const updated = [...prev, data.user];
          try {
            setStorageItem(CACHE_KEY, JSON.stringify(updated));
            setStorageItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
          } catch {
            // Ignore cache write errors
          }
          return updated;
        });
        setShowCreateModal(false);
        setCreateForm({
          email: "",
          password: "",
          fullname: "",
          accountType: "OTHERS",
          role: "user",
        });
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to create user");
      }
    } catch (error) {
      console.error("Error creating user:", error);
      toast.error("Failed to create user");
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditUser = async () => {
    if (!selectedUser) return;

    setActionLoading(selectedUser.id);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          action: "update_user",
          email: editForm.email,
          fullname: editForm.fullname,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(data.message);
        setUsers((prev) => {
          const updated = prev.map((u) =>
            u.id === selectedUser.id ? data.user : u
          );
          try {
            setStorageItem(CACHE_KEY, JSON.stringify(updated));
            setStorageItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
          } catch {
            // Ignore cache write errors
          }
          return updated;
        });
        setShowEditModal(false);
        setSelectedUser(null);
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to update user");
      }
    } catch (error) {
      console.error("Error updating user:", error);
      toast.error("Failed to update user");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    setActionLoading(selectedUser.id);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          action: "delete_user",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(data.message);
        setUsers((prev) => {
          const updated = prev.filter((u) => u.id !== selectedUser.id);
          try {
            setStorageItem(CACHE_KEY, JSON.stringify(updated));
            setStorageItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
          } catch {
            // Ignore cache write errors
          }
          return updated;
        });
        setShowDeleteModal(false);
        setSelectedUser(null);
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to delete user");
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error("Failed to delete user");
    } finally {
      setActionLoading(null);
    }
  };

  const openEditModal = (user: UserProfile) => {
    setSelectedUser(user);
    setEditForm({
      email: user.email,
      fullname: user.fullname || "",
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (user: UserProfile) => {
    setSelectedUser(user);
    setShowDeleteModal(true);
  };

  // Show loading while auth is still loading OR while user data is being fetched
  if (authLoading || (user && !user.role)) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2
            size={48}
            className="mx-auto mb-4 text-purple-500 animate-spin"
          />
          <p className="text-gray-400">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  // Only show access denied if we're sure the user is not an admin
  if (!isAdmin) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Shield size={48} className="mx-auto mb-4 text-gray-400" />
          <h2 className="text-xl font-semibold text-gray-300 mb-2">
            Admin Access Required
          </h2>
          <p className="text-gray-500">
            You don&apos;t have permission to access the admin panel.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2
            size={48}
            className="mx-auto mb-4 text-purple-500 animate-spin"
          />
          <p className="text-gray-400">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-black text-white overflow-auto" role="main" aria-label="Admin dashboard for user management">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-950/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-xs sm:text-sm text-gray-400">
              Manage users and system settings
            </p>
          </div>
          {/* Create User button only on desktop */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition cursor-pointer"
            aria-label="Create new user account"
          >
            <Plus size={16} aria-hidden="true" />
            Create User
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 sm:mb-6">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Users className="text-blue-400" size={24} />
              <div>
                <p className="text-2xl font-bold text-white">{users.length}</p>
                <p className="text-sm text-gray-400">Total Users</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <UserCheck className="text-green-400" size={24} />
              <div>
                <p className="text-2xl font-bold text-white">
                  {getApprovedUsers().length}
                </p>
                <p className="text-sm text-gray-400">Approved Users</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <UserX className="text-yellow-400" size={24} />
              <div>
                <p className="text-2xl font-bold text-white">
                  {getPendingUsers().length}
                </p>
                <p className="text-sm text-gray-400">Pending Approval</p>
              </div>
            </div>
          </div>
        </div>

        {/* Pending Approvals Section */}
        {getPendingUsers().length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4 text-yellow-400">
              Pending Approvals
            </h2>
            <div className="space-y-2">
              {getPendingUsers().map((user) => (
                <div
                  key={user.id}
                  className="bg-gray-800 border border-gray-700 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center text-white font-bold">
                        {(user.fullname || user.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-white">
                          {user.fullname || "No name"}
                        </p>
                        <p className="text-sm text-gray-400">{user.email}</p>
                        <p className="text-xs text-gray-500">
                          {user.account_type} • Signed up{" "}
                          {new Date(user.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUserAction(user.id, "approve")}
                        disabled={actionLoading === user.id}
                        className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-sm rounded transition disabled:opacity-50"
                      >
                        {actionLoading === user.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          "Approve"
                        )}
                      </button>
                      <button
                        onClick={() => handleUserAction(user.id, "reject")}
                        disabled={actionLoading === user.id}
                        className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-sm rounded transition disabled:opacity-50"
                      >
                        {actionLoading === user.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          "Reject"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All Users Section */}
        <div>
          {/* Mobile Create User Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition cursor-pointer w-full mb-4 sm:hidden"
            aria-label="Create new user account"
          >
            <Plus size={16} aria-hidden="true" />
            Create User
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-white">All Users</h2>

            {/* Search Input */}
            <div className="relative w-full sm:w-auto">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full sm:w-64"
                aria-label="Search users by name, email, role, or account type"
              />
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      User
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Role
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Joined
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-700/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
                            {(user.fullname || user.email)
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-white">
                              {user.fullname || "No name"}
                            </p>
                            <p className="text-sm text-gray-400">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={user.role}
                          onChange={(e) =>
                            handleUserAction(user.id, "update_role", {
                              role: e.target.value,
                            })
                          }
                          disabled={actionLoading === user.id}
                          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-purple-500"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={user.account_type}
                          onChange={(e) =>
                            handleUserAction(user.id, "update_account_type", {
                              accountType: e.target.value,
                            })
                          }
                          disabled={actionLoading === user.id}
                          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-purple-500"
                        >
                          <option value="CRM">CRM</option>
                          <option value="DEV">DEV</option>
                          <option value="PM">PM</option>
                          <option value="AI">AI</option>
                          <option value="DESIGN">DESIGN</option>
                          <option value="COPYWRITING">COPYWRITING</option>
                          <option value="OTHERS">OTHERS</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            user.approved
                              ? "bg-green-900/50 text-green-400"
                              : "bg-yellow-900/50 text-yellow-400"
                          }`}
                        >
                          {user.approved ? "Approved" : "Pending"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setKanbanViewUser({
                                email: user.email,
                                name: user.fullname,
                              });
                              setShowKanbanView(true);
                            }}
                            className="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded transition"
                            title="View kanban board"
                          >
                            <Eye size={12} />
                          </button>
                          <button
                            onClick={() => openEditModal(user)}
                            disabled={actionLoading === user.id}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition disabled:opacity-50"
                            title="Edit user"
                          >
                            <Edit size={12} />
                          </button>
                          <button
                            onClick={() => openDeleteModal(user)}
                            disabled={actionLoading === user.id}
                            className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded transition disabled:opacity-50"
                            title="Delete user"
                          >
                            <Trash2 size={12} />
                          </button>
                          {!user.approved && (
                            <>
                              <button
                                onClick={() =>
                                  handleUserAction(user.id, "approve")
                                }
                                disabled={actionLoading === user.id}
                                className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white text-xs rounded transition disabled:opacity-50"
                                title="Approve user"
                              >
                                {actionLoading === user.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  "✓"
                                )}
                              </button>
                              <button
                                onClick={() =>
                                  handleUserAction(user.id, "reject")
                                }
                                disabled={actionLoading === user.id}
                                className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded transition disabled:opacity-50"
                                title="Reject user"
                              >
                                {actionLoading === user.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  "✗"
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {filteredUsers.map((user) => (
              <div key={user.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                      {(user.fullname || user.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-white truncate">
                        {user.fullname || "No name"}
                      </p>
                      <p className="text-sm text-gray-400 truncate">
                        {user.email}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Joined {new Date(user.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full flex-shrink-0 ml-2 ${
                      user.approved
                        ? "bg-green-900/50 text-green-400"
                        : "bg-yellow-900/50 text-yellow-400"
                    }`}
                  >
                    {user.approved ? "Approved" : "Pending"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Role</label>
                    <select
                      value={user.role}
                      onChange={(e) =>
                        handleUserAction(user.id, "update_role", {
                          role: e.target.value,
                        })
                      }
                      disabled={actionLoading === user.id}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Type</label>
                    <select
                      value={user.account_type}
                      onChange={(e) =>
                        handleUserAction(user.id, "update_account_type", {
                          accountType: e.target.value,
                        })
                      }
                      disabled={actionLoading === user.id}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="CRM">CRM</option>
                      <option value="DEV">DEV</option>
                      <option value="PM">PM</option>
                      <option value="AI">AI</option>
                      <option value="DESIGN">DESIGN</option>
                      <option value="COPYWRITING">COPYWRITING</option>
                      <option value="OTHERS">OTHERS</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => {
                      setKanbanViewUser({
                        email: user.email,
                        name: user.fullname,
                      });
                      setShowKanbanView(true);
                    }}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded transition"
                  >
                    <Eye size={12} className="inline mr-1" />
                    Kanban
                  </button>
                  <button
                    onClick={() => openEditModal(user)}
                    disabled={actionLoading === user.id}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition disabled:opacity-50"
                  >
                    <Edit size={12} className="inline mr-1" />
                    Edit
                  </button>
                  <button
                    onClick={() => openDeleteModal(user)}
                    disabled={actionLoading === user.id}
                    className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded transition disabled:opacity-50"
                  >
                    <Trash2 size={12} className="inline mr-1" />
                    Delete
                  </button>
                  {!user.approved && (
                    <>
                      <button
                        onClick={() =>
                          handleUserAction(user.id, "approve")
                        }
                        disabled={actionLoading === user.id}
                        className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs rounded transition disabled:opacity-50"
                      >
                        {actionLoading === user.id ? (
                          <Loader2 size={12} className="animate-spin mr-1" />
                        ) : (
                          "✓"
                        )}
                        Approve
                      </button>
                      <button
                        onClick={() =>
                          handleUserAction(user.id, "reject")
                        }
                        disabled={actionLoading === user.id}
                        className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded transition disabled:opacity-50"
                      >
                        ✗ Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modals */}
      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">
              Create New User
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  placeholder="Enter password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={createForm.fullname}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      fullname: e.target.value,
                    }))
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Account Type
                </label>
                <select
                  value={createForm.accountType}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      accountType: e.target.value as AccountType,
                    }))
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="CRM">CRM</option>
                  <option value="DEV">DEV</option>
                  <option value="PM">PM</option>
                  <option value="AI">AI</option>
                  <option value="DESIGN">DESIGN</option>
                  <option value="COPYWRITING">COPYWRITING</option>
                  <option value="OTHERS">OTHERS</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Role
                </label>
                <select
                  value={createForm.role}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      role: e.target.value as UserRole,
                    }))
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={
                  actionLoading === "create" ||
                  !createForm.email ||
                  !createForm.password
                }
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === "create" ? (
                  <Loader2 size={16} className="animate-spin mx-auto" />
                ) : (
                  "Create User"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">Edit User</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editForm.fullname}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      fullname: e.target.value,
                    }))
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedUser(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition"
              >
                Cancel
              </button>
              <button
                onClick={handleEditUser}
                disabled={actionLoading === selectedUser.id}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === selectedUser.id ? (
                  <Loader2 size={16} className="animate-spin mx-auto" />
                ) : (
                  "Update User"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {showDeleteModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-white mb-2">
              Delete User
            </h3>
            <p className="text-gray-300 mb-4">
              Are you sure you want to delete{" "}
              <strong>{selectedUser.fullname || selectedUser.email}</strong>?
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedUser(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={actionLoading === selectedUser.id}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === selectedUser.id ? (
                  <Loader2 size={16} className="animate-spin mx-auto" />
                ) : (
                  "Delete User"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Kanban View Modal */}
      {showKanbanView && kanbanViewUser && (
        <AdminKanbanView
          userEmail={kanbanViewUser.email}
          userName={kanbanViewUser.name}
          onClose={() => {
            setShowKanbanView(false);
            setKanbanViewUser(null);
          }}
        />
      )}
    </div>
  );
}
