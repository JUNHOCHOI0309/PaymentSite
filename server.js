require("dotenv").config();

const crypto = require("crypto");
const nodemailer = require("nodemailer");
const path = require("path");
const { promisify } = require("util");
const express = require("express");
const multer = require("multer");
const { Pool } = require("pg");
const {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");
const app = express();
const port = Number(process.env.PORT || 4000);
const corsAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const adminAllowedOrigins = (process.env.ADMIN_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const adminSessionCookieName = normalizeText(process.env.ADMIN_COOKIE_NAME) || "mmk_admin_session";
const adminSessionTtlHours = Math.max(
  1,
  Number(process.env.ADMIN_SESSION_TTL_HOURS || 12)
);
const adminBootstrapEmail = normalizeEmail(process.env.ADMIN_BOOTSTRAP_EMAIL);
const adminBootstrapPassword = normalizeText(process.env.ADMIN_BOOTSTRAP_PASSWORD);
const adminBootstrapDisplayName = normalizeText(process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME) || "MMK Admin";
const adminCookieSecure = process.env.NODE_ENV === "production";
const scryptAsync = promisify(crypto.scrypt);
const adminLoginRateWindowMs = Math.max(
  60 * 1000,
  Number(process.env.ADMIN_LOGIN_RATE_WINDOW_MS || 10 * 60 * 1000)
);
const adminLoginRateLimit = Math.max(
  1,
  Number(process.env.ADMIN_LOGIN_RATE_LIMIT || 20)
);
const adminLoginFailureThreshold = Math.max(
  1,
  Number(process.env.ADMIN_LOGIN_FAILURE_THRESHOLD || 5)
);
const adminLoginLockDurationMs = Math.max(
  60 * 1000,
  Number(process.env.ADMIN_LOGIN_LOCK_DURATION_MS || 15 * 60 * 1000)
);
const adminLoginRateStore = new Map();
const adminLoginFailureStore = new Map();

const maxUploadBytes = 10 * 1024 * 1024;
const allowedUploadMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "image/jpeg",
  "image/png",
]);
const allowedUploadExtensions = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".jpg",
  ".jpeg",
  ".png",
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxUploadBytes,
  },
});
const r2AccountId = process.env.R2_ACCOUNT_ID;
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const r2BucketName = process.env.R2_BUCKET_NAME;
const r2HomeImagePrefix = normalizeR2Prefix(process.env.R2_HOME_IMAGE_PREFIX || "home/");
const r2ReadableImagePrefixes = [r2HomeImagePrefix, "register/", "favicon/", "introduce/"].filter(Boolean);
const r2Endpoint =
  process.env.R2_ENDPOINT ||
  (r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : null);
const r2Client =
  r2Endpoint && r2AccessKeyId && r2SecretAccessKey
    ? new S3Client({
        region: "auto",
        endpoint: r2Endpoint,
        credentials: {
          accessKeyId: r2AccessKeyId,
          secretAccessKey: r2SecretAccessKey,
        },
      })
    : null;
const lookupVerificationCodeTtlMinutes = Math.max(
  1,
  Number(process.env.LOOKUP_VERIFICATION_CODE_TTL_MINUTES || 5)
);
const lookupVerificationSendCooldownSeconds = Math.max(
  0,
  Number(process.env.LOOKUP_VERIFICATION_SEND_COOLDOWN_SECONDS || 60)
);
const lookupVerificationSessionTtlMinutes = Math.max(
  1,
  Number(process.env.LOOKUP_VERIFICATION_SESSION_TTL_MINUTES || 30)
);
const lookupVerificationMaxAttempts = Math.max(
  1,
  Number(process.env.LOOKUP_VERIFICATION_MAX_ATTEMPTS || 5)
);
const smtpHost = normalizeText(process.env.SMTP_HOST);
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = normalizeText(process.env.SMTP_USER);
const smtpPass = normalizeText(process.env.SMTP_PASS);
const smtpSecure =
  process.env.SMTP_SECURE === "true" || (!Number.isNaN(smtpPort) && smtpPort === 465);
const lookupFromEmail =
  normalizeText(process.env.LOOKUP_FROM_EMAIL) ||
  normalizeText(process.env.FROM_EMAIL) ||
  smtpUser;
const emailBrandName = normalizeText(process.env.EMAIL_BRAND_NAME) || "신청 조회";
const allowEmailConsoleFallback =
  process.env.NODE_ENV !== "production" ||
  process.env.ALLOW_EMAIL_CONSOLE_FALLBACK === "true";

app.set("trust proxy", true);

