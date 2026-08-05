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
  createDraftAccessToken,
  createPaymentResultAccessToken,
  resolveApplicationOrderDetails,
  validateKcpTestDraft,
  validateKcpApprovalResult,
  validateCompletionPaymentBinding,
  validateDraftAccess,
  validateExistingPaymentReplay,
  validatePaymentResultAccess,
} = require("./server/paymentCompletionSecurity");
const {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");
const refundPolicy = require("./src/data/refundPolicy.json");
const stageServiceConfig = require("./src/data/stageServiceConfig.json");
const applicationDisciplineCatalog = require("./src/data/applicationDisciplineCatalog.json");
const applicationEntryFeeConfig = require("./src/data/applicationEntryFeeConfig.json");
const spectatorTicketConfig = require("./src/data/spectatorTicketConfig.json");
const app = express();
const port = Number(process.env.PORT || 4000);
const host = normalizeText(process.env.HOST) || "127.0.0.1";
const corsAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const adminAllowedOrigins = (process.env.ADMIN_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const adminSessionCookieName = normalizeText(process.env.ADMIN_COOKIE_NAME) || "mmk_admin_session";
const paymentResultCookieName = "mmk_payment_result";
const applicationDraftCookieName = "mmk_application_draft";
const applicationEmailVerificationCookieName = "mmk_application_email_verification";
const stageServiceDraftCookieName = "mmk_stage_service_draft";
const spectatorDraftCookieName = "mmk_spectator_draft";
const paymentResultAccessTtlHours = 24;
const draftAccessTtlHours = 24;
const paymentOrderTtlMinutes = Math.max(
  1,
  Number(process.env.PAYMENT_ORDER_TTL_MINUTES || 20)
);
const spectatorTicketAmount = getPositiveInteger(spectatorTicketConfig.unitAmount, 15000);
const spectatorTicketCapacity = getPositiveInteger(spectatorTicketConfig.capacity, 500);
const paymentResultTokenSecret = normalizeText(process.env.PAYMENT_RESULT_TOKEN_SECRET);
const adminSessionTtlHours = Math.max(
  1,
  Number(process.env.ADMIN_SESSION_TTL_HOURS || 12)
);
const adminSessionIdleMinutes = Math.max(
  1,
  Number(process.env.ADMIN_SESSION_IDLE_TIMEOUT_MINUTES || 15)
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
const lookupVerificationRateStore = new Map();
const lookupVerificationRateWindowMs = Math.max(
  60 * 1000,
  Number(process.env.LOOKUP_VERIFICATION_RATE_WINDOW_MS || 15 * 60 * 1000)
);
const lookupVerificationSendRateLimit = Math.max(
  1,
  Number(process.env.LOOKUP_VERIFICATION_SEND_RATE_LIMIT || 10)
);
const lookupPhoneVerificationSendRateLimit = Math.max(
  1,
  Number(process.env.LOOKUP_PHONE_VERIFICATION_SEND_RATE_LIMIT || 3)
);
const lookupVerificationVerifyRateLimit = Math.max(
  1,
  Number(process.env.LOOKUP_VERIFICATION_VERIFY_RATE_LIMIT || 30)
);
const lookupNumberRateLimit = Math.max(
  1,
  Number(process.env.LOOKUP_NUMBER_RATE_LIMIT || 30)
);

const maxUploadBytes = 10 * 1024 * 1024;
const maxDocumentUploadFiles = 5;
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
const upload = multer({
  storage: multer.memoryStorage(),
  // Browsers send Korean filenames in UTF-8 multipart header parameters.
  defParamCharset: "utf8",
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
  Number(process.env.LOOKUP_VERIFICATION_SESSION_TTL_MINUTES || 15)
);
const lookupVerificationMaxAttempts = Math.max(
  1,
  Number(process.env.LOOKUP_VERIFICATION_MAX_ATTEMPTS || 5)
);
const solapiApiKey = normalizeText(process.env.SOLAPI_API_KEY);
const solapiApiSecret = normalizeText(process.env.SOLAPI_API_SECRET);
const solapiSenderNumber = String(process.env.SOLAPI_SENDER_NUMBER || "").replace(/\D/g, "");
const solapiBrandName = normalizeText(process.env.SOLAPI_BRAND_NAME) || "MMKorea";
const solapiMarketingOptOutText = normalizeText(process.env.SOLAPI_MARKETING_OPT_OUT_TEXT);
const smsCampaignMaxRecipients = Math.max(
  1,
  Number(process.env.SMS_CAMPAIGN_MAX_RECIPIENTS || 5000)
);
const smsCampaignBatchSize = Math.min(
  100,
  Math.max(1, Number(process.env.SMS_CAMPAIGN_BATCH_SIZE || 100))
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
const refundPolicyRepeatRefundReview = refundPolicy.repeatRefundReview || {};
const refundPolicyRepeatRefundReviewGroups =
  refundPolicyRepeatRefundReview.groups || {};
const refundRepeatReviewScope = Object.freeze({
  APPLICATION_STAGE_SERVICE: "applicationStageService",
  SPECTATOR: "spectator",
});
const refundRepeatReviewWindowDays = Math.max(
  1,
  Number(refundPolicyRepeatRefundReview.windowDays) || 30
);
const refundRepeatReviewCompletedThreshold = Math.max(
  1,
  Number(refundPolicyRepeatRefundReview.completedRefundThreshold) || 5
);
const stageServiceDisciplineOptions = Array.isArray(stageServiceConfig.disciplineOptions)
  ? stageServiceConfig.disciplineOptions
  : [];
const stageServiceDisciplineSet = new Set(stageServiceDisciplineOptions);
const stageServiceHairMakeupDisciplineGroups = stageServiceConfig.hairMakeupDisciplineGroups || {};
const stageServiceMaleHairMakeupDisciplines = new Set(
  stageServiceHairMakeupDisciplineGroups.male || []
);
const stageServiceFemaleHairMakeupDisciplines = new Set(
  stageServiceHairMakeupDisciplineGroups.female || []
);
const stageServiceDefinitions = stageServiceConfig.services || {};
const stagePhotoPackages = Array.isArray(stageServiceDefinitions["stage-photo"]?.photoPackages)
  ? stageServiceDefinitions["stage-photo"].photoPackages
  : [];
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
const applicationDisciplineDefinitions = Array.isArray(applicationDisciplineCatalog.items)
  ? applicationDisciplineCatalog.items
  : [];
const applicationDisciplineDefinitionByImageKey = new Map(
  applicationDisciplineDefinitions.map((definition) => [definition.imageKey, definition])
);
const applicationDisciplineDefinitionByAlias = new Map();

applicationDisciplineDefinitions.forEach((definition) => {
  [definition.title, ...(definition.aliases || [])].forEach((alias) => {
    const normalizedAlias = normalizeDisciplineAlias(alias);

    if (normalizedAlias) {
      applicationDisciplineDefinitionByAlias.set(normalizedAlias, definition);
    }
  });
});
const hairOptionDefinitions = Array.isArray(stageServiceDefinitions["hair-makeup"]?.hairOptions)
  ? stageServiceDefinitions["hair-makeup"].hairOptions
  : [];
const hairOptionMap = new Map(
  hairOptionDefinitions.map((definition) => [definition.value, definition])
);
const hairAddOnDefinitions = Array.isArray(stageServiceDefinitions["hair-makeup"]?.addOnOptions)
  ? stageServiceDefinitions["hair-makeup"].addOnOptions
  : [];
const hairAddOnMap = new Map(
  hairAddOnDefinitions.map((definition) => [definition.value, definition])
);
const hairRetouchPrices = stageServiceDefinitions["hair-makeup"]?.retouchPrices || {};

function getStagePhotoPackage(disciplineCount) {
  const normalizedCount = Number(disciplineCount);

  if (!Number.isInteger(normalizedCount) || normalizedCount < 1 || normalizedCount > 3) {
    return null;
  }

  return stagePhotoPackages.find(
    (stagePhotoPackage) => Number(stagePhotoPackage.disciplineCount) === normalizedCount,
  ) || null;
}

function getStageServiceDisciplineFromApplication(application = {}) {
  const source = typeof application === "string" ? { discipline: application } : application;
  const canonicalDiscipline = getCanonicalApplicationDisciplineTitle({
    imageKey: source.image_key || source.imageKey,
    discipline: source.discipline,
  });
  const directDiscipline = normalizeStageServiceDiscipline(canonicalDiscipline);

  if (directDiscipline) {
    return directDiscipline;
  }

  const participantGender = normalizeText(
    source.participant_gender || source.participantGender,
  ).toLowerCase();
  const weightClass = normalizeText(source.weight_class || source.weightClass);
  const inferredGender = participantGender === "male" || participantGender === "female"
    ? participantGender
    : weightClass.includes("남자")
      ? "male"
      : weightClass.includes("여자")
        ? "female"
        : "";

  switch (canonicalDiscipline) {
    case "Bodybuilding":
      return "보디빌딩";
    case "Classic Physique":
      return "클래식";
    case "Physique":
      return "피지크";
    case "Ms.Bikini":
      return "미즈비키니";
    case "Figure":
      return "피규어";
    case "Model":
      return inferredGender === "male" ? "남성 모델" : inferredGender === "female" ? "여성 모델" : null;
    case "Fitness":
      return inferredGender === "male" ? "남성 피트니스" : inferredGender === "female" ? "여성 피트니스" : null;
    case "Denim":
      return inferredGender === "male" ? "남성 데님" : inferredGender === "female" ? "여성 데님" : null;
    default:
      return null;
  }
}

function getStageServiceHairMakeupDisciplineGender(application) {
  const discipline = getStageServiceDisciplineFromApplication(application);

  if (stageServiceMaleHairMakeupDisciplines.has(discipline)) {
    return "male";
  }

  if (stageServiceFemaleHairMakeupDisciplines.has(discipline)) {
    return "female";
  }

  return "all";
}

function isStageServiceHairOptionAllowed(application, hairOption) {
  const participantGender = getStageServiceHairMakeupDisciplineGender(application);

  return participantGender === "all" || hairOption?.gender === participantGender;
}

function isStageServiceHairAdditionalDisciplineAllowed(application, additionalDiscipline) {
  const participantGender = getStageServiceHairMakeupDisciplineGender(application);
  const additionalGender = getStageServiceHairMakeupDisciplineGender(additionalDiscipline);

  return (
    participantGender === "all" ||
    additionalGender === "all" ||
    participantGender === additionalGender
  );
}

app.set("trust proxy", true);
app.disable("x-powered-by");

app.use(function (req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  if (
    req.path.startsWith("/admin") ||
    req.path.startsWith("/applications") ||
    req.path.startsWith("/stage-services") ||
    req.path.startsWith("/spectators") ||
    req.path.startsWith("/kcp") ||
    req.path.startsWith("/webhooks")
  ) {
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("Pragma", "no-cache");
  }

  next();
});

app.use(function (req, res, next) {
  const origin = normalizeText(req.headers.origin);
  const isAllowedOrigin = Boolean(origin) && corsAllowedOrigins.includes(origin);

  if (isAllowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  if (req.method === "OPTIONS") {
    return isAllowedOrigin ? res.status(204).end() : res.status(403).end();
  }

  next();
});

app.use(express.static("public"));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));

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
  KCP: "kcp",
});
const validPaymentProviders = new Set(Object.values(paymentProviders));
const defaultPaymentProvider = paymentProviders.KCP;
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
const kcpPaymentCancelUrl =
  kcpMode === "production"
    ? "https://spl.kcp.co.kr/gw/mod/v1/cancel"
    : "https://stg-spl.kcp.co.kr/gw/mod/v1/cancel";
const kcpPaymentInquiryUrl =
  kcpMode === "production"
    ? "https://spl.kcp.co.kr/std/inquery"
    : "https://stg-spl.kcp.co.kr/std/inquery";
const kcpSiteCode = normalizeText(process.env.KCP_SITE_CD) || "T0000";
const kcpTestPaymentEnabled = process.env.KCP_TEST_PAYMENT_ENABLED === "true";
const kcpTestPaymentToken = normalizeText(process.env.KCP_TEST_PAYMENT_TOKEN);
const kcpRequestTimeoutMs = Math.max(1000, Number(process.env.KCP_REQUEST_TIMEOUT_MS || 15000));
const publicBaseUrl = normalizeBaseUrl(process.env.PUBLIC_BASE_URL);
const publicApiBaseUrl = normalizeBaseUrl(process.env.PUBLIC_API_BASE_URL);

async function ensurePaymentProviderColumnsReady() {
  const requiredColumns = new Map([
    ["orders", new Set(["payment_provider", "payment_method"])],
    ["payments", new Set(["payment_provider", "provider_payment_id"])],
    ["payment_webhook_events", new Set(["payment_provider"])],
  ]);
  const schemaResult = await pool.query(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [Array.from(requiredColumns.keys())]
  );

  for (const row of schemaResult.rows) {
    requiredColumns.get(row.table_name)?.delete(row.column_name);
  }

  const missingColumns = Array.from(requiredColumns.entries()).flatMap(
    ([tableName, columnNames]) =>
      Array.from(columnNames).map((columnName) => `${tableName}.${columnName}`)
  );

  if (missingColumns.length > 0) {
    throw new Error(
      `Payment database schema is not ready: ${missingColumns.join(", ")}`
    );
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
      return {
        ok: false,
        status: 503,
        message: "KCP payment is disabled",
      };
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

const allowedKcpCheckoutPaymentMethods = new Set(["CARD", "TRANSFER"]);

function getRequestPublicOrigin(req) {
  return publicBaseUrl || `${req.protocol}://${req.get("host")}`;
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

function buildKcpFailureUrl(req, params = {}) {
  const url = new URL("kcp/fail", `${getRequestPublicApiBaseUrl(req)}/`);

  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

function normalizeKcpPaymentContext(value) {
  const normalized = normalizeText(value);

  if (
    normalized === "stageService" ||
    normalized === "spectator" ||
    normalized === "kcpTest" ||
    normalized === "stageServiceTest" ||
    normalized === "spectatorTest"
  ) {
    return normalized;
  }

  return "application";
}

function getKcpDraftBindingTable(context) {
  if (context === "spectator" || context === "spectatorTest") {
    return "spectator_drafts";
  }
  return context === "stageService" || context === "stageServiceTest"
    ? "stage_service_drafts"
    : "application_drafts";
}

function getKcpSuccessPath(context) {
  switch (context) {
    case "stageService":
      return "/stage-services/payment/success";
    case "spectator":
      return "/spectators/payment/success";
    case "kcpTest":
      return "/kcp-test/success";
    case "stageServiceTest":
      return "/kcp-test/stage-services/success";
    case "spectatorTest":
      return "/kcp-test/spectators/success";
    default:
      return "/payment/success";
  }
}

function getKcpFailPath(context) {
  switch (context) {
    case "stageService":
      return "/stage-services/fail";
    case "spectator":
      return "/spectators/fail";
    case "kcpTest":
      return "/kcp-test/fail";
    case "stageServiceTest":
      return "/kcp-test/stage-services/fail";
    case "spectatorTest":
      return "/kcp-test/spectators/fail";
    default:
      return "/fail";
  }
}

const kcpTestOrderNames = {
  kcpTest: "KCP 100원 테스트 결제",
  stageServiceTest: "KCP 100원 무대 서비스 테스트 결제",
  spectatorTest: "KCP 100원 참관객 입장권 테스트 결제",
};

function isKcpTestContext(context) {
  return (
    context === "kcpTest" ||
    context === "stageServiceTest" ||
    context === "spectatorTest"
  );
}

function isMatchingKcpTestOrder(order, context) {
  return (
    isKcpTestContext(context) &&
    order?.order_name === kcpTestOrderNames[context] &&
    normalizeAmount(order?.amount) === 100
  );
}

function isKcpTestPaymentAuthorized(req) {
  if (!kcpTestPaymentToken) {
    return false;
  }

  const providedToken =
    normalizeText(req.body?.token) ||
    normalizeText(req.query?.token) ||
    normalizeText(req.headers["x-kcp-test-token"]);

  return providedToken === kcpTestPaymentToken;
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
    signal: AbortSignal.timeout(kcpRequestTimeoutMs),
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

async function requestKcpCancellation({
  paymentKey,
  cancelAmount,
  remainingAmount,
  originalAmount,
  reason,
}) {
  const normalizedCancelAmount = normalizeAmount(cancelAmount);
  const normalizedRemainingAmount = normalizeAmount(remainingAmount);
  const normalizedOriginalAmount = normalizeAmount(originalAmount);

  if (
    !paymentKey ||
    normalizedCancelAmount === null ||
    normalizedRemainingAmount === null ||
    normalizedOriginalAmount === null ||
    normalizedCancelAmount > normalizedRemainingAmount
  ) {
    const error = new Error("Invalid KCP cancellation parameters");
    error.statusCode = 400;
    throw error;
  }

  const kcpConfig = assertKcpConfigured();
  const modType =
    normalizedCancelAmount === normalizedRemainingAmount ? "STSC" : "STPC";
  const signatureSource = [kcpSiteCode, paymentKey, modType].join("^");
  const cancelBody = {
    site_cd: kcpSiteCode,
    kcp_cert_info: kcpConfig.certInfo,
    kcp_sign_data: createKcpSignature(
      signatureSource,
      kcpConfig.privateKey,
      kcpConfig.privateKeyPassphrase
    ),
    mod_type: modType,
    tno: paymentKey,
    ...(modType === "STPC"
      ? {
          mod_mny: String(normalizedCancelAmount),
          rem_mny: String(normalizedRemainingAmount),
          mod_desc: normalizeText(reason) || "사용자 요청 환불",
        }
      : {}),
  };
  const { response, json } = await postKcpJson(kcpPaymentCancelUrl, cancelBody);
  const responseCode = getKcpResponseCode(json);
  const responseMessage = getKcpResponseMessage(json);
  const ok = response.ok && responseCode === "0000";
  const nextRemainingAmount =
    modType === "STSC"
      ? 0
      : Number.isInteger(Number(json.rem_mny))
        ? Number(json.rem_mny)
        : normalizedRemainingAmount - normalizedCancelAmount;

  return {
    ok,
    httpStatus: response.status,
    errorCode: ok ? null : responseCode || "KCP_CANCEL_FAILED",
    errorMessage: ok ? null : responseMessage || "KCP 결제 취소에 실패했습니다.",
    result: {
      provider: paymentProviders.KCP,
      status: ok ? (modType === "STSC" ? "CANCELED" : "PARTIAL_CANCELED") : null,
      totalAmount: normalizedOriginalAmount,
      cancelAmount: normalizedCancelAmount,
      remainingAmount: nextRemainingAmount,
      cancelReason: normalizeText(reason),
      canceledAt: json.canc_time || null,
      modificationType: modType,
      kcp: json,
    },
  };
}

function normalizeKcpInquiryPayType(...values) {
  for (const value of values) {
    switch (String(value || "").trim().toUpperCase()) {
      case "PACA":
      case "CARD":
        return "PACA";
      case "PABK":
      case "BANK":
      case "TRANSFER":
        return "PABK";
      case "PAMC":
      case "MOBX":
      case "MOBILE_PHONE":
        return "PAMC";
      default:
        break;
    }
  }

  return null;
}

function parseKcpNonNegativeAmount(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const amount = Number(value);
  return Number.isInteger(amount) && amount >= 0 ? amount : null;
}

function getKcpInquiryTransactionStatus(payload, payType) {
  switch (payType) {
    case "PACA":
      return normalizeText(payload?.stat_ca_cd) || normalizeText(payload?.shop_status);
    case "PABK":
      return normalizeText(payload?.stat_bk_cd) || normalizeText(payload?.shop_status);
    case "PAMC":
      return normalizeText(payload?.stat_hp_cd) || normalizeText(payload?.shop_status);
    default:
      return null;
  }
}

function interpretKcpInquiryResult(payload, payType) {
  const amount = parseKcpNonNegativeAmount(payload?.amount);
  const reportedRemainingAmount = parseKcpNonNegativeAmount(payload?.rem_mny);
  const transactionStatus = getKcpInquiryTransactionStatus(payload, payType);
  const isFullyCanceled =
    transactionStatus === "STSC" ||
    normalizeText(payload?.canc_card_yn) === "Y" ||
    normalizeText(payload?.canc_bk_yn) === "Y" ||
    reportedRemainingAmount === 0;
  const isPartiallyCanceled =
    transactionStatus === "STPC" ||
    (amount !== null &&
      reportedRemainingAmount !== null &&
      reportedRemainingAmount > 0 &&
      reportedRemainingAmount < amount);

  if (amount === null || amount <= 0) {
    return {
      ok: false,
      code: "KCP_INQUIRY_AMOUNT_INVALID",
      message: "KCP 거래조회 금액을 확인할 수 없습니다.",
    };
  }

  if (isFullyCanceled) {
    return {
      ok: true,
      paymentStatus: "CANCELED",
      transactionStatus,
      amount,
      remainingAmount: 0,
      canceledAt: normalizeText(payload?.can_time),
    };
  }

  if (isPartiallyCanceled) {
    if (reportedRemainingAmount === null) {
      return {
        ok: false,
        code: "KCP_INQUIRY_REMAINING_AMOUNT_INVALID",
        message: "부분취소 후 KCP 취소 가능 금액을 확인할 수 없습니다.",
        transactionStatus,
        amount,
        remainingAmount: null,
      };
    }

    return {
      ok: true,
      paymentStatus: "PARTIAL_CANCELED",
      transactionStatus,
      amount,
      remainingAmount: reportedRemainingAmount,
      canceledAt: normalizeText(payload?.can_time),
    };
  }

  if (transactionStatus === "STSR") {
    return {
      ok: true,
      paymentStatus: "DONE",
      transactionStatus,
      amount,
      remainingAmount: reportedRemainingAmount ?? amount,
      canceledAt: null,
    };
  }

  return {
    ok: false,
    code: "KCP_INQUIRY_STATUS_UNSUPPORTED",
    message: `자동 동기화할 수 없는 KCP 거래상태입니다: ${transactionStatus || "UNKNOWN"}`,
    transactionStatus,
    amount,
    remainingAmount: reportedRemainingAmount,
  };
}

function isSafeKcpReconciliationTransition(currentStatus, nextStatus) {
  const normalizedCurrentStatus =
    currentStatus === "PAID" ? "DONE" : normalizeText(currentStatus);

  if (normalizedCurrentStatus === nextStatus) {
    return true;
  }

  if (normalizedCurrentStatus === "DONE") {
    return nextStatus === "PARTIAL_CANCELED" || nextStatus === "CANCELED";
  }

  return normalizedCurrentStatus === "PARTIAL_CANCELED" && nextStatus === "CANCELED";
}

async function requestKcpTransactionInquiry({ paymentKey, payType }) {
  const normalizedPaymentKey = normalizeText(paymentKey);
  const normalizedPayType = normalizeKcpInquiryPayType(payType);

  if (!normalizedPaymentKey || !normalizedPayType) {
    const error = new Error("Invalid KCP inquiry parameters");
    error.statusCode = 400;
    throw error;
  }

  const kcpConfig = assertKcpConfigured();
  const signatureSource = [kcpSiteCode, normalizedPaymentKey, normalizedPayType].join("^");
  const inquiryBody = {
    site_cd: kcpSiteCode,
    kcp_cert_info: kcpConfig.certInfo,
    kcp_sign_data: createKcpSignature(
      signatureSource,
      kcpConfig.privateKey,
      kcpConfig.privateKeyPassphrase
    ),
    tno: normalizedPaymentKey,
    pay_type: normalizedPayType,
  };
  const { response, json } = await postKcpJson(kcpPaymentInquiryUrl, inquiryBody);
  const responseCode = getKcpResponseCode(json);
  const responseMessage = getKcpResponseMessage(json);
  const ok = response.ok && responseCode === "0000";

  return {
    ok,
    httpStatus: response.status,
    errorCode: ok ? null : responseCode || "KCP_INQUIRY_FAILED",
    errorMessage: ok ? null : responseMessage || "KCP 거래조회에 실패했습니다.",
    result: json,
  };
}

async function getKcpReconciliationSnapshot(db, orderId, { lock = false } = {}) {
  const lockClause = lock ? "FOR UPDATE" : "";
  const orderResult = await db.query(
    `
      SELECT
        order_id,
        amount,
        status,
        payment_provider,
        payment_method
      FROM orders
      WHERE order_id = $1
      LIMIT 1
      ${lockClause}
    `,
    [orderId]
  );

  if (orderResult.rowCount === 0) {
    return {
      order: null,
      payment: null,
    };
  }

  const paymentResult = await db.query(
    `
      SELECT
        order_id,
        payment_key,
        provider_payment_id,
        payment_provider,
        method,
        payment_type,
        status,
        total_amount,
        approved_at,
        updated_at
      FROM payments
      WHERE order_id = $1
        AND payment_provider = 'kcp'
      ORDER BY updated_at DESC
      LIMIT 1
      ${lockClause}
    `,
    [orderId]
  );

  return {
    order: orderResult.rows[0],
    payment: paymentResult.rows[0] || null,
  };
}

function getKcpResponseCode(payload) {
  return payload?.res_cd || payload?.Code || payload?.code || null;
}

function getKcpResponseMessage(payload) {
  return payload?.res_msg || payload?.Message || payload?.message || null;
}

function getKcpApprovedOrderId(payload) {
  return (
    normalizeText(payload?.order_no) ||
    normalizeText(payload?.ordr_idxx) ||
    normalizeText(payload?.ordr_no) ||
    normalizeText(payload?.orderId) ||
    null
  );
}

function getKcpApprovedAmount(payload) {
  const candidate =
    payload?.amount ??
    payload?.good_mny ??
    payload?.ordr_mony ??
    payload?.card_mny ??
    payload?.total_amount ??
    null;
  const amount = Number(candidate);

  return Number.isInteger(amount) && amount > 0 ? amount : null;
}

//주문 식별 생성 헬퍼
function generateOrderId(){
  return `order_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
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
  return `draft_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
}

function generateApplicationNumber() {
  return `APPL-${new Date().getFullYear()}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

// Draft API 정규화
function normalizeText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function truncateNormalizedText(value, maxLength) {
  const normalized = normalizeText(value);
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeDisciplineAlias(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getCanonicalApplicationDisciplineTitle({ imageKey, discipline } = {}) {
  if (imageKey && applicationDisciplineDefinitionByImageKey.has(imageKey)) {
    return applicationDisciplineDefinitionByImageKey.get(imageKey).title;
  }

  const normalizedAlias = normalizeDisciplineAlias(discipline);

  if (normalizedAlias && applicationDisciplineDefinitionByAlias.has(normalizedAlias)) {
    return applicationDisciplineDefinitionByAlias.get(normalizedAlias).title;
  }

  return discipline || null;
}

function normalizeApplicationSelection(selection = {}) {
  return {
    ...selection,
    discipline: getCanonicalApplicationDisciplineTitle({
      imageKey: selection.imageKey,
      discipline: selection.discipline,
    }),
  };
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

function getKoreaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function getPositiveInteger(value, fallback = 0) {
  const amount = Number(value);
  return Number.isInteger(amount) && amount > 0 ? amount : fallback;
}

function resolveApplicationBaseFee(imageKey, date = new Date()) {
  const defaultAmount = getPositiveInteger(applicationEntryFeeConfig.defaultAmount);
  const entryFeeItems = Array.isArray(applicationEntryFeeConfig.items)
    ? applicationEntryFeeConfig.items
    : [];
  const entryFeeSchedule = Array.isArray(applicationEntryFeeConfig.schedule)
    ? applicationEntryFeeConfig.schedule
    : [];
  const item = entryFeeItems.find((candidate) => candidate.imageKey === imageKey);
  const itemAmount = getPositiveInteger(item?.amount, defaultAmount);
  const dateKey = getKoreaDateKey(date);
  const schedule =
    entryFeeSchedule.find(
      (candidate) => dateKey >= candidate.startDate && dateKey <= candidate.endDate
    ) || null;
  const scheduledAmount = getPositiveInteger(
    schedule?.disciplineAmounts?.[imageKey] ?? schedule?.amount,
    itemAmount
  );
  const originalAmount = getPositiveInteger(schedule?.displayOriginalAmount);

  return {
    amount: scheduledAmount,
    originalAmount,
    isDiscounted: originalAmount > scheduledAmount,
    isRegistrationOpen: Boolean(schedule),
    periodId: schedule?.id || "standard",
    periodLabel: schedule?.label || "상시",
    periodLabelEn: schedule?.labelEn || "Standard",
  };
}

function getSpectatorSalesStatus(date = new Date()) {
  const dateKey = getKoreaDateKey(date);
  const startDate = normalizeText(spectatorTicketConfig.salesStartDate);
  const endDate = normalizeText(spectatorTicketConfig.salesEndDate);
  return {
    isOpen: Boolean(startDate && endDate && dateKey >= startDate && dateKey <= endDate),
    dateKey,
    startDate,
    endDate,
  };
}

async function getApplicationEntryFeeQuote({ queryable = pool, name, phone, email, imageKey }) {
  const completedApplicationResult = await queryable.query(
    `
      SELECT COUNT(*)::int AS count
      FROM applications
      WHERE name = $1
        AND phone = $2
        AND LOWER(email) = $3
        AND payment_status = 'DONE'
        AND division <> 'TEST'
        AND admin_deleted_at IS NULL
    `,
    [name, phone, email]
  );
  const completedApplicationCount = completedApplicationResult.rows[0]?.count || 0;
  const baseFee = resolveApplicationBaseFee(imageKey);
  const additionalAmount = getPositiveInteger(
    applicationEntryFeeConfig.additionalDisciplineAmount
  );
  // A paid order keeps its charged amount. Refunds only affect quotes created later.
  const hasCompletedApplication = completedApplicationCount > 0;
  const isAdditional = hasCompletedApplication;

  return {
    ...baseFee,
    amount: isAdditional ? additionalAmount : baseFee.amount,
    originalAmount: isAdditional ? 0 : baseFee.originalAmount,
    isDiscounted: isAdditional ? false : baseFee.isDiscounted,
    isAdditional,
    completedApplicationCount,
    additionalDisciplineAmount: additionalAmount,
  };
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
      let value;

      try {
        value = decodeURIComponent(pair.slice(separatorIndex + 1).trim());
      } catch (_error) {
        return accumulator;
      }

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

function createPaymentResultAccessCookie(token) {
  return serializeCookie(paymentResultCookieName, token, {
    maxAge: paymentResultAccessTtlHours * 60 * 60,
    path: "/",
    sameSite: "Lax",
    secure: adminCookieSecure,
  });
}

function createDraftAccessCookie(token, cookieName) {
  return serializeCookie(cookieName, token, {
    maxAge: draftAccessTtlHours * 60 * 60,
    path: "/",
    sameSite: "Lax",
    secure: adminCookieSecure,
  });
}

function createApplicationEmailVerificationCookie(token) {
  return serializeCookie(applicationEmailVerificationCookieName, token, {
    maxAge: lookupVerificationSessionTtlMinutes * 60,
    path: "/",
    sameSite: "Lax",
    secure: adminCookieSecure,
  });
}

function issueDraftAccessCookie(res, { draftId, draftType, cookieName }) {
  const token = createDraftAccessToken({
    draftId,
    draftType,
    secret: paymentResultTokenSecret,
    ttlSeconds: draftAccessTtlHours * 60 * 60,
  });
  res.setHeader("Set-Cookie", createDraftAccessCookie(token, cookieName));
}

function validateRequestDraftAccess(req, { draftId, draftType, cookieName }) {
  return validateDraftAccess({
    providedToken: normalizeText(parseCookies(req.headers.cookie)[cookieName]),
    draftId,
    draftType,
    secret: paymentResultTokenSecret,
  });
}

function requireRequestDraftAccess(req, res, options) {
  if (!hasTrustedWriteOrigin(req)) {
    res.status(403).json({
      ok: false,
      code: "UNTRUSTED_REQUEST_ORIGIN",
      message: "허용되지 않은 요청 출처입니다.",
    });
    return false;
  }

  const validation = validateRequestDraftAccess(req, options);

  if (!validation.ok) {
    res.status(403).json(validation);
    return false;
  }

  return true;
}

function getPaymentResultAccessToken(req) {
  return normalizeText(parseCookies(req.headers.cookie)[paymentResultCookieName]);
}

function getApplicationEmailVerificationToken(req) {
  return normalizeText(
    parseCookies(req.headers.cookie)[applicationEmailVerificationCookieName]
  );
}

function validateOrderPaymentResultAccess(req, order) {
  if (!hasTrustedWriteOrigin(req)) {
    return {
      ok: false,
      code: "UNTRUSTED_REQUEST_ORIGIN",
      message: "허용되지 않은 요청 출처입니다.",
    };
  }

  return validatePaymentResultAccess({
    providedToken: getPaymentResultAccessToken(req),
    orderId: order?.order_id,
    secret: paymentResultTokenSecret,
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
  return Boolean(origin) && adminAllowedOrigins.includes(origin);
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
        sessions.last_seen_at,
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
  const lastSeenAt = row.last_seen_at ? new Date(row.last_seen_at) : null;

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

  if (!lastSeenAt || Date.now() - lastSeenAt.getTime() >= adminSessionIdleMinutes * 60 * 1000) {
    await pool.query(
      `
        DELETE FROM admin_sessions
        WHERE id = $1
      `,
      [row.session_id]
    );

    return {
      status: "idle_expired",
      lastSeenAt,
    };
  }

  return {
    status: "active",
    sessionId: row.session_id,
    adminUserId: row.admin_user_id,
    adminUser: normalizeAdminUser(row),
    expiresAt,
    lastSeenAt,
  };
}

async function requireAdminAuth(req, res, next) {
  try {
    const session = await resolveAdminSession(req);

    if (session.status !== "active") {
      if (session.status === "expired" || session.status === "idle_expired") {
        await writeAdminAuditLog({
          action:
            session.status === "idle_expired"
              ? "ADMIN_SESSION_IDLE_EXPIRED"
              : "ADMIN_SESSION_EXPIRED",
          targetType: "admin_session",
          ipAddress: getRequestIp(req),
          userAgent: getRequestUserAgent(req),
        });
      }

      if (session.status === "expired" || session.status === "idle_expired" || session.status === "inactive") {
        res.setHeader("Set-Cookie", clearCookie(adminSessionCookieName));
      }

      return res.status(401).json({
        ok: false,
        code:
          session.status === "expired"
            ? "ADMIN_SESSION_EXPIRED"
            : session.status === "idle_expired"
              ? "ADMIN_SESSION_IDLE_EXPIRED"
              : "ADMIN_AUTH_REQUIRED",
        message:
          session.status === "expired"
            ? "Admin session has expired"
            : session.status === "idle_expired"
              ? "Admin session expired due to inactivity"
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

function requireSuperAdmin(req, res, next) {
  if (req.adminUser?.role === "superadmin") {
    next();
    return;
  }

  return res.status(403).json({
    ok: false,
    code: "ADMIN_SUPERADMIN_REQUIRED",
    message: "Superadmin permission is required",
  });
}

function normalizeAdminRole(value) {
  const role = normalizeText(value).toLowerCase();
  return ["admin", "superadmin"].includes(role) ? role : null;
}

function normalizeAdminDisplayName(value) {
  return truncateNormalizedText(value, 80);
}

function isValidAdminPassword(value) {
  return String(value || "").length >= 12;
}

function hasValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isVirtualAccountPaymentMethod(value) {
  return ["VIRTUAL_ACCOUNT", "PAVC", "가상계좌"].includes(
    String(value || "").trim()
  );
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
  serviceStatus,
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
  const normalizedServiceStatus = normalizeText(serviceStatus);

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

  if (normalizedServiceStatus && normalizedServiceStatus !== "PURCHASED") {
    return {
      policyVersion: refundPolicy.version,
      policyName: refundPolicy.name,
      eventDate: refundPolicy.eventDate,
      requestedAt: requestedAt.toISOString(),
      timeZone: refundPolicyTimeZone,
      canAutoRefund: false,
      isRefundable: false,
      requiresManualReview: true,
      reasonCode: "STAGE_SERVICE_STATUS_NOT_REFUNDABLE",
      message: "현재 무대 서비스 상태에서는 자동 환불을 처리할 수 없습니다.",
      refundPercent: null,
      refundAmount: null,
      nonRefundableAmount: safeAmount,
    };
  }

  if (!normalizedServiceStatus && normalizedApplicationStatus && normalizedApplicationStatus !== "SUBMITTED") {
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
  return crypto
    .createHmac("sha256", paymentResultTokenSecret)
    .update(`lookup-verification:${String(code)}`)
    .digest("hex");
}

function hashLookupPhoneVerificationCode(code) {
  return crypto
    .createHmac("sha256", paymentResultTokenSecret)
    .update(`lookup-phone-verification:${String(code)}`)
    .digest("hex");
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

function consumeLookupVerificationRateLimit({ action, ipAddress, limit }) {
  const now = Date.now();
  const key = `${action}:${ipAddress || "unknown"}`;
  const existing = lookupVerificationRateStore.get(key);

  if (!existing || now - existing.windowStartedAt >= lookupVerificationRateWindowMs) {
    lookupVerificationRateStore.set(key, { count: 1, windowStartedAt: now });
    return { ok: true };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((lookupVerificationRateWindowMs - (now - existing.windowStartedAt)) / 1000)
      ),
    };
  }

  existing.count += 1;
  return { ok: true };
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
let lookupPhoneVerificationStoreReadyPromise = null;

async function ensureLookupVerificationStoreReady() {
  if (!lookupVerificationStoreReadyPromise) {
    lookupVerificationStoreReadyPromise = (async function () {
      const tableResult = await pool.query(
        "SELECT to_regclass('public.application_lookup_email_verifications') AS table_name"
      );

      if (!tableResult.rows[0]?.table_name) {
        throw new Error(
          "Lookup verification database schema is not ready. Apply the lookup verification migration."
        );
      }
    })().catch((error) => {
      lookupVerificationStoreReadyPromise = null;
      throw error;
    });
  }

  return lookupVerificationStoreReadyPromise;
}

async function ensureLookupPhoneVerificationStoreReady() {
  if (!lookupPhoneVerificationStoreReadyPromise) {
    lookupPhoneVerificationStoreReadyPromise = (async function () {
      const tableResult = await pool.query(
        "SELECT to_regclass('public.application_lookup_phone_verifications') AS table_name"
      );

      if (!tableResult.rows[0]?.table_name) {
        throw new Error(
          "Lookup phone verification database schema is not ready. Apply the phone lookup verification migration."
        );
      }
    })().catch((error) => {
      lookupPhoneVerificationStoreReadyPromise = null;
      throw error;
    });
  }

  return lookupPhoneVerificationStoreReadyPromise;
}

async function purgeExpiredLookupVerifications() {
  await pool.query(`
    DELETE FROM application_lookup_email_verifications
    WHERE created_at < NOW() - INTERVAL '3 days'
  `);
}

async function purgeExpiredLookupPhoneVerifications() {
  await pool.query(`
    DELETE FROM application_lookup_phone_verifications
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

async function hasVerifiedLookupPhoneSession({ name, phone, verificationToken }) {
  const verificationResult = await pool.query(
    `
      SELECT id
      FROM application_lookup_phone_verifications
      WHERE name = $1
        AND phone = $2
        AND verification_token = $3
        AND status = 'VERIFIED'
        AND verified_at >= NOW() - ($4::text || ' minutes')::interval
      LIMIT 1
    `,
    [name, phone, verificationToken, String(lookupVerificationSessionTtlMinutes)]
  );

  return verificationResult.rowCount > 0;
}

function createApplicationEmailVerificationToken({
  name,
  email,
  status,
  codeHash = null,
  attemptCount = 0,
  expiresAt = null,
}) {
  const normalizedName = normalizeText(name);
  const normalizedEmail = normalizeEmail(email);
  const normalizedStatus = normalizeText(status);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const resolvedExpiresAt = Number.isInteger(expiresAt)
    ? expiresAt
    : nowSeconds + lookupVerificationCodeTtlMinutes * 60;

  if (
    !normalizedName ||
    !normalizedEmail ||
    !paymentResultTokenSecret ||
    !["PENDING", "VERIFIED"].includes(normalizedStatus) ||
    !Number.isInteger(attemptCount) ||
    attemptCount < 0 ||
    resolvedExpiresAt <= nowSeconds
  ) {
    throw new Error("Invalid application email verification token configuration");
  }

  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      typ: "application-email-verification",
      name: normalizedName,
      email: normalizedEmail,
      status: normalizedStatus,
      codeHash,
      attemptCount,
      exp: resolvedExpiresAt,
      nonce: crypto.randomBytes(16).toString("base64url"),
    }),
    "utf8"
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", paymentResultTokenSecret)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

function validateApplicationEmailVerificationToken({
  providedToken,
  name,
  email,
  requiredStatus,
}) {
  const normalizedToken = normalizeText(providedToken);
  const normalizedName = normalizeText(name);
  const normalizedEmail = normalizeEmail(email);
  const normalizedStatus = normalizeText(requiredStatus);

  if (!normalizedToken || !normalizedName || !normalizedEmail || !paymentResultTokenSecret) {
    return { ok: false };
  }

  const [payload, providedSignature, ...extraParts] = normalizedToken.split(".");

  if (!payload || !providedSignature || extraParts.length > 0) {
    return { ok: false };
  }

  const expectedSignature = crypto
    .createHmac("sha256", paymentResultTokenSecret)
    .update(payload)
    .digest("base64url");
  const providedBuffer = Buffer.from(providedSignature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return { ok: false };
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

    if (
      decoded?.v !== 1 ||
      decoded?.typ !== "application-email-verification" ||
      decoded?.name !== normalizedName ||
      decoded?.email !== normalizedEmail ||
      decoded?.status !== normalizedStatus ||
      !Number.isInteger(decoded?.exp) ||
      decoded.exp <= Math.floor(Date.now() / 1000)
    ) {
      return { ok: false };
    }

    return { ok: true, payload: decoded };
  } catch (_error) {
    return { ok: false };
  }
}

async function consumeVerifiedLookupSession(client, { name, email, verificationToken }) {
  const verificationResult = await client.query(
    `
      UPDATE application_lookup_email_verifications
      SET
        status = 'CONSUMED',
        updated_at = NOW()
      WHERE id = (
        SELECT id
        FROM application_lookup_email_verifications
        WHERE name = $1
          AND email = $2
          AND verification_token = $3
          AND status = 'VERIFIED'
          AND verified_at >= NOW() - ($4::text || ' minutes')::interval
        ORDER BY verified_at DESC
        LIMIT 1
        FOR UPDATE
      )
      RETURNING id
    `,
    [name, email, verificationToken, String(lookupVerificationSessionTtlMinutes)]
  );

  return verificationResult.rowCount > 0;
}

async function consumeVerifiedLookupPhoneSession(client, { name, phone, verificationToken }) {
  const verificationResult = await client.query(
    `
      UPDATE application_lookup_phone_verifications
      SET
        -- The phone verification schema accepts PENDING, VERIFIED, EXPIRED, and FAILED.
        -- Expiring the verified row invalidates it immediately after a completed refund.
        status = 'EXPIRED',
        updated_at = NOW()
      WHERE id = (
        SELECT id
        FROM application_lookup_phone_verifications
        WHERE name = $1
          AND phone = $2
          AND verification_token = $3
          AND status = 'VERIFIED'
          AND verified_at >= NOW() - ($4::text || ' minutes')::interval
        ORDER BY verified_at DESC
        LIMIT 1
        FOR UPDATE
      )
      RETURNING id
    `,
    [name, phone, verificationToken, String(lookupVerificationSessionTtlMinutes)]
  );

  return verificationResult.rowCount > 0;
}

async function resolveLookupVerificationAccess({ name, email, phone, verificationToken }) {
  const normalizedName = normalizeText(name);
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizeText(formatPhoneNumber(phone));
  const normalizedVerificationToken = normalizeText(verificationToken);

  if (!normalizedName || !normalizedVerificationToken || Boolean(normalizedEmail) === Boolean(normalizedPhone)) {
    return {
      ok: false,
      statusCode: 400,
      message: "이름과 이메일 또는 휴대전화 SMS 인증 정보를 정확히 입력해 주세요.",
    };
  }

  if (normalizedEmail) {
    if (!hasValidEmail(normalizedEmail)) {
      return { ok: false, statusCode: 400, message: "유효한 이메일 주소를 입력해 주세요." };
    }

    const verified = await hasVerifiedLookupSession({
      name: normalizedName,
      email: normalizedEmail,
      verificationToken: normalizedVerificationToken,
    });

    return verified
      ? {
          ok: true,
          method: "email",
          name: normalizedName,
          email: normalizedEmail,
          phone: "",
          verificationToken: normalizedVerificationToken,
        }
      : {
          ok: false,
          statusCode: 403,
          message: "이메일 인증이 만료되었거나 유효하지 않습니다. 다시 인증해 주세요.",
        };
  }

  if (normalizedPhone.replace(/\D/g, "").length !== 11) {
    return { ok: false, statusCode: 400, message: "유효한 휴대전화 번호를 입력해 주세요." };
  }

  await ensureLookupPhoneVerificationStoreReady();
  await purgeExpiredLookupPhoneVerifications();

  const verified = await hasVerifiedLookupPhoneSession({
    name: normalizedName,
    phone: normalizedPhone,
    verificationToken: normalizedVerificationToken,
  });

  return verified
    ? {
        ok: true,
        method: "phone",
        name: normalizedName,
        email: "",
        phone: normalizedPhone,
        verificationToken: normalizedVerificationToken,
      }
    : {
        ok: false,
        statusCode: 403,
        message: "SMS 인증이 만료되었거나 유효하지 않습니다. 다시 인증해 주세요.",
      };
}

async function consumeVerifiedLookupAccess(client, access) {
  if (access.method === "phone") {
    return consumeVerifiedLookupPhoneSession(client, access);
  }

  return consumeVerifiedLookupSession(client, access);
}

async function consumeCompletedRefundLookupAccess(client, access) {
  try {
    const consumed = await consumeVerifiedLookupAccess(client, access);

    if (!consumed) {
      console.warn("Refund completed without consuming lookup verification", { method: access.method });
    }
  } catch (error) {
    // The KCP cancellation has already succeeded. Do not roll back a completed refund if the one-time lookup token cannot be cleared.
    console.error("Failed to consume lookup verification after completed refund:", error);
  }
}

async function findLookupOwnedApplication({ name, email, phone, applicationNumber }) {
  const isPhoneLookup = Boolean(phone);
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
        AND ${isPhoneLookup ? "applications.phone = $3" : "LOWER(applications.email) = $3"}
        AND applications.admin_deleted_at IS NULL
      LIMIT 1
    `,
    [applicationNumber, name, isPhoneLookup ? phone : email]
  );

  return result.rows[0] || null;
}

function isPaymentOrderExpired(createdAt, now = Date.now()) {
  const createdAtMs = new Date(createdAt).getTime();

  return (
    !Number.isFinite(createdAtMs) ||
    createdAtMs + paymentOrderTtlMinutes * 60 * 1000 <= now
  );
}

async function releaseReusableDraftOrder({
  client,
  draftTable,
  draftId,
  orderId,
  replacePendingOrder = false,
}) {
  const orderResult = await client.query(
    `
      SELECT order_id, status, created_at
      FROM orders
      WHERE order_id = $1
      FOR UPDATE
    `,
    [orderId]
  );
  const order = orderResult.rows[0] || null;

  if (!order) {
    await client.query(
      `
        UPDATE ${draftTable}
        SET order_id = NULL, status = 'DRAFT', updated_at = NOW()
        WHERE draft_id = $1
          AND order_id = $2
      `,
      [draftId, orderId]
    );
    return { reusable: true, reason: "ORDER_NOT_FOUND" };
  }

  if (
    order.status === "READY" &&
    (isPaymentOrderExpired(order.created_at) || replacePendingOrder)
  ) {
    await client.query(
      `
        UPDATE orders
        SET status = 'CANCELED', updated_at = NOW()
        WHERE order_id = $1
          AND status = 'READY'
      `,
      [order.order_id]
    );
    await client.query(
      `
        UPDATE ${draftTable}
        SET order_id = NULL, status = 'DRAFT', updated_at = NOW()
        WHERE draft_id = $1
          AND order_id = $2
      `,
      [draftId, order.order_id]
    );
    return {
      reusable: true,
      reason: replacePendingOrder ? "ORDER_REPLACED" : "ORDER_EXPIRED",
    };
  }

  if (["FAILED", "CANCELED"].includes(order.status)) {
    await client.query(
      `
        UPDATE ${draftTable}
        SET order_id = NULL, status = 'DRAFT', updated_at = NOW()
        WHERE draft_id = $1
          AND order_id = $2
      `,
      [draftId, order.order_id]
    );
    return { reusable: true, reason: order.status };
  }

  return { reusable: false, order };
}

async function cancelPendingDraftOrder({ draftTable, draftId, orderId }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const draftResult = await client.query(
      `
        SELECT draft_id, order_id, status
        FROM ${draftTable}
        WHERE draft_id = $1
        FOR UPDATE
      `,
      [draftId]
    );
    const draft = draftResult.rows[0] || null;

    if (!draft || draft.order_id !== orderId) {
      await client.query("ROLLBACK");
      return { ok: false, code: "KCP_DRAFT_ORDER_MISMATCH" };
    }

    const orderResult = await client.query(
      `
        SELECT order_id, status
        FROM orders
        WHERE order_id = $1
        FOR UPDATE
      `,
      [orderId]
    );
    const order = orderResult.rows[0] || null;

    if (!order) {
      await client.query("ROLLBACK");
      return { ok: false, code: "ORDER_NOT_FOUND" };
    }

    if (order.status === "PAID") {
      await client.query("ROLLBACK");
      return { ok: false, code: "PAYMENT_ALREADY_COMPLETED" };
    }

    if (order.status === "READY") {
      await client.query(
        `
          UPDATE orders
          SET status = 'CANCELED', updated_at = NOW()
          WHERE order_id = $1
            AND status = 'READY'
        `,
        [orderId]
      );
    }

    if (["READY", "FAILED", "CANCELED"].includes(order.status)) {
      await client.query(
        `
          UPDATE ${draftTable}
          SET order_id = NULL, status = 'DRAFT', updated_at = NOW()
          WHERE draft_id = $1
            AND order_id = $2
        `,
        [draftId, orderId]
      );
    }

    await client.query("COMMIT");
    return { ok: true, orderId, status: "CANCELED" };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function releaseCanceledKcpDraftOrder({ context, draftId, orderId }) {
  if (!draftId || !orderId) {
    return;
  }

  try {
    await cancelPendingDraftOrder({
      draftTable: getKcpDraftBindingTable(context),
      draftId,
      orderId,
    });
  } catch (error) {
    console.error("Failed to release canceled KCP order:", error);
  }
}

async function findCompletedDuplicateApplication({ client = pool, name, phone, email, imageKey }) {
  const result = await client.query(
    `
      SELECT application_number
      FROM applications
      WHERE name = $1
        AND phone = $2
        AND LOWER(email) = $3
        AND image_key = $4
        AND division <> 'TEST'
        AND payment_status = 'DONE'
        AND admin_deleted_at IS NULL
      LIMIT 1
    `,
    [name, phone, email, imageKey]
  );

  return result.rows[0] || null;
}

async function findLookupOwnedStageService({ name, email, phone, serviceOrderNumber }) {
  const isPhoneLookup = Boolean(phone);
  const result = await pool.query(
    `
      SELECT
        stage_service_orders.service_order_number,
        stage_service_orders.order_id,
        stage_service_orders.payment_key,
        stage_service_orders.payment_status,
        stage_service_orders.service_status,
        stage_service_orders.service_type,
        stage_service_orders.name,
        stage_service_orders.phone,
        stage_service_orders.email,
        stage_service_orders.linked_application_number,
        stage_service_orders.linked_discipline,
        stage_service_orders.linked_applications,
        stage_service_orders.total_amount AS service_amount,
        orders.amount AS order_amount,
        orders.payment_provider AS order_payment_provider,
        latest_payment.payment_provider AS latest_payment_provider,
        latest_payment.status AS latest_payment_status,
        latest_payment.method AS latest_payment_method,
        latest_payment.total_amount,
        latest_payment.approved_at,
        latest_payment.created_at AS payment_created_at
      FROM stage_service_orders
      LEFT JOIN orders ON orders.order_id = stage_service_orders.order_id
      LEFT JOIN LATERAL (
        SELECT payment_provider, status, method, total_amount, approved_at, created_at
        FROM payments
        WHERE order_id = stage_service_orders.order_id
        ORDER BY updated_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      ) AS latest_payment ON TRUE
      WHERE stage_service_orders.service_order_number = $1
        AND stage_service_orders.name = $2
        AND ${isPhoneLookup ? "stage_service_orders.phone = $3" : "LOWER(stage_service_orders.email) = $3"}
      LIMIT 1
    `,
    [serviceOrderNumber, name, isPhoneLookup ? phone : email]
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
  const safeName = escapeHtml(name);
  const safeCode = escapeHtml(code);
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <p>${safeName}님, 안녕하세요.</p>
      <p>신청 조회를 위한 이메일 인증번호를 안내드립니다.</p>
      <p style="font-size: 24px; font-weight: 700; letter-spacing: 0.08em;">${safeCode}</p>
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

function createSolapiAuthorizationHeader() {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString("hex");
  const signature = crypto
    .createHmac("sha256", solapiApiSecret)
    .update(`${date}${salt}`)
    .digest("hex");

  return `HMAC-SHA256 apiKey=${solapiApiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

let smsMessagingStoreReadyPromise = null;
const activeSmsCampaignDispatches = new Set();

async function ensureSmsMessagingStoresReady() {
  if (!smsMessagingStoreReadyPromise) {
    smsMessagingStoreReadyPromise = (async function () {
      const result = await pool.query(`
        SELECT
          to_regclass('public.sms_campaigns') AS campaigns_table,
          to_regclass('public.sms_message_logs') AS messages_table,
          to_regclass('public.sms_marketing_opt_outs') AS opt_outs_table
      `);
      const stores = result.rows[0] || {};

      if (!stores.campaigns_table || !stores.messages_table || !stores.opt_outs_table) {
        throw new Error("SMS messaging database schema is not ready. Apply the SMS messaging migration.");
      }
    })().catch((error) => {
      smsMessagingStoreReadyPromise = null;
      throw error;
    });
  }

  return smsMessagingStoreReadyPromise;
}

function assertSolapiConfigured() {
  if (!solapiApiKey || !solapiApiSecret || !solapiSenderNumber) {
    throw new Error("SOLAPI is not configured");
  }
}

function normalizeSmsRecipientPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

async function sendSolapiMessages(messages) {
  assertSolapiConfigured();

  const normalizedMessages = Array.isArray(messages)
    ? messages
        .map((message) => ({
          to: normalizeSmsRecipientPhone(message?.to),
          text: normalizeText(message?.text),
        }))
        .filter((message) => message.to.length === 11 && message.text)
    : [];

  if (!normalizedMessages.length) {
    throw new Error("No valid SMS recipients");
  }

  const response = await fetch("https://api.solapi.com/messages/v4/send-many/detail", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: createSolapiAuthorizationHeader(),
    },
    body: JSON.stringify({
      messages: normalizedMessages.map((message) => ({
          to: message.to,
          from: solapiSenderNumber,
          type: "LMS",
          text: message.text,
        })),
    }),
  });
  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("SOLAPI message send failed:", {
      status: response.status,
      errorCode: responseBody?.errorCode || null,
    });
    throw new Error("SOLAPI message delivery failed");
  }

  return responseBody;
}

async function sendLookupPhoneVerificationMessage({ phone, code }) {
  await sendSolapiMessages([
    {
      to: phone,
      text: `[${solapiBrandName}] 신청 조회 인증번호는 ${code}입니다. ${lookupVerificationCodeTtlMinutes}분 내에 입력해 주세요.`,
    },
  ]);
}

function formatSmsAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toLocaleString("ko-KR")}원` : "-";
}

function createRefundCompletedSmsText({ name, targetTitle, refundAmount }) {
  return [
    `[${solapiBrandName}] ${name}님`,
    `${targetTitle} 환불이 완료되었습니다.`,
    `환불 금액: ${formatSmsAmount(refundAmount)}`,
    "실제 환불 반영 시점은 결제수단 처리 상황에 따라 다를 수 있습니다.",
  ].join("\n");
}

function normalizeSmsCampaignKind(value) {
  const normalized = normalizeText(value).toUpperCase();
  return normalized === "MARKETING" ? "MARKETING" : normalized === "NOTICE" ? "NOTICE" : "";
}

function normalizeSmsCampaignAudience(value) {
  const normalized = normalizeText(value).toUpperCase();
  return ["ALL_PAID", "APPLICATIONS", "STAGE_SERVICES", "SPECTATORS", "MARKETING_CONSENTED"].includes(normalized)
    ? normalized
    : "";
}

function normalizeSmsCampaignContent(value) {
  const content = String(value || "").replace(/\r\n?/g, "\n").trim();
  return content.slice(0, 1000);
}

function buildSmsCampaignMessage({ kind, content }) {
  if (kind === "MARKETING") {
    if (!solapiMarketingOptOutText) {
      throw new Error("마케팅 문자 발송용 수신 거부 안내가 설정되지 않았습니다.");
    }

    return `(광고) ${solapiBrandName}\n${content}\n무료 수신거부: ${solapiMarketingOptOutText}`;
  }

  return `[${solapiBrandName}] ${content}`;
}

async function getSmsCampaignRecipients({ kind, audience }) {
  const audienceClauses = {
    ALL_PAID: `
      SELECT applications.name, applications.phone, 'APPLICATION'::text AS recipient_source, applications.application_number AS recipient_source_id, 1 AS source_priority
      FROM applications
      WHERE applications.payment_status = 'DONE'
        AND applications.admin_deleted_at IS NULL
        AND COALESCE(applications.division, '') <> 'TEST'
      UNION ALL
      SELECT stage_service_orders.name, stage_service_orders.phone, 'STAGE_SERVICE'::text AS recipient_source, stage_service_orders.service_order_number AS recipient_source_id, 2 AS source_priority
      FROM stage_service_orders
      WHERE stage_service_orders.payment_status = 'DONE'
      UNION ALL
      SELECT spectator_orders.name, spectator_orders.phone, 'SPECTATOR'::text AS recipient_source, spectator_orders.spectator_order_number AS recipient_source_id, 3 AS source_priority
      FROM spectator_orders
      WHERE spectator_orders.payment_status = 'DONE'
        AND spectator_orders.is_test = FALSE
    `,
    APPLICATIONS: `
      SELECT applications.name, applications.phone, 'APPLICATION'::text AS recipient_source, applications.application_number AS recipient_source_id, 1 AS source_priority
      FROM applications
      WHERE applications.payment_status = 'DONE'
        AND applications.admin_deleted_at IS NULL
        AND COALESCE(applications.division, '') <> 'TEST'
    `,
    STAGE_SERVICES: `
      SELECT stage_service_orders.name, stage_service_orders.phone, 'STAGE_SERVICE'::text AS recipient_source, stage_service_orders.service_order_number AS recipient_source_id, 1 AS source_priority
      FROM stage_service_orders
      WHERE stage_service_orders.payment_status = 'DONE'
    `,
    SPECTATORS: `
      SELECT spectator_orders.name, spectator_orders.phone, 'SPECTATOR'::text AS recipient_source, spectator_orders.spectator_order_number AS recipient_source_id, 1 AS source_priority
      FROM spectator_orders
      WHERE spectator_orders.payment_status = 'DONE'
        AND spectator_orders.is_test = FALSE
    `,
    MARKETING_CONSENTED: `
      SELECT applications.name, applications.phone, 'APPLICATION'::text AS recipient_source, applications.application_number AS recipient_source_id, 1 AS source_priority
      FROM applications
      WHERE applications.payment_status = 'DONE'
        AND applications.admin_deleted_at IS NULL
        AND COALESCE(applications.division, '') <> 'TEST'
        AND EXISTS (
          SELECT 1
          FROM application_consents
          WHERE (application_consents.application_id = applications.id OR application_consents.draft_id = applications.draft_id)
            AND application_consents.marketing_consent = TRUE
        )
      UNION ALL
      SELECT spectator_orders.name, spectator_orders.phone, 'SPECTATOR'::text AS recipient_source, spectator_orders.spectator_order_number AS recipient_source_id, 2 AS source_priority
      FROM spectator_orders
      WHERE spectator_orders.payment_status = 'DONE'
        AND spectator_orders.is_test = FALSE
        AND EXISTS (
          SELECT 1
          FROM spectator_consents
          WHERE (spectator_consents.spectator_order_id = spectator_orders.id OR spectator_consents.draft_id = spectator_orders.draft_id)
            AND spectator_consents.marketing_consent = TRUE
        )
    `,
  };
  const sourceSql = audienceClauses[audience];

  if (!sourceSql || (kind === "MARKETING" && audience !== "MARKETING_CONSENTED")) {
    throw new Error("문자 발송 대상 설정이 올바르지 않습니다.");
  }

  const result = await pool.query(
    `
      WITH candidates AS (
        ${sourceSql}
      ), normalized_candidates AS (
        SELECT
          name,
          regexp_replace(phone, '\\D', '', 'g') AS phone,
          recipient_source,
          recipient_source_id,
          source_priority
        FROM candidates
      ), deduplicated AS (
        SELECT DISTINCT ON (phone)
          name,
          phone,
          recipient_source,
          recipient_source_id,
          source_priority
        FROM normalized_candidates
        WHERE phone ~ '^01[0-9]{9}$'
          ${kind === "MARKETING" ? "AND NOT EXISTS (SELECT 1 FROM sms_marketing_opt_outs WHERE sms_marketing_opt_outs.phone = normalized_candidates.phone)" : ""}
        ORDER BY phone, source_priority, recipient_source_id DESC
      )
      SELECT name, phone, recipient_source, recipient_source_id
      FROM deduplicated
      ORDER BY recipient_source, recipient_source_id DESC
      LIMIT $1
    `,
    [smsCampaignMaxRecipients + 1]
  );

  if (result.rowCount > smsCampaignMaxRecipients) {
    throw new Error(`한 번에 최대 ${smsCampaignMaxRecipients.toLocaleString("ko-KR")}명까지 발송할 수 있습니다.`);
  }

  return result.rows;
}

async function updateSmsCampaignSummary(campaignId) {
  const result = await pool.query(
    `
      SELECT
        COUNT(*)::int AS recipient_count,
        COUNT(*) FILTER (WHERE status = 'SENT')::int AS sent_count,
        COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed_count
      FROM sms_message_logs
      WHERE campaign_id = $1
    `,
    [campaignId]
  );
  const summary = result.rows[0] || {};
  const recipientCount = Number(summary.recipient_count || 0);
  const sentCount = Number(summary.sent_count || 0);
  const failedCount = Number(summary.failed_count || 0);
  const status = failedCount > 0 ? (sentCount > 0 ? "PARTIAL" : "FAILED") : "COMPLETED";

  await pool.query(
    `
      UPDATE sms_campaigns
      SET status = $2, recipient_count = $3, sent_count = $4, failed_count = $5, completed_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `,
    [campaignId, status, recipientCount, sentCount, failedCount]
  );
}

async function dispatchSmsCampaign(campaignId) {
  const normalizedCampaignId = Number(campaignId);
  if (!Number.isInteger(normalizedCampaignId) || activeSmsCampaignDispatches.has(normalizedCampaignId)) {
    return;
  }

  activeSmsCampaignDispatches.add(normalizedCampaignId);

  try {
    await ensureSmsMessagingStoresReady();
    assertSolapiConfigured();
    const campaignResult = await pool.query(
      `
        UPDATE sms_campaigns
        SET status = 'PROCESSING', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
        WHERE id = $1
          AND status IN ('QUEUED', 'FAILED', 'PARTIAL')
        RETURNING id
      `,
      [normalizedCampaignId]
    );

    if (!campaignResult.rowCount) {
      return;
    }

    const messageResult = await pool.query(
      `
        SELECT id, recipient_phone, message_body
        FROM sms_message_logs
        WHERE campaign_id = $1
          AND status IN ('QUEUED', 'FAILED')
        ORDER BY id
      `,
      [normalizedCampaignId]
    );

    for (let index = 0; index < messageResult.rows.length; index += smsCampaignBatchSize) {
      const batch = messageResult.rows.slice(index, index + smsCampaignBatchSize);
      const messageIds = batch.map((message) => message.id);
      await pool.query(
        `UPDATE sms_message_logs SET status = 'PROCESSING', updated_at = NOW() WHERE id = ANY($1::bigint[])`,
        [messageIds]
      );

      try {
        const providerResponse = await sendSolapiMessages(
          batch.map((message) => ({ to: message.recipient_phone, text: message.message_body }))
        );
        await pool.query(
          `
            UPDATE sms_message_logs
            SET status = 'SENT', provider_response_json = $2::jsonb, sent_at = NOW(), updated_at = NOW()
            WHERE id = ANY($1::bigint[])
          `,
          [messageIds, JSON.stringify(providerResponse)]
        );
      } catch (error) {
        await pool.query(
          `
            UPDATE sms_message_logs
            SET status = 'FAILED', error_message = $2, updated_at = NOW()
            WHERE id = ANY($1::bigint[])
          `,
          [messageIds, normalizeText(error.message) || "SOLAPI message delivery failed"]
        );
      }
    }

    await updateSmsCampaignSummary(normalizedCampaignId);
  } catch (error) {
    console.error("Failed to dispatch SMS campaign:", {
      campaignId: normalizedCampaignId,
      message: error.message,
    });
    await pool
      .query(
        `UPDATE sms_campaigns SET status = 'FAILED', failure_message = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [normalizedCampaignId, normalizeText(error.message) || "SMS campaign dispatch failed"]
      )
      .catch(() => undefined);
  } finally {
    activeSmsCampaignDispatches.delete(normalizedCampaignId);
  }
}

async function sendRefundCompletedSms({ eventKey, name, phone, targetTitle, refundAmount }) {
  try {
    await ensureSmsMessagingStoresReady();
    const recipientPhone = normalizeSmsRecipientPhone(phone);

    if (!/^01\d{9}$/.test(recipientPhone)) {
      console.warn("Skipping refund completion SMS for an invalid recipient phone", { eventKey });
      return;
    }

    const messageText = createRefundCompletedSmsText({ name, targetTitle, refundAmount });
    const insertResult = await pool.query(
      `
        INSERT INTO sms_message_logs (
          message_kind, event_key, recipient_name, recipient_phone, recipient_source,
          recipient_source_id, message_body, status
        ) VALUES ('TRANSACTIONAL', $1, $2, $3, 'REFUND', $4, $5, 'QUEUED')
        ON CONFLICT (event_key) DO NOTHING
        RETURNING id
      `,
      [eventKey, name, recipientPhone, eventKey, messageText]
    );

    if (!insertResult.rowCount) {
      return;
    }

    try {
      const providerResponse = await sendSolapiMessages([{ to: recipientPhone, text: messageText }]);
      await pool.query(
        `UPDATE sms_message_logs SET status = 'SENT', provider_response_json = $2::jsonb, sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [insertResult.rows[0].id, JSON.stringify(providerResponse)]
      );
    } catch (error) {
      await pool.query(
        `UPDATE sms_message_logs SET status = 'FAILED', error_message = $2, updated_at = NOW() WHERE id = $1`,
        [insertResult.rows[0].id, normalizeText(error.message) || "SOLAPI message delivery failed"]
      );
    }
  } catch (error) {
    // A notification failure must not roll back a completed payment cancellation.
    console.error("Failed to send refund completion SMS:", {
      eventKey,
      message: error.message,
    });
  }
}

async function sendApplicationEmailVerificationEmail({ email, name, code }) {
  const transporter = getEmailTransporter();
  const subject = `[${emailBrandName}] 대회 신청 이메일 인증번호 안내`;
  const text = `${name}님, 대회 신청 이메일 인증번호는 ${code} 입니다. ${lookupVerificationCodeTtlMinutes}분 내에 입력해 주세요.`;
  const safeName = escapeHtml(name);
  const safeCode = escapeHtml(code);
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <p>${safeName}님, 안녕하세요.</p>
      <p>대회 신청을 위한 이메일 인증번호를 안내드립니다.</p>
      <p style="font-size: 24px; font-weight: 700; letter-spacing: 0.08em;">${safeCode}</p>
      <p>${lookupVerificationCodeTtlMinutes}분 내에 입력해 주세요.</p>
    </div>
  `;

  if (!transporter) {
    if (!allowEmailConsoleFallback) {
      throw new Error("Email provider is not configured");
    }

    console.log(`[application email verification] email=${email} code=${code}`);
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

function decodeLegacyKoreanFilename(filename) {
  const rawFilename = String(filename || "");

  if (!rawFilename || /[가-힣]/.test(rawFilename)) {
    return rawFilename;
  }

  const decodedFilename = Buffer.from(rawFilename, "latin1").toString("utf8");

  if (decodedFilename.includes("\uFFFD") || !/[가-힣]/.test(decodedFilename)) {
    return rawFilename;
  }

  return decodedFilename;
}

function sanitizeOriginalFilename(filename) {
  return path
    .basename(decodeLegacyKoreanFilename(filename))
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
    documentFiles: [],
  };

  for (const row of rows || []) {
    if (isAudioUploadRecord(row)) {
      continue;
    }

    files.documentFiles.push(row);
  }

  files.documentFile = files.documentFiles[0] || null;

  return files;
}

function isAllowedUpload(file) {
  const extension = getUploadExtension(file.originalname);

  return (
    allowedDocumentUploadMimeTypes.has(file.mimetype) &&
    allowedDocumentUploadExtensions.has(extension)
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

  return `applications/${draftId}/document/${Date.now()}_${crypto
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
  return Boolean(origin) && corsAllowedOrigins.includes(origin);
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
    participantGender: row.participant_gender,
    division: row.division,
    discipline: getCanonicalApplicationDisciplineTitle({
      imageKey: row.image_key,
      discipline: row.discipline,
    }),
    imageKey: row.image_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapApplicationRow(row) {
  const paymentAmount = Number(
    row.payment_amount ?? row.total_amount ?? row.order_amount ?? 0
  );

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
    participantGender: row.participant_gender,
    division: row.division,
    discipline: getCanonicalApplicationDisciplineTitle({
      imageKey: row.image_key,
      discipline: row.discipline,
    }),
    imageKey: row.image_key,
    paymentAmount: Number.isFinite(paymentAmount) ? paymentAmount : null,
    paymentCompletedAt: row.approved_at || row.payment_created_at || null,
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
  return `stage_draft_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
}

function generateStageServiceOrderNumber() {
  return `SS-${new Date().getFullYear()}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

async function findLookupOwnedSpectator({ name, email, phone, spectatorOrderNumber }) {
  const isPhoneLookup = Boolean(phone);
  const result = await pool.query(
    `
      SELECT
        spectator_orders.*,
        orders.amount AS order_amount,
        orders.payment_provider AS order_payment_provider,
        latest_payment.payment_provider AS latest_payment_provider,
        latest_payment.status AS latest_payment_status,
        latest_payment.method AS latest_payment_method,
        latest_payment.total_amount,
        latest_payment.approved_at,
        latest_payment.created_at AS payment_created_at
      FROM spectator_orders
      LEFT JOIN orders ON orders.order_id = spectator_orders.order_id
      LEFT JOIN LATERAL (
        SELECT payment_provider, status, method, total_amount, approved_at, created_at
        FROM payments
        WHERE order_id = spectator_orders.order_id
        ORDER BY updated_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      ) AS latest_payment ON TRUE
      WHERE spectator_orders.spectator_order_number = $1
        AND spectator_orders.name = $2
        AND ${isPhoneLookup ? "spectator_orders.phone = $3" : "LOWER(spectator_orders.email) = $3"}
      LIMIT 1
    `,
    [spectatorOrderNumber, name, isPhoneLookup ? phone : email]
  );
  return result.rows[0] || null;
}

function generateSpectatorDraftId() {
  return `spectator_draft_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
}

function generateSpectatorOrderNumber() {
  return `SPCT-${new Date().getFullYear()}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

function validateSpectatorApplicantPayload(body) {
  const name = truncateNormalizedText(body.name, 120);
  const phone = normalizeText(formatPhoneNumber(body.phone));
  const email = normalizeEmail(body.email);

  if (!name || !phone || !email || !hasValidEmail(email)) {
    return { ok: false, message: "성함, 연락처, 이메일을 정확히 입력해 주세요." };
  }

  if (phone.replace(/\D/g, "").length !== 11) {
    return { ok: false, message: "연락처를 정확히 입력해 주세요." };
  }

  return { ok: true, payload: { name, phone, email } };
}

function mapSpectatorDraftRow(row) {
  return {
    draftId: row.draft_id,
    orderId: row.order_id,
    status: row.status,
    name: row.name,
    phone: row.phone,
    email: row.email,
    quantity: row.quantity,
    unitAmount: row.unit_amount,
    totalAmount: row.total_amount,
    isTest: row.is_test === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getRepeatRefundReviewGroup(scope) {
  const groupKey =
    scope === refundRepeatReviewScope.SPECTATOR
      ? refundRepeatReviewScope.SPECTATOR
      : refundRepeatReviewScope.APPLICATION_STAGE_SERVICE;
  const group = refundPolicyRepeatRefundReviewGroups[groupKey] || {};

  return {
    key: groupKey,
    label:
      normalizeText(group.label) ||
      (groupKey === refundRepeatReviewScope.SPECTATOR
        ? "참관객 입장권"
        : "대회 신청 및 무대 서비스"),
    message:
      normalizeText(group.message) ||
      "최근 환불 이력이 반복되어 이번 환불 요청은 운영 확인 후 처리됩니다.",
  };
}

async function getRepeatRefundReview({
  name,
  email,
  scope = refundRepeatReviewScope.APPLICATION_STAGE_SERVICE,
  client = pool,
}) {
  const normalizedName = normalizeText(name);
  const normalizedEmail = normalizeEmail(email);
  const repeatRefundReviewGroup = getRepeatRefundReviewGroup(scope);

  if (!normalizedName || !normalizedEmail) {
    return {
      requiresManualReview: false,
      completedRefundCount: 0,
      windowDays: refundRepeatReviewWindowDays,
      completedRefundThreshold: refundRepeatReviewCompletedThreshold,
      group: repeatRefundReviewGroup,
    };
  }

  const completedRefundSource =
    repeatRefundReviewGroup.key === refundRepeatReviewScope.SPECTATOR
      ? `
          SELECT requested_by_name, requested_by_email, COALESCE(processed_at, created_at) AS completed_at
          FROM spectator_refund_requests
          WHERE request_status = 'COMPLETED'
        `
      : `
          SELECT requested_by_name, requested_by_email, COALESCE(processed_at, created_at) AS completed_at
          FROM application_refund_requests
          WHERE request_status = 'COMPLETED'

          UNION ALL

          SELECT requested_by_name, requested_by_email, COALESCE(processed_at, created_at) AS completed_at
          FROM stage_service_refund_requests
          WHERE request_status = 'COMPLETED'
        `;

  const result = await client.query(
    `
      SELECT COUNT(*)::int AS completed_refund_count
      FROM (${completedRefundSource}) AS completed_refunds
      WHERE lower(trim(requested_by_name)) = lower($1)
        AND lower(trim(requested_by_email)) = $2
        AND completed_at >= NOW() - make_interval(days => $3::int)
    `,
    [normalizedName, normalizedEmail, refundRepeatReviewWindowDays]
  );
  const completedRefundCount = Number(result.rows[0]?.completed_refund_count || 0);

  return {
    requiresManualReview:
      completedRefundCount >= refundRepeatReviewCompletedThreshold,
    completedRefundCount,
    windowDays: refundRepeatReviewWindowDays,
    completedRefundThreshold: refundRepeatReviewCompletedThreshold,
    group: repeatRefundReviewGroup,
  };
}

function applyRepeatRefundReview(refundQuote, repeatRefundReview) {
  if (
    !refundQuote?.canAutoRefund ||
    !refundQuote?.isRefundable ||
    !repeatRefundReview?.requiresManualReview
  ) {
    return refundQuote;
  }

  return {
    ...refundQuote,
    canAutoRefund: false,
    requiresManualReview: true,
    reasonCode: 'REPEATED_REFUND_REVIEW_REQUIRED',
    message:
      normalizeText(repeatRefundReview.group?.message) ||
      '최근 환불 이력이 반복되어 이번 환불 요청은 운영 확인 후 처리됩니다.',
    repeatRefundReview,
  };
}

function mapSpectatorOrderRow(row, { maskPersonalInfo = true } = {}) {
  return {
    spectatorOrderNumber: row.spectator_order_number,
    orderId: row.order_id,
    paymentKey: row.payment_key,
    paymentStatus: row.payment_status,
    admissionStatus: row.admission_status,
    name: row.name,
    phone: maskPersonalInfo ? maskPhone(row.phone) : row.phone,
    email: maskPersonalInfo ? maskEmail(row.email) : row.email,
    quantity: row.quantity,
    unitAmount: row.unit_amount,
    totalAmount: row.total_amount,
    isTest: row.is_test === true,
    purchasedAt: row.purchased_at,
    updatedAt: row.updated_at,
  };
}

async function findCompletedDuplicateSpectator({ queryable = pool, name, phone, email }) {
  const result = await queryable.query(
    `
      SELECT spectator_order_number
      FROM spectator_orders
      WHERE name = $1
        AND phone = $2
        AND LOWER(email) = $3
        AND payment_status = 'DONE'
        AND is_test = FALSE
      LIMIT 1
    `,
    [name, phone, email]
  );
  return result.rows[0] || null;
}

async function getReservedSpectatorTicketCount(queryable = pool) {
  const result = await queryable.query(
    `
      SELECT
        (SELECT COUNT(*)::int FROM spectator_orders WHERE payment_status = 'DONE' AND is_test = FALSE) +
        (SELECT COUNT(*)::int
         FROM spectator_drafts
         JOIN orders ON orders.order_id = spectator_drafts.order_id
         WHERE spectator_drafts.status = 'ORDERED'
           AND spectator_drafts.is_test = FALSE
           AND orders.status = 'READY'
           AND orders.created_at >= NOW() - ($1::text || ' minutes')::interval)
        AS reserved_count
    `,
    [String(paymentOrderTtlMinutes)]
  );
  return Number(result.rows[0]?.reserved_count || 0);
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

function normalizeHairRetouchCount(value) {
  const normalized = typeof value === "string" ? value.trim() : value;

  if (normalized === "" || normalized == null) {
    return 0;
  }

  const count = Number(normalized);

  if (!Number.isInteger(count) || count < 0 || count > 2) {
    return null;
  }

  return count;
}

function getLegacyHairAddOns(hairOptionalOption) {
  return {
    hairBodyMakeup: hairOptionalOption === "BODY_MAKEUP",
    hairPiece: hairOptionalOption === "HAIR_PIECE",
    hairRetouchCount:
      hairOptionalOption === "MALE_RETOUCH" || hairOptionalOption === "FEMALE_RETOUCH" ? 1 : 0,
  };
}

function normalizeStageServiceLinkedApplicationNumbers(value, fallbackValue = null) {
  const values = Array.isArray(value)
    ? value
    : fallbackValue == null
      ? []
      : [fallbackValue];
  const seen = new Set();

  return values.reduce((applicationNumbers, currentValue) => {
    const applicationNumber = normalizeText(currentValue);

    if (applicationNumber && !seen.has(applicationNumber)) {
      seen.add(applicationNumber);
      applicationNumbers.push(applicationNumber);
    }

    return applicationNumbers;
  }, []);
}

function parseStageServiceLinkedApplications(value, fallbackApplication = {}) {
  let parsedValue = value;

  if (typeof value === "string") {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      parsedValue = [];
    }
  }

  const linkedApplications = Array.isArray(parsedValue)
    ? parsedValue
      .map((application) => ({
        applicationNumber: normalizeText(application?.applicationNumber),
        discipline: getCanonicalApplicationDisciplineTitle({ discipline: application?.discipline }),
        participantGender: normalizeText(application?.participantGender),
        weightClass: normalizeText(application?.weightClass),
      }))
      .filter((application) => application.applicationNumber)
    : [];

  if (linkedApplications.length) {
    return linkedApplications.slice(0, 3);
  }

  const applicationNumber = normalizeText(fallbackApplication.applicationNumber);

  return applicationNumber
    ? [{
      applicationNumber,
      discipline: getCanonicalApplicationDisciplineTitle({ discipline: fallbackApplication.discipline }),
      participantGender: normalizeText(fallbackApplication.participantGender),
      weightClass: normalizeText(fallbackApplication.weightClass),
    }]
    : [];
}

function serializeStageServiceLinkedApplications(applications) {
  return JSON.stringify(
    parseStageServiceLinkedApplications(applications).map(({
      applicationNumber,
      discipline,
      participantGender,
      weightClass,
    }) => ({
      applicationNumber,
      discipline,
      participantGender,
      weightClass,
    })),
  );
}

function parseHairAddOns(hairOptionalOption) {
  const rawValue = normalizeText(hairOptionalOption);

  if (!rawValue) {
    return getLegacyHairAddOns(rawValue);
  }

  try {
    const parsed = JSON.parse(rawValue);

    if (parsed?.version === 1) {
      return {
        hairBodyMakeup: parsed.hairBodyMakeup === true,
        hairPiece: parsed.hairPiece === true,
        hairRetouchCount: normalizeHairRetouchCount(parsed.hairRetouchCount) ?? 0,
      };
    }
  } catch {
    // Legacy single-option values are handled below.
  }

  return getLegacyHairAddOns(rawValue);
}

function serializeHairAddOns({ hairBodyMakeup, hairPiece, hairRetouchCount }) {
  if (!hairBodyMakeup && !hairPiece && !hairRetouchCount) {
    return null;
  }

  return JSON.stringify({
    version: 1,
    hairBodyMakeup: hairBodyMakeup === true,
    hairPiece: hairPiece === true,
    hairRetouchCount,
  });
}

function mapStageServiceDraftRow(row) {
  const hairAddOns = parseHairAddOns(row.hair_optional_option);
  const linkedApplications = parseStageServiceLinkedApplications(row.linked_applications, {
    applicationNumber: row.linked_application_number,
    discipline: row.linked_discipline,
  });

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
    linkedDiscipline: getCanonicalApplicationDisciplineTitle({
      discipline: row.linked_discipline,
    }),
    linkedApplications,
    photoHasAdditionalDiscipline: row.photo_has_additional_discipline ? "O" : "X",
    photoAdditionalDiscipline: row.photo_additional_discipline,
    videoType: row.video_type,
    videoAdditionalDiscipline: row.video_additional_discipline,
    hairParticipantDiscipline: row.hair_participant_discipline,
    hairOption: row.hair_option,
    hairAdditionalDiscipline: row.hair_additional_discipline,
    hairOptionalOption: row.hair_optional_option,
    ...hairAddOns,
    totalAmount: row.total_amount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStageServiceOrderRow(row) {
  const hairAddOns = parseHairAddOns(row.hair_optional_option);
  const linkedApplications = parseStageServiceLinkedApplications(row.linked_applications, {
    applicationNumber: row.linked_application_number,
    discipline: row.linked_discipline,
  });

  return {
    serviceOrderNumber: row.service_order_number,
    orderId: row.order_id,
    paymentKey: row.payment_key,
    serviceType: row.service_type,
    name: row.name,
    phone: maskPhone(row.phone),
    email: maskEmail(row.email),
    linkedApplicationNumber: row.linked_application_number,
    linkedDiscipline: getCanonicalApplicationDisciplineTitle({
      discipline: row.linked_discipline,
    }),
    linkedApplications,
    photoHasAdditionalDiscipline: row.photo_has_additional_discipline ? "O" : "X",
    photoAdditionalDiscipline: row.photo_additional_discipline,
    videoType: row.video_type,
    videoAdditionalDiscipline: row.video_additional_discipline,
    hairParticipantDiscipline: row.hair_participant_discipline,
    hairOption: row.hair_option,
    hairAdditionalDiscipline: row.hair_additional_discipline,
    hairOptionalOption: row.hair_optional_option,
    ...hairAddOns,
    totalAmount: row.total_amount,
    paymentStatus: row.payment_status,
    serviceStatus: row.service_status,
    purchasedAt: row.purchased_at,
    updatedAt: row.updated_at,
  };
}

async function getStageServiceSummaryForLookupApplication({
  name,
  phone,
  email,
  applicationNumber,
}) {
  const summaryResult = await pool.query(
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
        linked_applications,
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
      WHERE name = $1
        AND phone = $2
        AND (
          linked_application_number = $3
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(linked_applications, '[]'::jsonb)) AS linked_application
            WHERE linked_application ->> 'applicationNumber' = $3
          )
        )
      ORDER BY purchased_at DESC NULLS LAST, updated_at DESC
    `,
    [name, phone, applicationNumber]
  );
  const purchasedServiceTypes = new Set(
    summaryResult.rows
      .filter((row) => row.payment_status === "DONE")
      .map((row) => row.service_type)
  );

  return {
    hasStagePhoto: purchasedServiceTypes.has("stage-photo"),
    hasStageVideo: purchasedServiceTypes.has("stage-video"),
    hasHairMakeup: purchasedServiceTypes.has("hair-makeup"),
    purchases: summaryResult.rows.map((row) =>
      mapStageServiceOrderRow({
        ...row,
        name,
        phone,
        email,
      })
    ),
  };
}

function calculateStageServiceAmount(payload) {
  if (payload.serviceType === "stage-photo") {
    return Number(getStagePhotoPackage(payload.linkedApplicationNumbers?.length)?.price || 0);
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
    const hairAddOns = {
      ...parseHairAddOns(payload.hairOptionalOption),
      hairBodyMakeup: payload.hairBodyMakeup === true,
      hairPiece: payload.hairPiece === true,
      hairRetouchCount: payload.hairRetouchCount ?? parseHairAddOns(payload.hairOptionalOption).hairRetouchCount,
    };
    const retouchUnitPrice = Number(hairRetouchPrices[selectedHairOption?.gender] || 0);
    const bodyMakeupPrice = Number(hairAddOnMap.get("BODY_MAKEUP")?.price || 0);
    const hairPiecePrice = Number(hairAddOnMap.get("HAIR_PIECE")?.price || 0);

    return Number(selectedHairOption?.price || 0)
      + (hairAddOns.hairBodyMakeup ? bodyMakeupPrice : 0)
      + (hairAddOns.hairPiece ? hairPiecePrice : 0)
      + (Number(hairAddOns.hairRetouchCount || 0) * retouchUnitPrice);
  }

  return 0;
}

function validateStageServiceDraftPayload(body) {
  const serviceType = normalizeStageServiceType(body.serviceType);
  const paymentMethod = normalizeText(body.paymentMethod) || "payment";
  const name = normalizeText(body.name);
  const phone = normalizeText(formatPhoneNumber(body.phone));
  const email = normalizeEmail(body.email);
  const linkedApplicationNumbers = normalizeStageServiceLinkedApplicationNumbers(
    body.linkedApplicationNumbers,
    body.linkedApplicationNumber,
  );

  if (!serviceType) {
    return {
      ok: false,
      message: "Invalid stage service type",
    };
  }

  if (!name || !phone || !email || name.length > 120 || email.length > 255) {
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

  if (!linkedApplicationNumbers.length) {
    return {
      ok: false,
      message: "무대 서비스를 연결할 결제 완료 종목을 선택해 주세요.",
    };
  }

  if (serviceType === "stage-video" && linkedApplicationNumbers.length !== 1) {
    return {
      ok: false,
      message: "해당 무대 서비스는 연결할 종목을 1개만 선택할 수 있습니다.",
    };
  }

  if (serviceType === "stage-photo" && linkedApplicationNumbers.length > 3) {
    return {
      ok: false,
      message: "무대 사진 촬영은 신청한 종목을 최대 3개까지 선택할 수 있습니다.",
    };
  }

  if (serviceType === "hair-makeup" && linkedApplicationNumbers.length > 3) {
    return {
      ok: false,
      message: "헤어&메이크업은 신청한 종목을 최대 3개까지 선택할 수 있습니다.",
    };
  }

  const payload = {
    serviceType,
    paymentMethod,
    name,
    phone,
    email,
    linkedApplicationNumber: linkedApplicationNumbers[0],
    linkedApplicationNumbers,
    linkedApplications: [],
    photoHasAdditionalDiscipline: false,
    photoAdditionalDiscipline: null,
    videoType: null,
    videoAdditionalDiscipline: null,
    hairParticipantDiscipline: null,
    hairOption: null,
    hairAdditionalDiscipline: null,
    hairBodyMakeup: false,
    hairPiece: false,
    hairRetouchCount: 0,
    hairOptionalOption: null,
  };

  if (serviceType === "stage-photo") {
    const stagePhotoPackage = getStagePhotoPackage(linkedApplicationNumbers.length);

    if (!stagePhotoPackage) {
      return {
        ok: false,
        message: "무대 사진 촬영 종목은 1개부터 3개까지 선택해 주세요.",
      };
    }

    payload.photoHasAdditionalDiscipline = linkedApplicationNumbers.length > 1;
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
    payload.hairOption = normalizeText(body.hairOption);
    const hasStructuredHairAddOnFields =
      Object.hasOwn(body, "hairBodyMakeup") ||
      Object.hasOwn(body, "hairPiece") ||
      Object.hasOwn(body, "hairRetouchCount");
    const legacyHairAddOns = parseHairAddOns(body.hairOptionalOption);
    const normalizedRetouchCount = normalizeHairRetouchCount(
      hasStructuredHairAddOnFields ? body.hairRetouchCount : legacyHairAddOns.hairRetouchCount,
    );

    if (normalizedRetouchCount == null) {
      return {
        ok: false,
        message: "리터치 횟수는 0회부터 2회까지 선택할 수 있습니다.",
      };
    }

    payload.hairBodyMakeup = hasStructuredHairAddOnFields
      ? normalizeBoolean(body.hairBodyMakeup)
      : legacyHairAddOns.hairBodyMakeup;
    payload.hairPiece = hasStructuredHairAddOnFields
      ? normalizeBoolean(body.hairPiece)
      : legacyHairAddOns.hairPiece;
    payload.hairRetouchCount = normalizedRetouchCount;
    payload.hairOptionalOption = serializeHairAddOns(payload);

    if (!hairOptionMap.has(payload.hairOption)) {
      return {
        ok: false,
        message: "헤어&메이크업 옵션을 선택해 주세요.",
      };
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
  applicationNumber = null,
}) {
  const result = await client.query(
    `
      SELECT
        id,
        application_number,
        discipline,
        image_key,
        division
      FROM applications
      WHERE name = $1
        AND phone = $2
        AND LOWER(email) = $3
        AND payment_status = 'DONE'
        AND admin_deleted_at IS NULL
        AND ($4::text IS NULL OR application_number = $4)
      ORDER BY submitted_at DESC NULLS LAST, updated_at DESC
      LIMIT 1
    `,
    [name, phone, email, applicationNumber]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return {
    ...result.rows[0],
    discipline: getCanonicalApplicationDisciplineTitle({
      imageKey: result.rows[0].image_key,
      discipline: result.rows[0].discipline,
    }),
  };
}

function mapStageServiceRefundRequestRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    serviceOrderNumber: row.service_order_number,
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
    providerErrorCode: row.provider_error_code,
    providerErrorMessage: row.provider_error_message,
    processedAt: row.processed_at,
    createdAt: row.created_at,
  };
}

function mapAdminStageServiceRefundRequestRow(row) {
  return {
    ...mapStageServiceRefundRequestRow(row),
    refundTarget: "stage-service",
    applicationNumber: row.linked_application_number,
    serviceType: row.service_type,
    name: row.service_name || row.requested_by_name,
    phone: row.service_phone,
    email: row.service_email || row.requested_by_email,
    division: "무대 서비스",
    discipline: stageServiceDefinitions[row.service_type]?.title || row.service_type,
    paymentStatus: row.payment_status,
  };
}

async function findEligibleCompletedApplicationsForStageService({
  client = pool,
  name,
  phone,
  email,
  applicationNumbers,
}) {
  const normalizedApplicationNumbers = normalizeStageServiceLinkedApplicationNumbers(applicationNumbers);

  const result = await client.query(
    `
      SELECT
        id,
        application_number,
        discipline,
        image_key,
        division,
        participant_gender,
        weight_class
      FROM applications
      WHERE name = $1
        AND phone = $2
        AND LOWER(email) = $3
        AND payment_status = 'DONE'
        AND admin_deleted_at IS NULL
        AND (
          cardinality($4::text[]) = 0
          OR application_number = ANY($4::text[])
        )
      ORDER BY
        CASE
          WHEN cardinality($4::text[]) = 0 THEN 0
          ELSE array_position($4::text[], application_number)
        END,
        submitted_at DESC NULLS LAST,
        updated_at DESC
    `,
    [name, phone, email, normalizedApplicationNumbers],
  );

  if (
    normalizedApplicationNumbers.length
    && result.rowCount !== normalizedApplicationNumbers.length
  ) {
    return [];
  }

  return result.rows.map((application) => ({
    ...application,
    discipline: getCanonicalApplicationDisciplineTitle({
      imageKey: application.image_key,
      discipline: application.discipline,
    }),
  }));
}

function validateHairMakeupLinkedApplications(payload, linkedApplications) {
  if (payload.serviceType !== "hair-makeup") {
    return { ok: true };
  }

  const selectedHairOption = hairOptionMap.get(payload.hairOption);
  const selectedGenders = new Set(
    linkedApplications
      .map((application) => getStageServiceHairMakeupDisciplineGender(application))
      .filter((gender) => gender !== "all"),
  );

  if (selectedGenders.size > 1) {
    return {
      ok: false,
      message: "남성 부문과 여성 부문은 하나의 헤어&메이크업 신청으로 함께 선택할 수 없습니다.",
    };
  }

  const selectedGender = selectedGenders.values().next().value || "all";

  if (selectedGender !== "all" && selectedHairOption?.gender !== selectedGender) {
    return {
      ok: false,
      message: "선택한 신청 종목에 맞는 헤어&메이크업 옵션을 선택해 주세요.",
    };
  }

  const maxRetouchCount = Math.max(0, linkedApplications.length - 1);

  if (payload.hairRetouchCount > maxRetouchCount) {
    return {
      ok: false,
      message: `선택한 ${linkedApplications.length}개 종목에서는 리터치를 최대 ${maxRetouchCount}회까지 신청할 수 있습니다.`,
    };
  }

  payload.linkedApplications = linkedApplications.map((application) => ({
    applicationNumber: application.application_number,
    discipline: application.discipline,
    participantGender: application.participant_gender,
    weightClass: application.weight_class,
  }));
  payload.linkedApplicationNumber = payload.linkedApplications[0].applicationNumber;
  payload.hairParticipantDiscipline = payload.linkedApplications[0].discipline;
  payload.hairAdditionalDiscipline = payload.linkedApplications
    .slice(1)
    .map((application) => application.discipline)
    .join(", ") || null;

  return { ok: true };
}

async function validateStageVideoAdditionalDiscipline({ client, payload, linkedApplications }) {
  if (payload.serviceType !== "stage-video" || !payload.videoAdditionalDiscipline) {
    return { ok: true };
  }

  const additionalOption = getStageVideoAdditionalOptionMeta(
    payload.videoAdditionalDiscipline,
    payload.videoType,
  );

  if (!additionalOption) {
    return { ok: false, message: "추가 영상 종목 정보를 확인해 주세요." };
  }

  const linkedApplicationNumbers = new Set(
    linkedApplications.map((application) => application.application_number),
  );
  const eligibleApplications = await findEligibleCompletedApplicationsForStageService({
    client,
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    applicationNumbers: [],
  });
  const hasEligibleAdditionalDiscipline = eligibleApplications.some(
    (application) =>
      !linkedApplicationNumbers.has(application.application_number)
      && getStageServiceDisciplineFromApplication(application) === additionalOption.discipline,
  );

  return hasEligibleAdditionalDiscipline
    ? { ok: true }
    : {
      ok: false,
      message: "추가 영상 종목은 결제 완료된 다른 대회 신청 종목에서 선택해 주세요.",
    };
}

function mapAdminSpectatorRefundRequestRow(row) {
  return {
    ...mapRefundRequestRow(row),
    refundTarget: "spectator",
    applicationNumber: row.spectator_order_number,
    spectatorOrderNumber: row.spectator_order_number,
    serviceOrderNumber: null,
    serviceType: null,
    name: row.spectator_name || row.requested_by_name,
    phone: row.spectator_phone,
    email: row.spectator_email || row.requested_by_email,
    division: "참관객",
    discipline: "입장권 1매",
    paymentStatus: row.payment_status,
  };
}

async function findEligibleKcpTestApplicationForStageService({
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
        discipline,
        image_key
      FROM applications
      WHERE name = $1
        AND phone = $2
        AND LOWER(email) = $3
        AND division = 'TEST'
        AND payment_status = 'DONE'
        AND admin_deleted_at IS NULL
      ORDER BY submitted_at DESC NULLS LAST, updated_at DESC
      LIMIT 1
    `,
    [name, phone, email]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return {
    ...result.rows[0],
    discipline: getCanonicalApplicationDisciplineTitle({
      imageKey: result.rows[0].image_key,
      discipline: result.rows[0].discipline,
    }),
  };
}

async function hasPurchasedStageService({
  client = pool,
  name,
  phone,
  email,
  serviceType,
  linkedApplicationNumbers,
  linkedApplicationNumber,
}) {
  const normalizedApplicationNumbers = normalizeStageServiceLinkedApplicationNumbers(
    linkedApplicationNumbers,
    linkedApplicationNumber,
  );

  if (!normalizedApplicationNumbers.length) {
    return false;
  }

  const result = await client.query(
    `
      SELECT 1
      FROM stage_service_orders
      WHERE name = $1
        AND phone = $2
        AND LOWER(email) = $3
        AND service_type = $4
        AND (
          linked_application_number = ANY($5::text[])
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(linked_applications) AS linked_application
            WHERE linked_application ->> 'applicationNumber' = ANY($5::text[])
          )
        )
        AND payment_status = 'DONE'
      LIMIT 1
    `,
    [name, phone, email, serviceType, normalizedApplicationNumbers]
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
  const paymentMethod = normalizeText(body.paymentMethod) || "payment";
  const selection = normalizeApplicationSelection({
    division: normalizeText(body.selection?.division),
    discipline: normalizeText(body.selection?.discipline),
    imageKey: normalizeText(body.selection?.imageKey),
  });
  const disciplineDefinition = applicationDisciplineDefinitionByImageKey.get(
    selection.imageKey
  );
  const divisionAllowsImage =
    selection.division === "TEST" ||
    (selection.division === "man" && /\/(man|common)_/.test(selection.imageKey || "")) ||
    (selection.division === "woman" && /\/(woman|common)_/.test(selection.imageKey || ""));
  const requestedParticipantGender = (
    normalizeText(body.selection?.participantGender) || ""
  ).toLowerCase();

  const consents = {
    privacy: normalizeBoolean(body.consents?.privacy),
    terms: normalizeBoolean(body.consents?.terms),
    refund: normalizeBoolean(body.consents?.refund),
    marketing: normalizeBoolean(body.consents?.marketing),
    photoVideo: normalizeBoolean(body.consents?.photoVideo),
  };

  if (
    !name ||
    !phone ||
    !email ||
    !birthDate ||
    name.length > 120 ||
    phone.length > 40 ||
    email.length > 255 ||
    birthDate.length > 20 ||
    (organization && organization.length > 160) ||
    instagramId.length > 500 ||
    (weightClass && weightClass.length > 160)
  ) {
    return {
      ok: false,
      message: "Missing required applicant fields",
    };
  }

  if (
    !disciplineDefinition ||
    !divisionAllowsImage ||
    selection.discipline !== disciplineDefinition.title
  ) {
    return {
      ok: false,
      message: "Invalid application selection",
    };
  }

  const participantGender = /\/man_/.test(selection.imageKey)
    ? "male"
    : /\/woman_/.test(selection.imageKey)
      ? "female"
      : requestedParticipantGender;

  if (
    !["male", "female"].includes(participantGender) ||
    (disciplineDefinition.isCommon && !["male", "female"].includes(requestedParticipantGender))
  ) {
    return {
      ok: false,
      message: "Participant gender is required for this application",
    };
  }

  selection.participantGender = participantGender;

  if (!hasValidEmail(email) || String(phone).replace(/\D/g, "").length !== 11) {
    return {
      ok: false,
      message: "Invalid applicant contact fields",
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

function validateKcpWebhookPayload(payload) {
  const siteCode = normalizeText(payload?.site_cd);
  const transactionNo = normalizeText(payload?.tno);
  const orderNo = normalizeText(payload?.order_no || payload?.ordr_idxx);
  const transactionCode = normalizeText(payload?.tx_cd);
  const transactionTime = normalizeText(payload?.tx_tm);

  if (!siteCode || siteCode !== kcpSiteCode) {
    return {
      ok: false,
      message: "Invalid KCP webhook site code",
    };
  }

  if (!transactionNo || !orderNo || !transactionCode || !transactionTime) {
    return {
      ok: false,
      message: "Missing KCP webhook fields",
    };
  }

  return { ok: true };
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

async function reconcileKcpWebhookPayment({ orderId, paymentKey }) {
  const normalizedOrderId = normalizeText(orderId);
  const normalizedPaymentKey = normalizeText(paymentKey);
  const snapshot = await getKcpReconciliationSnapshot(pool, normalizedOrderId);

  if (!snapshot.order || !snapshot.payment) {
    return { ok: false, ignored: true, code: "KCP_PAYMENT_NOT_FOUND" };
  }

  const storedPaymentKey =
    normalizeText(snapshot.payment.provider_payment_id) ||
    normalizeText(snapshot.payment.payment_key);
  const storedPaymentKeyAlias = normalizeText(snapshot.payment.payment_key);
  const orderAmount = normalizeAmount(snapshot.order.amount);
  const paymentAmount = normalizeAmount(snapshot.payment.total_amount);
  const payType = normalizeKcpInquiryPayType(
    snapshot.payment.payment_type,
    snapshot.payment.method,
    snapshot.order.payment_method
  );

  if (
    snapshot.order.payment_provider !== paymentProviders.KCP ||
    snapshot.payment.payment_provider !== paymentProviders.KCP ||
    !normalizedPaymentKey ||
    normalizedPaymentKey !== storedPaymentKey ||
    normalizedPaymentKey !== storedPaymentKeyAlias ||
    orderAmount === null ||
    paymentAmount !== orderAmount ||
    !payType
  ) {
    return { ok: false, ignored: true, code: "KCP_WEBHOOK_BINDING_MISMATCH" };
  }

  const inquiryResponse = await requestKcpTransactionInquiry({
    paymentKey: normalizedPaymentKey,
    payType,
  });

  if (!inquiryResponse.ok) {
    const error = new Error(inquiryResponse.errorMessage || "KCP webhook inquiry failed");
    error.code = inquiryResponse.errorCode;
    throw error;
  }

  const inquiryPayload = inquiryResponse.result;
  const inquiryPaymentKey = normalizeText(inquiryPayload?.tno);
  const interpretedInquiry = interpretKcpInquiryResult(inquiryPayload, payType);

  if (
    inquiryPaymentKey !== normalizedPaymentKey ||
    !interpretedInquiry.ok ||
    interpretedInquiry.amount !== orderAmount ||
    !isSafeKcpReconciliationTransition(
      snapshot.payment.status,
      interpretedInquiry.paymentStatus
    )
  ) {
    return { ok: false, ignored: true, code: "KCP_WEBHOOK_INQUIRY_MISMATCH" };
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const lockedSnapshot = await getKcpReconciliationSnapshot(client, normalizedOrderId, {
      lock: true,
    });
    const lockedPaymentKey =
      normalizeText(lockedSnapshot.payment?.provider_payment_id) ||
      normalizeText(lockedSnapshot.payment?.payment_key);
    const lockedAmount = normalizeAmount(lockedSnapshot.order?.amount);
    const lockedPaymentAmount = normalizeAmount(lockedSnapshot.payment?.total_amount);
    const lockedPayType = normalizeKcpInquiryPayType(
      lockedSnapshot.payment?.payment_type,
      lockedSnapshot.payment?.method,
      lockedSnapshot.order?.payment_method
    );

    if (
      !lockedSnapshot.order ||
      !lockedSnapshot.payment ||
      lockedSnapshot.order.payment_provider !== paymentProviders.KCP ||
      lockedPaymentKey !== normalizedPaymentKey ||
      lockedAmount !== orderAmount ||
      lockedPaymentAmount !== orderAmount ||
      lockedPayType !== payType ||
      !isSafeKcpReconciliationTransition(
        lockedSnapshot.payment.status,
        interpretedInquiry.paymentStatus
      )
    ) {
      await client.query("ROLLBACK");
      return { ok: false, ignored: true, code: "KCP_WEBHOOK_STATE_CHANGED" };
    }

    const nextPaymentStatus = interpretedInquiry.paymentStatus;
    const nextOrderStatus = mapPaymentStatusToOrderStatus(nextPaymentStatus);

    if (!nextOrderStatus) {
      throw new Error("Unsupported KCP webhook order state");
    }

    await client.query(
      `
        UPDATE payments
        SET
          status = $3,
          raw_response_json = jsonb_set(
            CASE
              WHEN raw_response_json IS NULL THEN '{}'::jsonb
              WHEN jsonb_typeof(raw_response_json) = 'object' THEN raw_response_json
              ELSE jsonb_build_object('previous', raw_response_json)
            END,
            '{latestInquiry}',
            $4::jsonb,
            true
          ),
          updated_at = NOW()
        WHERE order_id = $1
          AND payment_key = $2
          AND payment_provider = 'kcp'
      `,
      [
        normalizedOrderId,
        normalizedPaymentKey,
        nextPaymentStatus,
        JSON.stringify(inquiryPayload),
      ]
    );
    await client.query(
      "UPDATE orders SET status = $2, updated_at = NOW() WHERE order_id = $1",
      [normalizedOrderId, nextOrderStatus]
    );
    await client.query(
      `
        UPDATE applications
        SET
          status = CASE
            WHEN $2 = 'CANCELED' THEN 'REFUNDED'
            WHEN $2 = 'PARTIAL_CANCELED' THEN 'PARTIAL_REFUNDED'
            ELSE status
          END,
          payment_status = $2,
          updated_at = NOW()
        WHERE order_id = $1
      `,
      [normalizedOrderId, nextPaymentStatus]
    );

    const stageServiceTableResult = await client.query(
      "SELECT to_regclass('public.stage_service_orders') AS table_name"
    );

    if (stageServiceTableResult.rows[0]?.table_name) {
      await client.query(
        `
          UPDATE stage_service_orders
          SET payment_status = $2, updated_at = NOW()
          WHERE order_id = $1
        `,
        [normalizedOrderId, nextPaymentStatus]
      );
    }

    await client.query("COMMIT");
    return {
      ok: true,
      paymentStatus: nextPaymentStatus,
      transactionStatus: interpretedInquiry.transactionStatus,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
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

app.post("/kcp/test/orders", async function (req, res) {
  if (!kcpTestPaymentEnabled) {
    return res.status(404).json({
      ok: false,
      code: "KCP_TEST_PAYMENT_DISABLED",
      message: "KCP test payment is disabled",
    });
  }

  if (!isKcpTestPaymentAuthorized(req)) {
    return res.status(403).json({
      ok: false,
      code: "KCP_TEST_PAYMENT_FORBIDDEN",
      message: "Invalid KCP test payment token",
    });
  }

  const amount = 100;
  const providerResolution = resolvePaymentProvider({
    requestedProvider: paymentProviders.KCP,
    amount,
  });

  if (!providerResolution.ok) {
    return res.status(providerResolution.status).json({
      ok: false,
      message: providerResolution.message,
    });
  }

  try {
    const draftId = normalizeText(req.body.draftId);

    if (
      !requireRequestDraftAccess(req, res, {
        draftId,
        draftType: "application",
        cookieName: applicationDraftCookieName,
      })
    ) {
      return;
    }

    const orderId = generateOrderId();
    const orderName = "KCP 100원 테스트 결제";
    const resultAccessToken = createPaymentResultAccessToken({
      orderId,
      secret: paymentResultTokenSecret,
      ttlSeconds: paymentResultAccessTtlHours * 60 * 60,
    });
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      if (!draftId) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          ok: false,
          code: "KCP_TEST_DRAFT_REQUIRED",
          message: "KCP 테스트 신청 초안이 필요합니다.",
        });
      }

      const draftResult = await client.query(
        `
          SELECT draft_id, order_id, division, name, email
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
          message: "Test application draft not found",
        });
      }

      const testDraftValidation = validateKcpTestDraft(draftResult.rows[0]);

      if (!testDraftValidation.ok) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          code: testDraftValidation.code,
          message: testDraftValidation.message,
        });
      }

      const { customerName, customerEmail } = testDraftValidation;

      const result = await client.query(
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
          amount,
          customerName,
          customerEmail,
          providerResolution.provider,
        ]
      );
      const order = result.rows[0];

      await client.query(
        `
          UPDATE application_drafts
          SET order_id = $2, updated_at = NOW()
          WHERE draft_id = $1
        `,
        [draftId, order.order_id]
      );

      await client.query("COMMIT");
      res.setHeader("Set-Cookie", createPaymentResultAccessCookie(resultAccessToken));

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
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Failed to create KCP test order:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to create KCP test order",
    });
  }
});

app.post("/kcp/test/orders/:orderId/cancel", async function (req, res) {
  if (!kcpTestPaymentEnabled) {
    return res.status(404).json({
      ok: false,
      code: "KCP_TEST_PAYMENT_DISABLED",
      message: "KCP test payment is disabled",
    });
  }

  if (!isKcpTestPaymentAuthorized(req)) {
    return res.status(403).json({
      ok: false,
      code: "KCP_TEST_PAYMENT_FORBIDDEN",
      message: "Invalid KCP test payment token",
    });
  }

  const orderId = normalizeText(req.params.orderId);

  if (!orderId) {
    return res.status(400).json({
      ok: false,
      message: "Missing orderId",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
        SELECT
          orders.order_id,
          orders.order_name,
          orders.amount,
          orders.status AS order_status,
          orders.payment_provider AS order_payment_provider,
          payments.payment_key,
          payments.status AS payment_status,
          payments.total_amount,
          payments.payment_provider AS payment_provider
        FROM orders
        JOIN payments
          ON payments.order_id = orders.order_id
        WHERE orders.order_id = $1
        ORDER BY payments.updated_at DESC
        LIMIT 1
        FOR UPDATE OF orders, payments
      `,
      [orderId]
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        code: "KCP_TEST_PAYMENT_NOT_FOUND",
        message: "KCP 테스트 결제 정보를 찾을 수 없습니다.",
      });
    }

    const payment = result.rows[0];
    const amount = normalizeAmount(payment.amount);

    if (
      payment.order_name !== "KCP 100원 테스트 결제" ||
      amount !== 100 ||
      payment.order_payment_provider !== paymentProviders.KCP ||
      payment.payment_provider !== paymentProviders.KCP
    ) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: "KCP_TEST_ORDER_MISMATCH",
        message: "KCP 100원 테스트 결제 주문이 아닙니다.",
      });
    }

    if (payment.order_status === "CANCELED" || payment.payment_status === "CANCELED") {
      await client.query("COMMIT");
      return res.status(200).json({
        ok: true,
        duplicated: true,
        orderId: payment.order_id,
        paymentKey: payment.payment_key,
        paymentStatus: "CANCELED",
      });
    }

    if (payment.order_status !== "PAID" || payment.payment_status !== "DONE") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: "KCP_TEST_PAYMENT_NOT_CANCELABLE",
        message: "현재 상태에서는 테스트 결제를 취소할 수 없습니다.",
      });
    }

    const cancellation = await requestKcpCancellation({
      paymentKey: payment.payment_key,
      cancelAmount: amount,
      remainingAmount: amount,
      originalAmount: amount,
      reason: "KCP 100원 테스트 결제 취소",
    });

    if (!cancellation.ok) {
      await client.query("ROLLBACK");
      return res.status(cancellation.httpStatus >= 400 ? cancellation.httpStatus : 502).json({
        ok: false,
        code: cancellation.errorCode,
        message: cancellation.errorMessage,
        kcp: cancellation.result.kcp,
      });
    }

    await client.query(
      `
        UPDATE payments
        SET
          status = 'CANCELED',
          raw_response_json = jsonb_build_object(
            'approval', raw_response_json,
            'cancellations', jsonb_build_array($2::jsonb)
          ),
          updated_at = NOW()
        WHERE order_id = $1
          AND payment_provider = 'kcp'
      `,
      [payment.order_id, JSON.stringify(cancellation.result)]
    );

    await client.query(
      `
        UPDATE orders
        SET status = 'CANCELED', updated_at = NOW()
        WHERE order_id = $1
      `,
      [payment.order_id]
    );

    await client.query(
      `
        UPDATE applications
        SET
          status = 'CANCELED',
          payment_status = 'CANCELED',
          updated_at = NOW()
        WHERE order_id = $1
      `,
      [payment.order_id]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      orderId: payment.order_id,
      paymentKey: payment.payment_key,
      paymentStatus: "CANCELED",
      cancellation: cancellation.result,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Failed to cancel KCP test payment:", error);
    return res.status(error.statusCode || 500).json({
      ok: false,
      message: error.message || "Failed to cancel KCP test payment",
    });
  } finally {
    client.release();
  }
});

app.post("/kcp/test/stage-services/draft", async function (req, res) {
  if (!hasTrustedWriteOrigin(req)) {
    return res.status(403).json({
      ok: false,
      code: "UNTRUSTED_REQUEST_ORIGIN",
      message: "허용되지 않은 요청 출처입니다.",
    });
  }

  if (!kcpTestPaymentEnabled || !isKcpTestPaymentAuthorized(req)) {
    return res.status(kcpTestPaymentEnabled ? 403 : 404).json({
      ok: false,
      code: kcpTestPaymentEnabled ? "KCP_TEST_PAYMENT_FORBIDDEN" : "KCP_TEST_PAYMENT_DISABLED",
      message: kcpTestPaymentEnabled
        ? "Invalid KCP test payment token"
        : "KCP test payment is disabled",
    });
  }

  const validation = validateStageServiceDraftPayload({
    ...req.body,
    linkedApplicationNumber: "KCP_TEST_INTERNAL",
  });

  if (!validation.ok) {
    return res.status(400).json({ ok: false, message: validation.message });
  }

  const { payload } = validation;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const linkedApplication = await findEligibleKcpTestApplicationForStageService({
      client,
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
    });

    if (!linkedApplication) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        ok: false,
        code: "KCP_TEST_APPLICATION_REQUIRED",
        message:
          "무대 서비스 테스트는 동일한 성함, 연락처, 이메일로 완료된 KCP TEST 대회 신청이 필요합니다.",
      });
    }

    const draftId = generateStageServiceDraftId();
    const draftResult = await client.query(
      `
        INSERT INTO stage_service_drafts (
          draft_id, payment_method, status, service_type, name, phone, email,
          linked_application_id, linked_application_number, linked_discipline,
          photo_has_additional_discipline, photo_additional_discipline,
          video_type, video_additional_discipline,
          hair_participant_discipline, hair_option,
          hair_additional_discipline, hair_optional_option,
          total_amount, created_at, updated_at
        )
        VALUES (
          $1, $2, 'DRAFT', $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16, $17, 100, NOW(), NOW()
        )
        RETURNING
          draft_id, order_id, payment_method, status, service_type, name, phone, email,
          linked_application_number, linked_discipline,
          photo_has_additional_discipline, photo_additional_discipline,
          video_type, video_additional_discipline,
          hair_participant_discipline, hair_option,
          hair_additional_discipline, hair_optional_option,
          total_amount, created_at, updated_at
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
      ]
    );

    await client.query("COMMIT");
    issueDraftAccessCookie(res, {
      draftId,
      draftType: "stage-service",
      cookieName: stageServiceDraftCookieName,
    });

    return res.status(201).json({
      ok: true,
      draft: mapStageServiceDraftRow(draftResult.rows[0]),
      linkedApplication: {
        applicationNumber: linkedApplication.application_number,
        discipline: linkedApplication.discipline,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to create KCP test stage service draft:", error);
    return res.status(500).json({ ok: false, message: "Failed to create KCP test stage service draft" });
  } finally {
    client.release();
  }
});

app.post("/kcp/test/stage-services/orders", async function (req, res) {
  if (!hasTrustedWriteOrigin(req)) {
    return res.status(403).json({ ok: false, code: "UNTRUSTED_REQUEST_ORIGIN", message: "허용되지 않은 요청 출처입니다." });
  }

  if (!kcpTestPaymentEnabled || !isKcpTestPaymentAuthorized(req)) {
    return res.status(kcpTestPaymentEnabled ? 403 : 404).json({
      ok: false,
      code: kcpTestPaymentEnabled ? "KCP_TEST_PAYMENT_FORBIDDEN" : "KCP_TEST_PAYMENT_DISABLED",
      message: kcpTestPaymentEnabled ? "Invalid KCP test payment token" : "KCP test payment is disabled",
    });
  }

  const draftId = normalizeText(req.body.draftId);

  if (!draftId) {
    return res.status(400).json({ ok: false, message: "Missing draftId" });
  }

  if (!requireRequestDraftAccess(req, res, {
    draftId,
    draftType: "stage-service",
    cookieName: stageServiceDraftCookieName,
  })) {
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const draftResult = await client.query(
      `
        SELECT
          stage_service_drafts.draft_id,
          stage_service_drafts.order_id,
          stage_service_drafts.name,
          stage_service_drafts.email,
          stage_service_drafts.total_amount,
          applications.division
        FROM stage_service_drafts
        JOIN applications ON applications.id = stage_service_drafts.linked_application_id
        WHERE stage_service_drafts.draft_id = $1
        FOR UPDATE OF stage_service_drafts
      `,
      [draftId]
    );

    if (draftResult.rowCount === 0 || draftResult.rows[0].division !== "TEST") {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "KCP test stage service draft not found" });
    }

    const draft = draftResult.rows[0];

    if (Number(draft.total_amount) !== 100) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, code: "KCP_TEST_ORDER_MISMATCH", message: "KCP 테스트 무대 서비스 금액이 올바르지 않습니다." });
    }

    if (draft.order_id) {
      const existingOrderResult = await client.query(
        `SELECT order_id, order_name, amount, customer_name, customer_email, payment_provider, status, created_at FROM orders WHERE order_id = $1 LIMIT 1`,
        [draft.order_id]
      );

      if (existingOrderResult.rowCount > 0) {
        const order = existingOrderResult.rows[0];
        if (!isMatchingKcpTestOrder(order, "stageServiceTest")) {
          await client.query("ROLLBACK");
          return res.status(409).json({ ok: false, code: "KCP_TEST_ORDER_MISMATCH", message: "KCP 테스트 무대 서비스 주문이 아닙니다." });
        }

        const resultAccessToken = createPaymentResultAccessToken({ orderId: order.order_id, secret: paymentResultTokenSecret, ttlSeconds: paymentResultAccessTtlHours * 60 * 60 });
        await client.query("COMMIT");
        res.setHeader("Set-Cookie", createPaymentResultAccessCookie(resultAccessToken));
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

    const providerResolution = resolvePaymentProvider({ requestedProvider: paymentProviders.KCP, amount: 100 });
    if (!providerResolution.ok) {
      await client.query("ROLLBACK");
      return res.status(providerResolution.status).json({ ok: false, message: providerResolution.message });
    }

    const orderId = generateOrderId();
    const resultAccessToken = createPaymentResultAccessToken({ orderId, secret: paymentResultTokenSecret, ttlSeconds: paymentResultAccessTtlHours * 60 * 60 });
    const orderResult = await client.query(
      `
        INSERT INTO orders (order_id, order_name, amount, customer_name, customer_email, payment_provider, status)
        VALUES ($1, $2, 100, $3, $4, $5, 'READY')
        RETURNING order_id, order_name, amount, customer_name, customer_email, payment_provider, status, created_at
      `,
      [orderId, kcpTestOrderNames.stageServiceTest, draft.name, draft.email, providerResolution.provider]
    );

    await client.query(
      `UPDATE stage_service_drafts SET order_id = $2, updated_at = NOW() WHERE draft_id = $1`,
      [draftId, orderId]
    );
    await client.query("COMMIT");

    const order = orderResult.rows[0];
    res.setHeader("Set-Cookie", createPaymentResultAccessCookie(resultAccessToken));
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
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to create KCP test stage service order:", error);
    return res.status(500).json({ ok: false, message: "Failed to create KCP test stage service order" });
  } finally {
    client.release();
  }
});

app.post("/kcp/test/stage-services/orders/:orderId/cancel", async function (req, res) {
  if (!kcpTestPaymentEnabled || !isKcpTestPaymentAuthorized(req)) {
    return res.status(kcpTestPaymentEnabled ? 403 : 404).json({
      ok: false,
      code: kcpTestPaymentEnabled ? "KCP_TEST_PAYMENT_FORBIDDEN" : "KCP_TEST_PAYMENT_DISABLED",
      message: kcpTestPaymentEnabled ? "Invalid KCP test payment token" : "KCP test payment is disabled",
    });
  }

  const orderId = normalizeText(req.params.orderId);
  if (!orderId) {
    return res.status(400).json({ ok: false, message: "Missing orderId" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query(
      `
        SELECT
          orders.order_id,
          orders.order_name,
          orders.amount,
          orders.status AS order_status,
          orders.payment_provider AS order_payment_provider,
          payments.payment_key,
          payments.status AS payment_status,
          payments.payment_provider AS payment_provider
        FROM orders
        JOIN payments ON payments.order_id = orders.order_id
        WHERE orders.order_id = $1
        ORDER BY payments.updated_at DESC
        LIMIT 1
        FOR UPDATE OF orders, payments
      `,
      [orderId]
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, code: "KCP_TEST_PAYMENT_NOT_FOUND", message: "KCP 테스트 결제 정보를 찾을 수 없습니다." });
    }

    const payment = result.rows[0];
    if (
      !isMatchingKcpTestOrder(payment, "stageServiceTest") ||
      payment.order_payment_provider !== paymentProviders.KCP ||
      payment.payment_provider !== paymentProviders.KCP
    ) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, code: "KCP_TEST_ORDER_MISMATCH", message: "KCP 테스트 무대 서비스 주문이 아닙니다." });
    }

    if (payment.order_status === "CANCELED" || payment.payment_status === "CANCELED") {
      await client.query("COMMIT");
      return res.status(200).json({ ok: true, duplicated: true, orderId: payment.order_id, paymentKey: payment.payment_key, paymentStatus: "CANCELED" });
    }

    if (payment.order_status !== "PAID" || payment.payment_status !== "DONE") {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, code: "KCP_TEST_PAYMENT_NOT_CANCELABLE", message: "현재 상태에서는 테스트 결제를 취소할 수 없습니다." });
    }

    const cancellation = await requestKcpCancellation({
      paymentKey: payment.payment_key,
      cancelAmount: 100,
      remainingAmount: 100,
      originalAmount: 100,
      reason: "KCP 100원 무대 서비스 테스트 결제 취소",
    });

    if (!cancellation.ok) {
      await client.query("ROLLBACK");
      return res.status(cancellation.httpStatus >= 400 ? cancellation.httpStatus : 502).json({
        ok: false,
        code: cancellation.errorCode,
        message: cancellation.errorMessage,
        kcp: cancellation.result.kcp,
      });
    }

    await client.query(
      `
        UPDATE payments
        SET status = 'CANCELED',
            raw_response_json = jsonb_build_object('approval', raw_response_json, 'cancellations', jsonb_build_array($2::jsonb)),
            updated_at = NOW()
        WHERE order_id = $1 AND payment_provider = 'kcp'
      `,
      [payment.order_id, JSON.stringify(cancellation.result)]
    );
    await client.query(`UPDATE orders SET status = 'CANCELED', updated_at = NOW() WHERE order_id = $1`, [payment.order_id]);
    await client.query(`UPDATE stage_service_orders SET payment_status = 'CANCELED', updated_at = NOW() WHERE order_id = $1`, [payment.order_id]);
    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      orderId: payment.order_id,
      paymentKey: payment.payment_key,
      paymentStatus: "CANCELED",
      cancellation: cancellation.result,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to cancel KCP test stage service payment:", error);
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Failed to cancel KCP test stage service payment" });
  } finally {
    client.release();
  }
});

app.post("/kcp/test/spectators/draft", async function (req, res) {
  if (!hasTrustedWriteOrigin(req)) {
    return res.status(403).json({
      ok: false,
      code: "UNTRUSTED_REQUEST_ORIGIN",
      message: "허용되지 않은 요청 출처입니다.",
    });
  }

  if (!kcpTestPaymentEnabled || !isKcpTestPaymentAuthorized(req)) {
    return res.status(kcpTestPaymentEnabled ? 403 : 404).json({
      ok: false,
      code: kcpTestPaymentEnabled ? "KCP_TEST_PAYMENT_FORBIDDEN" : "KCP_TEST_PAYMENT_DISABLED",
      message: kcpTestPaymentEnabled ? "Invalid KCP test payment token" : "KCP test payment is disabled",
    });
  }

  const validation = validateSpectatorApplicantPayload(req.body);
  if (!validation.ok) {
    return res.status(400).json(validation);
  }

  const { payload } = validation;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const draftId = generateSpectatorDraftId();
    const draftResult = await client.query(
      `
        INSERT INTO spectator_drafts (
          draft_id, status, name, phone, email, quantity, unit_amount, total_amount,
          email_verified_at, is_test, created_at, updated_at
        ) VALUES ($1, 'CONSENTED', $2, $3, $4, 1, 100, 100, NOW(), TRUE, NOW(), NOW())
        RETURNING *
      `,
      [draftId, payload.name, payload.phone, payload.email]
    );

    await client.query(
      `
        INSERT INTO spectator_consents (
          draft_id, privacy_consent, refund_consent, marketing_consent,
          photo_video_consent, consent_version, consented_at
        ) VALUES ($1, TRUE, TRUE, TRUE, TRUE, 'kcp-test-spectator-v1', NOW())
      `,
      [draftId]
    );

    await client.query("COMMIT");
    issueDraftAccessCookie(res, {
      draftId,
      draftType: "spectator",
      cookieName: spectatorDraftCookieName,
    });
    return res.status(201).json({ ok: true, draft: mapSpectatorDraftRow(draftResult.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to create KCP test spectator draft:", error);
    return res.status(500).json({ ok: false, message: "Failed to create KCP test spectator draft" });
  } finally {
    client.release();
  }
});

app.post("/kcp/test/spectators/orders", async function (req, res) {
  if (!hasTrustedWriteOrigin(req)) {
    return res.status(403).json({
      ok: false,
      code: "UNTRUSTED_REQUEST_ORIGIN",
      message: "허용되지 않은 요청 출처입니다.",
    });
  }

  if (!kcpTestPaymentEnabled || !isKcpTestPaymentAuthorized(req)) {
    return res.status(kcpTestPaymentEnabled ? 403 : 404).json({
      ok: false,
      code: kcpTestPaymentEnabled ? "KCP_TEST_PAYMENT_FORBIDDEN" : "KCP_TEST_PAYMENT_DISABLED",
      message: kcpTestPaymentEnabled ? "Invalid KCP test payment token" : "KCP test payment is disabled",
    });
  }

  const draftId = normalizeText(req.body.draftId);
  if (!draftId) {
    return res.status(400).json({ ok: false, message: "Missing draftId" });
  }

  if (!requireRequestDraftAccess(req, res, {
    draftId,
    draftType: "spectator",
    cookieName: spectatorDraftCookieName,
  })) {
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const draftResult = await client.query(
      `SELECT * FROM spectator_drafts WHERE draft_id = $1 AND is_test = TRUE FOR UPDATE`,
      [draftId]
    );

    if (!draftResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "KCP test spectator draft not found" });
    }

    const draft = draftResult.rows[0];
    if (Number(draft.unit_amount) !== 100 || Number(draft.total_amount) !== 100) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, code: "KCP_TEST_ORDER_MISMATCH", message: "KCP 테스트 참관객 금액이 올바르지 않습니다." });
    }

    const consentResult = await client.query(
      `
        SELECT id
        FROM spectator_consents
        WHERE draft_id = $1
          AND privacy_consent = TRUE
          AND refund_consent = TRUE
        LIMIT 1
      `,
      [draftId]
    );
    if (!consentResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, code: "REQUIRED_CONSENTS_MISSING", message: "필수 동의 사항을 확인해 주세요." });
    }

    if (draft.order_id) {
      const existingOrderResult = await client.query(
        `SELECT order_id, order_name, amount, customer_name, customer_email, payment_provider, status, created_at FROM orders WHERE order_id = $1 LIMIT 1`,
        [draft.order_id]
      );

      if (existingOrderResult.rowCount > 0) {
        const order = existingOrderResult.rows[0];
        if (!isMatchingKcpTestOrder(order, "spectatorTest")) {
          await client.query("ROLLBACK");
          return res.status(409).json({ ok: false, code: "KCP_TEST_ORDER_MISMATCH", message: "KCP 테스트 참관객 주문이 아닙니다." });
        }

        if (order.status !== "CANCELED") {
          const resultAccessToken = createPaymentResultAccessToken({
            orderId: order.order_id,
            secret: paymentResultTokenSecret,
            ttlSeconds: paymentResultAccessTtlHours * 60 * 60,
          });
          await client.query("COMMIT");
          res.setHeader("Set-Cookie", createPaymentResultAccessCookie(resultAccessToken));
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

      await client.query(
        `UPDATE spectator_drafts SET order_id = NULL, status = 'CONSENTED', updated_at = NOW() WHERE draft_id = $1`,
        [draftId]
      );
    }

    const providerResolution = resolvePaymentProvider({
      requestedProvider: paymentProviders.KCP,
      amount: 100,
    });
    if (!providerResolution.ok) {
      await client.query("ROLLBACK");
      return res.status(providerResolution.status).json({ ok: false, message: providerResolution.message });
    }

    const orderId = generateOrderId();
    const resultAccessToken = createPaymentResultAccessToken({
      orderId,
      secret: paymentResultTokenSecret,
      ttlSeconds: paymentResultAccessTtlHours * 60 * 60,
    });
    const orderResult = await client.query(
      `
        INSERT INTO orders (order_id, order_name, amount, customer_name, customer_email, payment_provider, status)
        VALUES ($1, $2, 100, $3, $4, $5, 'READY')
        RETURNING order_id, order_name, amount, customer_name, customer_email, payment_provider, status, created_at
      `,
      [orderId, kcpTestOrderNames.spectatorTest, draft.name, draft.email, providerResolution.provider]
    );
    await client.query(
      `UPDATE spectator_drafts SET order_id = $2, status = 'ORDERED', updated_at = NOW() WHERE draft_id = $1`,
      [draftId, orderId]
    );
    await client.query("COMMIT");

    const order = orderResult.rows[0];
    res.setHeader("Set-Cookie", createPaymentResultAccessCookie(resultAccessToken));
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
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to create KCP test spectator order:", error);
    return res.status(500).json({ ok: false, message: "Failed to create KCP test spectator order" });
  } finally {
    client.release();
  }
});

app.post("/kcp/test/spectators/orders/:orderId/cancel", async function (req, res) {
  if (!hasTrustedWriteOrigin(req)) {
    return res.status(403).json({
      ok: false,
      code: "UNTRUSTED_REQUEST_ORIGIN",
      message: "허용되지 않은 요청 출처입니다.",
    });
  }

  if (!kcpTestPaymentEnabled || !isKcpTestPaymentAuthorized(req)) {
    return res.status(kcpTestPaymentEnabled ? 403 : 404).json({
      ok: false,
      code: kcpTestPaymentEnabled ? "KCP_TEST_PAYMENT_FORBIDDEN" : "KCP_TEST_PAYMENT_DISABLED",
      message: kcpTestPaymentEnabled ? "Invalid KCP test payment token" : "KCP test payment is disabled",
    });
  }

  const orderId = normalizeText(req.params.orderId);
  if (!orderId) {
    return res.status(400).json({ ok: false, message: "Missing orderId" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query(
      `
        SELECT
          orders.order_id,
          orders.order_name,
          orders.amount,
          orders.status AS order_status,
          orders.payment_provider AS order_payment_provider,
          payments.payment_key,
          payments.status AS payment_status,
          payments.payment_provider AS payment_provider
        FROM orders
        JOIN payments ON payments.order_id = orders.order_id
        WHERE orders.order_id = $1
        ORDER BY payments.updated_at DESC
        LIMIT 1
        FOR UPDATE OF orders, payments
      `,
      [orderId]
    );

    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, code: "KCP_TEST_PAYMENT_NOT_FOUND", message: "KCP 테스트 결제 정보를 찾을 수 없습니다." });
    }

    const payment = result.rows[0];
    if (
      !isMatchingKcpTestOrder(payment, "spectatorTest") ||
      payment.order_payment_provider !== paymentProviders.KCP ||
      payment.payment_provider !== paymentProviders.KCP
    ) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, code: "KCP_TEST_ORDER_MISMATCH", message: "KCP 테스트 참관객 주문이 아닙니다." });
    }

    if (payment.order_status === "CANCELED" || payment.payment_status === "CANCELED") {
      await client.query("COMMIT");
      return res.status(200).json({
        ok: true,
        duplicated: true,
        orderId: payment.order_id,
        paymentKey: payment.payment_key,
        paymentStatus: "CANCELED",
      });
    }

    if (payment.order_status !== "PAID" || payment.payment_status !== "DONE") {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, code: "KCP_TEST_PAYMENT_NOT_CANCELABLE", message: "현재 상태에서는 테스트 결제를 취소할 수 없습니다." });
    }

    const cancellation = await requestKcpCancellation({
      paymentKey: payment.payment_key,
      cancelAmount: 100,
      remainingAmount: 100,
      originalAmount: 100,
      reason: "KCP 100원 참관객 입장권 테스트 결제 취소",
    });

    if (!cancellation.ok) {
      await client.query("ROLLBACK");
      return res.status(cancellation.httpStatus >= 400 ? cancellation.httpStatus : 502).json({
        ok: false,
        code: cancellation.errorCode,
        message: cancellation.errorMessage,
        kcp: cancellation.result.kcp,
      });
    }

    await client.query(
      `
        UPDATE payments
        SET status = 'CANCELED',
            raw_response_json = jsonb_build_object('approval', raw_response_json, 'cancellations', jsonb_build_array($2::jsonb)),
            updated_at = NOW()
        WHERE order_id = $1 AND payment_provider = 'kcp'
      `,
      [payment.order_id, JSON.stringify(cancellation.result)]
    );
    await client.query(`UPDATE orders SET status = 'CANCELED', updated_at = NOW() WHERE order_id = $1`, [payment.order_id]);
    await client.query(
      `UPDATE spectator_orders SET payment_status = 'CANCELED', admission_status = 'CANCELED', updated_at = NOW() WHERE order_id = $1 AND is_test = TRUE`,
      [payment.order_id]
    );
    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      orderId: payment.order_id,
      paymentKey: payment.payment_key,
      paymentStatus: "CANCELED",
      cancellation: cancellation.result,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to cancel KCP test spectator payment:", error);
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Failed to cancel KCP test spectator payment" });
  } finally {
    client.release();
  }
});

app.post("/kcp/trade/register", async function (req, res) {
  if (!hasTrustedWriteOrigin(req)) {
    return res.status(403).json({
      ok: false,
      code: "UNTRUSTED_REQUEST_ORIGIN",
      message: "허용되지 않은 요청 출처입니다.",
    });
  }

  const orderId = normalizeText(req.body.orderId);
  const draftId = normalizeText(req.body.draftId);
  const context = normalizeKcpPaymentContext(req.body.context);
  const requestedPaymentMethod = normalizeText(req.body.paymentMethod) || "CARD";
  const kcpMethod = mapClientPaymentMethodToKcp(requestedPaymentMethod);

  if (!orderId) {
    return res.status(400).json({
      ok: false,
      message: "Missing orderId",
    });
  }

  if (isKcpTestContext(context)) {
    if (!kcpTestPaymentEnabled) {
      return res.status(404).json({
        ok: false,
        code: "KCP_TEST_PAYMENT_DISABLED",
        message: "KCP test payment is disabled",
      });
    }

    if (!isKcpTestPaymentAuthorized(req)) {
      return res.status(403).json({
        ok: false,
        code: "KCP_TEST_PAYMENT_FORBIDDEN",
        message: "Invalid KCP test payment token",
      });
    }
  }

  if (!kcpMethod) {
    return res.status(400).json({
      ok: false,
      code: "KCP_PAYMENT_METHOD_UNSUPPORTED",
      message: "KCP LITE PAY에서 아직 지원하지 않는 결제수단입니다.",
    });
  }

  if (!allowedKcpCheckoutPaymentMethods.has(requestedPaymentMethod)) {
    return res.status(400).json({
      ok: false,
      code: "KCP_PAYMENT_METHOD_NOT_AVAILABLE",
      message: "현재 카드와 계좌이체 결제만 이용할 수 있습니다.",
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
          status,
          created_at
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

    let order = orderResult.rows[0];

    const orderAccessValidation = validateOrderPaymentResultAccess(req, order);

    if (!orderAccessValidation.ok) {
      return res.status(403).json(orderAccessValidation);
    }

    if (order.payment_provider !== paymentProviders.KCP) {
      return res.status(409).json({
        ok: false,
        code: "PAYMENT_PROVIDER_MISMATCH",
        message: `Order is locked to ${order.payment_provider} payment provider`,
      });
    }

    if (order.status !== "READY") {
      return res.status(409).json({
        ok: false,
        code: order.status === "CANCELED" ? "PAYMENT_ORDER_CANCELED" : "PAYMENT_ORDER_NOT_READY",
        orderStatus: order.status,
        message:
          order.status === "CANCELED"
            ? "결제 주문이 만료되었거나 취소되었습니다. 신청 내용 확인에서 새 주문을 생성해 주세요."
            : `Order is not in READY status. Current status: ${order.status}`,
      });
    }

    let amount = normalizeAmount(order.amount);

    if (amount === null) {
      return res.status(400).json({
        ok: false,
        message: "Invalid order amount",
      });
    }

    if (isKcpTestContext(context) && !isMatchingKcpTestOrder(order, context)) {
      return res.status(409).json({
        ok: false,
        code: "KCP_TEST_ORDER_MISMATCH",
        message: "Order is not a KCP test payment order",
      });
    }

    if (!draftId) {
      return res.status(400).json({
        ok: false,
        code: "KCP_DRAFT_ID_REQUIRED",
        message: "결제 주문에 연결된 신청 초안이 필요합니다.",
      });
    }

    const draftBindingTable = getKcpDraftBindingTable(context);
    const draftBindingResult = await pool.query(
      `
        SELECT draft_id
        FROM ${draftBindingTable}
        WHERE order_id = $1
        LIMIT 1
      `,
      [order.order_id]
    );

    if (
      draftBindingResult.rowCount === 0 ||
      draftBindingResult.rows[0].draft_id !== draftId
    ) {
      return res.status(409).json({
        ok: false,
        code: "KCP_DRAFT_ORDER_MISMATCH",
        message: "결제 주문과 신청 초안이 일치하지 않습니다.",
      });
    }

    const trustedDraftId = draftBindingResult.rows[0].draft_id;

    if (isPaymentOrderExpired(order.created_at)) {
      await pool.query(
        `
          UPDATE orders
          SET status = 'CANCELED', updated_at = NOW()
          WHERE order_id = $1
            AND status = 'READY'
        `,
        [order.order_id]
      );
      await pool.query(
        `
          UPDATE ${draftBindingTable}
          SET order_id = NULL, status = 'DRAFT', updated_at = NOW()
          WHERE draft_id = $1
            AND order_id = $2
        `,
        [trustedDraftId, order.order_id]
      );
      return res.status(409).json({
        ok: false,
        code: "PAYMENT_ORDER_EXPIRED",
        message: `결제 대기 시간이 ${paymentOrderTtlMinutes}분을 초과했습니다. 신청 내용을 확인한 뒤 다시 결제를 시도해 주세요.`,
      });
    }

    let pricing = null;
    let priceChanged = false;

    if (context === "application") {
      const applicationDraftResult = await pool.query(
        `
          SELECT name, phone, email, division, discipline, image_key
          FROM application_drafts
          WHERE draft_id = $1
          LIMIT 1
        `,
        [trustedDraftId]
      );

      const applicationDraft = applicationDraftResult.rows[0];

      if (!applicationDraft || !resolveApplicationBaseFee(applicationDraft.image_key).isRegistrationOpen) {
        return res.status(409).json({
          ok: false,
          code: "APPLICATION_REGISTRATION_CLOSED",
          message: "현재 대회 참가 접수 기간이 아닙니다. 접수 기간을 확인해 주세요.",
        });
      }

      const duplicateApplication = await findCompletedDuplicateApplication({
        name: applicationDraft.name,
        phone: applicationDraft.phone,
        email: applicationDraft.email,
        imageKey: applicationDraft.image_key,
      });

      if (duplicateApplication) {
        return res.status(409).json({
          ok: false,
          code: "DUPLICATE_DISCIPLINE_APPLICATION",
          message: "이미 결제 완료된 동일 종목 신청이 있습니다. 신청 조회에서 기존 내역을 확인해 주세요.",
        });
      }

      pricing = await getApplicationEntryFeeQuote({
        name: applicationDraft.name,
        phone: applicationDraft.phone,
        email: applicationDraft.email,
        imageKey: applicationDraft.image_key,
      });
      const orderDetails = resolveApplicationOrderDetails({
        draft: applicationDraft,
        pricing,
      });

      if (!orderDetails.ok) {
        return res.status(409).json({
          ok: false,
          code: orderDetails.code,
          message: orderDetails.message,
        });
      }

      priceChanged =
        normalizeAmount(order.amount) !== orderDetails.amount ||
        order.order_name !== orderDetails.orderName;

      if (priceChanged) {
        const orderUpdateResult = await pool.query(
          `
            UPDATE orders
            SET amount = $2, order_name = $3, updated_at = NOW()
            WHERE order_id = $1
              AND status = 'READY'
            RETURNING amount, order_name
          `,
          [order.order_id, orderDetails.amount, orderDetails.orderName]
        );

        if (orderUpdateResult.rowCount !== 1) {
          return res.status(409).json({
            ok: false,
            code: "KCP_TRADE_BINDING_CHANGED",
            message: "결제 준비 중 주문 상태가 변경되었습니다. 다시 시도해 주세요.",
          });
        }

        order = {
          ...order,
          amount: orderUpdateResult.rows[0].amount,
          order_name: orderUpdateResult.rows[0].order_name,
        };
        amount = normalizeAmount(order.amount);

        if (amount === null) {
          return res.status(400).json({
            ok: false,
            code: "INVALID_UPDATED_ORDER_AMOUNT",
            message: "변경된 결제 금액을 확인할 수 없습니다. 다시 시도해 주세요.",
          });
        }
      }
    }

    if (context === "spectator") {
      const salesStatus = getSpectatorSalesStatus();
      if (!salesStatus.isOpen) {
        return res.status(409).json({
          ok: false,
          code: "SPECTATOR_SALES_CLOSED",
          message: "현재 참관객 입장권 판매 기간이 아닙니다.",
        });
      }

      const spectatorDraftResult = await pool.query(
        `SELECT name, phone, email, total_amount FROM spectator_drafts WHERE draft_id = $1 LIMIT 1`,
        [trustedDraftId]
      );
      const spectatorDraft = spectatorDraftResult.rows[0];

      if (!spectatorDraft) {
        return res.status(404).json({ ok: false, code: "SPECTATOR_DRAFT_NOT_FOUND", message: "참관객 신청 초안을 찾을 수 없습니다." });
      }

      const duplicate = await findCompletedDuplicateSpectator(spectatorDraft);
      if (duplicate) {
        return res.status(409).json({
          ok: false,
          code: "DUPLICATE_SPECTATOR_TICKET",
          message: "동일한 정보로 결제 완료된 참관객 입장권이 있습니다.",
        });
      }

      if (normalizeAmount(order.amount) !== spectatorTicketAmount || Number(spectatorDraft.total_amount) !== spectatorTicketAmount) {
        return res.status(409).json({ ok: false, code: "SPECTATOR_AMOUNT_MISMATCH", message: "참관객 입장권 결제 금액이 올바르지 않습니다." });
      }

      if (await getReservedSpectatorTicketCount() > spectatorTicketCapacity) {
        return res.status(409).json({ ok: false, code: "SPECTATOR_SOLD_OUT", message: "참관객 입장권이 매진되었습니다." });
      }
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
      draftId: trustedDraftId,
      orderId: order.order_id,
    });
    const failUrl = buildKcpFailureUrl(req, {
      code: "KCP_AUTH_FAILED",
      message: "KCP 결제 인증에 실패했습니다.",
      context,
      draftId: trustedDraftId,
      orderId: order.order_id,
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

    const persistenceClient = await pool.connect();

    try {
      await persistenceClient.query("BEGIN");
      const orderUpdateResult = await persistenceClient.query(
        `
          UPDATE orders
          SET
            payment_method = $2,
            updated_at = NOW()
          WHERE order_id = $1
            AND payment_provider = $3
            AND status = 'READY'
          RETURNING order_id
        `,
        [order.order_id, kcpMethod.payMethod, paymentProviders.KCP]
      );
      const draftUpdateResult = await persistenceClient.query(
        `
          UPDATE ${draftBindingTable}
          SET
            payment_method = $3,
            updated_at = NOW()
          WHERE draft_id = $1
            AND order_id = $2
          RETURNING draft_id
        `,
        [trustedDraftId, order.order_id, kcpMethod.payMethod]
      );

      if (orderUpdateResult.rowCount !== 1 || draftUpdateResult.rowCount !== 1) {
        await persistenceClient.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          code: "KCP_TRADE_BINDING_CHANGED",
          message: "결제 준비 중 주문 상태가 변경되었습니다. 다시 시도해 주세요.",
        });
      }

      await persistenceClient.query("COMMIT");
    } catch (error) {
      await persistenceClient.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      persistenceClient.release();
    }

    return res.status(200).json({
      ok: true,
      paymentProvider: paymentProviders.KCP,
      payUrl,
      amount,
      priceChanged,
      pricing,
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

app.post("/orders/:orderId/cancel", async function (req, res) {
  if (!hasTrustedWriteOrigin(req)) {
    return res.status(403).json({ ok: false, code: "UNTRUSTED_REQUEST_ORIGIN", message: "허용되지 않은 요청 출처입니다." });
  }

  const orderId = normalizeText(req.params.orderId);
  const draftId = normalizeText(req.body?.draftId);

  if (!orderId || !draftId) {
    return res.status(400).json({ ok: false, message: "Missing orderId or draftId" });
  }

  if (!requireRequestDraftAccess(req, res, {
    draftId,
    draftType: "application",
    cookieName: applicationDraftCookieName,
  })) {
    return;
  }

  try {
    const cancellation = await cancelPendingDraftOrder({
      draftTable: "application_drafts",
      draftId,
      orderId,
    });

    if (!cancellation.ok) {
      return res.status(cancellation.code === "PAYMENT_ALREADY_COMPLETED" ? 409 : 404).json({
        ok: false,
        code: cancellation.code,
        message: cancellation.code === "PAYMENT_ALREADY_COMPLETED"
          ? "이미 결제 완료된 주문은 취소할 수 없습니다. 신청 조회에서 환불을 진행해 주세요."
          : "주문과 신청 초안이 일치하지 않습니다.",
      });
    }

    return res.status(200).json({ ok: true, orderId, status: "CANCELED" });
  } catch (error) {
    console.error("Failed to cancel pending application order:", error);
    return res.status(500).json({ ok: false, message: "Failed to cancel pending order" });
  }
});

app.post("/stage-services/orders/:orderId/cancel", async function (req, res) {
  if (!hasTrustedWriteOrigin(req)) {
    return res.status(403).json({ ok: false, code: "UNTRUSTED_REQUEST_ORIGIN", message: "허용되지 않은 요청 출처입니다." });
  }

  const orderId = normalizeText(req.params.orderId);
  const draftId = normalizeText(req.body?.draftId);

  if (!orderId || !draftId) {
    return res.status(400).json({ ok: false, message: "Missing orderId or draftId" });
  }

  if (!requireRequestDraftAccess(req, res, {
    draftId,
    draftType: "stage-service",
    cookieName: stageServiceDraftCookieName,
  })) {
    return;
  }

  try {
    const cancellation = await cancelPendingDraftOrder({
      draftTable: "stage_service_drafts",
      draftId,
      orderId,
    });

    if (!cancellation.ok) {
      return res.status(cancellation.code === "PAYMENT_ALREADY_COMPLETED" ? 409 : 404).json({
        ok: false,
        code: cancellation.code,
        message: cancellation.code === "PAYMENT_ALREADY_COMPLETED"
          ? "이미 결제 완료된 주문은 취소할 수 없습니다. 신청 조회에서 환불을 진행해 주세요."
          : "주문과 무대 서비스 초안이 일치하지 않습니다.",
      });
    }

    return res.status(200).json({ ok: true, orderId, status: "CANCELED" });
  } catch (error) {
    console.error("Failed to cancel pending stage service order:", error);
    return res.status(500).json({ ok: false, message: "Failed to cancel pending order" });
  }
});

async function finalizePaidApplicationOrder({ draftId, orderId }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const existingResult = await client.query(
      `
        SELECT application_number, draft_id, order_id, payment_key, status, payment_status,
          name, phone, email, birth_date, organization, instagram_id, introduction,
          weight_class, participant_gender, division, discipline, image_key, submitted_at, updated_at
        FROM applications
        WHERE draft_id = $1
        LIMIT 1
      `,
      [draftId]
    );

    if (existingResult.rowCount > 0) {
      const application = existingResult.rows[0];

      if (application.order_id !== orderId) {
        throw Object.assign(new Error("Completed application order does not match"), {
          code: "DRAFT_ORDER_MISMATCH",
        });
      }

      await client.query("COMMIT");
      return { application: mapApplicationRow(application), idempotent: true };
    }

    const draftResult = await client.query(
      `
        SELECT id, draft_id, order_id, payment_method, name, phone, email, birth_date,
          organization, instagram_id, introduction, weight_class, participant_gender, division, discipline, image_key
        FROM application_drafts
        WHERE draft_id = $1
        FOR UPDATE
      `,
      [draftId]
    );
    const orderResult = await client.query(
      `
        SELECT order_id, amount, status, payment_provider, payment_method, customer_name, customer_email
        FROM orders
        WHERE order_id = $1
        FOR UPDATE
      `,
      [orderId]
    );
    const paymentResult = await client.query(
      `
        SELECT order_id, payment_key, provider_payment_id, payment_provider, status, total_amount
        FROM payments
        WHERE order_id = $1
        ORDER BY updated_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [orderId]
    );
    const draft = draftResult.rows[0];
    const order = orderResult.rows[0];
    const payment = paymentResult.rows[0];
    const bindingValidation = validateCompletionPaymentBinding({ draft, order, payment });

    if (!bindingValidation.ok) {
      throw Object.assign(new Error(bindingValidation.message), { code: bindingValidation.code });
    }

    const applicationResult = await client.query(
      `
        INSERT INTO applications (
          application_number, draft_id, order_id, payment_key, status, payment_status,
          name, phone, email, birth_date, organization, instagram_id, introduction,
          weight_class, participant_gender, division, discipline, image_key, submitted_at, updated_at
        )
        VALUES ($1, $2, $3, $4, 'SUBMITTED', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
        RETURNING id, application_number, draft_id, order_id, payment_key, status, payment_status,
          name, phone, email, birth_date, organization, instagram_id, introduction,
          weight_class, participant_gender, division, discipline, image_key, submitted_at, updated_at
      `,
      [
        generateApplicationNumber(),
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
        draft.participant_gender,
        draft.division,
        draft.discipline,
        draft.image_key,
      ]
    );
    const application = applicationResult.rows[0];

    await client.query(
      `UPDATE application_drafts SET status = 'COMPLETED', updated_at = NOW() WHERE draft_id = $1`,
      [draftId]
    );
    await client.query(
      `UPDATE application_consents SET application_id = $2 WHERE draft_id = $1 AND application_id IS NULL`,
      [draftId, application.id]
    );
    await client.query(
      `UPDATE application_files SET application_id = $2 WHERE draft_id = $1 AND application_id IS NULL`,
      [draft.id, application.id]
    );
    await client.query("COMMIT");

    return { application: mapApplicationRow(application), idempotent: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function finalizePaidStageServiceOrder({ draftId, orderId }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const existingResult = await client.query(
      `
        SELECT service_order_number, order_id, payment_key, service_type, name, phone, email,
          linked_application_number, linked_discipline, linked_applications, photo_has_additional_discipline,
          photo_additional_discipline, video_type, video_additional_discipline,
          hair_participant_discipline, hair_option, hair_additional_discipline,
          hair_optional_option, total_amount, payment_status, service_status, purchased_at, updated_at
        FROM stage_service_orders
        WHERE draft_id = $1
        LIMIT 1
      `,
      [draftId]
    );

    if (existingResult.rowCount > 0) {
      const serviceOrder = existingResult.rows[0];

      if (serviceOrder.order_id !== orderId) {
        throw Object.assign(new Error("Completed stage service order does not match"), {
          code: "DRAFT_ORDER_MISMATCH",
        });
      }

      await client.query("COMMIT");
      return { serviceOrder: mapStageServiceOrderRow(serviceOrder), idempotent: true };
    }

    const draftResult = await client.query(
      `
        SELECT draft_id, order_id, payment_method, service_type, name, phone, email,
          linked_application_number, linked_discipline, linked_applications, photo_has_additional_discipline,
          photo_additional_discipline, video_type, video_additional_discipline,
          hair_participant_discipline, hair_option, hair_additional_discipline,
          hair_optional_option, total_amount
        FROM stage_service_drafts
        WHERE draft_id = $1
        FOR UPDATE
      `,
      [draftId]
    );
    const orderResult = await client.query(
      `
        SELECT order_id, amount, status, payment_provider, payment_method, customer_name, customer_email
        FROM orders
        WHERE order_id = $1
        FOR UPDATE
      `,
      [orderId]
    );
    const paymentResult = await client.query(
      `
        SELECT order_id, payment_key, provider_payment_id, payment_provider, status, total_amount
        FROM payments
        WHERE order_id = $1
        ORDER BY updated_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [orderId]
    );
    const draft = draftResult.rows[0];
    const order = orderResult.rows[0];
    const payment = paymentResult.rows[0];
    const bindingValidation = validateCompletionPaymentBinding({
      draft,
      order,
      payment,
      expectedAmount: draft?.total_amount,
    });

    if (!bindingValidation.ok) {
      throw Object.assign(new Error(bindingValidation.message), { code: bindingValidation.code });
    }

    const serviceOrderResult = await client.query(
      `
        INSERT INTO stage_service_orders (
          service_order_number, draft_id, order_id, payment_key, payment_status, service_status,
          service_type, name, phone, email, linked_application_number, linked_discipline,
          linked_applications,
          photo_has_additional_discipline, photo_additional_discipline, video_type,
          video_additional_discipline, hair_participant_discipline, hair_option,
          hair_additional_discipline, hair_optional_option, total_amount, purchased_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'PURCHASED', $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW())
        RETURNING service_order_number, order_id, payment_key, service_type, name, phone, email,
          linked_application_number, linked_discipline, linked_applications, photo_has_additional_discipline,
          photo_additional_discipline, video_type, video_additional_discipline,
          hair_participant_discipline, hair_option, hair_additional_discipline,
          hair_optional_option, total_amount, payment_status, service_status, purchased_at, updated_at
      `,
      [
        generateStageServiceOrderNumber(),
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
        serializeStageServiceLinkedApplications(
          parseStageServiceLinkedApplications(draft.linked_applications, {
            applicationNumber: draft.linked_application_number,
            discipline: draft.linked_discipline,
          }),
        ),
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
      `UPDATE stage_service_drafts SET status = 'COMPLETED', updated_at = NOW() WHERE draft_id = $1`,
      [draftId]
    );
    await client.query("COMMIT");

    return { serviceOrder: mapStageServiceOrderRow(serviceOrderResult.rows[0]), idempotent: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function finalizePaidSpectatorOrder({ draftId, orderId }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('spectator-ticket-capacity'))");

    const existingResult = await client.query(
      `SELECT * FROM spectator_orders WHERE draft_id = $1 LIMIT 1`,
      [draftId]
    );
    if (existingResult.rowCount > 0) {
      const existing = existingResult.rows[0];
      if (existing.order_id !== orderId) {
        throw Object.assign(new Error("Completed spectator order does not match"), { code: "DRAFT_ORDER_MISMATCH" });
      }
      await client.query("COMMIT");
      return { spectatorOrder: mapSpectatorOrderRow(existing), idempotent: true };
    }

    const draftResult = await client.query(
      `SELECT * FROM spectator_drafts WHERE draft_id = $1 FOR UPDATE`,
      [draftId]
    );
    const orderResult = await client.query(
      `SELECT order_id, amount, status, payment_provider, payment_method, customer_name, customer_email FROM orders WHERE order_id = $1 FOR UPDATE`,
      [orderId]
    );
    const paymentResult = await client.query(
      `SELECT order_id, payment_key, provider_payment_id, payment_provider, status, total_amount FROM payments WHERE order_id = $1 ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`,
      [orderId]
    );
    const draft = draftResult.rows[0];
    const order = orderResult.rows[0];
    const payment = paymentResult.rows[0];
    const bindingValidation = validateCompletionPaymentBinding({
      draft,
      order,
      payment,
      expectedAmount: draft.is_test ? 100 : spectatorTicketAmount,
    });
    if (!bindingValidation.ok) {
      throw Object.assign(new Error(bindingValidation.message), { code: bindingValidation.code });
    }

    if (!draft.is_test) {
      const duplicate = await findCompletedDuplicateSpectator({ queryable: client, ...draft });
      if (duplicate) {
        throw Object.assign(new Error("동일한 정보로 결제 완료된 참관객 입장권이 있습니다."), { code: "DUPLICATE_SPECTATOR_TICKET" });
      }

      const capacityResult = await client.query(`SELECT COUNT(*)::int AS count FROM spectator_orders WHERE payment_status = 'DONE' AND is_test = FALSE`);
      if (Number(capacityResult.rows[0]?.count || 0) >= spectatorTicketCapacity) {
        throw Object.assign(new Error("참관객 입장권이 매진되었습니다."), { code: "SPECTATOR_SOLD_OUT" });
      }
    }

    const spectatorOrderResult = await client.query(
      `
        INSERT INTO spectator_orders (
          spectator_order_number, draft_id, order_id, payment_key, payment_status,
          admission_status, name, phone, email, quantity, unit_amount, total_amount,
          is_test, purchased_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'READY', $6, $7, $8, 1, $9, $9, $10, NOW(), NOW())
        RETURNING *
      `,
      [
        generateSpectatorOrderNumber(),
        draft.draft_id,
        orderId,
        payment.payment_key,
        payment.status,
        draft.name,
        draft.phone,
        draft.email,
        draft.total_amount,
        draft.is_test,
      ]
    );
    await client.query(`UPDATE spectator_drafts SET status = 'COMPLETED', updated_at = NOW() WHERE draft_id = $1`, [draftId]);
    await client.query(`UPDATE spectator_consents SET spectator_order_id = $2 WHERE draft_id = $1 AND spectator_order_id IS NULL`, [draftId, spectatorOrderResult.rows[0].id]);
    await client.query("COMMIT");
    return { spectatorOrder: mapSpectatorOrderRow(spectatorOrderResult.rows[0]), idempotent: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

app.get("/kcp/return", async function (req, res) {
  const context = normalizeKcpPaymentContext(req.query.context);
  const draftId = normalizeText(req.query.draftId);
  const orderId = normalizeText(req.query.orderId);
  const failPath = getKcpFailPath(context);
  const message =
    normalizeText(req.query.res_msg) ||
    normalizeText(req.query.message) ||
    "결제가 취소되었습니다. 다시 결제를 시도해 주세요.";

  await releaseCanceledKcpDraftOrder({ context, draftId, orderId });

  return res.redirect(
    buildKcpRedirectUrl(req, failPath, {
      code: "KCP_PAYMENT_CANCELED",
      message,
      context,
      draftId,
      orderId,
    })
  );
});

app.all("/kcp/fail", async function (req, res) {
  const context = normalizeKcpPaymentContext(req.query.context);
  const draftId = normalizeText(req.query.draftId);
  const orderId =
    normalizeText(req.query.orderId) ||
    normalizeText(req.body?.ordr_idxx) ||
    normalizeText(req.body?.ordr_no) ||
    normalizeText(req.body?.order_no);
  const message =
    normalizeText(req.body?.res_msg) ||
    normalizeText(req.query.res_msg) ||
    normalizeText(req.query.message) ||
    "결제가 취소되었습니다. 다시 결제를 시도해 주세요.";

  await releaseCanceledKcpDraftOrder({ context, draftId, orderId });

  return res.redirect(
    buildKcpRedirectUrl(req, getKcpFailPath(context), {
      code: "KCP_PAYMENT_CANCELED",
      message,
      context,
      draftId,
      orderId,
    })
  );
});

app.post("/kcp/return", async function (req, res) {
  const context = normalizeKcpPaymentContext(req.query.context);
  const draftId = normalizeText(req.query.draftId);
  const orderId =
    normalizeText(req.query.orderId) ||
    normalizeText(req.body.ordr_idxx) ||
    normalizeText(req.body.ordr_no) ||
    normalizeText(req.body.order_no);
  const encData = normalizeText(req.body.enc_data);
  const encInfo = normalizeText(req.body.enc_info);
  const tranCd = normalizeText(req.body.tran_cd);
  const responseCode = normalizeText(req.body.res_cd);
  const responseMessage = normalizeText(req.body.res_msg);
  const failPath = getKcpFailPath(context);
  const successPath = getKcpSuccessPath(context);

  function redirectFailure(code, message) {
    return res.redirect(
      buildKcpRedirectUrl(req, failPath, {
        code,
        message,
        context,
        draftId,
        orderId,
      })
    );
  }

  if (responseCode && responseCode !== "0000") {
    await releaseCanceledKcpDraftOrder({ context, draftId, orderId });
    return redirectFailure(
      "KCP_PAYMENT_CANCELED",
      responseMessage || "결제가 취소되었습니다. 다시 결제를 시도해 주세요."
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
          order_name,
          amount,
          payment_provider,
          payment_method,
          status,
          created_at
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

    if (order.payment_provider !== paymentProviders.KCP) {
      await client.query("ROLLBACK");
      return redirectFailure("PAYMENT_PROVIDER_MISMATCH", "KCP 결제 주문이 아닙니다.");
    }

    const draftBindingTable = getKcpDraftBindingTable(context);
    const draftBindingResult = await client.query(
      `
        SELECT draft_id
        FROM ${draftBindingTable}
        WHERE order_id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [order.order_id]
    );

    if (
      draftBindingResult.rowCount === 0 ||
      !draftId ||
      draftBindingResult.rows[0].draft_id !== draftId
    ) {
      await client.query("ROLLBACK");
      return redirectFailure(
        "KCP_DRAFT_ORDER_MISMATCH",
        "결제 주문과 신청 초안이 일치하지 않습니다."
      );
    }

    const trustedDraftId = draftBindingResult.rows[0].draft_id;

    const existingPaymentResult = await client.query(
      `
        SELECT
          payment_key,
          provider_payment_id,
          payment_provider,
          status,
          total_amount
        FROM payments
        WHERE order_id = $1
          AND payment_provider = $2
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [order.order_id, paymentProviders.KCP]
    );

    if (existingPaymentResult.rowCount > 0) {
      const payment = existingPaymentResult.rows[0];
      const replayValidation = validateExistingPaymentReplay({ order, payment });

      if (!replayValidation.ok) {
        await client.query("ROLLBACK");
        return redirectFailure(replayValidation.code, replayValidation.message);
      }

      await client.query("COMMIT");
      let finalizationPending = false;

      if (context === "application" || context === "stageService" || context === "spectator") {
        try {
          if (context === "application") {
            await finalizePaidApplicationOrder({ draftId: trustedDraftId, orderId: order.order_id });
          } else if (context === "stageService") {
            await finalizePaidStageServiceOrder({ draftId: trustedDraftId, orderId: order.order_id });
          } else {
            await finalizePaidSpectatorOrder({ draftId: trustedDraftId, orderId: order.order_id });
          }
        } catch (error) {
          finalizationPending = true;
          console.error("KCP payment replay finalization is pending:", {
            context,
            draftId: trustedDraftId,
            orderId: order.order_id,
            code: error.code,
            message: error.message,
          });
        }
      }

      return res.redirect(
        buildKcpRedirectUrl(req, successPath, {
          draftId: trustedDraftId,
          orderId: order.order_id,
          amount: payment.total_amount || order.amount,
          paymentKey: payment.payment_key,
          provider: paymentProviders.KCP,
          confirmed: "1",
          finalizationPending: finalizationPending ? "1" : undefined,
        })
      );
    }

    if (order.status !== "READY") {
      await client.query("ROLLBACK");
      return redirectFailure("ORDER_NOT_READY", "결제 가능한 주문 상태가 아닙니다.");
    }

    if (!isKcpTestContext(context) && isPaymentOrderExpired(order.created_at)) {
      await client.query(
        `UPDATE orders SET status = 'CANCELED', updated_at = NOW() WHERE order_id = $1 AND status = 'READY'`,
        [order.order_id]
      );
      await client.query(
        `UPDATE ${draftBindingTable} SET order_id = NULL, status = 'DRAFT', updated_at = NOW() WHERE draft_id = $1 AND order_id = $2`,
        [trustedDraftId, order.order_id]
      );
      await client.query("COMMIT");
      return redirectFailure("PAYMENT_ORDER_EXPIRED", `결제 대기 시간이 ${paymentOrderTtlMinutes}분을 초과했습니다.`);
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

    if (isKcpTestContext(context) && !isMatchingKcpTestOrder(order, context)) {
      await client.query("ROLLBACK");
      return redirectFailure("KCP_TEST_ORDER_MISMATCH", "KCP 테스트 결제 주문이 아닙니다.");
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
      if (response.ok && kcpResponseCode) {
        await client.query(
          `
            UPDATE orders
            SET status = 'FAILED', updated_at = NOW()
            WHERE order_id = $1
          `,
          [order.order_id]
        );
        await client.query("COMMIT");
      } else {
        await client.query("ROLLBACK");
      }

      return redirectFailure(
        response.ok
          ? kcpResponseCode || "KCP_APPROVE_FAILED"
          : "KCP_APPROVE_UNCERTAIN",
        kcpResponseMessage || "KCP 결제 승인에 실패했습니다."
      );
    }

    const approvedOrderId = getKcpApprovedOrderId(json);
    const approvedAmountFromKcp = getKcpApprovedAmount(json);
    const approvedPayType = normalizeKcpInquiryPayType(json.pay_type, json.pay_method);
    const approvalValidation = validateKcpApprovalResult({
      responseCode: kcpResponseCode,
      approvedOrderId,
      approvedAmount: approvedAmountFromKcp,
      approvedPayType,
      expectedOrderId: order.order_id,
      expectedAmount: amount,
      expectedPayType: kcpMethod.payType,
    });

    if (!approvalValidation.ok) {
      await client.query("ROLLBACK");
      console.error("KCP approval verification failed:", {
        code: approvalValidation.code,
        orderId: order.order_id,
        transactionNo: normalizeText(json.tno),
      });
      return redirectFailure(approvalValidation.code, approvalValidation.message);
    }

    const kcpTransactionNo = normalizeText(json.tno);

    if (!kcpTransactionNo) {
      await client.query("ROLLBACK");
      return redirectFailure("KCP_TNO_MISSING", "KCP 거래번호를 확인할 수 없습니다.");
    }

    const approvedAmount = approvalValidation.approvedAmount;
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
        approvedPayType,
        approvedPayType,
        approvedAt,
        approvedAmount,
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

    let finalizationPending = false;

    if (context === "application" || context === "stageService" || context === "spectator") {
      try {
        if (context === "application") {
          await finalizePaidApplicationOrder({ draftId: trustedDraftId, orderId: order.order_id });
        } else if (context === "stageService") {
          await finalizePaidStageServiceOrder({ draftId: trustedDraftId, orderId: order.order_id });
        } else {
          await finalizePaidSpectatorOrder({ draftId: trustedDraftId, orderId: order.order_id });
        }
      } catch (error) {
        finalizationPending = true;
        console.error("KCP payment approved but finalization is pending:", {
          context,
          draftId: trustedDraftId,
          orderId: order.order_id,
          code: error.code,
          message: error.message,
        });
      }
    }

    return res.redirect(
      buildKcpRedirectUrl(req, successPath, {
        draftId: trustedDraftId,
        orderId: order.order_id,
        amount: approvedAmount,
        paymentKey: kcpTransactionNo,
        provider: paymentProviders.KCP,
        confirmed: "1",
        finalizationPending: finalizationPending ? "1" : undefined,
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


function getPublicAssetContentType(objectKey, r2ContentType) {
  if (r2ContentType && r2ContentType !== "application/octet-stream") {
    return r2ContentType;
  }

  const extension = path.extname(objectKey || "").toLowerCase();
  const contentTypesByExtension = {
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };

  return contentTypesByExtension[extension] || "application/octet-stream";
}

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
      .filter((item) => /\.(png|jpe?g|webp|avif|gif|mp4|webm|mov)$/i.test(item.Key))
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

    res.setHeader("Content-Type", getPublicAssetContentType(objectKey, objectResponse.ContentType));
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");

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
      lastSeenAt: req.adminSession.lastSeenAt,
    },
  });
});

app.post("/admin/keep-alive", requireAdminAuth, async function (req, res) {
  if (!hasTrustedAdminOrigin(req)) {
    return res.status(403).json({ ok: false, message: "Untrusted admin origin" });
  }

  const touchResult = await pool.query(
    `
      UPDATE admin_sessions
      SET last_seen_at = NOW()
      WHERE id = $1
      RETURNING last_seen_at
    `,
    [req.adminSession.sessionId]
  );
  const lastSeenAt = touchResult.rows[0]?.last_seen_at || new Date();

  return res.status(200).json({
    ok: true,
    session: {
      expiresAt: req.adminSession.expiresAt,
      lastSeenAt,
    },
  });
});

app.get("/admin/users", requireAdminAuth, requireSuperAdmin, async function (req, res) {
  try {
    const result = await pool.query(
      `
        SELECT
          id,
          email,
          display_name,
          role,
          is_active,
          last_login_at,
          created_at,
          updated_at
        FROM admin_users
        ORDER BY is_active DESC, role DESC, created_at ASC
      `,
    );

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_VIEW_USERS",
      targetType: "admin_users",
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { count: result.rowCount },
    });

    return res.status(200).json({
      ok: true,
      adminUsers: result.rows.map(normalizeAdminUser),
    });
  } catch (error) {
    console.error("Failed to fetch admin users:", error);
    return res.status(500).json({ ok: false, message: "Failed to fetch admin users" });
  }
});

app.post("/admin/users", requireAdminAuth, requireSuperAdmin, async function (req, res) {
  if (!hasTrustedAdminOrigin(req)) {
    return res.status(403).json({ ok: false, message: "Untrusted admin origin" });
  }

  const email = normalizeEmail(req.body?.email);
  const displayName = normalizeAdminDisplayName(req.body?.displayName);
  const password = String(req.body?.password || "");
  const role = normalizeAdminRole(req.body?.role) || "admin";

  if (!hasValidEmail(email) || !displayName || !isValidAdminPassword(password)) {
    return res.status(400).json({
      ok: false,
      message: "A valid email, display name, and password of at least 12 characters are required",
    });
  }

  try {
    const passwordHash = await hashAdminPassword(password);
    const result = await pool.query(
      `
        INSERT INTO admin_users (email, password_hash, display_name, role, is_active)
        VALUES ($1, $2, $3, $4, TRUE)
        RETURNING id, email, display_name, role, is_active, last_login_at, created_at, updated_at
      `,
      [email, passwordHash, displayName, role],
    );
    const adminUser = normalizeAdminUser(result.rows[0]);

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_CREATE_USER",
      targetType: "admin_user",
      targetId: String(adminUser.id),
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { email: adminUser.email, role: adminUser.role },
    });

    return res.status(201).json({ ok: true, adminUser });
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ ok: false, message: "An admin with this email already exists" });
    }

    console.error("Failed to create admin user:", error);
    return res.status(500).json({ ok: false, message: "Failed to create admin user" });
  }
});

app.patch("/admin/users/:adminUserId", requireAdminAuth, requireSuperAdmin, async function (req, res) {
  if (!hasTrustedAdminOrigin(req)) {
    return res.status(403).json({ ok: false, message: "Untrusted admin origin" });
  }

  const adminUserId = Number(req.params.adminUserId);

  if (!Number.isInteger(adminUserId) || adminUserId <= 0) {
    return res.status(400).json({ ok: false, message: "Invalid admin user id" });
  }

  try {
    const existingResult = await pool.query(
      `
        SELECT id, email, display_name, role, is_active, last_login_at, created_at, updated_at
        FROM admin_users
        WHERE id = $1
        LIMIT 1
      `,
      [adminUserId],
    );

    if (existingResult.rowCount === 0) {
      return res.status(404).json({ ok: false, message: "Admin user not found" });
    }

    const existing = existingResult.rows[0];
    const displayName = req.body?.displayName === undefined
      ? existing.display_name
      : normalizeAdminDisplayName(req.body.displayName);
    const role = req.body?.role === undefined
      ? existing.role
      : normalizeAdminRole(req.body.role);
    const isActive = req.body?.isActive === undefined ? existing.is_active : Boolean(req.body.isActive);
    const password = req.body?.password === undefined ? "" : String(req.body.password || "");

    if (!displayName || !role || (req.body?.password !== undefined && !isValidAdminPassword(password))) {
      return res.status(400).json({
        ok: false,
        message: "Display name, role, and a password of at least 12 characters are required",
      });
    }

    if (existing.id === req.adminUser.id && (!isActive || role !== "superadmin")) {
      return res.status(400).json({
        ok: false,
        message: "You cannot deactivate or demote your own superadmin account",
      });
    }

    const removesActiveSuperAdmin = existing.role === "superadmin"
      && existing.is_active
      && (role !== "superadmin" || !isActive);

    if (removesActiveSuperAdmin) {
      const superAdminCountResult = await pool.query(
        "SELECT COUNT(*)::int AS count FROM admin_users WHERE role = 'superadmin' AND is_active = TRUE",
      );

      if (Number(superAdminCountResult.rows[0]?.count || 0) <= 1) {
        return res.status(409).json({
          ok: false,
          message: "At least one active superadmin account must remain",
        });
      }
    }

    const passwordHash = password ? await hashAdminPassword(password) : null;
    const result = await pool.query(
      `
        UPDATE admin_users
        SET
          display_name = $2,
          role = $3,
          is_active = $4,
          password_hash = COALESCE($5, password_hash),
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, email, display_name, role, is_active, last_login_at, created_at, updated_at
      `,
      [adminUserId, displayName, role, isActive, passwordHash],
    );
    const adminUser = normalizeAdminUser(result.rows[0]);

    if (!isActive || passwordHash) {
      await pool.query("DELETE FROM admin_sessions WHERE admin_user_id = $1", [adminUserId]);
    }

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_UPDATE_USER",
      targetType: "admin_user",
      targetId: String(adminUser.id),
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: {
        role: adminUser.role,
        isActive: adminUser.isActive,
        passwordReset: Boolean(passwordHash),
      },
    });

    return res.status(200).json({ ok: true, adminUser });
  } catch (error) {
    console.error("Failed to update admin user:", error);
    return res.status(500).json({ ok: false, message: "Failed to update admin user" });
  }
});

app.get("/admin/applications", requireAdminAuth, async function (req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const requestedPageSize = Number.parseInt(req.query.pageSize, 10) || 50;
    const exportAll = normalizeText(req.query.export) === "1";
    const pageSize = exportAll ? 5000 : Math.min(50, Math.max(1, requestedPageSize));
    const paymentStatus = normalizeText(req.query.paymentStatus);
    const division = normalizeText(req.query.division);
    const discipline = getCanonicalApplicationDisciplineTitle({
      discipline: normalizeText(req.query.discipline),
    });
    const search = normalizeText(req.query.search);
    const requestedSortKey = normalizeText(req.query.sortKey) || "submittedAt";
    const sortDirection = normalizeText(req.query.sortDirection) === "asc" ? "ASC" : "DESC";
    const sortColumns = {
      applicationNumber: "a.application_number",
      name: "a.name",
      birthDate: "a.birth_date",
      discipline: "a.discipline",
      paymentStatus: "a.payment_status",
      submittedAt: "a.submitted_at",
    };
    const sortColumn = sortColumns[requestedSortKey] || sortColumns.submittedAt;
    const clauses = ["a.admin_deleted_at IS NULL"];
    const values = [];

    function addFilter(clause, value) {
      values.push(value);
      clauses.push(clause.replace("?", `$${values.length}`));
    }

    if (paymentStatus && paymentStatus !== "all") {
      addFilter("a.payment_status = ?", paymentStatus);
    }
    if (division && division !== "all") {
      addFilter("a.division = ?", division);
    }
    if (discipline && discipline !== "all") {
      addFilter("a.discipline = ?", discipline);
    }
    if (search) {
      addFilter(
        `(
          a.application_number ILIKE ? OR a.order_id ILIKE ? OR a.name ILIKE ? OR
          a.phone ILIKE ? OR a.email ILIKE ? OR a.organization ILIKE ? OR
          a.division ILIKE ? OR a.discipline ILIKE ? OR a.weight_class ILIKE ? OR
          a.participant_gender ILIKE ? OR a.instagram_id ILIKE ? OR a.introduction ILIKE ?
        )`,
        `%${search}%`
      );
      const parameter = `$${values.length}`;
      clauses[clauses.length - 1] = clauses[clauses.length - 1].replaceAll("?", parameter);
    }

    const whereClause = clauses.join(" AND ");
    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM applications a WHERE ${whereClause}`,
      values
    );
    const summaryResult = await pool.query(
      `
        SELECT
          COUNT(*)::int AS total_count,
          COUNT(*) FILTER (WHERE payment_status = 'DONE')::int AS paid_count
        FROM applications
        WHERE admin_deleted_at IS NULL
      `
    );
    const totalCount = totalResult.rows[0]?.count || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const effectivePage = exportAll ? 1 : Math.min(page, totalPages);
    const offset = exportAll ? 0 : (effectivePage - 1) * pageSize;
    const pageValues = exportAll ? values : [...values, pageSize, offset];
    const pageLimit = exportAll ? "LIMIT 5000" : `LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    const result = await pool.query(
      `
        SELECT
          a.application_number,
          a.order_id,
          a.status,
          a.name,
          a.phone,
          a.email,
          a.birth_date,
          a.organization,
          a.instagram_id,
          a.introduction,
          a.weight_class,
          a.participant_gender,
          a.division,
          a.discipline,
          a.payment_status,
          a.submitted_at,
          document_files.files AS document_files
        FROM applications a
        LEFT JOIN LATERAL (
          SELECT json_agg(
            json_build_object(
              'id', af.id,
              'original_filename', af.original_filename
            )
            ORDER BY af.uploaded_at DESC
          ) AS files
          FROM application_files af
          WHERE af.application_id = a.id
            AND lower(af.original_filename) NOT LIKE '%.mp3'
        ) document_files ON TRUE
        WHERE ${whereClause}
        ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, a.application_number DESC
        ${pageLimit}
      `,
      pageValues
    );

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_VIEW_APPLICATIONS",
      targetType: "applications",
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { count: result.rowCount, page: effectivePage, pageSize, exportAll },
    });

    return res.status(200).json({
      ok: true,
      pagination: {
        page: effectivePage,
        pageSize,
        totalCount,
        totalPages,
      },
      summary: {
        totalCount: summaryResult.rows[0]?.total_count || 0,
        paidCount: summaryResult.rows[0]?.paid_count || 0,
      },
      applications: result.rows.map((row) => {
        const documentFiles = Array.isArray(row.document_files)
          ? row.document_files.map((file) => ({
              id: file.id,
              originalFilename: sanitizeOriginalFilename(file.original_filename),
            }))
          : [];

        return {
          applicationNumber: row.application_number,
          orderId: row.order_id,
          status: row.status,
          name: row.name,
          phone: row.phone,
          email: row.email,
          birthDate: row.birth_date,
          organization: row.organization,
          snsIdentity: row.instagram_id,
          instagramId: row.instagram_id,
          introduction: row.introduction,
          weightClass: row.weight_class,
          participantGender: row.participant_gender,
          division: row.division,
          discipline: getCanonicalApplicationDisciplineTitle({
            discipline: row.discipline,
          }),
          paymentStatus: row.payment_status,
          submittedAt: row.submitted_at,
          documentFiles,
          documentOriginalFilename: documentFiles
            .map((file) => file.originalFilename)
            .join(", "),
        };
      }),
    });
  } catch (error) {
    console.error("Failed to fetch admin applications:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch admin applications",
    });
  }
});

app.patch("/admin/applications/:applicationNumber", requireAdminAuth, async function (req, res) {
  if (!hasTrustedAdminOrigin(req)) {
    return res.status(403).json({ ok: false, message: "Untrusted admin origin" });
  }

  const applicationNumber = normalizeText(req.params.applicationNumber);
  const name = truncateNormalizedText(req.body?.name, 120);
  const phone = truncateNormalizedText(req.body?.phone, 40);
  const email = normalizeEmail(req.body?.email);
  const birthDate = truncateNormalizedText(req.body?.birthDate, 20);
  const organization = truncateNormalizedText(req.body?.organization, 160);
  const snsIdentity = truncateNormalizedText(req.body?.snsIdentity, 500);
  const introduction = truncateNormalizedText(req.body?.introduction, 100);
  const division = truncateNormalizedText(req.body?.division, 80);
  const discipline = getCanonicalApplicationDisciplineTitle({
    discipline: truncateNormalizedText(req.body?.discipline, 100),
  }) || null;
  const weightClass = truncateNormalizedText(req.body?.weightClass, 160);

  if (
    !applicationNumber ||
    !name ||
    !phone ||
    !hasValidEmail(email) ||
    email.length > 255 ||
    !discipline
  ) {
    return res.status(400).json({
      ok: false,
      message: "Application number, name, phone, discipline, and a valid email are required",
    });
  }

  try {
    const result = await pool.query(
      `
        UPDATE applications
        SET
          name = $2,
          phone = $3,
          email = $4,
          birth_date = $5,
          organization = $6,
          instagram_id = $7,
          introduction = $8,
          division = $9,
          discipline = $10,
          weight_class = $11,
          updated_at = NOW()
        WHERE application_number = $1
          AND admin_deleted_at IS NULL
        RETURNING application_number, order_id, status, name, phone, email, birth_date, organization,
          instagram_id, introduction, participant_gender, division, discipline, weight_class, payment_status, submitted_at
      `,
      [
        applicationNumber,
        name,
        phone,
        email,
        birthDate,
        organization,
        snsIdentity,
        introduction,
        division,
        discipline,
        weightClass,
      ],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, message: "Application not found" });
    }

    const application = result.rows[0];
    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_UPDATE_APPLICATION",
      targetType: "application",
      targetId: applicationNumber,
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: {
        updatedFields: [
          "name",
          "phone",
          "email",
          "birthDate",
          "organization",
          "snsIdentity",
          "introduction",
          "division",
          "discipline",
          "weightClass",
        ],
      },
    });

    return res.status(200).json({
      ok: true,
      application: {
        applicationNumber: application.application_number,
        orderId: application.order_id,
        status: application.status,
        name: application.name,
        phone: application.phone,
        email: application.email,
        birthDate: application.birth_date,
        organization: application.organization,
        snsIdentity: application.instagram_id,
        introduction: application.introduction,
        participantGender: application.participant_gender,
        division: application.division,
        discipline: getCanonicalApplicationDisciplineTitle({ discipline: application.discipline }),
        weightClass: application.weight_class,
        paymentStatus: application.payment_status,
        submittedAt: application.submitted_at,
      },
    });
  } catch (error) {
    console.error("Failed to update admin application:", error);
    return res.status(500).json({ ok: false, message: "Failed to update application" });
  }
});

app.delete("/admin/applications/:applicationNumber", requireAdminAuth, requireSuperAdmin, async function (req, res) {
  if (!hasTrustedAdminOrigin(req)) {
    return res.status(403).json({ ok: false, message: "Untrusted admin origin" });
  }

  const applicationNumber = normalizeText(req.params.applicationNumber);

  if (!applicationNumber) {
    return res.status(400).json({ ok: false, message: "Application number is required" });
  }

  try {
    const applicationResult = await pool.query(
      `
        SELECT id, application_number, payment_status, status
        FROM applications
        WHERE application_number = $1
          AND admin_deleted_at IS NULL
        LIMIT 1
      `,
      [applicationNumber],
    );

    if (applicationResult.rowCount === 0) {
      return res.status(404).json({ ok: false, message: "Application not found" });
    }

    const application = applicationResult.rows[0];
    if (application.payment_status === "DONE") {
      return res.status(409).json({
        ok: false,
        message: "Paid applications cannot be deleted. Use the refund flow instead.",
      });
    }

    const [stageServiceResult, refundRequestResult] = await Promise.all([
      pool.query(
        `
          SELECT 1
          FROM stage_service_orders
          WHERE linked_application_number = $1
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(linked_applications) AS linked_application
              WHERE linked_application ->> 'applicationNumber' = $1
            )
          LIMIT 1
        `,
        [applicationNumber],
      ),
      pool.query(
        `
          SELECT 1
          FROM application_refund_requests
          WHERE application_number = $1
            AND request_status IN ('REQUESTED', 'PROCESSING', 'COMPLETED', 'SYNC_FAILED')
          LIMIT 1
        `,
        [applicationNumber],
      ),
    ]);

    if (stageServiceResult.rowCount > 0 || refundRequestResult.rowCount > 0) {
      return res.status(409).json({
        ok: false,
        message: "Applications linked to stage services or refund records cannot be deleted",
      });
    }

    await pool.query(
      `
        UPDATE applications
        SET
          admin_deleted_at = NOW(),
          admin_deleted_by = $2,
          updated_at = NOW()
        WHERE id = $1
      `,
      [application.id, req.adminUser.id],
    );

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_SOFT_DELETE_APPLICATION",
      targetType: "application",
      targetId: applicationNumber,
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { paymentStatus: application.payment_status },
    });

    return res.status(200).json({ ok: true, applicationNumber });
  } catch (error) {
    console.error("Failed to delete admin application:", error);
    return res.status(500).json({ ok: false, message: "Failed to delete application" });
  }
});

app.get("/admin/stage-services", requireAdminAuth, async function (req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const requestedPageSize = Number.parseInt(req.query.pageSize, 10) || 50;
    const exportAll = normalizeText(req.query.export) === "1";
    const pageSize = exportAll ? 5000 : Math.min(50, Math.max(1, requestedPageSize));
    const search = normalizeText(req.query.search);
    const serviceType = normalizeStageServiceType(req.query.serviceType);
    const requestedSortKey = normalizeText(req.query.sortKey) || "purchasedAt";
    const sortDirection = normalizeText(req.query.sortDirection) === "asc" ? "ASC" : "DESC";
    const sortColumns = {
      serviceOrderNumber: "service_order_number",
      name: "name",
      linkedApplicationNumber: "linked_application_number",
      serviceType: "service_type",
      totalAmount: "total_amount",
      paymentStatus: "payment_status",
      serviceStatus: "service_status",
      purchasedAt: "purchased_at",
    };
    const sortColumn = sortColumns[requestedSortKey] || sortColumns.purchasedAt;
    const clauses = ["1 = 1"];
    const values = [];

    function addFilter(clause, value) {
      values.push(value);
      clauses.push(clause.replace("?", `$${values.length}`));
    }

    if (serviceType) {
      addFilter("service_type = ?", serviceType);
    }
    if (search) {
      addFilter(
        `(
          service_order_number ILIKE ? OR order_id ILIKE ? OR payment_key ILIKE ? OR
          name ILIKE ? OR phone ILIKE ? OR email ILIKE ? OR
          linked_application_number ILIKE ? OR linked_discipline ILIKE ? OR
          linked_applications::text ILIKE ? OR service_type ILIKE ?
        )`,
        `%${search}%`
      );
      const parameter = `$${values.length}`;
      clauses[clauses.length - 1] = clauses[clauses.length - 1].replaceAll("?", parameter);
    }

    const whereClause = clauses.join(" AND ");
    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM stage_service_orders WHERE ${whereClause}`,
      values
    );
    const totalCount = totalResult.rows[0]?.count || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const effectivePage = exportAll ? 1 : Math.min(page, totalPages);
    const offset = exportAll ? 0 : (effectivePage - 1) * pageSize;
    const pageValues = exportAll ? values : [...values, pageSize, offset];
    const pageLimit = exportAll
      ? "LIMIT 5000"
      : `LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
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
          linked_applications,
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
        WHERE ${whereClause}
        ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, service_order_number DESC
        ${pageLimit}
      `,
      pageValues
    );

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_VIEW_STAGE_SERVICES",
      targetType: "stage_service_orders",
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { count: result.rowCount, page: effectivePage, pageSize, exportAll },
    });

    return res.status(200).json({
      ok: true,
      pagination: {
        page: effectivePage,
        pageSize,
        totalCount,
        totalPages,
      },
      stageServices: result.rows.map((row) => {
        const hairAddOns = parseHairAddOns(row.hair_optional_option);
        const linkedApplications = parseStageServiceLinkedApplications(row.linked_applications, {
          applicationNumber: row.linked_application_number,
          discipline: row.linked_discipline,
        });

        return {
          ...hairAddOns,
          serviceOrderNumber: row.service_order_number,
          orderId: row.order_id,
          paymentKey: row.payment_key,
          serviceType: row.service_type,
          name: row.name,
          phone: row.phone,
          email: row.email,
          linkedApplicationNumber: row.linked_application_number,
          linkedDiscipline: getCanonicalApplicationDisciplineTitle({
            discipline: row.linked_discipline,
          }),
          linkedApplications,
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
      }),
    });
  } catch (error) {
    console.error("Failed to fetch admin stage services:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch admin stage services",
    });
  }
});

app.get("/admin/spectators", requireAdminAuth, async function (req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const requestedPageSize = Number.parseInt(req.query.pageSize, 10) || 50;
    const exportAll = normalizeText(req.query.export) === "1";
    const pageSize = exportAll ? 5000 : Math.min(50, Math.max(1, requestedPageSize));
    const search = normalizeText(req.query.search);
    const paymentStatus = normalizeText(req.query.paymentStatus);
    const admissionStatus = normalizeText(req.query.admissionStatus);
    const requestedSortKey = normalizeText(req.query.sortKey) || "purchasedAt";
    const sortDirection = normalizeText(req.query.sortDirection) === "asc" ? "ASC" : "DESC";
    const sortColumns = {
      spectatorOrderNumber: "spectator_orders.spectator_order_number",
      name: "spectator_orders.name",
      paymentStatus: "spectator_orders.payment_status",
      admissionStatus: "spectator_orders.admission_status",
      totalAmount: "spectator_orders.total_amount",
      purchasedAt: "spectator_orders.purchased_at",
    };
    const sortColumn = sortColumns[requestedSortKey] || sortColumns.purchasedAt;
    const clauses = ["1 = 1"];
    const values = [];

    function addFilter(clause, value) {
      values.push(value);
      clauses.push(clause.replaceAll("?", `$${values.length}`));
    }

    if (paymentStatus && paymentStatus !== "all") {
      addFilter("spectator_orders.payment_status = ?", paymentStatus);
    }
    if (admissionStatus && admissionStatus !== "all") {
      addFilter("spectator_orders.admission_status = ?", admissionStatus);
    }
    if (search) {
      addFilter(
        `(
          spectator_orders.spectator_order_number ILIKE ? OR
          spectator_orders.order_id ILIKE ? OR spectator_orders.payment_key ILIKE ? OR
          spectator_orders.name ILIKE ? OR spectator_orders.phone ILIKE ? OR
          spectator_orders.email ILIKE ?
        )`,
        `%${search}%`
      );
    }

    const whereClause = clauses.join(" AND ");
    const summaryResult = await pool.query(
      `
        SELECT
          COUNT(*)::int AS total_count,
          COUNT(*) FILTER (WHERE payment_status = 'DONE' AND is_test = FALSE)::int AS paid_count,
          COALESCE(SUM(quantity) FILTER (WHERE payment_status = 'DONE' AND is_test = FALSE), 0)::int AS sold_count
        FROM spectator_orders
        WHERE ${whereClause}
      `,
      values
    );
    const totalCount = summaryResult.rows[0]?.total_count || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const effectivePage = exportAll ? 1 : Math.min(page, totalPages);
    const offset = exportAll ? 0 : (effectivePage - 1) * pageSize;
    const pageValues = exportAll ? values : [...values, pageSize, offset];
    const pageLimit = exportAll
      ? "LIMIT 5000"
      : `LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    const result = await pool.query(
      `
        SELECT
          spectator_orders.*,
          payments.approved_at AS payment_completed_at,
          consents.privacy_consent,
          consents.refund_consent,
          consents.marketing_consent,
          consents.photo_video_consent
        FROM spectator_orders
        LEFT JOIN payments
          ON payments.payment_key = spectator_orders.payment_key
          OR payments.order_id = spectator_orders.order_id
        LEFT JOIN LATERAL (
          SELECT privacy_consent, refund_consent, marketing_consent, photo_video_consent
          FROM spectator_consents
          WHERE spectator_consents.spectator_order_id = spectator_orders.id
             OR spectator_consents.draft_id = spectator_orders.draft_id
          ORDER BY spectator_consents.consented_at DESC
          LIMIT 1
        ) AS consents ON TRUE
        WHERE ${whereClause}
        ORDER BY ${sortColumn} ${sortDirection} NULLS LAST,
          spectator_orders.spectator_order_number DESC
        ${pageLimit}
      `,
      pageValues
    );

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: exportAll ? "ADMIN_EXPORT_SPECTATORS" : "ADMIN_VIEW_SPECTATORS",
      targetType: "spectator_orders",
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { count: result.rowCount, page: effectivePage, pageSize, exportAll },
    });

    return res.status(200).json({
      ok: true,
      pagination: { page: effectivePage, pageSize, totalCount, totalPages },
      summary: {
        totalCount,
        paidCount: summaryResult.rows[0]?.paid_count || 0,
        soldCount: summaryResult.rows[0]?.sold_count || 0,
        capacity: spectatorTicketCapacity,
      },
      spectators: result.rows.map((row) => ({
        ...mapSpectatorOrderRow(row, { maskPersonalInfo: false }),
        paymentCompletedAt: row.payment_completed_at,
        consents: {
          privacy: row.privacy_consent === true,
          refund: row.refund_consent === true,
          marketing: row.marketing_consent === true,
          photoVideo: row.photo_video_consent === true,
        },
      })),
    });
  } catch (error) {
    console.error("Failed to fetch admin spectators:", error);
    return res.status(500).json({ ok: false, message: "Failed to fetch admin spectators" });
  }
});

app.get("/admin/applications/:applicationNumber/files/:fileReference/download", requireAdminAuth, async function (req, res) {
  try {
    if (!ensureR2ReadReady()) {
      return res.status(500).json({
        ok: false,
        message: "R2 read is not configured",
      });
    }

    const applicationNumber = normalizeText(req.params.applicationNumber);
    const fileReference = normalizeText(req.params.fileReference);
    const fileId = /^\d+$/.test(fileReference) ? Number(fileReference) : null;

    if (!applicationNumber || (!fileId && fileReference !== "document")) {
      return res.status(400).json({
        ok: false,
        message: "Application number and a document file reference are required",
      });
    }

    const filterSql = fileId
      ? "af.id = $2 AND lower(af.original_filename) NOT LIKE '%.mp3'"
      : "lower(af.original_filename) NOT LIKE '%.mp3'";
    const queryValues = fileId ? [applicationNumber, fileId] : [applicationNumber];

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
      queryValues
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
        fileId,
        originalFilename: file.original_filename,
      },
    });

    const downloadFilename = sanitizeOriginalFilename(file.original_filename);

    res.setHeader("Content-Type", file.mime_type || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename || "download")}`
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

app.get("/admin/refund-requests", requireAdminAuth, async function (req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const requestedPageSize = Number.parseInt(req.query.pageSize, 10) || 50;
    const exportAll = normalizeText(req.query.export) === "1";
    const pageSize = exportAll ? 5000 : Math.min(50, Math.max(1, requestedPageSize));
    const requestStatus = normalizeText(req.query.requestStatus);
    const search = (normalizeText(req.query.search) || "").toLowerCase();
    const requestedSortKey = normalizeText(req.query.sortKey) || "createdAt";
    const sortDirection = normalizeText(req.query.sortDirection) === "asc" ? "asc" : "desc";

    const applicationRequestsResult = await pool.query(
      `
        SELECT
          requests.*,
          applications.name AS application_name,
          applications.phone AS application_phone,
          applications.email AS application_email,
          applications.division,
          applications.discipline,
          payments.status AS payment_status
        FROM application_refund_requests AS requests
        LEFT JOIN applications
          ON applications.application_number = requests.application_number
        LEFT JOIN payments
          ON payments.payment_key = requests.payment_key
          OR payments.order_id = requests.order_id
        ORDER BY requests.created_at DESC
        LIMIT 5000
      `
    );
    const stageRefundRequestTableResult = await pool.query(
      "SELECT to_regclass('public.stage_service_refund_requests') AS table_name"
    );
    const stageRequestsResult = stageRefundRequestTableResult.rows[0]?.table_name
      ? await pool.query(
          `
            SELECT
              requests.*,
              service_orders.name AS service_name,
              service_orders.phone AS service_phone,
              service_orders.email AS service_email,
              service_orders.service_type,
              service_orders.linked_application_number,
              payments.status AS payment_status
            FROM stage_service_refund_requests AS requests
            LEFT JOIN stage_service_orders AS service_orders
              ON service_orders.service_order_number = requests.service_order_number
            LEFT JOIN payments
              ON payments.payment_key = requests.payment_key
              OR payments.order_id = requests.order_id
            ORDER BY requests.created_at DESC
            LIMIT 5000
          `
        )
      : { rows: [] };
    const spectatorRefundRequestTableResult = await pool.query(
      "SELECT to_regclass('public.spectator_refund_requests') AS table_name"
    );
    const spectatorRequestsResult = spectatorRefundRequestTableResult.rows[0]?.table_name
      ? await pool.query(
          `
            SELECT
              requests.*,
              spectator_orders.name AS spectator_name,
              spectator_orders.phone AS spectator_phone,
              spectator_orders.email AS spectator_email,
              payments.status AS payment_status
            FROM spectator_refund_requests AS requests
            LEFT JOIN spectator_orders
              ON spectator_orders.spectator_order_number = requests.spectator_order_number
            LEFT JOIN payments
              ON payments.payment_key = requests.payment_key
              OR payments.order_id = requests.order_id
            ORDER BY requests.created_at DESC
            LIMIT 5000
          `
        )
      : { rows: [] };

    const allRequests = [
      ...applicationRequestsResult.rows.map((row) => ({
        ...mapRefundRequestRow(row),
        refundTarget: "application",
        serviceOrderNumber: null,
        serviceType: null,
        name: row.application_name,
        phone: row.application_phone,
        email: row.application_email,
        division: row.division,
        discipline: getCanonicalApplicationDisciplineTitle({ discipline: row.discipline }),
        paymentStatus: row.payment_status,
      })),
      ...stageRequestsResult.rows.map(mapAdminStageServiceRefundRequestRow),
      ...spectatorRequestsResult.rows.map(mapAdminSpectatorRefundRequestRow),
    ];
    const filteredRequests = allRequests.filter((row) => {
      if (requestStatus && requestStatus !== "all" && row.requestStatus !== requestStatus) {
        return false;
      }

      if (!search) {
        return true;
      }

      return [
        row.applicationNumber,
        row.serviceOrderNumber,
        row.spectatorOrderNumber,
        row.serviceType,
        row.orderId,
        row.paymentKey,
        row.name,
        row.phone,
        row.email,
        row.discipline,
        row.requestReason,
        row.requestStatus,
        row.policyRuleLabel,
        row.policyRuleId,
        row.providerStatusCode,
        row.providerErrorCode,
        row.providerErrorMessage,
      ].some((value) => String(value || "").toLowerCase().includes(search));
    });
    const sortValue = (row) => {
      if (requestedSortKey === "requestStatus") return row.requestStatus || "";
      if (requestedSortKey === "refundAmount") return Number(row.refundAmount) || 0;
      if (requestedSortKey === "name") return row.name || "";
      if (requestedSortKey === "applicationNumber") {
        return row.applicationNumber || row.serviceOrderNumber || "";
      }
      if (requestedSortKey === "discipline") return row.discipline || "";
      return new Date(row.createdAt || 0).getTime();
    };
    filteredRequests.sort((left, right) => {
      const leftValue = sortValue(left);
      const rightValue = sortValue(right);
      const comparison =
        typeof leftValue === "string"
          ? leftValue.localeCompare(String(rightValue), "ko")
          : leftValue - rightValue;
      return sortDirection === "asc" ? comparison : -comparison;
    });

    const totalCount = filteredRequests.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const effectivePage = exportAll ? 1 : Math.min(page, totalPages);
    const startIndex = exportAll ? 0 : (effectivePage - 1) * pageSize;
    const requests = filteredRequests.slice(startIndex, startIndex + pageSize);

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_VIEW_REFUND_REQUESTS",
      targetType: "application_refund_requests",
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { count: requests.length, page: effectivePage, pageSize, exportAll },
    });

    return res.status(200).json({
      ok: true,
      pagination: { page: effectivePage, pageSize, totalCount, totalPages },
      summary: {
        totalCount,
        processingCount: filteredRequests.filter((row) =>
          ["REQUESTED", "PROCESSING", "SYNC_FAILED"].includes(row.requestStatus)
        ).length,
        completedCount: filteredRequests.filter((row) => row.requestStatus === "COMPLETED").length,
        failedCount: filteredRequests.filter((row) => row.requestStatus === "FAILED").length,
      },
      refundRequests: requests,
    });
  } catch (error) {
    console.error("Failed to fetch admin refund requests:", error);
    return res.status(500).json({ ok: false, message: "Failed to fetch admin refund requests" });
  }
});

app.get("/admin/canceled-payments", requireAdminAuth, async function (req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const requestedPageSize = Number.parseInt(req.query.pageSize, 10) || 50;
    const exportAll = normalizeText(req.query.export) === "1";
    const pageSize = exportAll ? 5000 : Math.min(50, Math.max(1, requestedPageSize));
    const paymentStatus = normalizeText(req.query.paymentStatus);
    const search = normalizeText(req.query.search);
    const requestedSortKey = normalizeText(req.query.sortKey) || "updatedAt";
    const sortDirection = normalizeText(req.query.sortDirection) === "asc" ? "ASC" : "DESC";
    const sortColumns = {
      orderId: "payments.order_id",
      paymentStatus: "payments.status",
      totalAmount: "payments.total_amount",
      updatedAt: "payments.updated_at",
    };
    const sortColumn = sortColumns[requestedSortKey] || sortColumns.updatedAt;
    const clauses = ["payments.status IN ('CANCELED', 'PARTIAL_CANCELED')"];
    const values = [];

    function addFilter(clause, value) {
      values.push(value);
      clauses.push(clause.replace("?", `$${values.length}`));
    }

    if (paymentStatus && paymentStatus !== "all") {
      addFilter("payments.status = ?", paymentStatus);
    }
    if (search) {
      addFilter(
        `(
          payments.order_id ILIKE ? OR payments.payment_key ILIKE ? OR
          applications.application_number ILIKE ? OR applications.name ILIKE ? OR
          applications.phone ILIKE ? OR applications.email ILIKE ? OR
          stage_service_orders.service_order_number ILIKE ? OR
          stage_service_orders.name ILIKE ? OR stage_service_orders.phone ILIKE ? OR
          stage_service_orders.email ILIKE ? OR
          spectator_orders.spectator_order_number ILIKE ? OR spectator_orders.name ILIKE ? OR
          spectator_orders.phone ILIKE ? OR spectator_orders.email ILIKE ? OR
          orders.customer_name ILIKE ? OR orders.customer_email ILIKE ?
        )`,
        `%${search}%`
      );
      const parameter = `$${values.length}`;
      clauses[clauses.length - 1] = clauses[clauses.length - 1].replaceAll("?", parameter);
    }

    const whereClause = clauses.join(" AND ");
    const totalResult = await pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM payments
        LEFT JOIN applications ON applications.order_id = payments.order_id
        LEFT JOIN stage_service_orders ON stage_service_orders.order_id = payments.order_id
        LEFT JOIN spectator_orders ON spectator_orders.order_id = payments.order_id
        LEFT JOIN orders ON orders.order_id = payments.order_id
        WHERE ${whereClause}
      `,
      values
    );
    const totalCount = totalResult.rows[0]?.count || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const effectivePage = exportAll ? 1 : Math.min(page, totalPages);
    const offset = exportAll ? 0 : (effectivePage - 1) * pageSize;
    const pageValues = exportAll ? values : [...values, pageSize, offset];
    const pageLimit = exportAll
      ? "LIMIT 5000"
      : `LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
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
          applications.name,
          applications.phone,
          applications.email,
          applications.division,
          applications.discipline,
          stage_service_orders.service_order_number,
          stage_service_orders.service_type,
          stage_service_orders.linked_application_number AS stage_linked_application_number,
          stage_service_orders.name AS stage_service_name,
          stage_service_orders.phone AS stage_service_phone,
          stage_service_orders.email AS stage_service_email,
          spectator_orders.spectator_order_number,
          spectator_orders.name AS spectator_name,
          spectator_orders.phone AS spectator_phone,
          spectator_orders.email AS spectator_email,
          orders.customer_name,
          orders.customer_email,
          orders.status AS order_status
        FROM payments
        LEFT JOIN applications ON applications.order_id = payments.order_id
        LEFT JOIN stage_service_orders ON stage_service_orders.order_id = payments.order_id
        LEFT JOIN spectator_orders ON spectator_orders.order_id = payments.order_id
        LEFT JOIN orders ON orders.order_id = payments.order_id
        WHERE ${whereClause}
        ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, payments.order_id DESC
        ${pageLimit}
      `,
      pageValues
    );

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_VIEW_CANCELED_PAYMENTS",
      targetType: "payments",
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { count: result.rowCount, page: effectivePage, pageSize, exportAll },
    });

    return res.status(200).json({
      ok: true,
      pagination: { page: effectivePage, pageSize, totalCount, totalPages },
      refunds: result.rows.map((row) => ({
        orderId: row.order_id,
        paymentKey: row.payment_key,
        refundTarget: row.service_order_number ? "stage-service" : row.spectator_order_number ? "spectator" : "application",
        applicationNumber: row.application_number || row.stage_linked_application_number || row.spectator_order_number,
        serviceOrderNumber: row.service_order_number,
        spectatorOrderNumber: row.spectator_order_number,
        serviceType: row.service_type,
        name: row.name || row.stage_service_name || row.spectator_name || row.customer_name,
        phone: row.phone || row.stage_service_phone || row.spectator_phone,
        email: row.email || row.stage_service_email || row.spectator_email || row.customer_email,
        division: row.service_order_number ? "무대 서비스" : row.spectator_order_number ? "참관객" : row.division,
        discipline: row.spectator_order_number
          ? "입장권 1매"
          : row.service_order_number
          ? stageServiceDefinitions[row.service_type]?.title || row.service_type
          : getCanonicalApplicationDisciplineTitle({ discipline: row.discipline }),
        paymentStatus: row.status,
        totalAmount: row.total_amount,
        approvedAt: row.approved_at,
        orderStatus: row.order_status,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch admin canceled payments:", error);
    return res.status(500).json({ ok: false, message: "Failed to fetch admin canceled payments" });
  }
});

app.get("/admin/refunds", requireAdminAuth, async function (req, res) {
  try {
    const refundRequestResult = await pool.query(
      `
        SELECT
          requests.*,
          applications.name AS application_name,
          applications.phone AS application_phone,
          applications.email AS application_email,
          applications.division,
          applications.discipline,
          payments.status AS payment_status
        FROM application_refund_requests AS requests
        LEFT JOIN applications
          ON applications.application_number = requests.application_number
        LEFT JOIN payments
          ON payments.payment_key = requests.payment_key
          OR payments.order_id = requests.order_id
        ORDER BY requests.created_at DESC
        LIMIT 200
      `
    );

    const stageRefundRequestTableResult = await pool.query(
      "SELECT to_regclass('public.stage_service_refund_requests') AS table_name"
    );
    const stageRefundRequestResult = stageRefundRequestTableResult.rows[0]?.table_name
      ? await pool.query(
          `
            SELECT
              requests.*,
              service_orders.name AS service_name,
              service_orders.phone AS service_phone,
              service_orders.email AS service_email,
              service_orders.service_type,
              service_orders.linked_application_number,
              payments.status AS payment_status
            FROM stage_service_refund_requests AS requests
            LEFT JOIN stage_service_orders AS service_orders
              ON service_orders.service_order_number = requests.service_order_number
            LEFT JOIN payments
              ON payments.payment_key = requests.payment_key
              OR payments.order_id = requests.order_id
            ORDER BY requests.created_at DESC
            LIMIT 200
          `
        )
      : { rows: [], rowCount: 0 };

    const canceledPaymentResult = await pool.query(
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
          stage_service_orders.service_order_number,
          stage_service_orders.service_type,
          stage_service_orders.linked_application_number AS stage_linked_application_number,
          stage_service_orders.name AS stage_service_name,
          stage_service_orders.phone AS stage_service_phone,
          stage_service_orders.email AS stage_service_email,
          orders.customer_name,
          orders.customer_email,
          orders.status AS order_status
        FROM payments
        LEFT JOIN applications
          ON applications.order_id = payments.order_id
        LEFT JOIN stage_service_orders
          ON stage_service_orders.order_id = payments.order_id
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
      metadata: {
        refundRequestCount: refundRequestResult.rowCount,
        stageRefundRequestCount: stageRefundRequestResult.rowCount,
        canceledPaymentCount: canceledPaymentResult.rowCount,
      },
    });

    return res.status(200).json({
      ok: true,
      refundRequests: [
        ...refundRequestResult.rows.map((row) => ({
          ...mapRefundRequestRow(row),
          refundTarget: "application",
          serviceOrderNumber: null,
          serviceType: null,
          name: row.application_name,
          phone: row.application_phone,
          email: row.application_email,
          division: row.division,
          discipline: getCanonicalApplicationDisciplineTitle({
            discipline: row.discipline,
          }),
          paymentStatus: row.payment_status,
        })),
        ...stageRefundRequestResult.rows.map(mapAdminStageServiceRefundRequestRow),
      ].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0)),
      refunds: canceledPaymentResult.rows.map((row) => ({
        orderId: row.order_id,
        paymentKey: row.payment_key,
        refundTarget: row.service_order_number ? "stage-service" : "application",
        applicationNumber: row.application_number || row.stage_linked_application_number,
        serviceOrderNumber: row.service_order_number,
        serviceType: row.service_type,
        name: row.name || row.stage_service_name || row.customer_name,
        phone: row.phone || row.stage_service_phone,
        email: row.email || row.stage_service_email || row.customer_email,
        division: row.service_order_number ? "무대 서비스" : row.division,
        discipline: row.service_order_number
          ? stageServiceDefinitions[row.service_type]?.title || row.service_type
          : getCanonicalApplicationDisciplineTitle({ discipline: row.discipline }),
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

app.post(
  "/admin/kcp/payments/:orderId/reconcile",
  requireAdminAuth,
  async function (req, res) {
    if (!hasTrustedAdminOrigin(req)) {
      return res.status(403).json({
        ok: false,
        code: "UNTRUSTED_ADMIN_ORIGIN",
        message: "허용되지 않은 관리자 요청 출처입니다.",
      });
    }

    const orderId = normalizeText(req.params.orderId);

    if (!orderId) {
      return res.status(400).json({
        ok: false,
        code: "ORDER_ID_REQUIRED",
        message: "주문번호를 입력해 주세요.",
      });
    }

    let snapshot;

    try {
      snapshot = await getKcpReconciliationSnapshot(pool, orderId);
    } catch (error) {
      console.error("Failed to load KCP payment for reconciliation:", error);
      return res.status(500).json({
        ok: false,
        message: "KCP 결제정보를 불러오지 못했습니다.",
      });
    }

    if (!snapshot.order) {
      return res.status(404).json({
        ok: false,
        code: "ORDER_NOT_FOUND",
        message: "주문정보를 찾을 수 없습니다.",
      });
    }

    if (snapshot.order.payment_provider !== paymentProviders.KCP || !snapshot.payment) {
      return res.status(409).json({
        ok: false,
        code: "KCP_PAYMENT_NOT_FOUND",
        message: "해당 주문의 KCP 결제정보를 찾을 수 없습니다.",
      });
    }

    const paymentKey =
      normalizeText(snapshot.payment.provider_payment_id) ||
      normalizeText(snapshot.payment.payment_key);
    const storedPaymentKey = normalizeText(snapshot.payment.payment_key);
    const orderAmount = normalizeAmount(snapshot.order.amount);
    const paymentAmount = normalizeAmount(snapshot.payment.total_amount);
    const payType = normalizeKcpInquiryPayType(
      snapshot.payment.payment_type,
      snapshot.payment.method,
      snapshot.order.payment_method
    );

    if (
      !paymentKey ||
      !storedPaymentKey ||
      paymentKey !== storedPaymentKey ||
      !orderAmount ||
      (paymentAmount !== null && paymentAmount !== orderAmount)
    ) {
      return res.status(409).json({
        ok: false,
        code: "KCP_STORED_PAYMENT_MISMATCH",
        message: "DB의 주문금액 또는 KCP 거래번호가 일치하지 않습니다.",
      });
    }

    if (!payType) {
      return res.status(409).json({
        ok: false,
        code: "KCP_PAY_TYPE_UNSUPPORTED",
        message: "KCP 거래조회가 지원되지 않는 결제수단입니다.",
      });
    }

    let inquiryResponse;

    try {
      inquiryResponse = await requestKcpTransactionInquiry({ paymentKey, payType });
    } catch (error) {
      console.error("Failed to request KCP transaction inquiry:", error);
      return res.status(error.statusCode || 502).json({
        ok: false,
        code: "KCP_INQUIRY_UNAVAILABLE",
        message: error.message || "KCP 거래조회 요청에 실패했습니다.",
      });
    }

    if (!inquiryResponse.ok) {
      return res.status(502).json({
        ok: false,
        code: inquiryResponse.errorCode,
        message: inquiryResponse.errorMessage,
      });
    }

    const inquiryPayload = inquiryResponse.result;
    const inquiryPaymentKey = normalizeText(inquiryPayload?.tno);
    const interpretedInquiry = interpretKcpInquiryResult(inquiryPayload, payType);

    if (!inquiryPaymentKey || inquiryPaymentKey !== paymentKey) {
      return res.status(409).json({
        ok: false,
        code: "KCP_INQUIRY_TRANSACTION_MISMATCH",
        message: "KCP에서 조회된 거래번호가 DB의 거래번호와 일치하지 않습니다.",
      });
    }

    if (!interpretedInquiry.ok) {
      return res.status(409).json({
        ok: false,
        code: interpretedInquiry.code,
        message: interpretedInquiry.message,
        inquiry: {
          transactionStatus: interpretedInquiry.transactionStatus || null,
          amount: interpretedInquiry.amount ?? null,
          remainingAmount: interpretedInquiry.remainingAmount ?? null,
        },
      });
    }

    if (interpretedInquiry.amount !== orderAmount) {
      return res.status(409).json({
        ok: false,
        code: "KCP_INQUIRY_AMOUNT_MISMATCH",
        message: "KCP에서 조회된 결제금액이 DB의 주문금액과 일치하지 않습니다.",
      });
    }

    if (
      !isSafeKcpReconciliationTransition(
        snapshot.payment.status,
        interpretedInquiry.paymentStatus
      )
    ) {
      return res.status(409).json({
        ok: false,
        code: "KCP_RECONCILIATION_TRANSITION_BLOCKED",
        message: "결제상태를 이전 단계로 되돌리는 동기화는 자동 처리하지 않습니다.",
        currentPaymentStatus: snapshot.payment.status,
        kcpPaymentStatus: interpretedInquiry.paymentStatus,
      });
    }

    let client = null;

    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const lockedSnapshot = await getKcpReconciliationSnapshot(client, orderId, {
        lock: true,
      });
      const lockedPaymentKey =
        normalizeText(lockedSnapshot.payment?.provider_payment_id) ||
        normalizeText(lockedSnapshot.payment?.payment_key);
      const lockedOrderAmount = normalizeAmount(lockedSnapshot.order?.amount);
      const lockedPaymentAmount = normalizeAmount(lockedSnapshot.payment?.total_amount);
      const lockedPayType = normalizeKcpInquiryPayType(
        lockedSnapshot.payment?.payment_type,
        lockedSnapshot.payment?.method,
        lockedSnapshot.order?.payment_method
      );

      if (
        !lockedSnapshot.order ||
        !lockedSnapshot.payment ||
        lockedSnapshot.order.payment_provider !== paymentProviders.KCP ||
        lockedPaymentKey !== paymentKey ||
        lockedOrderAmount !== orderAmount ||
        (lockedPaymentAmount !== null && lockedPaymentAmount !== orderAmount) ||
        lockedPayType !== payType
      ) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          code: "KCP_PAYMENT_CHANGED_DURING_RECONCILIATION",
          message: "후검증 중 결제정보가 변경되어 동기화를 중단했습니다.",
        });
      }

      if (
        !isSafeKcpReconciliationTransition(
          lockedSnapshot.payment.status,
          interpretedInquiry.paymentStatus
        )
      ) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          code: "KCP_RECONCILIATION_TRANSITION_BLOCKED",
          message: "후검증 중 결제상태가 변경되어 동기화를 중단했습니다.",
        });
      }

      const nextPaymentStatus = interpretedInquiry.paymentStatus;
      const nextOrderStatus = mapPaymentStatusToOrderStatus(nextPaymentStatus);
      const inquiryPayloadJson = JSON.stringify(inquiryPayload);
      const paymentUpdateResult = await client.query(
        `
          UPDATE payments
          SET
            provider_payment_id = COALESCE(provider_payment_id, $2),
            status = $3,
            raw_response_json = jsonb_set(
              CASE
                WHEN raw_response_json IS NULL THEN '{}'::jsonb
                WHEN jsonb_typeof(raw_response_json) = 'object' THEN raw_response_json
                ELSE jsonb_build_object('previous', raw_response_json)
              END,
              '{latestInquiry}',
              $4::jsonb,
              true
            ),
            updated_at = NOW()
          WHERE order_id = $1
            AND payment_key = $2
            AND payment_provider = 'kcp'
        `,
        [orderId, paymentKey, nextPaymentStatus, inquiryPayloadJson]
      );

      if (paymentUpdateResult.rowCount !== 1 || !nextOrderStatus) {
        throw new Error("KCP payment reconciliation target mismatch");
      }

      await client.query(
        `
          UPDATE orders
          SET status = $2, updated_at = NOW()
          WHERE order_id = $1
        `,
        [orderId, nextOrderStatus]
      );

      const applicationUpdateResult = await client.query(
        `
          UPDATE applications
          SET
            status = CASE
              WHEN $2 = 'CANCELED' THEN 'REFUNDED'
              WHEN $2 = 'PARTIAL_CANCELED' THEN 'PARTIAL_REFUNDED'
              ELSE status
            END,
            payment_status = $2,
            updated_at = NOW()
          WHERE order_id = $1
        `,
        [orderId, nextPaymentStatus]
      );

      let stageServiceCount = 0;
      const stageServiceTableResult = await client.query(
        "SELECT to_regclass('public.stage_service_orders') AS table_name"
      );

      if (stageServiceTableResult.rows[0]?.table_name) {
        const stageServiceUpdateResult = await client.query(
          `
            UPDATE stage_service_orders
            SET payment_status = $2, updated_at = NOW()
            WHERE order_id = $1
          `,
          [orderId, nextPaymentStatus]
        );
        stageServiceCount = stageServiceUpdateResult.rowCount;
      }

      let spectatorCount = 0;
      const spectatorTableResult = await client.query(
        "SELECT to_regclass('public.spectator_orders') AS table_name"
      );

      if (spectatorTableResult.rows[0]?.table_name) {
        const spectatorUpdateResult = await client.query(
          `
            UPDATE spectator_orders
            SET
              payment_status = $2,
              admission_status = CASE
                WHEN $2 = 'CANCELED' THEN 'REFUNDED'
                WHEN $2 = 'PARTIAL_CANCELED' THEN 'PARTIAL_REFUNDED'
                ELSE admission_status
              END,
              updated_at = NOW()
            WHERE order_id = $1
          `,
          [orderId, nextPaymentStatus]
        );
        spectatorCount = spectatorUpdateResult.rowCount;
      }

      let refundRequestSynced = false;

      if (
        nextPaymentStatus !== "DONE" &&
        interpretedInquiry.remainingAmount !== null
      ) {
        const refundRequestTableResult = await client.query(
          "SELECT to_regclass('public.application_refund_requests') AS table_name"
        );

        if (refundRequestTableResult.rows[0]?.table_name) {
          const refundRequestUpdateResult = await client.query(
            `
              WITH target_request AS (
                SELECT id
                FROM application_refund_requests
                WHERE order_id = $1
                  AND request_status IN ('PROCESSING', 'FAILED', 'SYNC_FAILED')
                  AND original_amount = $2
                  AND original_amount - refund_amount = $3
                ORDER BY created_at DESC
                LIMIT 1
                FOR UPDATE
              )
              UPDATE application_refund_requests AS requests
              SET
                request_status = 'COMPLETED',
                provider_status_code = $4,
                provider_error_code = NULL,
                provider_error_message = NULL,
                provider_response_json = $5::jsonb,
                processed_at = NOW(),
                updated_at = NOW()
              FROM target_request
              WHERE requests.id = target_request.id
            `,
            [
              orderId,
              orderAmount,
              interpretedInquiry.remainingAmount,
              inquiryResponse.httpStatus,
              inquiryPayloadJson,
            ]
          );
          refundRequestSynced = refundRequestUpdateResult.rowCount > 0;
        }

        if (!refundRequestSynced && spectatorCount > 0) {
          const spectatorRefundTableResult = await client.query(
            "SELECT to_regclass('public.spectator_refund_requests') AS table_name"
          );
          if (spectatorRefundTableResult.rows[0]?.table_name) {
            const spectatorRefundUpdateResult = await client.query(
              `
                WITH target_request AS (
                  SELECT id
                  FROM spectator_refund_requests
                  WHERE order_id = $1
                    AND request_status IN ('PROCESSING', 'FAILED', 'SYNC_FAILED')
                    AND original_amount = $2
                    AND original_amount - refund_amount = $3
                  ORDER BY created_at DESC
                  LIMIT 1
                  FOR UPDATE
                )
                UPDATE spectator_refund_requests AS requests
                SET
                  request_status = 'COMPLETED',
                  provider_status_code = $4,
                  provider_error_code = NULL,
                  provider_error_message = NULL,
                  provider_response_json = $5::jsonb,
                  processed_at = NOW(),
                  updated_at = NOW()
                FROM target_request
                WHERE requests.id = target_request.id
              `,
              [
                orderId,
                orderAmount,
                interpretedInquiry.remainingAmount,
                inquiryResponse.httpStatus,
                inquiryPayloadJson,
              ]
            );
            refundRequestSynced = spectatorRefundUpdateResult.rowCount > 0;
          }
        }
      }

      await client.query("COMMIT");

      await writeAdminAuditLog({
        adminUserId: req.adminUser.id,
        action: "ADMIN_RECONCILE_KCP_PAYMENT",
        targetType: "payment",
        targetId: orderId,
        ipAddress: getRequestIp(req),
        userAgent: getRequestUserAgent(req),
        metadata: {
          paymentKey,
          payType,
          previousPaymentStatus: lockedSnapshot.payment.status,
          nextPaymentStatus,
          transactionStatus: interpretedInquiry.transactionStatus,
          amount: interpretedInquiry.amount,
          remainingAmount: interpretedInquiry.remainingAmount,
          applicationCount: applicationUpdateResult.rowCount,
          stageServiceCount,
          spectatorCount,
          refundRequestSynced,
        },
      });

      return res.status(200).json({
        ok: true,
        reconciliation: {
          orderId,
          paymentKey,
          payType,
          previousPaymentStatus: lockedSnapshot.payment.status,
          paymentStatus: nextPaymentStatus,
          orderStatus: nextOrderStatus,
          transactionStatus: interpretedInquiry.transactionStatus,
          amount: interpretedInquiry.amount,
          remainingAmount: interpretedInquiry.remainingAmount,
          canceledAt: interpretedInquiry.canceledAt,
          applicationCount: applicationUpdateResult.rowCount,
          stageServiceCount,
          spectatorCount,
          refundRequestSynced,
        },
      });
    } catch (error) {
      if (client) {
        await client.query("ROLLBACK").catch(() => {});
      }
      console.error("Failed to reconcile KCP payment:", error);
      return res.status(500).json({
        ok: false,
        message: "KCP 결제 후검증 결과를 DB에 반영하지 못했습니다.",
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

app.post("/admin/refunds/:refundRequestId/retry-sync", requireAdminAuth, async function (req, res) {
  if (!hasTrustedAdminOrigin(req)) {
    return res.status(403).json({
      ok: false,
      message: "Untrusted admin origin",
    });
  }

  const refundRequestId = Number(req.params.refundRequestId);

  if (!Number.isInteger(refundRequestId) || refundRequestId <= 0) {
    return res.status(400).json({
      ok: false,
      message: "Invalid refund request id",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const refundRequestResult = await client.query(
      `
        SELECT *
        FROM application_refund_requests
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [refundRequestId]
    );

    if (refundRequestResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        message: "Refund request not found",
      });
    }

    const refundRequest = refundRequestResult.rows[0];

    if (refundRequest.request_status === "COMPLETED") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: "REFUND_REQUEST_ALREADY_COMPLETED",
        message: "이미 완료된 환불 요청입니다.",
      });
    }

    if (refundRequest.request_status !== "SYNC_FAILED") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: "REFUND_REQUEST_NOT_RETRYABLE",
        message: "현재 상태에서는 재동기화를 실행할 수 없습니다.",
      });
    }

    let providerResponse = refundRequest.provider_response_json;

    if (typeof providerResponse === "string") {
      try {
        providerResponse = JSON.parse(providerResponse);
      } catch (_error) {
        providerResponse = null;
      }
    }

    if (!providerResponse || typeof providerResponse !== "object") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: "REFUND_PROVIDER_RESPONSE_MISSING",
        message: "결제사 환불 응답 원본이 없어 재동기화를 진행할 수 없습니다.",
      });
    }

    const nextPaymentStatus = providerResponse.status || "CANCELED";
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
          raw_response_json = CASE
            WHEN payment_provider = 'kcp' AND $8::jsonb IS NOT NULL THEN jsonb_build_object(
              'approval', raw_response_json,
              'cancellations', jsonb_build_array($8::jsonb)
            )
            ELSE COALESCE($8::jsonb, raw_response_json)
          END,
          updated_at = NOW()
        WHERE payment_key = $1
           OR order_id = $2
      `,
      [
        refundRequest.payment_key,
        refundRequest.order_id,
        providerResponse.method || null,
        providerResponse.type || null,
        nextPaymentStatus,
        providerResponse.approvedAt || null,
        providerResponse.totalAmount ?? refundRequest.original_amount ?? null,
        JSON.stringify(providerResponse),
      ]
    );

    await client.query(
      `
        UPDATE orders
        SET status = $2, updated_at = NOW()
        WHERE order_id = $1
      `,
      [refundRequest.order_id, mapPaymentStatusToOrderStatus(nextPaymentStatus) || "CANCELED"]
    );

    const applicationResult = await client.query(
      `
        UPDATE applications
        SET
          status = $2,
          payment_status = $3,
          updated_at = NOW()
        WHERE application_number = $1
        RETURNING *
      `,
      [refundRequest.application_number, nextApplicationStatus, nextPaymentStatus]
    );

    if (applicationResult.rowCount === 0) {
      throw new Error("Application not found for refund sync");
    }

    const completedRequestResult = await client.query(
      `
        UPDATE application_refund_requests
        SET
          request_status = 'COMPLETED',
          processed_at = COALESCE(processed_at, NOW()),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [refundRequestId]
    );

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_RETRY_REFUND_SYNC",
      targetType: "application_refund_request",
      targetId: String(refundRequestId),
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: {
        applicationNumber: refundRequest.application_number,
        nextPaymentStatus,
        nextApplicationStatus,
      },
    });

    await client.query("COMMIT");

    void sendRefundCompletedSms({
      eventKey: `application-refund:${refundRequestId}`,
      name: applicationResult.rows[0].name,
      phone: applicationResult.rows[0].phone,
      targetTitle: applicationResult.rows[0].discipline || "대회 신청",
      refundAmount: refundRequest.refund_amount,
    });

    return res.status(200).json({
      ok: true,
      refundRequest: mapRefundRequestRow(completedRequestResult.rows[0]),
      application:
        applicationResult.rowCount > 0 ? mapApplicationRow(applicationResult.rows[0]) : null,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Failed to retry refund sync:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to retry refund sync",
    });
  } finally {
    client.release();
  }
});

app.post("/admin/stage-service-refunds/:refundRequestId/retry-sync", requireAdminAuth, async function (req, res) {
  if (!hasTrustedAdminOrigin(req)) {
    return res.status(403).json({ ok: false, message: "Untrusted admin origin" });
  }

  const refundRequestId = Number(req.params.refundRequestId);
  if (!Number.isInteger(refundRequestId) || refundRequestId <= 0) {
    return res.status(400).json({ ok: false, message: "Invalid refund request id" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const refundRequestResult = await client.query(
      `SELECT * FROM stage_service_refund_requests WHERE id = $1 LIMIT 1 FOR UPDATE`,
      [refundRequestId]
    );

    if (refundRequestResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "Stage service refund request not found" });
    }

    const refundRequest = refundRequestResult.rows[0];
    if (refundRequest.request_status === "COMPLETED") {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, code: "REFUND_REQUEST_ALREADY_COMPLETED", message: "이미 완료된 환불 요청입니다." });
    }
    if (refundRequest.request_status !== "SYNC_FAILED") {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, code: "REFUND_REQUEST_NOT_RETRYABLE", message: "현재 상태에서는 재동기화를 실행할 수 없습니다." });
    }

    let providerResponse = refundRequest.provider_response_json;
    if (typeof providerResponse === "string") {
      try {
        providerResponse = JSON.parse(providerResponse);
      } catch (_error) {
        providerResponse = null;
      }
    }
    if (!providerResponse || typeof providerResponse !== "object") {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, code: "REFUND_PROVIDER_RESPONSE_MISSING", message: "결제사 환불 응답 원본이 없어 재동기화를 진행할 수 없습니다." });
    }

    const nextPaymentStatus = providerResponse.status || "CANCELED";
    await client.query(
      `
        UPDATE payments
        SET
          method = COALESCE($3, method),
          payment_type = COALESCE($4, payment_type),
          status = $5,
          approved_at = COALESCE($6, approved_at),
          total_amount = COALESCE($7, total_amount),
          raw_response_json = CASE
            WHEN payment_provider = 'kcp' THEN jsonb_build_object(
              'approval', raw_response_json,
              'cancellations', jsonb_build_array($8::jsonb)
            )
            ELSE COALESCE($8::jsonb, raw_response_json)
          END,
          updated_at = NOW()
        WHERE payment_key = $1 OR order_id = $2
      `,
      [
        refundRequest.payment_key,
        refundRequest.order_id,
        providerResponse.method || null,
        providerResponse.type || null,
        nextPaymentStatus,
        providerResponse.approvedAt || null,
        providerResponse.totalAmount ?? refundRequest.original_amount ?? null,
        JSON.stringify(providerResponse),
      ]
    );
    await client.query(
      `UPDATE orders SET status = $2, updated_at = NOW() WHERE order_id = $1`,
      [refundRequest.order_id, mapPaymentStatusToOrderStatus(nextPaymentStatus) || "CANCELED"]
    );
    const stageServiceResult = await client.query(
      `
        UPDATE stage_service_orders
        SET
          payment_status = $2,
          service_status = CASE
            WHEN $2 = 'CANCELED' THEN 'REFUNDED'
            WHEN $2 = 'PARTIAL_CANCELED' THEN 'PARTIAL_REFUNDED'
            ELSE service_status
          END,
          updated_at = NOW()
        WHERE service_order_number = $1
        RETURNING *
      `,
      [refundRequest.service_order_number, nextPaymentStatus]
    );
    if (stageServiceResult.rowCount === 0) {
      throw new Error("Stage service order not found for refund sync");
    }
    const completedRequestResult = await client.query(
      `
        UPDATE stage_service_refund_requests
        SET request_status = 'COMPLETED', processed_at = COALESCE(processed_at, NOW()), updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [refundRequestId]
    );
    await client.query("COMMIT");

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_RETRY_STAGE_SERVICE_REFUND_SYNC",
      targetType: "stage_service_refund_request",
      targetId: String(refundRequestId),
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: {
        serviceOrderNumber: refundRequest.service_order_number,
        nextPaymentStatus,
      },
    });

    void sendRefundCompletedSms({
      eventKey: `stage-service-refund:${refundRequestId}`,
      name: stageServiceResult.rows[0].name,
      phone: stageServiceResult.rows[0].phone,
      targetTitle: stageServiceDefinitions[stageServiceResult.rows[0].service_type]?.title || "무대 서비스",
      refundAmount: refundRequest.refund_amount,
    });

    return res.status(200).json({
      ok: true,
      refundRequest: mapStageServiceRefundRequestRow(completedRequestResult.rows[0]),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to retry stage service refund sync:", error);
    return res.status(500).json({ ok: false, message: "Failed to retry stage service refund sync" });
  } finally {
    client.release();
  }
});

app.post("/admin/spectator-refunds/:refundRequestId/retry-sync", requireAdminAuth, async function (req, res) {
  if (!hasTrustedAdminOrigin(req)) {
    return res.status(403).json({ ok: false, message: "Untrusted admin origin" });
  }

  const refundRequestId = Number(req.params.refundRequestId);
  if (!Number.isInteger(refundRequestId) || refundRequestId <= 0) {
    return res.status(400).json({ ok: false, message: "Invalid refund request id" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const requestResult = await client.query(
      `SELECT * FROM spectator_refund_requests WHERE id = $1 LIMIT 1 FOR UPDATE`,
      [refundRequestId]
    );
    if (requestResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "Spectator refund request not found" });
    }

    const refundRequest = requestResult.rows[0];
    if (refundRequest.request_status !== "SYNC_FAILED") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: refundRequest.request_status === "COMPLETED"
          ? "REFUND_REQUEST_ALREADY_COMPLETED"
          : "REFUND_REQUEST_NOT_RETRYABLE",
        message: refundRequest.request_status === "COMPLETED"
          ? "이미 완료된 환불 요청입니다."
          : "현재 상태에서는 재동기화를 실행할 수 없습니다.",
      });
    }

    let providerResponse = refundRequest.provider_response_json;
    if (typeof providerResponse === "string") {
      try {
        providerResponse = JSON.parse(providerResponse);
      } catch (_error) {
        providerResponse = null;
      }
    }
    if (!providerResponse || typeof providerResponse !== "object") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: "REFUND_PROVIDER_RESPONSE_MISSING",
        message: "결제사 환불 응답 원본이 없어 재동기화를 진행할 수 없습니다.",
      });
    }

    const nextPaymentStatus = providerResponse.status || "CANCELED";
    await client.query(
      `
        UPDATE payments
        SET
          method = COALESCE($3, method),
          payment_type = COALESCE($4, payment_type),
          status = $5,
          approved_at = COALESCE($6, approved_at),
          total_amount = COALESCE($7, total_amount),
          raw_response_json = CASE
            WHEN payment_provider = 'kcp' THEN jsonb_build_object(
              'approval', raw_response_json,
              'cancellations', jsonb_build_array($8::jsonb)
            )
            ELSE COALESCE($8::jsonb, raw_response_json)
          END,
          updated_at = NOW()
        WHERE payment_key = $1 OR order_id = $2
      `,
      [
        refundRequest.payment_key,
        refundRequest.order_id,
        providerResponse.method || null,
        providerResponse.type || null,
        nextPaymentStatus,
        providerResponse.approvedAt || null,
        providerResponse.totalAmount ?? refundRequest.original_amount ?? null,
        JSON.stringify(providerResponse),
      ]
    );
    await client.query(
      `UPDATE orders SET status = $2, updated_at = NOW() WHERE order_id = $1`,
      [refundRequest.order_id, mapPaymentStatusToOrderStatus(nextPaymentStatus) || "CANCELED"]
    );
    const spectatorResult = await client.query(
      `
        UPDATE spectator_orders
        SET
          payment_status = $2,
          admission_status = CASE
            WHEN $2 = 'CANCELED' THEN 'REFUNDED'
            WHEN $2 = 'PARTIAL_CANCELED' THEN 'PARTIAL_REFUNDED'
            ELSE admission_status
          END,
          updated_at = NOW()
        WHERE spectator_order_number = $1
        RETURNING *
      `,
      [refundRequest.spectator_order_number, nextPaymentStatus]
    );
    if (spectatorResult.rowCount === 0) {
      throw new Error("Spectator order not found for refund sync");
    }
    const completedResult = await client.query(
      `
        UPDATE spectator_refund_requests
        SET request_status = 'COMPLETED', processed_at = COALESCE(processed_at, NOW()), updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [refundRequestId]
    );
    await client.query("COMMIT");

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_RETRY_SPECTATOR_REFUND_SYNC",
      targetType: "spectator_refund_request",
      targetId: String(refundRequestId),
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: {
        spectatorOrderNumber: refundRequest.spectator_order_number,
        nextPaymentStatus,
      },
    });

    void sendRefundCompletedSms({
      eventKey: `spectator-refund:${refundRequestId}`,
      name: spectatorResult.rows[0].name,
      phone: spectatorResult.rows[0].phone,
      targetTitle: "참관객 입장권",
      refundAmount: refundRequest.refund_amount,
    });

    return res.status(200).json({
      ok: true,
      refundRequest: mapRefundRequestRow(completedResult.rows[0]),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to retry spectator refund sync:", error);
    return res.status(500).json({ ok: false, message: "Failed to retry spectator refund sync" });
  } finally {
    client.release();
  }
});

function mapSmsCampaignRow(row) {
  return {
    id: Number(row.id),
    messageKind: row.message_kind,
    audience: row.audience,
    content: row.content,
    messageBody: row.message_body,
    status: row.status,
    recipientCount: Number(row.recipient_count || 0),
    sentCount: Number(row.sent_count || 0),
    failedCount: Number(row.failed_count || 0),
    failureMessage: row.failure_message || "",
    createdByName: row.created_by_name || "",
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function mapSmsMarketingOptOutRow(row) {
  return {
    phone: formatPhoneNumber(row.phone),
    reason: row.reason || "",
    createdByName: row.created_by_name || "",
    createdAt: row.created_at,
  };
}

app.get("/admin/sms/campaigns", requireAdminAuth, requireSuperAdmin, async function (req, res) {
  try {
    await ensureSmsMessagingStoresReady();
    const result = await pool.query(
      `
        SELECT
          sms_campaigns.*,
          admin_users.display_name AS created_by_name
        FROM sms_campaigns
        LEFT JOIN admin_users ON admin_users.id = sms_campaigns.created_by_admin_user_id
        ORDER BY sms_campaigns.id DESC
        LIMIT 50
      `,
    );

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_VIEW_SMS_CAMPAIGNS",
      targetType: "sms_campaign",
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { count: result.rowCount },
    });

    return res.status(200).json({ ok: true, campaigns: result.rows.map(mapSmsCampaignRow) });
  } catch (error) {
    console.error("Failed to fetch SMS campaigns:", error);
    return res.status(503).json({ ok: false, message: "문자 발송 저장소를 확인하지 못했습니다." });
  }
});

app.get("/admin/sms/marketing-opt-outs", requireAdminAuth, requireSuperAdmin, async function (req, res) {
  try {
    await ensureSmsMessagingStoresReady();
    const result = await pool.query(
      `
        SELECT sms_marketing_opt_outs.*, admin_users.display_name AS created_by_name
        FROM sms_marketing_opt_outs
        LEFT JOIN admin_users ON admin_users.id = sms_marketing_opt_outs.created_by_admin_user_id
        ORDER BY sms_marketing_opt_outs.created_at DESC
        LIMIT 100
      `,
    );
    return res.status(200).json({ ok: true, optOuts: result.rows.map(mapSmsMarketingOptOutRow) });
  } catch (error) {
    console.error("Failed to fetch SMS marketing opt-outs:", error);
    return res.status(503).json({ ok: false, message: "마케팅 수신 거부 목록을 확인하지 못했습니다." });
  }
});

app.post("/admin/sms/campaigns/preview", requireAdminAuth, requireSuperAdmin, async function (req, res) {
  if (!hasTrustedAdminOrigin(req)) {
    return res.status(403).json({ ok: false, message: "Untrusted admin origin" });
  }

  try {
    await ensureSmsMessagingStoresReady();
    const messageKind = normalizeSmsCampaignKind(req.body?.messageKind);
    const audience = normalizeSmsCampaignAudience(req.body?.audience);
    const content = normalizeSmsCampaignContent(req.body?.content);

    if (!messageKind || !audience || !content) {
      return res.status(400).json({ ok: false, message: "문자 유형, 대상, 내용을 모두 입력해 주세요." });
    }

    const messageBody = buildSmsCampaignMessage({ kind: messageKind, content });
    const recipients = await getSmsCampaignRecipients({ kind: messageKind, audience });
    return res.status(200).json({
      ok: true,
      recipientCount: recipients.length,
      messageBody,
    });
  } catch (error) {
    return res.status(400).json({ ok: false, message: error.message || "문자 발송 대상을 확인하지 못했습니다." });
  }
});

app.post("/admin/sms/campaigns", requireAdminAuth, requireSuperAdmin, async function (req, res) {
  if (!hasTrustedAdminOrigin(req)) {
    return res.status(403).json({ ok: false, message: "Untrusted admin origin" });
  }

  let client = null;
  try {
    await ensureSmsMessagingStoresReady();
    assertSolapiConfigured();

    const messageKind = normalizeSmsCampaignKind(req.body?.messageKind);
    const audience = normalizeSmsCampaignAudience(req.body?.audience);
    const content = normalizeSmsCampaignContent(req.body?.content);

    if (!messageKind || !audience || !content) {
      return res.status(400).json({ ok: false, message: "문자 유형, 대상, 내용을 모두 입력해 주세요." });
    }

    const messageBody = buildSmsCampaignMessage({ kind: messageKind, content });
    const recipients = await getSmsCampaignRecipients({ kind: messageKind, audience });

    if (!recipients.length) {
      return res.status(409).json({ ok: false, message: "발송할 대상이 없습니다." });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    const campaignResult = await client.query(
      `
        INSERT INTO sms_campaigns (
          message_kind, audience, content, message_body, status, recipient_count,
          sent_count, failed_count, created_by_admin_user_id
        ) VALUES ($1, $2, $3, $4, 'QUEUED', $5, 0, 0, $6)
        RETURNING *
      `,
      [messageKind, audience, content, messageBody, recipients.length, req.adminUser.id],
    );
    const campaign = campaignResult.rows[0];
    const values = [];
    const placeholders = recipients.map((recipient, index) => {
      const offset = index * 9;
      values.push(
        campaign.id,
        messageKind,
        `campaign:${campaign.id}:${recipient.phone}`,
        recipient.name,
        recipient.phone,
        recipient.recipient_source,
        recipient.recipient_source_id,
        messageBody,
        "QUEUED",
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`;
    });
    await client.query(
      `
        INSERT INTO sms_message_logs (
          campaign_id, message_kind, event_key, recipient_name, recipient_phone,
          recipient_source, recipient_source_id, message_body, status
        ) VALUES ${placeholders.join(", ")}
        ON CONFLICT (event_key) DO NOTHING
      `,
      values,
    );
    await client.query("COMMIT");
    client.release();
    client = null;

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: messageKind === "MARKETING" ? "ADMIN_QUEUE_MARKETING_SMS" : "ADMIN_QUEUE_NOTICE_SMS",
      targetType: "sms_campaign",
      targetId: String(campaign.id),
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { audience, recipientCount: recipients.length },
    });

    void dispatchSmsCampaign(campaign.id);
    return res.status(202).json({ ok: true, campaign: mapSmsCampaignRow(campaign), recipientCount: recipients.length });
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to queue SMS campaign:", error);
    return res.status(500).json({ ok: false, message: error.message || "문자 발송을 준비하지 못했습니다." });
  } finally {
    client?.release();
  }
});

app.post("/admin/sms/campaigns/:campaignId/retry", requireAdminAuth, requireSuperAdmin, async function (req, res) {
  if (!hasTrustedAdminOrigin(req)) {
    return res.status(403).json({ ok: false, message: "Untrusted admin origin" });
  }

  const campaignId = Number(req.params.campaignId);
  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    return res.status(400).json({ ok: false, message: "Invalid SMS campaign id" });
  }

  try {
    await ensureSmsMessagingStoresReady();
    assertSolapiConfigured();
    await pool.query(
      `UPDATE sms_message_logs SET status = 'QUEUED', error_message = NULL, updated_at = NOW() WHERE campaign_id = $1 AND status = 'FAILED'`,
      [campaignId],
    );
    const campaignResult = await pool.query(
      `UPDATE sms_campaigns SET status = 'QUEUED', failure_message = NULL, completed_at = NULL, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [campaignId],
    );
    if (!campaignResult.rowCount) return res.status(404).json({ ok: false, message: "문자 발송 내역을 찾을 수 없습니다." });

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_RETRY_SMS_CAMPAIGN",
      targetType: "sms_campaign",
      targetId: String(campaignId),
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
    });
    void dispatchSmsCampaign(campaignId);
    return res.status(202).json({ ok: true, campaign: mapSmsCampaignRow(campaignResult.rows[0]) });
  } catch (error) {
    console.error("Failed to retry SMS campaign:", error);
    return res.status(500).json({ ok: false, message: error.message || "문자 재발송을 시작하지 못했습니다." });
  }
});

app.post("/admin/sms/marketing-opt-outs", requireAdminAuth, requireSuperAdmin, async function (req, res) {
  if (!hasTrustedAdminOrigin(req)) {
    return res.status(403).json({ ok: false, message: "Untrusted admin origin" });
  }

  const phone = String(req.body?.phone || "").replace(/\D/g, "");
  const reason = truncateNormalizedText(req.body?.reason, 500);
  if (!/^01[0-9]{9}$/.test(phone)) {
    return res.status(400).json({ ok: false, message: "유효한 휴대전화 번호를 입력해 주세요." });
  }

  try {
    await ensureSmsMessagingStoresReady();
    await pool.query(
      `
        INSERT INTO sms_marketing_opt_outs (phone, reason, created_by_admin_user_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (phone)
        DO UPDATE SET reason = EXCLUDED.reason, created_by_admin_user_id = EXCLUDED.created_by_admin_user_id, updated_at = NOW()
      `,
      [phone, reason || null, req.adminUser.id],
    );
    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_ADD_SMS_MARKETING_OPT_OUT",
      targetType: "sms_marketing_opt_out",
      targetId: phone,
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
    });
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error("Failed to save SMS marketing opt-out:", error);
    return res.status(500).json({ ok: false, message: "마케팅 수신 거부를 저장하지 못했습니다." });
  }
});

app.delete("/admin/sms/marketing-opt-outs/:phone", requireAdminAuth, requireSuperAdmin, async function (req, res) {
  if (!hasTrustedAdminOrigin(req)) {
    return res.status(403).json({ ok: false, message: "Untrusted admin origin" });
  }

  const phone = String(req.params.phone || "").replace(/\D/g, "");
  if (!/^01[0-9]{9}$/.test(phone)) return res.status(400).json({ ok: false, message: "Invalid phone number" });

  try {
    await ensureSmsMessagingStoresReady();
    await pool.query(`DELETE FROM sms_marketing_opt_outs WHERE phone = $1`, [phone]);
    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_REMOVE_SMS_MARKETING_OPT_OUT",
      targetType: "sms_marketing_opt_out",
      targetId: phone,
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
    });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Failed to remove SMS marketing opt-out:", error);
    return res.status(500).json({ ok: false, message: "마케팅 수신 거부를 해제하지 못했습니다." });
  }
});

app.get("/admin/audit-logs", requireAdminAuth, async function (req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const requestedPageSize = Number.parseInt(req.query.pageSize, 10) || 50;
    const exportAll = normalizeText(req.query.export) === "1";
    const pageSize = exportAll ? 5000 : Math.min(50, Math.max(1, requestedPageSize));
    const action = normalizeText(req.query.action);
    const search = normalizeText(req.query.search);
    const requestedSortKey = normalizeText(req.query.sortKey) || "createdAt";
    const sortDirection = normalizeText(req.query.sortDirection) === "asc" ? "ASC" : "DESC";
    const sortColumns = {
      action: "logs.action",
      targetType: "logs.target_type",
      targetId: "logs.target_id",
      ipAddress: "logs.ip_address",
      adminUserEmail: "users.email",
      createdAt: "logs.created_at",
    };
    const sortColumn = sortColumns[requestedSortKey] || sortColumns.createdAt;
    const clauses = ["1 = 1"];
    const values = [];

    function addFilter(clause, value) {
      values.push(value);
      clauses.push(clause.replace("?", `$${values.length}`));
    }

    if (action && action !== "all") {
      addFilter("logs.action = ?", action);
    }
    if (search) {
      addFilter(
        `(
          logs.action ILIKE ? OR logs.target_type ILIKE ? OR logs.target_id ILIKE ? OR
          logs.ip_address ILIKE ? OR logs.user_agent ILIKE ? OR
          COALESCE(users.email, '') ILIKE ? OR COALESCE(users.display_name, '') ILIKE ?
        )`,
        `%${search}%`
      );
      const parameter = `$${values.length}`;
      clauses[clauses.length - 1] = clauses[clauses.length - 1].replaceAll("?", parameter);
    }

    const whereClause = clauses.join(" AND ");
    const totalResult = await pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM admin_audit_logs AS logs
        LEFT JOIN admin_users AS users ON users.id = logs.admin_user_id
        WHERE ${whereClause}
      `,
      values
    );
    const totalCount = totalResult.rows[0]?.count || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const effectivePage = exportAll ? 1 : Math.min(page, totalPages);
    const offset = exportAll ? 0 : (effectivePage - 1) * pageSize;
    const pageValues = exportAll ? values : [...values, pageSize, offset];
    const pageLimit = exportAll
      ? "LIMIT 5000"
      : `LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
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
        WHERE ${whereClause}
        ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, logs.id DESC
        ${pageLimit}
      `,
      pageValues
    );

    await writeAdminAuditLog({
      adminUserId: req.adminUser.id,
      action: "ADMIN_VIEW_AUDIT_LOGS",
      targetType: "admin_audit_logs",
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { count: result.rowCount, page: effectivePage, pageSize, exportAll },
    });

    return res.status(200).json({
      ok: true,
      pagination: {
        page: effectivePage,
        pageSize,
        totalCount,
        totalPages,
      },
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
    if (!paymentResultTokenSecret || paymentResultTokenSecret.length < 32) {
      throw new Error("PAYMENT_RESULT_TOKEN_SECRET must contain at least 32 characters");
    }

    if (process.env.NODE_ENV === "production") {
      if (corsAllowedOrigins.length === 0) {
        throw new Error("CORS_ALLOWED_ORIGINS is required in production");
      }

      if (adminAllowedOrigins.length === 0) {
        throw new Error("ADMIN_ALLOWED_ORIGINS is required in production");
      }

      if (!publicBaseUrl || !publicApiBaseUrl) {
        throw new Error("PUBLIC_BASE_URL and PUBLIC_API_BASE_URL are required in production");
      }

      if (kcpEnabled && (kcpMode !== "production" || kcpSiteCode === "T0000")) {
        throw new Error("Production KCP mode and a production KCP site code are required");
      }

      if (allowEmailConsoleFallback) {
        throw new Error("Email console fallback must be disabled in production");
      }
    }

    await pool.query("SELECT 1");
    await ensurePaymentProviderColumnsReady();
    await ensureLookupVerificationStoreReady();
    await ensureAdminBootstrapReady();
    console.log("PostgreSQL connected");
    const server = app.listen(port, host, () =>
      console.log(`http://${host}:${port} 으로 샘플 앱이 실행되었습니다.`),
    );
    server.headersTimeout = 15_000;
    server.requestTimeout = 65_000;
    server.keepAliveTimeout = 5_000;
  } catch (error) {
    console.error("Failed to connect PostgreSQL:", error);
    process.exit(1);
  }
}

// KCP 웹훅 처리 API
app.post("/webhooks/kcp", async function (req, res) {
  const payload = req.body || {};
  const validation = validateKcpWebhookPayload(payload);

  if (!validation.ok) {
    return res.status(400).json({
      result: "9999",
      message: validation.message,
    });
  }

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

    const reconciliation = await reconcileKcpWebhookPayment({ orderId, paymentKey });

    if (!reconciliation.ok) {
      await markWebhookEventStatus(eventId, "IGNORED");
      return res.status(200).json({
        result: "0000",
      });
    }

    await markWebhookEventStatus(eventId, "VERIFIED");

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
  if (!hasTrustedWriteOrigin(req)) {
    return res.status(403).json({
      ok: false,
      code: "UNTRUSTED_REQUEST_ORIGIN",
      message: "허용되지 않은 요청 출처입니다.",
    });
  }

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
          participant_gender,
          division,
          discipline,
          image_key,
          created_at,
          updated_at
        )
        VALUES ($1, $2, 'DRAFT', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
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
          participant_gender,
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
        payload.selection.participantGender,
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

    issueDraftAccessCookie(res, {
      draftId: draftResult.rows[0].draft_id,
      draftType: "application",
      cookieName: applicationDraftCookieName,
    });

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
  const { draftId } = req.params;

  if (
    !requireRequestDraftAccess(req, res, {
      draftId,
      draftType: "application",
      cookieName: applicationDraftCookieName,
    })
  ) {
    return;
  }

  const validation = validateDraftPayload(req.body);

  if (!validation.ok) {
    return res.status(400).json({
      ok: false,
      message: validation.message,
    });
  }

  const { payload } = validation;
  const consentVersion = normalizeText(req.body.consents?.version) || "v1";
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const currentDraftResult = await client.query(
      `
        SELECT order_id, status
        FROM application_drafts
        WHERE draft_id = $1
        FOR UPDATE
      `,
      [draftId]
    );

    if (currentDraftResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        message: "Draft not found",
      });
    }

    const currentDraft = currentDraftResult.rows[0];

    if (currentDraft.status === "COMPLETED") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: "DRAFT_ALREADY_COMPLETED",
        message: "이미 결제 완료된 신청은 수정할 수 없습니다.",
      });
    }

    if (currentDraft.order_id) {
      const linkedOrderState = await releaseReusableDraftOrder({
        client,
        draftTable: "application_drafts",
        draftId,
        orderId: currentDraft.order_id,
      });

      if (!linkedOrderState.reusable) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          code: "DRAFT_PAYMENT_IN_PROGRESS",
          message: "결제가 진행 중이거나 완료된 신청은 수정할 수 없습니다.",
        });
      }
    }

    const draftResult = await client.query(
      `
        UPDATE application_drafts
        SET
          order_id = NULL,
          status = 'DRAFT',
          payment_method = $2,
          name = $3,
          phone = $4,
          email = $5,
          birth_date = $6,
          organization = $7,
          instagram_id = $8,
          introduction = $9,
          weight_class = $10,
          participant_gender = $11,
          division = $12,
          discipline = $13,
          image_key = $14,
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
          participant_gender,
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
        payload.selection.participantGender,
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

app.patch("/applications/draft/:draftId/consents", async function (req, res) {
  const { draftId } = req.params;

  if (
    !requireRequestDraftAccess(req, res, {
      draftId,
      draftType: "application",
      cookieName: applicationDraftCookieName,
    })
  ) {
    return;
  }

  const consents = req.body.consents || {};

  if (consents.privacy !== true || consents.terms !== true || consents.refund !== true) {
    return res.status(400).json({
      ok: false,
      code: "REQUIRED_CONSENTS_MISSING",
      message: "개인정보 수집, 참가 유의사항, 환불 규정 필수 동의가 필요합니다.",
    });
  }

  const consentVersion = normalizeText(consents.version) || "v1";
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const draftResult = await client.query(
      `
        SELECT status
        FROM application_drafts
        WHERE draft_id = $1
        FOR UPDATE
      `,
      [draftId]
    );

    if (draftResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "Draft not found" });
    }

    if (draftResult.rows[0].status === "COMPLETED") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: "DRAFT_ALREADY_COMPLETED",
        message: "이미 결제 완료된 신청의 동의 내용은 변경할 수 없습니다.",
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

    const consentResult = await client.query(
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
        VALUES ($1, TRUE, TRUE, TRUE, $2, $3, $4, NOW())
        RETURNING *
      `,
      [draftId, consents.marketing === true, consents.photoVideo === true, consentVersion]
    );

    await client.query(
      `
        UPDATE application_drafts
        SET updated_at = NOW()
        WHERE draft_id = $1
      `,
      [draftId]
    );
    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      consents: mapConsentRow(consentResult.rows[0]),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Failed to update application consents:", error);
    return res.status(500).json({
      ok: false,
      message: "동의 사항을 저장하지 못했습니다.",
    });
  } finally {
    client.release();
  }
});

// Draft Data 확인
app.get("/applications/draft/:draftId", async function (req, res) {
  try {
    const { draftId } = req.params;

    if (
      !requireRequestDraftAccess(req, res, {
        draftId,
        draftType: "application",
        cookieName: applicationDraftCookieName,
      })
    ) {
      return;
    }

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
          participant_gender,
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
    const pricing = await getApplicationEntryFeeQuote({
      name: draft.name,
      phone: draft.phone,
      email: draft.email,
      imageKey: draft.image_key,
    });

    return res.status(200).json({
      ok: true,
      draft: mapDraftRow(draft),
      pricing,
      consents: mapConsentRow(consentResult.rows[0]),
      file: splitFiles.documentFile || null,
      documentFile: splitFiles.documentFile || null,
      documentFiles: splitFiles.documentFiles,
    });
  } catch (error) {
    console.error("Failed to fetch application draft:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch application draft",
    });
  }
});

app.post("/stage-services/eligible-applications", async function (req, res) {
  if (!hasTrustedWriteOrigin(req)) {
    return res.status(403).json({
      ok: false,
      code: "UNTRUSTED_REQUEST_ORIGIN",
      message: "허용되지 않은 요청 출처입니다.",
    });
  }

  const name = normalizeText(req.body?.name);
  const phone = normalizeText(formatPhoneNumber(req.body?.phone));
  const email = normalizeEmail(req.body?.email);

  if (!name || !hasValidEmail(email) || String(phone).replace(/\D/g, "").length !== 11) {
    return res.status(400).json({
      ok: false,
      message: "성함, 연락처, 이메일을 정확히 입력해 주세요.",
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT application_number, discipline, image_key, division, participant_gender, weight_class, submitted_at
        FROM applications
        WHERE name = $1
          AND phone = $2
          AND LOWER(email) = $3
          AND payment_status = 'DONE'
          AND admin_deleted_at IS NULL
        ORDER BY submitted_at DESC NULLS LAST, updated_at DESC
      `,
      [name, phone, email]
    );

    return res.status(200).json({
      ok: true,
      applications: result.rows.map((application) => ({
        applicationNumber: application.application_number,
        discipline: getCanonicalApplicationDisciplineTitle({
          imageKey: application.image_key,
          discipline: application.discipline,
        }),
        imageKey: application.image_key,
        division: application.division,
        participantGender: application.participant_gender,
        weightClass: application.weight_class,
        submittedAt: application.submitted_at,
      })),
    });
  } catch (error) {
    console.error("Failed to load eligible stage service applications:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to load eligible stage service applications",
    });
  }
});

app.post("/stage-services/draft", async function (req, res) {
  if (!hasTrustedWriteOrigin(req)) {
    return res.status(403).json({
      ok: false,
      code: "UNTRUSTED_REQUEST_ORIGIN",
      message: "허용되지 않은 요청 출처입니다.",
    });
  }

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

    const linkedApplications = await findEligibleCompletedApplicationsForStageService({
      client,
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      applicationNumbers: payload.linkedApplicationNumbers,
    });

    if (!linkedApplications.length) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        ok: false,
        message: "대회 신청 완료자만 무대 서비스를 구매할 수 있습니다.",
      });
    }

    payload.linkedApplications = linkedApplications.map((application) => ({
      applicationNumber: application.application_number,
      discipline: application.discipline,
      participantGender: application.participant_gender,
      weightClass: application.weight_class,
    }));
    payload.linkedApplicationNumber = payload.linkedApplications[0].applicationNumber;

    const hairApplicationValidation = validateHairMakeupLinkedApplications(payload, linkedApplications);

    if (!hairApplicationValidation.ok) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, message: hairApplicationValidation.message });
    }

    const videoApplicationValidation = await validateStageVideoAdditionalDiscipline({
      client,
      payload,
      linkedApplications,
    });

    if (!videoApplicationValidation.ok) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, message: videoApplicationValidation.message });
    }

    const linkedApplication = linkedApplications[0];

    const alreadyPurchased = await hasPurchasedStageService({
      client,
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      serviceType: payload.serviceType,
      linkedApplicationNumbers: payload.linkedApplicationNumbers,
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
          linked_applications,
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
          $1, $2, 'DRAFT', $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW()
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
          linked_applications,
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
        serializeStageServiceLinkedApplications(payload.linkedApplications),
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

    issueDraftAccessCookie(res, {
      draftId: draftResult.rows[0].draft_id,
      draftType: "stage-service",
      cookieName: stageServiceDraftCookieName,
    });

    return res.status(201).json({
      ok: true,
      draft: mapStageServiceDraftRow(draftResult.rows[0]),
      linkedApplication: {
        applicationNumber: linkedApplication.application_number,
        discipline: linkedApplication.discipline,
      },
      linkedApplications: payload.linkedApplications,
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
  const { draftId } = req.params;

  if (
    !requireRequestDraftAccess(req, res, {
      draftId,
      draftType: "stage-service",
      cookieName: stageServiceDraftCookieName,
    })
  ) {
    return;
  }

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

    const currentDraftResult = await client.query(
      `
        SELECT order_id, status
        FROM stage_service_drafts
        WHERE draft_id = $1
        FOR UPDATE
      `,
      [draftId]
    );

    if (currentDraftResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        message: "Stage service draft not found",
      });
    }

    const currentDraft = currentDraftResult.rows[0];

    if (currentDraft.status === "COMPLETED") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: "DRAFT_ALREADY_COMPLETED",
        message: "이미 결제 완료된 무대 서비스는 수정할 수 없습니다.",
      });
    }

    if (currentDraft.order_id) {
      const linkedOrderState = await releaseReusableDraftOrder({
        client,
        draftTable: "stage_service_drafts",
        draftId,
        orderId: currentDraft.order_id,
      });

      if (!linkedOrderState.reusable) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          code: "DRAFT_PAYMENT_IN_PROGRESS",
          message: "결제가 진행 중이거나 완료된 무대 서비스는 수정할 수 없습니다.",
        });
      }
    }

    const linkedApplications = await findEligibleCompletedApplicationsForStageService({
      client,
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      applicationNumbers: payload.linkedApplicationNumbers,
    });

    if (!linkedApplications.length) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        ok: false,
        message: "대회 신청 완료자만 무대 서비스를 구매할 수 있습니다.",
      });
    }

    payload.linkedApplications = linkedApplications.map((application) => ({
      applicationNumber: application.application_number,
      discipline: application.discipline,
      participantGender: application.participant_gender,
      weightClass: application.weight_class,
    }));
    payload.linkedApplicationNumber = payload.linkedApplications[0].applicationNumber;

    const hairApplicationValidation = validateHairMakeupLinkedApplications(payload, linkedApplications);

    if (!hairApplicationValidation.ok) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, message: hairApplicationValidation.message });
    }

    const videoApplicationValidation = await validateStageVideoAdditionalDiscipline({
      client,
      payload,
      linkedApplications,
    });

    if (!videoApplicationValidation.ok) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, message: videoApplicationValidation.message });
    }

    const linkedApplication = linkedApplications[0];

    const alreadyPurchased = await hasPurchasedStageService({
      client,
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      serviceType: payload.serviceType,
      linkedApplicationNumbers: payload.linkedApplicationNumbers,
    });

    if (alreadyPurchased) {
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
          linked_applications = $10::jsonb,
          photo_has_additional_discipline = $11,
          photo_additional_discipline = $12,
          video_type = $13,
          video_additional_discipline = $14,
          hair_participant_discipline = $15,
          hair_option = $16,
          hair_additional_discipline = $17,
          hair_optional_option = $18,
          total_amount = $19,
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
          linked_applications,
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
        serializeStageServiceLinkedApplications(payload.linkedApplications),
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
      linkedApplications: payload.linkedApplications,
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

    if (
      !requireRequestDraftAccess(req, res, {
        draftId,
        draftType: "stage-service",
        cookieName: stageServiceDraftCookieName,
      })
    ) {
      return;
    }

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
          linked_applications,
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
      linkedApplications: parseStageServiceLinkedApplications(draft.linked_applications, {
        applicationNumber: draft.linked_application_number,
        discipline: draft.linked_discipline,
      }),
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
  const client = await pool.connect();

  try {
    const draftId = normalizeText(req.body.draftId);
    const replacePendingOrder = normalizeBoolean(req.body.replacePendingOrder);

    if (!draftId) {
      return res.status(400).json({
        ok: false,
        message: "Missing draftId",
      });
    }

    if (
      !requireRequestDraftAccess(req, res, {
        draftId,
        draftType: "stage-service",
        cookieName: stageServiceDraftCookieName,
      })
    ) {
      return;
    }

    await client.query("BEGIN");

    const draftResult = await client.query(
      `
        SELECT
          draft_id,
          order_id,
          service_type,
          name,
          phone,
          email,
          linked_application_number,
          linked_applications,
          video_type,
          video_additional_discipline,
          hair_option,
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

    const draft = draftResult.rows[0];

    if (draft.order_id) {
      const existingOrderState = await releaseReusableDraftOrder({
        client,
        draftTable: "stage_service_drafts",
        draftId: draft.draft_id,
        orderId: draft.order_id,
        replacePendingOrder,
      });

      if (!existingOrderState.reusable) {
        const order = existingOrderState.order;
        const resultAccessToken = createPaymentResultAccessToken({
          orderId: order.order_id,
          secret: paymentResultTokenSecret,
          ttlSeconds: paymentResultAccessTtlHours * 60 * 60,
        });
        await client.query("COMMIT");
        res.setHeader("Set-Cookie", createPaymentResultAccessCookie(resultAccessToken));
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

    const draftLinkedApplications = parseStageServiceLinkedApplications(draft.linked_applications, {
      applicationNumber: draft.linked_application_number,
    });
    const linkedApplicationNumbers = draftLinkedApplications.map((application) => application.applicationNumber);
    const linkedApplications = await findEligibleCompletedApplicationsForStageService({
      client,
      name: draft.name,
      phone: draft.phone,
      email: draft.email,
      applicationNumbers: linkedApplicationNumbers,
    });

    if (linkedApplications.length !== linkedApplicationNumbers.length) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        ok: false,
        code: "LINKED_APPLICATION_NOT_ELIGIBLE",
        message: "연결한 대회 신청 내역이 취소되었거나 환불되어 무대 서비스를 결제할 수 없습니다.",
      });
    }

    const currentDraftValidation = validateStageServiceDraftPayload({
      serviceType: draft.service_type,
      paymentMethod: "payment",
      name: draft.name,
      phone: draft.phone,
      email: draft.email,
      linkedApplicationNumbers,
      videoType: draft.video_type,
      videoAdditionalDiscipline: draft.video_additional_discipline,
      hairOption: draft.hair_option,
      hairOptionalOption: draft.hair_optional_option,
    });

    if (!currentDraftValidation.ok) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: "STAGE_SERVICE_DRAFT_REVALIDATION_FAILED",
        message: "무대 서비스 신청 정보 또는 가격이 변경되었습니다. 신청 정보를 다시 확인해 주세요.",
      });
    }

    const currentPayload = currentDraftValidation.payload;
    const hairApplicationValidation = validateHairMakeupLinkedApplications(
      currentPayload,
      linkedApplications,
    );

    if (!hairApplicationValidation.ok) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: "LINKED_HAIR_OPTION_NOT_ELIGIBLE",
        message: hairApplicationValidation.message,
      });
    }

    const videoApplicationValidation = await validateStageVideoAdditionalDiscipline({
      client,
      payload: currentPayload,
      linkedApplications,
    });

    if (!videoApplicationValidation.ok) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: "LINKED_VIDEO_DISCIPLINE_NOT_ELIGIBLE",
        message: videoApplicationValidation.message,
      });
    }

    if (Number(draft.total_amount) !== Number(currentPayload.totalAmount)) {
      await client.query(
        `
          UPDATE stage_service_drafts
          SET total_amount = $2, updated_at = NOW()
          WHERE draft_id = $1
        `,
        [draft.draft_id, currentPayload.totalAmount],
      );
      draft.total_amount = currentPayload.totalAmount;
    }

    for (const applicationNumber of [...linkedApplicationNumbers].sort()) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${applicationNumber}|${draft.service_type}`,
      ]);
    }

    const completedPurchase = await hasPurchasedStageService({
      client,
      name: draft.name,
      phone: draft.phone,
      email: draft.email,
      serviceType: draft.service_type,
      linkedApplicationNumbers,
    });

    if (completedPurchase) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: "DUPLICATE_STAGE_SERVICE_PURCHASE",
        message: "선택한 신청 종목에는 이미 같은 무대 서비스 결제가 완료되었습니다.",
      });
    }

    const activeOrderResult = await client.query(
      `
        SELECT d.draft_id, d.order_id, o.status
        FROM stage_service_drafts AS d
        INNER JOIN orders AS o ON o.order_id = d.order_id
        WHERE (
            d.linked_application_number = ANY($1::text[])
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(d.linked_applications) AS linked_application
              WHERE linked_application ->> 'applicationNumber' = ANY($1::text[])
            )
          )
          AND d.service_type = $2
          AND d.draft_id <> $3
          AND (
            o.status = 'PAID'
            OR (
              o.status = 'READY'
              AND o.created_at > NOW() - ($4::int * INTERVAL '1 minute')
            )
          )
        FOR UPDATE OF d, o
      `,
      [
        linkedApplicationNumbers,
        draft.service_type,
        draft.draft_id,
        paymentOrderTtlMinutes,
      ]
    );

    if (activeOrderResult.rowCount > 0) {
      const completedOrder = activeOrderResult.rows.find((order) => order.status === "PAID");
      const pendingOrderIds = activeOrderResult.rows
        .filter((order) => order.status === "READY")
        .map((order) => order.order_id);

      if (replacePendingOrder && !completedOrder && pendingOrderIds.length > 0) {
        await client.query(
          `
            UPDATE orders
            SET status = 'CANCELED', updated_at = NOW()
            WHERE order_id = ANY($1::text[])
              AND status = 'READY'
          `,
          [pendingOrderIds]
        );
        await client.query(
          `
            UPDATE stage_service_drafts
            SET order_id = NULL, status = 'DRAFT', updated_at = NOW()
            WHERE order_id = ANY($1::text[])
          `,
          [pendingOrderIds]
        );
      } else {
        await client.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          code: completedOrder
            ? "STAGE_SERVICE_PAYMENT_FINALIZING"
            : "STAGE_SERVICE_PAYMENT_IN_PROGRESS",
          message: completedOrder
            ? "같은 무대 서비스 결제를 저장하고 있습니다. 잠시 후 신청 조회에서 확인해 주세요."
            : `같은 무대 서비스의 결제가 이미 진행 중입니다. ${paymentOrderTtlMinutes}분 후 다시 시도해 주세요.`,
        });
      }
    }

    const orderId = generateOrderId();
    const orderName = `${stageServiceDefinitions[draft.service_type]?.title || "무대 서비스"} 결제`;
    const resultAccessToken = createPaymentResultAccessToken({
      orderId,
      secret: paymentResultTokenSecret,
      ttlSeconds: paymentResultAccessTtlHours * 60 * 60,
    });
    const providerResolution = resolvePaymentProvider({
      requestedProvider: paymentProviders.KCP,
      amount: Number(draft.total_amount),
    });

    if (!providerResolution.ok) {
      await client.query("ROLLBACK");
      return res.status(providerResolution.status).json({
        ok: false,
        message: providerResolution.message,
      });
    }

    const result = await client.query(
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

    await client.query(
      `
        UPDATE stage_service_drafts
        SET
          order_id = $2,
          updated_at = NOW()
        WHERE draft_id = $1
      `,
      [draftId, orderId]
    );
    await client.query("COMMIT");

    const order = result.rows[0];
    res.setHeader("Set-Cookie", createPaymentResultAccessCookie(resultAccessToken));
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
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to create stage service order:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to create stage service order",
    });
  } finally {
    client.release();
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
          linked_applications,
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
        LIMIT 1
      `,
      [draftId]
    );

    if (existingServiceOrderResult.rowCount > 0) {
      const accessValidation = validateOrderPaymentResultAccess(
        req,
        existingServiceOrderResult.rows[0]
      );

      if (!accessValidation.ok) {
        await client.query("ROLLBACK");
        return res.status(403).json(accessValidation);
      }

      if (existingServiceOrderResult.rows[0].order_id !== orderId) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          code: "DRAFT_ORDER_MISMATCH",
          message: "이미 완료된 무대 서비스의 주문번호와 일치하지 않습니다.",
        });
      }

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
          linked_applications,
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

    const orderResult = await client.query(
      `
        SELECT
          order_id,
          amount,
          status,
          payment_provider,
          payment_method,
          customer_name,
          customer_email
        FROM orders
        WHERE order_id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [orderId]
    );

    if (orderResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        message: "Order not found",
      });
    }

    const accessValidation = validateOrderPaymentResultAccess(req, orderResult.rows[0]);

    if (!accessValidation.ok) {
      await client.query("ROLLBACK");
      return res.status(403).json(accessValidation);
    }

    const paymentResult = await client.query(
      `
        SELECT
          order_id,
          payment_key,
          provider_payment_id,
          payment_provider,
          status,
          total_amount
        FROM payments
        WHERE order_id = $1
        ORDER BY updated_at DESC
        LIMIT 1
        FOR UPDATE
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
    const order = orderResult.rows[0];
    const payment = paymentResult.rows[0];
    const bindingValidation = validateCompletionPaymentBinding({
      draft,
      order,
      payment,
      expectedAmount: draft.total_amount,
    });

    if (!bindingValidation.ok) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: bindingValidation.code,
        message: bindingValidation.message,
      });
    }

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
          linked_applications,
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
          $1, $2, $3, $4, $5, 'PURCHASED', $6, $7, $8, $9, $10, $11, $12::jsonb, $13,
          $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW()
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
          linked_applications,
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
        serializeStageServiceLinkedApplications(
          parseStageServiceLinkedApplications(draft.linked_applications, {
            applicationNumber: draft.linked_application_number,
            discipline: draft.linked_discipline,
          }),
        ),
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
          linked_applications,
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

    const accessValidation = validateOrderPaymentResultAccess(req, result.rows[0]);

    if (!accessValidation.ok) {
      return res.status(403).json(accessValidation);
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
          linked_applications,
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

    const accessValidation = validateOrderPaymentResultAccess(req, result.rows[0]);

    if (!accessValidation.ok) {
      return res.status(403).json(accessValidation);
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
        SELECT
          service_order_number,
          order_id,
          service_type,
          linked_application_number,
          linked_discipline,
          linked_applications,
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
        WHERE name = $1
          AND phone = $2
          AND LOWER(email) = $3
          AND (
            linked_application_number = $4
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(linked_applications) AS linked_application
              WHERE linked_application ->> 'applicationNumber' = $4
            )
          )
        ORDER BY purchased_at DESC NULLS LAST, updated_at DESC
      `,
      [name, ownedApplication.phone, email, applicationNumber]
    );

    const purchasedServiceTypes = new Set(
      summaryResult.rows
        .filter((row) => row.payment_status === "DONE")
        .map((row) => row.service_type)
    );

    return res.status(200).json({
      ok: true,
      summary: {
        hasStagePhoto: purchasedServiceTypes.has("stage-photo"),
        hasStageVideo: purchasedServiceTypes.has("stage-video"),
        hasHairMakeup: purchasedServiceTypes.has("hair-makeup"),
        purchases: summaryResult.rows.map((row) =>
          mapStageServiceOrderRow({
            ...row,
            name,
            phone: ownedApplication.phone,
            email,
          })
        ),
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

app.post("/stage-services/refund/quote", async function (req, res) {
  try {
    const name = normalizeText(req.body.name);
    const email = normalizeEmail(req.body.email);
    const phone = normalizeText(formatPhoneNumber(req.body.phone));
    const verificationToken = normalizeText(req.body.verificationToken);
    const serviceOrderNumber = normalizeText(req.body.serviceOrderNumber);

    if (!name || !verificationToken || !serviceOrderNumber) {
      return res.status(400).json({ ok: false, message: "Missing stage service refund fields" });
    }

    const access = await resolveLookupVerificationAccess({ name, email, phone, verificationToken });
    if (!access.ok) return res.status(access.statusCode).json({ ok: false, message: access.message });

    const serviceOrder = await findLookupOwnedStageService({ ...access, serviceOrderNumber });
    if (!serviceOrder) {
      return res.status(404).json({ ok: false, message: "일치하는 무대 서비스 주문을 찾을 수 없습니다." });
    }

    let refundQuote = calculateRefundQuote({
      serviceStatus: serviceOrder.service_status,
      paymentStatus: serviceOrder.latest_payment_status || serviceOrder.payment_status,
      amount: serviceOrder.total_amount ?? serviceOrder.service_amount ?? serviceOrder.order_amount,
      paymentCompletedAt: serviceOrder.approved_at || serviceOrder.payment_created_at,
      paymentMethod: serviceOrder.latest_payment_method,
      requestedAt: new Date(),
    });
    refundQuote = applyRepeatRefundReview(
      refundQuote,
      await getRepeatRefundReview({
        name: access.name,
        email: serviceOrder.email,
        scope: refundRepeatReviewScope.APPLICATION_STAGE_SERVICE,
      })
    );

    return res.status(200).json({
      ok: true,
      serviceOrder: mapStageServiceOrderRow({
        ...serviceOrder,
        total_amount: serviceOrder.service_amount,
      }),
      refundQuote,
    });
  } catch (error) {
    console.error("Failed to calculate stage service refund quote:", error);
    return res.status(500).json({ ok: false, message: "Failed to calculate stage service refund quote" });
  }
});

app.post("/stage-services/refund/request", async function (req, res) {
  let client = null;
  let refundRequestId = null;
  let providerCancelResult = null;
  let providerCancelStatusCode = null;

  try {
    await ensureLookupVerificationStoreReady();
    await purgeExpiredLookupVerifications();

    const tableResult = await pool.query("SELECT to_regclass('public.stage_service_refund_requests') AS table_name");
    if (!tableResult.rows[0]?.table_name) {
      return res.status(503).json({ ok: false, code: "STAGE_REFUND_STORE_NOT_READY", message: "무대 서비스 환불 저장소를 먼저 구성해 주세요." });
    }

    const name = normalizeText(req.body.name);
    const email = normalizeEmail(req.body.email);
    const phone = normalizeText(formatPhoneNumber(req.body.phone));
    const verificationToken = normalizeText(req.body.verificationToken);
    const serviceOrderNumber = normalizeText(req.body.serviceOrderNumber);
    const requestReason = normalizeText(req.body.requestReason) || "사용자 요청 자동 환불";

    if (!name || !verificationToken || !serviceOrderNumber) {
      return res.status(400).json({ ok: false, message: "Missing stage service refund fields" });
    }

    const access = await resolveLookupVerificationAccess({ name, email, phone, verificationToken });
    if (!access.ok) return res.status(access.statusCode).json({ ok: false, message: access.message });

    const serviceOrder = await findLookupOwnedStageService({ ...access, serviceOrderNumber });
    if (!serviceOrder) {
      return res.status(404).json({ ok: false, message: "일치하는 무대 서비스 주문을 찾을 수 없습니다." });
    }

    const originalAmount = Number(serviceOrder.total_amount ?? serviceOrder.service_amount ?? serviceOrder.order_amount);
    let refundQuote = calculateRefundQuote({
      serviceStatus: serviceOrder.service_status,
      paymentStatus: serviceOrder.latest_payment_status || serviceOrder.payment_status,
      amount: originalAmount,
      paymentCompletedAt: serviceOrder.approved_at || serviceOrder.payment_created_at,
      paymentMethod: serviceOrder.latest_payment_method,
      requestedAt: new Date(),
    });
    refundQuote = applyRepeatRefundReview(
      refundQuote,
      await getRepeatRefundReview({
        name: access.name,
        email: serviceOrder.email,
        scope: refundRepeatReviewScope.APPLICATION_STAGE_SERVICE,
      })
    );

    if (!refundQuote.canAutoRefund || !refundQuote.isRefundable || refundQuote.requiresManualReview) {
      return res.status(409).json({ ok: false, code: refundQuote.reasonCode, message: refundQuote.message, refundQuote });
    }
    if (!serviceOrder.payment_key || (serviceOrder.latest_payment_provider || serviceOrder.order_payment_provider) !== paymentProviders.KCP) {
      return res.status(409).json({ ok: false, code: "PAYMENT_PROVIDER_MISMATCH", message: "KCP 결제 건만 환불할 수 있습니다." });
    }
    try { assertKcpConfigured(); } catch (error) {
      return res.status(error.statusCode || 503).json({ ok: false, code: "KCP_NOT_CONFIGURED", message: error.message });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    const activeResult = await client.query(
      `SELECT * FROM stage_service_refund_requests WHERE service_order_number = $1 AND request_status IN ('REQUESTED', 'PROCESSING', 'COMPLETED', 'SYNC_FAILED') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [serviceOrderNumber]
    );
    if (activeResult.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, code: "REFUND_ALREADY_REQUESTED", message: "이미 환불 요청이 접수되었거나 처리된 무대 서비스입니다.", refundRequest: mapStageServiceRefundRequestRow(activeResult.rows[0]) });
    }
    const insertResult = await client.query(
      `
        INSERT INTO stage_service_refund_requests (
          service_order_number, order_id, payment_key, request_reason, request_status,
          refund_percent, refund_amount, original_amount, policy_version, policy_rule_id,
          policy_rule_label, policy_snapshot_json, requested_by_name, requested_by_email,
          provider_idempotency_key
        ) VALUES ($1, $2, $3, $4, 'PROCESSING', $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14)
        RETURNING *
      `,
      [serviceOrderNumber, serviceOrder.order_id, serviceOrder.payment_key, requestReason, refundQuote.refundPercent, refundQuote.refundAmount, originalAmount, refundQuote.policyVersion, refundQuote.matchedRuleId, refundQuote.matchedRuleLabel, JSON.stringify(refundQuote), access.name, serviceOrder.email, generateRefundIdempotencyKey()]
    );
    refundRequestId = insertResult.rows[0].id;
    await client.query("COMMIT");
    client.release();
    client = null;

    const cancellation = await requestKcpCancellation({
      paymentKey: serviceOrder.payment_key,
      cancelAmount: refundQuote.refundAmount,
      remainingAmount: originalAmount,
      originalAmount,
      reason: requestReason,
    });
    providerCancelResult = cancellation.result;
    providerCancelStatusCode = cancellation.httpStatus;

    client = await pool.connect();
    await client.query("BEGIN");
    if (!cancellation.ok) {
      const failedResult = await client.query(
        `UPDATE stage_service_refund_requests SET request_status = 'FAILED', provider_status_code = $2, provider_error_code = $3, provider_error_message = $4, provider_response_json = $5::jsonb, processed_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
        [refundRequestId, cancellation.httpStatus, cancellation.errorCode, cancellation.errorMessage, JSON.stringify(cancellation.result)]
      );
      await client.query("COMMIT");
      return res.status(cancellation.httpStatus >= 400 ? cancellation.httpStatus : 502).json({ ok: false, code: cancellation.errorCode || "REFUND_REQUEST_FAILED", message: cancellation.errorMessage || "환불 처리에 실패했습니다.", refundRequest: mapStageServiceRefundRequestRow(failedResult.rows[0]) });
    }

    const nextPaymentStatus = cancellation.result.status || "CANCELED";
    await client.query(
      `
        UPDATE payments
        SET
          method = COALESCE($3, method),
          payment_type = COALESCE($4, payment_type),
          status = $5,
          approved_at = COALESCE($6, approved_at),
          total_amount = COALESCE($7, total_amount),
          raw_response_json = jsonb_build_object(
            'approval', raw_response_json,
            'cancellations', jsonb_build_array($8::jsonb)
          ),
          updated_at = NOW()
        WHERE payment_key = $1 OR order_id = $2
      `,
      [
        serviceOrder.payment_key,
        serviceOrder.order_id,
        cancellation.result.method || null,
        cancellation.result.type || null,
        nextPaymentStatus,
        cancellation.result.approvedAt || null,
        cancellation.result.totalAmount ?? originalAmount,
        JSON.stringify(cancellation.result),
      ]
    );
    await client.query(`UPDATE orders SET status = $2, updated_at = NOW() WHERE order_id = $1`, [serviceOrder.order_id, mapPaymentStatusToOrderStatus(nextPaymentStatus) || "CANCELED"]);
    await client.query(
      `
        UPDATE stage_service_orders
        SET
          payment_status = $2,
          service_status = CASE
            WHEN $2 = 'CANCELED' THEN 'REFUNDED'
            WHEN $2 = 'PARTIAL_CANCELED' THEN 'PARTIAL_REFUNDED'
            ELSE service_status
          END,
          updated_at = NOW()
        WHERE service_order_number = $1
      `,
      [serviceOrderNumber, nextPaymentStatus]
    );
    const completedResult = await client.query(
      `UPDATE stage_service_refund_requests SET request_status = 'COMPLETED', provider_status_code = $2, provider_response_json = $3::jsonb, processed_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
      [refundRequestId, cancellation.httpStatus, JSON.stringify(cancellation.result)]
    );
    await consumeCompletedRefundLookupAccess(client, access);
    await client.query("COMMIT");

    void sendRefundCompletedSms({
      eventKey: `stage-service-refund:${refundRequestId}`,
      name: serviceOrder.name,
      phone: serviceOrder.phone,
      targetTitle: stageServiceDefinitions[serviceOrder.service_type]?.title || "무대 서비스",
      refundAmount: refundQuote.refundAmount,
    });

    return res.status(200).json({ ok: true, refundRequest: mapStageServiceRefundRequestRow(completedResult.rows[0]), refundQuote });
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => undefined);
    if (refundRequestId) {
      await pool
        .query(
          `
            UPDATE stage_service_refund_requests
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
            error.message || "Failed to process stage service refund",
            Boolean(providerCancelResult),
            providerCancelStatusCode,
            providerCancelResult ? JSON.stringify(providerCancelResult) : null,
          ]
        )
        .catch(() => undefined);
    }
    console.error("Failed to process stage service refund:", error);
    if (error.code === "42P01") {
      return res.status(500).json({ ok: false, message: "Refund request table is not ready. Apply the SQL migration first." });
    }
    if (error.code === "23505") {
      return res.status(409).json({ ok: false, code: "REFUND_ALREADY_REQUESTED", message: "이미 환불 요청이 접수되었거나 처리된 무대 서비스입니다." });
    }
    return res.status(500).json({ ok: false, message: "Failed to process stage service refund" });
  } finally {
    client?.release();
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

    if (
      !requireRequestDraftAccess(req, res, {
        draftId,
        draftType: "application",
        cookieName: applicationDraftCookieName,
      })
    ) {
      return;
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

    const documentCountResult = await pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM application_files
        WHERE draft_id = $1
          AND lower(original_filename) NOT LIKE '%.mp3'
      `,
      [draftResult.rows[0].id]
    );

    if (documentCountResult.rows[0].count >= maxDocumentUploadFiles) {
      return res.status(400).json({
        ok: false,
        message: `A maximum of ${maxDocumentUploadFiles} document files can be uploaded`,
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
          applications.instagram_id,
          applications.introduction,
          applications.weight_class,
          applications.participant_gender,
          applications.division,
          applications.discipline,
          applications.image_key,
          applications.submitted_at,
          applications.updated_at,
          orders.amount AS payment_amount,
          latest_payment.approved_at,
          latest_payment.created_at AS payment_created_at
        FROM applications
        LEFT JOIN orders
          ON orders.order_id = applications.order_id
        LEFT JOIN LATERAL (
          SELECT approved_at, created_at
          FROM payments
          WHERE payments.order_id = applications.order_id
          ORDER BY approved_at DESC NULLS LAST, created_at DESC
          LIMIT 1
        ) AS latest_payment
          ON TRUE
        WHERE applications.name = $1
          AND LOWER(applications.email) = $2
        ORDER BY applications.submitted_at DESC NULLS LAST, applications.updated_at DESC
        LIMIT 10
      `,
      [name, email]
    );

    const spectatorResult = await pool.query(
      `
        SELECT
          spectator_orders.*,
          orders.amount AS payment_amount,
          latest_payment.approved_at,
          latest_payment.created_at AS payment_created_at
        FROM spectator_orders
        LEFT JOIN orders ON orders.order_id = spectator_orders.order_id
        LEFT JOIN LATERAL (
          SELECT approved_at, created_at
          FROM payments
          WHERE payments.order_id = spectator_orders.order_id
          ORDER BY approved_at DESC NULLS LAST, created_at DESC
          LIMIT 1
        ) AS latest_payment ON TRUE
        WHERE spectator_orders.name = $1
          AND LOWER(spectator_orders.email) = $2
        ORDER BY spectator_orders.purchased_at DESC NULLS LAST, spectator_orders.updated_at DESC
        LIMIT 10
      `,
      [name, email]
    );

    if (result.rowCount === 0 && spectatorResult.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: "입력한 정보와 일치하는 신청 내역을 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      ok: true,
      application: result.rowCount ? mapApplicationRow(result.rows[0]) : null,
      applications: result.rows.map(mapApplicationRow),
      spectators: spectatorResult.rows.map((row) => ({
        ...mapSpectatorOrderRow(row, { maskPersonalInfo: false }),
        paymentAmount: Number(row.payment_amount || row.total_amount || 0),
        paymentCompletedAt: row.approved_at || row.payment_created_at || null,
      })),
    });
  } catch (error) {
    console.error("Failed to lookup application:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to lookup application",
    });
  }
});

app.post("/applications/lookup/by-phone", async function (req, res) {
  try {
    if (!hasTrustedWriteOrigin(req)) {
      return res.status(403).json({
        ok: false,
        message: "Untrusted request origin",
      });
    }

    const rateLimitResult = consumeLookupVerificationRateLimit({
      action: "phone-lookup",
      ipAddress: getRequestIp(req),
      limit: lookupNumberRateLimit,
    });

    if (!rateLimitResult.ok) {
      res.setHeader("Retry-After", String(rateLimitResult.retryAfterSeconds));
      return res.status(429).json({
        ok: false,
        message: "SMS 인증 조회 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      });
    }

    await ensureLookupPhoneVerificationStoreReady();
    await purgeExpiredLookupPhoneVerifications();

    const name = normalizeText(req.body.name);
    const phone = normalizeText(formatPhoneNumber(req.body.phone));
    const verificationToken = normalizeText(req.body.verificationToken);

    if (!name || !phone || !verificationToken) {
      return res.status(400).json({
        ok: false,
        message: "Missing name, phone, or verificationToken",
      });
    }

    if (phone.replace(/\D/g, "").length !== 11) {
      return res.status(400).json({
        ok: false,
        message: "유효한 휴대전화 번호를 입력해 주세요.",
      });
    }

    const hasVerifiedSession = await hasVerifiedLookupPhoneSession({
      name,
      phone,
      verificationToken,
    });

    if (!hasVerifiedSession) {
      return res.status(403).json({
        ok: false,
        message: "SMS 인증이 만료되었거나 유효하지 않습니다. 다시 인증해 주세요.",
      });
    }

    const applicationResult = await pool.query(
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
          applications.instagram_id,
          applications.introduction,
          applications.weight_class,
          applications.participant_gender,
          applications.division,
          applications.discipline,
          applications.image_key,
          applications.submitted_at,
          applications.updated_at,
          orders.amount AS payment_amount,
          latest_payment.approved_at,
          latest_payment.created_at AS payment_created_at
        FROM applications
        LEFT JOIN orders
          ON orders.order_id = applications.order_id
        LEFT JOIN LATERAL (
          SELECT approved_at, created_at
          FROM payments
          WHERE payments.order_id = applications.order_id
          ORDER BY approved_at DESC NULLS LAST, created_at DESC
          LIMIT 1
        ) AS latest_payment
          ON TRUE
        WHERE applications.name = $1
          AND applications.phone = $2
        ORDER BY applications.submitted_at DESC NULLS LAST, applications.updated_at DESC
        LIMIT 10
      `,
      [name, phone]
    );

    const spectatorResult = await pool.query(
      `
        SELECT
          spectator_orders.*,
          orders.amount AS payment_amount,
          latest_payment.approved_at,
          latest_payment.created_at AS payment_created_at
        FROM spectator_orders
        LEFT JOIN orders ON orders.order_id = spectator_orders.order_id
        LEFT JOIN LATERAL (
          SELECT approved_at, created_at
          FROM payments
          WHERE payments.order_id = spectator_orders.order_id
          ORDER BY approved_at DESC NULLS LAST, created_at DESC
          LIMIT 1
        ) AS latest_payment ON TRUE
        WHERE spectator_orders.name = $1
          AND spectator_orders.phone = $2
        ORDER BY spectator_orders.purchased_at DESC NULLS LAST, spectator_orders.updated_at DESC
        LIMIT 10
      `,
      [name, phone]
    );

    if (applicationResult.rowCount === 0 && spectatorResult.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: "입력한 정보와 일치하는 신청 내역을 찾을 수 없습니다.",
      });
    }

    const applications = await Promise.all(
      applicationResult.rows.map(async (row) => ({
        ...mapApplicationRow(row),
        stageServiceSummary: await getStageServiceSummaryForLookupApplication({
          name,
          phone,
          email: row.email,
          applicationNumber: row.application_number,
        }),
      }))
    );

    return res.status(200).json({
      ok: true,
      application: applications[0] || null,
      applications,
      spectators: spectatorResult.rows.map((row) => ({
        ...mapSpectatorOrderRow(row),
        paymentAmount: Number(row.payment_amount || row.total_amount || 0),
        paymentCompletedAt: row.approved_at || row.payment_created_at || null,
      })),
    });
  } catch (error) {
    console.error("Failed to lookup application by phone:", error);
    const isSchemaError =
      error?.message?.includes("phone lookup verification migration") ||
      error?.message?.includes("phone verification database schema");

    return res.status(isSchemaError ? 503 : 500).json({
      ok: false,
      message: isSchemaError
        ? "SMS 인증 조회 기능 준비가 완료되지 않았습니다. 잠시 후 다시 시도해 주세요."
        : "SMS 인증 신청 조회에 실패했습니다.",
    });
  }
});

app.post("/applications/lookup/by-number", async function (req, res) {
  try {
    if (!hasTrustedWriteOrigin(req)) {
      return res.status(403).json({
        ok: false,
        message: "Untrusted request origin",
      });
    }

    const rateLimitResult = consumeLookupVerificationRateLimit({
      action: "number-lookup",
      ipAddress: getRequestIp(req),
      limit: lookupNumberRateLimit,
    });

    if (!rateLimitResult.ok) {
      res.setHeader("Retry-After", String(rateLimitResult.retryAfterSeconds));
      return res.status(429).json({
        ok: false,
        message: "신청번호 조회 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      });
    }

    const applicationNumber = normalizeText(req.body.applicationNumber).toUpperCase();

    if (!/^(APPL|SS|SPCT)-\d{4}-[A-Z0-9-]{6,64}$/.test(applicationNumber)) {
      return res.status(400).json({
        ok: false,
        message: "유효한 신청번호를 입력해 주세요.",
      });
    }

    if (applicationNumber.startsWith("APPL-")) {
      const result = await pool.query(
        `
          SELECT
            applications.application_number,
            applications.status,
            applications.payment_status,
            applications.division,
            applications.discipline,
            applications.image_key,
            applications.weight_class,
            applications.submitted_at,
            orders.amount AS payment_amount,
            latest_payment.approved_at,
            latest_payment.created_at AS payment_created_at
          FROM applications
          LEFT JOIN orders ON orders.order_id = applications.order_id
          LEFT JOIN LATERAL (
            SELECT approved_at, created_at
            FROM payments
            WHERE payments.order_id = applications.order_id
            ORDER BY approved_at DESC NULLS LAST, created_at DESC
            LIMIT 1
          ) AS latest_payment ON TRUE
          WHERE applications.application_number = $1
            AND applications.admin_deleted_at IS NULL
          LIMIT 1
        `,
        [applicationNumber]
      );
      const row = result.rows[0];

      if (!row) {
        return res.status(404).json({ ok: false, message: "신청 내역을 찾을 수 없습니다." });
      }

      return res.status(200).json({
        ok: true,
        record: {
          type: "application",
          applicationNumber: row.application_number,
          status: row.status,
          paymentStatus: row.payment_status,
          division: row.division,
          discipline: getCanonicalApplicationDisciplineTitle({
            imageKey: row.image_key,
            discipline: row.discipline,
          }),
          weightClass: row.weight_class,
          paymentAmount: Number(row.payment_amount || 0),
          paymentCompletedAt: row.approved_at || row.payment_created_at || null,
          submittedAt: row.submitted_at,
        },
      });
    }

    if (applicationNumber.startsWith("SS-")) {
      const result = await pool.query(
        `
          SELECT
            service_order_number,
            service_type,
            linked_discipline,
            linked_applications,
            total_amount,
            payment_status,
            service_status,
            purchased_at
          FROM stage_service_orders
          WHERE service_order_number = $1
          LIMIT 1
        `,
        [applicationNumber]
      );
      const row = result.rows[0];

      if (!row) {
        return res.status(404).json({ ok: false, message: "신청 내역을 찾을 수 없습니다." });
      }

      const linkedApplications = parseStageServiceLinkedApplications(row.linked_applications, {
        discipline: row.linked_discipline,
      });

      return res.status(200).json({
        ok: true,
        record: {
          type: "stageService",
          serviceOrderNumber: row.service_order_number,
          serviceType: row.service_type,
          linkedDisciplines: linkedApplications.map((item) => item.discipline).filter(Boolean),
          totalAmount: Number(row.total_amount || 0),
          paymentStatus: row.payment_status,
          serviceStatus: row.service_status,
          purchasedAt: row.purchased_at,
        },
      });
    }

    const result = await pool.query(
      `
        SELECT
          spectator_order_number,
          quantity,
          total_amount,
          payment_status,
          admission_status,
          is_test,
          purchased_at
        FROM spectator_orders
        WHERE spectator_order_number = $1
        LIMIT 1
      `,
      [applicationNumber]
    );
    const row = result.rows[0];

    if (!row) {
      return res.status(404).json({ ok: false, message: "신청 내역을 찾을 수 없습니다." });
    }

    return res.status(200).json({
      ok: true,
      record: {
        type: "spectator",
        spectatorOrderNumber: row.spectator_order_number,
        quantity: row.quantity,
        totalAmount: Number(row.total_amount || 0),
        paymentStatus: row.payment_status,
        admissionStatus: row.admission_status,
        isTest: row.is_test === true,
        purchasedAt: row.purchased_at,
      },
    });
  } catch (error) {
    console.error("Failed to lookup application by number:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to lookup application by number",
    });
  }
});

app.post("/applications/refund/quote", async function (req, res) {
  try {
    const name = normalizeText(req.body.name);
    const email = normalizeEmail(req.body.email);
    const phone = normalizeText(formatPhoneNumber(req.body.phone));
    const verificationToken = normalizeText(req.body.verificationToken);
    const applicationNumber = normalizeText(req.body.applicationNumber);

    if (!name || !verificationToken || !applicationNumber) {
      return res.status(400).json({
        ok: false,
        message: "Missing name, email, verificationToken, or applicationNumber",
      });
    }

    const access = await resolveLookupVerificationAccess({ name, email, phone, verificationToken });
    if (!access.ok) return res.status(access.statusCode).json({ ok: false, message: access.message });

    const row = await findLookupOwnedApplication({ ...access, applicationNumber });

    if (!row) {
      return res.status(404).json({
        ok: false,
        message: "입력한 정보와 일치하는 신청 내역을 찾을 수 없습니다.",
      });
    }

    let refundQuote = calculateRefundQuote({
      applicationStatus: row.status,
      paymentStatus: row.latest_payment_status || row.payment_status,
      amount: row.total_amount ?? row.order_amount,
      paymentCompletedAt: row.approved_at || row.payment_created_at,
      paymentMethod: row.latest_payment_method,
      requestedAt: new Date(),
    });
    refundQuote = applyRepeatRefundReview(
      refundQuote,
      await getRepeatRefundReview({
        name: access.name,
        email: row.email,
        scope: refundRepeatReviewScope.APPLICATION_STAGE_SERVICE,
      })
    );

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
  let providerCancelResult = null;
  let providerCancelStatusCode = null;

  try {
    const name = normalizeText(req.body.name);
    const email = normalizeEmail(req.body.email);
    const phone = normalizeText(formatPhoneNumber(req.body.phone));
    const verificationToken = normalizeText(req.body.verificationToken);
    const applicationNumber = normalizeText(req.body.applicationNumber);
    const requestReason =
      normalizeText(req.body.requestReason) || "사용자 요청 자동 환불";

    if (!name || !verificationToken || !applicationNumber) {
      return res.status(400).json({
        ok: false,
        message: "Missing name, email, verificationToken, or applicationNumber",
      });
    }

    const access = await resolveLookupVerificationAccess({ name, email, phone, verificationToken });
    if (!access.ok) return res.status(access.statusCode).json({ ok: false, message: access.message });

    const application = await findLookupOwnedApplication({ ...access, applicationNumber });

    if (!application) {
      return res.status(404).json({
        ok: false,
        message: "입력한 정보와 일치하는 신청 내역을 찾을 수 없습니다.",
      });
    }

    let refundQuote = calculateRefundQuote({
      applicationStatus: application.status,
      paymentStatus: application.latest_payment_status || application.payment_status,
      amount: application.total_amount ?? application.order_amount,
      paymentCompletedAt: application.approved_at || application.payment_created_at,
      paymentMethod: application.latest_payment_method,
      requestedAt: new Date(),
    });
    refundQuote = applyRepeatRefundReview(
      refundQuote,
      await getRepeatRefundReview({
        name: access.name,
        email: application.email,
        scope: refundRepeatReviewScope.APPLICATION_STAGE_SERVICE,
      })
    );

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
      application.order_payment_provider;

    if (refundPaymentProvider !== paymentProviders.KCP) {
      return res.status(409).json({
        ok: false,
        code: "PAYMENT_PROVIDER_MISMATCH",
        message: "KCP 결제 건만 환불할 수 있습니다.",
      });
    }

    try {
      assertKcpConfigured();
    } catch (error) {
      return res.status(error.statusCode || 503).json({
        ok: false,
        code: "KCP_NOT_CONFIGURED",
        message: error.message,
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
        application.email,
        providerIdempotencyKey,
      ]
    );

    refundRequestId = insertResult.rows[0].id;
    await client.query("COMMIT");
    client.release();
    client = null;

    let providerResponseOk = false;
    let providerErrorCode = null;
    let providerErrorMessage = null;

    const originalAmount =
      application.total_amount ?? application.order_amount;
    const kcpCancellation = await requestKcpCancellation({
      paymentKey: application.payment_key,
      cancelAmount: refundQuote.refundAmount,
      remainingAmount: originalAmount,
      originalAmount,
      reason: requestReason,
    });

    providerResponseOk = kcpCancellation.ok;
    providerCancelResult = kcpCancellation.result;
    providerCancelStatusCode = kcpCancellation.httpStatus;
    providerErrorCode = kcpCancellation.errorCode;
    providerErrorMessage = kcpCancellation.errorMessage;

    client = await pool.connect();
    await client.query("BEGIN");

    if (!providerResponseOk) {
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
          providerCancelStatusCode,
          providerErrorCode,
          providerErrorMessage || "환불 처리에 실패했습니다.",
          JSON.stringify(providerCancelResult),
        ]
      );

      await client.query("COMMIT");

      const responseStatus =
        providerCancelStatusCode >= 400 ? providerCancelStatusCode : 502;

      return res.status(responseStatus).json({
        ok: false,
        code: providerErrorCode || "REFUND_REQUEST_FAILED",
        message: providerErrorMessage || "환불 처리에 실패했습니다.",
        refundRequest: mapRefundRequestRow(failedRequestResult.rows[0]),
      });
    }

    const nextPaymentStatus = providerCancelResult.status || "CANCELED";
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
          raw_response_json = CASE
            WHEN $9 = 'kcp' THEN jsonb_build_object(
              'approval', raw_response_json,
              'cancellations', jsonb_build_array($8::jsonb)
            )
            ELSE $8::jsonb
          END,
          updated_at = NOW()
        WHERE payment_key = $1
           OR order_id = $2
      `,
      [
        application.payment_key,
        application.order_id,
        providerCancelResult.method || null,
        providerCancelResult.type || null,
        nextPaymentStatus,
        providerCancelResult.approvedAt || null,
        providerCancelResult.totalAmount ?? application.total_amount ?? application.order_amount,
        JSON.stringify(providerCancelResult),
        refundPaymentProvider,
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
          participant_gender,
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
      [refundRequestId, providerCancelStatusCode, JSON.stringify(providerCancelResult)]
    );

    await consumeCompletedRefundLookupAccess(client, access);

    await client.query("COMMIT");

    void sendRefundCompletedSms({
      eventKey: `application-refund:${refundRequestId}`,
      name: application.name,
      phone: application.phone,
      targetTitle: application.discipline || "대회 신청",
      refundAmount: refundQuote.refundAmount,
    });

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
            Boolean(providerCancelResult),
            providerCancelStatusCode,
            providerCancelResult ? JSON.stringify(providerCancelResult) : null,
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

app.post("/spectators/refund/quote", async function (req, res) {
  try {
    const name = normalizeText(req.body.name);
    const email = normalizeEmail(req.body.email);
    const phone = normalizeText(formatPhoneNumber(req.body.phone));
    const verificationToken = normalizeText(req.body.verificationToken);
    const spectatorOrderNumber = normalizeText(req.body.spectatorOrderNumber);
    if (!name || !verificationToken || !spectatorOrderNumber) return res.status(400).json({ ok: false, message: "환불 조회 정보가 부족합니다." });
    const access = await resolveLookupVerificationAccess({ name, email, phone, verificationToken });
    if (!access.ok) return res.status(access.statusCode).json({ ok: false, message: access.message });
    const spectatorOrder = await findLookupOwnedSpectator({ ...access, spectatorOrderNumber });
    if (!spectatorOrder) return res.status(404).json({ ok: false, message: "참관객 신청을 찾을 수 없습니다." });
    let refundQuote = calculateRefundQuote({
      applicationStatus: spectatorOrder.admission_status,
      paymentStatus: spectatorOrder.latest_payment_status || spectatorOrder.payment_status,
      amount: spectatorOrder.total_amount || spectatorOrder.order_amount,
      paymentCompletedAt: spectatorOrder.approved_at || spectatorOrder.payment_created_at,
      paymentMethod: spectatorOrder.latest_payment_method,
      requestedAt: new Date(),
    });
    refundQuote = applyRepeatRefundReview(
      refundQuote,
      await getRepeatRefundReview({
        name: access.name,
        email: spectatorOrder.email,
        scope: refundRepeatReviewScope.SPECTATOR,
      })
    );
    return res.status(200).json({ ok: true, spectatorOrder: mapSpectatorOrderRow(spectatorOrder, { maskPersonalInfo: false }), refundQuote });
  } catch (error) {
    console.error("Failed to calculate spectator refund quote:", error);
    return res.status(500).json({ ok: false, message: "참관객 환불 정보를 계산하지 못했습니다." });
  }
});

app.post("/spectators/refund/request", async function (req, res) {
  let client = null;
  let refundRequestId = null;
  let providerCancelResult = null;
  let providerCancelStatusCode = null;
  try {
    const name = normalizeText(req.body.name);
    const email = normalizeEmail(req.body.email);
    const phone = normalizeText(formatPhoneNumber(req.body.phone));
    const verificationToken = normalizeText(req.body.verificationToken);
    const spectatorOrderNumber = normalizeText(req.body.spectatorOrderNumber);
    const requestReason = normalizeText(req.body.requestReason) || "사용자 요청 자동 환불";
    if (!name || !verificationToken || !spectatorOrderNumber) return res.status(400).json({ ok: false, message: "환불 요청 정보가 부족합니다." });
    const access = await resolveLookupVerificationAccess({ name, email, phone, verificationToken });
    if (!access.ok) return res.status(access.statusCode).json({ ok: false, message: access.message });
    const spectatorOrder = await findLookupOwnedSpectator({ ...access, spectatorOrderNumber });
    if (!spectatorOrder) return res.status(404).json({ ok: false, message: "참관객 신청을 찾을 수 없습니다." });
    const originalAmount = Number(spectatorOrder.total_amount || spectatorOrder.order_amount || 0);
    let refundQuote = calculateRefundQuote({
      applicationStatus: spectatorOrder.admission_status,
      paymentStatus: spectatorOrder.latest_payment_status || spectatorOrder.payment_status,
      amount: originalAmount,
      paymentCompletedAt: spectatorOrder.approved_at || spectatorOrder.payment_created_at,
      paymentMethod: spectatorOrder.latest_payment_method,
      requestedAt: new Date(),
    });
    refundQuote = applyRepeatRefundReview(
      refundQuote,
      await getRepeatRefundReview({
        name: access.name,
        email: spectatorOrder.email,
        scope: refundRepeatReviewScope.SPECTATOR,
      })
    );
    if (!refundQuote.canAutoRefund || !refundQuote.isRefundable || refundQuote.requiresManualReview) return res.status(409).json({ ok: false, code: refundQuote.reasonCode, message: refundQuote.message, refundQuote });
    if (!spectatorOrder.payment_key) return res.status(409).json({ ok: false, code: "PAYMENT_KEY_MISSING", message: "환불 처리에 필요한 결제 키가 없습니다." });
    const refundProvider = spectatorOrder.latest_payment_provider || spectatorOrder.order_payment_provider;
    if (refundProvider !== paymentProviders.KCP) return res.status(409).json({ ok: false, code: "PAYMENT_PROVIDER_MISMATCH", message: "KCP 결제 건만 환불할 수 있습니다." });
    assertKcpConfigured();

    client = await pool.connect();
    await client.query("BEGIN");
    const activeResult = await client.query(`SELECT * FROM spectator_refund_requests WHERE spectator_order_number = $1 AND request_status IN ('REQUESTED','PROCESSING','COMPLETED','SYNC_FAILED') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [spectatorOrderNumber]);
    if (activeResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, code: "REFUND_ALREADY_REQUESTED", message: "이미 환불 요청이 접수되었거나 처리되었습니다." });
    }
    const insertResult = await client.query(
      `INSERT INTO spectator_refund_requests (spectator_order_number, order_id, payment_key, request_reason, request_status, refund_percent, refund_amount, original_amount, policy_version, policy_rule_id, policy_rule_label, policy_snapshot_json, requested_by_name, requested_by_email, provider_idempotency_key) VALUES ($1,$2,$3,$4,'PROCESSING',$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14) RETURNING *`,
      [spectatorOrderNumber, spectatorOrder.order_id, spectatorOrder.payment_key, requestReason, refundQuote.refundPercent, refundQuote.refundAmount, originalAmount, refundQuote.policyVersion, refundQuote.matchedRuleId, refundQuote.matchedRuleLabel, JSON.stringify(refundQuote), access.name, spectatorOrder.email, generateRefundIdempotencyKey()]
    );
    refundRequestId = insertResult.rows[0].id;
    await client.query("COMMIT");
    client.release();
    client = null;

    const cancellation = await requestKcpCancellation({ paymentKey: spectatorOrder.payment_key, cancelAmount: refundQuote.refundAmount, remainingAmount: originalAmount, originalAmount, reason: requestReason });
    providerCancelResult = cancellation.result;
    providerCancelStatusCode = cancellation.httpStatus;
    client = await pool.connect();
    await client.query("BEGIN");
    if (!cancellation.ok) {
      await client.query(`UPDATE spectator_refund_requests SET request_status = 'FAILED', provider_status_code = $2, provider_error_code = $3, provider_error_message = $4, provider_response_json = $5::jsonb, processed_at = NOW(), updated_at = NOW() WHERE id = $1`, [refundRequestId, cancellation.httpStatus, cancellation.errorCode, cancellation.errorMessage, JSON.stringify(cancellation.result)]);
      await client.query("COMMIT");
      return res.status(cancellation.httpStatus >= 400 ? cancellation.httpStatus : 502).json({ ok: false, code: cancellation.errorCode || "REFUND_REQUEST_FAILED", message: cancellation.errorMessage || "환불 처리에 실패했습니다." });
    }
    const nextPaymentStatus = cancellation.result.status || "CANCELED";
    await client.query(`UPDATE payments SET status = $3, total_amount = COALESCE($4, total_amount), raw_response_json = jsonb_build_object('approval', raw_response_json, 'cancellations', jsonb_build_array($5::jsonb)), updated_at = NOW() WHERE payment_key = $1 OR order_id = $2`, [spectatorOrder.payment_key, spectatorOrder.order_id, nextPaymentStatus, cancellation.result.totalAmount, JSON.stringify(cancellation.result)]);
    await client.query(`UPDATE orders SET status = $2, updated_at = NOW() WHERE order_id = $1`, [spectatorOrder.order_id, mapPaymentStatusToOrderStatus(nextPaymentStatus) || "CANCELED"]);
    await client.query(`UPDATE spectator_orders SET payment_status = $2, admission_status = $3, updated_at = NOW() WHERE spectator_order_number = $1`, [spectatorOrderNumber, nextPaymentStatus, nextPaymentStatus === "PARTIAL_CANCELED" ? "PARTIAL_REFUNDED" : "REFUNDED"]);
    await client.query(`UPDATE spectator_refund_requests SET request_status = 'COMPLETED', provider_status_code = $2, provider_response_json = $3::jsonb, processed_at = NOW(), updated_at = NOW() WHERE id = $1`, [refundRequestId, providerCancelStatusCode, JSON.stringify(providerCancelResult)]);
    await consumeCompletedRefundLookupAccess(client, access);
    await client.query("COMMIT");
    void sendRefundCompletedSms({
      eventKey: `spectator-refund:${refundRequestId}`,
      name: spectatorOrder.name,
      phone: spectatorOrder.phone,
      targetTitle: "참관객 입장권",
      refundAmount: refundQuote.refundAmount,
    });
    return res.status(200).json({ ok: true, refundQuote: { ...refundQuote, canAutoRefund: false, message: "환불 요청이 정상적으로 처리되었습니다." } });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    if (refundRequestId) {
      await pool.query(`UPDATE spectator_refund_requests SET request_status = CASE WHEN request_status = 'COMPLETED' THEN request_status WHEN $3::boolean THEN 'SYNC_FAILED' ELSE 'FAILED' END, provider_status_code = COALESCE(provider_status_code, $4), provider_response_json = COALESCE(provider_response_json, $5::jsonb), provider_error_message = COALESCE(provider_error_message, $2), updated_at = NOW() WHERE id = $1`, [refundRequestId, error.message || "Failed to process spectator refund", Boolean(providerCancelResult), providerCancelStatusCode, providerCancelResult ? JSON.stringify(providerCancelResult) : null]).catch(() => undefined);
    }
    console.error("Failed to process spectator refund:", error);
    if (error.code === "23505") return res.status(409).json({ ok: false, code: "REFUND_ALREADY_REQUESTED", message: "이미 환불 요청이 접수되었거나 처리되었습니다." });
    return res.status(500).json({ ok: false, message: "참관객 환불 처리에 실패했습니다." });
  } finally {
    client?.release();
  }
});

app.post("/spectators/draft", async function (req, res) {
  if (!hasTrustedWriteOrigin(req)) {
    return res.status(403).json({ ok: false, message: "Untrusted request origin" });
  }

  const validation = validateSpectatorApplicantPayload(req.body);
  if (!validation.ok) return res.status(400).json(validation);
  if (!getSpectatorSalesStatus().isOpen) {
    return res.status(409).json({ ok: false, code: "SPECTATOR_SALES_CLOSED", message: "현재 참관객 입장권 판매 기간이 아닙니다." });
  }

  const { payload } = validation;
  const emailVerification = validateApplicationEmailVerificationToken({
    providedToken: getApplicationEmailVerificationToken(req),
    name: payload.name,
    email: payload.email,
    requiredStatus: "VERIFIED",
  });
  if (!emailVerification.ok) {
    return res.status(403).json({ ok: false, code: "EMAIL_VERIFICATION_REQUIRED", message: "이메일 인증을 완료해 주세요." });
  }

  try {
    const duplicate = await findCompletedDuplicateSpectator(payload);
    if (duplicate) {
      return res.status(409).json({ ok: false, code: "DUPLICATE_SPECTATOR_TICKET", message: "동일한 정보로 결제 완료된 참관객 입장권이 있습니다." });
    }

    const result = await pool.query(
      `
        INSERT INTO spectator_drafts (
          draft_id, status, name, phone, email, quantity, unit_amount, total_amount,
          email_verified_at, created_at, updated_at
        ) VALUES ($1, 'DRAFT', $2, $3, $4, 1, $5, $5, NOW(), NOW(), NOW())
        RETURNING *
      `,
      [generateSpectatorDraftId(), payload.name, payload.phone, payload.email, spectatorTicketAmount]
    );
    issueDraftAccessCookie(res, { draftId: result.rows[0].draft_id, draftType: "spectator", cookieName: spectatorDraftCookieName });
    return res.status(201).json({ ok: true, draft: mapSpectatorDraftRow(result.rows[0]) });
  } catch (error) {
    console.error("Failed to create spectator draft:", error);
    return res.status(500).json({ ok: false, message: "참관객 신청 정보를 저장하지 못했습니다." });
  }
});

app.patch("/spectators/draft/:draftId/consents", async function (req, res) {
  const draftId = normalizeText(req.params.draftId);
  if (!requireRequestDraftAccess(req, res, { draftId, draftType: "spectator", cookieName: spectatorDraftCookieName })) return;
  const consents = req.body.consents || {};
  if (
    consents.privacy !== true
    || consents.refund !== true
    || consents.marketing !== true
    || consents.photoVideo !== true
  ) {
    return res.status(400).json({ ok: false, code: "REQUIRED_CONSENTS_MISSING", message: "참관객 결제에 필요한 필수 동의 사항을 모두 확인해 주세요." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const draftResult = await client.query(`SELECT draft_id, status FROM spectator_drafts WHERE draft_id = $1 FOR UPDATE`, [draftId]);
    if (!draftResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "참관객 신청 초안을 찾을 수 없습니다." });
    }
    if (draftResult.rows[0].status === "COMPLETED") {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, message: "이미 결제 완료된 신청입니다." });
    }
    await client.query(`DELETE FROM spectator_consents WHERE draft_id = $1 AND spectator_order_id IS NULL`, [draftId]);
    await client.query(
      `INSERT INTO spectator_consents (draft_id, privacy_consent, refund_consent, marketing_consent, photo_video_consent, consent_version, consented_at) VALUES ($1, TRUE, TRUE, $2, $3, $4, NOW())`,
      [draftId, true, true, normalizeText(consents.version) || "spectator-v1"]
    );
    await client.query(`UPDATE spectator_drafts SET status = 'CONSENTED', updated_at = NOW() WHERE draft_id = $1`, [draftId]);
    await client.query("COMMIT");
    return res.status(200).json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to update spectator consents:", error);
    return res.status(500).json({ ok: false, message: "참관객 동의 사항을 저장하지 못했습니다." });
  } finally {
    client.release();
  }
});

app.get("/spectators/draft/:draftId", async function (req, res) {
  const draftId = normalizeText(req.params.draftId);
  if (!requireRequestDraftAccess(req, res, { draftId, draftType: "spectator", cookieName: spectatorDraftCookieName })) return;
  try {
    const result = await pool.query(`SELECT * FROM spectator_drafts WHERE draft_id = $1`, [draftId]);
    if (!result.rowCount) return res.status(404).json({ ok: false, message: "참관객 신청 초안을 찾을 수 없습니다." });
    return res.status(200).json({ ok: true, draft: mapSpectatorDraftRow(result.rows[0]) });
  } catch (error) {
    console.error("Failed to fetch spectator draft:", error);
    return res.status(500).json({ ok: false, message: "참관객 신청 정보를 불러오지 못했습니다." });
  }
});

app.post("/spectators/orders", async function (req, res) {
  const draftId = normalizeText(req.body.draftId);
  const replacePendingOrder = normalizeBoolean(req.body.replacePendingOrder);
  if (!draftId) return res.status(400).json({ ok: false, message: "Missing draftId" });
  if (!requireRequestDraftAccess(req, res, { draftId, draftType: "spectator", cookieName: spectatorDraftCookieName })) return;
  if (!getSpectatorSalesStatus().isOpen) return res.status(409).json({ ok: false, code: "SPECTATOR_SALES_CLOSED", message: "현재 참관객 입장권 판매 기간이 아닙니다." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('spectator-ticket-capacity'))");
    const draftResult = await client.query(`SELECT * FROM spectator_drafts WHERE draft_id = $1 FOR UPDATE`, [draftId]);
    if (!draftResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "참관객 신청 초안을 찾을 수 없습니다." });
    }
    const draft = draftResult.rows[0];
    const consentResult = await client.query(`SELECT id FROM spectator_consents WHERE draft_id = $1 AND privacy_consent = TRUE AND refund_consent = TRUE LIMIT 1`, [draftId]);
    if (!consentResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, code: "REQUIRED_CONSENTS_MISSING", message: "필수 동의 사항을 확인해 주세요." });
    }

    if (draft.order_id) {
      const existingOrderState = await releaseReusableDraftOrder({
        client,
        draftTable: "spectator_drafts",
        draftId,
        orderId: draft.order_id,
        replacePendingOrder,
      });
      if (!existingOrderState.reusable) {
        const order = existingOrderState.order;
        const token = createPaymentResultAccessToken({ orderId: order.order_id, secret: paymentResultTokenSecret, ttlSeconds: paymentResultAccessTtlHours * 3600 });
        await client.query("COMMIT");
        res.setHeader("Set-Cookie", createPaymentResultAccessCookie(token));
        return res.status(200).json({ ok: true, order: { orderId: order.order_id, orderName: order.order_name, amount: order.amount, status: order.status, createdAt: order.created_at } });
      }
    }

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${draft.name}|${draft.phone}|${draft.email}`]);
    const duplicate = await findCompletedDuplicateSpectator({ queryable: client, ...draft });
    if (duplicate) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, code: "DUPLICATE_SPECTATOR_TICKET", message: "동일한 정보로 결제 완료된 참관객 입장권이 있습니다." });
    }
    const activeResult = await client.query(
      `SELECT d.draft_id, d.order_id, o.status FROM spectator_drafts d JOIN orders o ON o.order_id = d.order_id WHERE d.name = $1 AND d.phone = $2 AND LOWER(d.email) = $3 AND d.draft_id <> $4 AND d.is_test = FALSE AND (o.status = 'PAID' OR (o.status = 'READY' AND o.created_at >= NOW() - ($5::text || ' minutes')::interval)) FOR UPDATE OF d, o`,
      [draft.name, draft.phone, draft.email, draftId, String(paymentOrderTtlMinutes)]
    );
    if (activeResult.rowCount) {
      const completedOrder = activeResult.rows.find((order) => order.status === "PAID");
      const pendingOrderIds = activeResult.rows
        .filter((order) => order.status === "READY")
        .map((order) => order.order_id);

      if (replacePendingOrder && !completedOrder && pendingOrderIds.length > 0) {
        await client.query(
          `UPDATE orders SET status = 'CANCELED', updated_at = NOW() WHERE order_id = ANY($1::text[]) AND status = 'READY'`,
          [pendingOrderIds]
        );
        await client.query(
          `UPDATE spectator_drafts SET order_id = NULL, status = 'DRAFT', updated_at = NOW() WHERE order_id = ANY($1::text[])`,
          [pendingOrderIds]
        );
      } else {
        await client.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          code: completedOrder ? "SPECTATOR_PAYMENT_FINALIZING" : "SPECTATOR_PAYMENT_IN_PROGRESS",
          message: completedOrder
            ? "입장권 결제를 저장하고 있습니다. 잠시 후 신청 조회에서 확인해 주세요."
            : "동일한 정보의 입장권 결제가 이미 진행 중입니다.",
        });
      }
    }

    const reservedCount = await getReservedSpectatorTicketCount(client);
    if (reservedCount >= spectatorTicketCapacity) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, code: "SPECTATOR_SOLD_OUT", message: "참관객 입장권이 매진되었습니다." });
    }

    const providerResolution = resolvePaymentProvider({ requestedProvider: paymentProviders.KCP, amount: spectatorTicketAmount });
    if (!providerResolution.ok) {
      await client.query("ROLLBACK");
      return res.status(providerResolution.status).json({ ok: false, message: providerResolution.message });
    }
    const orderId = generateOrderId();
    const token = createPaymentResultAccessToken({ orderId, secret: paymentResultTokenSecret, ttlSeconds: paymentResultAccessTtlHours * 3600 });
    const orderResult = await client.query(
      `INSERT INTO orders (order_id, order_name, amount, customer_name, customer_email, payment_provider, status) VALUES ($1, '2026 MUSCLEMANIA® 참관객 입장권', $2, $3, $4, $5, 'READY') RETURNING *`,
      [orderId, spectatorTicketAmount, draft.name, draft.email, providerResolution.provider]
    );
    await client.query(`UPDATE spectator_drafts SET order_id = $2, status = 'ORDERED', updated_at = NOW() WHERE draft_id = $1`, [draftId, orderId]);
    await client.query("COMMIT");
    res.setHeader("Set-Cookie", createPaymentResultAccessCookie(token));
    const order = orderResult.rows[0];
    return res.status(201).json({ ok: true, order: { orderId: order.order_id, orderName: order.order_name, amount: order.amount, status: order.status, createdAt: order.created_at } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to create spectator order:", error);
    return res.status(500).json({ ok: false, message: "참관객 결제 주문을 생성하지 못했습니다." });
  } finally {
    client.release();
  }
});

app.post("/spectators/orders/:orderId/cancel", async function (req, res) {
  const orderId = normalizeText(req.params.orderId);
  const draftId = normalizeText(req.body?.draftId);
  if (!orderId || !draftId) return res.status(400).json({ ok: false, message: "Missing orderId or draftId" });
  if (!requireRequestDraftAccess(req, res, { draftId, draftType: "spectator", cookieName: spectatorDraftCookieName })) return;
  try {
    const result = await cancelPendingDraftOrder({ draftTable: "spectator_drafts", draftId, orderId });
    if (!result.ok) return res.status(result.code === "PAYMENT_ALREADY_COMPLETED" ? 409 : 404).json({ ok: false, code: result.code, message: "참관객 결제 주문을 취소할 수 없습니다." });
    return res.status(200).json({ ok: true, orderId, status: "CANCELED" });
  } catch (error) {
    console.error("Failed to cancel spectator order:", error);
    return res.status(500).json({ ok: false, message: "참관객 결제 주문 취소에 실패했습니다." });
  }
});

app.post("/spectators/complete", async function (req, res) {
  const draftId = normalizeText(req.body.draftId);
  const orderId = normalizeText(req.body.orderId);
  if (!draftId || !orderId) return res.status(400).json({ ok: false, message: "Missing draftId or orderId" });
  try {
    const orderResult = await pool.query(`SELECT * FROM orders WHERE order_id = $1 LIMIT 1`, [orderId]);
    if (!orderResult.rowCount) return res.status(404).json({ ok: false, message: "주문을 찾을 수 없습니다." });
    const access = validateOrderPaymentResultAccess(req, orderResult.rows[0]);
    if (!access.ok) return res.status(403).json(access);
    const result = await finalizePaidSpectatorOrder({ draftId, orderId });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error("Failed to complete spectator order:", error);
    return res.status(409).json({ ok: false, code: error.code || "SPECTATOR_COMPLETE_FAILED", message: error.message || "참관객 신청 완료 처리에 실패했습니다." });
  }
});

app.get("/spectators/:spectatorOrderNumber", async function (req, res) {
  const spectatorOrderNumber = normalizeText(req.params.spectatorOrderNumber);
  try {
    const result = await pool.query(`SELECT * FROM spectator_orders WHERE spectator_order_number = $1 LIMIT 1`, [spectatorOrderNumber]);
    if (!result.rowCount) return res.status(404).json({ ok: false, message: "참관객 신청을 찾을 수 없습니다." });
    const access = validateOrderPaymentResultAccess(req, result.rows[0]);
    if (!access.ok) return res.status(403).json(access);
    return res.status(200).json({ ok: true, spectatorOrder: mapSpectatorOrderRow(result.rows[0]) });
  } catch (error) {
    console.error("Failed to fetch spectator order:", error);
    return res.status(500).json({ ok: false, message: "참관객 신청을 불러오지 못했습니다." });
  }
});

app.post("/applications/email-verification/send", async function (req, res) {
  try {
    if (!hasTrustedWriteOrigin(req)) {
      return res.status(403).json({
        ok: false,
        message: "Untrusted request origin",
      });
    }

    const rateLimitResult = consumeLookupVerificationRateLimit({
      action: "application-email-send",
      ipAddress: getRequestIp(req),
      limit: lookupVerificationSendRateLimit,
    });

    if (!rateLimitResult.ok) {
      res.setHeader("Retry-After", String(rateLimitResult.retryAfterSeconds));
      return res.status(429).json({
        ok: false,
        message: "인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      });
    }

    const name = normalizeText(req.body.name);
    const email = normalizeEmail(req.body.email);

    if (!name || !email || !hasValidEmail(email)) {
      return res.status(400).json({
        ok: false,
        message: "성함과 유효한 이메일 주소를 입력해 주세요.",
      });
    }

    const code = generateLookupVerificationCode();
    const sendResult = await sendApplicationEmailVerificationEmail({ email, name, code });
    const verificationToken = createApplicationEmailVerificationToken({
      name,
      email,
      status: "PENDING",
      codeHash: hashLookupVerificationCode(code),
    });

    res.setHeader("Set-Cookie", createApplicationEmailVerificationCookie(verificationToken));
    return res.status(200).json({
      ok: true,
      message: "이메일 인증번호를 전송했습니다.",
      expiresInSeconds: lookupVerificationCodeTtlMinutes * 60,
      ...(sendResult.deliveryMethod === "console" ? { devVerificationCode: code } : {}),
    });
  } catch (error) {
    console.error("Failed to send application email verification code:", error);
    return res.status(500).json({
      ok: false,
      message: "이메일 인증번호를 전송하지 못했습니다.",
    });
  }
});

app.post("/applications/email-verification/verify", async function (req, res) {
  try {
    if (!hasTrustedWriteOrigin(req)) {
      return res.status(403).json({
        ok: false,
        message: "Untrusted request origin",
      });
    }

    const rateLimitResult = consumeLookupVerificationRateLimit({
      action: "application-email-verify",
      ipAddress: getRequestIp(req),
      limit: lookupVerificationVerifyRateLimit,
    });

    if (!rateLimitResult.ok) {
      res.setHeader("Retry-After", String(rateLimitResult.retryAfterSeconds));
      return res.status(429).json({
        ok: false,
        message: "인증 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      });
    }

    const name = normalizeText(req.body.name);
    const email = normalizeEmail(req.body.email);
    const code = normalizeText(req.body.code);

    if (!name || !email || !code || !hasValidEmail(email)) {
      return res.status(400).json({
        ok: false,
        message: "성함, 이메일, 인증번호를 확인해 주세요.",
      });
    }

    if (!isValidLookupVerificationCode(code)) {
      return res.status(400).json({
        ok: false,
        message: "인증번호는 6자리 숫자여야 합니다.",
      });
    }

    const pendingVerification = validateApplicationEmailVerificationToken({
      providedToken: getApplicationEmailVerificationToken(req),
      name,
      email,
      requiredStatus: "PENDING",
    });

    if (!pendingVerification.ok) {
      return res.status(404).json({
        ok: false,
        message: "먼저 인증번호를 전송해 주세요.",
      });
    }

    const { payload } = pendingVerification;

    if (payload.attemptCount >= lookupVerificationMaxAttempts) {
      res.setHeader("Set-Cookie", clearCookie(applicationEmailVerificationCookieName));
      return res.status(429).json({
        ok: false,
        message: "인증 시도 횟수를 초과했습니다. 인증번호를 다시 요청해 주세요.",
      });
    }

    if (payload.codeHash !== hashLookupVerificationCode(code)) {
      const nextAttemptCount = payload.attemptCount + 1;

      if (nextAttemptCount >= lookupVerificationMaxAttempts) {
        res.setHeader("Set-Cookie", clearCookie(applicationEmailVerificationCookieName));
      } else {
        res.setHeader(
          "Set-Cookie",
          createApplicationEmailVerificationCookie(
            createApplicationEmailVerificationToken({
              name,
              email,
              status: "PENDING",
              codeHash: payload.codeHash,
              attemptCount: nextAttemptCount,
              expiresAt: payload.exp,
            })
          )
        );
      }

      return res.status(400).json({
        ok: false,
        message:
          nextAttemptCount >= lookupVerificationMaxAttempts
            ? "인증 시도 횟수를 초과했습니다. 인증번호를 다시 요청해 주세요."
            : "인증번호가 올바르지 않습니다.",
      });
    }

    const verificationToken = createApplicationEmailVerificationToken({
      name,
      email,
      status: "VERIFIED",
      expiresAt: Math.floor(Date.now() / 1000) + lookupVerificationSessionTtlMinutes * 60,
    });

    res.setHeader("Set-Cookie", createApplicationEmailVerificationCookie(verificationToken));
    return res.status(200).json({
      ok: true,
      message: "이메일 인증이 완료되었습니다.",
      sessionExpiresAt: new Date(
        Date.now() + lookupVerificationSessionTtlMinutes * 60 * 1000
      ).toISOString(),
    });
  } catch (error) {
    console.error("Failed to verify application email verification code:", error);
    return res.status(500).json({
      ok: false,
      message: "이메일 인증번호 확인에 실패했습니다.",
    });
  }
});

app.get("/applications/email-verification/status", function (req, res) {
  const name = normalizeText(req.query.name);
  const email = normalizeEmail(req.query.email);

  if (!name || !email || !hasValidEmail(email)) {
    return res.status(400).json({
      ok: false,
      message: "성함과 유효한 이메일 주소를 입력해 주세요.",
    });
  }

  const verification = validateApplicationEmailVerificationToken({
    providedToken: getApplicationEmailVerificationToken(req),
    name,
    email,
    requiredStatus: "VERIFIED",
  });

  return res.status(200).json({
    ok: true,
    verified: verification.ok,
  });
});

app.post("/applications/lookup-verification/send", async function (req, res) {
  try {
    if (!hasTrustedWriteOrigin(req)) {
      return res.status(403).json({
        ok: false,
        message: "Untrusted request origin",
      });
    }

    const rateLimitResult = consumeLookupVerificationRateLimit({
      action: "send",
      ipAddress: getRequestIp(req),
      limit: lookupVerificationSendRateLimit,
    });

    if (!rateLimitResult.ok) {
      res.setHeader("Retry-After", String(rateLimitResult.retryAfterSeconds));
      return res.status(429).json({
        ok: false,
        message: "인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      });
    }

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
        SELECT 1
        FROM (
          SELECT application_number AS reference_number
          FROM applications
          WHERE name = $1 AND LOWER(email) = $2
          UNION ALL
          SELECT spectator_order_number AS reference_number
          FROM spectator_orders
          WHERE name = $1 AND LOWER(email) = $2
        ) AS lookup_targets
        LIMIT 1
      `,
      [name, email]
    );

    if (applicationResult.rowCount === 0) {
      return res.status(200).json({
        ok: true,
        message: "입력한 정보가 등록되어 있으면 이메일 인증번호를 전송합니다.",
        expiresInSeconds: lookupVerificationCodeTtlMinutes * 60,
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
      message: "입력한 정보가 등록되어 있으면 이메일 인증번호를 전송합니다.",
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
    if (!hasTrustedWriteOrigin(req)) {
      return res.status(403).json({
        ok: false,
        message: "Untrusted request origin",
      });
    }

    const rateLimitResult = consumeLookupVerificationRateLimit({
      action: "verify",
      ipAddress: getRequestIp(req),
      limit: lookupVerificationVerifyRateLimit,
    });

    if (!rateLimitResult.ok) {
      res.setHeader("Retry-After", String(rateLimitResult.retryAfterSeconds));
      return res.status(429).json({
        ok: false,
        message: "인증 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      });
    }

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
      sessionExpiresAt: new Date(
        Date.now() + lookupVerificationSessionTtlMinutes * 60 * 1000
      ).toISOString(),
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

app.post("/applications/lookup-phone-verification/send", async function (req, res) {
  try {
    if (!hasTrustedWriteOrigin(req)) {
      return res.status(403).json({
        ok: false,
        message: "Untrusted request origin",
      });
    }

    const rateLimitResult = consumeLookupVerificationRateLimit({
      action: "phone-send",
      ipAddress: getRequestIp(req),
      limit: lookupVerificationSendRateLimit,
    });

    if (!rateLimitResult.ok) {
      res.setHeader("Retry-After", String(rateLimitResult.retryAfterSeconds));
      return res.status(429).json({
        ok: false,
        message: "인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      });
    }

    await ensureLookupPhoneVerificationStoreReady();
    await purgeExpiredLookupPhoneVerifications();

    const name = normalizeText(req.body.name);
    const phone = normalizeText(formatPhoneNumber(req.body.phone));

    if (!name || !phone) {
      return res.status(400).json({
        ok: false,
        message: "Missing name or phone",
      });
    }

    if (phone.replace(/\D/g, "").length !== 11) {
      return res.status(400).json({
        ok: false,
        message: "유효한 휴대전화 번호를 입력해 주세요.",
      });
    }

    const phoneRateLimitResult = consumeLookupVerificationRateLimit({
      action: "phone-send-target",
      ipAddress: phone,
      limit: lookupPhoneVerificationSendRateLimit,
    });

    if (!phoneRateLimitResult.ok) {
      res.setHeader("Retry-After", String(phoneRateLimitResult.retryAfterSeconds));
      return res.status(429).json({
        ok: false,
        message: "이 휴대전화 번호로 인증번호를 여러 번 요청했습니다. 잠시 후 다시 시도해 주세요.",
      });
    }

    const lookupTargetResult = await pool.query(
      `
        SELECT 1
        FROM (
          SELECT application_number AS reference_number
          FROM applications
          WHERE name = $1 AND phone = $2
          UNION ALL
          SELECT spectator_order_number AS reference_number
          FROM spectator_orders
          WHERE name = $1 AND phone = $2
        ) AS lookup_targets
        LIMIT 1
      `,
      [name, phone]
    );

    if (lookupTargetResult.rowCount === 0) {
      return res.status(200).json({
        ok: true,
        message: "입력한 정보가 등록되어 있으면 SMS 인증번호를 전송합니다.",
        expiresInSeconds: lookupVerificationCodeTtlMinutes * 60,
      });
    }

    const recentVerificationResult = await pool.query(
      `
        SELECT created_at
        FROM application_lookup_phone_verifications
        WHERE name = $1
          AND phone = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [name, phone]
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
    await sendLookupPhoneVerificationMessage({ phone, code });

    await pool.query(
      `
        INSERT INTO application_lookup_phone_verifications (
          name,
          phone,
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
      [name, phone, hashLookupPhoneVerificationCode(code), String(lookupVerificationCodeTtlMinutes)]
    );

    return res.status(200).json({
      ok: true,
      message: "입력한 정보가 등록되어 있으면 SMS 인증번호를 전송합니다.",
      expiresInSeconds: lookupVerificationCodeTtlMinutes * 60,
    });
  } catch (error) {
    console.error("Failed to send lookup phone verification code:", error);
    const isSchemaError =
      error?.message?.includes("phone lookup verification migration") ||
      error?.message?.includes("phone verification database schema");
    const isConfigurationError = error?.message === "SOLAPI is not configured";

    return res.status(isSchemaError || isConfigurationError ? 503 : 500).json({
      ok: false,
      message: isConfigurationError
        ? "SMS 인증 서비스 설정이 완료되지 않았습니다."
        : isSchemaError
          ? "SMS 인증 조회 기능 준비가 완료되지 않았습니다."
          : "SMS 인증번호를 전송하지 못했습니다.",
    });
  }
});

app.post("/applications/lookup-phone-verification/verify", async function (req, res) {
  let client = null;

  try {
    if (!hasTrustedWriteOrigin(req)) {
      return res.status(403).json({
        ok: false,
        message: "Untrusted request origin",
      });
    }

    const rateLimitResult = consumeLookupVerificationRateLimit({
      action: "phone-verify",
      ipAddress: getRequestIp(req),
      limit: lookupVerificationVerifyRateLimit,
    });

    if (!rateLimitResult.ok) {
      res.setHeader("Retry-After", String(rateLimitResult.retryAfterSeconds));
      return res.status(429).json({
        ok: false,
        message: "인증 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      });
    }

    client = await pool.connect();
    await ensureLookupPhoneVerificationStoreReady();
    await purgeExpiredLookupPhoneVerifications();

    const name = normalizeText(req.body.name);
    const phone = normalizeText(formatPhoneNumber(req.body.phone));
    const code = normalizeText(req.body.code);

    if (!name || !phone || !code) {
      return res.status(400).json({
        ok: false,
        message: "Missing name, phone, or code",
      });
    }

    if (phone.replace(/\D/g, "").length !== 11) {
      return res.status(400).json({
        ok: false,
        message: "유효한 휴대전화 번호를 입력해 주세요.",
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
        FROM application_lookup_phone_verifications
        WHERE name = $1
          AND phone = $2
          AND status = 'PENDING'
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [name, phone]
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
          UPDATE application_lookup_phone_verifications
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
          UPDATE application_lookup_phone_verifications
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

    if (verification.code_hash !== hashLookupPhoneVerificationCode(code)) {
      const nextAttemptCount = verification.attempt_count + 1;

      await client.query(
        `
          UPDATE application_lookup_phone_verifications
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
        UPDATE application_lookup_phone_verifications
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
      message: "SMS 인증이 완료되었습니다.",
      verificationToken,
      sessionExpiresAt: new Date(
        Date.now() + lookupVerificationSessionTtlMinutes * 60 * 1000
      ).toISOString(),
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }
    console.error("Failed to verify lookup phone verification code:", error);
    const isSchemaError =
      error?.message?.includes("phone lookup verification migration") ||
      error?.message?.includes("phone verification database schema");

    return res.status(isSchemaError ? 503 : 500).json({
      ok: false,
      message: isSchemaError
        ? "SMS 인증 조회 기능 준비가 완료되지 않았습니다."
        : "SMS 인증번호 확인에 실패했습니다.",
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
          participant_gender,
          division,
          discipline,
          image_key,
          submitted_at,
          updated_at
        FROM applications
        WHERE draft_id = $1
        LIMIT 1
      `,
      [draftId]
    );

    if (existingApplicationResult.rowCount > 0) {
      const accessValidation = validateOrderPaymentResultAccess(
        req,
        existingApplicationResult.rows[0]
      );

      if (!accessValidation.ok) {
        await client.query("ROLLBACK");
        return res.status(403).json(accessValidation);
      }

      if (existingApplicationResult.rows[0].order_id !== orderId) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          code: "DRAFT_ORDER_MISMATCH",
          message: "이미 완료된 신청의 주문번호와 일치하지 않습니다.",
        });
      }

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
          participant_gender,
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

    const orderResult = await client.query(
      `
        SELECT
          order_id,
          amount,
          status,
          payment_provider,
          payment_method,
          customer_name,
          customer_email
        FROM orders
        WHERE order_id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [orderId]
    );

    if (orderResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        message: "Order not found",
      });
    }

    const accessValidation = validateOrderPaymentResultAccess(req, orderResult.rows[0]);

    if (!accessValidation.ok) {
      await client.query("ROLLBACK");
      return res.status(403).json(accessValidation);
    }

    const paymentResult = await client.query(
      `
        SELECT
          order_id,
          payment_key,
          provider_payment_id,
          payment_provider,
          status,
          total_amount
        FROM payments
        WHERE order_id = $1
        ORDER BY updated_at DESC
        LIMIT 1
        FOR UPDATE
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
    const order = orderResult.rows[0];
    const payment = paymentResult.rows[0];
    const bindingValidation = validateCompletionPaymentBinding({
      draft,
      order,
      payment,
    });

    if (!bindingValidation.ok) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: bindingValidation.code,
        message: bindingValidation.message,
      });
    }

    const applicationNumber = generateApplicationNumber();

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
          participant_gender,
          division,
          discipline,
          image_key,
          submitted_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, 'SUBMITTED', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
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
          participant_gender,
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
        draft.participant_gender,
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
          participant_gender,
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

    const accessValidation = validateOrderPaymentResultAccess(req, result.rows[0]);

    if (!accessValidation.ok) {
      return res.status(403).json(accessValidation);
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
          participant_gender,
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

    const accessValidation = validateOrderPaymentResultAccess(req, result.rows[0]);

    if (!accessValidation.ok) {
      return res.status(403).json(accessValidation);
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
  let client = null;

  try {
    const normalizedDraftId = normalizeText(req.body.draftId);
    const replacePendingOrder = normalizeBoolean(req.body.replacePendingOrder);

    if (!normalizedDraftId) {
      return res.status(400).json({
        ok: false,
        code: "DRAFT_ID_REQUIRED",
        message: "신청 초안을 먼저 저장해 주세요.",
      });
    }

    if (
      !requireRequestDraftAccess(req, res, {
        draftId: normalizedDraftId,
        draftType: "application",
        cookieName: applicationDraftCookieName,
      })
    ) {
      return;
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const draftResult = await client.query(
      `
        SELECT
          draft_id,
          order_id,
          status,
          name,
          phone,
          email,
          division,
          discipline,
          image_key
        FROM application_drafts
        WHERE draft_id = $1
        FOR UPDATE
      `,
      [normalizedDraftId]
    );

    if (draftResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        message: "Draft not found",
      });
    }

    const draft = draftResult.rows[0];

    const emailVerification = validateApplicationEmailVerificationToken({
      providedToken: getApplicationEmailVerificationToken(req),
      name: draft.name,
      email: draft.email,
      requiredStatus: "VERIFIED",
    });

    if (!emailVerification.ok) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        code: "APPLICATION_EMAIL_VERIFICATION_REQUIRED",
        message: "결제 전 이메일 인증을 완료해 주세요.",
      });
    }

    const consentResult = await client.query(
      `
        SELECT
          privacy_consent,
          terms_consent,
          refund_consent
        FROM application_consents
        WHERE draft_id = $1
          AND application_id IS NULL
        ORDER BY consented_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [draft.draft_id]
    );
    const consents = consentResult.rows[0];

    if (!consents?.privacy_consent || !consents?.terms_consent || !consents?.refund_consent) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        code: "REQUIRED_CONSENTS_MISSING",
        message: "필수 동의 사항을 모두 확인해 주세요.",
      });
    }

    if (!resolveApplicationBaseFee(draft.image_key).isRegistrationOpen) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: "APPLICATION_REGISTRATION_CLOSED",
        message: "현재 대회 참가 접수 기간이 아닙니다. 접수 기간을 확인해 주세요.",
      });
    }

    if (draft.order_id) {
      const existingOrderState = await releaseReusableDraftOrder({
        client,
        draftTable: "application_drafts",
        draftId: draft.draft_id,
        orderId: draft.order_id,
        replacePendingOrder,
      });

      if (!existingOrderState.reusable) {
        const existingOrder = existingOrderState.order;
        const resultAccessToken = createPaymentResultAccessToken({
          orderId: existingOrder.order_id,
          secret: paymentResultTokenSecret,
          ttlSeconds: paymentResultAccessTtlHours * 60 * 60,
        });
        await client.query("COMMIT");
        res.setHeader("Set-Cookie", createPaymentResultAccessCookie(resultAccessToken));
        return res.status(200).json({
          ok: true,
          idempotent: true,
          order: {
            orderId: existingOrder.order_id,
            orderName: existingOrder.order_name,
            amount: existingOrder.amount,
            customerName: existingOrder.customer_name,
            customerEmail: existingOrder.customer_email,
            paymentProvider: existingOrder.payment_provider,
            status: existingOrder.status,
            createdAt: existingOrder.created_at,
          },
        });
      }
    }

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${draft.name}|${draft.phone}|${draft.email.toLowerCase()}`,
    ]);
    const activeOrderResult = await client.query(
      `
        SELECT d.draft_id, d.order_id, o.status
        FROM application_drafts AS d
        INNER JOIN orders AS o ON o.order_id = d.order_id
        WHERE d.name = $1
          AND d.phone = $2
          AND LOWER(d.email) = $3
          AND d.image_key = $4
          AND d.draft_id <> $5
          AND (
            o.status = 'PAID'
            OR (
              o.status = 'READY'
              AND o.created_at > NOW() - ($6::int * INTERVAL '1 minute')
            )
          )
        FOR UPDATE OF d, o
      `,
      [
        draft.name,
        draft.phone,
        draft.email,
        draft.image_key,
        draft.draft_id,
        paymentOrderTtlMinutes,
      ]
    );

    if (activeOrderResult.rowCount > 0) {
      const completedOrder = activeOrderResult.rows.find((order) => order.status === "PAID");
      const pendingOrderIds = activeOrderResult.rows
        .filter((order) => order.status === "READY")
        .map((order) => order.order_id);

      if (replacePendingOrder && !completedOrder && pendingOrderIds.length > 0) {
        await client.query(
          `
            UPDATE orders
            SET status = 'CANCELED', updated_at = NOW()
            WHERE order_id = ANY($1::text[])
              AND status = 'READY'
          `,
          [pendingOrderIds]
        );
        await client.query(
          `
            UPDATE application_drafts
            SET order_id = NULL, status = 'DRAFT', updated_at = NOW()
            WHERE order_id = ANY($1::text[])
          `,
          [pendingOrderIds]
        );
      } else {
        await client.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          code: completedOrder ? "DISCIPLINE_PAYMENT_FINALIZING" : "DISCIPLINE_PAYMENT_IN_PROGRESS",
          message: completedOrder
            ? "동일 종목 결제를 저장하고 있습니다. 잠시 후 신청 조회에서 확인해 주세요."
            : `동일 종목의 결제가 이미 진행 중입니다. ${paymentOrderTtlMinutes}분 후 다시 시도해 주세요.`,
        });
      }
    }
    const duplicateApplication = await findCompletedDuplicateApplication({
      client,
      name: draft.name,
      phone: draft.phone,
      email: draft.email,
      imageKey: draft.image_key,
    });

    if (duplicateApplication) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: "DUPLICATE_DISCIPLINE_APPLICATION",
        message: "이미 결제 완료된 동일 종목 신청이 있습니다. 신청 조회에서 기존 내역을 확인해 주세요.",
      });
    }
    const pricing = await getApplicationEntryFeeQuote({
      queryable: client,
      name: draft.name,
      phone: draft.phone,
      email: draft.email,
      imageKey: draft.image_key,
    });
    const orderDetails = resolveApplicationOrderDetails({ draft, pricing });

    if (!orderDetails.ok) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: orderDetails.code,
        message: orderDetails.message,
      });
    }

    const providerResolution = resolvePaymentProvider({
      requestedProvider: orderDetails.paymentProvider,
      amount: orderDetails.amount,
    });

    if (!providerResolution.ok) {
      await client.query("ROLLBACK");
      return res.status(providerResolution.status).json({
        ok: false,
        message: providerResolution.message,
      });
    }

    const orderId = generateOrderId();
    const resultAccessToken = createPaymentResultAccessToken({
      orderId,
      secret: paymentResultTokenSecret,
      ttlSeconds: paymentResultAccessTtlHours * 60 * 60,
    });
    const result = await client.query(
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
        orderDetails.orderName,
        orderDetails.amount,
        orderDetails.customerName,
        orderDetails.customerEmail,
        providerResolution.provider,
      ]
    );
    const order = result.rows[0];

    await client.query(
      `
        UPDATE application_drafts
        SET
          order_id = $2,
          updated_at = NOW()
        WHERE draft_id = $1
      `,
      [normalizedDraftId, order.order_id]
    );
    await client.query("COMMIT");
    res.setHeader("Set-Cookie", createPaymentResultAccessCookie(resultAccessToken));

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
      pricing,
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    console.error("Failed to create order:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to create order",
    });
  } finally {
    client?.release();
  }
});

app.use(function (error, _req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({
      ok: false,
      message: "Malformed JSON request body",
    });
  }

  console.error("Unhandled request error:", error?.message || error);
  return res.status(500).json({
    ok: false,
    message: "Internal server error",
  });
});

startServer();
