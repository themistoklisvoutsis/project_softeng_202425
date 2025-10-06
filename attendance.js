// attendance.js — ίδια λογική με το δικό σου, αλλά μέσω window.api (api.js)

// ===== Helpers =====
const qs = (s) => document.querySelector(s);
const pad2 = (n) => String(n).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const fmt = (d) => new Date(d).toLocaleDateString("el-GR");
function setStatus(kind, text) {
  const dot = qs("#connDot"),
    txt = qs("#connText");
  if (!dot || !txt) return;
  dot.classList.remove("ok", "err");
  if (kind === "ok") dot.classList.add("ok");
  if (kind === "err") dot.classList.add("err");
  if (text) txt.textContent = text;
}
function toast(msg, kind = "ok") {
  const box = document.createElement("div");
  box.className = `toast ${kind}`;
  box.textContent = msg;
  (qs("#toasts") || document.body).appendChild(box);
  setTimeout(() => box.remove(), 2500);
}

// ===== Ping (μέσω api.js) =====
(async () => {
  try {
    await api("ping");
    setStatus("ok", "Συνδεδεμένο");
  } catch (e) {
    setStatus("err", "Μη συνδεδεμένο");
    console.error(e);
  }
})();

const filterDate = qs("#filterDate"),
  todayList = qs("#todayList");
if (filterDate) filterDate.value = todayISO();
const attDateEl = qs("#attDate");
if (attDateEl) attDateEl.value = todayISO();

// ===== Load attendance =====
async function loadAttendance(dateISO) {
  if (!todayList) return;
  todayList.textContent = "Φόρτωση…";
  try {
    const rows = await api("list_attendance", { params: { date: dateISO } });
    if (!rows?.length) {
      todayList.textContent = "— Καμία παρουσία —";
      return;
    }
    const total = rows.filter((r) => r.present).length;
    todayList.innerHTML = `
      <div class="muted" style="margin-bottom:8px">Σύνολο: <strong>${total}</strong></div>
      <table>
        <thead><tr><th>Μέλος</th><th>Ημ/νία</th><th>Σχόλιο</th><th></th></tr></thead>
        <tbody>
        ${rows
          .map((r) => {
            const name = r.members
              ? `${r.members.first_name} ${r.members.last_name}`
              : `#${r.member_id ?? "—"}`;
            const mid = r.members?.id ?? r.member_id ?? "—";
            return `
            <tr data-id="${r.id}" data-present="${r.present ? 1 : 0}">
              <td><span class="kbd">#${mid}</span> ${name}</td>
              <td>${fmt(r.attended_on)} ${r.present ? "✔️" : "✖️"}</td>
              <td>${r.note || ""}</td>
              <td style="text-align:right">
                <button class="btn small ghost btn-edit">✎</button>
                <button class="btn small ghost btn-toggle">↔︎</button>
              </td>
            </tr>`;
          })
          .join("")}
        </tbody>
      </table>`;

    // edit note
    todayList.querySelectorAll(".btn-edit").forEach(
      (btn) =>
        (btn.onclick = async (e) => {
          const tr = e.currentTarget.closest("tr");
          const id = Number(tr.dataset.id);
          const current = tr.children[2].textContent;
          const note = prompt("Σχόλιο:", current);
          if (note === null) return;
          try {
            await api("update_attendance_note", {
              method: "POST",
              body: { id, note },
            });
            toast("✅ Ενημερώθηκε");
            loadAttendance(filterDate.value);
          } catch (err) {
            toast("❌ " + (err.message || err), "err");
          }
        })
    );

    // toggle present
    todayList.querySelectorAll(".btn-toggle").forEach(
      (btn) =>
        (btn.onclick = async (e) => {
          const tr = e.currentTarget.closest("tr");
          const id = Number(tr.dataset.id);
          const present = tr.dataset.present === "1";
          try {
            await api("toggle_attendance", {
              method: "POST",
              body: { id, present },
            });
            toast("🔁 Άλλαξε");
            loadAttendance(filterDate.value);
          } catch (err) {
            toast("❌ " + (err.message || err), "err");
          }
        })
    );
  } catch (error) {
    todayList.textContent = "❌ " + (error.message || error);
  }
}

// ===== Add attendance =====
const form = qs("#markAttendanceForm");
if (form) {
  form.onsubmit = async (e) => {
    e.preventDefault();
    const member_id = Number(qs("#memberId").value);
    const attended_on = (qs("#attDate").value || todayISO()).slice(0, 10);
    const note = qs("#note").value || null;
    const msg = qs("#markMsg");
    if (msg) msg.textContent = "Καταχώριση…";
    if (!member_id) {
      if (msg) msg.textContent = "❌ Δώσε member id.";
      return;
    }
    try {
      await api("upsert_attendance", {
        method: "POST",
        body: { member_id, attended_on, note },
      });
      if (msg) msg.textContent = "✅ Έγινε";
      loadAttendance(filterDate.value);
      qs("#memberId").value = "";
      qs("#note").value = "";
    } catch (error) {
      if (msg) msg.textContent = "❌ " + (error.message || error);
    }
  };
}

// ===== Toolbar actions =====
const btnFilterDate = qs("#btnFilterDate");
if (btnFilterDate) btnFilterDate.onclick = () => loadAttendance(filterDate.value);

const btnToday = qs("#btnToday");
if (btnToday)
  btnToday.onclick = () => {
    filterDate.value = todayISO();
    loadAttendance(filterDate.value);
  };

const prevDate = qs("#prevDate");
if (prevDate)
  prevDate.onclick = () => {
    const d = new Date(filterDate.value);
    d.setDate(d.getDate() - 1);
    filterDate.value = d.toISOString().slice(0, 10);
    loadAttendance(filterDate.value);
  };

const nextDate = qs("#nextDate");
if (nextDate)
  nextDate.onclick = () => {
    const d = new Date(filterDate.value);
    d.setDate(d.getDate() + 1);
    filterDate.value = d.toISOString().slice(0, 10);
    loadAttendance(filterDate.value);
  };

// init
if (filterDate) loadAttendance(filterDate.value);
