const http = require("http");

const originalEnd = http.ServerResponse.prototype.end;
const verificationTag =
  "<meta name='impact-site-verification' value='b2d8fe27-7675-4c2f-8003-891138d661e9'>";

http.ServerResponse.prototype.end = function (chunk, encoding, callback) {
  if (typeof chunk === "string" && chunk.includes("</head>")) {
    if (!chunk.includes("impact-site-verification")) {
      chunk = chunk.replace(
        "</head>",
        `  ${verificationTag}\n</head>`
      );
    }
  }

  return originalEnd.call(this, chunk, encoding, callback);
};