app.use(function (_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(function (req, res, next) {
  const origin = req.headers.origin;
  const hasConfiguredOrigins = corsAllowedOrigins.length > 0;
  const allowAnyOrigin = !hasConfiguredOrigins;
  const isAllowedOrigin = origin && corsAllowedOrigins.includes(origin);

  if (origin && (allowAnyOrigin || isAllowedOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
});

app.use(express.static("public"));
app.use(express.json());

//DB Pool 생성
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL in .env");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: false, //Cloud DB for PostgreSQL ssl 설정에 따라 변경
});

//주문 식별 생성 헬퍼
function generateOrderId(){
  return `order_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
}

// Amount이 양수일 때만 생성
function normalizeAmount(value){
  const parsed = Number(value);

  if(!Number.isInteger(parsed) || parsed <= 0){
    return null;
  }

  return parsed;
}

// draft를 frontend에 노출
function generateDraftId() {
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateApplicationNumber() {
  return `APPL-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

// Draft API 정규화
function normalizeText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeEmail(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeBoolean(value) {
  return value === true;
}

function formatPhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function parseCookies(headerValue) {
  return String(headerValue || "")
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((accumulator, pair) => {
      const separatorIndex = pair.indexOf("=");

      if (separatorIndex <= 0) {
        return accumulator;
      }

      const key = pair.slice(0, separatorIndex).trim();
      const value = decodeURIComponent(pair.slice(separatorIndex + 1).trim());
      accumulator[key] = value;
      return accumulator;
    }, {});
}

function serializeCookie(name, value, options = {}) {
  const segments = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge != null) {
    segments.push(`Max-Age=${options.maxAge}`);
  }

  segments.push(`Path=${options.path || "/"}`);

  if (options.httpOnly !== false) {
    segments.push("HttpOnly");
  }

  if (options.sameSite) {
    segments.push(`SameSite=${options.sameSite}`);
  }

  if (options.secure) {
    segments.push("Secure");
  }

  return segments.join("; ");
}

function clearCookie(name) {
  return serializeCookie(name, "", {
    maxAge: 0,
    path: "/",
    sameSite: "Lax",
    secure: adminCookieSecure,
  });
}

function createAdminSessionCookie(token) {
  return serializeCookie(adminSessionCookieName, token, {
    maxAge: adminSessionTtlHours * 60 * 60,
    path: "/",
    sameSite: "Lax",
    secure: adminCookieSecure,
  });
}

function generateAdminSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashAdminSessionToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function hashAdminPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(String(password), salt, 64);
  return `scrypt:${salt}:${Buffer.from(derivedKey).toString("hex")}`;
}

async function verifyAdminPassword(password, passwordHash) {
  const parts = String(passwordHash || "").split(":");

  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const [, salt, expectedHash] = parts;
  const derivedKey = await scryptAsync(String(password), salt, 64);
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const actualBuffer = Buffer.from(derivedKey);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function getRequestIp(req) {
  const forwardedFor = normalizeText(req.headers["x-forwarded-for"]);

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return (
    normalizeText(req.ip) ||
    normalizeText(req.socket?.remoteAddress) ||
    null
  );
}

function getRequestUserAgent(req) {
  return normalizeText(req.headers["user-agent"]);
}

function hasTrustedAdminOrigin(req) {
  const origin = normalizeText(req.headers.origin);

  if (!origin || adminAllowedOrigins.length === 0) {
    return true;
  }

  return adminAllowedOrigins.includes(origin);
}

function normalizeAdminUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function writeAdminAuditLog({
  adminUserId = null,
  action,
  targetType = null,
  targetId = null,
  ipAddress = null,
  userAgent = null,
  metadata = null,
}) {
  try {
    await pool.query(
      `
        INSERT INTO admin_audit_logs (
          admin_user_id,
          action,
          target_type,
          target_id,
          ip_address,
          user_agent,
          metadata_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [
        adminUserId,
        action,
        targetType,
        targetId,
        ipAddress,
        userAgent,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (error) {
    console.error("Failed to write admin audit log:", error);
  }
}

function cleanupAdminLoginProtectionStore() {
  const now = Date.now();

  for (const [key, entry] of adminLoginRateStore.entries()) {
    if (!entry || now - entry.windowStartedAt >= adminLoginRateWindowMs) {
      adminLoginRateStore.delete(key);
    }
  }

  for (const [key, entry] of adminLoginFailureStore.entries()) {
    if (!entry) {
      adminLoginFailureStore.delete(key);
      continue;
    }

    if (entry.lockedUntil && entry.lockedUntil <= now) {
      adminLoginFailureStore.delete(key);
      continue;
    }

    if (!entry.lockedUntil && entry.lastFailedAt && now - entry.lastFailedAt >= adminLoginLockDurationMs) {
      adminLoginFailureStore.delete(key);
    }
  }
}

function consumeAdminLoginRateLimit(ipAddress) {
  const key = ipAddress || "unknown";
  const now = Date.now();
  const existing = adminLoginRateStore.get(key);

  if (!existing || now - existing.windowStartedAt >= adminLoginRateWindowMs) {
    adminLoginRateStore.set(key, {
      count: 1,
      windowStartedAt: now,
    });

    return {
      ok: true,
    };
  }

  if (existing.count >= adminLoginRateLimit) {
    return {
      ok: false,
      retryAfterMs: Math.max(1, adminLoginRateWindowMs - (now - existing.windowStartedAt)),
    };
  }

  existing.count += 1;

  return {
    ok: true,
  };
}

function getAdminLoginFailureKey(email, ipAddress) {
  return `${email || "unknown"}::${ipAddress || "unknown"}`;
}

function getAdminLoginLockStatus(key) {
  const entry = adminLoginFailureStore.get(key);

  if (!entry || !entry.lockedUntil) {
    return {
      locked: false,
    };
  }

  const remainingMs = entry.lockedUntil - Date.now();

  if (remainingMs <= 0) {
    adminLoginFailureStore.delete(key);
    return {
      locked: false,
    };
  }

  return {
    locked: true,
    remainingMs,
  };
}

function recordAdminLoginFailure(key) {
  const now = Date.now();
  const entry = adminLoginFailureStore.get(key) || {
    count: 0,
    lockedUntil: null,
    lastFailedAt: null,
  };

  entry.count += 1;
  entry.lastFailedAt = now;

  if (entry.count >= adminLoginFailureThreshold) {
    entry.lockedUntil = now + adminLoginLockDurationMs;
  }

  adminLoginFailureStore.set(key, entry);

  return {
    count: entry.count,
    lockedUntil: entry.lockedUntil,
  };
}

function clearAdminLoginFailures(key) {
  adminLoginFailureStore.delete(key);
}

async function cleanupExpiredAdminSessions() {
  await pool.query(
    `
      DELETE FROM admin_sessions
      WHERE expires_at <= NOW()
    `
  );
}

async function ensureAdminBootstrapReady() {
  if (!adminBootstrapEmail || !adminBootstrapPassword) {
    return;
  }

  try {
    const existingAdminResult = await pool.query(
      `
        SELECT id
        FROM admin_users
        WHERE email = $1
        LIMIT 1
      `,
      [adminBootstrapEmail]
    );

    if (existingAdminResult.rowCount > 0) {
      return;
    }

    const passwordHash = await hashAdminPassword(adminBootstrapPassword);

    await pool.query(
      `
        INSERT INTO admin_users (
          email,
          password_hash,
          display_name,
          role,
          is_active
        )
        VALUES ($1, $2, $3, 'superadmin', TRUE)
      `,
      [adminBootstrapEmail, passwordHash, adminBootstrapDisplayName]
    );

    console.log(`Bootstrapped admin user: ${adminBootstrapEmail}`);
  } catch (error) {
    if (error && error.code === "42P01") {
      console.warn("Admin tables are not ready yet. Apply admin SQL migration first.");
      return;
    }

    throw error;
  }
}

async function resolveAdminSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const rawToken = normalizeText(cookies[adminSessionCookieName]);

  if (!rawToken) {
    return {
      status: "missing",
    };
  }

  const sessionTokenHash = hashAdminSessionToken(rawToken);
  const sessionResult = await pool.query(
    `
      SELECT
        sessions.id AS session_id,
        sessions.admin_user_id,
        sessions.expires_at,
        users.id,
        users.email,
        users.display_name,
        users.role,
        users.is_active,
        users.last_login_at,
        users.created_at,
        users.updated_at
      FROM admin_sessions AS sessions
      INNER JOIN admin_users AS users
        ON users.id = sessions.admin_user_id
      WHERE sessions.session_token_hash = $1
      LIMIT 1
    `,
    [sessionTokenHash]
  );

  if (sessionResult.rowCount === 0) {
    return {
      status: "missing",
    };
  }

  const row = sessionResult.rows[0];
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;

  if (!row.is_active) {
    await pool.query(
      `
        DELETE FROM admin_sessions
        WHERE id = $1
      `,
      [row.session_id]
    );

    return {
      status: "inactive",
    };
  }

  if (!expiresAt || expiresAt.getTime() <= Date.now()) {
    await pool.query(
      `
        DELETE FROM admin_sessions
        WHERE id = $1
      `,
      [row.session_id]
    );

    return {
      status: "expired",
      expiresAt,
    };
  }

  await pool.query(
    `
      UPDATE admin_sessions
      SET last_seen_at = NOW()
      WHERE id = $1
    `,
    [row.session_id]
  );

  return {
    status: "active",
    sessionId: row.session_id,
    adminUserId: row.admin_user_id,
    adminUser: normalizeAdminUser(row),
    expiresAt,
  };
}

async function requireAdminAuth(req, res, next) {
  try {
    const session = await resolveAdminSession(req);

    if (session.status !== "active") {
      if (session.status === "expired") {
        await writeAdminAuditLog({
          action: "ADMIN_SESSION_EXPIRED",
          targetType: "admin_session",
          ipAddress: getRequestIp(req),
          userAgent: getRequestUserAgent(req),
        });
      }

      if (session.status === "expired" || session.status === "inactive") {
        res.setHeader("Set-Cookie", clearCookie(adminSessionCookieName));
      }

      return res.status(401).json({
        ok: false,
        code: session.status === "expired" ? "ADMIN_SESSION_EXPIRED" : "ADMIN_AUTH_REQUIRED",
        message:
          session.status === "expired"
            ? "Admin session has expired"
            : "Admin authentication is required",
      });
    }

    req.adminSession = session;
    req.adminUser = session.adminUser;
    next();
  } catch (error) {
    console.error("Failed to validate admin session:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to validate admin session",
    });
  }
}

function hasValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isValidLookupVerificationCode(value) {
  return /^\d{6}$/.test(String(value || "").trim());
}

function generateLookupVerificationCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function generateLookupVerificationToken() {
  return `lookupv_${crypto.randomBytes(24).toString("hex")}`;
}

function hashLookupVerificationCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

let emailTransporter = null;

function getEmailTransporter() {
  if (!smtpHost || !smtpUser || !smtpPass || !lookupFromEmail) {
    return null;
  }

  if (!emailTransporter) {
    emailTransporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
  }

  return emailTransporter;
}

let lookupVerificationStoreReadyPromise = null;

async function ensureLookupVerificationStoreReady() {
  if (!lookupVerificationStoreReadyPromise) {
    lookupVerificationStoreReadyPromise = (async function () {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS application_lookup_email_verifications (
          id BIGSERIAL PRIMARY KEY,
          name VARCHAR(120) NOT NULL,
          email VARCHAR(255) NOT NULL,
          code_hash VARCHAR(64) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
          verification_token VARCHAR(80),
          attempt_count INTEGER NOT NULL DEFAULT 0,
          expires_at TIMESTAMPTZ NOT NULL,
          verified_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_application_lookup_email_verifications_email_created
        ON application_lookup_email_verifications (email, created_at DESC)
      `);

      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_application_lookup_email_verifications_token
        ON application_lookup_email_verifications (verification_token)
        WHERE verification_token IS NOT NULL
      `);
    })().catch((error) => {
      lookupVerificationStoreReadyPromise = null;
      throw error;
    });
  }

  return lookupVerificationStoreReadyPromise;
}

async function purgeExpiredLookupVerifications() {
  await pool.query(`
    DELETE FROM application_lookup_email_verifications
    WHERE created_at < NOW() - INTERVAL '3 days'
  `);
}

async function sendLookupVerificationEmail({ email, name, code }) {
  const transporter = getEmailTransporter();
  const subject = `[${emailBrandName}] 이메일 인증번호 안내`;
  const text = `${name}님, 신청 조회 인증번호는 ${code} 입니다. ${lookupVerificationCodeTtlMinutes}분 내에 입력해 주세요.`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <p>${name}님, 안녕하세요.</p>
      <p>신청 조회를 위한 이메일 인증번호를 안내드립니다.</p>
      <p style="font-size: 24px; font-weight: 700; letter-spacing: 0.08em;">${code}</p>
      <p>${lookupVerificationCodeTtlMinutes}분 내에 입력해 주세요.</p>
    </div>
  `;

  if (!transporter) {
    if (!allowEmailConsoleFallback) {
      throw new Error("Email provider is not configured");
    }

    console.log(`[lookup verification] email=${email} code=${code}`);
    return {
      deliveryMethod: "console",
    };
  }

  await transporter.sendMail({
    from: lookupFromEmail,
    to: email,
    subject,
    text,
    html,
  });

  return {
    deliveryMethod: "email",
  };
}

function normalizeR2Prefix(prefix) {
  if (!prefix) {
    return "";
  }

  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

function getUploadExtension(filename) {
  return path.extname(filename || "").toLowerCase();
}

function sanitizeOriginalFilename(filename) {
  return path
    .basename(String(filename || ""))
    .replace(/[\u0000-\u001f\u007f]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "file";
}

function sanitizeFilenameStem(filename) {
  return path
    .basename(filename || "", getUploadExtension(filename))
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "file";
}

function isAllowedUpload(file) {
  const extension = getUploadExtension(file.originalname);

  return (
    allowedUploadMimeTypes.has(file.mimetype) &&
    allowedUploadExtensions.has(extension)
  );
}

function hasSignature(buffer, bytes) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= bytes.length &&
    bytes.every((byte, index) => buffer[index] === byte)
  );
}

function hasZipSignature(buffer) {
  return (
    hasSignature(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
    hasSignature(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
    hasSignature(buffer, [0x50, 0x4b, 0x07, 0x08])
  );
}

function matchesUploadSignature(file) {
  const extension = getUploadExtension(file.originalname);
  const { buffer } = file;

  switch (extension) {
    case ".pdf":
      return hasSignature(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case ".jpg":
    case ".jpeg":
      return hasSignature(buffer, [0xff, 0xd8, 0xff]);
    case ".png":
      return hasSignature(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case ".doc":
    case ".ppt":
      return hasSignature(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case ".docx":
    case ".pptx":
      return hasZipSignature(buffer);
    default:
      return false;
  }
}

function buildUploadObjectKey(draftId, originalFilename) {
  const extension = getUploadExtension(originalFilename);
  const safeStem = sanitizeFilenameStem(originalFilename);

  return `applications/${draftId}/${Date.now()}_${crypto
    .randomBytes(8)
    .toString("hex")}_${safeStem}${extension}`;
}

function ensureR2UploadReady() {
  return Boolean(r2Client && r2BucketName);
}

function ensureR2ReadReady() {
  return Boolean(r2Client && r2BucketName);
}

function hasTrustedWriteOrigin(req) {
  const origin = normalizeText(req.headers.origin);

  if (!origin || corsAllowedOrigins.length === 0) {
    return true;
  }

  return corsAllowedOrigins.includes(origin);
}

function runSingleFileUpload(req, res) {
  return new Promise((resolve, reject) => {
    upload.single("file")(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

// 조회 완료 응답이 마스크된 상태로 반환
function maskPhone(phone) {
  if (!phone) {
    return null;
  }

  return phone.replace(/(\d{3})\d+(\d{4})/, "$1-****-$2");
}

function maskEmail(email) {
  if (!email || !email.includes("@")) {
    return null;
  }

  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

// 행과 열 매핑 분리
function mapDraftRow(row) {
  return {
    draftId: row.draft_id,
    orderId: row.order_id,
    paymentMethod: row.payment_method,
    status: row.status,
    name: row.name,
    phone: row.phone,
    email: row.email,
    birthDate: row.birth_date,
    organization: row.organization,
    division: row.division,
    discipline: row.discipline,
    imageKey: row.image_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapApplicationRow(row) {
  return {
    applicationNumber: row.application_number,
    draftId: row.draft_id,
    orderId: row.order_id,
    paymentKey: row.payment_key,
    status: row.status,
    paymentStatus: row.payment_status,
    name: row.name,
    phone: maskPhone(row.phone),
    email: maskEmail(row.email),
    birthDate: row.birth_date,
    organization: row.organization,
    division: row.division,
    discipline: row.discipline,
    imageKey: row.image_key,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
}

function mapConsentRow(row) {
  if (!row) {
    return null;
  }

  return {
    privacy: row.privacy_consent,
    terms: row.terms_consent,
    refund: row.refund_consent,
    marketing: row.marketing_consent,
    photoVideo: row.photo_video_consent,
    version: row.consent_version,
    consentedAt: row.consented_at,
  };
}

// Draft 정규화 작업
function validateDraftPayload(body) {
  const name = normalizeText(body.name);
  const phone = normalizeText(formatPhoneNumber(body.phone));
  const email = normalizeText(body.email);
  const birthDate = normalizeText(body.birthDate);
  const organization = normalizeText(body.organization);
  const paymentMethod = normalizeText(body.paymentMethod) || "widget";
  const selection = {
    division: normalizeText(body.selection?.division),
    discipline: normalizeText(body.selection?.discipline),
    imageKey: normalizeText(body.selection?.imageKey),
  };

  const consents = {
    privacy: normalizeBoolean(body.consents?.privacy),
    terms: normalizeBoolean(body.consents?.terms),
    refund: normalizeBoolean(body.consents?.refund),
    marketing: normalizeBoolean(body.consents?.marketing),
    photoVideo: normalizeBoolean(body.consents?.photoVideo),
  };

  if (!name || !phone || !email || !birthDate) {
    return {
      ok: false,
      message: "Missing required applicant fields",
    };
  }

  return {
    ok: true,
    payload: {
      name,
      phone,
      email,
      birthDate,
      organization,
      paymentMethod,
      selection,
      consents,
    },
  };
}

// 웹훅 복제 헬퍼
function buildWebhookEventId(payload) {
  const explicitEventId =
    payload?.eventId || payload?.event_id || payload?.data?.eventId || null;

  if (explicitEventId) {
    return explicitEventId;
  }

  const fingerprintSource = {
    eventType: payload?.eventType || payload?.type || payload?.event_type || "UNKNOWN",
    createdAt: payload?.createdAt || payload?.created_at || null,
    paymentKey: payload?.data?.paymentKey || payload?.paymentKey || null,
    orderId: payload?.data?.orderId || payload?.orderId || null,
    status: payload?.data?.status || payload?.status || null,
    secret: payload?.data?.secret || payload?.secret || null,
    data: payload?.data || null,
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(fingerprintSource))
    .digest("hex");
}

function extractWebhookFields(payload) {
  return {
    eventType: payload?.eventType || payload?.type || payload?.event_type || "UNKNOWN",
    eventId: buildWebhookEventId(payload),
    paymentKey: payload?.data?.paymentKey || payload?.paymentKey || null,
    orderId: payload?.data?.orderId || payload?.orderId || null,
    secret: payload?.data?.secret || payload?.secret || null,
  };
}

// 웹훅 Event 상태 업데이트
async function markWebhookEventStatus(eventId, status) {
  await pool.query(
    `
      UPDATE payment_webhook_events
      SET
        processing_status = $2,
        processed_at = NOW()
      WHERE event_id = $1
    `,
    [eventId, status]
  );
}

// 결제 취소 상태 이벤트 발생 시
function extractWebhookPaymentStatus(eventType, payload) {
  if (eventType === "CANCEL_STATUS_CHANGED") {
    return (
      payload?.data?.cancelStatus ||
      payload?.cancelStatus ||
      payload?.data?.status ||
      payload?.status ||
      null
    );
  }

  return payload?.data?.status || payload?.status || null;
}

// Payment의 status에 따른 Order status 변경
function mapPaymentStatusToOrderStatus(paymentStatus) {
  switch (paymentStatus) {
    case "DONE":
      return "PAID";
    case "WAITING_FOR_DEPOSIT":
      return "WAITING_FOR_DEPOSIT";
    case "CANCELED":
      return "CANCELED";
    case "PARTIAL_CANCELED":
      return "PARTIAL_CANCELED";
    case "ABORTED":
    case "EXPIRED":
      return "FAILED";
    default:
      return null;
  }
}

// 최소 결제 스냅샷 추출 후 업데이트
function extractWebhookPaymentSnapshot(payload, paymentStatus) {
  const source = payload?.data || payload || {};

  return {
    method: source.method || null,
    paymentType: source.type || source.paymentType || null,
    approvedAt: source.approvedAt || null,
    totalAmount:
      typeof source.totalAmount === "number" ? source.totalAmount : null,
    paymentStatus,
  };
}

// Webhook 처리가 중복으로 왔을 때 오류 방지
async function findProcessedEquivalentWebhookEvent(client, {
  eventId,
  eventType,
  paymentKey,
  orderId,
  paymentStatus,
}) {
  if (!paymentStatus || (!paymentKey && !orderId)) {
    return false;
  }

  const equivalentEventTypes =
    eventType === "CANCEL_STATUS_CHANGED"
      ? ["CANCEL_STATUS_CHANGED"]
      : ["PAYMENT_STATUS_CHANGED", "DEPOSIT_CALLBACK"];

  const result = await client.query(
    `
      SELECT 1
      FROM payment_webhook_events
      WHERE event_id <> $1
        AND processing_status = 'PROCESSED'
        AND event_type = ANY($4)
        AND (
          ($2 IS NOT NULL AND payment_key = $2)
          OR ($3 IS NOT NULL AND order_id = $3)
        )
        AND COALESCE(
          payload_json->'data'->>'cancelStatus',
          payload_json->>'cancelStatus',
          payload_json->'data'->>'status',
          payload_json->>'status'
        ) = $5
      LIMIT 1
    `,
    [eventId, paymentKey, orderId, equivalentEventTypes, paymentStatus]
  );

  return result.rowCount > 0;
}

// Webhook으로부터 데이터 업데이트 및 삽입
async function upsertPaymentFromWebhook(client, {
  orderId,
  paymentKey,
  payload,
  paymentStatus,
}) {
  if (!orderId && !paymentKey) {
    return null;
  }

  const paymentResult = await client.query(
    `
      SELECT
        order_id,
        payment_key,
        status
      FROM payments
      WHERE payment_key = $1
         OR order_id = $2
      ORDER BY updated_at DESC
      LIMIT 1
      FOR UPDATE
    `,
    [paymentKey, orderId]
  );

  const snapshot = extractWebhookPaymentSnapshot(payload, paymentStatus);

  if (paymentResult.rowCount > 0) {
    await client.query(
      `
        UPDATE payments
        SET
          status = COALESCE($3, status),
          method = COALESCE($4, method),
          payment_type = COALESCE($5, payment_type),
          approved_at = COALESCE($6, approved_at),
          total_amount = COALESCE($7, total_amount),
          raw_response_json = $8::jsonb,
          updated_at = NOW()
        WHERE payment_key = $1
           OR order_id = $2
      `,
      [
        paymentKey,
        orderId,
        snapshot.paymentStatus,
        snapshot.method,
        snapshot.paymentType,
        snapshot.approvedAt,
        snapshot.totalAmount,
        JSON.stringify(payload),
      ]
    );

    return paymentResult.rows[0];
  }

  if (!orderId || !paymentKey) {
    return null;
  }

  await client.query(
    `
      INSERT INTO payments (
        order_id,
        payment_key,
        method,
        payment_type,
        status,
        approved_at,
        total_amount,
        raw_response_json,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
    `,
    [
      orderId,
      paymentKey,
      snapshot.method,
      snapshot.paymentType,
      snapshot.paymentStatus,
      snapshot.approvedAt,
      snapshot.totalAmount,
      JSON.stringify(payload),
    ]
  );

  return {
    order_id: orderId,
    payment_key: paymentKey,
    status: snapshot.paymentStatus,
  };
}

// Webhook을 통한 BEGIN 응답을 COMMIT 또는 ROLLBACK 처리
async function applyWebhookBusinessState({
  eventId,
  eventType,
  paymentKey,
  orderId,
  payload,
}) {
  const paymentStatus = extractWebhookPaymentStatus(eventType, payload);

  if (!paymentKey && !orderId) {
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const alreadyApplied = await findProcessedEquivalentWebhookEvent(client, {
      eventId,
      eventType,
      paymentKey,
      orderId,
      paymentStatus,
    });

    if (alreadyApplied) {
      await client.query("COMMIT");
      return;
    }

    await upsertPaymentFromWebhook(client, {
      orderId,
      paymentKey,
      payload,
      paymentStatus,
    });

    if (orderId) {
      const orderResult = await client.query(
        `
          SELECT status
          FROM orders
          WHERE order_id = $1
          FOR UPDATE
        `,
        [orderId]
      );

      if (orderResult.rowCount > 0) {
        const targetOrderStatus = mapPaymentStatusToOrderStatus(paymentStatus);
        const currentOrderStatus = orderResult.rows[0].status;

        if (targetOrderStatus && currentOrderStatus !== targetOrderStatus) {
          await client.query(
            `
              UPDATE orders
              SET status = $2, updated_at = NOW()
              WHERE order_id = $1
            `,
            [orderId, targetOrderStatus]
          );
        }
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// 가상계좌 secret 확인
async function verifyDepositCallbackSecret({ paymentKey, orderId, secret }) {
  if (!secret) {
    const error = new Error("Missing secret in DEPOSIT_CALLBACK payload");
    error.statusCode = 400;
    throw error;
  }

  const paymentResult = await pool.query(
    `
      SELECT
        payment_key,
        raw_response_json->>'secret' AS stored_secret
      FROM payments
      WHERE payment_key = $1
         OR order_id = $2
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [paymentKey, orderId]
  );

  if (paymentResult.rowCount === 0) {
    throw new Error("Payment record not found for DEPOSIT_CALLBACK");
  }

  const storedSecret = paymentResult.rows[0].stored_secret;

  if (!storedSecret) {
    throw new Error("Stored payment secret is missing for DEPOSIT_CALLBACK");
  }

  if (storedSecret !== secret) {
    const error = new Error("Invalid DEPOSIT_CALLBACK secret");
    error.statusCode = 400;
    throw error;
  }
}

// TODO: 개발자센터에 로그인해서 내 결제위젯 연동 키 > 시크릿 키를 입력하세요. 시크릿 키는 외부에 공개되면 안돼요.
// @docs https://docs.tosspayments.com/reference/using-api/api-keys
const widgetSecretKey = process.env.TOSS_WIDGET_SECRET_KEY;
const apiSecretKey = process.env.TOSS_API_SECRET_KEY;

if (!apiSecretKey) {
  throw new Error("Missing TOSS_API_SECRET_KEY in .env");
}

// 토스페이먼츠 API는 시크릿 키를 사용자 ID로 사용하고, 비밀번호는 사용하지 않습니다.
// 비밀번호가 없다는 것을 알리기 위해 시크릿 키 뒤에 콜론을 추가합니다.
// @docs https://docs.tosspayments.com/reference/using-api/authorization#%EC%9D%B8%EC%A6%9D
const encryptedWidgetSecretKey = widgetSecretKey
  ? "Basic " + Buffer.from(widgetSecretKey + ":").toString("base64")
  : null;
const encryptedApiSecretKey =
  "Basic " + Buffer.from(apiSecretKey + ":").toString("base64");

// 결제위젯 승인
async function confirmPaymentAndPersist(req, res, options) {
  const { paymentKey, orderId, amount, customerKey } = req.body;
  const { authorization, confirmUrl, includeCustomerKey = false, logLabel } = options;

  if(!paymentKey || !orderId || amount == null) {
    return res.status(400).json({
      ok: false,
      message: "Missing paymentKey, orderId, or amount",
    });
  }

  const normalizedAmount = Number(amount);

  if(!Number.isInteger(normalizedAmount) || normalizedAmount <=0) {
    return res.status(400).json({
      ok: false,
      message: "Invalid amount",
    });
  }

  if (includeCustomerKey && !customerKey) {
    return res.status(400).json({
      ok: false,
      message: "Missing customerKey",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const orderResult = await client.query(
      `
        SELECT
          id,
          order_id,
          order_name,
          amount,
          status
        FROM orders
        WHERE order_id = $1
        FOR UPDATE
      `,
      [orderId]
    );

    if(orderResult.rowCount === 0){
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok:false,
        message: "Order not found",
      });
    }

    const order = orderResult.rows[0];
    const paymentResult = await client.query(
      `
        SELECT
          payment_key,
          status,
          raw_response_json
        FROM payments
        WHERE order_id = $1
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [orderId]
    );

    if (paymentResult.rowCount > 0) {
      const savedPayment = paymentResult.rows[0];

      if (savedPayment.payment_key !== paymentKey) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          message: "Order already confirmed with a different paymentKey",
        });
      }

      await client.query("ROLLBACK");
      return res.status(200).json({
        ok: true,
        idempotent: true,
        payment: savedPayment.raw_response_json,
      });
    }

    if(order.status !== "READY"){
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok:false,
        message: `Order is not in READY status. Current status: ${order.status}`,
      });
    }

    if(Number(order.amount) !== normalizedAmount){
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok:false,
        message: "Amount mismatch",
      });
    }

    // 결제 승인 API를 호출하세요.
    // 결제를 승인하면 결제수단에서 금액이 차감돼요.
    // @docs https://docs.tosspayments.com/guides/v2/payment-widget/integration#3-결제-승인하기
    const confirmBody = {
      orderId,
      amount: normalizedAmount,
      paymentKey,
    };

    if (includeCustomerKey) {
      confirmBody.customerKey = customerKey;
    }

    const tossResponse = await fetch(confirmUrl, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(confirmBody),
    });

    const tossResult = await tossResponse.json();
    console.log(`${logLabel} confirm result:`, tossResult);
 
    if (!tossResponse.ok) {
      await client.query(
        `
          UPDATE orders
          SET status = 'FAILED', updated_at = NOW()
          WHERE order_id = $1
        `,
        [orderId]
      );

      await client.query("COMMIT");

      return res.status(tossResponse.status).json({
        ok:false,
        ...tossResult,
      });
    }

    await client.query(
      `
        INSERT INTO payments (
          order_id,
          payment_key,
          method,
          payment_type,
          status,
          approved_at,
          total_amount,
          raw_response_json,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
      `,
      [
        orderId,
        tossResult.paymentKey || paymentKey,
        tossResult.method || null,
        tossResult.type || null,
        tossResult.status || "DONE",
        tossResult.approvedAt || null,
        tossResult.totalAmount || normalizedAmount,
        JSON.stringify(tossResult),
      ]
    );

    await client.query(
      `
        UPDATE orders
        SET status = $2, updated_at = NOW()
        WHERE order_id = $1
      `,
      [orderId, mapPaymentStatusToOrderStatus(tossResult.status) || "PAID"]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      ok:true,
      payment: tossResult,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`Failed to confirm ${logLabel} payment:`, error);

    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message: "Duplicate paymentKey detected",
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Failed to confirm payment",
    });
  } finally {
    client.release();
  }
}

app.post("/confirm/widget", async function (req, res) {
  if (!encryptedWidgetSecretKey) {
    return res.status(503).json({
      ok: false,
      message: "Toss payment widget is not configured",
    });
  }

  await confirmPaymentAndPersist(req, res, {
    authorization: encryptedWidgetSecretKey,
    confirmUrl: "https://api.tosspayments.com/v1/payments/confirm",
    logLabel: "widget",
  });
});

// 결제창 승인
app.post("/confirm/payment", async function (req, res) {
  return confirmPaymentAndPersist(req, res, {
    authorization: encryptedApiSecretKey,
    confirmUrl: "https://api.tosspayments.com/v1/payments/confirm",
    logLabel: "payment",
  });
});

// 브랜드페이 승인
app.post("/confirm/brandpay", async function (req, res) {
  return confirmPaymentAndPersist(req, res, {
    authorization: encryptedApiSecretKey,
    confirmUrl: "https://api.tosspayments.com/v1/brandpay/payments/confirm",
    includeCustomerKey: true,
    logLabel: "brandpay",
  });
});

// 브랜드페이 Access Token 발급
app.get("/callback-auth", function (req, res) {
  const { customerKey, code } = req.query;

  // 요청으로 받은 customerKey 와 요청한 주체가 동일인인지 검증 후 Access Token 발급 API 를 호출하세요.
  // @docs https://docs.tosspayments.com/reference/brandpay#access-token-발급
  fetch(
    "https://api.tosspayments.com/v1/brandpay/authorizations/access-token",
    {
      method: "POST",
      headers: {
        Authorization: encryptedApiSecretKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grantType: "AuthorizationCode",
        customerKey,
        code,
      }),
    },
  ).then(async function (response) {
    const result = await response.json();
    console.log(result);

    if (!response.ok) {
      // TODO: 발급 실패 비즈니스 로직을 구현하세요.
      res.status(response.status).json(result);

      return;
    }

    // TODO: 발급 성공 비즈니스 로직을 구현하세요.
    res.status(response.status).json(result);
  });
});

const billingKeyMap = new Map();

// 빌링키 발급
app.post("/issue-billing-key", function (req, res) {
  const { customerKey, authKey } = req.body;

  // AuthKey 로 빌링키 발급 API 를 호출하세요
  // @docs https://docs.tosspayments.com/guides/v2/billing/integration
  fetch(`https://api.tosspayments.com/v1/billing/authorizations/issue`, {
    method: "POST",
    headers: {
      Authorization: encryptedApiSecretKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customerKey,
      authKey,
    }),
  }).then(async function (response) {
    const result = await response.json();
    console.log(result);

    if (!response.ok) {
      // TODO: 빌링키 발급 실패 비즈니스 로직을 구현하세요.
      res.status(response.status).json(result);

      return;
    }

    // TODO: 빌링키 발급 성공 비즈니스 로직을 구현하세요.
    // TODO: 발급된 빌링키를 구매자 정보로 찾을 수 있도록 저장해두고, 결제가 필요한 시점에 조회하여 자동결제 승인 API 를 호출합니다.
    billingKeyMap.set(customerKey, result.billingKey);
    res.status(response.status).json(result);
  });
});

// 자동결제 승인
app.post("/confirm-billing", function (req, res) {
  const {
    customerKey,
    amount,
    orderId,
    orderName,
    customerEmail,
    customerName,
  } = req.body;

  // 저장해두었던 빌링키로 자동결제 승인 API 를 호출하세요.
  fetch(
    `https://api.tosspayments.com/v1/billing/${billingKeyMap.get(customerKey)}`,
    {
      method: "POST",
      headers: {
        Authorization: encryptedApiSecretKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerKey,
        amount,
        orderId,
        orderName,
        customerEmail,
        customerName,
      }),
    },
  ).then(async function (response) {
    const result = await response.json();
    console.log(result);

    if (!response.ok) {
      // TODO: 자동결제 승인 실패 비즈니스 로직을 구현하세요.
      res.status(response.status).json(result);

      return;
    }

    // TODO: 자동결제 승인 성공 비즈니스 로직을 구현하세요.
    res.status(response.status).json(result);
  });
});

//db health 케어 진단
app.get("/health/db", async function (req, res) {
  try {
    const result = await pool.query("SELECT NOW() AS current_time");
    return res.status(200).json({
      ok: true,
      currentTime: result.rows[0].current_time,
    });
  } catch (error) {
    console.error("DB health check failed:", error);
    return res.status(500).json({
      ok: false,
      message: "Database connection failed",
    });
  }
});


//서버 시작
app.get("/home/gallery-images", async function (req, res) {
  try {
    if (!ensureR2ReadReady()) {
      return res.status(500).json({
        ok: false,
        message: "R2 image gallery is not configured",
      });
    }

    const result = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: r2BucketName,
        Prefix: r2HomeImagePrefix,
        MaxKeys: 20,
      })
    );

    const media = (result.Contents || [])
      .filter((item) => item.Key && !item.Key.endsWith("/"))
      .filter((item) => /\.(png|jpe?g|webp|gif|mp4|webm|mov)$/i.test(item.Key))
      .map((item) => ({
        key: item.Key,
        type: /\.(mp4|webm|mov)$/i.test(item.Key) ? "video" : "image",
        src: "/api/home/gallery-image?key=" + encodeURIComponent(item.Key),
      }));

    return res.status(200).json({
      ok: true,
      images: media,
    });
  } catch (error) {
    console.error("Failed to list home gallery images:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to list home gallery images",
    });
  }
});

app.get("/home/gallery-image", async function (req, res) {
  try {
    if (!ensureR2ReadReady()) {
      return res.status(500).json({
        ok: false,
        message: "R2 image gallery is not configured",
      });
    }

    const objectKey = normalizeText(req.query.key);

    if (!objectKey) {
      return res.status(400).json({
        ok: false,
        message: "Missing image key",
      });
    }

    if (!r2ReadableImagePrefixes.some((prefix) => objectKey.startsWith(prefix))) {
      return res.status(403).json({
        ok: false,
        message: "Image key is not allowed",
      });
    }

    const objectResponse = await r2Client.send(
      new GetObjectCommand({
        Bucket: r2BucketName,
        Key: objectKey,
      })
    );

    res.setHeader("Content-Type", objectResponse.ContentType || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=300");

    objectResponse.Body.pipe(res);
  } catch (error) {
    console.error("Failed to fetch home gallery image:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch home gallery image",
    });
  }
});

function formatFileSizeLabel(size) {
  const numericSize = Number(size || 0);

  if (numericSize >= 1024 * 1024) {
    return `${(numericSize / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (numericSize >= 1024) {
    return `${Math.round(numericSize / 1024)} KB`;
  }

  return `${numericSize} B`;
}

app.post("/admin/login", async function (req, res) {
  if (!hasTrustedAdminOrigin(req)) {
    return res.status(403).json({
      ok: false,
      message: "Untrusted admin origin",
    });
  }

  const email = normalizeEmail(req.body.email);
  const password = normalizeText(req.body.password);
  const ipAddress = getRequestIp(req);
  const userAgent = getRequestUserAgent(req);
  const failureKey = getAdminLoginFailureKey(email, ipAddress);

  if (!email || !password) {
    return res.status(400).json({
      ok: false,
      message: "Missing admin email or password",
    });
  }

  try {
    cleanupAdminLoginProtectionStore();
    await cleanupExpiredAdminSessions();

    const rateLimitResult = consumeAdminLoginRateLimit(ipAddress);

    if (!rateLimitResult.ok) {
      await writeAdminAuditLog({
        action: "ADMIN_LOGIN_RATE_LIMITED",
        targetType: "admin_auth",
        targetId: email || ipAddress,
        ipAddress,
        userAgent,
        metadata: {
          retryAfterMs: rateLimitResult.retryAfterMs,
        },
      });

      return res.status(429).json({
        ok: false,
        code: "ADMIN_LOGIN_RATE_LIMITED",
        message: "Too many login attempts. Try again later.",
      });
    }

    const lockStatus = getAdminLoginLockStatus(failureKey);

    if (lockStatus.locked) {
      await writeAdminAuditLog({
        action: "ADMIN_LOGIN_LOCKED",
        targetType: "admin_auth",
        targetId: email,
        ipAddress,
        userAgent,
        metadata: {
          remainingMs: lockStatus.remainingMs,
        },
      });

      return res.status(429).json({
        ok: false,
        code: "ADMIN_LOGIN_LOCKED",
        message: "Too many failed login attempts. Try again later.",
      });
    }

    const adminUserResult = await pool.query(
      `
        SELECT
          id,
          email,
          password_hash,
          display_name,
          role,
          is_active,
          last_login_at,
          created_at,
          updated_at
        FROM admin_users
        WHERE email = $1
        LIMIT 1
      `,
      [email]
    );

    if (adminUserResult.rowCount === 0) {
      const failureState = recordAdminLoginFailure(failureKey);

      await writeAdminAuditLog({
        action: "ADMIN_LOGIN_FAILED",
        targetType: "admin_user",
        targetId: email,
        ipAddress,
        userAgent,
        metadata: {
          reason: "USER_NOT_FOUND",
          failureCount: failureState.count,
          lockedUntil: failureState.lockedUntil,
        },
      });

      return res.status(401).json({
        ok: false,
        code: "ADMIN_AUTH_FAILED",
        message: "Invalid admin credentials",
      });
    }

    const adminUser = adminUserResult.rows[0];
    const isPasswordValid = await verifyAdminPassword(password, adminUser.password_hash);

    if (!adminUser.is_active || !isPasswordValid) {
      const failureState = recordAdminLoginFailure(failureKey);

      await writeAdminAuditLog({
        adminUserId: adminUser.id,
        action: "ADMIN_LOGIN_FAILED",
        targetType: "admin_user",
        targetId: String(adminUser.id),
        ipAddress,
        userAgent,
        metadata: {
          reason: adminUser.is_active ? "INVALID_PASSWORD" : "INACTIVE_USER",
          failureCount: failureState.count,
          lockedUntil: failureState.lockedUntil,
        },
      });

      return res.status(401).json({
        ok: false,
        code: "ADMIN_AUTH_FAILED",
        message: "Invalid admin credentials",
      });
    }

    clearAdminLoginFailures(failureKey);

    const sessionToken = generateAdminSessionToken();
    const sessionTokenHash = hashAdminSessionToken(sessionToken);

    await pool.query(
      `
        INSERT INTO admin_sessions (
          admin_user_id,
          session_token_hash,
          ip_address,
          user_agent,
          expires_at
        )
        VALUES ($1, $2, $3, $4, NOW() + ($5 || ' hours')::interval)
      `,
      [adminUser.id, sessionTokenHash, ipAddress, userAgent, adminSessionTtlHours]
    );

    await pool.query(
      `
        UPDATE admin_users
        SET
          last_login_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `,
      [adminUser.id]
    );

    await writeAdminAuditLog({
      adminUserId: adminUser.id,
      action: "ADMIN_LOGIN_SUCCEEDED",
      targetType: "admin_user",
      targetId: String(adminUser.id),
      ipAddress,
      userAgent,
    });

    res.setHeader("Set-Cookie", createAdminSessionCookie(sessionToken));

    return res.status(200).json({
      ok: true,
      adminUser: normalizeAdminUser(adminUser),
    });
  } catch (error) {
    console.error("Failed to log in admin user:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to log in admin user",
    });
  }
});

app.post("/admin/logout", async function (req, res) {
  if (!hasTrustedAdminOrigin(req)) {
    return res.status(403).json({
      ok: false,
      message: "Untrusted admin origin",
    });
  }

  try {
    const session = await resolveAdminSession(req);

    if (session.status === "active") {
      await pool.query(
        `
          DELETE FROM admin_sessions
          WHERE id = $1
        `,
        [session.sessionId]
      );

      await writeAdminAuditLog({
        adminUserId: session.adminUserId,
        action: "ADMIN_LOGOUT",
        targetType: "admin_user",
        targetId: String(session.adminUserId),
        ipAddress: getRequestIp(req),
        userAgent: getRequestUserAgent(req),
      });
    }

    res.setHeader("Set-Cookie", clearCookie(adminSessionCookieName));

    return res.status(200).json({
      ok: true,
    });
  } catch (error) {
    console.error("Failed to log out admin user:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to log out admin user",
    });
  }
});

app.get("/admin/me", requireAdminAuth, async function (req, res) {
  return res.status(200).json({
    ok: true,
    adminUser: req.adminUser,
    session: {
      expiresAt: req.adminSession.expiresAt,
    },
  });
});

app.get("/admin/applications", requireAdminAuth, async function (req, res) {
  try {
    const result = await pool.query(
      `
        SELECT
          application_number,
          order_id,
          name,
          phone,
          email,
          organization,
          division,
          discipline,
          payment_status,
          submitted_at
        FROM applications
        ORDER BY submitted_at DESC
        LIMIT 200
      `
    );

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_VIEW_APPLICATIONS",
      targetType: "applications",
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { count: result.rowCount },
    });

    return res.status(200).json({
      ok: true,
      applications: result.rows.map((row) => ({
        applicationNumber: row.application_number,
        orderId: row.order_id,
        name: row.name,
        phone: row.phone,
        email: row.email,
        organization: row.organization,
        division: row.division,
        discipline: row.discipline,
        paymentStatus: row.payment_status,
        submittedAt: row.submitted_at,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch admin applications:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch admin applications",
    });
  }
});

app.get("/admin/refunds", requireAdminAuth, async function (req, res) {
  try {
    const result = await pool.query(
      `
        SELECT
          payments.order_id,
          payments.payment_key,
          payments.status,
          payments.total_amount,
          payments.approved_at,
          payments.updated_at,
          applications.application_number,
          applications.name
          ,
          applications.phone,
          applications.email,
          applications.division,
          applications.discipline,
          orders.customer_name,
          orders.customer_email,
          orders.status AS order_status
        FROM payments
        LEFT JOIN applications
          ON applications.order_id = payments.order_id
        LEFT JOIN orders
          ON orders.order_id = payments.order_id
        WHERE payments.status IN ('CANCELED', 'PARTIAL_CANCELED')
        ORDER BY payments.updated_at DESC
        LIMIT 200
      `
    );

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_VIEW_REFUNDS",
      targetType: "payments",
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { count: result.rowCount },
    });

    return res.status(200).json({
      ok: true,
      refunds: result.rows.map((row) => ({
        orderId: row.order_id,
        paymentKey: row.payment_key,
        applicationNumber: row.application_number,
        name: row.name || row.customer_name,
        phone: row.phone,
        email: row.email || row.customer_email,
        division: row.division,
        discipline: row.discipline,
        paymentStatus: row.status,
        totalAmount: row.total_amount,
        approvedAt: row.approved_at,
        orderStatus: row.order_status,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch admin refunds:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch admin refunds",
    });
  }
});

app.get("/admin/assets/register", requireAdminAuth, async function (req, res) {
  try {
    if (!ensureR2ReadReady()) {
      return res.status(500).json({
        ok: false,
        message: "R2 read is not configured",
      });
    }

    const listResponse = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: r2BucketName,
        Prefix: "register/",
      })
    );

    const assets = (listResponse.Contents || [])
      .filter((item) => /\.(png|jpe?g)$/i.test(item.Key || ""))
      .map((item) => ({
        key: item.Key,
        filename: path.basename(item.Key || ""),
        sizeBytes: item.Size || 0,
        sizeLabel: formatFileSizeLabel(item.Size || 0),
        lastModified: item.LastModified || null,
      }))
      .sort((a, b) => {
        const left = a.lastModified ? new Date(a.lastModified).getTime() : 0;
        const right = b.lastModified ? new Date(b.lastModified).getTime() : 0;
        return right - left;
      });

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_VIEW_REGISTER_ASSETS",
      targetType: "r2_assets",
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { count: assets.length },
    });

    return res.status(200).json({
      ok: true,
      assets,
    });
  } catch (error) {
    console.error("Failed to fetch admin register assets:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch admin register assets",
    });
  }
});

app.get("/admin/audit-logs", requireAdminAuth, async function (req, res) {
  try {
    const result = await pool.query(
      `
        SELECT
          logs.id,
          logs.action,
          logs.target_type,
          logs.target_id,
          logs.ip_address,
          logs.user_agent,
          logs.metadata_json,
          logs.created_at,
          users.email,
          users.display_name,
          users.role
        FROM admin_audit_logs AS logs
        LEFT JOIN admin_users AS users
          ON users.id = logs.admin_user_id
        ORDER BY logs.created_at DESC
        LIMIT 200
      `
    );

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_VIEW_AUDIT_LOGS",
      targetType: "admin_audit_logs",
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { count: result.rowCount },
    });

    return res.status(200).json({
      ok: true,
      auditLogs: result.rows.map((row) => ({
        id: row.id,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        metadata: row.metadata_json,
        createdAt: row.created_at,
        adminUserEmail: row.email,
        adminUserDisplayName: row.display_name,
        adminUserRole: row.role,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch admin audit logs:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch admin audit logs",
    });
  }
});

async function startServer() {
  try {
    await pool.query("SELECT 1");
    await ensureLookupVerificationStoreReady();
    await ensureAdminBootstrapReady();
    console.log("PostgreSQL connected");
    app.listen(port, () =>
      console.log(`http://localhost:${port} 으로 샘플 앱이 실행되었습니다.`),
    );
  } catch (error) {
    console.error("Failed to connect PostgreSQL:", error);
    process.exit(1);
  }
}

//웹훅 처리 API
app.post("/webhooks/toss", async function (req,res) {
  const payload = req.body;
  const { eventType, eventId, paymentKey, orderId, secret } = extractWebhookFields(payload);

  try {
    try {
      await pool.query(
        `
          INSERT INTO payment_webhook_events (
            event_type,
            event_id,
            payment_key,
            order_id,
            payload_json,
            processing_status
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, 'RECEIVED')
        `,
        [
          eventType,
          eventId,
          paymentKey,
          orderId,
          JSON.stringify(payload),
        ]
      );
    } catch (insertError) {
      if (insertError.code !== "23505") {
        throw insertError;
      }

      const existingEventResult = await pool.query(
        `
          SELECT processing_status
          FROM payment_webhook_events
          WHERE event_id = $1
          LIMIT 1
        `,
        [eventId]
      );

      if (
        existingEventResult.rowCount > 0 &&
        existingEventResult.rows[0].processing_status === "PROCESSED"
      ) {
        return res.status(200).json({
          ok: true,
          duplicated: true,
        });
      }

      await pool.query(
        `
          UPDATE payment_webhook_events
          SET
            event_type = $2,
            payment_key = $3,
            order_id = $4,
            payload_json = $5::jsonb,
            processing_status = 'RECEIVED',
            processed_at = NULL,
            received_at = NOW()
          WHERE event_id = $1
        `,
        [
          eventId,
          eventType,
          paymentKey,
          orderId,
          JSON.stringify(payload),
        ]
      );
    }

    if (eventType === "DEPOSIT_CALLBACK") {
      await verifyDepositCallbackSecret({
        paymentKey,
        orderId,
        secret,
      });
    }

    await applyWebhookBusinessState({
      eventId,
      eventType,
      paymentKey,
      orderId,
      payload,
    });

    await markWebhookEventStatus(eventId, "PROCESSED");

    return res.status(200).json({
      ok:true,
      received: true,
    });
  } catch (error){
    if (eventId) {
      try {
        await markWebhookEventStatus(eventId, "FAILED");
      } catch (updateError) {
        console.error("Failed to update webhook event status:", updateError);
      }
    }

    console.error("Failed to store webhook event:", error);

    return res.status(error.statusCode || 500).json({
      ok: false,
      message: "Failed to store webhook event",
    });
  }
});


//주문 생성 API
app.post("/applications/draft", async function (req, res) {
  const validation = validateDraftPayload(req.body);

  if (!validation.ok) {
    return res.status(400).json({
      ok: false,
      message: validation.message,
    });
  }

  const { payload } = validation;
  const draftId = generateDraftId();
  const consentVersion = normalizeText(req.body.consents?.version) || "v1";
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const draftResult = await client.query(
      `
        INSERT INTO application_drafts (
          draft_id,
          payment_method,
          status,
          name,
          phone,
          email,
          birth_date,
          organization,
          division,
          discipline,
          image_key,
          created_at,
          updated_at
        )
        VALUES ($1, $2, 'DRAFT', $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING
          draft_id,
          order_id,
          payment_method,
          status,
          name,
          phone,
          email,
          birth_date,
          organization,
          division,
          discipline,
          image_key,
          created_at,
          updated_at
      `,
      [
        draftId,
        payload.paymentMethod,
        payload.name,
        payload.phone,
        payload.email,
        payload.birthDate,
        payload.organization,
        payload.selection.division,
        payload.selection.discipline,
        payload.selection.imageKey,
      ]
    );

    await client.query(
      `
        INSERT INTO application_consents (
          draft_id,
          privacy_consent,
          terms_consent,
          refund_consent,
          marketing_consent,
          photo_video_consent,
          consent_version,
          consented_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `,
      [
        draftResult.rows[0].draft_id,
        payload.consents.privacy,
        payload.consents.terms,
        payload.consents.refund,
        payload.consents.marketing,
        payload.consents.photoVideo,
        consentVersion,
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      ok: true,
      draft: mapDraftRow(draftResult.rows[0]),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to create application draft:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to create application draft",
    });
  } finally {
    client.release();
  }
});

// Draft Update
app.patch("/applications/draft/:draftId", async function (req, res) {
  const validation = validateDraftPayload(req.body);

  if (!validation.ok) {
    return res.status(400).json({
      ok: false,
      message: validation.message,
    });
  }

  const { payload } = validation;
  const consentVersion = normalizeText(req.body.consents?.version) || "v1";
  const { draftId } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const draftResult = await client.query(
      `
        UPDATE application_drafts
        SET
          payment_method = $2,
          name = $3,
          phone = $4,
          email = $5,
          birth_date = $6,
          organization = $7,
          division = $8,
          discipline = $9,
          image_key = $10,
          updated_at = NOW()
        WHERE draft_id = $1
        RETURNING
          draft_id,
          order_id,
          payment_method,
          status,
          name,
          phone,
          email,
          birth_date,
          organization,
          division,
          discipline,
          image_key,
          created_at,
          updated_at
      `,
      [
        draftId,
        payload.paymentMethod,
        payload.name,
        payload.phone,
        payload.email,
        payload.birthDate,
        payload.organization,
        payload.selection.division,
        payload.selection.discipline,
        payload.selection.imageKey,
      ]
    );

    if (draftResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        message: "Draft not found",
      });
    }

    await client.query(
      `
        DELETE FROM application_consents
        WHERE draft_id = $1
          AND application_id IS NULL
      `,
      [draftId]
    );

    await client.query(
      `
        INSERT INTO application_consents (
          draft_id,
          privacy_consent,
          terms_consent,
          refund_consent,
          marketing_consent,
          photo_video_consent,
          consent_version,
          consented_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `,
      [
        draftId,
        payload.consents.privacy,
        payload.consents.terms,
        payload.consents.refund,
        payload.consents.marketing,
        payload.consents.photoVideo,
        consentVersion,
      ]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      draft: mapDraftRow(draftResult.rows[0]),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to update application draft:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to update application draft",
    });
  } finally {
    client.release();
  }
});

