/**
 * End-to-end check of the marketplace: shop, orders, stock, bikes, public ads,
 * member accounts and security rules, driven through the real HTTP API.
 *
 *   1. Start the app against an EMPTY throwaway database whose name ends in _test:
 *        MONGODB_URI=mongodb://localhost:27017/sabaq_test npm run dev
 *   2. In another terminal:  npm run test:e2e
 *      (E2E_BASE_URL defaults to http://localhost:3000)
 *
 * It creates an admin (admin@test.pk / secret123) and sample data, so never
 * point it at a real database. Restart the dev server between runs: the public
 * rate limiter keeps per-IP counters in memory.
 */
const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
let pass = 0, fail = 0;
const results = [];
process.on("exit", () => { console.log(results.join("\n")); console.log(`\n${pass} passed, ${fail} failed`); });
function check(name, ok, detail = "") {
  ok ? pass++ : fail++;
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

class Client {
  constructor(name) { this.name = name; this.cookies = {}; }
  async req(method, path, body, { form, raw } = {}) {
    const headers = { cookie: Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join("; ") };
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair] = c.split(";"); const [k, ...v] = pair.split("=");
      if (v.join("=") === "" || /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)) delete this.cookies[k]; else this.cookies[k] = v.join("=");
    }
    if (raw) return res;
    let data = {}; try { data = await res.json(); } catch {}
    return { status: res.status, data };
  }
}

const staff = new Client("staff");
const shopper = new Client("shopper");
const seller = new Client("seller");
const buyer = new Client("buyer");

// ---------- staff setup
let r = await staff.req("PUT", "/api/auth/login", { name: "Admin User", email: "admin@test.pk", password: "secret123" });
check("admin setup", r.status === 201 || r.status === 409, `${r.status} ${r.data.error || ""}`);
r = await staff.req("POST", "/api/auth/login", { email: "admin@test.pk", password: "secret123" });
check("admin login", r.status === 200 && Object.keys(staff.cookies).length > 0, `${r.status} ${r.data.error || ""}`);

// ---------- shop: create inventory items + list them
const oil = await staff.req("POST", "/api/inventory", { sku: "OIL-HX7-4L", name: "Shell Helix HX7 10W-40 4L", category: "Lubricants", unit: "pcs", quantity: 3, salePrice: 6500, unitCost: 5200, branchCode: "MAIN" });
check("create inventory item (oil, qty 3)", oil.status === 201, `${oil.status} ${oil.data.error || ""}`);
const helmet = await staff.req("POST", "/api/inventory", { sku: "HLM-VEGA-M", name: "Vega Off-road Helmet M", category: "Gear", unit: "pcs", quantity: 5, salePrice: 9000, unitCost: 7000, branchCode: "MAIN" });
const oilId = oil.data.item?._id, helmetId = helmet.data.item?._id;

// image upload (staff): 1x1 PNG, then a fake "png" that is really text
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let fd = new FormData(); fd.append("file", new Blob([png], { type: "image/png" }), "tiny.png");
const up = await staff.req("POST", "/api/uploads/image", undefined, { form: fd });
check("staff image upload (real PNG)", up.status === 201 && /^\/uploads\/images\/.+\.png$/.test(up.data.url || ""), up.data.url || up.data.error);
fd = new FormData(); fd.append("file", new Blob([Buffer.from("<?php echo 1; ?>")], { type: "image/png" }), "evil.png");
r = await staff.req("POST", "/api/uploads/image", undefined, { form: fd });
check("upload rejects non-image disguised as .png", r.status === 400, `${r.status} ${r.data.error || ""}`);
const img = up.data.url;
r = await shopper.req("GET", img, undefined, { raw: true });
check("uploaded image is served publicly", r.status === 200, String(r.status));

r = await staff.req("PUT", `/api/shop/products/${oilId}`, { published: true, title: "Shell Helix HX7 10W-40 (4L)", brand: "Shell", shopCategory: "Engine Oil & Lubricants", fit: "car", images: [img], compareAtPrice: 7200, featured: true, tags: ["10w40"], fitment: "Most petrol cars" });
check("publish oil in shop", r.status === 200 && r.data.shop?.slug, r.data.shop?.slug || r.data.error);
const oilSlug = r.data.shop?.slug;
r = await staff.req("PUT", `/api/shop/products/${helmetId}`, { published: true, brand: "Vega", shopCategory: "Helmets & Riding Gear", fit: "bike", images: [], featured: false, tags: [] });
check("publishing without photo is refused", r.status === 400, r.data.error);
r = await staff.req("PUT", `/api/shop/products/${helmetId}`, { published: true, brand: "Vega", shopCategory: "Helmets & Riding Gear", fit: "bike", images: [img], featured: false, tags: [] });
check("publish helmet", r.status === 200);

