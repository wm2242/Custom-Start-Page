// Cloudflare Worker：加密收藏夹/设置数据的 S3 后端
// 职责：只做密文透传，不接触明文；所有关键凭据来自 Worker Secret/环境变量。
// 支持 S3 兼容桶（AWS S3 / Cloudflare R2 / MinIO / Backblaze B2 等）。

const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB

export default {
  async fetch(request, env) {
    const corsOrigin = env.CORS_ALLOWED_ORIGIN || "*";
    const corsHeaders = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Sync-Key, X-API-Token",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/v1/backup" && url.pathname !== "/v1/backup/meta") {
      return jsonResponse({ error: "Not found" }, 404, corsHeaders);
    }

    // 可选：前端调用时携带的访问令牌
    if (env.API_ACCESS_TOKEN) {
      const token = request.headers.get("X-API-Token") || "";
      if (token !== env.API_ACCESS_TOKEN) {
        return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
      }
    }

    const syncKey = request.headers.get("X-Sync-Key") || "";
    if (!syncKey) {
      return jsonResponse({ error: "Missing X-Sync-Key" }, 400, corsHeaders);
    }

    const key = await objectKey(env, syncKey);

    if (url.pathname === "/v1/backup/meta") {
      return handleMeta(request, env, key, corsHeaders);
    }

    switch (request.method) {
      case "PUT":
        return handlePut(request, env, key, corsHeaders);
      case "GET":
        return handleGet(request, env, key, corsHeaders);
      case "DELETE":
        return handleDelete(request, env, key, corsHeaders);
      default:
        return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
    }
  },
};

function jsonResponse(obj, status, corsHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });
}

async function objectKey(env, syncKey) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(syncKey)
  );
  const hex = [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  const prefix = (env.OBJECT_KEY_PREFIX || "backup/").replace(/\/?$/, "/");
  return prefix + hex + ".json";
}

function requireEnv(env) {
  const missing = [
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ].filter(k => !env[k]);
  if (missing.length) {
    throw new Error("Missing Worker env/secret: " + missing.join(", "));
  }
}

async function handlePut(request, env, key, corsHeaders) {
  try {
    requireEnv(env);
    const maxSize = Number(env.MAX_BODY_SIZE || DEFAULT_MAX_BODY_SIZE);
    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
      return jsonResponse({ error: "Content-Type must be application/json" }, 415, corsHeaders);
    }

    const body = await request.arrayBuffer();
    if (body.byteLength > maxSize) {
      return jsonResponse({ error: "Payload too large" }, 413, corsHeaders);
    }

    const payload = new TextDecoder().decode(body);
    // 仅做最外层 JSON 结构校验，不解密
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch (e) {
      return jsonResponse({ error: "Invalid JSON" }, 400, corsHeaders);
    }
    if (!parsed || typeof parsed.data !== "string" || !parsed.data) {
      return jsonResponse({ error: "Missing encrypted data field" }, 400, corsHeaders);
    }

    const s3Url = buildS3Url(env, key);
    const res = await fetch(s3Url, {
      method: "PUT",
      headers: await s3Headers("PUT", s3Url, env, body, "application/json"),
      body,
    });

    if (!res.ok) {
      return jsonResponse({ error: "S3 upload failed", s3Status: res.status }, 502, corsHeaders);
    }

    return jsonResponse({ ok: true, updatedAt: new Date().toISOString() }, 200, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: "Internal error: " + e.message }, 500, corsHeaders);
  }
}

async function handleGet(request, env, key, corsHeaders) {
  try {
    requireEnv(env);
    const s3Url = buildS3Url(env, key);
    const res = await fetch(s3Url, {
      method: "GET",
      headers: await s3Headers("GET", s3Url, env, null, null),
    });

    if (res.status === 404) {
      return jsonResponse({ error: "Not found" }, 404, corsHeaders);
    }
    if (!res.ok) {
      return jsonResponse({ error: "S3 download failed", s3Status: res.status }, 502, corsHeaders);
    }

    const data = await res.text();
    return jsonResponse(JSON.parse(data), 200, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: "Internal error: " + e.message }, 500, corsHeaders);
  }
}

async function handleDelete(request, env, key, corsHeaders) {
  try {
    requireEnv(env);
    const s3Url = buildS3Url(env, key);
    const res = await fetch(s3Url, {
      method: "DELETE",
      headers: await s3Headers("DELETE", s3Url, env, null, null),
    });

    if (!res.ok && res.status !== 404) {
      return jsonResponse({ error: "S3 delete failed", s3Status: res.status }, 502, corsHeaders);
    }

    return jsonResponse({ ok: true }, 200, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: "Internal error: " + e.message }, 500, corsHeaders);
  }
}

async function handleMeta(request, env, key, corsHeaders) {
  try {
    requireEnv(env);
    const s3Url = buildS3Url(env, key);
    const res = await fetch(s3Url, {
      method: "HEAD",
      headers: await s3Headers("HEAD", s3Url, env, null, null),
    });

    if (res.status === 404) {
      return jsonResponse({ error: "Not found" }, 404, corsHeaders);
    }
    if (!res.ok) {
      return jsonResponse({ error: "S3 meta failed", s3Status: res.status }, 502, corsHeaders);
    }

    const lastModified = res.headers.get("Last-Modified") || "";
    return jsonResponse({ updatedAt: lastModified }, 200, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: "Internal error: " + e.message }, 500, corsHeaders);
  }
}

function buildS3Url(env, key) {
  const endpoint = env.S3_ENDPOINT.replace(/\/+$/, "");
  const bucket = env.S3_BUCKET;
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${endpoint}/${bucket}/${encodedKey}`;
}

async function s3Headers(method, url, env, body, contentType) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const service = "s3";
  const region = env.S3_REGION;

  const urlObj = new URL(url);
  const canonicalUri = urlObj.pathname;
  const canonicalQuery = urlObj.search ? urlObj.search.slice(1) : "";
  const payloadHash = body
    ? await sha256Hex(new Uint8Array(body))
    : sha256Hex(new Uint8Array());

  const canonicalHeaders =
    "host:" + urlObj.host + "\n" +
    "x-amz-content-sha256:" + payloadHash + "\n" +
    "x-amz-date:" + amzDate + "\n";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join("\n");

  const signingKey = await getSignatureKey(env.S3_SECRET_ACCESS_KEY, dateStamp, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  const authHeader =
    `${algorithm} Credential=${env.S3_ACCESS_KEY_ID}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = {
    Authorization: authHeader,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    Host: urlObj.host,
  };
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

async function sha256Hex(data) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(key, data) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getSignatureKey(secret, dateStamp, region, service) {
  const kDate = await hmacRaw(new TextEncoder().encode("AWS4" + secret), dateStamp);
  const kRegion = await hmacRaw(kDate, region);
  const kService = await hmacRaw(kRegion, service);
  return await hmacRaw(kService, "aws4_request");
}

async function hmacRaw(key, data) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data)));
}
