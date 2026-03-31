"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getProfile, updateProfile, changePassword, getProfileStats, getNotificationPreferences, updateNotificationPreferences, deleteNotificationPreferences, sendExpirationReminder, getAuthToken, clearAuthToken, type Profile, type ProfileStats } from "@/lib/api";

export default function AccountSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Profile data
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  
  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Active tab
  const [activeTab, setActiveTab] = useState<"profile" | "password" | "households" | "stats" | "notifications">("profile");
  
  // Household states
  const [households, setHouseholds] = useState<any[]>([]);
  const [joinHouseholdId, setJoinHouseholdId] = useState("");
  const [joiningHousehold, setJoiningHousehold] = useState(false);
  const [selectedHouseholdForEdit, setSelectedHouseholdForEdit] = useState<string | null>(null);
  const [householdMembers, setHouseholdMembers] = useState<any[]>([]);
  const [editingHouseholdName, setEditingHouseholdName] = useState("");

  // Notification preferences (expiration reminders – email only)
  const [notificationEmail, setNotificationEmail] = useState("");
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notificationSuccess, setNotificationSuccess] = useState(false);
  const [notificationPrefsLoaded, setNotificationPrefsLoaded] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);
  const [cancellingNotifications, setCancellingNotifications] = useState(false);
  const [notificationCancelSuccess, setNotificationCancelSuccess] = useState(false);

  // Load profile data
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [profileData, statsData, prefsData] = await Promise.all([
          getProfile(),
          getProfileStats(),
          getNotificationPreferences(),
        ]);
        setProfile(profileData);
        setStats(statsData);
        setName(profileData.name || "");
        setEmail(profileData.email || "");
        let email = prefsData.channel === "email" ? (prefsData.contact || "") : "";
        if (!email && profileData.email) email = profileData.email;
        setNotificationEmail(email);
        setNotificationPrefsLoaded(true);
        // Load households
        await loadHouseholds();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load account information");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);
  
  const loadHouseholds = async () => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/api/households`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setHouseholds(data.households || []);
      }
    } catch (err) {
      console.error('Failed to load households:', err);
    }
  };
  
  const handleJoinHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoiningHousehold(true);
    setError(null);
    setSuccess(null);
    
    try {
      const token = await getAuthToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/api/households/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ household_id: joinHouseholdId })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to join household');
      }
      
      setSuccess('Successfully joined household!');
      setJoinHouseholdId('');
      await loadHouseholds();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join household');
    } finally {
      setJoiningHousehold(false);
    }
  };
  
  const loadHouseholdMembers = async (householdId: string) => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/api/households/${householdId}/members`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setHouseholdMembers(data.members || []);
      }
    } catch (err) {
      console.error('Failed to load household members:', err);
    }
  };
  
  const handleUpdateHouseholdName = async (householdId: string) => {
    if (!editingHouseholdName.trim()) return;
    
    try {
      const token = await getAuthToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/api/households/${householdId}?name=${encodeURIComponent(editingHouseholdName)}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Failed to update household name');
      
      setSuccess('Household name updated!');
      setSelectedHouseholdForEdit(null);
      setEditingHouseholdName('');
      await loadHouseholds();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update household');
    }
  };

  const isValidNotificationEmail = (value: string) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value.trim());

  const handleNotificationSave = async () => {
    setNotificationError(null);
    setNotificationSuccess(false);
    const email = notificationEmail.trim();
    if (!email) {
      setNotificationError("Please enter your email address.");
      return;
    }
    if (!isValidNotificationEmail(email)) {
      setNotificationError("Please enter a valid email address.");
      return;
    }
    setNotificationSaving(true);
    try {
      await updateNotificationPreferences({ channel: "email", contact: email });
      setNotificationSuccess(true);
      setTimeout(() => setNotificationSuccess(false), 3000);
    } catch (err) {
      setNotificationError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setNotificationSaving(false);
    }
  };

  const handleSendReminderNow = async () => {
    setReminderMessage(null);
    setSendingReminder(true);
    try {
      const res = await sendExpirationReminder(7);
      setReminderMessage(res.sent ? "Reminder sent!" : res.message || "No items expiring in the next 7 days, or email is not configured.");
      setTimeout(() => setReminderMessage(null), 5000);
    } catch (err) {
      setReminderMessage(err instanceof Error ? err.message : "Failed to send reminder");
    } finally {
      setSendingReminder(false);
    }
  };

  const handleCancelNotifications = async () => {
    setNotificationError(null);
    setNotificationSuccess(false);
    setCancellingNotifications(true);
    try {
      await deleteNotificationPreferences();
      setNotificationEmail("");
      setNotificationCancelSuccess(true);
      setTimeout(() => setNotificationCancelSuccess(false), 4000);
    } catch (err) {
      setNotificationError(err instanceof Error ? err.message : "Failed to cancel notifications");
    } finally {
      setCancellingNotifications(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateProfile({
        name: name.trim() || undefined,
        email: email.trim() || undefined,
      });
      setProfile(updated);
      setSuccess("Profile updated successfully!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    // Validation
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters");
      setSaving(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      setSaving(false);
      return;
    }

    try {
      await changePassword(currentPassword, newPassword);
      setSuccess("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    clearAuthToken();
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.dispatchEvent(new Event("auth-change"));
    router.replace("/");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-slate-600">Loading account information...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Account Settings</h1>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab("profile")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "profile"
                ? "border-green-600 text-green-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab("password")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "password"
                ? "border-green-600 text-green-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Change Password
          </button>
          <button
            onClick={() => setActiveTab("households")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "households"
                ? "border-green-600 text-green-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Households
          </button>
          <button
            onClick={() => setActiveTab("stats")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "stats"
                ? "border-green-600 text-green-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Statistics
          </button>
          <button
            onClick={() => setActiveTab("notifications")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "notifications"
                ? "border-green-600 text-green-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Notifications
          </button>
        </nav>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {success}
        </div>
      )}

      {/* Profile Tab */}
      {activeTab === "profile" && (
        <div className="card p-6">
          <h2 className="text-xl font-semibold mb-4">Profile Information</h2>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                placeholder="Your name"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                placeholder="your.email@example.com"
              />
            </div>

            <div className="flex items-center justify-between pt-4">
              <div className="text-sm text-gray-500">
                {profile && (
                  <>
                    Member since: {new Date(profile.created_at).toLocaleDateString()}
                  </>
                )}
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Password Tab */}
      {activeTab === "password" && (
        <div className="card p-6">
          <h2 className="text-xl font-semibold mb-4">Change Password</h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Current Password
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                required
              />
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                required
                minLength={6}
              />
              <p className="mt-1 text-xs text-gray-500">Must be at least 6 characters</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                required
                minLength={6}
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Changing Password..." : "Change Password"}
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Household Tab */}
      {activeTab === "households" && (
        <div className="card p-6">
          <h2 className="text-xl font-semibold mb-4">My Households</h2>
          
          {/* Current Households */}
          <div className="space-y-3 mb-6">
            {households.length > 0 ? (
              households.map((household) => (
                <div key={household.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    {selectedHouseholdForEdit === household.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editingHouseholdName}
                          onChange={(e) => setEditingHouseholdName(e.target.value)}
                          className="border rounded px-2 py-1 text-sm flex-1"
                          placeholder="Household name"
                        />
                        <button
                          onClick={() => handleUpdateHouseholdName(household.id)}
                          className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setSelectedHouseholdForEdit(null);
                            setEditingHouseholdName('');
                          }}
                          className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <h3 className="font-medium">{household.name}</h3>
                          <p className="text-sm text-gray-500">ID: {household.id}</p>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedHouseholdForEdit(household.id);
                            setEditingHouseholdName(household.name);
                            loadHouseholdMembers(household.id);
                          }}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                        >
                          Manage
                        </button>
                      </>
                    )}
                  </div>
                  
                  {/* Show members when managing */}
                  {selectedHouseholdForEdit === household.id && householdMembers.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <h4 className="text-sm font-medium mb-2">Members:</h4>
                      <ul className="space-y-1">
                        {householdMembers.map((member) => (
                          <li key={member.id} className="text-sm text-gray-600">
                            {member.name} ({member.email})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm">You are not in any households yet.</p>
            )}
          </div>
          
          {/* Join Household Form */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-3">Join a Household</h3>
            <form onSubmit={handleJoinHousehold} className="space-y-3">
              <div>
                <label htmlFor="householdId" className="block text-sm font-medium text-gray-700 mb-1">
                  Household ID
                </label>
                <input
                  id="householdId"
                  type="text"
                  value={joinHouseholdId}
                  onChange={(e) => setJoinHouseholdId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                  placeholder="Enter household ID"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">Ask your household admin for the ID</p>
              </div>
              <button
                type="submit"
                disabled={joiningHousehold}
                className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {joiningHousehold ? "Joining..." : "Join Household"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === "notifications" && (
        <div className="card p-6">
          <h2 className="text-xl font-semibold mb-2">Notifications</h2>
          <p className="text-gray-600 text-sm mb-4">Get an email when pantry items are close to expiring.</p>
          {notificationPrefsLoaded ? (
            <div className="flex flex-col gap-3 max-w-md">
              <input
                type="email"
                value={notificationEmail}
                onChange={(e) => {
                  setNotificationEmail(e.target.value);
                  setNotificationError(null);
                }}
                placeholder="you@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm"
                maxLength={255}
                aria-label="Email for expiration notifications"
              />
              {notificationError && (
                <p className="text-sm text-red-600" role="alert">{notificationError}</p>
              )}
              {notificationSuccess && (
                <p className="text-sm text-green-600" role="status">Saved. You&apos;ll get notified by email when items are close to expiring.</p>
              )}
              {notificationCancelSuccess && (
                <p className="text-sm text-green-600" role="status">Notifications stopped. You won&apos;t receive expiration reminder emails.</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleNotificationSave}
                  disabled={notificationSaving || !notificationEmail.trim()}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {notificationSaving ? "Saving..." : "Save notification preference"}
                </button>
                {notificationEmail.trim() && (
                  <button
                    type="button"
                    onClick={handleSendReminderNow}
                    disabled={sendingReminder}
                    className="px-6 py-2 border border-gray-300 bg-white text-gray-700 rounded-lg font-medium hover:bg-gray-50 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendingReminder ? "Sending..." : "Send reminder now (next 7 days)"}
                  </button>
                )}
              </div>
              {reminderMessage && (
                <p className="text-sm text-gray-600" role="status">{reminderMessage}</p>
              )}
              <div className="pt-2 border-t border-gray-200 mt-2">
                <button
                  type="button"
                  onClick={handleCancelNotifications}
                  disabled={cancellingNotifications}
                  className="text-sm text-gray-500 hover:text-red-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {cancellingNotifications ? "Cancelling..." : "Stop notifications"}
                </button>
                <p className="text-xs text-gray-400 mt-1">You will no longer receive expiration reminder emails.</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Loading...</p>
          )}
        </div>
      )}

      {/* Statistics Tab */}
      {activeTab === "stats" && stats && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-6">
            <h3 className="text-lg font-semibold mb-2">Pantry Overview</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Items</span>
                <span className="text-2xl font-bold text-green-600">{stats.total_items}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Expiring Soon</span>
                <span className="text-2xl font-bold text-yellow-600">{stats.expiring_items}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Expired</span>
                <span className="text-2xl font-bold text-red-600">{stats.expired_items}</span>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-lg font-semibold mb-2">Account Information</h3>
            <div className="space-y-3">
              <div>
                <span className="text-gray-600 text-sm">Account Created</span>
                <p className="text-lg font-medium">
                  {stats.account_created
                    ? new Date(stats.account_created).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "Unknown"}
                </p>
              </div>
              {profile && (
                <div>
                  <span className="text-gray-600 text-sm">User ID</span>
                  <p className="text-sm font-mono text-gray-500 break-all">{profile.id}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Logout Button */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <button
          onClick={handleLogout}
          className="px-6 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}