// ---------- public catalogue
r = await shopper.req("GET", "/api/site/shop/products");
check("public catalogue lists 2 products", r.data.total === 2, `total=${r.data.total}`);
check("catalogue hides unit cost", !JSON.stringify(r.data).includes("5200"), "");
r = await shopper.req("GET", "/api/site/shop/products?fit=bike");
check("filter fit=bike → helmet only", r.data.total === 1 && r.data.products[0].title.includes("Helmet"), `total=${r.data.total}`);
r = await shopper.req("GET", "/api/site/shop/products?q=10w40");
check("search by tag", r.data.total === 1, `total=${r.data.total}`);
r = await shopper.req("GET", `/api/site/shop/products/${oilSlug}`);
check("product detail by slug", r.status === 200 && r.data.product.available === 3, `available=${r.data.product?.available}`);

// ---------- checkout rules
r = await staff.req("PUT", "/api/shop", { enabled: true, classifiedsEnabled: true, fulfilmentBranch: "MAIN", deliveryFee: 250, freeDeliveryOver: 20000, codEnabled: true, bankTransferEnabled: false, moderateAds: true });
check("admin updates shop settings", r.status === 200, r.data.error);
const quote = await shopper.req("POST", "/api/site/shop/quote", { items: [{ productId: oilId, qty: 2 }] });
check("quote: 2×6500 + 250 delivery = 13250", quote.data.quote?.total === 13250, JSON.stringify(quote.data.quote));
const order = { customerName: "Ali Khan", phone: "0300-1234567", address: "House 12, Street 4, DHA Phase 5", city: "Lahore", paymentMethod: "cod" };
r = await shopper.req("POST", "/api/site/shop/checkout", { ...order, items: [{ productId: oilId, qty: 2 }], expectedTotal: 999 });
check("checkout refuses stale total", r.status === 409, r.data.error);
r = await shopper.req("POST", "/api/site/shop/checkout", { ...order, items: [{ productId: oilId, qty: 5 }], expectedTotal: 32750 });
check("checkout refuses more than stock", r.status === 409, r.data.error);
r = await shopper.req("POST", "/api/site/shop/checkout", { ...order, items: [{ productId: oilId, qty: 2 }], expectedTotal: 13250, website: "spam" });
check("honeypot blocks bots", r.status === 400, r.data.error);
const placed = await shopper.req("POST", "/api/site/shop/checkout", { ...order, items: [{ productId: oilId, qty: 2 }], expectedTotal: 13250 });
check("checkout OK → SO number", placed.status === 201 && /^SO-\d{4}-\d{5}$/.test(placed.data.number || ""), placed.data.number || placed.data.error);
r = await shopper.req("POST", "/api/site/shop/track", { number: placed.data.number, phone: "+92 300 1234567" });
check("track order with phone in other format", r.status === 200 && r.data.order?.status === "pending", r.data.error || r.data.order?.status);
r = await shopper.req("POST", "/api/site/shop/track", { number: placed.data.number, phone: "03009999999" });
check("track refuses wrong phone", r.status === 404);

// second order that will exceed stock once the first is confirmed
const placed2 = await shopper.req("POST", "/api/site/shop/checkout", { ...order, customerName: "Sara", phone: "03211111111", items: [{ productId: oilId, qty: 2 }], expectedTotal: 13250 });

// ---------- staff fulfilment
let ov = await staff.req("GET", "/api/shop?status=pending");
const o1 = ov.data.orders?.find((o) => o.number === placed.data.number);
const o2 = ov.data.orders?.find((o) => o.number === placed2.data.number);
check("staff sees 2 pending orders", ov.data.counts?.pending === 2, JSON.stringify(ov.data.counts));
r = await staff.req("POST", `/api/shop/orders/${o1._id}`, { action: "dispatch", courier: "TCS", trackingNumber: "X1" });
check("cannot dispatch before confirm", r.status === 409, r.data.error);
r = await staff.req("POST", `/api/shop/orders/${o1._id}`, { action: "confirm" });
check("confirm order 1 → stock voucher posted", r.status === 200 && r.data.order?.stockVoucherNumber, r.data.order?.stockVoucherNumber || r.data.error);
const stock = async () => (await staff.req("GET", "/api/shop")).data.products?.find((p) => p._id === oilId)?.available;
check("stock went 3 → 1", (await stock()) === 1, `qty=${await stock()}`);
r = await staff.req("POST", `/api/shop/orders/${o2._id}`, { action: "confirm" });
check("confirm order 2 refused (only 1 left)", r.status === 400 || r.status === 409, r.data.error);
r = await staff.req("POST", `/api/shop/orders/${o1._id}`, { action: "dispatch", courier: "TCS", trackingNumber: "TCS-778899" });
check("dispatch", r.data.order?.status === "dispatched");
r = await staff.req("POST", `/api/shop/orders/${o1._id}`, { action: "deliver" });
check("deliver COD → paid", r.data.order?.status === "delivered" && r.data.order?.paymentStatus === "paid", `${r.data.order?.status}/${r.data.order?.paymentStatus}`);
r = await staff.req("POST", `/api/shop/orders/${o1._id}`, { action: "return", reason: "Wrong grade" });
check("return delivered order", r.data.order?.status === "returned", r.data.error || r.data.order?.status);
check("stock back to 3 after return", (await stock()) === 3, `qty=${await stock()}`);
r = await staff.req("POST", `/api/shop/orders/${o2._id}`, { action: "confirm" });
check("order 2 confirms now", r.status === 200, r.data.error);
r = await staff.req("POST", `/api/shop/orders/${o2._id}`, { action: "cancel", reason: "Customer changed mind" });
check("cancel confirmed order (admin) voids voucher", r.data.order?.status === "cancelled", r.data.error);
check("stock restored to 3 after cancel", (await stock()) === 3, `qty=${await stock()}`);

