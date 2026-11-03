
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const classRows = document.querySelector("#classRows");
const addClassButton = document.querySelector("#addClassButton");
const generateButton = document.querySelector("#generateButton");
const formMessage = document.querySelector("#formMessage");
const scheduleSection = document.querySelector("#scheduleSection");
const scheduleResult = document.querySelector("#scheduleResult");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const chatMessages = document.querySelector("#chatMessages");
const chatMessage = document.querySelector("#chatMessage");
const conversation = [];

function addClassRow() {
  const row = document.createElement("div");
  row.className = "class-row";
  const dayOptions = days.map((day) => `<option value="${day}">${day}</option>`).join("");
  row.innerHTML = `
    <label>Class name (optional)<input class="class-name" type="text" maxlength="80" placeholder="Example: CIS 350"></label>
    <label>Day<select class="class-day">${dayOptions}</select></label>
    <label>Start<input class="class-start" type="time" value="09:00" required></label>
    <label>End<input class="class-end" type="time" value="10:15" required></label>
    <button class="remove-class" type="button" aria-label="Remove this class">Remove</button>`;
  row.querySelector(".remove-class").addEventListener("click", () => row.remove());
  classRows.append(row);
}

function getFormData() {
  const classes = [...classRows.querySelectorAll(".class-row")].map((row) => ({
    name: row.querySelector(".class-name").value,
    day: row.querySelector(".class-day").value,
    start: row.querySelector(".class-start").value,
    end: row.querySelector(".class-end").value
  }));
  if (classes.some((item) => !item.start || !item.end || item.end <= item.start)) {
    throw new Error("Please enter valid class start and end times. End must be after start.");
  }
  return {
    classes,
    preferences: {
      daysPerWeek: Number(document.querySelector("#daysPerWeek").value),
      minutesPerWorkout: Number(document.querySelector("#minutesPerWorkout").value),
      preferredTime: document.querySelector("#preferredTime").value,
      experience: document.querySelector("#experience").value,
      activities: document.querySelector("#activities").value.trim()
    }
  };
}

function showMessage(element, message, type = "") {
  element.textContent = message;
  element.className = `form-message ${type}`.trim();
}

addClassButton.addEventListener("click", addClassRow);
addClassRow();

// Schedule generator
 generateButton.addEventListener("click", async () => {
  let data;
  try { data = getFormData(); }
  catch (error) { showMessage(formMessage, error.message, "error"); return; }
  generateButton.disabled = true;
  showMessage(formMessage, "Creating your schedule…");
  try {
    const response = await fetch("/api/fitness/generate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not generate a schedule.");
    scheduleResult.textContent = result.answer;
    scheduleSection.hidden = false;
    showMessage(formMessage, "Your schedule is ready. You can ask for changes in the chat below.", "success");
    scheduleSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) { showMessage(formMessage, error.message, "error"); }
  finally { generateButton.disabled = false; }
});

function addChatBubble(role, content) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role === "user" ? "user-bubble" : "assistant-bubble"}`;
  bubble.textContent = content;
  chatMessages.append(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = chatInput.value.trim();
  if (!content) return;
  let data;
  try { data = getFormData(); }
  catch (error) { showMessage(chatMessage, error.message, "error"); return; }
  conversation.push({ role: "user", content });
  addChatBubble("user", content);
  chatInput.value = "";
  const sendButton = chatForm.querySelector("button");
  sendButton.disabled = true;
  showMessage(chatMessage, "Thinking…");
  try {
    const response = await fetch("/api/fitness/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, messages: conversation.slice(-10) })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The assistant could not respond.");
    conversation.push({ role: "assistant", content: result.answer });
    addChatBubble("assistant", result.answer);
    showMessage(chatMessage, "");
  } catch (error) {
    conversation.pop();
    showMessage(chatMessage, error.message, "error");
  } finally { sendButton.disabled = false; }
});
