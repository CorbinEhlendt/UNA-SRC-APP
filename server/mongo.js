import "dotenv/config";
import express from "express";
import { MongoClient } from "mongodb";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "node:crypto";

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

// Get or create a unique anonymous ID for this browser.
// The same cookie is shared by QR check-ins and button check-ins.
function getOrCreateVisitorId(req, res) {
  const cookieName = "unaSrcVisitorId";

  const cookie = (req.headers.cookie || "")
    .split(";")
    .map(item => item.trim())
    .find(item => item.startsWith(`${cookieName}=`));

  let visitorId = cookie
    ? cookie.substring(cookieName.length + 1)
    : null;

  try {
    visitorId = visitorId ? decodeURIComponent(visitorId) : null;
  } catch {
    visitorId = null;
  }

  if (!validVisitorId(visitorId)) {
    visitorId = randomUUID();

    const secure = process.env.NODE_ENV === "production"
      ? "; Secure"
      : "";

    res.append(
      "Set-Cookie",
      `${cookieName}=${visitorId}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`
    );
  }

  return visitorId;
}

// Record a check-in only if this browser has not already
// checked in during the previous 60 minutes.
async function registerCheckIn(visitorId) {
  const now = new Date();

  const cutoff = new Date(
    now.getTime() - CHECKIN_WINDOW_MINUTES * 60 * 1000
  );

  // Check for an existing active check-in.
  const existing = await checkIns.findOne({
    visitorId,
    createdAt: { $gte: cutoff }
  });

  if (existing) {
    return true;
  }

  // If an old check-in exists, reactivate that record.
  const updated = await checkIns.updateOne(
    {
      visitorId,
      createdAt: { $lt: cutoff }
    },
    {
      $set: { createdAt: now }
    }
  );

  if (updated.matchedCount > 0) {
    return false;
  }

  // Otherwise, create a new check-in.
  try {
    await checkIns.insertOne({
      visitorId,
      createdAt: now
    });

    return false;
  } catch (error) {
    // Another request may have created this visitor's record
    // at almost exactly the same time.
    if (error.code !== 11000) {
      throw error;
    }

    const active = await checkIns.findOne({
      visitorId,
      createdAt: { $gte: cutoff }
    });

    if (active) {
      return true;
    }

    const retry = await checkIns.updateOne(
      {
        visitorId,
        createdAt: { $lt: cutoff }
      },
      {
        $set: { createdAt: now }
      }
    );

    if (retry.matchedCount > 0) {
      return false;
    }

    throw error;
  }
}

app.get("/api/busy-meter", async (req, res) => {
  try {
    const cutoff = new Date(
      Date.now() - CHECKIN_WINDOW_MINUTES * 60 * 1000
    );

    const visitorId = getOrCreateVisitorId(req, res);

    const activeCount = await checkIns.countDocuments({
      createdAt: { $gte: cutoff }
    });

    const latest = await checkIns.findOne(
      { createdAt: { $gte: cutoff } },
      {
        sort: { createdAt: -1 },
        projection: { createdAt: 1 }
      }
    );

    const ownCheckIn = await checkIns.findOne({
      visitorId,
      createdAt: { $gte: cutoff }
    });

    res.json({
      activeCount,
      level: getCrowdLevel(activeCount),
      lastUpdated: latest?.createdAt ?? null,
      checkedIn: Boolean(ownCheckIn),
      expiresAfterMinutes: CHECKIN_WINDOW_MINUTES
    });

  } catch (error) {
    console.error("Could not retrieve check-ins:", error.message);

    res.status(500).json({
      error: "Could not load the crowd meter."
    });
  }
});


