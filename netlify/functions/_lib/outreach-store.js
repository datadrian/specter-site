// outreach-store.js — Netlify Blobs storage for the community-outreach bot.
// Mirrors the proven ticket-store.js pattern: one Blobs store, connectLambda(event)
// per request, in-memory fallback for local `netlify dev` without Blobs configured.
//
// Three record kinds share one store, distinguished by key prefix:
//   community:<id>   — a discovered/vetted/rejected community
//   draft:<id>        — a drafted post for a community
//   postlog:<id>      — an audit record of an executed auto-post

const crypto = require('crypto');

const mem = new Map();
let blobStore = null;
let blobInitError = null;

function isNetlifyRuntime() {
  return process.env.NETLIFY === 'true' || Boolean(process.env.SITE_ID);
}

function configureStore(event) {
  try {
    const { connectLambda, getStore } = require('@netlify/blobs');
    if (event) connectLambda(event);
    blobStore = getStore('specter-outreach');
    blobInitError = null;
  } catch (e) {
    blobStore = null;
    blobInitError = e;
    console.error('[outreach-store] Netlify Blobs unavailable:', e.message);
    if (isNetlifyRuntime()) throw e;
  }
}

function getBlobStore() {
  if (!blobStore && !blobInitError) configureStore();
  return blobStore;
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

async function getRecord(key) {
  const store = getBlobStore();
  if (store) return store.get(key, { type: 'json' });
  return mem.get(key) || null;
}

async function saveRecord(key, record) {
  const store = getBlobStore();
  if (store) {
    await store.setJSON(key, record);
    return record;
  }
  mem.set(key, record);
  return record;
}

async function deleteRecord(key) {
  const store = getBlobStore();
  if (store) return store.delete(key);
  mem.delete(key);
}

async function listByPrefix(prefix) {
  const store = getBlobStore();
  if (store) {
    const { blobs } = await store.list({ prefix });
    const out = [];
    for (const blob of blobs || []) {
      const r = await store.get(blob.key, { type: 'json' });
      if (r) out.push(r);
    }
    return out;
  }
  return Array.from(mem.entries())
    .filter(([k]) => k.startsWith(prefix))
    .map(([, v]) => v);
}

// ---- Communities ----

async function listCommunities() {
  const rows = await listByPrefix('community:');
  return rows.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

async function getCommunity(id) {
  return getRecord(`community:${id}`);
}

async function createCommunity(fields) {
  const now = new Date().toISOString();
  const id = newId('cm');
  const record = {
    id,
    name: fields.name || '',
    url: fields.url || '',
    platformType: fields.platformType || 'other', // reddit | forum | facebook_group | other
    rulesSummary: fields.rulesSummary || '',
    allowsSelfPromotion: fields.allowsSelfPromotion || 'unknown', // yes | conditional | no | unknown
    selfPromoNotes: fields.selfPromoNotes || '',
    status: fields.status || 'discovered', // discovered | needs_review | vetted_allowlisted | rejected
    lastCheckedAt: fields.lastCheckedAt || null,
    discoveredVia: fields.discoveredVia || '',
    memberCount: fields.memberCount || '',
    activityNotes: fields.activityNotes || '',
    autoPostEnabled: Boolean(fields.autoPostEnabled),
    // Recency-of-activity signal (added per Adrian's request: don't allow-list dead
    // communities — a real forum should have visible activity from today/very recent).
    // Never gates status automatically, same "inform Adrian, he decides" pattern as
    // allowsSelfPromotion — just surfaced in the console for his judgment call.
    mostRecentActivityDate: fields.mostRecentActivityDate || null, // YYYY-MM-DD or null if unknown
    hasActivityToday: typeof fields.hasActivityToday === 'boolean' ? fields.hasActivityToday : null,
    activityRecencySummary: fields.activityRecencySummary || '',
    createdAt: now,
    updatedAt: now,
  };
  await saveRecord(`community:${id}`, record);
  return record;
}

async function updateCommunity(id, patch) {
  const rec = await getCommunity(id);
  if (!rec) return null;
  Object.assign(rec, patch, { updatedAt: new Date().toISOString() });
  await saveRecord(`community:${id}`, rec);
  return rec;
}

// ---- Drafts ----

async function listDrafts() {
  const rows = await listByPrefix('draft:');
  return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getDraft(id) {
  return getRecord(`draft:${id}`);
}

async function createDraft(fields) {
  const now = new Date().toISOString();
  const id = newId('dr');
  const record = {
    id,
    communityId: fields.communityId,
    draftText: fields.draftText || '',
    targetContext: fields.targetContext || 'new post',
    status: fields.status || 'pending_review', // pending_review | approved | posted | rejected
    createdAt: now,
    postedAt: null,
    adaptationReasoning: fields.adaptationReasoning || '',
    complianceCheckPassed: Boolean(fields.complianceCheckPassed),
    complianceFlags: fields.complianceFlags || [],
    autoPostFailureCount: 0,
    postUrl: null,
    postedAsUsername: null,
  };
  await saveRecord(`draft:${id}`, record);
  return record;
}

async function updateDraft(id, patch) {
  const rec = await getDraft(id);
  if (!rec) return null;
  Object.assign(rec, patch);
  await saveRecord(`draft:${id}`, rec);
  return rec;
}

// ---- PostLog (audit trail for executed auto-posts) ----

async function listPostLog() {
  const rows = await listByPrefix('postlog:');
  return rows.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
}

async function createPostLog(fields) {
  const id = newId('pl');
  const record = {
    id,
    communityId: fields.communityId,
    draftId: fields.draftId,
    postedAt: new Date().toISOString(),
    method: fields.method || 'manual', // auto | manual
    outcome: fields.outcome || '',
    modFeedback: fields.modFeedback || null,
    postUrl: fields.postUrl || null,
    postedAsUsername: fields.postedAsUsername || null,
  };
  await saveRecord(`postlog:${id}`, record);
  return record;
}

// ---- Settings (singleton) ----
// One global settings record. Currently just the auto-poster kill switch, but
// the shape leaves room to grow. autoPostPaused is checked server-side by
// admin-outreach-ready-to-post.js — this is the actual stop mechanism, not
// just a UI flag, so hitting Stop takes effect immediately regardless of
// what the scheduled agent step does.
const SETTINGS_KEY = 'settings:global';
const DEFAULT_SETTINGS = { autoPostPaused: false };

async function getSettings() {
  const rec = await getRecord(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(rec || {}) };
}

async function updateSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await saveRecord(SETTINGS_KEY, next);
  return next;
}

// ---- Agent log (for the live "what's the agent doing" console widget) ----
// Stored as ONE blob holding a capped array, not one-blob-per-line — this is a
// high-frequency append/read pattern and per-line blobs would proliferate fast.
const AGENT_LOG_KEY = 'agentlog:main';
const AGENT_LOG_MAX = 200;

async function appendAgentLog(level, message) {
  const rec = (await getRecord(AGENT_LOG_KEY)) || { entries: [] };
  const entry = { ts: new Date().toISOString(), level: level || 'info', message: String(message || '') };
  rec.entries = [...(rec.entries || []), entry].slice(-AGENT_LOG_MAX);
  await saveRecord(AGENT_LOG_KEY, rec);
  return entry;
}

async function listAgentLog(limit) {
  const rec = await getRecord(AGENT_LOG_KEY);
  const entries = (rec && rec.entries) || [];
  const n = limit || 50;
  return entries.slice(-n).reverse(); // newest first
}

module.exports = {
  configureStore,
  listCommunities, getCommunity, createCommunity, updateCommunity,
  listDrafts, getDraft, createDraft, updateDraft,
  listPostLog, createPostLog,
  getSettings, updateSettings,
  appendAgentLog, listAgentLog,
  deleteRecord,
};
