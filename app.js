// app.js
// Connects the dashboard UI to geofence-logic.js and the Google Map.

let map;
let launchMarker = null;
let targetMarker = null;
let corridorLine = null;
let corridorBand = null;

// Runs as soon as the page + missiles-data.js are loaded — does NOT
// depend on the Google Maps script, so the form works even if the
// map key is missing or invalid.
document.addEventListener("DOMContentLoaded", function () {
  populateMissileDropdown();
  attachEventListeners();
  loadIndiaBoundary(function (data) {
    // If the map already exists by the time this resolves, draw the boundary.
    if (map) {
      map.data.addGeoJson(data);
      map.data.setStyle({
        fillColor: "red",
        fillOpacity: 0.05,
        strokeColor: "red",
        strokeWeight: 2,
      });
    }
  });
});

// Called by the Google Maps script tag's callback=initMap.
// Only runs if the API key is valid — everything else works without it.
async function initMap() {
  const { Map } = await google.maps.importLibrary("maps");
  map = new Map(document.getElementById("map"), {
    center: { lat: 22.5937, lng: 78.9629 },
    zoom: 5,
    mapTypeId: "roadmap",
    mapId: "DEMO_MAP_ID",
  });

  if (indiaGeoJSON) {
    map.data.addGeoJson(indiaGeoJSON);
    map.data.setStyle({
      fillColor: "red",
      fillOpacity: 0.05,
      strokeColor: "red",
      strokeWeight: 2,
    });
  }
}

// Fill the "Select Missile" dropdown from missiles-data.js
function populateMissileDropdown() {
  const select = document.getElementById("missileSelect");
  missileDatabase.forEach(function (missile) {
    const option = document.createElement("option");
    option.value = missile.id;
    option.textContent = missile.name;
    select.appendChild(option);
  });
}

function attachEventListeners() {
  document.getElementById("missileSelect").addEventListener("change", onMissileChange);
  document.getElementById("analyzeBtn").addEventListener("click", onAnalyzeClick);

  ["launchLat", "launchLon"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", function () {
      updateInfoBar("launch");
      updateMarker("launch");
    });
  });
  ["targetLat", "targetLon"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", function () {
      updateInfoBar("target");
      updateMarker("target");
    });
  });
}

// When a missile is selected, auto-fill its configured range
function onMissileChange() {
  const select = document.getElementById("missileSelect");
  const missile = missileDatabase.find(function (m) {
    return m.id === select.value;
  });
  const rangeInput = document.getElementById("configuredRange");
  rangeInput.value = missile ? missile.rangeKm + " km" : "";
}


// ---------- Info bar above the map (launch / target points) ----------
const geocodeTimers = { launch: null, target: null };
const geocodeTokens = { launch: 0, target: 0 };

