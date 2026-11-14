"use client";

import { useState, useEffect } from "react";

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  const loadKeys = async () => {
    try {
      const res = await fetch("/api/v1/api-keys");
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (err) {
      console.error("Failed to load API keys:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    setCreating(true);
    try {
      const res = await fetch("/api/v1/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });

      const data = await res.json();
      if (data.apiKey) {
        setNewKey(data.apiKey.key);
        setNewKeyName("");
        await loadKeys();
      }
    } catch (err) {
      console.error("Failed to create API key:", err);
      alert("Failed to create API key");
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this API key? This cannot be undone.")) {
      return;
    }

    try {
      const res = await fetch(`/api/v1/api-keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        await loadKeys();
      }
    } catch (err) {
      console.error("Failed to revoke key:", err);
      alert("Failed to revoke API key");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">API Keys</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">API Keys for MCP</h1>

      <div className="mb-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <h2 className="font-semibold mb-2">🔑 What are API Keys?</h2>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
          API keys let AI assistants (like Claude, Cursor, ChatGPT) and the mobile app access your
          Daylock instance without needing session cookies. Keys don&apos;t expire unless you set
          an expiration date.
        </p>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          📱 <strong>Mobile App:</strong> Use an API key to connect the Daylock mobile app and
          enable home screen widgets on iOS and Android.
        </p>
      </div>

      {newKey && (
        <div className="mb-8 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <h2 className="font-semibold mb-2 text-green-900 dark:text-green-100">
            ✅ API Key Created!
          </h2>
          <p className="text-sm mb-3 text-green-800 dark:text-green-200">
            Save this key now - it will not be shown again!
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-2 bg-white dark:bg-gray-800 rounded border font-mono text-sm break-all">
              {newKey}
            </code>
            <button
              onClick={() => copyToClipboard(newKey)}
              className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm whitespace-nowrap"
            >
              Copy
            </button>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="mt-3 text-sm text-green-700 dark:text-green-300 underline"
          >
            I&apos;ve saved it
          </button>
        </div>
      )}

      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Create New API Key</h2>
        <form onSubmit={createKey} className="flex gap-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g., 'Claude Desktop', 'Cursor', 'Mobile App')"
            className="flex-1 px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-700"
            disabled={creating}
          />
          <button
            type="submit"
            disabled={creating || !newKeyName.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? "Creating..." : "Create Key"}
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Your API Keys</h2>
        {keys.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">No API keys yet. Create one above!</p>
        ) : (
          <div className="space-y-2">
            {keys.map((key) => (
              <div
                key={key.id}
                className="p-4 border rounded dark:border-gray-700 flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="font-medium">{key.name}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                      {key.prefix}...
                    </code>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    Created: {new Date(key.createdAt).toLocaleDateString()}
                    {key.lastUsedAt && (
                      <span className="ml-3">
                        Last used: {new Date(key.lastUsedAt).toLocaleDateString()}
                      </span>
                    )}
                    {key.expiresAt && (
                      <span className="ml-3 text-orange-600 dark:text-orange-400">
                        Expires: {new Date(key.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => revokeKey(key.id)}
                  className="px-3 py-1 text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border dark:border-gray-700">
        <h2 className="font-semibold mb-2">📖 How to Use</h2>
        <div className="text-sm space-y-2 text-gray-700 dark:text-gray-300">
          <p>Configure your AI assistant with these settings:</p>
          <div className="bg-white dark:bg-gray-900 p-3 rounded border font-mono text-xs">
            <div>URL: http://localhost:3000/api/mcp</div>
            <div>Header: Authorization: Bearer mcp_xxxxx</div>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
            Replace <code>mcp_xxxxx</code> with your actual API key. See MCP_SETUP.md for detailed
            instructions.
          </p>
        </div>
      </div>
    </div>
  );
}
