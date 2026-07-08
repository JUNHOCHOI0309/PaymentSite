require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
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
const refundPolicy = require("./src/data/refundPolicy.json");
const stageServiceConfig = require("./src/data/stageServiceConfig.json");
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
const allowedDocumentUploadMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "image/jpeg",
  "image/png",
]);
const allowedDocumentUploadExtensions = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".jpg",
  ".jpeg",
  ".png",
]);
const allowedAudioUploadMimeTypes = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/x-mpeg-3",
  "audio/mpg",
]);
const allowedAudioUploadExtensions = new Set([".mp3"]);
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
const refundPolicyTimeZone = normalizeText(refundPolicy.timeZone) || "Asia/Seoul";
const refundPolicyEventDateTime =
  normalizeText(refundPolicy.eventDateTime) ||
  normalizeText(refundPolicy.eventDate)
    ? new Date(normalizeText(refundPolicy.eventDateTime) || `${refundPolicy.eventDate}T00:00:00+09:00`)
    : null;
const refundPolicyPersonalCancellationRules = Array.isArray(
  refundPolicy.personalCancellationRules
)
  ? refundPolicy.personalCancellationRules
  : [];
const stageServiceDisciplineOptions = Array.isArray(stageServiceConfig.disciplineOptions)
  ? stageServiceConfig.disciplineOptions
  : [];
const stageServiceDisciplineSet = new Set(stageServiceDisciplineOptions);
const stageServiceDefinitions = stageServiceConfig.services || {};
const stageVideoTypeDefinitions = Array.isArray(stageServiceDefinitions["stage-video"]?.videoTypes)
  ? stageServiceDefinitions["stage-video"].videoTypes
  : [];
const stageVideoTypeMap = new Map(
  stageVideoTypeDefinitions.map((definition) => [definition.value, definition])
);
const stageVideoAdditionalDisciplineSeparator = "::";
const stageVideoAdditionalOptionDefinitions = stageVideoTypeDefinitions.flatMap((definition) =>
  stageServiceDisciplineOptions.map((discipline) => ({
    value: `${definition.value}${stageVideoAdditionalDisciplineSeparator}${discipline}`,
    typeValue: definition.value,
    discipline,
    price: Number(definition.price || 0),
  }))
);
const stageVideoAdditionalOptionMap = new Map(
  stageVideoAdditionalOptionDefinitions.map((definition) => [definition.value, definition])
);
const hairOptionDefinitions = Array.isArray(stageServiceDefinitions["hair-makeup"]?.hairOptions)
  ? stageServiceDefinitions["hair-makeup"].hairOptions
  : [];
const hairOptionMap = new Map(
  hairOptionDefinitions.map((definition) => [definition.value, definition])
);
const hairOptionalOptionDefinitions = Array.isArray(stageServiceDefinitions["hair-makeup"]?.optionalOptions)
  ? stageServiceDefinitions["hair-makeup"].optionalOptions
  : [];
const hairOptionalOptionMap = new Map(
  hairOptionalOptionDefinitions.map((definition) => [definition.value, definition])
);

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
app.use(express.urlencoded({ extended: false }));

//DB Pool 생성
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL in .env");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: false, //Cloud DB for PostgreSQL ssl 설정에 따라 변경
});

const paymentProviders = Object.freeze({
  TOSS: "toss",
  KCP: "kcp",
});
const validPaymentProviders = new Set(Object.values(paymentProviders));
const defaultPaymentProvider =
  normalizePaymentProvider(process.env.DEFAULT_PAYMENT_PROVIDER) || paymentProviders.KCP;
const kcpEnabled = process.env.KCP_ENABLED !== "false";
const kcpMaxAmount = Math.max(0, Number(process.env.KCP_MAX_AMOUNT || 0));
const kcpMode = normalizeText(process.env.KCP_MODE) === "production" ? "production" : "test";
const kcpTradeRegisterUrl =
  kcpMode === "production"
    ? "https://spl.kcp.co.kr/std/brpay/treg"
    : "https://stg-spl.kcp.co.kr/std/brpay/treg";
const kcpPaymentApproveUrl =
  kcpMode === "production"
    ? "https://spl.kcp.co.kr/gw/enc/v1/payment"
    : "https://stg-spl.kcp.co.kr/gw/enc/v1/payment";
const kcpSiteCode = normalizeText(process.env.KCP_SITE_CD) || "T0000";
const publicBaseUrl = normalizeBaseUrl(process.env.PUBLIC_BASE_URL);
const publicApiBaseUrl = normalizeBaseUrl(process.env.PUBLIC_API_BASE_URL);

async function ensurePaymentProviderColumnsReady() {
  async function hasColumn(tableName, columnName) {
    const result = await pool.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
        LIMIT 1
      `,
      [tableName, columnName]
    );

    return result.rowCount > 0;
  }

  if (!(await hasColumn("orders", "payment_provider"))) {
    await pool.query(`
      ALTER TABLE orders
      ADD COLUMN payment_provider VARCHAR(20)
    `);
    await pool.query(`
      UPDATE orders
      SET payment_provider = 'toss'
      WHERE payment_provider IS NULL
    `);
    await pool.query(`
      ALTER TABLE orders
      ALTER COLUMN payment_provider SET DEFAULT 'kcp'
    `);
    await pool.query(`
      ALTER TABLE orders
      ALTER COLUMN payment_provider SET NOT NULL
    `);
  }

  if (!(await hasColumn("orders", "payment_method"))) {
    await pool.query(`
      ALTER TABLE orders
      ADD COLUMN payment_method VARCHAR(40)
    `);
  }

  if (!(await hasColumn("payments", "payment_provider"))) {
    await pool.query(`
      ALTER TABLE payments
      ADD COLUMN payment_provider VARCHAR(20)
    `);
    await pool.query(`
      UPDATE payments
      SET payment_provider = 'toss'
      WHERE payment_provider IS NULL
    `);
    await pool.query(`
      ALTER TABLE payments
      ALTER COLUMN payment_provider SET DEFAULT 'kcp'
    `);
    await pool.query(`
      ALTER TABLE payments
      ALTER COLUMN payment_provider SET NOT NULL
    `);
  }

  if (!(await hasColumn("payments", "provider_payment_id"))) {
    await pool.query(`
      ALTER TABLE payments
      ADD COLUMN provider_payment_id VARCHAR(120)
    `);
  }

  await pool.query(`
    UPDATE payments
    SET provider_payment_id = payment_key
    WHERE provider_payment_id IS NULL
      AND payment_key IS NOT NULL
  `);

  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_provider_payment_id
      ON payments (payment_provider, provider_payment_id)
    `);
  } catch (error) {
    if (error.code !== "42501") {
      throw error;
    }
  }

  const webhookTableResult = await pool.query(
    "SELECT to_regclass('public.payment_webhook_events') AS table_name"
  );

  if (webhookTableResult.rows[0]?.table_name) {
    if (!(await hasColumn("payment_webhook_events", "payment_provider"))) {
      await pool.query(`
        ALTER TABLE payment_webhook_events
        ADD COLUMN payment_provider VARCHAR(20)
      `);
      await pool.query(`
        UPDATE payment_webhook_events
        SET payment_provider = 'toss'
        WHERE payment_provider IS NULL
      `);
      await pool.query(`
        ALTER TABLE payment_webhook_events
        ALTER COLUMN payment_provider SET DEFAULT 'kcp'
      `);
      await pool.query(`
        ALTER TABLE payment_webhook_events
        ALTER COLUMN payment_provider SET NOT NULL
      `);
    }
  }
}

function normalizePaymentProvider(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return validPaymentProviders.has(normalized) ? normalized : null;
}

function resolvePaymentProvider({ requestedProvider, amount }) {
  const hasExplicitProvider =
    typeof requestedProvider === "string" && requestedProvider.trim().length > 0;
  const normalizedRequestedProvider = normalizePaymentProvider(requestedProvider);

  if (hasExplicitProvider && !normalizedRequestedProvider) {
    return {
      ok: false,
      status: 400,
      message: "Invalid paymentProvider",
    };
  }

  let provider = normalizedRequestedProvider || defaultPaymentProvider;

  if (provider === paymentProviders.KCP) {
    if (!kcpEnabled) {
      if (hasExplicitProvider) {
        return {
          ok: false,
          status: 503,
          message: "KCP payment is disabled",
        };
      }

      provider = paymentProviders.TOSS;
    } else if (kcpMaxAmount > 0 && amount > kcpMaxAmount) {
      return {
        ok: false,
        status: 403,
        message: "KCP payment amount exceeds the configured safety limit",
      };
    }
  }

  return {
    ok: true,
    provider,
  };
}

function normalizeBaseUrl(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.replace(/\/+$/, "") : null;
}

function readTextFromEnvOrFile({ value, filePath, preserveLineBreaks }) {
  let source = normalizeText(value);

  if (!source && normalizeText(filePath)) {
    source = fs.readFileSync(path.resolve(filePath), "utf8");
  }

  if (!source) {
    return null;
  }

  const withLineBreaks = source.replace(/\\n/g, "\n");
  return preserveLineBreaks
    ? withLineBreaks
    : withLineBreaks.replace(/\r?\n/g, "").trim();
}

function getKcpCertInfo() {
  return readTextFromEnvOrFile({
    value: process.env.KCP_CERT_INFO,
    filePath: process.env.KCP_CERT_INFO_PATH,
    preserveLineBreaks: false,
  });
}

function getKcpPrivateKey() {
  return readTextFromEnvOrFile({
    value: process.env.KCP_PRIVATE_KEY,
    filePath: process.env.KCP_PRIVATE_KEY_PATH,
    preserveLineBreaks: true,
  });
}

function assertKcpConfigured() {
  if (!kcpEnabled) {
    const error = new Error("KCP payment is disabled");
    error.statusCode = 503;
    throw error;
  }

  const certInfo = getKcpCertInfo();
  const privateKey = getKcpPrivateKey();

  if (!kcpSiteCode || !certInfo || !privateKey) {
    const error = new Error("KCP payment is not configured");
    error.statusCode = 503;
    throw error;
  }

  const privateKeyPassphrase = normalizeText(process.env.KCP_PRIVATE_KEY_PASSPHRASE);

  if (privateKey.includes("BEGIN ENCRYPTED PRIVATE KEY") && !privateKeyPassphrase) {
    const error = new Error("KCP private key passphrase is required");
    error.statusCode = 503;
    throw error;
  }

  return {
    certInfo,
    privateKey,
    privateKeyPassphrase,
  };
}

function createKcpSignature(targetData, privateKey, passphrase) {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(targetData, "utf8");
  signer.end();
  return signer.sign(passphrase ? { key: privateKey, passphrase } : privateKey, "base64");
}

function mapClientPaymentMethodToKcp(value) {
  switch (normalizeText(value)) {
    case "CARD":
      return {
        payMethod: "CARD",
        payType: "PACA",
        label: "카드",
      };
    case "TRANSFER":
    case "BANK":
      return {
        payMethod: "BANK",
        payType: "PABK",
        label: "계좌이체",
      };
    case "MOBILE_PHONE":
    case "MOBX":
      return {
        payMethod: "MOBX",
        payType: "PAMC",
        label: "휴대폰",
      };
    default:
      return null;
  }
}