// Draft Data 확인
app.get("/applications/draft/:draftId", async function (req, res) {
  try {
    const { draftId } = req.params;

    const draftResult = await pool.query(
      `
        SELECT
          id,
          draft_id,
          order_id,
          payment_method,
          status,
          name,
          phone,
          email,
          birth_date,
          organization,
          division,
          discipline,
          image_key,
          created_at,
          updated_at
        FROM application_drafts
        WHERE draft_id = $1
      `,
      [draftId]
    );

    if (draftResult.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: "Draft not found",
      });
    }

    const draft = draftResult.rows[0];
    const consentResult = await pool.query(
      `
        SELECT
          privacy_consent,
          terms_consent,
          refund_consent,
          marketing_consent,
          photo_video_consent,
          consent_version,
          consented_at
        FROM application_consents
        WHERE draft_id = $1
          AND application_id IS NULL
        ORDER BY consented_at DESC
        LIMIT 1
      `,
      [draftId]
    );

    const fileResult = await pool.query(
      `
        SELECT
          original_filename,
          stored_filename,
          mime_type,
          file_size,
          uploaded_at
        FROM application_files
        WHERE draft_id = $1
        ORDER BY uploaded_at DESC
        LIMIT 1
      `,
      [draft.id]
    );

    return res.status(200).json({
      ok: true,
      draft: mapDraftRow(draft),
      consents: mapConsentRow(consentResult.rows[0]),
      file: fileResult.rows[0] || null,
    });
  } catch (error) {
    console.error("Failed to fetch application draft:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch application draft",
    });
  }
});

