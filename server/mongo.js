import "dotenv/config";
import express from "express";
import { MongoClient } from "mongodb";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const CHECKIN_WINDOW_MINUTES = 60;

app.use(express.json({ limit: "10kb" }));
app.use(express.static(join(__dirname, "../public")));

let checkIns;

// ---------------- UNA SRC Busy Meter ----------------

const CROWD_THRESHOLDS = { lowMax: 10, mediumMax: 25 };

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
      ? await checkIns.findOne(
          { visitorId, createdAt: { $gte: cutoff } },
          { projection: { _id: 1 } }
        )
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
    return res.status(400).json({
      error: "Your browser check-in ID is missing. Refresh the page and try again."
    });
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
    return res.status(500).json({
      error: "Could not save your check-in. Please try again."
    });
  }
});

// ---------------- UNA SRC Fitness Assistant (Gemini with fallback) ----------------
// Workout plans are generated on demand and are NOT saved in MongoDB.

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

// Primary and backup are stable Gemini Flash models.
// These can also be overridden in server/.env.
const PRIMARY_GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.8-flash";
  
const BACKUP_GEMINI_MODEL =
  process.env.GEMINI_BACKUP_MODEL || "gemini-3.6-flash";

function cleanText(value, maxLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validateFitnessInput(body) {
  const classes = Array.isArray(body?.classes) ? body.classes.slice(0, 20) : [];
  const cleanClasses = classes.map((item) => ({
    name: cleanText(item?.name, 80) || "Class",
    day: cleanText(item?.day, 12),
    start: cleanText(item?.start, 5),
    end: cleanText(item?.end, 5)
  }));

  const validDays = [
    "Monday", "Tuesday", "Wednesday", "Thursday",
    "Friday", "Saturday", "Sunday"
  ];
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;

  if (
    cleanClasses.some(
      (item) =>
        !validDays.includes(item.day) ||
        !validTime.test(item.start) ||
        !validTime.test(item.end) ||
        item.end <= item.start
    )
  ) {
    return {
      error: "Please check each class day and time. End times must be after start times."
    };
  }

  const prefs = body?.preferences ?? {};
  const daysPerWeek = Number(prefs.daysPerWeek);
  const minutesPerWorkout = Number(prefs.minutesPerWorkout);

  if (!Number.isInteger(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 5) {
    return { error: "Choose between 1 and 5 workout days per week." };
  }

  if (
    !Number.isInteger(minutesPerWorkout) ||
    minutesPerWorkout < 15 ||
    minutesPerWorkout > 120
  ) {
    return { error: "Choose a workout length between 15 and 120 minutes." };
  }

  return {
    value: {
      classes: cleanClasses,
      preferences: {
        daysPerWeek,
        minutesPerWorkout,
        preferredTime: cleanText(prefs.preferredTime, 30),
        activities: cleanText(prefs.activities, 180),
        experience: cleanText(prefs.experience, 40)
      }
    }
  };
}

const FITNESS_INSTRUCTIONS = `You are the UNA SRC Fitness Assistant for university students. Be friendly, practical, inclusive, and concise. Help students plan balanced, age-appropriate physical activity around their class schedules and stated preferences. Respect all class times and do not schedule workouts that overlap classes. Include rest/recovery days and flexible options. Do not focus on weight loss, calorie restriction, body shape, or appearance. Do not recommend extreme exercise, exercising through pain, or unsafe challenges. Do not diagnose or provide medical treatment; if a student mentions pain, injury, illness, or a health concern, recommend speaking with a qualified healthcare professional or SRC staff before changing activity. Never claim the schedule guarantees results. If details are missing, make reasonable clearly stated assumptions and invite the student to adjust the plan. Use readable headings and a simple Monday-Sunday layout when generating a schedule.`;

function isTemporaryGeminiError(error) {
  const status = Number(error?.status ?? error?.code);
  const message = String(error?.message ?? "").toUpperCase();

  return (
    [408, 429, 500, 502, 503, 504].includes(status) ||
    message.includes("UNAVAILABLE") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("TOO MANY REQUESTS") ||
    message.includes("INTERNAL") ||
    message.includes("HIGH DEMAND")
  );
}

async function generateWithModel(model, contents) {
  return gemini.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: FITNESS_INSTRUCTIONS,
      maxOutputTokens: 1200
    }
  });
}