function getRequestPublicOrigin(req) {
  return (
    publicBaseUrl ||
    normalizeBaseUrl(req.headers.origin) ||
    `${req.protocol}://${req.get("host")}`
  );
}

function getRequestPublicApiBaseUrl(req) {
  return publicApiBaseUrl || `${getRequestPublicOrigin(req)}/api`;
}

function buildKcpRedirectUrl(req, pathName, params = {}) {
  const url = new URL(pathName, `${getRequestPublicOrigin(req)}/`);

  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

function buildKcpReturnUrl(req, params = {}) {
  const url = new URL("kcp/return", `${getRequestPublicApiBaseUrl(req)}/`);

  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

function resolveKcpRegType(userAgent) {
  return /Mobile|Android|iPhone|iPad|iPod/i.test(String(userAgent || ""))
    ? "mobile"
    : "web";
}

async function postKcpJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = {};

  try {
    json = text ? JSON.parse(text) : {};
  } catch (_error) {
    json = {
      res_cd: "KCP_RESPONSE_PARSE_FAILED",
      res_msg: text,
    };
  }

  return {
    response,
    json,
  };
}

function getKcpResponseCode(payload) {
  return payload?.res_cd || payload?.Code || payload?.code || null;
}

function getKcpResponseMessage(payload) {
  return payload?.res_msg || payload?.Message || payload?.message || null;
}

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

function isVirtualAccountPaymentMethod(value) {
  return ["VIRTUAL_ACCOUNT", "가상계좌"].includes(String(value || "").trim());
}

function getDatePartsInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const partMap = formatter
    .formatToParts(date)
    .reduce((accumulator, part) => {
      accumulator[part.type] = part.value;
      return accumulator;
    }, {});

  return {
    year: partMap.year,
    month: partMap.month,
    day: partMap.day,
    isoDate: `${partMap.year}-${partMap.month}-${partMap.day}`,
  };
}