// ---------- members + classifieds
r = await seller.req("POST", "/api/site/member/register", { name: "Bilal Ahmed", phone: "0333-5556666", password: "short" });
check("register: password min 8", r.status === 400, r.data.error);
r = await seller.req("POST", "/api/site/member/register", { name: "Bilal Ahmed", phone: "0333-5556666", password: "goodpass123", city: "Karachi" });
check("register seller", r.status === 201 && seller.cookies.market_member, r.data.error || "");
r = await new Client("x").req("POST", "/api/site/member/register", { name: "Dup", phone: "+923335556666", password: "goodpass123" });
check("duplicate phone (different format) refused", r.status === 409, r.data.error);

// security: member token must not work as staff session
const forged = new Client("forged"); forged.cookies.school_session = seller.cookies.market_member;
r = await forged.req("GET", "/api/shop");
check("member token rejected on staff API", r.status === 401, String(r.status));
r = await forged.req("GET", "/api/settings");
check("member token rejected on any-role staff API", r.status === 401, String(r.status));
r = await new Client("anon").req("GET", "/api/shop");
check("anonymous cannot read shop admin", r.status === 401);

fd = new FormData(); fd.append("file", new Blob([png], { type: "image/png" }), "car.png");
const sup = await seller.req("POST", "/api/site/member/upload", undefined, { form: fd });
check("member photo upload", sup.status === 201, sup.data.error || sup.data.url);
r = await new Client("anon").req("POST", "/api/site/member/upload", undefined, { form: fd });
check("anonymous upload refused", r.status === 401);

const ad = { vehicleType: "bike", make: "Honda", model: "CG 125", variant: "Self Start", year: 2022, mileage: 18000, engineCc: 125, fuel: "Petrol", bodyType: "Standard", condition: "used", city: "Karachi", listPrice: 285000, negotiable: true, description: "Genuine condition", photos: [sup.data.url], features: ["Self start"], sellerName: "Bilal", sellerPhone: "0333-5556666", showPhone: true };
r = await seller.req("POST", "/api/site/member/ads", { ...ad, photos: [] });
check("ad needs a photo", r.status === 400, r.data.error);
r = await seller.req("POST", "/api/site/member/ads", { ...ad, photos: ["javascript:alert(1)"] });
check("ad rejects unsafe photo URL", r.status === 400, r.data.error);
const adRes = await seller.req("POST", "/api/site/member/ads", ad);
check("post bike ad → pending review", adRes.status === 201 && adRes.data.ad?.status === "pending", adRes.data.error || adRes.data.ad?.status);
const adId = adRes.data.ad?._id;
r = await buyer.req("GET", "/api/site/cars?type=bike&seller=private");
check("pending ad not public", r.data.total === 0, `total=${r.data.total}`);
r = await staff.req("GET", "/api/shop/classifieds?status=pending");
check("staff review queue has the ad", r.data.ads?.some((a) => a._id === adId));
r = await staff.req("POST", `/api/shop/classifieds/${adId}`, { action: "approve" });
check("approve ad", r.data.ad?.status === "active", r.data.error);

// dealer bike + car in stock to test the merged search
r = await staff.req("POST", "/api/dealership/vehicles", { vehicleType: "bike", make: "Yamaha", model: "YBR 125", year: 2023, mileage: 5000, condition: "used", status: "in_stock", purchaseCost: 300000, listPrice: 360000, floorPrice: 0, published: true, photos: [img], features: [], city: "Lahore" });
check("dealer bike published", r.status === 201, r.data.error);
r = await staff.req("POST", "/api/dealership/vehicles", { make: "Toyota", model: "Corolla", year: 2020, mileage: 60000, condition: "used", status: "in_stock", purchaseCost: 4500000, listPrice: 5200000, floorPrice: 0, published: true, photos: [img], features: [], city: "Lahore" });
check("dealer car (no vehicleType given → car)", r.status === 201 && r.data.vehicle?.vehicleType === "car", r.data.error || r.data.vehicle?.vehicleType);

