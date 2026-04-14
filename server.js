require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const { Pool } = require("pg");
const app = express();
const port = Number(process.env.PORT || 4000);

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

//주문 생성 헬퍼
function generateOrderId(){
  return `order_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
}

function normalizeAmount(value){
  const parsed = Number(value);

  if(!Number.isInteger(parsed) || parsed <= 0){
    return null;
  }

  return parsed;
}

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
app.post("/confirm/widget", async function (req, res) {
  const { paymentKey, orderId, amount } = req.body;

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

    if(order.status === "PAID"){
      const paymentResult = await client.query(
        `
          SELECT
            payment_key,
            raw_response_json
          FROM payments
          WHERE order_id = $1
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [orderId]
      );

      if (paymentResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(500).json({
          ok: false,
          message: "Order is PAID but payment record is missing",
        });
      }

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
    const tossResponse = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: encryptedWidgetSecretKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        orderId,
        amount: normalizedAmount,
        paymentKey,
      }),
    });

    const tossResult = await tossResponse.json();
    console.log("Toss confirm result:", tossResult);
 
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
        tossResult.paymentKey,
        tossResult.method || null,
        tossResult.type || null,
        tossResult.status,
        tossResult.approvedAt || null,
        tossResult.totalAmount,
        JSON.stringify(tossResult),
      ]
    );

    await client.query(
      `
        UPDATE orders
        SET status = 'PAID', updated_at = NOW()
        WHERE order_id = $1
      `,
      [orderId]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      ok:true,
      payment: tossResult,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to confirm widget payment:", error);

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
});

// 결제창 승인
app.post("/confirm/payment", function (req, res) {
  const { paymentKey, orderId, amount } = req.body;

  // 결제 승인 API를 호출하세요.
  // 결제를 승인하면 결제수단에서 금액이 차감돼요.
  // @docs https://docs.tosspayments.com/guides/v2/payment-widget/integration#3-결제-승인하기
  fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: encryptedApiSecretKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      orderId: orderId,
      amount: amount,
      paymentKey: paymentKey,
    }),
  }).then(async function (response) {
    const result = await response.json();
    console.log(result);

    if (!response.ok) {
      // TODO: 결제 승인 실패 비즈니스 로직을 구현하세요.
      res.status(response.status).json(result);

      return;
    }

    // TODO: 결제 완료 비즈니스 로직을 구현하세요.
    res.status(response.status).json(result);
  });
});

// 브랜드페이 승인
app.post("/confirm/brandpay", function (req, res) {
  const { paymentKey, orderId, amount, customerKey } = req.body;

  // 결제 승인 API를 호출하세요.
  // 결제를 승인하면 결제수단에서 금액이 차감돼요.
  // @docs https://docs.tosspayments.com/guides/v2/payment-widget/integration#3-결제-승인하기
  fetch("https://api.tosspayments.com/v1/brandpay/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: encryptedApiSecretKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      orderId: orderId,
      amount: amount,
      paymentKey: paymentKey,
      customerKey: customerKey,
    }),
  }).then(async function (response) {
    const result = await response.json();
    console.log(result);

    if (!response.ok) {
      // TODO: 결제 승인 실패 비즈니스 로직을 구현하세요.
      res.status(response.status).json(result);

      return;
    }

    // TODO: 결제 완료 비즈니스 로직을 구현하세요.
    res.status(response.status).json(result);
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

    if (eventType === "DEPOSIT_CALLBACK") {
      await verifyDepositCallbackSecret({
        paymentKey,
        orderId,
        secret,
      });
    }

    await markWebhookEventStatus(eventId, "PROCESSED");

    return res.status(200).json({
      ok:true,
      received: true,
    });
  } catch (error){
    if (error.code === "23505") {
      return res.status(200).json({
        ok: true,
        duplicated: true,
      });
    }

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
app.post("/orders", async function (req,res) {
  try{
    const{
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