function parseIsoDateToUtcMidnight(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`);
}

function diffCalendarDaysInTimeZone(fromDate, toDate, timeZone) {
  const fromIsoDate = getDatePartsInTimeZone(fromDate, timeZone).isoDate;
  const toIsoDate = getDatePartsInTimeZone(toDate, timeZone).isoDate;
  const differenceMs =
    parseIsoDateToUtcMidnight(toIsoDate).getTime() -
    parseIsoDateToUtcMidnight(fromIsoDate).getTime();

  return Math.round(differenceMs / (24 * 60 * 60 * 1000));
}

function calculateRefundQuote({
  applicationStatus,
  paymentStatus,
  amount,
  paymentCompletedAt,
  paymentMethod,
  requestedAt = new Date(),
}) {
  const safeAmount = Number(amount || 0);

  if (!refundPolicyEventDateTime || Number.isNaN(refundPolicyEventDateTime.getTime())) {
    return {
      policyVersion: refundPolicy.version,
      policyName: refundPolicy.name,
      eventDate: refundPolicy.eventDate,
      requestedAt: requestedAt.toISOString(),
      timeZone: refundPolicyTimeZone,
      canAutoRefund: false,
      isRefundable: false,
      requiresManualReview: true,
      reasonCode: "POLICY_CONFIGURATION_INVALID",
      message: "환불 정책 기준일이 설정되지 않았습니다.",
      refundPercent: null,
      refundAmount: null,
      nonRefundableAmount: null,
    };
  }

  if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
    return {
      policyVersion: refundPolicy.version,
      policyName: refundPolicy.name,
      eventDate: refundPolicy.eventDate,
      requestedAt: requestedAt.toISOString(),
      timeZone: refundPolicyTimeZone,
      canAutoRefund: false,
      isRefundable: false,
      requiresManualReview: true,
      reasonCode: "PAYMENT_AMOUNT_INVALID",
      message: "환불 계산에 필요한 결제 금액을 확인할 수 없습니다.",
      refundPercent: null,
      refundAmount: null,
      nonRefundableAmount: null,
    };
  }

  const normalizedPaymentStatus = normalizeText(paymentStatus);
  const normalizedApplicationStatus = normalizeText(applicationStatus);

  if (normalizedPaymentStatus === "CANCELED" || normalizedPaymentStatus === "PARTIAL_CANCELED") {
    return {
      policyVersion: refundPolicy.version,
      policyName: refundPolicy.name,
      eventDate: refundPolicy.eventDate,
      requestedAt: requestedAt.toISOString(),
      timeZone: refundPolicyTimeZone,
      canAutoRefund: false,
      isRefundable: false,
      requiresManualReview: false,
      reasonCode: "ALREADY_REFUNDED",
      message: "이미 취소 또는 환불 처리된 결제입니다.",
      refundPercent: 0,
      refundAmount: 0,
      nonRefundableAmount: safeAmount,
    };
  }

  if (normalizedPaymentStatus !== "DONE" && normalizedPaymentStatus !== "PAID") {
    return {
      policyVersion: refundPolicy.version,
      policyName: refundPolicy.name,
      eventDate: refundPolicy.eventDate,
      requestedAt: requestedAt.toISOString(),
      timeZone: refundPolicyTimeZone,
      canAutoRefund: false,
      isRefundable: false,
      requiresManualReview: true,
      reasonCode: "PAYMENT_NOT_COMPLETED",
      message: "결제가 완료된 신청 건만 환불 계산이 가능합니다.",
      refundPercent: null,
      refundAmount: null,
      nonRefundableAmount: safeAmount,
    };
  }

  if (normalizedApplicationStatus && normalizedApplicationStatus !== "SUBMITTED") {
    return {
      policyVersion: refundPolicy.version,
      policyName: refundPolicy.name,
      eventDate: refundPolicy.eventDate,
      requestedAt: requestedAt.toISOString(),
      timeZone: refundPolicyTimeZone,
      canAutoRefund: false,
      isRefundable: false,
      requiresManualReview: true,
      reasonCode: "APPLICATION_STATUS_NOT_REFUNDABLE",
      message: "현재 신청 상태에서는 자동 환불을 처리할 수 없습니다.",
      refundPercent: null,
      refundAmount: null,
      nonRefundableAmount: safeAmount,
    };
  }

  const eventDate = new Date(refundPolicyEventDateTime);
  const daysBeforeEvent = diffCalendarDaysInTimeZone(
    requestedAt,
    eventDate,
    refundPolicyTimeZone
  );

  if (daysBeforeEvent < 0) {
    return {
      policyVersion: refundPolicy.version,
      policyName: refundPolicy.name,
      eventDate: refundPolicy.eventDate,
      requestedAt: requestedAt.toISOString(),
      timeZone: refundPolicyTimeZone,
      daysBeforeEvent,
      canAutoRefund: false,
      isRefundable: false,
      requiresManualReview: false,
      reasonCode: "EVENT_ALREADY_STARTED",
      message: "행사 시작 이후에는 자동 환불이 불가합니다.",
      refundPercent: 0,
      refundAmount: 0,
      nonRefundableAmount: safeAmount,
    };
  }

  const effectivePaymentCompletedAt = paymentCompletedAt ? new Date(paymentCompletedAt) : null;
  const paymentCompletedWithinDays = effectivePaymentCompletedAt
    ? (requestedAt.getTime() - effectivePaymentCompletedAt.getTime()) /
      (24 * 60 * 60 * 1000)
    : null;

  const matchedRule = refundPolicyPersonalCancellationRules.find((rule) => {
    if (
      typeof rule.minDaysBeforeEvent === "number" &&
      daysBeforeEvent < rule.minDaysBeforeEvent
    ) {
      return false;
    }

    if (
      typeof rule.maxDaysBeforeEvent === "number" &&
      daysBeforeEvent > rule.maxDaysBeforeEvent
    ) {
      return false;
    }

    if (typeof rule.paymentCompletedWithinDays === "number") {
      if (paymentCompletedWithinDays == null) {
        return false;
      }

      if (paymentCompletedWithinDays > rule.paymentCompletedWithinDays) {
        return false;
      }
    }

    return true;
  });

  if (!matchedRule) {
    return {
      policyVersion: refundPolicy.version,
      policyName: refundPolicy.name,
      eventDate: refundPolicy.eventDate,
      requestedAt: requestedAt.toISOString(),
      timeZone: refundPolicyTimeZone,
      daysBeforeEvent,
      paymentCompletedAt: effectivePaymentCompletedAt?.toISOString() || null,
      paymentCompletedWithinDays:
        paymentCompletedWithinDays == null
          ? null
          : Number(paymentCompletedWithinDays.toFixed(2)),
      canAutoRefund: false,
      isRefundable: false,
      requiresManualReview: true,
      reasonCode: "POLICY_GAP",
      message:
        "현재 환불 규정으로는 이 신청 건의 자동 환불 구간을 확정할 수 없습니다.",
      refundPercent: null,
      refundAmount: null,
      nonRefundableAmount: safeAmount,
    };
  }

  const refundPercent = Number(matchedRule.refundPercent || 0);
  const refundAmount = Math.floor((safeAmount * refundPercent) / 100);

  if (refundPercent > 0 && isVirtualAccountPaymentMethod(paymentMethod)) {
    return {
      policyVersion: refundPolicy.version,
      policyName: refundPolicy.name,
      eventDate: refundPolicy.eventDate,
      requestedAt: requestedAt.toISOString(),
      timeZone: refundPolicyTimeZone,
      daysBeforeEvent,
      paymentCompletedAt: effectivePaymentCompletedAt?.toISOString() || null,
      paymentCompletedWithinDays:
        paymentCompletedWithinDays == null
          ? null
          : Number(paymentCompletedWithinDays.toFixed(2)),
      matchedRuleId: matchedRule.id,
      matchedRuleLabel: matchedRule.label,
      canAutoRefund: false,
      isRefundable: true,
      requiresManualReview: true,
      reasonCode: "REFUND_ACCOUNT_REQUIRED",
      message:
        "가상계좌 결제는 환불 계좌 정보가 필요해 현재 자동 환불 요청을 지원하지 않습니다.",
      refundPercent,
      refundAmount,
      nonRefundableAmount: Math.max(0, safeAmount - refundAmount),
    };
  }

  return {
    policyVersion: refundPolicy.version,
    policyName: refundPolicy.name,
    eventDate: refundPolicy.eventDate,
    requestedAt: requestedAt.toISOString(),
    timeZone: refundPolicyTimeZone,
    daysBeforeEvent,
    paymentCompletedAt: effectivePaymentCompletedAt?.toISOString() || null,
    paymentCompletedWithinDays:
      paymentCompletedWithinDays == null
        ? null
        : Number(paymentCompletedWithinDays.toFixed(2)),
    matchedRuleId: matchedRule.id,
    matchedRuleLabel: matchedRule.label,
    canAutoRefund: refundPercent > 0,
    isRefundable: refundPercent > 0,
    requiresManualReview: false,
    reasonCode: refundPercent > 0 ? "REFUNDABLE" : "NON_REFUNDABLE_PERIOD",
    message:
      refundPercent > 0
        ? `${matchedRule.label} 기준이 적용됩니다.`
        : "현재 환불 불가 구간입니다.",
    refundPercent,
    refundAmount,
    nonRefundableAmount: Math.max(0, safeAmount - refundAmount),
  };
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

async function hasVerifiedLookupSession({ name, email, verificationToken }) {
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

  return verificationResult.rowCount > 0;
}

async function findLookupOwnedApplication({ name, email, applicationNumber }) {
  const result = await pool.query(
    `
      SELECT
        applications.application_number,
        applications.draft_id,
        applications.order_id,
        applications.payment_key,
        applications.status,
        applications.payment_status,
        applications.name,
        applications.phone,
        applications.email,
        applications.birth_date,
        applications.organization,
        applications.weight_class,
        applications.division,
        applications.discipline,
        applications.image_key,
        applications.submitted_at,
        applications.updated_at,
        orders.amount AS order_amount,
        orders.payment_provider AS order_payment_provider,
        latest_payment.payment_provider AS latest_payment_provider,
        latest_payment.status AS latest_payment_status,
        latest_payment.method AS latest_payment_method,
        latest_payment.total_amount,
        latest_payment.approved_at,
        latest_payment.created_at AS payment_created_at
      FROM applications
      LEFT JOIN orders
        ON orders.order_id = applications.order_id
      LEFT JOIN LATERAL (
        SELECT
          payment_provider,
          status,
          method,
          total_amount,
          approved_at,
          created_at
        FROM payments
        WHERE order_id = applications.order_id
        ORDER BY updated_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      ) AS latest_payment ON TRUE
      WHERE applications.application_number = $1
        AND applications.name = $2
        AND LOWER(applications.email) = $3
      LIMIT 1
    `,
    [applicationNumber, name, email]
  );

  return result.rows[0] || null;
}

function mapRefundRequestRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    applicationNumber: row.application_number,
    draftId: row.draft_id,
    orderId: row.order_id,
    paymentKey: row.payment_key,
    requestReason: row.request_reason,
    requestStatus: row.request_status,
    refundPercent: row.refund_percent,
    refundAmount: row.refund_amount,
    originalAmount: row.original_amount,
    policyVersion: row.policy_version,
    policyRuleId: row.policy_rule_id,
    policyRuleLabel: row.policy_rule_label,
    requestedByName: row.requested_by_name,
    requestedByEmail: row.requested_by_email,
    providerIdempotencyKey: row.provider_idempotency_key,
    providerStatusCode: row.provider_status_code,
    providerErrorCode: row.provider_error_code,
    providerErrorMessage: row.provider_error_message,
    processedAt: row.processed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function generateRefundIdempotencyKey() {
  return crypto.randomUUID();
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

function normalizeUploadKind(value) {
  return normalizeText(value) === "audio" ? "audio" : "document";
}

function getAllowedUploadRules(fileKind) {
  return fileKind === "audio"
    ? {
        mimeTypes: allowedAudioUploadMimeTypes,
        extensions: allowedAudioUploadExtensions,
      }
    : {
        mimeTypes: allowedDocumentUploadMimeTypes,
        extensions: allowedDocumentUploadExtensions,
      };
}

function isAudioUploadExtension(extension) {
  return extension === ".mp3";
}

function isAudioUploadRecord(record) {
  const extension = getUploadExtension(record?.original_filename);
  return isAudioUploadExtension(extension);
}

function splitApplicationFiles(rows) {
  const files = {
    documentFile: null,
    audioFile: null,
  };

  for (const row of rows || []) {
    if (isAudioUploadRecord(row)) {
      if (!files.audioFile) {
        files.audioFile = row;
      }
      continue;
    }

    if (!files.documentFile) {
      files.documentFile = row;
    }
  }

  return files;
}

function isAllowedUpload(file, fileKind) {
  const extension = getUploadExtension(file.originalname);
  const rules = getAllowedUploadRules(fileKind);

  return (
    rules.mimeTypes.has(file.mimetype) &&
    rules.extensions.has(extension)
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

function hasMp3Signature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 3) {
    return false;
  }

  if (hasSignature(buffer, [0x49, 0x44, 0x33])) {
    return true;
  }

  return (
    buffer.length >= 2 &&
    buffer[0] === 0xff &&
    (buffer[1] & 0xe0) === 0xe0
  );
}

function matchesUploadSignature(file, fileKind) {
  const extension = getUploadExtension(file.originalname);
  const { buffer } = file;

  if (fileKind === "audio") {
    return extension === ".mp3" && hasMp3Signature(buffer);
  }

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

function buildUploadObjectKey(draftId, originalFilename, fileKind) {
  const extension = getUploadExtension(originalFilename);
  const safeStem = sanitizeFilenameStem(originalFilename);
  const kindSegment = normalizeUploadKind(fileKind);

  return `applications/${draftId}/${kindSegment}/${Date.now()}_${crypto
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
    instagramId: row.instagram_id,
    introduction: row.introduction,
    weightClass: row.weight_class,
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
    instagramId: row.instagram_id,
    introduction: row.introduction,
    weightClass: row.weight_class,
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

function generateStageServiceDraftId() {
  return `stage_draft_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateStageServiceOrderNumber() {
  return `SS-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function normalizeStageServiceType(value) {
  const normalized = normalizeText(value);
  return normalized && stageServiceDefinitions[normalized] ? normalized : null;
}

function normalizeStageServiceDiscipline(value) {
  const normalized = normalizeText(value);
  return normalized && stageServiceDisciplineSet.has(normalized) ? normalized : null;
}

function getStageVideoAdditionalOptionMeta(value, fallbackVideoTypeValue = null) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const directMatch = stageVideoAdditionalOptionMap.get(normalized);

  if (directMatch) {
    return directMatch;
  }

  // Legacy fallback: older drafts stored only the discipline and reused the main video type price.
  if (stageServiceDisciplineSet.has(normalized) && stageVideoTypeMap.has(fallbackVideoTypeValue)) {
    const selectedVideoType = stageVideoTypeMap.get(fallbackVideoTypeValue);

    return {
      value: normalized,
      typeValue: selectedVideoType.value,
      discipline: normalized,
      price: Number(selectedVideoType.price || 0),
      isLegacy: true,
    };
  }

  return null;
}

function mapStageServiceDraftRow(row) {
  return {
    draftId: row.draft_id,
    orderId: row.order_id,
    paymentMethod: row.payment_method,
    status: row.status,
    serviceType: row.service_type,
    name: row.name,
    phone: row.phone,
    email: row.email,
    linkedApplicationNumber: row.linked_application_number,
    linkedDiscipline: row.linked_discipline,
    photoHasAdditionalDiscipline: row.photo_has_additional_discipline ? "O" : "X",
    photoAdditionalDiscipline: row.photo_additional_discipline,
    videoType: row.video_type,
    videoAdditionalDiscipline: row.video_additional_discipline,
    hairParticipantDiscipline: row.hair_participant_discipline,
    hairOption: row.hair_option,
    hairAdditionalDiscipline: row.hair_additional_discipline,
    hairOptionalOption: row.hair_optional_option,
    totalAmount: row.total_amount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStageServiceOrderRow(row) {
  return {
    serviceOrderNumber: row.service_order_number,
    orderId: row.order_id,
    paymentKey: row.payment_key,
    serviceType: row.service_type,
    name: row.name,
    phone: maskPhone(row.phone),
    email: maskEmail(row.email),
    linkedApplicationNumber: row.linked_application_number,
    linkedDiscipline: row.linked_discipline,
    photoHasAdditionalDiscipline: row.photo_has_additional_discipline ? "O" : "X",
    photoAdditionalDiscipline: row.photo_additional_discipline,
    videoType: row.video_type,
    videoAdditionalDiscipline: row.video_additional_discipline,
    hairParticipantDiscipline: row.hair_participant_discipline,
    hairOption: row.hair_option,
    hairAdditionalDiscipline: row.hair_additional_discipline,
    hairOptionalOption: row.hair_optional_option,
    totalAmount: row.total_amount,
    paymentStatus: row.payment_status,
    serviceStatus: row.service_status,
    purchasedAt: row.purchased_at,
    updatedAt: row.updated_at,
  };
}

function calculateStageServiceAmount(payload) {
  if (payload.serviceType === "stage-photo") {
    const basePrice = Number(stageServiceDefinitions["stage-photo"]?.basePrice || 0);
    const additionalPrice = Number(
      stageServiceDefinitions["stage-photo"]?.additionalDisciplinePrice || 0
    );

    return basePrice + (payload.photoHasAdditionalDiscipline ? additionalPrice : 0);
  }

  if (payload.serviceType === "stage-video") {
    const selectedVideoType = stageVideoTypeMap.get(payload.videoType);
    const selectedAdditionalVideoOption = getStageVideoAdditionalOptionMeta(
      payload.videoAdditionalDiscipline,
      payload.videoType
    );
    const basePrice = Number(selectedVideoType?.price || 0);
    return basePrice + Number(selectedAdditionalVideoOption?.price || 0);
  }

  if (payload.serviceType === "hair-makeup") {
    const selectedHairOption = hairOptionMap.get(payload.hairOption);
    const selectedOptionalOption = hairOptionalOptionMap.get(payload.hairOptionalOption);
    return Number(selectedHairOption?.price || 0) + Number(selectedOptionalOption?.price || 0);
  }

  return 0;
}

function validateStageServiceDraftPayload(body) {
  const serviceType = normalizeStageServiceType(body.serviceType);
  const paymentMethod = normalizeText(body.paymentMethod) || "payment";
  const name = normalizeText(body.name);
  const phone = normalizeText(formatPhoneNumber(body.phone));
  const email = normalizeEmail(body.email);

  if (!serviceType) {
    return {
      ok: false,
      message: "Invalid stage service type",
    };
  }

  if (!name || !phone || !email) {
    return {
      ok: false,
      message: "Missing required applicant fields",
    };
  }

  if (!hasValidEmail(email)) {
    return {
      ok: false,
      message: "유효한 이메일 주소를 입력해 주세요.",
    };
  }

  if (String(phone).replace(/\D/g, "").length !== 11) {
    return {
      ok: false,
      message: "연락처를 정확히 입력해 주세요.",
    };
  }

  const payload = {
    serviceType,
    paymentMethod,
    name,
    phone,
    email,
    photoHasAdditionalDiscipline: false,
    photoAdditionalDiscipline: null,
    videoType: null,
    videoAdditionalDiscipline: null,
    hairParticipantDiscipline: null,
    hairOption: null,
    hairAdditionalDiscipline: null,
    hairOptionalOption: null,
  };

  if (serviceType === "stage-photo") {
    payload.photoHasAdditionalDiscipline = normalizeText(body.photoHasAdditionalDiscipline) === "O";
    payload.photoAdditionalDiscipline = normalizeStageServiceDiscipline(body.photoAdditionalDiscipline);

    if (payload.photoHasAdditionalDiscipline && !payload.photoAdditionalDiscipline) {
      return {
        ok: false,
        message: "추가 종목을 선택해 주세요.",
      };
    }
  }

  if (serviceType === "stage-video") {
    payload.videoType = normalizeText(body.videoType);
    payload.videoAdditionalDiscipline = normalizeText(body.videoAdditionalDiscipline);

    if (!stageVideoTypeMap.has(payload.videoType)) {
      return {
        ok: false,
        message: "영상 타입을 선택해 주세요.",
      };
    }

    if (
      payload.videoAdditionalDiscipline &&
      !getStageVideoAdditionalOptionMeta(payload.videoAdditionalDiscipline, payload.videoType)
    ) {
      return {
        ok: false,
        message: "추가 영상 종목을 다시 선택해 주세요.",
      };
    }
  }

  if (serviceType === "hair-makeup") {
    payload.hairParticipantDiscipline = normalizeStageServiceDiscipline(body.hairParticipantDiscipline);
    payload.hairOption = normalizeText(body.hairOption);
    payload.hairAdditionalDiscipline = normalizeStageServiceDiscipline(body.hairAdditionalDiscipline);
    payload.hairOptionalOption = normalizeText(body.hairOptionalOption);

    if (!payload.hairParticipantDiscipline) {
      return {
        ok: false,
        message: "참가 종목을 선택해 주세요.",
      };
    }

    if (!hairOptionMap.has(payload.hairOption)) {
      return {
        ok: false,
        message: "헤어&메이크업 옵션을 선택해 주세요.",
      };
    }

    if (
      payload.hairAdditionalDiscipline &&
      payload.hairAdditionalDiscipline === payload.hairParticipantDiscipline
    ) {
      return {
        ok: false,
        message: "추가 종목은 참가 종목과 다르게 선택해 주세요.",
      };
    }

    if (payload.hairOptionalOption) {
      const optionalDefinition = hairOptionalOptionMap.get(payload.hairOptionalOption);

      if (!optionalDefinition) {
        return {
          ok: false,
          message: "추가 옵션을 다시 선택해 주세요.",
        };
      }

      if (optionalDefinition.requiresAdditionalDiscipline && !payload.hairAdditionalDiscipline) {
        return {
          ok: false,
          message: "리터치 옵션은 추가 종목 선택 시에만 가능합니다.",
        };
      }

      const hairDefinition = hairOptionMap.get(payload.hairOption);
      const selectedGender = hairDefinition?.gender || "all";

      if (
        optionalDefinition.gender !== "all" &&
        optionalDefinition.gender !== selectedGender
      ) {
        return {
          ok: false,
          message: "선택한 헤어&메이크업 옵션과 맞지 않는 추가 옵션입니다.",
        };
      }
    }
  }

  return {
    ok: true,
    payload: {
      ...payload,
      totalAmount: calculateStageServiceAmount(payload),
    },
  };
}

async function findEligibleCompletedApplicationForStageService({
  client = pool,
  name,
  phone,
  email,
}) {
  const result = await client.query(
    `
      SELECT
        id,
        application_number,
        discipline
      FROM applications
      WHERE name = $1
        AND phone = $2
        AND LOWER(email) = $3
        AND payment_status = 'DONE'
      ORDER BY submitted_at DESC NULLS LAST, updated_at DESC
      LIMIT 1
    `,
    [name, phone, email]
  );

  return result.rows[0] || null;
}

async function hasPurchasedStageService({
  client = pool,
  name,
  phone,
  email,
  serviceType,
}) {
  const result = await client.query(
    `
      SELECT 1
      FROM stage_service_orders
      WHERE name = $1
        AND phone = $2
        AND LOWER(email) = $3
        AND service_type = $4
        AND payment_status = 'DONE'
      LIMIT 1
    `,
    [name, phone, email, serviceType]
  );

  return result.rowCount > 0;
}

// Draft 정규화 작업
function validateDraftPayload(body) {
  const name = normalizeText(body.name);
  const phone = normalizeText(formatPhoneNumber(body.phone));
  const email = normalizeText(body.email);
  const birthDate = normalizeText(body.birthDate);
  const organization = normalizeText(body.organization);
  const instagramId = normalizeText(body.instagramId) || "없음";
  const introduction = normalizeText(body.introduction);
  const weightClass = normalizeText(body.weightClass);
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

  if (introduction && introduction.length > 100) {
    return {
      ok: false,
      message: "자기 소개 멘트는 100자 이내로 입력해 주세요.",
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
      instagramId,
      introduction,
      weightClass,
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

function buildKcpWebhookEventId(payload) {
  const explicitEventId = payload?.event_id || payload?.eventId || null;

  if (explicitEventId) {
    return explicitEventId;
  }

  const fingerprintSource = {
    siteCode: payload?.site_cd || null,
    transactionNo: payload?.tno || null,
    orderNo: payload?.order_no || payload?.ordr_idxx || null,
    transactionCode: payload?.tx_cd || null,
    transactionTime: payload?.tx_tm || null,
  };

  return `kcp_${crypto
    .createHash("sha256")
    .update(JSON.stringify(fingerprintSource))
    .digest("hex")}`;
}

function extractKcpWebhookFields(payload) {
  return {
    eventType: payload?.tx_cd || payload?.event_type || "KCP_WEBHOOK",
    eventId: buildKcpWebhookEventId(payload),
    paymentKey: payload?.tno || null,
    orderId: payload?.order_no || payload?.ordr_idxx || null,
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
          payment_provider = COALESCE(payment_provider, $9),
          provider_payment_id = COALESCE(provider_payment_id, $1),
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
        paymentProviders.TOSS,
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
        payment_provider,
        provider_payment_id,
        method,
        payment_type,
        status,
        approved_at,
        total_amount,
        raw_response_json,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())
    `,
    [
      orderId,
      paymentKey,
      paymentProviders.TOSS,
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
          SELECT status, payment_provider
          FROM orders
          WHERE order_id = $1
          FOR UPDATE
        `,
        [orderId]
      );

      if (orderResult.rowCount > 0) {
        const orderProvider =
          orderResult.rows[0].payment_provider || paymentProviders.TOSS;

        if (orderProvider !== paymentProviders.TOSS) {
          throw new Error(`Toss webhook received for ${orderProvider} order`);
        }

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

app.post("/kcp/trade/register", async function (req, res) {
  const orderId = normalizeText(req.body.orderId);
  const draftId = normalizeText(req.body.draftId);
  const context = normalizeText(req.body.context) === "stageService" ? "stageService" : "application";
  const requestedPaymentMethod = normalizeText(req.body.paymentMethod) || "CARD";
  const kcpMethod = mapClientPaymentMethodToKcp(requestedPaymentMethod);

  if (!orderId) {
    return res.status(400).json({
      ok: false,
      message: "Missing orderId",
    });
  }

  if (!kcpMethod) {
    return res.status(400).json({
      ok: false,
      code: "KCP_PAYMENT_METHOD_UNSUPPORTED",
      message: "KCP LITE PAY에서 아직 지원하지 않는 결제수단입니다.",
    });
  }

  let kcpConfig;

  try {
    kcpConfig = assertKcpConfigured();
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      code: "KCP_NOT_CONFIGURED",
      message: error.message,
    });
  }

  try {
    const orderResult = await pool.query(
      `
        SELECT
          order_id,
          order_name,
          amount,
          customer_name,
          customer_email,
          payment_provider,
          status
        FROM orders
        WHERE order_id = $1
        LIMIT 1
      `,
      [orderId]
    );

    if (orderResult.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: "Order not found",
      });
    }

    const order = orderResult.rows[0];

    if ((order.payment_provider || paymentProviders.TOSS) !== paymentProviders.KCP) {
      return res.status(409).json({
        ok: false,
        code: "PAYMENT_PROVIDER_MISMATCH",
        message: `Order is locked to ${order.payment_provider} payment provider`,
      });
    }

    if (order.status !== "READY") {
      return res.status(409).json({
        ok: false,
        message: `Order is not in READY status. Current status: ${order.status}`,
      });
    }

    const amount = normalizeAmount(order.amount);

    if (amount === null) {
      return res.status(400).json({
        ok: false,
        message: "Invalid order amount",
      });
    }

    const regType = resolveKcpRegType(req.headers["user-agent"]);
    const signatureSource = [
      kcpSiteCode,
      String(amount),
      kcpMethod.payMethod,
      regType,
      order.order_id,
    ].join("^");
    const kcpSignData = createKcpSignature(
      signatureSource,
      kcpConfig.privateKey,
      kcpConfig.privateKeyPassphrase
    );
    const retURL = buildKcpReturnUrl(req, {
      context,
      draftId,
      orderId: order.order_id,
    });
    const failPath = context === "stageService" ? "/stage-services/fail" : "/fail";
    const failUrl = buildKcpRedirectUrl(req, failPath, {
      code: "KCP_AUTH_FAILED",
      message: "KCP 결제 인증에 실패했습니다.",
    });
    const registerBody = {
      site_cd: kcpSiteCode,
      kcp_cert_info: kcpConfig.certInfo,
      kcp_sign_data: kcpSignData,
      ordr_idxx: order.order_id,
      pay_method: kcpMethod.payMethod,
      good_mny: String(amount),
      good_name: order.order_name,
      reg_type: regType,
      ret_URL: retURL,
      fail_url: failUrl,
    };
    const { response, json } = await postKcpJson(kcpTradeRegisterUrl, registerBody);
    const payUrl = json.pay_url || json.payUrl || json.PayUrl;

    if (!response.ok || !payUrl) {
      return res.status(response.ok ? 502 : response.status).json({
        ok: false,
        code: getKcpResponseCode(json) || "KCP_TRADE_REGISTER_FAILED",
        message: getKcpResponseMessage(json) || "KCP 거래등록에 실패했습니다.",
        kcp: json,
      });
    }

    await pool.query(
      `
        UPDATE orders
        SET
          payment_method = $2,
          updated_at = NOW()
        WHERE order_id = $1
      `,
      [order.order_id, kcpMethod.payMethod]
    );

    return res.status(200).json({
      ok: true,
      paymentProvider: paymentProviders.KCP,
      payUrl,
      formFields: {
        ordr_idxx: order.order_id,
        ...(kcpMethod.payMethod === "MOBX"
          ? { shop_user_id: order.customer_email || order.customer_name || order.order_id }
          : {}),
      },
    });
  } catch (error) {
    console.error("Failed to register KCP trade:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to register KCP trade",
    });
  }
});

app.post("/kcp/return", async function (req, res) {
  const context = normalizeText(req.query.context) === "stageService" ? "stageService" : "application";
  const draftId = normalizeText(req.query.draftId);
  const orderId =
    normalizeText(req.query.orderId) ||
    normalizeText(req.body.ordr_idxx) ||
    normalizeText(req.body.ordr_no) ||
    normalizeText(req.body.order_no);
  const encData = normalizeText(req.body.enc_data);
  const encInfo = normalizeText(req.body.enc_info);
  const tranCd = normalizeText(req.body.tran_cd);
  const failPath = context === "stageService" ? "/stage-services/fail" : "/fail";
  const successPath = context === "stageService" ? "/stage-services/payment/success" : "/payment/success";

  function redirectFailure(code, message) {
    return res.redirect(
      buildKcpRedirectUrl(req, failPath, {
        code,
        message,
      })
    );
  }

  if (!orderId || !encData || !encInfo || !tranCd) {
    return redirectFailure("KCP_AUTH_DATA_MISSING", "KCP 인증 결과가 올바르지 않습니다.");
  }

  let kcpConfig;

  try {
    kcpConfig = assertKcpConfigured();
  } catch (error) {
    return redirectFailure("KCP_NOT_CONFIGURED", error.message);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const orderResult = await client.query(
      `
        SELECT
          order_id,
          amount,
          payment_provider,
          payment_method,
          status
        FROM orders
        WHERE order_id = $1
        FOR UPDATE
      `,
      [orderId]
    );

    if (orderResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return redirectFailure("ORDER_NOT_FOUND", "주문 정보를 찾을 수 없습니다.");
    }

    const order = orderResult.rows[0];

    if ((order.payment_provider || paymentProviders.TOSS) !== paymentProviders.KCP) {
      await client.query("ROLLBACK");
      return redirectFailure("PAYMENT_PROVIDER_MISMATCH", "KCP 결제 주문이 아닙니다.");
    }

    const existingPaymentResult = await client.query(
      `
        SELECT payment_key, total_amount
        FROM payments
        WHERE order_id = $1
          AND payment_provider = $2
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [order.order_id, paymentProviders.KCP]
    );

    if (existingPaymentResult.rowCount > 0) {
      await client.query("COMMIT");
      const payment = existingPaymentResult.rows[0];
      return res.redirect(
        buildKcpRedirectUrl(req, successPath, {
          draftId,
          orderId: order.order_id,
          amount: payment.total_amount || order.amount,
          paymentKey: payment.payment_key,
          provider: paymentProviders.KCP,
          confirmed: "1",
        })
      );
    }

    if (order.status !== "READY") {
      await client.query("ROLLBACK");
      return redirectFailure("ORDER_NOT_READY", "결제 가능한 주문 상태가 아닙니다.");
    }

    const kcpMethod = mapClientPaymentMethodToKcp(order.payment_method);

    if (!kcpMethod) {
      await client.query("ROLLBACK");
      return redirectFailure("KCP_PAYMENT_METHOD_MISSING", "KCP 결제수단을 확인할 수 없습니다.");
    }

    const amount = normalizeAmount(order.amount);

    if (amount === null) {
      await client.query("ROLLBACK");
      return redirectFailure("INVALID_ORDER_AMOUNT", "주문 금액이 올바르지 않습니다.");
    }

    const approveBody = {
      site_cd: kcpSiteCode,
      kcp_cert_info: kcpConfig.certInfo,
      enc_data: encData,
      enc_info: encInfo,
      tran_cd: tranCd,
      ordr_idxx: order.order_id,
      ordr_mony: String(amount),
      pay_type: kcpMethod.payType,
      ordr_no: order.order_id,
    };
    const { response, json } = await postKcpJson(kcpPaymentApproveUrl, approveBody);

    const kcpResponseCode = getKcpResponseCode(json);
    const kcpResponseMessage = getKcpResponseMessage(json);

    if (!response.ok || kcpResponseCode !== "0000") {
      await client.query(
        `
          UPDATE orders
          SET status = 'FAILED', updated_at = NOW()
          WHERE order_id = $1
        `,
        [order.order_id]
      );
      await client.query("COMMIT");
      return redirectFailure(
        kcpResponseCode || "KCP_APPROVE_FAILED",
        kcpResponseMessage || "KCP 결제 승인에 실패했습니다."
      );
    }

    const kcpTransactionNo = normalizeText(json.tno);

    if (!kcpTransactionNo) {
      await client.query("ROLLBACK");
      return redirectFailure("KCP_TNO_MISSING", "KCP 거래번호를 확인할 수 없습니다.");
    }

    const approvedAmount = Number(json.amount || json.card_mny || amount);
    const approvedAt = new Date().toISOString();

    await client.query(
      `
        INSERT INTO payments (
          order_id,
          payment_key,
          payment_provider,
          provider_payment_id,
          method,
          payment_type,
          status,
          approved_at,
          total_amount,
          raw_response_json,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'DONE', $7, $8, $9::jsonb, NOW())
      `,
      [
        order.order_id,
        kcpTransactionNo,
        paymentProviders.KCP,
        kcpTransactionNo,
        json.pay_method || kcpMethod.label,
        kcpMethod.payType,
        approvedAt,
        Number.isFinite(approvedAmount) ? approvedAmount : amount,
        JSON.stringify(json),
      ]
    );

    await client.query(
      `
        UPDATE orders
        SET status = 'PAID', updated_at = NOW()
        WHERE order_id = $1
      `,
      [order.order_id]
    );

    await client.query("COMMIT");

    return res.redirect(
      buildKcpRedirectUrl(req, successPath, {
        draftId,
        orderId: order.order_id,
        amount: Number.isFinite(approvedAmount) ? approvedAmount : amount,
        paymentKey: kcpTransactionNo,
        provider: paymentProviders.KCP,
        confirmed: "1",
      })
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to approve KCP payment:", error);
    return redirectFailure("KCP_APPROVE_ERROR", "KCP 결제 승인 처리 중 오류가 발생했습니다.");
  } finally {
    client.release();
  }
});

// TODO: 개발자센터에 로그인해서 내 결제위젯 연동 키 > 시크릿 키를 입력하세요. 시크릿 키는 외부에 공개되면 안돼요.
// @docs https://docs.tosspayments.com/reference/using-api/api-keys
const widgetSecretKey = process.env.TOSS_WIDGET_SECRET_KEY;
const apiSecretKey = process.env.TOSS_API_SECRET_KEY;

// 토스페이먼츠 API는 시크릿 키를 사용자 ID로 사용하고, 비밀번호는 사용하지 않습니다.
// 비밀번호가 없다는 것을 알리기 위해 시크릿 키 뒤에 콜론을 추가합니다.
// @docs https://docs.tosspayments.com/reference/using-api/authorization#%EC%9D%B8%EC%A6%9D
const encryptedWidgetSecretKey = widgetSecretKey
  ? "Basic " + Buffer.from(widgetSecretKey + ":").toString("base64")
  : null;
const encryptedApiSecretKey = apiSecretKey
  ? "Basic " + Buffer.from(apiSecretKey + ":").toString("base64")
  : null;

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
          payment_provider,
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

    if ((order.payment_provider || paymentProviders.TOSS) !== paymentProviders.TOSS) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: "PAYMENT_PROVIDER_MISMATCH",
        message: `Order is locked to ${order.payment_provider} payment provider`,
      });
    }

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
          payment_provider,
          provider_payment_id,
          method,
          payment_type,
          status,
          approved_at,
          total_amount,
          raw_response_json,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())
      `,
      [
        orderId,
        tossResult.paymentKey || paymentKey,
        paymentProviders.TOSS,
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
  if (!encryptedApiSecretKey) {
    return res.status(503).json({
      ok: false,
      message: "Toss payment is not configured",
    });
  }

  return confirmPaymentAndPersist(req, res, {
    authorization: encryptedApiSecretKey,
    confirmUrl: "https://api.tosspayments.com/v1/payments/confirm",
    logLabel: "payment",
  });
});

// 브랜드페이 승인
app.post("/confirm/brandpay", async function (req, res) {
  if (!encryptedApiSecretKey) {
    return res.status(503).json({
      ok: false,
      message: "Toss brandpay is not configured",
    });
  }

  return confirmPaymentAndPersist(req, res, {
    authorization: encryptedApiSecretKey,
    confirmUrl: "https://api.tosspayments.com/v1/brandpay/payments/confirm",
    includeCustomerKey: true,
    logLabel: "brandpay",
  });
});

// 브랜드페이 Access Token 발급
app.get("/callback-auth", function (req, res) {
  if (!encryptedApiSecretKey) {
    return res.status(503).json({
      ok: false,
      message: "Toss brandpay is not configured",
    });
  }

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
  if (!encryptedApiSecretKey) {
    return res.status(503).json({
      ok: false,
      message: "Toss billing is not configured",
    });
  }

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
  if (!encryptedApiSecretKey) {
    return res.status(503).json({
      ok: false,
      message: "Toss billing is not configured",
    });
  }

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
          a.application_number,
          a.order_id,
          a.name,
          a.phone,
          a.email,
          a.organization,
          a.instagram_id,
          a.introduction,
          a.division,
          a.discipline,
          a.payment_status,
          a.submitted_at,
          document_file.original_filename AS document_original_filename,
          audio_file.original_filename AS audio_original_filename
        FROM applications a
        LEFT JOIN LATERAL (
          SELECT original_filename
          FROM application_files af
          WHERE af.application_id = a.id
            AND lower(af.original_filename) NOT LIKE '%.mp3'
          ORDER BY af.uploaded_at DESC
          LIMIT 1
        ) document_file ON TRUE
        LEFT JOIN LATERAL (
          SELECT original_filename
          FROM application_files af
          WHERE af.application_id = a.id
            AND lower(af.original_filename) LIKE '%.mp3'
          ORDER BY af.uploaded_at DESC
          LIMIT 1
        ) audio_file ON TRUE
        ORDER BY a.submitted_at DESC
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
        instagramId: row.instagram_id,
        introduction: row.introduction,
        division: row.division,
        discipline: row.discipline,
        paymentStatus: row.payment_status,
        submittedAt: row.submitted_at,
        documentOriginalFilename: row.document_original_filename,
        audioOriginalFilename: row.audio_original_filename,
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

app.get("/admin/applications/:applicationNumber/files/:fileKind/download", requireAdminAuth, async function (req, res) {
  try {
    if (!ensureR2ReadReady()) {
      return res.status(500).json({
        ok: false,
        message: "R2 read is not configured",
      });
    }

    const applicationNumber = normalizeText(req.params.applicationNumber);
    const fileKind = normalizeUploadKind(req.params.fileKind);

    if (!applicationNumber) {
      return res.status(400).json({
        ok: false,
        message: "Application number is required",
      });
    }

    const filterSql =
      fileKind === "audio"
        ? "lower(af.original_filename) LIKE '%.mp3'"
        : "lower(af.original_filename) NOT LIKE '%.mp3'";

    const fileResult = await pool.query(
      `
        SELECT
          af.original_filename,
          af.stored_filename,
          af.mime_type
        FROM applications a
        JOIN application_files af
          ON af.application_id = a.id
        WHERE a.application_number = $1
          AND ${filterSql}
        ORDER BY af.uploaded_at DESC
        LIMIT 1
      `,
      [applicationNumber]
    );

    if (fileResult.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: "Requested file not found",
      });
    }

    const file = fileResult.rows[0];
    const objectResponse = await r2Client.send(
      new GetObjectCommand({
        Bucket: r2BucketName,
        Key: file.stored_filename,
      })
    );
    const bodyBytes = await objectResponse.Body.transformToByteArray();

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_DOWNLOAD_APPLICATION_FILE",
      targetType: "application_file",
      targetId: applicationNumber,
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: {
        fileKind,
        originalFilename: file.original_filename,
      },
    });

    res.setHeader("Content-Type", file.mime_type || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file.original_filename || "download")}`
    );
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(Buffer.from(bodyBytes));
  } catch (error) {
    console.error("Failed to download application file:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to download application file",
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
    await ensurePaymentProviderColumnsReady();
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
            payment_provider,
            payload_json,
            processing_status
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'RECEIVED')
        `,
        [
          eventType,
          eventId,
          paymentKey,
          orderId,
          paymentProviders.TOSS,
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
            payment_provider = $5,
            payload_json = $6::jsonb,
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
          paymentProviders.TOSS,
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

app.post("/webhooks/kcp", async function (req, res) {
  const payload = req.body || {};
  const { eventType, eventId, paymentKey, orderId } = extractKcpWebhookFields(payload);

  try {
    try {
      await pool.query(
        `
          INSERT INTO payment_webhook_events (
            event_type,
            event_id,
            payment_key,
            order_id,
            payment_provider,
            payload_json,
            processing_status
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'RECEIVED')
        `,
        [
          eventType,
          eventId,
          paymentKey,
          orderId,
          paymentProviders.KCP,
          JSON.stringify(payload),
        ]
      );
    } catch (insertError) {
      if (insertError.code !== "23505") {
        throw insertError;
      }

      await pool.query(
        `
          UPDATE payment_webhook_events
          SET
            event_type = $2,
            payment_key = $3,
            order_id = $4,
            payment_provider = $5,
            payload_json = $6::jsonb,
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
          paymentProviders.KCP,
          JSON.stringify(payload),
        ]
      );
    }

    await markWebhookEventStatus(eventId, "PROCESSED");

    return res.status(200).json({
      result: "0000",
    });
  } catch (error) {
    if (eventId) {
      try {
        await markWebhookEventStatus(eventId, "FAILED");
      } catch (updateError) {
        console.error("Failed to update KCP webhook event status:", updateError);
      }
    }

    console.error("Failed to store KCP webhook event:", error);

    return res.status(500).json({
      result: "9999",
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
          instagram_id,
          introduction,
          weight_class,
          division,
          discipline,
          image_key,
          created_at,
          updated_at
        )
        VALUES ($1, $2, 'DRAFT', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
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
          instagram_id,
          introduction,
          weight_class,
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
        payload.instagramId,
        payload.introduction,
        payload.weightClass,
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
          instagram_id = $8,
          introduction = $9,
          weight_class = $10,
          division = $11,
          discipline = $12,
          image_key = $13,
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
          instagram_id,
          introduction,
          weight_class,
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
        payload.instagramId,
        payload.introduction,
        payload.weightClass,
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
          instagram_id,
          introduction,
          weight_class,
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
      `,
      [draft.id]
    );
    const splitFiles = splitApplicationFiles(fileResult.rows);

    return res.status(200).json({
      ok: true,
      draft: mapDraftRow(draft),
      consents: mapConsentRow(consentResult.rows[0]),
      file: splitFiles.documentFile || null,
      documentFile: splitFiles.documentFile || null,
      audioFile: splitFiles.audioFile || null,
    });
  } catch (error) {
    console.error("Failed to fetch application draft:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch application draft",
    });
  }
});

app.post("/stage-services/draft", async function (req, res) {
  const validation = validateStageServiceDraftPayload(req.body);

  if (!validation.ok) {
    return res.status(400).json({
      ok: false,
      message: validation.message,
    });
  }

  const { payload } = validation;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const linkedApplication = await findEligibleCompletedApplicationForStageService({
      client,
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
    });

    if (!linkedApplication) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        ok: false,
        message: "대회 신청 완료자만 무대 서비스를 구매할 수 있습니다.",
      });
    }

    const alreadyPurchased = await hasPurchasedStageService({
      client,
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      serviceType: payload.serviceType,
    });

    if (alreadyPurchased) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        message: "이미 해당 무대 서비스를 구매한 신청자입니다.",
      });
    }

    const draftId = generateStageServiceDraftId();
    const draftResult = await client.query(
      `
        INSERT INTO stage_service_drafts (
          draft_id,
          payment_method,
          status,
          service_type,
          name,
          phone,
          email,
          linked_application_id,
          linked_application_number,
          linked_discipline,
          photo_has_additional_discipline,
          photo_additional_discipline,
          video_type,
          video_additional_discipline,
          hair_participant_discipline,
          hair_option,
          hair_additional_discipline,
          hair_optional_option,
          total_amount,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, 'DRAFT', $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW()
        )
        RETURNING
          draft_id,
          order_id,
          payment_method,
          status,
          service_type,
          name,
          phone,
          email,
          linked_application_number,
          linked_discipline,
          photo_has_additional_discipline,
          photo_additional_discipline,
          video_type,
          video_additional_discipline,
          hair_participant_discipline,
          hair_option,
          hair_additional_discipline,
          hair_optional_option,
          total_amount,
          created_at,
          updated_at
      `,
      [
        draftId,
        payload.paymentMethod,
        payload.serviceType,
        payload.name,
        payload.phone,
        payload.email,
        linkedApplication.id,
        linkedApplication.application_number,
        linkedApplication.discipline,
        payload.photoHasAdditionalDiscipline,
        payload.photoAdditionalDiscipline,
        payload.videoType,
        payload.videoAdditionalDiscipline,
        payload.hairParticipantDiscipline,
        payload.hairOption,
        payload.hairAdditionalDiscipline,
        payload.hairOptionalOption,
        payload.totalAmount,
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      ok: true,
      draft: mapStageServiceDraftRow(draftResult.rows[0]),
      linkedApplication: {
        applicationNumber: linkedApplication.application_number,
        discipline: linkedApplication.discipline,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to create stage service draft:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to create stage service draft",
    });
  } finally {
    client.release();
  }
});

app.patch("/stage-services/draft/:draftId", async function (req, res) {
  const validation = validateStageServiceDraftPayload(req.body);

  if (!validation.ok) {
    return res.status(400).json({
      ok: false,
      message: validation.message,
    });
  }

  const { payload } = validation;
  const { draftId } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const linkedApplication = await findEligibleCompletedApplicationForStageService({
      client,
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
    });

    if (!linkedApplication) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        ok: false,
        message: "대회 신청 완료자만 무대 서비스를 구매할 수 있습니다.",
      });
    }

    const existingPurchasedResult = await client.query(
      `
        SELECT 1
        FROM stage_service_orders
        WHERE name = $1
          AND phone = $2
          AND LOWER(email) = $3
          AND service_type = $4
          AND payment_status = 'DONE'
        LIMIT 1
      `,
      [payload.name, payload.phone, payload.email, payload.serviceType]
    );

    if (existingPurchasedResult.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        message: "이미 해당 무대 서비스를 구매한 신청자입니다.",
      });
    }

    const draftResult = await client.query(
      `
        UPDATE stage_service_drafts
        SET
          order_id = NULL,
          status = 'DRAFT',
          payment_method = $2,
          service_type = $3,
          name = $4,
          phone = $5,
          email = $6,
          linked_application_id = $7,
          linked_application_number = $8,
          linked_discipline = $9,
          photo_has_additional_discipline = $10,
          photo_additional_discipline = $11,
          video_type = $12,
          video_additional_discipline = $13,
          hair_participant_discipline = $14,
          hair_option = $15,
          hair_additional_discipline = $16,
          hair_optional_option = $17,
          total_amount = $18,
          updated_at = NOW()
        WHERE draft_id = $1
        RETURNING
          draft_id,
          order_id,
          payment_method,
          status,
          service_type,
          name,
          phone,
          email,
          linked_application_number,
          linked_discipline,
          photo_has_additional_discipline,
          photo_additional_discipline,
          video_type,
          video_additional_discipline,
          hair_participant_discipline,
          hair_option,
          hair_additional_discipline,
          hair_optional_option,
          total_amount,
          created_at,
          updated_at
      `,
      [
        draftId,
        payload.paymentMethod,
        payload.serviceType,
        payload.name,
        payload.phone,
        payload.email,
        linkedApplication.id,
        linkedApplication.application_number,
        linkedApplication.discipline,
        payload.photoHasAdditionalDiscipline,
        payload.photoAdditionalDiscipline,
        payload.videoType,
        payload.videoAdditionalDiscipline,
        payload.hairParticipantDiscipline,
        payload.hairOption,
        payload.hairAdditionalDiscipline,
        payload.hairOptionalOption,
        payload.totalAmount,
      ]
    );

    if (draftResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        message: "Stage service draft not found",
      });
    }

    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      draft: mapStageServiceDraftRow(draftResult.rows[0]),
      linkedApplication: {
        applicationNumber: linkedApplication.application_number,
        discipline: linkedApplication.discipline,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to update stage service draft:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to update stage service draft",
    });
  } finally {
    client.release();
  }
});

