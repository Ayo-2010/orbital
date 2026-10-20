(function () {
  "use strict";

  var STORE_KEY = "orbital.v1";
  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var R_EARTH = 6371;
  var MU = 398600.4418;

  var seedObjects = [
    { id: "obj-iss", name: "ISS / ZARYA", alt: 408, inc: 51.6 },
    { id: "obj-hst", name: "HUBBLE SPACE TELESCOPE", alt: 540, inc: 28.5 },
    { id: "obj-nav", name: "NAVSTAR GPS BII", alt: 20180, inc: 55.0 },
    { id: "obj-goes", name: "GOES-16", alt: 35790, inc: 0.1 }
  ];

  var state = loadState();
  var satAngle = -0.9;
  var currentRx = 150;
  var currentRy = 60;
  var rafId = 0;
  var lastFrame = 0;
  var saveTimer = 0;
  var announceTimer = 0;
  var launchStart = nextLaunchWindow(Date.now());
  var launchEnd = new Date(launchStart.getTime() + 14 * 60000);
  var wasWindowOpen = false;

  var altitude = $("altitude");
  var inclination = $("inclination");
  var altOut = $("altOut");
  var incOut = $("incOut");
  var objectList = $("objectList");
  var rosterCount = $("rosterCount");
  var passRows = $("passRows");
  var passCaption = $("passCaption");
  var plotName = $("plotName");
  var plotMeta = $("plotMeta");
  var orbitPath = $("orbitPath");
  var orbitGhost = $("orbitGhost");
  var orbitLead = $("orbitLead");
  var planeGroup = $("planeGroup");
  var dimLine = $("dimLine");
  var dimTick = $("dimTick");
  var dimLabel = $("dimLabel");
  var satGroup = $("satGroup");
  var satGlyph = $("satGlyph");
  var calAlt = $("calAlt");
  var calInc = $("calInc");
  var calPeriod = $("calPeriod");
  var calVel = $("calVel");
  var planeAnnotation = $("planeAnnotation");
  var svgDesc = $("svgDesc");
  var countdown = $("countdown");
  var windowGo = $("windowGo");
  var windowLabel = $("windowLabel");
  var windowDate = $("windowDate");
  var windowWhen = $("windowWhen");
  var winCard = document.querySelector(".window-card");
  var addForm = $("addForm");
  var newName = $("newName");
  var newAlt = $("newAlt");
  var newInc = $("newInc");
  var formError = $("formError");
  var live = $("live");

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function makeId() {
    return "obj-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
  }

  function normaliseObject(raw) {
    if (!raw || typeof raw !== "object") return null;
    var name = typeof raw.name === "string" ? raw.name.trim().slice(0, 26) : "";
    var alt = Number(raw.alt);
    var inc = Number(raw.inc);
    if (!name || !Number.isFinite(alt) || !Number.isFinite(inc)) return null;
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : makeId(),
      name: name,
      alt: clamp(alt, 160, 40000),
      inc: clamp(inc, 0, 180)
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.objects)) {
          var objects = parsed.objects.map(normaliseObject).filter(Boolean);
          var selectedId = null;
          if (objects.some(function (item) { return item.id === parsed.selectedId; })) {
            selectedId = parsed.selectedId;
          } else if (objects.length) {
            selectedId = objects[0].id;
          }
          var draftRaw = parsed.draft && typeof parsed.draft === "object" ? parsed.draft : {};
          return {
            objects: objects,
            selectedId: selectedId,
            draft: {
              name: "UNFILED DRAFT",
              alt: clamp(Number(draftRaw.alt) || 815, 160, 40000),
              inc: clamp(Number(draftRaw.inc) || 45, 0, 180)
            }
          };
        }
      }
    } catch (error) {
      return defaultState();
    }
    return defaultState();
  }

  function defaultState() {
    return {
      objects: seedObjects.map(function (item) { return Object.assign({}, item); }),
      selectedId: seedObjects[0].id,
      draft: { name: "UNFILED DRAFT", alt: 815, inc: 45 }
    };
  }

  function saveNow() {
    window.clearTimeout(saveTimer);
    saveTimer = 0;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        objects: state.objects,
        selectedId: state.selectedId,
        draft: { alt: state.draft.alt, inc: state.draft.inc }
      }));
    } catch (error) {
      return;
    }
  }

  function queueSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 180);
  }

  function announce(message) {
    window.clearTimeout(announceTimer);
    live.textContent = message;
    announceTimer = window.setTimeout(function () {
      live.textContent = "";
    }, 5000);
  }

  function getSelected() {
    return state.objects.find(function (item) { return item.id === state.selectedId; }) || null;
  }

  function active() {
    return getSelected() || state.draft;
  }

  function classify(alt) {
    if (alt < 2000) return "LEO";
    if (alt < 30000) return "MEO";
    if (alt < 40000) return "GEO";
    return "HEO";
  }

  function stats(alt, inc) {
    var a = R_EARTH + alt;
    var period = 2 * Math.PI * Math.sqrt(Math.pow(a, 3) / MU);
    var velocity = Math.sqrt(MU / a);
    var orbits = 86400 / period;
    var footprint = 2 * Math.acos(Math.min(1, R_EARTH / a)) * (180 / Math.PI);
    return { a: a, period: period, velocity: velocity, orbits: orbits, footprint: footprint, inc: inc };
  }

  function fmtHMS(totalSeconds) {
    var secs = Math.max(0, Math.round(totalSeconds));
    var hours = Math.floor(secs / 3600);
    var minutes = Math.floor((secs % 3600) / 60);
    var seconds = secs % 60;
    return pad(hours) + ":" + pad(minutes) + ":" + pad(seconds);
  }

  function fmtNumber(value) {
    return Math.round(value).toLocaleString("en-US");
  }

  function fmtTime(date) {
    return pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
  }

  function activeName() {
    return active().name;
  }

  function renderHead() {
    var item = active();
    plotName.textContent = activeName();
    plotMeta.textContent = fmtNumber(item.alt) + " KM · θ " + item.inc.toFixed(1) + "°";
    passCaption.textContent = "NEXT SIX CONTACTS · " + classify(item.alt);
    svgDesc.textContent = "Circular orbit at " + fmtNumber(item.alt) + " kilometres altitude and " + item.inc.toFixed(1) + " degrees inclination around Earth. The ellipse rotates with inclination and grows with altitude.";
    planeAnnotation.textContent = "PLANE θ " + item.inc.toFixed(1) + "° / EQUATOR" + (item.inc > 90 ? " · RETROGRADE" : "");
  }

  function renderStats() {
    var item = active();
    var s = stats(item.alt, item.inc);
    altOut.textContent = fmtNumber(item.alt);
    incOut.textContent = item.inc.toFixed(1);
    $("periodOut").textContent = fmtHMS(s.period);
    $("velocityOut").textContent = s.velocity.toFixed(3) + " km/s";
    $("smaOut").textContent = fmtNumber(s.a) + " km";
    $("orbitsOut").textContent = s.orbits.toFixed(2);
    $("footprintOut").textContent = s.footprint.toFixed(1) + "°";
    calAlt.textContent = fmtNumber(item.alt) + " KM";
    calInc.textContent = "θ " + item.inc.toFixed(1) + "°";
    calPeriod.textContent = (s.period / 60).toFixed(1) + " MIN";
    calVel.textContent = s.velocity.toFixed(2) + " KM/S";
  }

  function drawOrbit() {
    var item = active();
    var t = clamp((item.alt - 160) / (40000 - 160), 0, 1);
    var radius = 76 + Math.sqrt(t) * 76;
    currentRx = radius * 1.5;
    currentRy = radius * 0.62;
    orbitPath.setAttribute("rx", currentRx.toFixed(1));
    orbitPath.setAttribute("ry", currentRy.toFixed(1));
    orbitGhost.setAttribute("rx", (currentRx + 8).toFixed(1));
    orbitGhost.setAttribute("ry", (currentRy + 5).toFixed(1));
    planeGroup.setAttribute("transform", "rotate(" + (-item.inc).toFixed(1) + " 450 285)");
    var edge = 450 + currentRx;
    dimLine.setAttribute("x2", edge.toFixed(1));
    dimTick.setAttribute("x1", edge.toFixed(1));
    dimTick.setAttribute("x2", edge.toFixed(1));
    var labelX = 450 + currentRx * 0.56;
    dimLabel.setAttribute("x", labelX.toFixed(1));
    dimLabel.setAttribute("transform", "rotate(" + item.inc.toFixed(1) + " " + labelX.toFixed(1) + " 277)");
    dimLabel.textContent = "R " + fmtNumber(R_EARTH + item.alt) + " KM";
    updateSatellite();
  }

  function updateSatellite() {
    var item = active();
    var x = 450 + currentRx * Math.cos(satAngle);
    var y = 285 + currentRy * Math.sin(satAngle);
    satGroup.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ")");
    satGlyph.setAttribute("transform", "rotate(" + item.inc.toFixed(1) + ")");
    var tail = satAngle - 0.72;
    var x1 = 450 + currentRx * Math.cos(tail);
    var y1 = 285 + currentRy * Math.sin(tail);
    orbitLead.setAttribute("d", "M " + x1.toFixed(1) + " " + y1.toFixed(1) +
      " A " + currentRx.toFixed(1) + " " + currentRy.toFixed(1) + " 0 0 1 " + x.toFixed(1) + " " + y.toFixed(1));
  }

  function frame(timestamp) {
    if (!lastFrame) lastFrame = timestamp;
    var delta = Math.min(90, timestamp - lastFrame);
    lastFrame = timestamp;
    var alt = active().alt;
    var speed = 0.3 + 0.34 * (1 - clamp(alt / 40000, 0, 1));
    satAngle = (satAngle + speed * (delta / 1000)) % (Math.PI * 2);
    updateSatellite();
    rafId = window.requestAnimationFrame(frame);
  }

  function applyMotionPreference() {
    if (reduceMotion.matches) {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      updateSatellite();
      return;
    }
    if (!rafId) {
      lastFrame = 0;
      rafId = window.requestAnimationFrame(frame);
    }
  }

  function renderRoster() {
    objectList.innerHTML = "";
    rosterCount.textContent = pad(state.objects.length);
    if (!state.objects.length) {
      var empty = document.createElement("li");
      empty.className = "roster-empty";
      empty.textContent = "No objects on file. Use the sliders as an unfiled draft, or enter a designation in the new track form.";
      objectList.appendChild(empty);
      return;
    }
    state.objects.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "object-row" + (item.id === state.selectedId ? " is-selected" : "");

      var select = document.createElement("button");
      select.type = "button";
      select.className = "obj-select";
      select.dataset.action = "select";
      select.dataset.id = item.id;
      select.setAttribute("aria-pressed", item.id === state.selectedId ? "true" : "false");
      select.setAttribute("aria-label", "Load solution for " + item.name + ", altitude " + fmtNumber(item.alt) + " kilometres, inclination " + item.inc.toFixed(1) + " degrees");

      var name = document.createElement("span");
      name.className = "obj-name";
      name.textContent = item.name;
      var kind = document.createElement("span");
      kind.className = "obj-kind";
      kind.textContent = classify(item.alt) + " · " + stats(item.alt, item.inc).orbits.toFixed(1) + " orbits/day";
      select.append(name, kind);

      var figAlt = document.createElement("div");
      figAlt.className = "obj-fig";
      var altLabel = document.createElement("span");
      altLabel.textContent = "ALT KM";
      figAlt.append(altLabel, document.createTextNode(fmtNumber(item.alt)));

      var figInc = document.createElement("div");
      figInc.className = "obj-fig";
      var incLabel = document.createElement("span");
      incLabel.textContent = "INC DEG";
      figInc.append(incLabel, document.createTextNode(item.inc.toFixed(1)));

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "obj-remove";
      remove.dataset.action = "remove";
      remove.dataset.id = item.id;
      remove.setAttribute("aria-label", "Remove " + item.name + " from tracked objects");
      remove.textContent = "×";

      li.append(select, figAlt, figInc, remove);
      objectList.appendChild(li);
    });
  }

  function buildPasses(item, s) {
    var now = Date.now();
    var interval = s.period * 1000 * 1.7;
    var offset = 7 * 60000 + Math.abs(Math.sin(item.alt * 0.017)) * 5 * 60000;
    var duration = 240 + (item.alt / 40000) * 720 + Math.abs(Math.sin(item.inc + 1)) * 90;
    var maxEl = clamp(Math.round(90 - Math.abs(item.inc - 41.2) * 0.78), 9, 89);
    var passes = [];
    for (var i = 0; i < 6; i += 1) {
      var aos = new Date(now + offset + i * interval);
      var los = new Date(aos.getTime() + duration * 1000);
      passes.push({
        aos: aos,
        los: los,
        duration: Math.round(duration),
        elevation: maxEl
      });
    }
    return passes;
  }

  function renderPasses() {
    var item = active();
    var s = stats(item.alt, item.inc);
    var passes = buildPasses(item, s);
    passRows.innerHTML = "";
    passes.forEach(function (pass, index) {
      var tr = document.createElement("tr");
      if (index === 0) tr.className = "is-next";

      var no = document.createElement("td");
      no.className = "pass-no";
      no.textContent = "P-" + pad(index + 1);

      var date = document.createElement("td");
      date.className = "pass-date";
      date.textContent = pass.aos.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();

      var aos = document.createElement("td");
      aos.textContent = fmtTime(pass.aos);

      var los = document.createElement("td");
      los.textContent = fmtTime(pass.los);

      var el = document.createElement("td");
      el.className = "opt";
      el.textContent = pass.elevation + "°";

      var dur = document.createElement("td");
      dur.className = "opt";
      dur.textContent = Math.floor(pass.duration / 60) + "m " + pad(pass.duration % 60) + "s";

      tr.append(no, date, aos, los, el, dur);
      passRows.appendChild(tr);
    });
  }

  function renderAll() {
    renderHead();
    renderStats();
    drawOrbit();
    renderRoster();
    renderPasses();
  }

  function syncControls() {
    var item = active();
    altitude.value = String(Math.round(item.alt));
    inclination.value = String(item.inc);
    altOut.textContent = fmtNumber(item.alt);
    incOut.textContent = item.inc.toFixed(1);
  }

  function updateActive(field, value) {
    var item = getSelected();
    if (!item) item = state.draft;
    if (field === "alt") {
      item.alt = clamp(value, 160, 40000);
    } else {
      item.inc = clamp(value, 0, 180);
    }
    if (!getSelected()) state.draft = item;
  }

  function selectObject(id) {
    if (id === state.selectedId) return;
    if (!state.objects.some(function (item) { return item.id === id; })) return;
    state.selectedId = id;
    syncControls();
    renderAll();
    saveNow();
    announce("Loaded " + activeName() + ".");
  }

  function removeObject(id) {
    var index = state.objects.findIndex(function (item) { return item.id === id; });
    if (index < 0) return;
    var removed = state.objects[index];
    state.objects.splice(index, 1);
    if (state.selectedId === id) {
      state.selectedId = state.objects.length ? state.objects[0].id : null;
      state.draft.alt = removed.alt;
      state.draft.inc = removed.inc;
    }
    syncControls();
    renderAll();
    saveNow();
    announce(removed.name + " removed. " + (state.objects.length ? activeName() + " loaded." : "No objects remain on file."));
  }

  function nextLaunchWindow(from) {
    var base = new Date(from);
    for (var add = 0; add < 10; add += 1) {
      var candidate = new Date(base.getTime());
      candidate.setHours(base.getHours() + add, 17, 0, 0);
      if (candidate.getHours() % 2 === 0 && candidate.getTime() > from + 1500) {
        return candidate;
      }
    }
    return new Date(from + 2 * 3600000);
  }

  function resetWindow() {
    launchStart = nextLaunchWindow(Date.now());
    launchEnd = new Date(launchStart.getTime() + 14 * 60000);
  }

  function tickClock() {
    var now = new Date();
    $("clock").textContent = now.toISOString().slice(11, 19);
    if (Date.now() >= launchEnd) resetWindow();
    var isOpen = Date.now() >= launchStart.getTime();
    var remaining = isOpen ? launchEnd - Date.now() : launchStart.getTime() - Date.now();
    countdown.textContent = fmtHMS(Math.ceil(Math.max(0, remaining) / 1000));
    windowGo.textContent = isOpen ? "GO" : "T−";
    windowLabel.textContent = isOpen ? "WINDOW OPEN · CLOSES IN" : "TO WINDOW OPEN";
    windowDate.textContent = launchStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
    windowWhen.textContent = launchStart.toISOString().slice(11, 16) + "–" + launchEnd.toISOString().slice(11, 16) + " Z · 14 MIN";
    winCard.classList.toggle("is-open", isOpen);
    if (isOpen !== wasWindowOpen) {
      announce(isOpen ? "Launch window is open for fourteen minutes." : "Launch window closed. Next target scheduled.");
      wasWindowOpen = isOpen;
    }
  }

  altitude.addEventListener("input", function () {
    updateActive("alt", Number(altitude.value));
    renderHead();
    renderStats();
    drawOrbit();
    renderRoster();
    renderPasses();
    queueSave();
  });

  inclination.addEventListener("input", function () {
    updateActive("inc", Number(inclination.value));
    renderHead();
    renderStats();
    drawOrbit();
    renderRoster();
    renderPasses();
    queueSave();
  });

  objectList.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "select") selectObject(button.dataset.id);
    if (button.dataset.action === "remove") removeObject(button.dataset.id);
  });

  addForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var name = newName.value.trim().replace(/\s+/g, " ");
    var alt = Number(newAlt.value);
    var inc = Number(newInc.value);
    var problem = "";
    if (!name) {
      problem = "Enter an object designation.";
    } else if (!Number.isFinite(alt) || alt < 160 || alt > 40000) {
      problem = "Altitude must fall between 160 and 40 000 km.";
    } else if (!Number.isFinite(inc) || inc < 0 || inc > 180) {
      problem = "Inclination must fall between 0 and 180 degrees.";
    }
    if (problem) {
      formError.textContent = problem;
      formError.hidden = false;
      announce(problem);
      return;
    }
    formError.hidden = true;
    var item = { id: makeId(), name: name.slice(0, 26), alt: alt, inc: inc };
    state.objects.unshift(item);
    state.selectedId = item.id;
    newName.value = "";
    syncControls();
    renderAll();
    saveNow();
    announce(item.name + " filed at " + fmtNumber(item.alt) + " kilometres and " + item.inc.toFixed(1) + " degrees inclination.");
    newName.focus();
  });

  $("resync").addEventListener("click", function () {
    resetWindow();
    wasWindowOpen = null;
    tickClock();
    announce("Launch window target re-synced to the next opening.");
  });

  if (typeof reduceMotion.addEventListener === "function") {
    reduceMotion.addEventListener("change", applyMotionPreference);
  } else if (typeof reduceMotion.addListener === "function") {
    reduceMotion.addListener(applyMotionPreference);
  }

  syncControls();
  renderAll();
  tickClock();
  wasWindowOpen = Date.now() >= launchStart.getTime();
  applyMotionPreference();
  saveNow();
  window.setInterval(tickClock, 1000);
  window.setInterval(renderPasses, 60000);
  window.addEventListener("beforeunload", saveNow);
})();
