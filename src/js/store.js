/**
 * store.js — profile data layer.
 *
 * Backed by storage.js, scoped to the user returned by auth.currentUser().
 * Profiles are stored in a single map keyed by userId so that
 * getProfileBySlug() can scan across every user's profile.
 *
 * Profile shape:
 *   { id, userId, slug, displayName, headline, bio, avatarColor,
 *     blocks[], published:boolean, publishedAt:string|null,
 *     createdAt, updatedAt }
 *
 * Block shape:
 *   { id, type:'text'|'link', label:string, value:string }
 *   - text → `value` is the body copy, `label` is a heading.
 *   - link → `value` is the URL,      `label` is the link text.
 */

import storage from './storage.js';
import { currentUser } from './auth.js';
import { smartProfileDefaults, uniqueSlug, generateSlug } from './defaults.js';

// Single storage key holding { [userId]: profile }.
const PROFILES_KEY = 'store:profiles';

/** Load the userId -> profile map. */
function loadProfiles() {
  return storage.get(PROFILES_KEY) || {};
}

/** Persist the userId -> profile map. */
function saveProfiles(profiles) {
  storage.set(PROFILES_KEY, profiles);
}

/** Generate a unique-enough id with a caller-supplied prefix. */
function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** ISO timestamp helper — single source of "now". */
function now() {
  return new Date().toISOString();
}

/**
 * Require an authenticated user, returning it.
 * @throws {Error} when nobody is signed in.
 */
function requireUser() {
  const user = currentUser();
  if (!user) {
    throw new Error('You must be signed in to access a profile.');
  }
  return user;
}

/** Normalize a caller-supplied block into the canonical block shape. */
function normalizeBlock(block = {}) {
  const type = block.type === 'link' ? 'link' : 'text';
  return {
    id: block.id || makeId('blk'),
    type,
    label: typeof block.label === 'string' ? block.label : '',
    value: typeof block.value === 'string' ? block.value : '',
  };
}

/** Collect every slug already in use (for uniqueness checks). */
function allSlugs(profiles) {
  return Object.values(profiles)
    .map((p) => p.slug)
    .filter(Boolean);
}

/**
 * Get the current user's profile, or null if none exists yet.
 * @returns {object|null}
 */
export function getProfile() {
  const user = currentUser();
  if (!user) return null;
  return loadProfiles()[user.id] || null;
}

/**
 * Get the current user's profile, creating one from smart defaults if missing.
 * Always returns a non-empty profile (starter blocks included).
 * @returns {object}
 * @throws {Error} if not authenticated.
 */