app.get("/stage-services/draft/:draftId", async function (req, res) {
  try {
    const { draftId } = req.params;

    const result = await pool.query(
      `
        SELECT
          draft_id,
          order_id,
          payment_method,
          status,
          service_type,
          name,
          phone,
          email,
          linked_application_number,
          linked_discipline,
          photo_has_additional_discipline,
          photo_additional_discipline,
          video_type,
          video_additional_discipline,
          hair_participant_discipline,
          hair_option,
          hair_additional_discipline,
          hair_optional_option,
          total_amount,
          created_at,
          updated_at
        FROM stage_service_drafts
        WHERE draft_id = $1
      `,
      [draftId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: "Stage service draft not found",
      });
    }

    const draft = result.rows[0];
    return res.status(200).json({
      ok: true,
      draft: mapStageServiceDraftRow(draft),
      linkedApplication: {
        applicationNumber: draft.linked_application_number,
        discipline: draft.linked_discipline,
      },
    });
  } catch (error) {
    console.error("Failed to fetch stage service draft:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch stage service draft",
    });
  }
});

app.post("/stage-services/orders", async function (req, res) {
  try {
    const draftId = normalizeText(req.body.draftId);
    const requestedPaymentProvider = req.body.paymentProvider;

    if (!draftId) {
      return res.status(400).json({
        ok: false,
        message: "Missing draftId",
      });
    }

    const draftResult = await pool.query(
      `
        SELECT
          draft_id,
          order_id,
          service_type,
          name,
          email,
          total_amount
        FROM stage_service_drafts
        WHERE draft_id = $1
      `,
      [draftId]
    );

    if (draftResult.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: "Stage service draft not found",
      });
    }

    const draft = draftResult.rows[0];

    if (draft.order_id) {
      const orderResult = await pool.query(
        `
          SELECT
            order_id,
            order_name,
            amount,
            customer_name,
            customer_email,
            payment_provider,
            status,
            created_at
          FROM orders
          WHERE order_id = $1
          LIMIT 1
        `,
        [draft.order_id]
      );

      if (orderResult.rowCount > 0) {
        const order = orderResult.rows[0];
        return res.status(200).json({
          ok: true,
          order: {
            orderId: order.order_id,
            orderName: order.order_name,
            amount: order.amount,
            customerName: order.customer_name,
            customerEmail: order.customer_email,
            paymentProvider: order.payment_provider,
            status: order.status,
            createdAt: order.created_at,
          },
        });
      }
    }

    const orderId = generateOrderId();
    const orderName = `${stageServiceDefinitions[draft.service_type]?.title || "무대 서비스"} 결제`;
    const providerResolution = resolvePaymentProvider({
      requestedProvider: requestedPaymentProvider,
      amount: Number(draft.total_amount),
    });

    if (!providerResolution.ok) {
      return res.status(providerResolution.status).json({
        ok: false,
        message: providerResolution.message,
      });
    }

    const result = await pool.query(
      `
        INSERT INTO orders (
          order_id,
          order_name,
          amount,
          customer_name,
          customer_email,
          payment_provider,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'READY')
        RETURNING
          order_id,
          order_name,
          amount,
          customer_name,
          customer_email,
          payment_provider,
          status,
          created_at
      `,
      [
        orderId,
        orderName,
        draft.total_amount,
        draft.name,
        draft.email,
        providerResolution.provider,
      ]
    );

    await pool.query(
      `
        UPDATE stage_service_drafts
        SET
          order_id = $2,
          updated_at = NOW()
        WHERE draft_id = $1
      `,
      [draftId, orderId]
    );

    const order = result.rows[0];
    return res.status(201).json({
      ok: true,
      order: {
        orderId: order.order_id,
        orderName: order.order_name,
        amount: order.amount,
        customerName: order.customer_name,
        customerEmail: order.customer_email,
        paymentProvider: order.payment_provider,
        status: order.status,
        createdAt: order.created_at,
      },
    });
  } catch (error) {
    console.error("Failed to create stage service order:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to create stage service order",
    });
  }
});

