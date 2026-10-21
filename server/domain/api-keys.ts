import { prisma } from "../db/client";
import crypto from "crypto";

const API_KEY_PREFIX = "mcp_";

/**
 * Generate a secure random API key with format: mcp_xxxxxxxxxxxxxxxxxxxxx
 */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  // Generate 32 random bytes (256 bits)
  const randomBytes = crypto.randomBytes(32);
  const key = API_KEY_PREFIX + randomBytes.toString("base64url");

  // Hash the key for storage (we never store the plaintext key)
  const hash = hashApiKey(key);

  // Extract prefix for display (first 10 chars)
  const prefix = key.substring(0, 10);

  return { key, hash, prefix };
}

/**
 * Hash an API key using SHA-256
 */
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Create a new API key for a user
 */
export async function createApiKey(userId: string, name: string, expiresInDays?: number) {
  const { key, hash, prefix } = generateApiKey();

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      name,
      keyHash: hash,
      prefix,
      expiresAt,
    },
  });

  // Return the plaintext key only once (never stored)
  return {
    id: apiKey.id,
    key, // This is the only time the full key is returned
    prefix: apiKey.prefix,
    name: apiKey.name,
    createdAt: apiKey.createdAt,
    expiresAt: apiKey.expiresAt,
  };
}

/**
 * Validate an API key and return the associated user ID
 * Returns null if the key is invalid, expired, or doesn't exist
 */
export async function validateApiKey(key: string): Promise<string | null> {
  if (!key.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const hash = hashApiKey(key);

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    select: {
      userId: true,
      expiresAt: true,
    },
  });

  if (!apiKey) {
    return null;
  }

  // Check if key has expired
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return null;
  }

  // Update last used timestamp (fire and forget)
  prisma.apiKey
    .update({
      where: { keyHash: hash },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {
      // Ignore errors updating lastUsedAt
    });

  return apiKey.userId;
}

/**
 * List all API keys for a user (without the actual key values)
 */
export async function listApiKeys(userId: string) {
  const keys = await prisma.apiKey.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      prefix: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return keys;
}

/**
 * Revoke (delete) an API key
 */
export async function revokeApiKey(userId: string, keyId: string) {
  const deleted = await prisma.apiKey.deleteMany({
    where: {
      id: keyId,
      userId, // Ensure user owns this key
    },
  });

  return deleted.count > 0;
}

/**
 * Revoke all API keys for a user
 */
export async function revokeAllApiKeys(userId: string) {
  const deleted = await prisma.apiKey.deleteMany({
    where: { userId },
  });

  return deleted.count;
}
