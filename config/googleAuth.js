"use strict";
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { google } = require("googleapis");

// Khóa cấu hình Production chính thức của mathuatbeat.xyz
// .trim() loại bỏ mọi khoảng trắng / ký tự ẩn có thể gây lỗi redirect_uri_mismatch.
const GOOGLE_CLIENT_ID =
  "916633799812-6n7k5eha7kmuk3f8k910if93jdfiroq9.apps.googleusercontent.com".trim();

// Redirect URI — phải khớp ký tự CHÍNH XÁC với URI đã đăng ký trong Google Cloud Console.
//
// ✅ Đăng ký trong Google Cloud Console → APIs & Services → Credentials:
//    Authorized redirect URIs:
//      https://mathuatbeat.xyz/api/auth/google/callback  ← production (Authorization Code)
//      http://localhost:8080/api/auth/google/callback        ← development
//
// Production: https://mathuatbeat.xyz/api/auth/google/callback
// Dev:        http://localhost:8080/api/auth/google/callback  (override bằng GOOGLE_REDIRECT_URI trong .env)
const GOOGLE_REDIRECT_URI =
  (process.env.GOOGLE_REDIRECT_URI || "https://mathuatbeat.xyz/api/auth/google/callback").trim();

/**
 * Tạo một OAuth2Client mới cho mỗi request để tránh chia sẻ credentials giữa các request.
 * Luôn dùng hàm này thay vì export trực tiếp oauth2Client singleton.
 */
function createOAuth2Client() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

// Singleton dùng cho các trường hợp không cần per-request credentials
const oauth2Client = createOAuth2Client();

/**
 * Xác minh Google ID Token (dùng cho One Tap ux_mode:"redirect").
 * @param {string} idToken — credential JWT nhận được từ Google POST
 * @returns {Promise<import('googleapis').Auth.TokenPayload>}
 */
async function verifyIdToken(idToken) {
  const client = createOAuth2Client();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID, // 916633799812-6n7k5eha7kmuk3f8k910if93jdfiroq9.apps.googleusercontent.com
  });
  return ticket.getPayload();
}

console.log(
  `[Hệ thống] Đã cấu hình Google Client ID chính thức: ${GOOGLE_CLIENT_ID}`
);
console.log(
  `[Hệ thống] Google Redirect URI (Authorization Code): ${GOOGLE_REDIRECT_URI}`
);
console.log(
  `[Hệ thống] Google One Tap login_uri: https://mathuatbeat.xyz/api/auth/google/onetap`
);

module.exports = {
  oauth2Client,
  createOAuth2Client,
  verifyIdToken,
  GOOGLE_CLIENT_ID,
  GOOGLE_REDIRECT_URI,
};