app.post("/stage-services/complete", async function (req, res) {
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

    const existingServiceOrderResult = await client.query(
      `
        SELECT
          service_order_number,
          order_id,
          payment_key,
          service_type,
          name,
          phone,
          email,
          linked_application_number,
          linked_discipline,
          photo_has_additional_discipline,
          photo_additional_discipline,
          video_type,
          video_additional_discipline,
          hair_participant_discipline,
          hair_option,
          hair_additional_discipline,
          hair_optional_option,
          total_amount,
          payment_status,
          service_status,
          purchased_at,
          updated_at
        FROM stage_service_orders
        WHERE draft_id = $1
           OR order_id = $2
        LIMIT 1
      `,
      [draftId, orderId]
    );

    if (existingServiceOrderResult.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(200).json({
        ok: true,
        idempotent: true,
        serviceOrder: mapStageServiceOrderRow(existingServiceOrderResult.rows[0]),
      });
    }

    const draftResult = await client.query(
      `
        SELECT
          draft_id,
          order_id,
          payment_method,
          service_type,
          name,
          phone,
          email,
          linked_application_number,
          linked_discipline,
          photo_has_additional_discipline,
          photo_additional_discipline,
          video_type,
          video_additional_discipline,
          hair_participant_discipline,
          hair_option,
          hair_additional_discipline,
          hair_optional_option,
          total_amount
        FROM stage_service_drafts
        WHERE draft_id = $1
        FOR UPDATE
      `,
      [draftId]
    );

    if (draftResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        message: "Stage service draft not found",
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

    const draft = draftResult.rows[0];
    const payment = paymentResult.rows[0];
    const serviceOrderNumber = generateStageServiceOrderNumber();

    const serviceOrderInsertResult = await client.query(
      `
        INSERT INTO stage_service_orders (
          service_order_number,
          draft_id,
          order_id,
          payment_key,
          payment_status,
          service_status,
          service_type,
          name,
          phone,
          email,
          linked_application_number,
          linked_discipline,
          photo_has_additional_discipline,
          photo_additional_discipline,
          video_type,
          video_additional_discipline,
          hair_participant_discipline,
          hair_option,
          hair_additional_discipline,
          hair_optional_option,
          total_amount,
          purchased_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, 'PURCHASED', $6, $7, $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18, $19, $20, NOW(), NOW()
        )
        RETURNING
          service_order_number,
          order_id,
          payment_key,
          service_type,
          name,
          phone,
          email,
          linked_application_number,
          linked_discipline,
          photo_has_additional_discipline,
          photo_additional_discipline,
          video_type,
          video_additional_discipline,
          hair_participant_discipline,
          hair_option,
          hair_additional_discipline,
          hair_optional_option,
          total_amount,
          payment_status,
          service_status,
          purchased_at,
          updated_at
      `,
      [
        serviceOrderNumber,
        draft.draft_id,
        orderId,
        payment.payment_key,
        payment.status,
        draft.service_type,
        draft.name,
        draft.phone,
        draft.email,
        draft.linked_application_number,
        draft.linked_discipline,
        draft.photo_has_additional_discipline,
        draft.photo_additional_discipline,
        draft.video_type,
        draft.video_additional_discipline,
        draft.hair_participant_discipline,
        draft.hair_option,
        draft.hair_additional_discipline,
        draft.hair_optional_option,
        draft.total_amount,
      ]
    );

    await client.query(
      `
        UPDATE stage_service_drafts
        SET
          order_id = $2,
          status = 'COMPLETED',
          updated_at = NOW()
        WHERE draft_id = $1
      `,
      [draftId, orderId]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      ok: true,
      serviceOrder: mapStageServiceOrderRow(serviceOrderInsertResult.rows[0]),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to complete stage service order:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to complete stage service order",
    });
  } finally {
    client.release();
  }
});

