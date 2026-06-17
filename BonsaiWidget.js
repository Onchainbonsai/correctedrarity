// ═══════════════════════════════════════════════════════════════
// 🌳 OnChain Bonsai Widget — Favourite Picker
// by onchainbonsai.github.io/correctedrarity
//
// SETUP:
// 1. Set your Ethereum address below
// 2. In the widget parameter, type the Token ID of the bonsai
//    you want to show (e.g. "1024")
//    Leave empty to show your rarest bonsai automatically.
// ═══════════════════════════════════════════════════════════════

const ETH_ADDRESS = "0xE7D80AbE4c2C852F975c294eBc84982285A5eb27";
// ↑ Replace with your Ethereum address

const OPENSEA_KEY = "b7db8fa50a88f6083c38c478c5c3d58d";
const CONTRACT    = "0xd1bd61c856c1aee57f0439bc018a2b712ce89580";
const SLUG        = "onchainbonsai";
const RANKINGS_URL = "https://onchainbonsai.github.io/correctedrarity/rankings.json";
const CHECKER_URL  = "https://onchainbonsai.github.io/correctedrarity/";

// Widget parameter = Token ID of your favourite bonsai
// e.g. parameter "1024" → shows Bonsai #1024
// Leave empty → shows your rarest bonsai
const PARAM = args.widgetParameter ? args.widgetParameter.trim() : null;

// ── Cache helpers ─────────────────────────────────────────────────
const cache = new Keychain();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function cacheKey(k) { return `bonsai_widget_${k}`; }

function cacheGet(k) {
  try {
    const key = cacheKey(k);
    if (!Keychain.contains(key)) return null;
    const raw = JSON.parse(Keychain.get(key));
    if (Date.now() - raw.ts > CACHE_TTL) { Keychain.remove(key); return null; }
    return raw.data;
  } catch(e) { return null; }
}

function cacheSet(k, data) {
  try { Keychain.set(cacheKey(k), JSON.stringify({ ts: Date.now(), data })); } catch(e) {}
}

// ── API helpers ───────────────────────────────────────────────────
async function fetchJSON(url, headers = {}) {
  const req = new Request(url);
  req.headers = headers;
  return req.loadJSON();
}

async function fetchImg(url) {
  const req = new Request(url);
  return req.loadImage();
}

// ── Get global rank from rankings.json ───────────────────────────
async function getGlobalRank(tokenId) {
  const cached = cacheGet("rankings_map");
  if (cached) return cached[String(tokenId)] || null;

  try {
    const data = await fetchJSON(RANKINGS_URL);
    const map = {};
    for (const r of (data.rankings || [])) {
      map[String(r.id)] = { rank: r.rank, score: r.score, isNamed: r.isNamed };
    }
    cacheSet("rankings_map", map);
    return map[String(tokenId)] || null;
  } catch(e) { return null; }
}

// ── Fetch holder's NFTs ───────────────────────────────────────────
async function getHolderNFTs() {
  const cached = cacheGet(`nfts_${ETH_ADDRESS}`);
  if (cached) return cached;

  let nfts = [], cursor = null;
  do {
    let url = `https://api.opensea.io/api/v2/chain/ethereum/account/${ETH_ADDRESS}/nfts?collection=${SLUG}&limit=200`;
    if (cursor) url += `&next=${cursor}`;
    try {
      const data = await fetchJSON(url, { "x-api-key": OPENSEA_KEY });
      nfts = nfts.concat(data.nfts || []);
      cursor = data.next || null;
    } catch(e) { break; }
  } while (cursor);

  cacheSet(`nfts_${ETH_ADDRESS}`, nfts);
  return nfts;
}

// ── Fetch NFT detail ──────────────────────────────────────────────
async function getNFTDetail(tokenId) {
  const cached = cacheGet(`nft_${tokenId}`);
  if (cached) return cached;

  try {
    const url = `https://api.opensea.io/api/v2/chain/ethereum/contract/${CONTRACT}/nfts/${tokenId}`;
    const data = await fetchJSON(url, { "x-api-key": OPENSEA_KEY });
    const nft = data.nft;
    cacheSet(`nft_${tokenId}`, nft);
    return nft;
  } catch(e) { return null; }
}

// ── Pick which bonsai to show ─────────────────────────────────────
async function pickBonsai() {
  const nfts = await getHolderNFTs();
  if (!nfts.length) return null;

  // If parameter is a token ID → find that specific bonsai
  if (PARAM && /^\d+$/.test(PARAM)) {
    const tokenId = PARAM;
    // Verify holder owns it
    const owns = nfts.find(n => String(n.identifier) === tokenId);
    if (!owns) return { error: `You don't own Bonsai #${tokenId}` };
    return { tokenId, source: "favourite" };
  }

  // No parameter → show rarest
  // Load rankings to sort
  let rankMap = cacheGet("rankings_map");
  if (!rankMap) {
    try {
      const data = await fetchJSON(RANKINGS_URL);
      rankMap = {};
      for (const r of (data.rankings || [])) {
        rankMap[String(r.id)] = { rank: r.rank, score: r.score, isNamed: r.isNamed };
      }
      cacheSet("rankings_map", rankMap);
    } catch(e) { rankMap = {}; }
  }

  const sorted = nfts
    .map(n => ({ id: String(n.identifier), rank: rankMap[String(n.identifier)]?.rank || 9999 }))
    .sort((a, b) => a.rank - b.rank);

  return { tokenId: sorted[0].id, source: "rarest" };
}

// ── Rarity tier color ─────────────────────────────────────────────
function tierColor(pct) {
  if (pct <= 1)  return "#c9a84c"; // legendary
  if (pct <= 5)  return "#9b72cf"; // epic
  if (pct <= 10) return "#4a90d9"; // rare
  if (pct <= 20) return "#5a9e6a"; // uncommon
  return "#7a7868";                 // common
}

