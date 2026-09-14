const http = require("http");

const originalEnd = http.ServerResponse.prototype.end;
const originalWrite = http.ServerResponse.prototype.write;
const verificationTag =
  "<meta name='impact-site-verification' value='b2d8fe27-7675-4c2f-8003-891138d661e9'>";

function injectVerificationTag(chunk) {
  if (chunk == null) {
    return chunk;
  }

  let text;

  if (typeof chunk === "string") {
    text = chunk;
  } else if (Buffer.isBuffer(chunk)) {
    text = chunk.toString("utf8");
  } else {
    return chunk;
  }

  if (!text.includes("</head>") || text.includes("impact-site-verification")) {
    return chunk;
  }

  const updated = text.replace(
    "</head>",
    `  ${verificationTag}\n</head>`
  );

  return Buffer.isBuffer(chunk) ? Buffer.from(updated, "utf8") : updated;
}

http.ServerResponse.prototype.write = function (chunk, encoding, callback) {
  return originalWrite.call(this, injectVerificationTag(chunk), encoding, callback);
};

http.ServerResponse.prototype.end = function (chunk, encoding, callback) {
  return originalEnd.call(this, injectVerificationTag(chunk), encoding, callback);
};