app.get("/stage-services/:serviceOrderNumber", async function (req, res) {
  try {
    const { serviceOrderNumber } = req.params;

    const result = await pool.query(
      `
        SELECT
          service_order_number,
          order_id,
          payment_key,
          service_type,
          name,
          phone,
          email,
          linked_application_number,
          linked_discipline,
          photo_has_additional_discipline,
          photo_additional_discipline,
          video_type,
          video_additional_discipline,
          hair_participant_discipline,
          hair_option,
          hair_additional_discipline,
          hair_optional_option,
          total_amount,
          payment_status,
          service_status,
          purchased_at,
          updated_at
        FROM stage_service_orders
        WHERE service_order_number = $1
      `,
      [serviceOrderNumber]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: "Stage service order not found",
      });
    }

    return res.status(200).json({
      ok: true,
      serviceOrder: mapStageServiceOrderRow(result.rows[0]),
    });
  } catch (error) {
    console.error("Failed to fetch stage service order:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch stage service order",
    });
  }
});

app.get("/stage-services/by-order/:orderId", async function (req, res) {
  try {
    const { orderId } = req.params;

    const result = await pool.query(
      `
        SELECT
          service_order_number,
          order_id,
          payment_key,
          service_type,
          name,
          phone,
          email,
          linked_application_number,
          linked_discipline,
          photo_has_additional_discipline,
          photo_additional_discipline,
          video_type,
          video_additional_discipline,
          hair_participant_discipline,
          hair_option,
          hair_additional_discipline,
          hair_optional_option,
          total_amount,
          payment_status,
          service_status,
          purchased_at,
          updated_at
        FROM stage_service_orders
        WHERE order_id = $1
      `,
      [orderId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: "Stage service order not found",
      });
    }

    return res.status(200).json({
      ok: true,
      serviceOrder: mapStageServiceOrderRow(result.rows[0]),
    });
  } catch (error) {
    console.error("Failed to fetch stage service order by order:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch stage service order by order",
    });
  }
});

