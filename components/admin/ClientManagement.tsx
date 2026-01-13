"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/contexts/ClientsContext";
import { toast } from "sonner";
import {
  Users,
  Plus,
  Edit,
  Trash2,
  Search,
  Building,
  Mail,
  Phone,
  MapPin,
  FileText,
  Loader2,
} from "lucide-react";
import type { Client } from "@/lib/supabase/clients";

export function ClientManagement() {
  const { user } = useAuth();
  const { clients, isLoading, error, refreshClients } = useClients();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Form states
  const [createForm, setCreateForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  });
  const [editForm, setEditForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  });

  // Check permissions
  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "admin" || user?.role === "manager";
  const canManageClients = isManager; // Managers and admins can create/edit/delete clients

  // Filter clients based on search query
  const filteredClients = clients.filter((client) => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    return (
      client.name.toLowerCase().includes(query) ||
      client.company?.toLowerCase().includes(query) ||
      client.email?.toLowerCase().includes(query) ||
      client.phone?.toLowerCase().includes(query) ||
      client.notes?.toLowerCase().includes(query)
    );
  });

  const handleCreateClient = async () => {
    if (!createForm.name.trim()) {
      toast.error("Client name is required");
      return;
    }

    setActionLoading("create");
    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(createForm),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success("Client created successfully");
        await refreshClients();
        setShowCreateModal(false);
        setCreateForm({
          name: "",
          company: "",
          email: "",
          phone: "",
          address: "",
          notes: "",
        });
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to create client");
      }
    } catch (error) {
      console.error("Error creating client:", error);
      toast.error("Failed to create client");
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditClient = async () => {
    if (!selectedClient || !editForm.name.trim()) {
      toast.error("Client name is required");
      return;
    }

    setActionLoading(selectedClient.id);
    try {
      const response = await fetch(`/api/clients/${selectedClient.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(editForm),
      });

      if (response.ok) {
        toast.success("Client updated successfully");
        await refreshClients();
        setShowEditModal(false);
        setSelectedClient(null);
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to update client");
      }
    } catch (error) {
      console.error("Error updating client:", error);
      toast.error("Failed to update client");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteClient = async () => {
    if (!selectedClient) return;

    setActionLoading(selectedClient.id);
    try {
      const response = await fetch(`/api/clients/${selectedClient.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (response.ok) {
        toast.success("Client deleted successfully");
        await refreshClients();
        setShowDeleteModal(false);
        setSelectedClient(null);
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to delete client");
      }
    } catch (error) {
      console.error("Error deleting client:", error);
      toast.error("Failed to delete client");
    } finally {
      setActionLoading(null);
    }
  };

  const openEditModal = (client: Client) => {
    setSelectedClient(client);
    setEditForm({
      name: client.name,
      company: client.company || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      notes: client.notes || "",
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (client: Client) => {
    setSelectedClient(client);
    setShowDeleteModal(true);
  };

  const { session } = useAuth();

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-2">Failed to load clients</p>
          <p className="text-gray-500 text-sm">{error}</p>
          <button
            onClick={refreshClients}
            className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded transition"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-black text-white overflow-auto" role="main" aria-label="Client management dashboard">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-950/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-white">Client Management</h1>
            <p className="text-xs sm:text-sm text-gray-400">
              Manage your client relationships and contacts
            </p>
          </div>
          {/* Create Client button only for admins */}
          {canManageClients && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition cursor-pointer"
              aria-label="Create new client"
            >
              <Plus size={16} aria-hidden="true" />
              Add Client
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 sm:mb-6">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Users className="text-blue-400" size={24} />
              <div>
                <p className="text-2xl font-bold text-white">{clients.length}</p>
                <p className="text-sm text-gray-400">Total Clients</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Building className="text-green-400" size={24} />
              <div>
                <p className="text-2xl font-bold text-white">
                  {clients.filter(c => c.company).length}
                </p>
                <p className="text-sm text-gray-400">Companies</p>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Create Client Button - only for admins */}
        {canManageClients && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition cursor-pointer w-full mb-4 sm:hidden"
            aria-label="Create new client"
          >
            <Plus size={16} aria-hidden="true" />
            Add Client
          </button>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="text-lg font-semibold text-white">All Clients</h2>

          {/* Search Input */}
          <div className="relative w-full sm:w-auto">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full sm:w-64"
              aria-label="Search clients by name, company, email, or notes"
            />
          </div>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={32} className="text-purple-500 animate-spin" />
            <span className="ml-2 text-gray-400">Loading clients...</span>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Client
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Contact
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Company
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {filteredClients.map((client) => (
                      <tr key={client.id} className="hover:bg-gray-700/50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-white">{client.name}</p>
                            {client.notes && (
                              <p className="text-sm text-gray-400 truncate max-w-xs">
                                {client.notes}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            {client.email && (
                              <div className="flex items-center gap-2 text-sm text-gray-300">
                                <Mail size={12} />
                                <span>{client.email}</span>
                              </div>
                            )}
                            {client.phone && (
                              <div className="flex items-center gap-2 text-sm text-gray-300">
                                <Phone size={12} />
                                <span>{client.phone}</span>
                              </div>
                            )}
                            {client.address && (
                              <div className="flex items-center gap-2 text-sm text-gray-300">
                                <MapPin size={12} />
                                <span className="truncate max-w-xs">{client.address}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-300">{client.company || "-"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {canManageClients && (
                              <>
                                <button
                                  onClick={() => openEditModal(client)}
                                  disabled={actionLoading === client.id}
                                  className="px-2 py-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs rounded transition disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-110 active:scale-95 cursor-pointer"
                                  title="Edit client details"
                                >
                                  <Edit size={12} />
                                </button>
                                <button
                                  onClick={() => openDeleteModal(client)}
                                  disabled={actionLoading === client.id}
                                  className="px-2 py-1 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-xs rounded transition disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-110 active:scale-95 cursor-pointer"
                                  title="Delete this client"
                                >
                                  <Trash2 size={12} />
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
              {filteredClients.map((client) => (
                <div key={client.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-white truncate">{client.name}</h3>
                      {client.company && (
                        <p className="text-sm text-gray-400 truncate">{client.company}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 mb-3">
                    {client.email && (
                      <div className="flex items-center gap-2 text-sm text-gray-300">
                        <Mail size={14} />
                        <span className="truncate">{client.email}</span>
                      </div>
                    )}
                    {client.phone && (
                      <div className="flex items-center gap-2 text-sm text-gray-300">
                        <Phone size={14} />
                        <span>{client.phone}</span>
                      </div>
                    )}
                    {client.address && (
                      <div className="flex items-center gap-2 text-sm text-gray-300">
                        <MapPin size={14} />
                        <span className="truncate">{client.address}</span>
                      </div>
                    )}
                    {client.notes && (
                      <div className="flex items-start gap-2 text-sm text-gray-300">
                        <FileText size={14} className="mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2">{client.notes}</span>
                      </div>
                    )}
                  </div>

                  {canManageClients && (
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => openEditModal(client)}
                        disabled={actionLoading === client.id}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs rounded transition disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95 cursor-pointer"
                        title="Edit client details"
                      >
                        <Edit size={12} className="inline mr-1" />
                        Edit
                      </button>
                      <button
                        onClick={() => openDeleteModal(client)}
                        disabled={actionLoading === client.id}
                        className="px-3 py-1 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-xs rounded transition disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95 cursor-pointer"
                        title="Delete this client"
                      >
                        <Trash2 size={12} className="inline mr-1" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Empty State */}
            {filteredClients.length === 0 && !isLoading && (
              <div className="text-center py-8">
                <Users size={48} className="mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium text-white mb-2">
                  {searchQuery ? "No clients found" : "No clients yet"}
                </h3>
                <p className="text-gray-400 mb-4">
                  {searchQuery
                    ? "Try adjusting your search terms"
                    : "Start building your client relationships"
                  }
                </p>
                {canManageClients && !searchQuery && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition"
                  >
                    Add Your First Client
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Client Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 flex-shrink-0">
              <h3 className="text-lg font-semibold text-white mb-4">Add New Client</h3>
            </div>
            <div className="px-6 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Name *
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  placeholder="Client name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Company
                </label>
                <input
                  type="text"
                  value={createForm.company}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, company: e.target.value }))
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  placeholder="Company name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  placeholder="client@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  value={createForm.phone}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Address
                </label>
                <textarea
                  value={createForm.address}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, address: e.target.value }))
                  }
                  rows={3}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  placeholder="Street address, city, state, zip"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Notes
                </label>
                <textarea
                  value={createForm.notes}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  rows={3}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  placeholder="Additional notes about this client"
                />
              </div>
            </div>
            <div className="p-6 flex-shrink-0 border-t border-gray-700">
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateClient}
                  disabled={actionLoading === "create" || !createForm.name.trim()}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading === "create" ? (
                    <Loader2 size={16} className="animate-spin mx-auto" />
                  ) : (
                    "Add Client"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {showEditModal && selectedClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 flex-shrink-0">
              <h3 className="text-lg font-semibold text-white mb-4">Edit Client</h3>
            </div>
            <div className="px-6 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Name *
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Company
                </label>
                <input
                  type="text"
                  value={editForm.company}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, company: e.target.value }))
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>
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
                  Phone
                </label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Address
                </label>
                <textarea
                  value={editForm.address}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, address: e.target.value }))
                  }
                  rows={3}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Notes
                </label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  rows={3}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
            <div className="p-6 flex-shrink-0 border-t border-gray-700">
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedClient(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditClient}
                  disabled={actionLoading === selectedClient.id || !editForm.name.trim()}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading === selectedClient.id ? (
                    <Loader2 size={16} className="animate-spin mx-auto" />
                  ) : (
                    "Update Client"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Client Modal */}
      {showDeleteModal && selectedClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Client</h3>
            <p className="text-gray-300 mb-4">
              Are you sure you want to delete{" "}
              <strong>{selectedClient.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedClient(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteClient}
                disabled={actionLoading === selectedClient.id}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === selectedClient.id ? (
                  <Loader2 size={16} className="animate-spin mx-auto" />
                ) : (
                  "Delete Client"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}