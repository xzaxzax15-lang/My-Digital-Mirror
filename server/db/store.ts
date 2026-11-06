import { DatabaseSync } from "./sqlite.js";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { hashPassword } from "../security.js";

/**
 * طبقة التخزين — SQLite المدمج في Node (node:sqlite).
 * تُستخدم للإدارة فقط: حساب المدير، سجل التدقيق، حالات النشر، والموارد المضافة.
 * محتوى المعرفة الأساسي (الأدلة والدروس) يعيش في الكود الموثق ويُدمج مع حالات النشر هنا.
 */

export type EntityType = "lesson" | "video" | "resource" | "playbook";
export type ContentStatus = "published" | "hidden" | "pending";

export interface AdminRow {
  id: number;
  username: string;
  password_hash: string;
  role: "admin" | "editor";
  created_at: string;
}

export interface AuditRow {
  id: number;
  admin_username: string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
}

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_username TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS content_status (
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    status TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    changed_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (entity_type, entity_id)
  )`,
  `CREATE TABLE IF NOT EXISTS resource_verifications (
    resource_id TEXT PRIMARY KEY,
    verified_at TEXT NOT NULL,
    verified_by TEXT NOT NULL,
    http_status INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS custom_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    url TEXT NOT NULL,
    kind TEXT NOT NULL,
    country_code TEXT,
    country_name TEXT,
    incident_types TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    verified_at TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS custom_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    source TEXT NOT NULL,
    topic TEXT NOT NULL DEFAULT '',
    difficulty TEXT NOT NULL DEFAULT 'beginner',
    status TEXT NOT NULL DEFAULT 'pending',
    verified_at TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_number TEXT UNIQUE NOT NULL,
    followup_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'NEW',
    incident_type TEXT NOT NULL,
    ongoing INTEGER NOT NULL DEFAULT 0,
    minor_involved INTEGER NOT NULL DEFAULT 0,
    physical_risk INTEGER NOT NULL DEFAULT 0,
    publication_threat INTEGER NOT NULL DEFAULT 0,
    country_code TEXT,
    contact_preference TEXT NOT NULL DEFAULT 'none',
    consent_json TEXT NOT NULL DEFAULT '{}',
    summary TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS case_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_number TEXT NOT NULL,
    event_type TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS evidence_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_number TEXT NOT NULL,
    kind TEXT NOT NULL,
    platform TEXT,
    occurred_at TEXT,
    timezone TEXT,
    description TEXT NOT NULL,
    sha256 TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS evidence_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evidence_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_case_events_number ON case_events(case_number)`,
  `CREATE INDEX IF NOT EXISTS idx_evidence_number ON evidence_entries(case_number)`,
];

export class Store {
  private db: InstanceType<typeof DatabaseSync>;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, "digital-mirror.sqlite"));
    this.db.exec("PRAGMA journal_mode = WAL;");
    for (const sql of MIGRATIONS) {
      this.db.exec(sql);
    }
  }

  ensureAdmin(username: string, password: string, role: "admin" | "editor" = "admin"): void {
    const existing = this.db.prepare("SELECT id FROM admins WHERE username = ?").get(username);
    if (!existing) {
      this.db.prepare("INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)").run(
        username,
        hashPassword(password),
        role
      );
    }
  }

  getAdmin(username: string): AdminRow | undefined {
    return this.db
      .prepare("SELECT id, username, password_hash, role, created_at FROM admins WHERE username = ?")
      .get(username) as AdminRow | undefined;
  }

  audit(adminUsername: string, action: string, entityType: string, entityId: string): void {
    this.db
      .prepare("INSERT INTO audit_log (admin_username, action, entity_type, entity_id) VALUES (?, ?, ?, ?)")
      .run(adminUsername, action, entityType, entityId);
  }

  listAudit(limit = 100): AuditRow[] {
    return this.db
      .prepare("SELECT id, admin_username, action, entity_type, entity_id, created_at FROM audit_log ORDER BY id DESC LIMIT ?")
      .all(limit) as unknown as AuditRow[];
  }

  setStatus(entityType: EntityType, entityId: string, status: ContentStatus, by: string): void {
    this.db
      .prepare(
        `INSERT INTO content_status (entity_type, entity_id, status, changed_by) VALUES (?, ?, ?, ?)
         ON CONFLICT(entity_type, entity_id) DO UPDATE SET status = excluded.status, changed_by = excluded.changed_by, changed_at = datetime('now')`
      )
      .run(entityType, entityId, status, by);
  }

  statusMap(): Map<string, ContentStatus> {
    const rows = this.db.prepare("SELECT entity_type, entity_id, status FROM content_status").all() as {
      entity_type: string;
      entity_id: string;
      status: ContentStatus;
    }[];
    const map = new Map<string, ContentStatus>();
    for (const r of rows) map.set(`${r.entity_type}:${r.entity_id}`, r.status);
    return map;
  }

  setResourceVerification(resourceId: string, by: string, httpStatus: number): string {
    const verifiedAt = new Date().toISOString().slice(0, 10);
    this.db
      .prepare(
        `INSERT INTO resource_verifications (resource_id, verified_at, verified_by, http_status) VALUES (?, ?, ?, ?)
         ON CONFLICT(resource_id) DO UPDATE SET verified_at = excluded.verified_at, verified_by = excluded.verified_by, http_status = excluded.http_status`
      )
      .run(resourceId, verifiedAt, by, httpStatus);
    return verifiedAt;
  }

  resourceVerifications(): Map<string, { verifiedAt: string; httpStatus: number | null }> {
    const rows = this.db.prepare("SELECT resource_id, verified_at, http_status FROM resource_verifications").all() as unknown as {
      resource_id: string;
      verified_at: string;
      http_status: number | null;
    }[];
    const map = new Map<string, { verifiedAt: string; httpStatus: number | null }>();
    for (const r of rows) map.set(r.resource_id, { verifiedAt: r.verified_at, httpStatus: r.http_status });
    return map;
  }

  addCustomResource(input: {
    title: string;
    description: string;
    url: string;
    kind: string;
    countryCode?: string;
    countryName?: string;
    incidentTypes: string[];
    status: ContentStatus;
    createdBy: string;
  }): number {
    const r = this.db
      .prepare(
        `INSERT INTO custom_resources (title, description, url, kind, country_code, country_name, incident_types, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.title,
        input.description,
        input.url,
        input.kind,
        input.countryCode ?? null,
        input.countryName ?? null,
        JSON.stringify(input.incidentTypes),
        input.status,
        input.createdBy
      );
    return Number(r.lastInsertRowid);
  }

  customResources(): unknown[] {
    return this.db.prepare("SELECT * FROM custom_resources ORDER BY id DESC").all();
  }

  updateCustomResourceStatus(id: number, status: ContentStatus): void {
    this.db.prepare("UPDATE custom_resources SET status = ? WHERE id = ?").run(status, id);
  }

  customResourceUrl(id: number): string | undefined {
    const row = this.db.prepare("SELECT url FROM custom_resources WHERE id = ?").get(id) as
      | { url: string }
      | undefined;
    return row?.url;
  }

  addCustomVideo(input: {
    title: string;
    url: string;
    source: string;
    topic: string;
    difficulty: string;
    status: ContentStatus;
    createdBy: string;
  }): number {
    const r = this.db
      .prepare(
        `INSERT INTO custom_videos (title, url, source, topic, difficulty, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(input.title, input.url, input.source, input.topic, input.difficulty, input.status, input.createdBy);
    return Number(r.lastInsertRowid);
  }

  customVideos(): unknown[] {
    return this.db.prepare("SELECT * FROM custom_videos ORDER BY id DESC").all();
  }

  updateCustomVideoStatus(id: number, status: ContentStatus): void {
    this.db.prepare("UPDATE custom_videos SET status = ? WHERE id = ?").run(status, id);
  }

  // ============ قضايا حماية الضحايا ============

  createCase(input: {
    caseNumber: string;
    followupHash: string;
    incidentType: string;
    ongoing: boolean;
    minorInvolved: boolean;
    physicalRisk: boolean;
    publicationThreat: boolean;
    countryCode?: string;
    consentJson: string;
    summary?: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO cases (case_number, followup_hash, status, incident_type, ongoing, minor_involved, physical_risk, publication_threat, country_code, consent_json, summary)
         VALUES (?, ?, 'NEW', ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.caseNumber,
        input.followupHash,
        input.incidentType,
        input.ongoing ? 1 : 0,
        input.minorInvolved ? 1 : 0,
        input.physicalRisk ? 1 : 0,
        input.publicationThreat ? 1 : 0,
        input.countryCode ?? null,
        input.consentJson,
        input.summary ?? null
      );
    this.addCaseEvent(input.caseNumber, "created", "أنشئت القضية عبر الإبلاغ الآمن");
  }

  getCaseByNumber(caseNumber: string): {
    case_number: string;
    followup_hash: string;
    status: string;
    incident_type: string;
    ongoing: number;
    minor_involved: number;
    physical_risk: number;
    publication_threat: number;
    country_code: string | null;
    consent_json: string;
    summary: string | null;
    created_at: string;
    updated_at: string;
  } | undefined {
    return this.db
      .prepare("SELECT * FROM cases WHERE case_number = ?")
      .get(caseNumber) as never;
  }

  addCaseEvent(caseNumber: string, eventType: string, note?: string): void {
    this.db
      .prepare("INSERT INTO case_events (case_number, event_type, note) VALUES (?, ?, ?)")
      .run(caseNumber, eventType, note ?? null);
    this.db.prepare("UPDATE cases SET updated_at = datetime('now') WHERE case_number = ?").run(caseNumber);
  }

  listCaseEvents(caseNumber: string): { event_type: string; note: string | null; created_at: string }[] {
    return this.db
      .prepare("SELECT event_type, note, created_at FROM case_events WHERE case_number = ? ORDER BY id ASC")
      .all(caseNumber) as never;
  }

  updateCaseStatus(caseNumber: string, status: string): void {
    this.db.prepare("UPDATE cases SET status = ?, updated_at = datetime('now') WHERE case_number = ?").run(status, caseNumber);
  }

  addEvidence(caseNumber: string, entry: {
    kind: string;
    platform?: string;
    occurredAt?: string;
    timezone?: string;
    description: string;
    sha256?: string;
  }): number {
    const r = this.db
      .prepare(
        `INSERT INTO evidence_entries (case_number, kind, platform, occurred_at, timezone, description, sha256)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(caseNumber, entry.kind, entry.platform ?? null, entry.occurredAt ?? null, entry.timezone ?? null, entry.description, entry.sha256 ?? null);
    const id = Number(r.lastInsertRowid);
    this.db
      .prepare("INSERT INTO evidence_log (evidence_id, action, actor) VALUES (?, 'create', 'victim')")
      .run(id);
    this.addCaseEvent(caseNumber, "evidence_added", `أُضيف دليل من نوع ${entry.kind}`);
    return id;
  }

  listEvidence(caseNumber: string): {
    id: number;
    kind: string;
    platform: string | null;
    occurred_at: string | null;
    timezone: string | null;
    description: string;
    sha256: string | null;
    created_at: string;
  }[] {
    return this.db
      .prepare("SELECT id, kind, platform, occurred_at, timezone, description, sha256, created_at FROM evidence_entries WHERE case_number = ? ORDER BY id ASC")
      .all(caseNumber) as never;
  }

  logEvidenceAccess(evidenceIds: number[], actor: string): void {
    const stmt = this.db.prepare("INSERT INTO evidence_log (evidence_id, action, actor) VALUES (?, 'view', ?)");
    for (const id of evidenceIds) stmt.run(id, actor);
  }

  listEvidenceLog(caseNumber: string): { action: string; actor: string; created_at: string }[] {
    return this.db
      .prepare(
        `SELECT l.action, l.actor, l.created_at FROM evidence_log l
         JOIN evidence_entries e ON e.id = l.evidence_id
         WHERE e.case_number = ? ORDER BY l.id ASC`
      )
      .all(caseNumber) as never;
  }

  deleteCase(caseNumber: string): void {
    this.db.prepare("DELETE FROM evidence_log WHERE evidence_id IN (SELECT id FROM evidence_entries WHERE case_number = ?)").run(caseNumber);
    this.db.prepare("DELETE FROM evidence_entries WHERE case_number = ?").run(caseNumber);
    this.db.prepare("DELETE FROM case_events WHERE case_number = ?").run(caseNumber);
    this.db.prepare("DELETE FROM cases WHERE case_number = ?").run(caseNumber);
  }

  caseStats(): {
    total: number;
    byStatus: Record<string, number>;
    critical: number;
    byCountry: Record<string, number>;
    evidenceCount: number;
  } {
    const total = (this.db.prepare("SELECT COUNT(*) AS c FROM cases").get() as { c: number }).c;
    const byStatus: Record<string, number> = {};
    for (const r of this.db.prepare("SELECT status, COUNT(*) AS c FROM cases GROUP BY status").all() as unknown as { status: string; c: number }[]) {
      byStatus[r.status] = r.c;
    }
    const critical = (this.db.prepare("SELECT COUNT(*) AS c FROM cases WHERE physical_risk = 1 OR minor_involved = 1").get() as { c: number }).c;
    const byCountry: Record<string, number> = {};
    for (const r of this.db.prepare("SELECT country_code AS cc, COUNT(*) AS c FROM cases WHERE country_code IS NOT NULL GROUP BY country_code").all() as unknown as { cc: string; c: number }[]) {
      byCountry[r.cc] = r.c;
    }
    const evidenceCount = (this.db.prepare("SELECT COUNT(*) AS c FROM evidence_entries").get() as { c: number }).c;
    return { total, byStatus, critical, byCountry, evidenceCount };
  }

  close(): void {
    this.db.close();
  }
}
