const countEl = document.querySelector("#peopleCount");
const levelEl = document.querySelector("#busyLevel");
const summaryEl = document.querySelector("#countSummary");
const updatedEl = document.querySelector("#updatedAt");
const statusEl = document.querySelector("#connectionStatus");
const messageEl = document.querySelector("#checkinMessage");
const button = document.querySelector("#checkinButton");
const meterFill = document.querySelector("#meterFill");

// Anonymous browser identifier: prevents repeated taps from counting the same
// browser as multiple people. It is not a login or verified identity.
function getVisitorId() {
  let id = localStorage.getItem("unaSrcVisitorId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("unaSrcVisitorId", id);
  }
  return id;
}

const visitorId = getVisitorId();

function setConnection(online) {
  statusEl.textContent = online ? "Live updates" : "Offline";
  statusEl.className = `status-pill ${online ? "online" : "offline"}`;
}

function setMessage(message, type = "") {
  messageEl.textContent = message;
  messageEl.className = `message ${type}`.trim();
}

function formatTime(value) {
  if (!value) return "No active check-ins yet";
  return `Updated ${new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function updateMeter(data) {
  const count = data.activeCount ?? 0;
  countEl.textContent = count;
  levelEl.textContent = data.level;
  levelEl.className = `busy-level ${data.level.toLowerCase().replaceAll(" ", "-")}`;
  summaryEl.textContent = count === 1
    ? "1 person has checked in during the last hour"
    : `${count} people have checked in during the last hour`;
  // Visual scale is capped at 50 active check-ins for this first prototype.
  // The crowd label uses the backend thresholds and can be tuned later.
  const percent = Math.min(100, (count / 50) * 100);
  meterFill.style.width = `${percent}%`;
  meterFill.className = `meter-fill ${data.level.toLowerCase().replaceAll(" ", "-")}`;
  updatedEl.textContent = formatTime(data.lastUpdated);
  button.textContent = data.checkedIn ? "✓ You're checked in" : "＋ I'm at the gym";
  button.classList.toggle("checked-in", Boolean(data.checkedIn));
}

async function refreshMeter() {
  try {
    const response = await fetch(`/api/busy-meter?visitorId=${encodeURIComponent(visitorId)}`);
    if (!response.ok) throw new Error("Could not load the crowd meter.");
    updateMeter(await response.json());
    setConnection(true);
  } catch {
    setConnection(false);
    levelEl.textContent = "Unavailable";
    summaryEl.textContent = "The server could not be reached. Try again shortly.";
    countEl.textContent = "—";
    meterFill.style.width = "0%";
  }
}

async function checkIn() {
  button.disabled = true;
  setMessage("Adding your check-in…");
  try {
    const response = await fetch("/api/busy-meter/check-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not add your check-in.");
    setMessage(data.alreadyCheckedIn
      ? "You're already counted. Your check-in has been refreshed for another hour."
      : "You're counted! Thanks for helping other students.", "success");
    await refreshMeter();
  } catch (error) {
    setMessage(error.message || "Something went wrong. Please try again.", "error");
  } finally {
    button.disabled = false;
  }
}

button.addEventListener("click", checkIn);
refreshMeter();
setInterval(refreshMeter, 15000);