// 업로드 정보 저장
app.post("/files/upload", async function (req, res) {
  try {
    if (!ensureR2UploadReady()) {
      return res.status(500).json({
        ok: false,
        message: "R2 upload is not configured",
      });
    }

    if (!hasTrustedWriteOrigin(req)) {
      return res.status(403).json({
        ok: false,
        message: "Untrusted upload origin",
      });
    }

    await runSingleFileUpload(req, res);

    const draftId = normalizeText(req.body.draftId);
    const uploadedFile = req.file;

    if (!draftId || !uploadedFile) {
      return res.status(400).json({
        ok: false,
        message: "Missing draftId or uploaded file",
      });
    }

    const draftResult = await pool.query(
      `
        SELECT id
        FROM application_drafts
        WHERE draft_id = $1
      `,
      [draftId]
    );

    if (draftResult.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: "Draft not found",
      });
    }

    if (!isAllowedUpload(uploadedFile)) {
      return res.status(400).json({
        ok: false,
        message: "Unsupported file type",
      });
    }

    if (!matchesUploadSignature(uploadedFile)) {
      return res.status(400).json({
        ok: false,
        message: "Uploaded file signature does not match the declared type",
      });
    }

    if (!Number.isFinite(uploadedFile.size) || uploadedFile.size <= 0) {
      return res.status(400).json({
        ok: false,
        message: "Uploaded file is empty",
      });
    }

    const safeOriginalFilename = sanitizeOriginalFilename(uploadedFile.originalname);
    const storedFilename = buildUploadObjectKey(draftId, safeOriginalFilename);

    await r2Client.send(
      new PutObjectCommand({
        Bucket: r2BucketName,
        Key: storedFilename,
        Body: uploadedFile.buffer,
        ContentType: uploadedFile.mimetype,
        ContentDisposition: `attachment; filename="${safeOriginalFilename.replace(/"/g, "")}"`,
      })
    );

    const fileResult = await pool.query(
      `
        INSERT INTO application_files (
          application_id,
          draft_id,
          original_filename,
          stored_filename,
          mime_type,
          file_size,
          uploaded_at
        )
        VALUES (NULL, $1, $2, $3, $4, $5, NOW())
        RETURNING
          original_filename,
          stored_filename,
          mime_type,
          file_size,
          uploaded_at
      `,
      [
        draftResult.rows[0].id,
        safeOriginalFilename,
        storedFilename,
        uploadedFile.mimetype,
        uploadedFile.size,
      ]
    );

    return res.status(201).json({
      ok: true,
      file: fileResult.rows[0],
    });
  } catch (error) {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        ok: false,
        message: `File size must be ${Math.floor(maxUploadBytes / (1024 * 1024))}MB or smaller`,
      });
    }

    console.error("Failed to upload applicant file:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to upload applicant file",
    });
  }
});