function updateInfoBar(type) {
  const latStr = document.getElementById(type + "Lat").value;
  const lonStr = document.getElementById(type + "Lon").value;
  const nameEl = document.getElementById(type + "InfoName");
  const coordsEl = document.getElementById(type + "InfoCoords");
  const statusEl = document.getElementById(type + "InfoStatus");

  // inside/outside is only known after ANALYZE, so reset it when inputs change
  statusEl.textContent = "—";
  statusEl.className = "pill pill-neutral";

  const lat = Number(latStr), lon = Number(lonStr);
  const valid = latStr !== "" && lonStr !== "" && !isNaN(lat) && !isNaN(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;

  clearTimeout(geocodeTimers[type]);
  geocodeTokens[type]++;

  if (!valid) {
    nameEl.textContent = "Not entered";
    nameEl.className = "info-name empty";
    coordsEl.textContent = "";
    return;
  }

  coordsEl.textContent = lat.toFixed(4) + "°, " + lon.toFixed(4) + "°";
  nameEl.textContent = "Finding place name…";
  nameEl.className = "info-name empty";

  // wait until the user stops typing, then look up the place name
  const token = geocodeTokens[type];
  geocodeTimers[type] = setTimeout(function () {
    getPlaceName(lat, lon).then(function (name) {
      if (token !== geocodeTokens[type]) return; // inputs changed meanwhile
      nameEl.textContent = name;
      nameEl.className = "info-name" + (name === "Unnamed location" ? " empty" : "");
    });
  }, 700);
}

function setInfoStatus(type, inside) {
  const el = document.getElementById(type + "InfoStatus");
  el.textContent = inside ? "INSIDE INDIA" : "OUTSIDE INDIA";
  el.className = "pill " + (inside ? "pill-testing" : "pill-active");
}

// ---------- Place names (reverse geocoding) ----------
// 1st choice: Google Geocoder (same key as the map; needs the Geocoding API enabled)
// 2nd choice: OpenStreetMap Nominatim (no key needed)
// Last resort: "Unnamed location" (e.g. open sea)
function getPlaceName(lat, lon) {
  return googleReverseGeocode(lat, lon)
    .catch(function () { return osmReverseGeocode(lat, lon); })
    .catch(function () { return "Unnamed location"; });
}

function googleReverseGeocode(lat, lon) {
  return new Promise(function (resolve, reject) {
    if (!window.google || !google.maps || !google.maps.Geocoder) { reject(); return; }
    new google.maps.Geocoder().geocode({ location: { lat: lat, lng: lon } }, function (results, status) {
      if (status !== "OK" || !results || !results.length) { reject(); return; }
      const comps = results[0].address_components || [];
      const pick = function (type) {
        const c = comps.find(function (x) { return x.types.indexOf(type) !== -1; });
        return c ? c.long_name : null;
      };
      const parts = [
        pick("locality") || pick("sublocality") || pick("administrative_area_level_3") || pick("administrative_area_level_2"),
        pick("administrative_area_level_1"),
        pick("country"),
      ].filter(Boolean);
      // remove duplicates (e.g. "Delhi, Delhi")
      const unique = parts.filter(function (p, i) { return parts.indexOf(p) === i; });
      resolve(unique.length ? unique.join(", ") : results[0].formatted_address);
    });
  });
}

function osmReverseGeocode(lat, lon) {
  const url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=en&lat=" +
    lat + "&lon=" + lon;
  return fetch(url)
    .then(function (r) { if (!r.ok) throw new Error("osm"); return r.json(); })
    .then(function (d) {
      if (!d || d.error) throw new Error("none");
      const a = d.address || {};
      const parts = [
        a.city || a.town || a.village || a.county || a.state_district,
        a.state,
        a.country,
      ].filter(Boolean);
      const unique = parts.filter(function (p, i) { return parts.indexOf(p) === i; });
      if (!unique.length) throw new Error("none");
      return unique.join(", ");
    });
}

function setPill(id, text, cls) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = "pill " + cls;
}

function updateMarker(type) {
  if (!map) return; // map not loaded (invalid/missing API key) — skip marker drawing
  const lat = Number(document.getElementById(type + "Lat").value);
  const lon = Number(document.getElementById(type + "Lon").value);
  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

  const position = { lat: lat, lng: lon };
  const title = type === "launch" ? "Launch Point" : "Target Point";

  if (type === "launch") {
    if (launchMarker) launchMarker.setMap(null);
    launchMarker = new google.maps.Marker({
      position: position, map: map, title: title,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: "#2563c9", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
    });
  } else {
    if (targetMarker) targetMarker.setMap(null);
    targetMarker = new google.maps.Marker({
      position: position, map: map, title: title,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: "#d1451f", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
    });
  }

  // If both points are set, fit both in view instead of zooming to just one
  if (launchMarker && targetMarker) {
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(launchMarker.getPosition());
    bounds.extend(targetMarker.getPosition());
    map.fitBounds(bounds, 60);
  } else {
    map.setCenter(position);
    map.setZoom(6);
  }
}

