const http = require("http");

const PORT = process.env.PORT || 3000;

const products = [
  {
    brand: "Trezor",
    name: "Safe 3",
    price: "€59",
    status: "Good deal",
    url: "https://trezor.io/trezor-safe-3"
  },
  {
    brand: "Trezor",
    name: "Safe 5",
    price: "€119",
    status: "Good deal",
    url: "https://trezor.io/trezor-safe-5"
  },
  {
    brand: "Ledger",
    name: "Nano S Plus",
    price: "€47.90",
    status: "Good deal",
    url: "https://www.ledger.com/ledger-nano-s-plus"
  }
];

function page() {
  const cards = products.map(product => `
    <article class="card">
      <div class="brand">${product.brand}</div>
      <h2>${product.name}</h2>
      <div class="price">${product.price}</div>
      <div class="deal">✓ ${product.status}</div>
      <a href="${product.url}" target="_blank" rel="noopener">View deal →</a>
    </article>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WalletRadar — Hardware Wallet Price Radar</title>
<meta name="description" content="Track hardware wallet prices, compare deals and get notified when your preferred wallet reaches your target price.">

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, Arial, sans-serif;
  background: #09090b;
  color: #f4f4f5;
}

.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 24px;
}

header {
  border-bottom: 1px solid #27272a;
  padding: 22px 0;
}

.logo {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -1px;
}

.logo span {
  color: #a78bfa;
}

.hero {
  padding: 90px 0 65px;
  text-align: center;
}

.badge {
  display: inline-block;
  border: 1px solid #3f3f46;
  background: #18181b;
  border-radius: 999px;
  padding: 8px 14px;
  color: #c4b5fd;
  font-size: 14px;
  margin-bottom: 24px;
}

h1 {
  font-size: clamp(42px, 7vw, 76px);
  line-height: 0.98;
  letter-spacing: -4px;
  margin: 0 auto 24px;
  max-width: 850px;
}

.hero p {
  color: #a1a1aa;
  font-size: 20px;
  line-height: 1.6;
  max-width: 680px;
  margin: auto;
}

.search {
  margin: 40px auto 0;
  max-width: 650px;
  display: flex;
  gap: 10px;
}

.search input {
  flex: 1;
  padding: 17px 20px;
  border-radius: 12px;
  border: 1px solid #3f3f46;
  background: #18181b;
  color: white;
  font-size: 16px;
}

.search button {
  padding: 17px 24px;
  border: 0;
  border-radius: 12px;
  background: #a78bfa;
  color: #18181b;
  font-weight: 800;
  cursor: pointer;
}

section {
  padding: 45px 0;
}

.section-title {
  font-size: 30px;
  margin-bottom: 25px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.card {
  background: #18181b;
  border: 1px solid #27272a;
  border-radius: 18px;
  padding: 26px;
}

.brand {
  color: #a1a1aa;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.card h2 {
  margin: 8px 0 20px;
  font-size: 25px;
}

.price {
  font-size: 36px;
  font-weight: 800;
  margin-bottom: 12px;
}

.deal {
  color: #86efac;
  margin-bottom: 22px;
}

.card a {
  color: #c4b5fd;
  text-decoration: none;
  font-weight: 700;
}

.alert {
  background: #18181b;
  border: 1px solid #3f3f46;
  border-radius: 20px;
  padding: 40px;
  text-align: center;
  margin-top: 25px;
}

.alert h2 {
  margin-top: 0;
  font-size: 30px;
}

.alert p {
  color: #a1a1aa;
  line-height: 1.6;
}

footer {
  border-top: 1px solid #27272a;
  margin-top: 70px;
  padding: 30px 0;
  color: #71717a;
  font-size: 14px;
}

@media (max-width: 750px) {
  .grid {
    grid-template-columns: 1fr;
  }

  .search {
    flex-direction: column;
  }

  h1 {
    letter-spacing: -2px;
  }
}
</style>
</head>

<body>

<header>
  <div class="container">
    <div class="logo">Wallet<span>Radar</span></div>
  </div>
</header>

<main>

<section class="hero">
  <div class="container">
    <div class="badge">🔎 Hardware wallet price radar</div>

    <h1>Find the right wallet at the right price.</h1>

    <p>
      Compare hardware wallet prices, discover good deals
      and get alerted when your preferred wallet drops to your target price.
    </p>

    <div class="search">
      <input
        type="text"
        placeholder="Search hardware wallets..."
        aria-label="Search hardware wallets"
      >
      <button>Search</button>
    </div>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-title">🔥 Popular wallets</div>

    <div class="grid">
      ${cards}
    </div>

    <div class="alert">
      <h2>Never miss a price drop.</h2>
      <p>
        Set your target price and WalletRadar will notify you
        when the wallet becomes available at your price.
      </p>

      <div class="search">
        <input type="email" placeholder="Your email address">
        <button>Set price alert</button>
      </div>
    </div>
  </div>
</section>

</main>

<footer>
  <div class="container">
    © 2026 WalletRadar · Price information is for demonstration purposes.
  </div>
</footer>

</body>
</html>`;
}

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8"
    });

    res.end(page());
    return;
  }

  res.writeHead(404, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`WalletRadar running on port ${PORT}`);
});