r = await buyer.req("GET", "/api/site/cars?type=bike");
check("bike search merges dealer + private (2)", r.data.total === 2, `total=${r.data.total} err=${r.data.error || ""}`);
const sellers = (r.data.listings || []).map((l) => l.seller.type).sort().join(",");
check("…one dealer, one private", sellers === "dealer,private", sellers);
check("bike search excludes cars", !(r.data.listings || []).some((l) => l.make === "Toyota"));
check("public listing hides dealer cost", !JSON.stringify(r.data).includes("300000"));
r = await buyer.req("GET", "/api/site/cars?type=bike&seller=private");
check("seller=private filter", r.data.total === 1 && r.data.listings?.[0]?.seller.type === "private", `total=${r.data.total}`);
r = await buyer.req("GET", "/api/site/cars?type=bike&inspected=1");
check("inspected filter drops private ads", (r.data.listings || []).every((l) => l.seller.type === "dealer"), `total=${r.data.total}`);
r = await buyer.req("GET", "/api/site/cars?type=bike&sort=price_asc");
check("price sort across both sources", r.data.listings?.[0]?.price === 285000, r.data.listings?.map((l) => l.price).join(","));
r = await buyer.req("GET", "/api/site/cars?type=car");
check("car search shows the Corolla only", r.data.total === 1 && r.data.listings?.[0]?.make === "Toyota", `total=${r.data.total}`);
r = await buyer.req("GET", "/api/site/cars?type=bike");
const makes = (r.data.facets?.makes || []).map((m) => m.value).sort().join(",");
check("bike facets list Honda,Yamaha", makes === "Honda,Yamaha", makes);

r = await buyer.req("GET", `/api/site/cars/${adId}`);
check("private ad detail", r.status === 200 && r.data.listing?.seller?.phone === "03335556666", r.data.error || r.data.listing?.seller?.phone);
check("ad detail never leaks buyer messages", !JSON.stringify(r.data).includes("messages"), "");
r = await buyer.req("POST", `/api/site/cars/${adId}`, { name: "Usman", phone: "03451234567", intent: "offer", offerPrice: 270000, message: "Cash ready" });
check("buyer messages private seller", r.status === 201 && r.data.private, r.data.error);
r = await seller.req("GET", "/api/site/member/ads");
const mine = r.data.ads?.find((a) => a._id === adId);
check("seller inbox has the offer", mine?.messages?.[0]?.offerPrice === 270000, JSON.stringify(mine?.messages?.[0] || {}));
r = await new Client("other").req("POST", "/api/site/member/register", { name: "Other", phone: "03001112222", password: "goodpass123" });
const intruder = new Client("intruder");
await intruder.req("POST", "/api/site/member/login", { phone: "03001112222", password: "goodpass123" });
r = await intruder.req("POST", `/api/site/member/ads/${adId}`, { action: "remove" });
check("another member cannot touch the ad", r.status === 404, String(r.status));
r = await seller.req("POST", `/api/site/member/ads/${adId}`, { action: "mark_sold" });
check("seller marks sold", r.data.ad?.status === "sold");
r = await buyer.req("GET", "/api/site/cars?type=bike&seller=private");
check("sold ad leaves public search", r.data.total === 0, `total=${r.data.total}`);

// login lockout
const lock = new Client("lock");
for (let i = 0; i < 5; i++) await lock.req("POST", "/api/site/member/login", { phone: "0333-5556666", password: "wrongpass" });
r = await lock.req("POST", "/api/site/member/login", { phone: "0333-5556666", password: "goodpass123" });
check("account locks after 5 wrong passwords", r.status === 403, r.data.error);

// pages render (server components hit the DB)
for (const path of ["/cars", "/bikes", "/shop", `/shop/${oilSlug}`, "/shop/cart", "/shop/track", "/post-ad", "/account", "/ecommerce", "/dashboard", "/dealership?tab=classifieds"]) {
  const c = path === "/ecommerce" || path.startsWith("/dashboard") || path.startsWith("/dealership") ? staff : buyer;
  const res = await c.req("GET", path, undefined, { raw: true });
  check(`page ${path} renders`, res.status === 200, String(res.status));
}
const staffPublic = await staff.req("GET", "/cars", undefined, { raw: true });
check("signed-in staff can view /cars (proxy fix)", staffPublic.status === 200, String(staffPublic.status));

