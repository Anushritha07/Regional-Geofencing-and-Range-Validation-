// geofence-logic.js
// Pure geofencing calculations — no DOM, no map dependency.

let indiaGeoJSON = null;

function loadIndiaBoundary(callback) {
  fetch("india.geojson")
    .then(function (response) {
      if (!response.ok) throw new Error("GeoJSON file could not be loaded");
      return response.json();
    })
    .then(function (data) {
      indiaGeoJSON = data;
      if (callback) callback(data);
    })
    .catch(function (error) {
      console.error(error);
    });
}

function insidePolygon(lat, lon, points) {
  let count = 0;
  for (let pos = 0; pos < points.length; pos++) {
    let col = pos - 1;
    if (col < 0) col = points.length - 1;
    let lon1 = points[pos][0];
    let lat1 = points[pos][1];
    let lon2 = points[col][0];
    let lat2 = points[col][1];
    if ((lat1 > lat) !== (lat2 > lat)) {
      let value = ((lon2 - lon1) * (lat - lat1)) / (lat2 - lat1) + lon1;
      if (lon < value) count++;
    }
  }
  return count % 2 === 1;
}

function checkPoint(lat, lon) {
  if (!indiaGeoJSON) return false;
  let features = indiaGeoJSON.features;
  for (let f = 0; f < features.length; f++) {
    let geometry = features[f].geometry;
    if (geometry.type === "Polygon") {
      let polygon = geometry.coordinates[0];
      if (insidePolygon(lat, lon, polygon)) return true;
    }
    if (geometry.type === "MultiPolygon") {
      let polygons = geometry.coordinates;
      for (let p = 0; p < polygons.length; p++) {
        let polygon = polygons[p][0];
        if (insidePolygon(lat, lon, polygon)) return true;
      }
    }
  }
  return false;
}

// Haversine distance in km
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Distance from a single point to the nearest India boundary vertex
function checkSafetyCorridor(lat, lon, bufferKm) {
  if (!indiaGeoJSON) return { status: "unknown", nearestKm: null };
  bufferKm = bufferKm || 50;

  let nearestKm = Infinity;
  const features = indiaGeoJSON.features;

  for (let f = 0; f < features.length; f++) {
    const geometry = features[f].geometry;
    let polygons = [];
    if (geometry.type === "Polygon") {
      polygons = [geometry.coordinates[0]];
    } else if (geometry.type === "MultiPolygon") {
      polygons = geometry.coordinates.map(function (p) { return p[0]; });
    }
    polygons.forEach(function (polygon) {
      polygon.forEach(function (vertex) {
        const d = calculateDistanceKm(lat, lon, vertex[1], vertex[0]);
        if (d < nearestKm) nearestKm = d;
      });
    });
  }

  const inside = checkPoint(lat, lon);
  let status;
  if (!inside) {
    status = "outside";
  } else if (nearestKm <= bufferKm) {
    status = "near-boundary";
  } else {
    status = "safe";
  }

  return { status: status, nearestKm: nearestKm };
}

// SAFETY CORRIDOR CHECK (path between LP and TP)
// Samples points along the straight line from LP to TP and checks each
// one's distance to the India boundary, giving a corridor-wide safety read
// instead of just checking the target point alone.
function checkCorridorPath(lat1, lon1, lat2, lon2, bufferKm, numSamples) {
  bufferKm = bufferKm || 50;
  numSamples = numSamples || 10;

  let minDistanceKm = Infinity;
  let allInside = true;
  let allOutside = true;

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const lat = lat1 + (lat2 - lat1) * t;
    const lon = lon1 + (lon2 - lon1) * t;

    const inside = checkPoint(lat, lon);
    if (inside) allOutside = false;
    if (!inside) allInside = false;

    const corridor = checkSafetyCorridor(lat, lon, bufferKm);
    if (corridor.nearestKm !== null && corridor.nearestKm < minDistanceKm) {
      minDistanceKm = corridor.nearestKm;
    }
  }

  let pathType;
  if (allInside) pathType = "fully-inside";
  else if (allOutside) pathType = "fully-outside";
  else pathType = "crosses-border";

  let status;
  if (pathType === "crosses-border") {
    status = "crosses-border";
  } else if (minDistanceKm <= bufferKm) {
    status = "near-boundary";
  } else {
    status = "safe";
  }

  return { status: status, minDistanceKm: minDistanceKm, pathType: pathType };
}

// LAUNCH AUTHORIZATION
// Rule: blocked if the target point is inside India (regardless of launch
// point), or if distance exceeds the missile's configured range.
function checkLaunchAuthorization(targetInside, distanceKm, rangeKm) {
  if (targetInside) {
    return { authorized: false, reason: "Target point is inside India — launch blocked." };
  }
  if (distanceKm > rangeKm) {
    return { authorized: false, reason: "Distance exceeds missile's configured range — launch blocked." };
  }
  return { authorized: true, reason: "Target is outside India and within range — launch authorized." };
}

// GEO UTILITIES for building a real corridor polygon

// Initial bearing (degrees) from point 1 to point 2
function bearingBetween(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * toRad) * Math.cos(lat2 * toRad);
  const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
    Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lon2 - lon1) * toRad);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Destination point given a start point, bearing (degrees), and distance (km)
function destinationPoint(lat, lon, bearingDeg, distanceKm) {
  const R = 6371;
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const brng = bearingDeg * toRad;
  const lat1 = lat * toRad;
  const lon1 = lon * toRad;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceKm / R) +
    Math.cos(lat1) * Math.sin(distanceKm / R) * Math.cos(brng)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(distanceKm / R) * Math.cos(lat1),
    Math.cos(distanceKm / R) - Math.sin(lat1) * Math.sin(lat2)
  );

  return { lat: lat2 * toDeg, lon: lon2 * toDeg };
}

// Builds the 4 corner points of a corridor polygon of the given half-width
// (bufferKm) running from (lat1,lon1) to (lat2,lon2).
function buildCorridorPolygon(lat1, lon1, lat2, lon2, bufferKm) {
  const bearing = bearingBetween(lat1, lon1, lat2, lon2);
  const leftBearing = (bearing - 90 + 360) % 360;
  const rightBearing = (bearing + 90) % 360;

  const startLeft = destinationPoint(lat1, lon1, leftBearing, bufferKm);
  const startRight = destinationPoint(lat1, lon1, rightBearing, bufferKm);
  const endLeft = destinationPoint(lat2, lon2, leftBearing, bufferKm);
  const endRight = destinationPoint(lat2, lon2, rightBearing, bufferKm);

  return [
    { lat: startLeft.lat, lng: startLeft.lon },
    { lat: endLeft.lat, lng: endLeft.lon },
    { lat: endRight.lat, lng: endRight.lon },
    { lat: startRight.lat, lng: startRight.lon },
  ];
}