export function ensureProfile() {
  const user = requireUser();
  const profiles = loadProfiles();

  const existing = profiles[user.id];
  if (existing) return existing;

  const defaults = smartProfileDefaults(user);
  const timestamp = now();

  // Slug is derived from the display name and made unique across all profiles.
  const slug = uniqueSlug(defaults.displayName, allSlugs(profiles));

  const profile = {
    id: makeId('prof'),
    userId: user.id,
    slug,
    displayName: defaults.displayName,
    headline: defaults.headline,
    bio: defaults.bio,
    avatarColor: defaults.avatarColor,
    blocks: defaults.blocks.map(normalizeBlock), // ensure every block has an id
    published: false,
    publishedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  profiles[user.id] = profile;
  saveProfiles(profiles);
  return profile;
}

/**
 * Apply a shallow patch to the current user's profile.
 * Refreshes updatedAt. Protected fields (id, userId, createdAt) are ignored.
 * @param {object} patch
 * @returns {object} the updated profile.
 * @throws {Error} if not authenticated.
 */
export function updateProfile(patch = {}) {
  const profile = ensureProfile(); // guarantees existence + auth check
  const profiles = loadProfiles();

  // Never let callers overwrite identity/ownership fields.
  const { id, userId, createdAt, ...safePatch } = patch;

  const updated = {
    ...profile,
    ...safePatch,
    id: profile.id,
    userId: profile.userId,
    createdAt: profile.createdAt,
    updatedAt: now(),
  };

  profiles[updated.userId] = updated;
  saveProfiles(profiles);
  return updated;
}

/**
 * Append a content block to the current user's profile.
 * @param {object} block partial block; id/type defaulted as needed.
 * @returns {object} the updated profile.
 */
export function addBlock(block = {}) {
  const profile = ensureProfile();
  const newBlock = normalizeBlock(block);
  return updateProfile({ blocks: [...profile.blocks, newBlock] });
}

/**
 * Patch a single block by id.
 * @param {string} id   block id
 * @param {object} patch fields to merge (type/id are protected).
 * @returns {object} the updated profile.
 * @throws {Error} if the block id is not found.
 */
export function updateBlock(id, patch = {}) {
  const profile = ensureProfile();

  const index = profile.blocks.findIndex((b) => b.id === id);
  if (index === -1) {
    throw new Error(`Block not found: ${id}`);
  }

  const current = profile.blocks[index];
  // Protect id; allow type changes only to a valid value.
  const { id: _ignoredId, ...safePatch } = patch;
  const merged = normalizeBlock({ ...current, ...safePatch, id: current.id });

  const blocks = profile.blocks.slice();
  blocks[index] = merged;
  return updateProfile({ blocks });
}

/**
 * Remove a block by id. No-op (returns profile unchanged) if id is absent.
 * @param {string} id
 * @returns {object} the updated profile.
 */
export function removeBlock(id) {
  const profile = ensureProfile();
  const blocks = profile.blocks.filter((b) => b.id !== id);
  return updateProfile({ blocks });
}

/**
 * Move a block up (-1) or down (+1) within the ordered list.
 * Clamps silently at the ends — moving the first block up is a no-op.
 * @param {string} id
 * @param {number} direction -1 to move up, +1 to move down.
 * @returns {object} the updated profile.
 * @throws {Error} if the block id is not found.
 */
export function moveBlock(id, direction) {
  const profile = ensureProfile();

  const index = profile.blocks.findIndex((b) => b.id === id);
  if (index === -1) {
    throw new Error(`Block not found: ${id}`);
  }

  // Normalize direction to exactly -1 or +1.
  const step = direction < 0 ? -1 : 1;
  const target = index + step;

  // Clamp at the ends: nothing to do if the target is out of range.
  if (target < 0 || target >= profile.blocks.length) {
    return profile;
  }

  const blocks = profile.blocks.slice();
  // Swap the two adjacent blocks.
  [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  return updateProfile({ blocks });
}

/**
 * Publish the current user's profile.
 * Sets published=true, stamps publishedAt, and guarantees a unique slug.
 * @returns {object} the published profile.
 * @throws {Error} if not authenticated, or if the profile has zero blocks.
 */
export function publishProfile() {
  const profile = ensureProfile();

  // "First value" requires at least one content block — refuse empty profiles.
  if (!Array.isArray(profile.blocks) || profile.blocks.length < 1) {
    throw new Error('Add at least one block before publishing your profile.');
  }

  const profiles = loadProfiles();

  // Ensure the slug is set and unique across every OTHER profile.
  const otherSlugs = Object.values(profiles)
    .filter((p) => p.userId !== profile.userId)
    .map((p) => p.slug)
    .filter(Boolean);

  let slug = profile.slug || generateSlug(profile.displayName);
  if (otherSlugs.includes(slug)) {
    slug = uniqueSlug(slug, otherSlugs);
  }

  return updateProfile({
    slug,
    published: true,
    publishedAt: now(),
  });
}

/**
 * Find any user's profile by slug.
 * @param {string} slug
 * @returns {object|null}
 */
export function getProfileBySlug(slug) {
  if (!slug) return null;
  const profiles = loadProfiles();
  for (const profile of Object.values(profiles)) {
    if (profile.slug === slug) return profile;
  }
  return null;
}