app.get("/api/busy-meter/check-in", async (req, res) => {
  try {
    const visitorId = getOrCreateVisitorId(req, res);

    const alreadyCheckedIn = await registerCheckIn(visitorId);

    const heading = alreadyCheckedIn
      ? "Already Checked In!"
      : "Successfully Checked In!";

    const message = alreadyCheckedIn
      ? "You're already counted at the UNA Student Recreation Center."
      : "You've successfully checked in to the UNA Student Recreation Center.";

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>UNA SRC | QR Check-In</title>
        <link rel="stylesheet" href="/style.css">
      </head>

      <body style="display:flex; justify-content:center; align-items:center; min-height:100vh; margin:0; background-color:#f4f4f9;">

        <main style="max-width:400px; width:90%; text-align:center;">

          <section class="card" style="padding:2rem;">

            <h1 style="color:#4b2b7f;">
              ${heading}
            </h1>

            <p style="font-size:1.1rem; color:#333;">
              ${message}
            </p>

            <p style="font-size:0.9rem; color:#666; margin-top:1rem;">
              Your check-in automatically expires after 60 minutes.
            </p>

            <a href="/" class="checkin-button"
               style="display:inline-block; margin-top:1.5rem; text-decoration:none;">
              View Busy Meter
            </a>

          </section>

        </main>
      </body>
      </html>
    `);

  } catch (error) {
    console.error("Could not process QR check-in:", error.message);

    res.status(500).send(
      "Error processing check-in. Please try again."
    );
  }
});

app.post("/api/busy-meter/check-in", async (req, res) => {
  try {
    const visitorId = getOrCreateVisitorId(req, res);

    const alreadyCheckedIn = await registerCheckIn(visitorId);

    if (alreadyCheckedIn) {
      return res.status(409).json({
        success: false,
        alreadyCheckedIn: true,
        error: "You're already checked in! You cannot check in twice within 60 minutes."
      });
    }

    return res.status(201).json({
      success: true,
      alreadyCheckedIn: false
    });

  } catch (error) {
    console.error("Could not save check-in:", error.message);

    return res.status(500).json({
      error: "Could not save your check-in. Please try again."
    });
  }
});



// ---------------- UNA SRC Fitness Assistant (Gemini, free tier) ----------------
// Workout plans are generated on demand and are NOT saved in MongoDB.

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const PRIMARY_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const BACKUP_GEMINI_MODEL = process.env.GEMINI_BACKUP_MODEL || "gemini-3.6-flash";

// Each model gets at most 3 attempts. Delays are kept bounded so a request
// does not wait indefinitely when Google's service is overloaded.
const RETRY_DELAYS_MS = [2000, 5000];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatus(error) {
  const directStatus = Number(error?.status ?? error?.code);
  if (Number.isFinite(directStatus) && directStatus > 0) return directStatus;

  const message = String(error?.message ?? "");
  const match = message.match(/\b(408|429|500|502|503|504)\b/);
  return match ? Number(match[1]) : 0;
}

function isTemporaryGeminiError(error) {
  const status = getErrorStatus(error);
  const message = String(error?.message ?? "").toUpperCase();

  return (
    [408, 429, 500, 502, 503, 504].includes(status) ||
    message.includes("UNAVAILABLE") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("TOO MANY REQUESTS") ||
    message.includes("INTERNAL") ||
    message.includes("HIGH DEMAND") ||
    message.includes("OVERLOADED")
  );
}

function safeErrorMessage(error) {
  return String(error?.message ?? error ?? "Unknown Gemini error").slice(0, 1000);
}

async function generateWithModel(model, contents) {
  let lastError;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await gemini.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: FITNESS_INSTRUCTIONS,
          maxOutputTokens: 3000
        }
      });
    } catch (error) {
      lastError = error;

      // Do not retry invalid requests, authentication errors, or other
      // non-temporary failures.
      if (!isTemporaryGeminiError(error) || attempt === RETRY_DELAYS_MS.length) {
        throw error;
      }

      const delay = RETRY_DELAYS_MS[attempt];
      console.warn(
        `Gemini model ${model} returned a temporary error (attempt ${attempt + 1}/3). Retrying in ${delay / 1000}s.`
      );
      await wait(delay);
    }
  }

  throw lastError;
}

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

async function requestFitnessAI(input) {
  if (!gemini) {
    const error = new Error(
      "The Fitness Assistant is not configured yet. Add GEMINI_API_KEY to server/.env and restart the server."
    );
    error.status = 503;
    throw error;
  }

  const contents = typeof input === "string"
    ? input
    : input.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }]
      }));

  const models = [...new Set([PRIMARY_GEMINI_MODEL, BACKUP_GEMINI_MODEL])];
  let lastError;

  for (const model of models) {
    try {
      const response = await generateWithModel(model, contents);
      if (model !== PRIMARY_GEMINI_MODEL) {
        console.log(`Fitness Assistant successfully used backup model: ${model}`);
      }
      return response.text || "I couldn't create a response just now. Please try again.";
    } catch (error) {
      lastError = error;

      if (!isTemporaryGeminiError(error)) {
        throw error;
      }

      if (model !== models[models.length - 1]) {
        console.warn(
          `Gemini model ${model} remained unavailable after retries. Trying ${models[models.indexOf(model) + 1]}.`
        );
      }
    }
  }

  console.error("All configured Gemini models failed after retries.", {
    models,
    error: safeErrorMessage(lastError)
  });

  const unavailableError = new Error(
    "Google's free Gemini service is temporarily busy. Your information is okay—please wait a little and try again."
  );
  unavailableError.status = 503;
  throw unavailableError;
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
      `suggest a flexible time window based on their preferred time. Remind them this is a flexible starting point.` +
      `Make sure to include specific exercises for each recommended muscle group for each day.`;
      
      ;

    const answer = await requestFitnessAI(prompt);
    res.json({ answer });
  } catch (error) {
    console.error("Fitness schedule generation failed:", safeErrorMessage(error));
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
    console.error("Fitness chat failed:", safeErrorMessage(error));
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
