document.addEventListener("DOMContentLoaded", () => {
  const soundToggle = document.getElementById("opt-sound");
  const gridToggle = document.getElementById("opt-grid");
  const shadowToggle = document.getElementById("opt-shadows");
  const saveBtn = document.getElementById("btn-save-settings");
  const statusMsg = document.getElementById("settings-status");

  const saved = JSON.parse(
    localStorage.getItem("bw_settings") || '{"sound":true,"grid":true,"shadows":true}'
  );
  soundToggle.checked = saved.sound;
  gridToggle.checked = saved.grid;
  shadowToggle.checked = saved.shadows;

  saveBtn.addEventListener("click", () => {
    const newSettings = {
      sound: soundToggle.checked,
      grid: gridToggle.checked,
      shadows: shadowToggle.checked
    };
    localStorage.setItem("bw_settings", JSON.stringify(newSettings));
    statusMsg.textContent = "Settings saved!";
    setTimeout(() => {
      statusMsg.textContent = "";
    }, 2000);
  });
});