app.post("/stage-services/summary", async function (req, res) {
  try {
    const name = normalizeText(req.body.name);
    const email = normalizeEmail(req.body.email);
    const verificationToken = normalizeText(req.body.verificationToken);
    const applicationNumber = normalizeText(req.body.applicationNumber);

    if (!name || !email || !verificationToken || !applicationNumber) {
      return res.status(400).json({
        ok: false,
        message: "Missing lookup verification fields",
      });
    }

    const hasVerifiedSession = await hasVerifiedLookupSession({
      name,
      email,
      verificationToken,
    });

    if (!hasVerifiedSession) {
      return res.status(403).json({
        ok: false,
        message: "이메일 인증이 만료되었거나 유효하지 않습니다. 다시 인증해 주세요.",
      });
    }

    const ownedApplication = await findLookupOwnedApplication({
      name,
      email,
      applicationNumber,
    });

    if (!ownedApplication) {
      return res.status(404).json({
        ok: false,
        message: "일치하는 신청 내역을 찾을 수 없습니다.",
      });
    }

    const summaryResult = await pool.query(
      `
        SELECT service_type
        FROM stage_service_orders
        WHERE name = $1
          AND phone = $2
          AND LOWER(email) = $3
          AND payment_status = 'DONE'
      `,
      [name, ownedApplication.phone, email]
    );

    const purchasedServiceTypes = new Set(
      summaryResult.rows.map((row) => row.service_type)
    );

    return res.status(200).json({
      ok: true,
      summary: {
        hasStagePhoto: purchasedServiceTypes.has("stage-photo"),
        hasStageVideo: purchasedServiceTypes.has("stage-video"),
        hasHairMakeup: purchasedServiceTypes.has("hair-makeup"),
      },
    });
  } catch (error) {
    console.error("Failed to fetch stage service summary:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch stage service summary",
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
    const fileKind = normalizeUploadKind(req.body.fileKind);
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

    if (!isAllowedUpload(uploadedFile, fileKind)) {
      return res.status(400).json({
        ok: false,
        message: "Unsupported file type",
      });
    }

    if (!matchesUploadSignature(uploadedFile, fileKind)) {
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
    const storedFilename = buildUploadObjectKey(draftId, safeOriginalFilename, fileKind);

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

    const hasVerifiedSession = await hasVerifiedLookupSession({
      name,
      email,
      verificationToken,
    });

    if (!hasVerifiedSession) {
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
          instagram_id,
          introduction,
          weight_class,
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

app.post("/applications/refund/quote", async function (req, res) {
  try {
    await ensureLookupVerificationStoreReady();
    await purgeExpiredLookupVerifications();

    const name = normalizeText(req.body.name);
    const email = normalizeEmail(req.body.email);
    const verificationToken = normalizeText(req.body.verificationToken);
    const applicationNumber = normalizeText(req.body.applicationNumber);

    if (!name || !email || !verificationToken || !applicationNumber) {
      return res.status(400).json({
        ok: false,
        message: "Missing name, email, verificationToken, or applicationNumber",
      });
    }

    if (!hasValidEmail(email)) {
      return res.status(400).json({
        ok: false,
        message: "유효한 이메일 주소를 입력해 주세요.",
      });
    }

    const hasVerifiedSession = await hasVerifiedLookupSession({
      name,
      email,
      verificationToken,
    });

    if (!hasVerifiedSession) {
      return res.status(403).json({
        ok: false,
        message: "이메일 인증이 만료되었거나 유효하지 않습니다. 다시 인증해 주세요.",
      });
    }

    const row = await findLookupOwnedApplication({
      name,
      email,
      applicationNumber,
    });

    if (!row) {
      return res.status(404).json({
        ok: false,
        message: "입력한 정보와 일치하는 신청 내역을 찾을 수 없습니다.",
      });
    }

    const refundQuote = calculateRefundQuote({
      applicationStatus: row.status,
      paymentStatus: row.latest_payment_status || row.payment_status,
      amount: row.total_amount ?? row.order_amount,
      paymentCompletedAt: row.approved_at || row.payment_created_at,
      paymentMethod: row.latest_payment_method,
      requestedAt: new Date(),
    });

    return res.status(200).json({
      ok: true,
      application: mapApplicationRow(row),
      refundQuote,
    });
  } catch (error) {
    console.error("Failed to calculate refund quote:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to calculate refund quote",
    });
  }
});

app.post("/applications/refund/request", async function (req, res) {
  let client = null;
  let refundRequestId = null;
  let tossCancelResult = null;
  let tossCancelStatusCode = null;

  try {
    await ensureLookupVerificationStoreReady();
    await purgeExpiredLookupVerifications();

    const name = normalizeText(req.body.name);
    const email = normalizeEmail(req.body.email);
    const verificationToken = normalizeText(req.body.verificationToken);
    const applicationNumber = normalizeText(req.body.applicationNumber);
    const requestReason =
      normalizeText(req.body.requestReason) || "사용자 요청 자동 환불";

    if (!name || !email || !verificationToken || !applicationNumber) {
      return res.status(400).json({
        ok: false,
        message: "Missing name, email, verificationToken, or applicationNumber",
      });
    }

    if (!hasValidEmail(email)) {
      return res.status(400).json({
        ok: false,
        message: "유효한 이메일 주소를 입력해 주세요.",
      });
    }

    const hasVerifiedSession = await hasVerifiedLookupSession({
      name,
      email,
      verificationToken,
    });

    if (!hasVerifiedSession) {
      return res.status(403).json({
        ok: false,
        message: "이메일 인증이 만료되었거나 유효하지 않습니다. 다시 인증해 주세요.",
      });
    }

    const application = await findLookupOwnedApplication({
      name,
      email,
      applicationNumber,
    });

    if (!application) {
      return res.status(404).json({
        ok: false,
        message: "입력한 정보와 일치하는 신청 내역을 찾을 수 없습니다.",
      });
    }

    const refundQuote = calculateRefundQuote({
      applicationStatus: application.status,
      paymentStatus: application.latest_payment_status || application.payment_status,
      amount: application.total_amount ?? application.order_amount,
      paymentCompletedAt: application.approved_at || application.payment_created_at,
      paymentMethod: application.latest_payment_method,
      requestedAt: new Date(),
    });

    if (!refundQuote.canAutoRefund || !refundQuote.isRefundable || refundQuote.requiresManualReview) {
      return res.status(409).json({
        ok: false,
        code: refundQuote.reasonCode,
        message: refundQuote.message,
        refundQuote,
      });
    }

    if (!application.payment_key) {
      return res.status(409).json({
        ok: false,
        code: "PAYMENT_KEY_MISSING",
        message: "환불 처리에 필요한 결제 키를 찾을 수 없습니다.",
      });
    }

    const refundPaymentProvider =
      application.latest_payment_provider ||
      application.order_payment_provider ||
      paymentProviders.TOSS;

    if (refundPaymentProvider !== paymentProviders.TOSS) {
      return res.status(409).json({
        ok: false,
        code: "PAYMENT_PROVIDER_MISMATCH",
        message: "해당 결제사의 자동 환불 처리가 아직 준비되지 않았습니다.",
      });
    }

    const providerIdempotencyKey = generateRefundIdempotencyKey();
    client = await pool.connect();
    await client.query("BEGIN");

    const activeRequestResult = await client.query(
      `
        SELECT *
        FROM application_refund_requests
        WHERE application_number = $1
          AND request_status IN ('REQUESTED', 'PROCESSING', 'COMPLETED', 'SYNC_FAILED')
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [applicationNumber]
    );

    if (activeRequestResult.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: "REFUND_ALREADY_REQUESTED",
        message: "이미 환불 요청이 접수되었거나 처리된 신청 건입니다.",
        refundRequest: mapRefundRequestRow(activeRequestResult.rows[0]),
      });
    }

    const insertResult = await client.query(
      `
        INSERT INTO application_refund_requests (
          application_number,
          draft_id,
          order_id,
          payment_key,
          request_reason,
          request_status,
          refund_percent,
          refund_amount,
          original_amount,
          policy_version,
          policy_rule_id,
          policy_rule_label,
          policy_snapshot_json,
          requested_by_name,
          requested_by_email,
          provider_idempotency_key
        )
        VALUES (
          $1, $2, $3, $4, $5, 'PROCESSING', $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15
        )
        RETURNING *
      `,
      [
        application.application_number,
        application.draft_id,
        application.order_id,
        application.payment_key,
        requestReason,
        refundQuote.refundPercent,
        refundQuote.refundAmount,
        application.total_amount ?? application.order_amount,
        refundQuote.policyVersion,
        refundQuote.matchedRuleId,
        refundQuote.matchedRuleLabel,
        JSON.stringify(refundQuote),
        name,
        email,
        providerIdempotencyKey,
      ]
    );

    refundRequestId = insertResult.rows[0].id;
    await client.query("COMMIT");
    client.release();
    client = null;

    const cancelBody = {
      cancelReason: requestReason,
      cancelAmount: refundQuote.refundAmount,
    };

    const tossResponse = await fetch(
      `https://api.tosspayments.com/v1/payments/${encodeURIComponent(application.payment_key)}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: encryptedApiSecretKey,
          "Content-Type": "application/json",
          "Idempotency-Key": providerIdempotencyKey,
        },
        body: JSON.stringify(cancelBody),
      }
    );

    const tossResult = await tossResponse.json();
    tossCancelResult = tossResult;
    tossCancelStatusCode = tossResponse.status;

    client = await pool.connect();
    await client.query("BEGIN");

    if (!tossResponse.ok) {
      const failedRequestResult = await client.query(
        `
          UPDATE application_refund_requests
          SET
            request_status = 'FAILED',
            provider_status_code = $2,
            provider_error_code = $3,
            provider_error_message = $4,
            provider_response_json = $5::jsonb,
            processed_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [
          refundRequestId,
          tossResponse.status,
          tossResult.code || null,
          tossResult.message || "환불 처리에 실패했습니다.",
          JSON.stringify(tossResult),
        ]
      );

      await client.query("COMMIT");

      return res.status(tossResponse.status).json({
        ok: false,
        code: tossResult.code || "REFUND_REQUEST_FAILED",
        message: tossResult.message || "환불 처리에 실패했습니다.",
        refundRequest: mapRefundRequestRow(failedRequestResult.rows[0]),
      });
    }

    const nextPaymentStatus = tossResult.status || "CANCELED";
    const nextApplicationStatus =
      nextPaymentStatus === "PARTIAL_CANCELED" ? "PARTIAL_REFUNDED" : "REFUNDED";

    await client.query(
      `
        UPDATE payments
        SET
          method = COALESCE($3, method),
          payment_type = COALESCE($4, payment_type),
          status = $5,
          approved_at = COALESCE($6, approved_at),
          total_amount = COALESCE($7, total_amount),
          raw_response_json = $8::jsonb,
          updated_at = NOW()
        WHERE payment_key = $1
           OR order_id = $2
      `,
      [
        application.payment_key,
        application.order_id,
        tossResult.method || null,
        tossResult.type || null,
        nextPaymentStatus,
        tossResult.approvedAt || null,
        tossResult.totalAmount ?? application.total_amount ?? application.order_amount,
        JSON.stringify(tossResult),
      ]
    );

    await client.query(
      `
        UPDATE orders
        SET status = $2, updated_at = NOW()
        WHERE order_id = $1
      `,
      [application.order_id, mapPaymentStatusToOrderStatus(nextPaymentStatus) || "CANCELED"]
    );

    const updatedApplicationResult = await client.query(
      `
        UPDATE applications
        SET
          status = $2,
          payment_status = $3,
          updated_at = NOW()
        WHERE application_number = $1
        RETURNING
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
          weight_class,
          division,
          discipline,
          image_key,
          submitted_at,
          updated_at
      `,
      [application.application_number, nextApplicationStatus, nextPaymentStatus]
    );

    const completedRequestResult = await client.query(
      `
        UPDATE application_refund_requests
        SET
          request_status = 'COMPLETED',
          provider_status_code = $2,
          provider_response_json = $3::jsonb,
          processed_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [refundRequestId, tossResponse.status, JSON.stringify(tossResult)]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      application: mapApplicationRow(updatedApplicationResult.rows[0]),
      refundRequest: mapRefundRequestRow(completedRequestResult.rows[0]),
      refundQuote: {
        ...refundQuote,
        canAutoRefund: false,
        isRefundable: false,
        requiresManualReview: false,
        message: "환불 요청이 정상적으로 처리되었습니다.",
      },
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }

    if (refundRequestId) {
      await pool
        .query(
          `
            UPDATE application_refund_requests
            SET
              request_status = CASE
                WHEN request_status = 'COMPLETED' THEN request_status
                WHEN $3::boolean = TRUE THEN 'SYNC_FAILED'
                ELSE 'FAILED'
              END,
              provider_status_code = COALESCE(provider_status_code, $4),
              provider_response_json = COALESCE(provider_response_json, $5::jsonb),
              provider_error_message = COALESCE(provider_error_message, $2),
              updated_at = NOW()
            WHERE id = $1
          `,
          [
            refundRequestId,
            error.message || "Failed to process refund request",
            Boolean(tossCancelResult),
            tossCancelStatusCode,
            tossCancelResult ? JSON.stringify(tossCancelResult) : null,
          ]
        )
        .catch(() => {});
    }

    console.error("Failed to process refund request:", error);

    if (error.code === "42P01") {
      return res.status(500).json({
        ok: false,
        message: "Refund request table is not ready. Apply the SQL migration first.",
      });
    }

    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        code: "REFUND_ALREADY_REQUESTED",
        message: "이미 환불 요청이 접수되었거나 처리된 신청 건입니다.",
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Failed to process refund request",
    });
  } finally {
    if (client) {
      client.release();
    }
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
          instagram_id,
          introduction,
          weight_class,
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
          instagram_id,
          introduction,
          weight_class,
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
          instagram_id,
          introduction,
          weight_class,
          division,
          discipline,
          image_key,
          submitted_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, 'SUBMITTED', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
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
          instagram_id,
          introduction,
          weight_class,
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
        draft.instagram_id,
        draft.introduction,
        draft.weight_class,
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
          instagram_id,
          introduction,
          weight_class,
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
      paymentProvider = null,
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

    const providerResolution = resolvePaymentProvider({
      requestedProvider: paymentProvider,
      amount: normalizedAmount,
    });

    if (!providerResolution.ok) {
      return res.status(providerResolution.status).json({
        ok: false,
        message: providerResolution.message,
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
        payment_provider,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'READY')
      RETURNING
        order_id,
        order_name,
        amount,
        customer_name,
        customer_email,
        payment_provider,
        status,
        created_at  
    `;

    const values = [
      orderId,
      safeOrderName,
      normalizedAmount,
      customerName,
      customerEmail,
      providerResolution.provider
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
        paymentProvider: order.payment_provider,
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
