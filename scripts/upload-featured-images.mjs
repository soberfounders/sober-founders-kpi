import { readFileSync, createReadStream } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnv() {
  let envPath = resolve(ROOT, ".env.local");
  try {
    readFileSync(envPath, "utf8");
  } catch {
    envPath = resolve(ROOT, ".env");
  }
  const lines = readFileSync(envPath, "utf8").replace(/\r/g, "").split("\n");
  const env = {};
  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(.+)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

const env = loadEnv();
const SITE = env.WP_SITE_URL || "https://soberfounders.org";
const WP_USERNAME = env.WP_USERNAME;
const WP_APP_PASSWORD = env.WP_APP_PASSWORD;

if (!WP_USERNAME || !WP_APP_PASSWORD) {
  console.error("Missing WP_USERNAME or WP_APP_PASSWORD in .env");
  process.exit(1);
}

const AUTH = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString("base64");
const HEADERS = { Authorization: `Basic ${AUTH}` };

const MAPPING = [
  { slug: "best-mastermind-group-for-founders-in-recovery", image: "best_mastermind_founders_recovery" },
  { slug: "ypo-vs-eo-vs-vistage-peer-group-comparison", image: "peer_group_comparison_guide" },
  { slug: "peer-advisory-groups-for-entrepreneurs", image: "peer_group_comparison_guide" },
  { slug: "sober-founders-atlanta", image: "sober_founders_atlanta" },
  { slug: "sober-founders-dallas", image: "sober_founders_dallas" },
  { slug: "sober-founders-san-francisco", image: "sober_founders_san_francisco" },
  { slug: "sober-founders-chicago", image: "sober_founders_chicago" },
  { slug: "sober-founders-denver", image: "sober_founders_denver" },
  { slug: "sober-founders-nashville", image: "sober_founders_nashville" },
  { slug: "sober-founders-austin", image: "sober_founders_austin" },
  { slug: "sober-founders-miami", image: "sober_founders_miami" },
  { slug: "sober-founders-los-angeles", image: "sober_founders_los_angeles" },
  { slug: "sober-founders-new-york", image: "sober_founders_new_york" },
];

// Helper to find image file in the artifact directory
// Since I generated them recently, they are in the brain directory.
// I'll need to use the exact paths or search for them.
// Actually, I can just use the absolute paths I got from the generate_image output.

const ARTIFACT_DIR = "C:/Users/newadmin/.gemini/antigravity/brain/d7e0deb1-3df5-4e6e-b30a-dc666f8ec807";

async function uploadMedia(filePath) {
  const fileName = basename(filePath);
  const fileData = readFileSync(filePath);

  console.log(`Uploading ${fileName}...`);
  const res = await fetch(`${SITE}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Type": "image/png",
    },
    body: fileData,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Media Upload Failed: ${res.status} ${JSON.stringify(json).slice(0, 500)}`);
  }
  return json.id;
}

async function updatePostFeaturedImage(postId, mediaId) {
  console.log(`Setting featured image ${mediaId} for post ${postId}...`);
  const res = await fetch(`${SITE}/wp-json/wp/v2/posts/${postId}`, {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ featured_media: mediaId }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Post Update Failed: ${res.status} ${JSON.stringify(json).slice(0, 500)}`);
  }
  return json.link;
}

async function getPostBySlug(slug) {
  const res = await fetch(`${SITE}/wp-json/wp/v2/posts?slug=${slug}&status=publish,draft&_fields=id,link`, {
    headers: HEADERS,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Get Post Failed: ${res.status} ${JSON.stringify(json).slice(0, 500)}`);
  }
  return json.length > 0 ? json[0] : null;
}

async function main() {
  for (const item of MAPPING) {
    console.log(`\nProcessing: ${item.slug}`);
    
    // 1. Get Post
    const post = await getPostBySlug(item.slug);
    if (!post) {
      console.warn(`  Post not found for slug: ${item.slug}`);
      continue;
    }
    console.log(`  Found Post ID: ${post.id} (${post.link})`);

    // 2. Upload Image
    // I need to find the actual file name since generate_image adds a timestamp
    // I'll search the directory for the pattern.
    const files = await import("fs").then(fs => fs.readdirSync(ARTIFACT_DIR));
    const imageFile = files.find(f => f.startsWith(item.image) && f.endsWith(".png"));
    
    if (!imageFile) {
      console.warn(`  Image file not found for: ${item.image}`);
      continue;
    }
    
    const imagePath = resolve(ARTIFACT_DIR, imageFile);
    
    try {
      const mediaId = await uploadMedia(imagePath);
      console.log(`  Media Uploaded: ID ${mediaId}`);

      // 3. Update Post
      const finalLink = await updatePostFeaturedImage(post.id, mediaId);
      console.log(`  SUCCESS: Featured image set. Post live at ${finalLink}`);
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
    }
  }
}

main().catch(console.error);