app.post("/applications/lookup", async function (req, res) {
  try {
    await ensureLookupVerificationStoreReady();
    await purgeExpiredLookupVerifications();

    const name = normalizeText(req.body.name);
    const email = normalizeEmail(req.body.email);
    const verificationToken = normalizeText(req.body.verificationToken);

    if (!name || !email || !verificationToken) {
      return res.status(400).json({
        ok: false,
        message: "Missing name, email, or verificationToken",
      });
    }

    if (!hasValidEmail(email)) {
      return res.status(400).json({
        ok: false,
        message: "유효한 이메일 주소를 입력해 주세요.",
      });
    }

    const verificationResult = await pool.query(
      `
        SELECT id
        FROM application_lookup_email_verifications
        WHERE name = $1
          AND email = $2
          AND verification_token = $3
          AND status = 'VERIFIED'
          AND verified_at >= NOW() - ($4::text || ' minutes')::interval
        LIMIT 1
      `,
      [name, email, verificationToken, String(lookupVerificationSessionTtlMinutes)]
    );

    if (verificationResult.rowCount === 0) {
      return res.status(403).json({
        ok: false,
        message: "이메일 인증이 만료되었거나 유효하지 않습니다. 다시 인증해 주세요.",
      });
    }

    const result = await pool.query(
      `
        SELECT
          application_number,
          draft_id,
          order_id,
          payment_key,
          status,
          payment_status,
          name,
          phone,
          email,
          birth_date,
          organization,
          division,
          discipline,
          image_key,
          submitted_at,
          updated_at
        FROM applications
        WHERE name = $1
          AND LOWER(email) = $2
        ORDER BY submitted_at DESC NULLS LAST, updated_at DESC
        LIMIT 10
      `,
      [name, email]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: "입력한 정보와 일치하는 신청 내역을 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      ok: true,
      application: mapApplicationRow(result.rows[0]),
      applications: result.rows.map(mapApplicationRow),
    });
  } catch (error) {
    console.error("Failed to lookup application:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to lookup application",
    });
  }
});