function tierLabel(pct) {
  if (pct <= 1)  return "Legendary";
  if (pct <= 5)  return "Epic";
  if (pct <= 10) return "Rare";
  if (pct <= 20) return "Uncommon";
  return "Common";
}

// ── Build the widget ──────────────────────────────────────────────
async function buildWidget() {
  const widget = new ListWidget();
  widget.backgroundColor = new Color("#0b0b08");
  widget.setPadding(0, 0, 0, 0);
  widget.url = CHECKER_URL;

  try {
    // 1. Pick bonsai
    const pick = await pickBonsai();
    if (!pick) { return errorWidget("No bonsai found\nat this address."); }
    if (pick.error) { return errorWidget(pick.error); }

    // 2. Fetch detail
    const nft = await getNFTDetail(pick.tokenId);
    if (!nft) { return errorWidget(`Could not load\nBonsai #${pick.tokenId}`); }

    // 3. Get global rank
    const rankInfo = await getGlobalRank(pick.tokenId);

    // 4. Parse traits
    const EXCL = ["age (months)", "stage"];
    const traits = (nft.traits || []).filter(t => !EXCL.includes(t.trait_type?.toLowerCase()));
    const ageTrait = (nft.traits || []).find(t => t.trait_type?.toLowerCase() === "age (months)");
    const stageTrait = (nft.traits || []).find(t => t.trait_type?.toLowerCase() === "stage");
    const nameTrait = (nft.traits || []).find(t => t.trait_type === "Name");
    const isNamed = !!nameTrait;

    // Find rarest trait
    let rarestTrait = null, rarestPct = 100;
    const SUPPLY = 3192;
    // We don't have counts here, so show first non-excluded trait

    // 5. Load image
    const imgUrl = nft.display_image_url || nft.image_url;
    if (imgUrl) {
      try {
        const img = await fetchImg(imgUrl);
        widget.backgroundImage = img;
        const grad = new LinearGradient();
        grad.colors = [
          new Color("#0b0b08", 0.05),
          new Color("#0b0b08", 0.2),
          new Color("#0b0b08", 0.92),
        ];
        grad.locations = [0.0, 0.35, 1.0];
        widget.backgroundGradient = grad;
      } catch(e) {}
    }

    widget.addSpacer();

    // ── Favourite / Rarest label ──
    const sourceStack = widget.addStack();
    sourceStack.setPadding(0, 12, 2, 12);
    const sourceLabel = pick.source === "favourite" ? "★ FAVOURITE" : "◆ RAREST";
    const sourceTxt = sourceStack.addText(sourceLabel);
    sourceTxt.font = new Font("Space Mono", 8);
    sourceTxt.textColor = new Color(isNamed ? "#c9a84c" : "#5a8c5b");

    // ── Global rank ──
    if (rankInfo) {
      sourceStack.addSpacer();
      const rankTxt = sourceStack.addText(
        isNamed ? "✦ #1 / 3200" : `#${rankInfo.rank} / 3200`
      );
      rankTxt.font = new Font("Space Mono", 8);
      rankTxt.textColor = new Color(isNamed ? "#c9a84c" : "#5a8c5b");
    }

    // ── Name ──
    const nameStack = widget.addStack();
    nameStack.setPadding(0, 12, 3, 12);
    const nameTxt = nameStack.addText(nft.name || `Bonsai #${pick.tokenId}`);
    nameTxt.font = Font.mediumSystemFont(12);
    nameTxt.textColor = new Color("#e8e0d0");
    nameTxt.lineLimit = 1;

    // ── Rarity score ──
    if (rankInfo?.score) {
      const scoreStack = widget.addStack();
      scoreStack.setPadding(0, 12, 3, 12);
      const scoreTxt = scoreStack.addText(`score ${rankInfo.score.toFixed ? rankInfo.score.toFixed(1) : rankInfo.score}`);
      scoreTxt.font = new Font("Space Mono", 8);
      scoreTxt.textColor = new Color("#5a5a50");
    }

    // ── Age & Stage ──
    if (ageTrait || stageTrait) {
      const growthStack = widget.addStack();
      growthStack.setPadding(0, 12, 3, 12);
      const growthParts = [];
      if (stageTrait) growthParts.push(stageTrait.value);
      if (ageTrait) growthParts.push(`Age ${ageTrait.value}mo`);
      const growthTxt = growthStack.addText(growthParts.join(" · "));
      growthTxt.font = new Font("Space Mono", 8);
      growthTxt.textColor = new Color("#4a6a4a");
    }

    // ── Notable traits (top 2) ──
    if (traits.length > 0) {
      const traitStack = widget.addStack();
      traitStack.setPadding(0, 12, 10, 12);
      const shown = traits.slice(0, 2).map(t => t.value).join(" · ");
      const traitTxt = traitStack.addText(shown);
      traitTxt.font = new Font("Space Mono", 7);
      traitTxt.textColor = new Color("#3a3a32");
      traitTxt.lineLimit = 1;
    }

  } catch(e) {
    return errorWidget(e.message.slice(0, 60));
  }

  return widget;
}

function errorWidget(msg) {
  const w = new ListWidget();
  w.backgroundColor = new Color("#0b0b08");
  w.setPadding(14, 14, 14, 14);
  w.addSpacer();
  const s = w.addStack();
  const t = s.addText("🌱\n" + msg);
  t.font = Font.regularSystemFont(11);
  t.textColor = new Color("#5a7a5a");
  t.lineLimit = 3;
  w.addSpacer();
  w.url = CHECKER_URL;
  return w;
}

// ── Run ───────────────────────────────────────────────────────────
const widget = await buildWidget();

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}

Script.complete();
