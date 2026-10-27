import "dotenv/config";
import express from "express";
import { MongoClient } from "mongodb";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const CHECKIN_WINDOW_MINUTES = 60;

// Starter thresholds for the prototype. Adjust these after testing with SRC staff.
const CROWD_THRESHOLDS = { lowMax: 10, mediumMax: 25 };

app.use(express.json({ limit: "10kb" }));
app.use(express.static(join(__dirname, "../public")));

let checkIns;

function getCrowdLevel(count) {
  if (count === 0) return "Not busy yet";
  if (count <= CROWD_THRESHOLDS.lowMax) return "Not busy";
  if (count <= CROWD_THRESHOLDS.mediumMax) return "Getting busy";
  return "Very busy";
}

function validVisitorId(value) {
  return typeof value === "string" && value.length >= 10 && value.length <= 100;
}

app.get("/api/busy-meter", async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - CHECKIN_WINDOW_MINUTES * 60 * 1000);
    const activeCount = await checkIns.countDocuments({ createdAt: { $gte: cutoff } });
    const latest = await checkIns.findOne(
      { createdAt: { $gte: cutoff } },
      { sort: { createdAt: -1 }, projection: { createdAt: 1 } }
    );
    const visitorId = validVisitorId(req.query.visitorId) ? req.query.visitorId : null;
    const ownCheckIn = visitorId
      ? await checkIns.findOne({ visitorId, createdAt: { $gte: cutoff } }, { projection: { _id: 1 } })
      : null;

    res.json({
      activeCount,
      level: getCrowdLevel(activeCount),
      lastUpdated: latest?.createdAt ?? null,
      checkedIn: Boolean(ownCheckIn),
      expiresAfterMinutes: CHECKIN_WINDOW_MINUTES
    });
  } catch (error) {
    console.error("Could not retrieve check-ins:", error.message);
    res.status(500).json({ error: "Could not load the crowd meter." });
  }
});

app.post("/api/busy-meter/check-in", async (req, res) => {
  const { visitorId } = req.body ?? {};
  if (!validVisitorId(visitorId)) {
    return res.status(400).json({ error: "Your browser check-in ID is missing. Refresh the page and try again." });
  }

  try {
    const cutoff = new Date(Date.now() - CHECKIN_WINDOW_MINUTES * 60 * 1000);
    const existing = await checkIns.findOne({ visitorId, createdAt: { $gte: cutoff } });
    const now = new Date();

    if (existing) {
      // Refresh the existing browser's check-in rather than counting it twice.
      await checkIns.updateOne({ _id: existing._id }, { $set: { createdAt: now } });
      return res.json({ success: true, alreadyCheckedIn: true });
    }

    // Upsert by browser ID. A unique index means one browser can only have one row.
    await checkIns.updateOne(
      { visitorId },
      { $set: { visitorId, createdAt: now } },
      { upsert: true }
    );
    return res.status(201).json({ success: true, alreadyCheckedIn: false });
  } catch (error) {
    console.error("Could not save check-in:", error.message);
    return res.status(500).json({ error: "Could not save your check-in. Please try again." });
  }
});

app.get("/", (_req, res) => {
  res.sendFile(join(__dirname, "../public", "index.html"));
});

async function start() {
  if (!MONGO_URI) {
    console.error("Missing MONGO_URI. Add it to server/.env before starting the server.");
    process.exit(1);
  }

  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db("una_src");
    checkIns = db.collection("gymCheckIns");
    await checkIns.createIndex({ visitorId: 1 }, { unique: true });
    await checkIns.createIndex({ createdAt: 1 }, { expireAfterSeconds: CHECKIN_WINDOW_MINUTES * 60 });
    await checkIns.createIndex({ createdAt: -1 });
    app.listen(PORT, () => console.log(`UNA SRC app running on port ${PORT}`));
  } catch (error) {
    console.error("Could not start the server:", error.message);
    await client.close();
    process.exit(1);
  }
}

start();