app.post("/applications/lookup-verification/send", async function (req, res) {
  try {
    await ensureLookupVerificationStoreReady();
    await purgeExpiredLookupVerifications();

    const name = normalizeText(req.body.name);
    const email = normalizeEmail(req.body.email);

    if (!name || !email) {
      return res.status(400).json({
        ok: false,
        message: "Missing name or email",
      });
    }

    if (!hasValidEmail(email)) {
      return res.status(400).json({
        ok: false,
        message: "유효한 이메일 주소를 입력해 주세요.",
      });
    }

    const applicationResult = await pool.query(
      `
        SELECT application_number
        FROM applications
        WHERE name = $1
          AND LOWER(email) = $2
        ORDER BY submitted_at DESC NULLS LAST, updated_at DESC
        LIMIT 1
      `,
      [name, email]
    );

    if (applicationResult.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: "데이터베이스에 일치하는 성함과 이메일이 없습니다.",
      });
    }

    const recentVerificationResult = await pool.query(
      `
        SELECT created_at
        FROM application_lookup_email_verifications
        WHERE name = $1
          AND email = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [name, email]
    );

    if (recentVerificationResult.rowCount > 0) {
      const elapsedMs = Date.now() - new Date(recentVerificationResult.rows[0].created_at).getTime();
      const cooldownMs = lookupVerificationSendCooldownSeconds * 1000;

      if (elapsedMs < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
        return res.status(429).json({
          ok: false,
          message: `${remainingSeconds}초 후에 다시 인증번호를 요청해 주세요.`,
        });
      }
    }

    const code = generateLookupVerificationCode();
    const sendResult = await sendLookupVerificationEmail({ email, name, code });

    await pool.query(
      `
        INSERT INTO application_lookup_email_verifications (
          name,
          email,
          code_hash,
          expires_at
        )
        VALUES (
          $1,
          $2,
          $3,
          NOW() + ($4::text || ' minutes')::interval
        )
      `,
      [name, email, hashLookupVerificationCode(code), String(lookupVerificationCodeTtlMinutes)]
    );

    return res.status(200).json({
      ok: true,
      message: "이메일 인증번호를 전송했습니다.",
      expiresInSeconds: lookupVerificationCodeTtlMinutes * 60,
      ...(sendResult.deliveryMethod === "console" ? { devVerificationCode: code } : {}),
    });
  } catch (error) {
    console.error("Failed to send lookup verification code:", error);
    return res.status(500).json({
      ok: false,
      message: "이메일 인증번호를 전송하지 못했습니다.",
    });
  }
});

app.post("/applications/lookup-verification/verify", async function (req, res) {
  let client = null;

  try {
    client = await pool.connect();
    await ensureLookupVerificationStoreReady();
    await purgeExpiredLookupVerifications();

    const name = normalizeText(req.body.name);
    const email = normalizeEmail(req.body.email);
    const code = normalizeText(req.body.code);

    if (!name || !email || !code) {
      return res.status(400).json({
        ok: false,
        message: "Missing name, email, or code",
      });
    }

    if (!hasValidEmail(email)) {
      return res.status(400).json({
        ok: false,
        message: "유효한 이메일 주소를 입력해 주세요.",
      });
    }

    if (!isValidLookupVerificationCode(code)) {
      return res.status(400).json({
        ok: false,
        message: "인증번호는 6자리 숫자여야 합니다.",
      });
    }

    await client.query("BEGIN");

    const verificationResult = await client.query(
      `
        SELECT
          id,
          code_hash,
          attempt_count,
          expires_at
        FROM application_lookup_email_verifications
        WHERE name = $1
          AND email = $2
          AND status = 'PENDING'
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [name, email]
    );

    if (verificationResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        message: "먼저 인증번호를 전송해 주세요.",
      });
    }

    const verification = verificationResult.rows[0];

    if (new Date(verification.expires_at).getTime() < Date.now()) {
      await client.query(
        `
          UPDATE application_lookup_email_verifications
          SET
            status = 'EXPIRED',
            updated_at = NOW()
          WHERE id = $1
        `,
        [verification.id]
      );

      await client.query("COMMIT");

      return res.status(410).json({
        ok: false,
        message: "인증번호가 만료되었습니다. 다시 요청해 주세요.",
      });
    }

    if (verification.attempt_count >= lookupVerificationMaxAttempts) {
      await client.query(
        `
          UPDATE application_lookup_email_verifications
          SET
            status = 'FAILED',
            updated_at = NOW()
          WHERE id = $1
        `,
        [verification.id]
      );

      await client.query("COMMIT");

      return res.status(429).json({
        ok: false,
        message: "인증 시도 횟수를 초과했습니다. 인증번호를 다시 요청해 주세요.",
      });
    }

    if (verification.code_hash !== hashLookupVerificationCode(code)) {
      const nextAttemptCount = verification.attempt_count + 1;

      await client.query(
        `
          UPDATE application_lookup_email_verifications
          SET
            attempt_count = $2,
            status = CASE WHEN $2 >= $3 THEN 'FAILED' ELSE status END,
            updated_at = NOW()
          WHERE id = $1
        `,
        [verification.id, nextAttemptCount, lookupVerificationMaxAttempts]
      );

      await client.query("COMMIT");

      return res.status(400).json({
        ok: false,
        message:
          nextAttemptCount >= lookupVerificationMaxAttempts
            ? "인증 시도 횟수를 초과했습니다. 인증번호를 다시 요청해 주세요."
            : "인증번호가 올바르지 않습니다.",
      });
    }

    const verificationToken = generateLookupVerificationToken();

    await client.query(
      `
        UPDATE application_lookup_email_verifications
        SET
          status = 'VERIFIED',
          verification_token = $2,
          verified_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `,
      [verification.id, verificationToken]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      message: "이메일 인증이 완료되었습니다.",
      verificationToken,
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }
    console.error("Failed to verify lookup verification code:", error);
    return res.status(500).json({
      ok: false,
      message: "인증번호 확인에 실패했습니다.",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// 결제 이후 최종 결제 테이블에 데이터 추가
app.post("/applications/complete", async function (req, res) {
  const draftId = normalizeText(req.body.draftId);
  const orderId = normalizeText(req.body.orderId);

  if (!draftId || !orderId) {
    return res.status(400).json({
      ok: false,
      message: "Missing draftId or orderId",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existingApplicationResult = await client.query(
      `
        SELECT
          application_number,
          draft_id,
          order_id,
          payment_key,
          status,
          payment_status,
          name,
          phone,
          email,
          birth_date,
          organization,
          division,
          discipline,
          image_key,
          submitted_at,
          updated_at
        FROM applications
        WHERE draft_id = $1
           OR order_id = $2
        LIMIT 1
      `,
      [draftId, orderId]
    );

    if (existingApplicationResult.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(200).json({
        ok: true,
        idempotent: true,
        application: mapApplicationRow(existingApplicationResult.rows[0]),
      });
    }

    const draftResult = await client.query(
      `
        SELECT
          id,
          draft_id,
          order_id,
          payment_method,
          name,
          phone,
          email,
          birth_date,
          organization,
          division,
          discipline,
          image_key
        FROM application_drafts
        WHERE draft_id = $1
        FOR UPDATE
      `,
      [draftId]
    );

    if (draftResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        message: "Draft not found",
      });
    }

    const paymentResult = await client.query(
      `
        SELECT
          payment_key,
          status
        FROM payments
        WHERE order_id = $1
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [orderId]
    );

    if (paymentResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        message: "Payment not found for order",
      });
    }

    const applicationNumber = generateApplicationNumber();
    const draft = draftResult.rows[0];
    const payment = paymentResult.rows[0];

    const applicationInsertResult = await client.query(
      `
        INSERT INTO applications (
          application_number,
          draft_id,
          order_id,
          payment_key,
          status,
          payment_status,
          name,
          phone,
          email,
          birth_date,
          organization,
          division,
          discipline,
          image_key,
          submitted_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, 'SUBMITTED', $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
        RETURNING
          id,
          application_number,
          draft_id,
          order_id,
          payment_key,
          status,
          payment_status,
          name,
          phone,
          email,
          birth_date,
          organization,
          division,
          discipline,
          image_key,
          submitted_at,
          updated_at
      `,
      [
        applicationNumber,
        draft.draft_id,
        orderId,
        payment.payment_key,
        payment.status,
        draft.name,
        draft.phone,
        draft.email,
        draft.birth_date,
        draft.organization,
        draft.division,
        draft.discipline,
        draft.image_key,
      ]
    );

    const application = applicationInsertResult.rows[0];

    await client.query(
      `
        UPDATE application_drafts
        SET
          order_id = $2,
          status = 'COMPLETED',
          updated_at = NOW()
        WHERE draft_id = $1
      `,
      [draftId, orderId]
    );

    await client.query(
      `
        UPDATE application_consents
        SET application_id = $2
        WHERE draft_id = $1
          AND application_id IS NULL
      `,
      [draftId, application.id]
    );

    await client.query(
      `
        UPDATE application_files
        SET application_id = $2
        WHERE draft_id = $1
          AND application_id IS NULL
      `,
      [draft.id, application.id]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      ok: true,
      application: mapApplicationRow(application),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to complete application:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to complete application",
    });
  } finally {
    client.release();
  }
});

// 최종 결제 테이블 내 데이터 읽어오기
app.get("/applications/:applicationNumber", async function (req, res) {
  try {
    const { applicationNumber } = req.params;

    const result = await pool.query(
      `
        SELECT
          application_number,
          draft_id,
          order_id,
          payment_key,
          status,
          payment_status,
          name,
          phone,
          email,
          birth_date,
          organization,
          division,
          discipline,
          image_key,
          submitted_at,
          updated_at
        FROM applications
        WHERE application_number = $1
      `,
      [applicationNumber]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: "Application not found",
      });
    }

    return res.status(200).json({
      ok: true,
      application: mapApplicationRow(result.rows[0]),
    });
  } catch (error) {
    console.error("Failed to fetch application:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch application",
    });
  }
});

// 결제 완료 후 등록 완료 페이지
app.get("/applications/by-order/:orderId", async function (req, res) {
  try {
    const { orderId } = req.params;

    const result = await pool.query(
      `
        SELECT
          application_number,
          draft_id,
          order_id,
          payment_key,
          status,
          payment_status,
          name,
          phone,
          email,
          birth_date,
          organization,
          division,
          discipline,
          image_key,
          submitted_at,
          updated_at
        FROM applications
        WHERE order_id = $1
      `,
      [orderId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: "Application not found for order",
      });
    }

    return res.status(200).json({
      ok: true,
      application: mapApplicationRow(result.rows[0]),
    });
  } catch (error) {
    console.error("Failed to fetch application by order:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch application by order",
    });
  }
});

app.post("/orders", async function (req,res) {
  try{
    const{
      draftId = null,
      orderName,
      amount,
      customerName = null,
      customerEmail = null,
    } = req.body;

    if(!orderName || typeof orderName !== "string" || !orderName.trim()){
      return res.status(400).json({
        ok: false,
        message: "Invalid orderName",
      });
    }

    const normalizedAmount = normalizeAmount(amount);

    if(normalizedAmount === null){
      return res.status(400).json({
        ok: false,
        message: "Invalid amount",
      });
    }

    const safeOrderName = orderName.trim();
    const orderId = generateOrderId();

    const insertQuery = `
      INSERT INTO orders (
        order_id,
        order_name,
        amount,
        customer_name,
        customer_email,
        status
      )
      VALUES ($1, $2, $3, $4, $5, 'READY')
      RETURNING
        order_id,
        order_name,
        amount,
        customer_name,
        customer_email,
        status,
        created_at  
    `;

    const values = [
      orderId,
      safeOrderName,
      normalizedAmount,
      customerName,
      customerEmail
    ];

    const result = await pool.query(insertQuery, values);
    const order = result.rows[0];

    if (draftId) {
      await pool.query(
        `
          UPDATE application_drafts
          SET
            order_id = $2,
            updated_at = NOW()
          WHERE draft_id = $1
        `,
        [draftId, order.order_id]
      );
    }

    return res.status(201).json({
      ok:true,
      order:{
        orderId: order.order_id,
        orderName: order.order_name,
        amount: order.amount,
        customerName: order.customer_name,
        customerEmail: order.customer_email,
        status: order.status,
        createdAt: order.created_at,
      },
    });
  } catch (error) {
    console.error("Failed to create order:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to create order",
    });
  }  
});

startServer();