async function requestFitnessAI(input) {
  if (!gemini) {
    const error = new Error(
      "The Fitness Assistant is not configured yet. Add GEMINI_API_KEY to server/.env and restart the server."
    );
    error.status = 503;
    throw error;
  }

  // Gemini uses the role name "model" for assistant replies.
  const contents = typeof input === "string"
    ? input
    : input.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }]
      }));

  try {
    const response = await generateWithModel(PRIMARY_GEMINI_MODEL, contents);
    return response.text || "I couldn't create a response just now. Please try again.";
  } catch (primaryError) {
    const backupIsDifferent = BACKUP_GEMINI_MODEL !== PRIMARY_GEMINI_MODEL;

    if (!backupIsDifferent || !isTemporaryGeminiError(primaryError)) {
      throw primaryError;
    }

    console.warn(
      `Primary Gemini model (${PRIMARY_GEMINI_MODEL}) is temporarily unavailable. Trying backup model (${BACKUP_GEMINI_MODEL}).`
    );

    try {
      const backupResponse = await generateWithModel(BACKUP_GEMINI_MODEL, contents);
      console.log(`Fitness Assistant successfully used backup model: ${BACKUP_GEMINI_MODEL}`);
      return backupResponse.text || "I couldn't create a response just now. Please try again.";
    } catch (backupError) {
      console.error("Both Gemini models failed.", {
        primaryModel: PRIMARY_GEMINI_MODEL,
        primaryError: primaryError.message,
        backupModel: BACKUP_GEMINI_MODEL,
        backupError: backupError.message
      });

      // Return the backup error so the server log shows the most recent failure.
      throw backupError;
    }
  }
}

app.post("/api/fitness/generate", async (req, res) => {
  const validated = validateFitnessInput(req.body);
  if (validated.error) return res.status(400).json({ error: validated.error });

  try {
    const { classes, preferences } = validated.value;
    const prompt =
      `Create a suggested Monday-Sunday workout schedule using this student's availability.\n\n` +
      `Class schedule (do not overlap): ${JSON.stringify(classes)}\n` +
      `Preferences: ${JSON.stringify(preferences)}\n\n` +
      `Give a brief explanation, then a clear day-by-day schedule with suggested activity and duration. ` +
      `Include rest days. If a day has no class listed, that does not automatically mean the student is free all day; ` +
      `suggest a flexible time window based on their preferred time. Remind them this is a flexible starting point.`;

    const answer = await requestFitnessAI(prompt);
    res.json({ answer });
  } catch (error) {
    console.error("Fitness schedule generation failed:", error.message);
    res.status(error.status || 500).json({
      error: error.status
        ? error.message
        : "The assistant could not generate a schedule. Please try again."
    });
  }
});

app.post("/api/fitness/chat", async (req, res) => {
  const validated = validateFitnessInput(req.body);
  if (validated.error) return res.status(400).json({ error: validated.error });

  const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-10) : [];
  const safeMessages = messages
    .filter((message) => ["user", "assistant"].includes(message?.role))
    .map((message) => ({
      role: message.role,
      content: cleanText(message.content, 1200)
    }))
    .filter((message) => message.content);

  if (!safeMessages.length || safeMessages[safeMessages.length - 1].role !== "user") {
    return res.status(400).json({
      error: "Enter a message to chat with the assistant."
    });
  }

  try {
    const context =
      `Student class schedule: ${JSON.stringify(validated.value.classes)}\n` +
      `Workout preferences: ${JSON.stringify(validated.value.preferences)}\n` +
      `Use this information when answering. Do not assume the student is free outside the classes listed.`;

    const input = [
      { role: "user", content: context },
      ...safeMessages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    ];

    const answer = await requestFitnessAI(input);
    res.json({ answer });
  } catch (error) {
    console.error("Fitness chat failed:", error.message);
    res.status(error.status || 500).json({
      error: error.status
        ? error.message
        : "The assistant could not respond. Please try again."
    });
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
    await checkIns.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: CHECKIN_WINDOW_MINUTES * 60 }
    );
    await checkIns.createIndex({ createdAt: -1 });

    app.listen(PORT, () => console.log(`UNA SRC app running on port ${PORT}`));
  } catch (error) {
    console.error("Could not start the server:", error.message);
    await client.close();
    process.exit(1);
  }
}

start();
