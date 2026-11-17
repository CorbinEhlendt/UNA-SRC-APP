
const countEl = document.querySelector("#peopleCount");
const levelEl = document.querySelector("#busyLevel");
const summaryEl = document.querySelector("#countSummary");
const updatedEl = document.querySelector("#updatedAt");
const statusEl = document.querySelector("#connectionStatus");
const messageEl = document.querySelector("#checkinMessage");
const button = document.querySelector("#checkinButton");
const meterFill = document.querySelector("#meterFill");

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

  return `Updated ${new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  })}`;
}

function updateMeter(data) {
  const count = data.activeCount ?? 0;

  countEl.textContent = count;
  levelEl.textContent = data.level;

  levelEl.className =
    `busy-level ${data.level.toLowerCase().replaceAll(" ", "-")}`;

  summaryEl.textContent = count === 1
    ? "1 person has checked in during the last hour"
    : `${count} people have checked in during the last hour`;

  const percent = Math.min(100, (count / 50) * 100);

  meterFill.style.width = `${percent}%`;

  meterFill.className =
    `meter-fill ${data.level.toLowerCase().replaceAll(" ", "-")}`;

  updatedEl.textContent = formatTime(data.lastUpdated);

  // Prevent another check-in when this browser is already counted.
  button.textContent = data.checkedIn
    ? "✓ You're already checked in"
    : "＋ I'm at the gym";

  button.classList.toggle("checked-in", Boolean(data.checkedIn));
  button.disabled = Boolean(data.checkedIn);
}

async function refreshMeter() {
  try {
    const response = await fetch("/api/busy-meter");

    if (!response.ok) {
      throw new Error("Could not load the crowd meter.");
    }

    const data = await response.json();

    updateMeter(data);
    setConnection(true);

  } catch (error) {
    setConnection(false);

    levelEl.textContent = "Unavailable";
    summaryEl.textContent =
      "The server could not be reached. Try again shortly.";

    countEl.textContent = "—";
    meterFill.style.width = "0%";
  }
}

async function checkIn() {
  if (button.disabled) return;

  button.disabled = true;
  setMessage("Adding your check-in…");

  try {
    const response = await fetch("/api/busy-meter/check-in", {
      method: "POST"
    });

    const data = await response.json();

    if (response.status === 409 && data.alreadyCheckedIn) {
      setMessage(data.error, "success");
      await refreshMeter();
      return;
    }

    if (!response.ok) {
      throw new Error(data.error || "Could not add your check-in.");
    }

    setMessage(
      "You're counted! Thanks for helping other students.",
      "success"
    );

    await refreshMeter();

  } catch (error) {
    setMessage(
      error.message || "Something went wrong. Please try again.",
      "error"
    );

  } finally {
    if (!button.classList.contains("checked-in")) {
      button.disabled = false;
    }
  }
}

function renderQRCode() {
  const qrImg = document.querySelector("#qrCodeImage");

  if (qrImg) {
    // Everyone uses the same QR URL.
    // Each browser gets its own identity through the server cookie.
    const checkInUrl =
      `${window.location.origin}/api/busy-meter/check-in`;

    qrImg.src =
      `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(checkInUrl)}`;
  }
}

renderQRCode();

button.addEventListener("click", checkIn);

refreshMeter();

setInterval(refreshMeter, 15000);
