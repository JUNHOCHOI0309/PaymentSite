require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
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

app.set("trust proxy", true);

app.use(function (req, res, next) {
  const origin = req.headers.origin;
  const hasConfiguredOrigins = corsAllowedOrigins.length > 0;
  const allowAnyOrigin = !hasConfiguredOrigins;
  const isAllowedOrigin = origin && corsAllowedOrigins.includes(origin);

  if (origin && (allowAnyOrigin || isAllowedOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", allowAnyOrigin ? "*" : origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
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

function normalizeBoolean(value) {
  return value === true;
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
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
}

// Draft 정규화 작업
function validateDraftPayload(body) {
  const name = normalizeText(body.name);
  const phone = normalizeText(body.phone);
  const email = normalizeText(body.email);
  const birthDate = normalizeText(body.birthDate);
  const organization = normalizeText(body.organization);
  const paymentMethod = normalizeText(body.paymentMethod) || "widget";

  const consents = {
    privacy: normalizeBoolean(body.consents?.privacy),
    terms: normalizeBoolean(body.consents?.terms),
    refund: normalizeBoolean(body.consents?.refund),
    marketing: normalizeBoolean(body.consents?.marketing),
  };

  if (!name || !phone || !email || !birthDate) {
    return {
      ok: false,
      message: "Missing required applicant fields",
    };
  }

  if (!consents.privacy || !consents.terms || !consents.refund) {
    return {
      ok: false,
      message: "Required consents are missing",
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

if (!widgetSecretKey || !apiSecretKey) {
  throw new Error("Missing Toss secret keys in .env");
}

// 토스페이먼츠 API는 시크릿 키를 사용자 ID로 사용하고, 비밀번호는 사용하지 않습니다.
// 비밀번호가 없다는 것을 알리기 위해 시크릿 키 뒤에 콜론을 추가합니다.
// @docs https://docs.tosspayments.com/reference/using-api/authorization#%EC%9D%B8%EC%A6%9D
const encryptedWidgetSecretKey =
  "Basic " + Buffer.from(widgetSecretKey + ":").toString("base64");
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

    if (r2HomeImagePrefix && !objectKey.startsWith(r2HomeImagePrefix)) {
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

async function startServer() {
  try {
    await pool.query("SELECT 1");
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
          created_at,
          updated_at
        )
        VALUES ($1, $2, 'DRAFT', $3, $4, $5, $6, $7, NOW(), NOW())
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
          consent_version,
          consented_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `,
      [
        draftResult.rows[0].draft_id,
        payload.consents.privacy,
        payload.consents.terms,
        payload.consents.refund,
        payload.consents.marketing,
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
          consent_version,
          consented_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `,
      [
        draftId,
        payload.consents.privacy,
        payload.consents.terms,
        payload.consents.refund,
        payload.consents.marketing,
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
      consents: consentResult.rows[0] || null,
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

    if (!Number.isFinite(uploadedFile.size) || uploadedFile.size <= 0) {
      return res.status(400).json({
        ok: false,
        message: "Uploaded file is empty",
      });
    }

    const storedFilename = buildUploadObjectKey(draftId, uploadedFile.originalname);

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
        uploadedFile.originalname,
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
    const applicationNumber = normalizeText(req.body.applicationNumber);
    const phone = normalizeText(req.body.phone);

    if (!applicationNumber || !phone) {
      return res.status(400).json({
        ok: false,
        message: "Missing applicationNumber or phone",
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
          submitted_at,
          updated_at
        FROM applications
        WHERE application_number = $1
          AND phone = $2
        LIMIT 1
      `,
      [applicationNumber, phone]
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
    });
  } catch (error) {
    console.error("Failed to lookup application:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to lookup application",
    });
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
          organization
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
          submitted_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, 'SUBMITTED', $5, $6, $7, $8, $9, $10, NOW(), NOW())
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