function onAnalyzeClick() {
  const launchLat = Number(document.getElementById("launchLat").value);
  const launchLon = Number(document.getElementById("launchLon").value);
  const targetLat = Number(document.getElementById("targetLat").value);
  const targetLon = Number(document.getElementById("targetLon").value);

  const select = document.getElementById("missileSelect");
  const missile = missileDatabase.find(function (m) {
    return m.id === select.value;
  });

  if (isNaN(launchLat) || isNaN(launchLon) || isNaN(targetLat) || isNaN(targetLon)) {
    alert("Please enter valid coordinates for both points.");
    return;
  }
  if (!missile) {
    alert("Please select a missile.");
    return;
  }

  // 1. Distance
  const distanceKm = calculateDistanceKm(launchLat, launchLon, targetLat, targetLon);
  document.getElementById("calcDistance").textContent = distanceKm.toFixed(1) + " km";
  document.getElementById("configRangeStat").textContent = missile.rangeKm + " km";

  // 2. India boundary data must be loaded
  if (!indiaGeoJSON) {
    alert("India boundary data is still loading (or india.geojson wasn't found). Try again in a moment.");
    return;
  }

  // 3. Is each point inside or outside India?
  const launchInside = checkPoint(launchLat, launchLon);
  const targetInside = checkPoint(targetLat, targetLon);
  setInfoStatus("launch", launchInside);
  setInfoStatus("target", targetInside);

  const corridorWidthKm = Number(document.getElementById("corridorWidth").value) || 50;
  const corridor = checkCorridorPath(launchLat, launchLon, targetLat, targetLon, corridorWidthKm, 10);

  // 4. Inside/outside rule (see GEOFENCE_CONDITIONS in geofence-logic.js)
  const condition = classifyGeofenceCondition(launchInside, targetInside, corridor.entries);

  // 5. Range check + final decision: BOTH must be valid
  const auth = checkLaunchAuthorization(condition, distanceKm, missile.rangeKm);

  setPill("rangeCheckStatus",
    auth.rangeOk ? "WITHIN RANGE" : "EXCEEDS RANGE",
    auth.rangeOk ? "pill-active" : "pill-maintenance");

  // 6. Draw the corridor path on the map, colored by status
  drawCorridorLine(launchLat, launchLon, targetLat, targetLon, corridor.status, auth.authorized, corridorWidthKm);

  // 6b. Zoom/pan the map so both points and the corridor are visible together
  if (map) {
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: launchLat, lng: launchLon });
    bounds.extend({ lat: targetLat, lng: targetLon });
    map.fitBounds(bounds, 60); // 60px padding so markers aren't clipped at the edges
  }

  // 7. Final decision banner
  const banner = document.getElementById("resultBanner");
  banner.className = "banner " + (auth.authorized ? "banner-ok" : "banner-bad");
  banner.querySelector(".banner-title").textContent =
    auth.authorized ? "YES — THE MISSILE CAN BE LAUNCHED" : "NO — THE MISSILE CANNOT BE LAUNCHED";
  banner.querySelector(".banner-text").textContent =
    auth.reason + " (" + missile.name + ": distance " + distanceKm.toFixed(1) +
    " km, range " + missile.rangeKm + " km.)";
}

// Draws the LP→TP safety corridor on the map as a real geographic buffer
// polygon (50km half-width either side of the path), plus a bold center
// line. Color reflects the corridor safety status; a dashed center line
// means the path is not authorized for launch even if the corridor
// reading itself looks fine (e.g. target is inside India).
const CORRIDOR_BUFFER_KM = 50; // fallback default if not passed in

function drawCorridorLine(lat1, lon1, lat2, lon2, corridorStatus, authorized, bufferKm) {
  if (!map) return; // map not loaded — skip drawing, text stats still work
  bufferKm = bufferKm || CORRIDOR_BUFFER_KM;

  if (corridorLine) corridorLine.setMap(null);
  if (corridorBand) corridorBand.setMap(null);

  let strokeColor;
  if (!authorized) {
    strokeColor = "#d1451f"; // red — launch blocked, regardless of corridor reading
  } else if (corridorStatus === "safe") {
    strokeColor = "#1a9c5a"; // green — safe corridor, authorized
  } else if (corridorStatus === "near-boundary") {
    strokeColor = "#b8860b"; // amber — authorized but close to the border
  } else {
    strokeColor = "#2563c9"; // blue — crosses the border
  }

  // Real geographic buffer polygon — actual 50km half-width, scales
  // correctly as you zoom in/out (unlike a fixed-pixel line width).
  const polygonPath = buildCorridorPolygon(lat1, lon1, lat2, lon2, bufferKm);
  corridorBand = new google.maps.Polygon({
    paths: polygonPath,
    strokeColor: strokeColor,
    strokeOpacity: 0.7,
    strokeWeight: 1.5,
    fillColor: strokeColor,
    fillOpacity: 0.25,
    map: map,
  });

  // Bold center line — the actual LP→TP path
  corridorLine = new google.maps.Polyline({
    path: [
      { lat: lat1, lng: lon1 },
      { lat: lat2, lng: lon2 },
    ],
    geodesic: true,
    strokeColor: strokeColor,
    strokeOpacity: authorized ? 1 : 0.9,
    strokeWeight: 4,
    icons: authorized ? [] : [{
      icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 4 },
      offset: "0",
      repeat: "14px",
    }],
    map: map,
    zIndex: 10,
  });
}