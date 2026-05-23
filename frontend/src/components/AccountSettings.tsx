import { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2, UserPlus, X, BookOpen } from "lucide-react";
import { ApiTokensSettings } from "./ApiTokensSettings";
import { Toggle } from "./Toggle";
import { usersApi, type PortalUser } from "../lib/api";
import { apiDocsUrl } from "../lib/apiBase";
import { useAuth } from "../lib/auth";

type UserFormState = {
  username: string;
  password: string;
  is_admin: boolean;
  is_readonly: boolean;
};

const emptyForm = (): UserFormState => ({
  username: "",
  password: "",
  is_admin: false,
  is_readonly: false,
});

export function AccountSettings() {
  const { isAdmin, username: currentUsername } = useAuth();
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<PortalUser | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [formMsg, setFormMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(() => {
    return usersApi
      .list()
      .then(setUsers)
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load users");
        setUsers([]);
      });
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    loadUsers().finally(() => setLoading(false));
  }, [isAdmin, loadUsers]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormMsg("");
    setModal("create");
  };

  const openEdit = (u: PortalUser) => {
    setEditing(u);
    setForm({
      username: u.username,
      password: "",
      is_admin: u.is_admin,
      is_readonly: u.is_readonly,
    });
    setFormMsg("");
    setModal("edit");
  };

  const closeModal = () => {
    setModal(null);
    setEditing(null);
    setForm(emptyForm());
    setFormMsg("");
  };

  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMsg("");
    setSaving(true);
    try {
      if (modal === "create") {
        if (!form.password || form.password.length < 6) {
          setFormMsg("Password is required (min 6 characters).");
          return;
        }
        await usersApi.create(
          form.username,
          form.password,
          form.is_admin,
          form.is_readonly
        );
        setFormMsg("User created.");
      } else if (editing) {
        const body: {
          username?: string;
          password?: string;
          is_admin?: boolean;
          is_readonly?: boolean;
        } = {
          username: form.username,
          is_admin: form.is_admin,
          is_readonly: form.is_readonly,
        };
        if (form.password) {
          if (form.password.length < 6) {
            setFormMsg("Password must be at least 6 characters.");
            return;
          }
          body.password = form.password;
        }
        await usersApi.update(editing.id, body);
        setFormMsg("User updated.");
      }
      await loadUsers();
      setTimeout(closeModal, 600);
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (u: PortalUser) => {
    if (
      !window.confirm(
        `Delete user "${u.username}"? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await usersApi.remove(u.id);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (!isAdmin) {
    return (
      <div className="card-glow p-6 text-sm text-mist max-w-xl">
        Portal account management is available to administrators only.
      </div>
    );
  }

  if (loading) {
    return <p className="text-sm text-mist">Loading users…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mist">
          Manage who can sign in to this portal. Edit a user to change their password or role.
        </p>
        <button type="button" onClick={openCreate} className="btn-primary flex items-center gap-2">
          <UserPlus className="w-4 h-4" />
          Create new user
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="card-glow overflow-hidden">
        <table className="table-zebra">
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Access</th>
              <th className="text-right w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-mist py-8 text-center">
                  No users yet. Create one to get started.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium text-cyan-glow/90 mono">{u.username}</td>
                  <td>
                    <span
                      className={
                        u.is_admin
                          ? "text-purple-300 text-xs uppercase tracking-wide"
                          : "text-mist text-xs"
                      }
                    >
                      {u.is_admin ? "Admin" : "User"}
                    </span>
                  </td>
                  <td className="text-xs text-mist">
                    {u.is_readonly ? "Read-only" : "Read/write"}
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(u)}
                        className="p-2 rounded-lg text-mist hover:text-cyan-glow hover:bg-cyan/10 transition"
                        title={`Edit ${u.username}`}
                        aria-label={`Edit ${u.username}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteUser(u)}
                        disabled={u.username === currentUsername}
                        className="p-2 rounded-lg text-mist hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-30 disabled:pointer-events-none"
                        title={
                          u.username === currentUsername
                            ? "Cannot delete your own account"
                            : `Delete ${u.username}`
                        }
                        aria-label={`Delete ${u.username}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-void/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-modal-title"
        >
          <div className="card-glow w-full max-w-md p-6 space-y-4 relative">
            <button
              type="button"
              onClick={closeModal}
              className="absolute top-4 right-4 p-1 text-mist hover:text-cyan-glow"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 id="user-modal-title" className="text-lg font-semibold text-cyan-glow pr-8">
              {modal === "create" ? "Create new user" : `Edit ${editing?.username}`}
            </h2>

            <form onSubmit={saveUser} className="space-y-3">
              <div>
                <label className="text-xs text-mist mb-1 block">Username</label>
                <input
                  className="input-dark"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                  minLength={3}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="text-xs text-mist mb-1 block">
                  Password{modal === "edit" ? " (leave blank to keep current)" : ""}
                </label>
                <input
                  type="password"
                  className="input-dark"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={modal === "create"}
                  minLength={modal === "create" ? 6 : undefined}
                  autoComplete="new-password"
                  placeholder={modal === "edit" ? "••••••••" : undefined}
                />
              </div>
              <Toggle
                checked={form.is_admin}
                onChange={(is_admin) =>
                  setForm({ ...form, is_admin, ...(is_admin ? { is_readonly: false } : {}) })
                }
                label="Grant admin access (can change system settings)"
              />
              <Toggle
                checked={form.is_readonly}
                onChange={(is_readonly) =>
                  setForm({ ...form, is_readonly, ...(is_readonly ? { is_admin: false } : {}) })
                }
                label="Read-only (view dashboards, cannot save settings)"
                disabled={form.is_admin}
              />

              {formMsg && (
                <p
                  className={`text-sm ${
                    formMsg.includes("created") || formMsg.includes("updated")
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {formMsg}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={saving}>
                  {saving ? "Saving…" : modal === "create" ? "Create user" : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl border border-surface text-mist hover:text-cyan-glow"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="pt-6 border-t border-surface/80">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-cyan-glow">API tokens</h2>
          <a
            href={apiDocsUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-cyan-glow border border-cyan/30 px-3 py-1.5 rounded-lg hover:bg-cyan/10 transition"
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            API docs (Swagger)
          </a>
        </div>
        <ApiTokensSettings />
      </div>
    </div>
  );
}
